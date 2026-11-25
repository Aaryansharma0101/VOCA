"""Gap -> resources, ranked by how many of the user's gaps each one covers.

Deterministic lookup, no model and no network: the catalogue is seed data today
and can be a Supabase table later without changing this interface.

Resources split into two sections:

* **practice** - real-world settings (project, volunteering, community,
  apprenticeship, internship);
* **learn** - structured study (course, training).
"""

from __future__ import annotations

from typing import Final, Sequence

from ..models import ActResource, ActResponse, Resource
from .graph import CareerGraph

PRACTICE_KINDS: Final[frozenset[str]] = frozenset(
    {"project", "volunteering", "community", "apprenticeship", "internship"}
)
#: Keep each section short enough to act on this week.
MAX_PER_SECTION: Final[int] = 10


def _select(
    resources: Sequence[Resource],
    requested: dict[str, int],
    region: str | None,
    free_only: bool,
) -> list[ActResource]:
    """Filter and score resources against the requested skill IDs.

    A resource is kept when it covers at least one requested skill, satisfies the
    cost filter and serves the requested region (or is global).
    """
    selected: list[ActResource] = []
    for resource in resources:
        if free_only and resource.cost != "free":
            continue
        if region and resource.region not in ("global", region):
            continue

        covered = [skill_id for skill_id in resource.skill_ids if skill_id in requested]
        if not covered:
            continue

        selected.append(
            ActResource(
                id=resource.id,
                title=resource.title,
                provider=resource.provider,
                kind=resource.kind,
                region=resource.region,
                cost=resource.cost,
                url=resource.url,
                description=resource.description,
                covers=len(covered),
                covers_skills=covered,
            )
        )

    selected.sort(key=lambda item: (-item.covers, item.title.lower()))
    return selected


def recommend_resources(
    skill_ids: Sequence[str],
    graph: CareerGraph,
    *,
    region: str | None = None,
    free_only: bool = True,
) -> ActResponse:
    """Return practice and learn opportunities for the given gaps.

    Args:
        skill_ids: Gap IDs, essential first. Order is preserved for ranking
            because earlier skills are the more important gaps.
        graph: Catalogue providing the resources.
        region: Optional region filter; ``global`` resources always qualify.
        free_only: Hide paid resources when true.

    Returns:
        Both sections ranked by number of gaps covered, plus the number of
        distinct gaps considered.
    """
    ordered: dict[str, int] = {}
    for skill_id in skill_ids:
        if skill_id and skill_id not in ordered:
            ordered[skill_id] = len(ordered)
    requested = {skill_id: rank for skill_id, rank in ordered.items()}

    selected = _select(graph.resources, requested, region, free_only)
    practice = [item for item in selected if item.kind in PRACTICE_KINDS]
    learn = [item for item in selected if item.kind not in PRACTICE_KINDS]

    return ActResponse(
        practice=practice[:MAX_PER_SECTION],
        learn=learn[:MAX_PER_SECTION],
        gaps_considered=len(requested),
    )
