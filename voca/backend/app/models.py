"""Pydantic schemas: the one contract shared by the API, services and frontend.

Wire formats are grouped by stage. The frontend mirrors these field-for-field in
``frontend/src/lib/types.ts``; change both together.

Skill identifiers are always seed IDs (``data-analyst``, ``sql``). The LLM never
sees or produces them: it works in labels, and normalisation does the mapping.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field


def sanitize_text(text: str) -> str:
    """Replace em dashes, en dashes, and double hyphens with commas or periods."""
    if not text:
        return text
    # Replace em dash and en dash with comma + space
    text = text.replace("\u2014", ", ").replace("\u2013", ", ")
    # Replace " -- " with ", "
    text = re.sub(r"\s--\s", ", ", text)
    # Replace remaining " --" or "-- " with ", "
    text = text.replace(" --", ", ").replace("-- ", ", ")
    # Collapse multiple spaces
    text = re.sub(r"\s+", " ", text)
    return text.strip()


#: Skill family. Drives the badge shown in the UI and nothing else.
SkillKind = Literal["hard", "soft", "digital", "domain"]
#: Seed-provided trend label. An estimate, not live labour-market data.
Trend = Literal["growing", "stable", "fading"]
#: Resource format. Split into "practice" and "learn" by the Act stage.
ResourceKind = Literal[
    "course", "training", "apprenticeship", "project", "volunteering", "community", "internship"
]
Cost = Literal["free", "paid"]


# --------------------------------------------------------------------------- #
# Seed entities
# --------------------------------------------------------------------------- #
class Skill(BaseModel):
    """One skill from the seed catalogue."""

    id: str
    name: str
    category: SkillKind = "hard"
    aliases: list[str] = Field(default_factory=list)
    trend: Trend = "stable"
    trend_note: str = ""


class Requirement(BaseModel):
    """How much of a skill an occupation needs."""

    skill_id: str
    importance: float = Field(ge=0.0, le=1.0)
    level: int = Field(ge=1, le=5)


class Occupation(BaseModel):
    """A target role and its skill requirements."""

    id: str
    title: str
    industry: str
    description: str = ""
    typical_time_to_enter: str = ""
    requires: list[Requirement] = Field(default_factory=list)


class Resource(BaseModel):
    """A learning or practice opportunity linked to one or more skills."""

    id: str
    title: str
    provider: str
    kind: ResourceKind = "course"
    skill_ids: list[str] = Field(default_factory=list)
    region: str = "global"
    cost: Cost = "free"
    url: str
    description: str = ""


# --------------------------------------------------------------------------- #
# GET /health, GET /skills, GET /occupations
# --------------------------------------------------------------------------- #
class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    llm_configured: bool
    neo4j: bool
    supabase: bool


class OccupationSummary(BaseModel):
    id: str
    title: str
    industry: str


# --------------------------------------------------------------------------- #
# Stage 1 - POST /understand
# --------------------------------------------------------------------------- #
class UnderstandRequest(BaseModel):
    story: str = Field(min_length=1, description="The person's career story.")


class UnderstoodSkill(BaseModel):
    """A skill found in the story, mapped to the seed catalogue when possible."""

    skill_id: str | None = Field(default=None, description="Seed skill ID, or null.")
    name: str
    level: int = Field(default=3, ge=1, le=5)
    evidence: str = ""
    kind: SkillKind = "hard"
    matched: bool = False


class CareerMatch(BaseModel):
    occupation_id: str
    title: str
    industry: str
    fit_pct: int = Field(ge=0, le=100)
    matched_skills: list[str] = Field(default_factory=list)
    why: str = ""


class UnderstandResponse(BaseModel):
    skills: list[UnderstoodSkill] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    career_matches: list[CareerMatch] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Stage 2 - POST /plan
# --------------------------------------------------------------------------- #
class ProfileSkill(BaseModel):
    """A skill the user claims, with their own 1-5 self-rating."""

    skill_id: str
    level: int = Field(ge=1, le=5)


class PlanRequest(BaseModel):
    skills: list[ProfileSkill] = Field(default_factory=list)
    target_occupation_id: str


class TargetInfo(BaseModel):
    occupation_id: str
    title: str
    industry: str
    description: str = ""


class HaveItem(BaseModel):
    skill: str
    skill_id: str
    level: int
    need: int


class GapItem(BaseModel):
    skill: str
    skill_id: str
    have: int
    need: int
    importance: float


class BridgeRole(BaseModel):
    occupation_id: str
    title: str
    reaches_pct: int = Field(ge=0, le=100)
    closes: list[str] = Field(default_factory=list)
    time: str = ""


class OutlookItem(BaseModel):
    skill: str
    trend: Trend
    note: str = ""


class PlanResponse(BaseModel):
    target: TargetInfo
    summary: str
    have: list[HaveItem] = Field(default_factory=list)
    essential_gaps: list[GapItem] = Field(default_factory=list)
    optional_gaps: list[GapItem] = Field(default_factory=list)
    bridge_roles: list[BridgeRole] = Field(default_factory=list)
    outlook: list[OutlookItem] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    timeline: str = ""
    readiness_pct: int = Field(ge=0, le=100)


# --------------------------------------------------------------------------- #
# Stage 3 - POST /act
# --------------------------------------------------------------------------- #
class ActRequest(BaseModel):
    skill_ids: list[str] = Field(default_factory=list)
    region: str | None = None
    free_only: bool = True


class ActResource(BaseModel):
    id: str
    title: str
    provider: str
    kind: ResourceKind
    region: str
    cost: Cost
    url: str
    description: str = ""
    covers: int = 0
    covers_skills: list[str] = Field(default_factory=list)


class ActResponse(BaseModel):
    practice: list[ActResource] = Field(default_factory=list)
    learn: list[ActResource] = Field(default_factory=list)
    gaps_considered: int = 0


# --------------------------------------------------------------------------- #
# Profiles
# --------------------------------------------------------------------------- #
class ProfileSaveRequest(BaseModel):
    skills: list[ProfileSkill] = Field(default_factory=list)
    target_occupation_id: str | None = None
    story: str | None = None
    plan: dict[str, Any] | None = None


class ProfileRecord(BaseModel):
    id: str
    saved_at: str
    skills: list[ProfileSkill] = Field(default_factory=list)
    target_occupation_id: str | None = None
    story: str | None = None
    plan: dict[str, Any] | None = None
    storage: Literal["supabase", "sqlite"] = "sqlite"


# --------------------------------------------------------------------------- #
# Internal LLM contract (never sent to the browser)
# --------------------------------------------------------------------------- #
class ExtractedSkillOut(BaseModel):
    """One skill as the LLM reports it, in the user's own words.

    ``level`` is deliberately unconstrained here: a model that answers 7 or 0
    must not fail the whole request. ``services.extract`` clamps it to 1-5
    before anything else sees it.
    """

    name: str
    level: int = 3
    evidence: str = ""
    kind: SkillKind = "hard"


class ExtractionResult(BaseModel):
    skills: list[ExtractedSkillOut] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)


class ExplanationResult(BaseModel):
    """The JSON object ``services.explain`` asks the LLM to return."""

    summary: str = ""
    steps: list[str] = Field(default_factory=list)
