"""Voca HTTP API: Understand -> Plan -> Act.

Handlers stay thin: validate with the schemas in :mod:`app.models`, delegate to
a service, return the response. Every computed number comes from
:mod:`app.services.plan` and :mod:`app.services.graph`; the model only extracts
skills and writes the plan narrative.

Error policy:

* model failure  -> 502 with a message the UI can show (never invented data)
* unknown target -> 404
* graph unavailable -> 503
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .llm import LLMError, is_configured
from .models import (
    ActRequest,
    ActResponse,
    CareerMatch,
    HealthResponse,
    Occupation,
    OccupationSummary,
    PlanRequest,
    PlanResponse,
    ProfileRecord,
    ProfileSaveRequest,
    Skill,
    TargetInfo,
    UnderstandRequest,
    UnderstandResponse,
)
from .services.explain import explain_plan
from .services.extract import extract_skills
from .services.graph import CareerGraph, GraphUnavailable, OccupationFit
from .services.normalise import normalise_skills
from .services.plan import (
    build_bridge_roles,
    build_outlook,
    build_plan_parts,
    estimate_timeline,
)
from .services.recommend import recommend_resources
from .services.store import ProfileStore

logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="Voca API",
    version="1.0.0",
    description="Career transitions in three stages: Understand, Plan, Act.",
)

_origins = {
    settings.frontend_origin.rstrip("/"),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # The frontend dev server runs on 3001 in this project; allow both the
    # hostname and loopback spellings so either URL works in the browser.
    "http://localhost:3001",
    "http://127.0.0.1:3001",
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_graph() -> CareerGraph:
    """Return the process-wide graph, choosing Neo4j or memory on first use."""
    graph = CareerGraph.connect()
    logger.info("Career graph ready using the %s backend.", graph.backend)
    return graph


@lru_cache(maxsize=1)
def get_store() -> ProfileStore:
    """Return the process-wide profile store."""
    return ProfileStore()


GraphDep = Annotated[CareerGraph, Depends(get_graph)]
StoreDep = Annotated[ProfileStore, Depends(get_store)]


def _why(fit: OccupationFit, graph: CareerGraph) -> str:
    """One factual sentence explaining a match, built from the computed fit."""
    total = len(fit.occupation.requires)
    if not total:
        return "No requirements recorded for this role."
    met = len(fit.met_skill_ids)
    if met:
        strong = ", ".join(graph.skill_name(skill) for skill in fit.met_skill_ids[:3])
        return f"Meets {met} of {total} requirements already; strongest overlap: {strong}."
    partial = len(fit.matched_skill_ids)
    if partial:
        return f"Partial overlap on {partial} of {total} requirements."
    return f"Shares {partial} of {total} requirements."


# --------------------------------------------------------------------------- #
# Health and catalogue
# --------------------------------------------------------------------------- #
@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health(graph: GraphDep, store: StoreDep) -> HealthResponse:
    """Liveness plus which backends are actually in use.

    ``neo4j`` and ``supabase`` report the store being used right now, not just
    whether keys are present: an unreachable database falls back and reports
    ``false``.
    """
    return HealthResponse(
        status="ok",
        llm_configured=is_configured(),
        neo4j=graph.backend == "neo4j",
        supabase=store.backend == "supabase",
    )


@app.get("/skills", response_model=list[Skill], tags=["catalogue"])
def list_skills(graph: GraphDep) -> list[Skill]:
    """Every seed skill, for autocomplete and manual additions."""
    return graph.skills


@app.get("/occupations", response_model=list[OccupationSummary], tags=["catalogue"])
def list_occupations(graph: GraphDep) -> list[OccupationSummary]:
    """Every occupation, for the Plan page picker."""
    return [
        OccupationSummary(id=o.id, title=o.title, industry=o.industry)
        for o in graph.occupations
    ]


@app.get("/occupations/{occupation_id}", response_model=Occupation, tags=["catalogue"])
def get_occupation(occupation_id: str, graph: GraphDep) -> Occupation:
    """Full detail for one occupation, including its requirements.

    Added for the skill graph, which needs descriptions and required skills to
    explain a clicked career node without running a plan.
    """
    occupation = graph.occupation(occupation_id)
    if occupation is None:
        raise HTTPException(status_code=404, detail="That occupation was not found.")
    return occupation


# --------------------------------------------------------------------------- #
# Stage 1 - Understand
# --------------------------------------------------------------------------- #
@app.post("/understand", response_model=UnderstandResponse, tags=["stages"])
def understand(payload: UnderstandRequest, graph: GraphDep) -> UnderstandResponse:
    """Extract skills from a story, map them to the catalogue, rank occupations."""
    if not payload.story.strip():
        raise HTTPException(status_code=422, detail="Write a few sentences about your work.")

    try:
        extraction = extract_skills(payload.story)
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    skills = normalise_skills(extraction.skills, graph)
    levels = {skill.skill_id: skill.level for skill in skills if skill.skill_id}
    ranked = graph.rank(levels, limit=5) if levels else []

    matches = [
        CareerMatch(
            occupation_id=fit.occupation.id,
            title=fit.occupation.title,
            industry=fit.occupation.industry,
            fit_pct=fit.fit_pct,
            matched_skills=[graph.skill_name(skill) for skill in fit.matched_skill_ids],
            why=_why(fit, graph),
        )
        for fit in ranked
    ]

    return UnderstandResponse(
        skills=skills, interests=extraction.interests, career_matches=matches
    )


# --------------------------------------------------------------------------- #
# Stage 2 - Plan
# --------------------------------------------------------------------------- #
@app.post("/plan", response_model=PlanResponse, tags=["stages"])
def plan(payload: PlanRequest, graph: GraphDep) -> PlanResponse:
    """Compute gaps, bridge roles and outlook, then explain them in prose."""
    target = graph.occupation(payload.target_occupation_id)
    if target is None:
        raise HTTPException(status_code=404, detail="That occupation was not found.")

    levels: dict[str, int] = {}
    for item in payload.skills:
        if graph.skill(item.skill_id) is None:
            logger.info("Ignoring unknown skill id %r in plan request.", item.skill_id)
            continue
        levels[item.skill_id] = max(levels.get(item.skill_id, 0), item.level)

    parts = build_plan_parts(levels, target, graph)
    bridges = build_bridge_roles(levels, target, graph)
    outlook = build_outlook(levels, target, graph)
    timeline = estimate_timeline(parts)

    try:
        explanation = explain_plan(
            target_title=target.title,
            target_industry=target.industry,
            readiness_pct=parts.readiness_pct,
            timeline=timeline,
            have=parts.have,
            essential_gaps=parts.essential_gaps,
            optional_gaps=parts.optional_gaps,
            bridges=bridges,
            outlook=outlook,
        )
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return PlanResponse(
        target=TargetInfo(
            occupation_id=target.id,
            title=target.title,
            industry=target.industry,
            description=target.description,
        ),
        summary=explanation.summary,
        have=parts.have,
        essential_gaps=parts.essential_gaps,
        optional_gaps=parts.optional_gaps,
        bridge_roles=bridges,
        outlook=outlook,
        steps=explanation.steps,
        timeline=timeline,
        readiness_pct=parts.readiness_pct,
    )


# --------------------------------------------------------------------------- #
# Stage 3 - Act
# --------------------------------------------------------------------------- #
@app.post("/act", response_model=ActResponse, tags=["stages"])
def act(payload: ActRequest, graph: GraphDep) -> ActResponse:
    """Return practice and learning opportunities for the requested gaps."""
    return recommend_resources(
        payload.skill_ids,
        graph,
        region=payload.region,
        free_only=payload.free_only,
    )


# --------------------------------------------------------------------------- #
# Profiles
# --------------------------------------------------------------------------- #
@app.post("/profiles", response_model=ProfileRecord, tags=["profiles"])
def save_profile(payload: ProfileSaveRequest, store: StoreDep) -> ProfileRecord:
    """Save a profile and its plan; returns the generated ID."""
    return store.save(payload)


@app.get("/profiles/{profile_id}", response_model=ProfileRecord, tags=["profiles"])
def load_profile(profile_id: str, store: StoreDep) -> ProfileRecord:
    """Load a previously saved profile."""
    record = store.get(profile_id)
    if record is None:
        raise HTTPException(status_code=404, detail="No saved profile with that ID.")
    return record


@app.exception_handler(GraphUnavailable)
async def graph_unavailable_handler(_request, exc: GraphUnavailable):
    """Return a readable 503 instead of a stack trace."""
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=503, content={"detail": str(exc)})
