"""The career graph: one class, two interchangeable backends.

``CareerGraph`` exposes the only interface the rest of the backend uses. It is
backed by either:

* **Neo4j**, when ``NEO4J_URI`` is set *and* reachable; or
* **an in-memory graph** built from ``ingestion/seed/*.json``.

Both backends produce identical results because they load the same nodes and
edges into the same structures; only the storage differs. That is deliberate:
the scoring formula lives in one place (:meth:`CareerGraph.fit`), so the two
paths cannot drift apart.

All scoring is arithmetic, never a model call::

    fit = sum(importance * min(have / need, 1)) / sum(importance)

``importance`` is the weight from the seed (or ESCO), ``have`` is the user's
1-5 self-rating and ``need`` is the level the occupation expects.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Iterable, Mapping

from pydantic import TypeAdapter, ValidationError

from ..config import get_settings
from ..models import Occupation, Resource, Skill

logger = logging.getLogger(__name__)

#: Seed files are trusted, but a malformed one should fail with a clear message.
_SKILLS: Final[str] = "skills.json"
_OCCUPATIONS: Final[str] = "occupations.json"
_RESOURCES: Final[str] = "resources.json"


class GraphUnavailable(RuntimeError):
    """Neo4j was configured but could not serve the graph."""


@dataclass(frozen=True)
class OccupationFit:
    """How well a profile covers one occupation, and what it is missing."""

    occupation: Occupation
    fit: float
    matched_skill_ids: list[str] = field(default_factory=list)
    met_skill_ids: list[str] = field(default_factory=list)
    missing_skill_ids: list[str] = field(default_factory=list)

    @property
    def fit_pct(self) -> int:
        """Whole-number percentage for display."""
        return round(self.fit * 100)


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise GraphUnavailable(f"Seed file missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GraphUnavailable(f"Seed file is not valid JSON: {path} ({exc})") from exc


def load_seed(
    seed_dir: Path | None = None,
) -> tuple[dict[str, Skill], dict[str, Occupation], list[Resource]]:
    """Load and validate the seed catalogue from disk.

    Args:
        seed_dir: Directory holding ``skills.json``, ``occupations.json`` and
            ``resources.json``. Defaults to ``settings.seed_dir``.

    Returns:
        Skills and occupations keyed by ID, plus the resource list in file order.

    Raises:
        GraphUnavailable: if a file is missing, invalid, or references an
            unknown skill.
    """
    base = seed_dir or get_settings().seed_dir
    skills_raw = _read_json(base / _SKILLS).get("skills", [])
    occupations_raw = _read_json(base / _OCCUPATIONS).get("occupations", [])
    resources_raw = _read_json(base / _RESOURCES).get("resources", [])

    try:
        skills = {s.id: s for s in TypeAdapter(list[Skill]).validate_python(skills_raw)}
        occupations = {
            o.id: o for o in TypeAdapter(list[Occupation]).validate_python(occupations_raw)
        }
        resources = TypeAdapter(list[Resource]).validate_python(resources_raw)
    except ValidationError as exc:
        raise GraphUnavailable(f"Seed data does not match the schema: {exc}") from exc

    if not skills or not occupations:
        raise GraphUnavailable(f"Seed data in {base} is empty.")

    for occupation in occupations.values():
        for requirement in occupation.requires:
            if requirement.skill_id not in skills:
                raise GraphUnavailable(
                    f"Occupation {occupation.id} requires unknown skill "
                    f"{requirement.skill_id}."
                )
    for resource in resources:
        if not resource.skill_ids:
            raise GraphUnavailable(f"Resource {resource.id} covers no skills.")

    return skills, occupations, resources


class CareerGraph:
    """Seed graph plus the arithmetic that turns a profile into a plan.

    Construct with :meth:`connect` to get the best available backend. The
    backend name is exposed so ``/health`` can report which one is live.
    """

    def __init__(
        self,
        skills: Mapping[str, Skill],
        occupations: Mapping[str, Occupation],
        resources: Iterable[Resource],
        *,
        backend: str,
    ) -> None:
        self._skills = dict(skills)
        self._occupations = dict(occupations)
        self._resources = list(resources)
        self._backend = backend
        self._alias_cache: list[tuple[str, str]] | None = None

    # ------------------------------------------------------------------ #
    # Construction
    # ------------------------------------------------------------------ #
    @classmethod
    def connect(cls, seed_dir: Path | None = None, *, force_memory: bool = False) -> "CareerGraph":
        """Return a graph, preferring Neo4j when it is configured and reachable.

        Falls back to the in-memory graph - with a logged warning, never an
        exception - so the API keeps working with only an LLM key set.
        """
        settings = get_settings()
        if not force_memory and settings.neo4j_uri.strip():
            try:
                return cls._from_neo4j()
            except Exception as exc:  # any driver/connection error: degrade, don't die
                logger.warning("Neo4j unavailable (%s); using the in-memory graph.", exc)

        skills, occupations, resources = load_seed(seed_dir)
        return cls(skills, occupations, resources, backend="memory")

    @classmethod
    def _from_neo4j(cls) -> "CareerGraph":
        """Read skills, occupations and resources out of Neo4j.

        Raises:
            GraphUnavailable: if the database is unreachable or empty. The caller
                then falls back to memory.
        """
        settings = get_settings()
        try:
            from neo4j import GraphDatabase
        except ImportError as exc:  # optional dependency
            raise GraphUnavailable("The neo4j package is not installed.") from exc

        driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
            connection_timeout=3,
        )
        try:
            driver.verify_connectivity()
            with driver.session() as session:
                skill_rows = session.run(
                    "MATCH (s:Skill) RETURN s.id AS id, s.name AS name, "
                    "s.category AS category, s.aliases AS aliases, s.trend AS trend, "
                    "s.trend_note AS trend_note"
                ).data()
                occupation_rows = session.run(
                    "MATCH (o:Occupation) "
                    "OPTIONAL MATCH (o)-[r:REQUIRES]->(sk:Skill) "
                    "WITH o, collect(CASE WHEN sk IS NULL THEN null ELSE "
                    "{skill_id: sk.id, importance: r.importance, level: r.level} END) AS reqs "
                    "RETURN o.id AS id, o.title AS title, o.industry AS industry, "
                    "o.description AS description, "
                    "o.typical_time_to_enter AS typical_time_to_enter, "
                    "[x IN reqs WHERE x IS NOT NULL] AS requires"
                ).data()
                resource_rows = session.run(
                    "MATCH (r:Resource) "
                    "OPTIONAL MATCH (r)-[:COVERS]->(sk:Skill) "
                    "WITH r, collect(sk.id) AS ids "
                    "RETURN r.id AS id, r.title AS title, r.provider AS provider, "
                    "r.kind AS kind, r.region AS region, r.cost AS cost, r.url AS url, "
                    "r.description AS description, [x IN ids WHERE x IS NOT NULL] AS skill_ids"
                ).data()
        finally:
            driver.close()

        if not skill_rows or not occupation_rows:
            raise GraphUnavailable(
                "Neo4j is reachable but empty. Run `python -m ingestion.load_seed` first."
            )

        skills = {row["id"]: Skill.model_validate(row) for row in skill_rows}
        occupations = {row["id"]: Occupation.model_validate(row) for row in occupation_rows}
        resources = [Resource.model_validate(row) for row in resource_rows]
        logger.info("Loaded %d skills, %d occupations from Neo4j.", len(skills), len(occupations))
        return cls(skills, occupations, resources, backend="neo4j")

    # ------------------------------------------------------------------ #
    # Reads
    # ------------------------------------------------------------------ #
    @property
    def backend(self) -> str:
        """``"memory"`` or ``"neo4j"``."""
        return self._backend

    @property
    def skills(self) -> list[Skill]:
        return sorted(self._skills.values(), key=lambda s: s.name.lower())

    @property
    def occupations(self) -> list[Occupation]:
        return sorted(self._occupations.values(), key=lambda o: o.title.lower())

    @property
    def resources(self) -> list[Resource]:
        return list(self._resources)

    def skill(self, skill_id: str) -> Skill | None:
        return self._skills.get(skill_id)

    def occupation(self, occupation_id: str) -> Occupation | None:
        return self._occupations.get(occupation_id)

    def skill_name(self, skill_id: str | None) -> str:
        """Human-readable name, falling back to the raw ID."""
        if skill_id is None:
            return ""
        skill = self._skills.get(skill_id)
        return skill.name if skill else skill_id

    def alias_index(self) -> list[tuple[str, str]]:
        """Normalised alias -> skill ID pairs, built once per graph."""
        if self._alias_cache is None:
            from .normalise import normalise_text  # local import: avoids a cycle

            pairs: list[tuple[str, str]] = []
            for skill in self._skills.values():
                for label in (skill.name, *skill.aliases, skill.id):
                    pairs.append((normalise_text(label), skill.id))
            self._alias_cache = pairs
        return self._alias_cache

    # ------------------------------------------------------------------ #
    # Scoring
    # ------------------------------------------------------------------ #
    def fit(self, levels: Mapping[str, int], occupation: Occupation) -> OccupationFit:
        """Score one occupation against a profile.

        ``levels`` maps skill ID to the user's 1-5 rating. Skills that are absent,
        or that the occupation does not ask for, contribute nothing.
        """
        total_weight = sum(r.importance for r in occupation.requires)
        score = 0.0
        matched: list[str] = []
        met: list[str] = []
        missing: list[str] = []

        for requirement in occupation.requires:
            have = levels.get(requirement.skill_id, 0)
            if have > 0:
                matched.append(requirement.skill_id)
            if have >= requirement.level:
                met.append(requirement.skill_id)
            else:
                missing.append(requirement.skill_id)
            if total_weight > 0 and have > 0:
                ratio = min(have / requirement.level, 1.0)
                score += requirement.importance * ratio

        normalised = score / total_weight if total_weight > 0 else 0.0
        return OccupationFit(
            occupation=occupation,
            fit=round(min(normalised, 1.0), 4),
            matched_skill_ids=matched,
            met_skill_ids=met,
            missing_skill_ids=missing,
        )

    def rank(
        self,
        levels: Mapping[str, int],
        limit: int | None = None,
        min_fit: float = 0.0,
    ) -> list[OccupationFit]:
        """Rank occupations by fit, best first. Ties break by title."""
        scored = [self.fit(levels, occ) for occ in self._occupations.values()]
        scored = [item for item in scored if item.fit > 0 and item.fit >= min_fit]
        scored.sort(key=lambda item: (-item.fit, item.occupation.title))
        return scored[:limit] if limit else scored

    def requirements(self, occupation_id: str) -> list:
        """Requirements for an occupation, most important first."""
        occupation = self._occupations.get(occupation_id)
        if occupation is None:
            return []
        return sorted(occupation.requires, key=lambda r: (-r.importance, self.skill_name(r.skill_id)))
