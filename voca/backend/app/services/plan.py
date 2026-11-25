"""Plan-stage arithmetic: gaps, bridge roles, outlook, timeline, readiness.

Pure functions over the graph. Nothing here calls a model: every number the user
sees is reproducible from the seed data. ``services.explain`` turns these facts
into prose afterwards, and may not add any fact of its own.

Rules (from the spec):

* essential gap: ``importance >= 0.6`` and ``have < need``
* optional gap:  ``importance < 0.6``  and ``have < need``
* bridge role:   user fit ``>= 50%``, shares required skills with the target,
  nearest first
* readiness:     the same weighted coverage as ``fit``, as a percentage
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Mapping

from ..models import BridgeRole, GapItem, HaveItem, Occupation, OutlookItem
from .graph import CareerGraph

#: Importance at or above this makes a gap "essential".
ESSENTIAL_THRESHOLD: Final[float] = 0.6
#: Minimum fit before an occupation can be offered as a bridge role.
BRIDGE_MIN_FIT: Final[float] = 0.5
#: Assumed weekly study hours behind the timeline estimate.
STUDY_HOURS_PER_WEEK: Final[int] = 8
#: Hours of focused work needed to move up one level of one skill.
HOURS_PER_LEVEL: Final[int] = 16


@dataclass(frozen=True)
class PlanParts:
    """Computed plan inputs for one profile/occupation pair."""

    have: list[HaveItem] = field(default_factory=list)
    essential_gaps: list[GapItem] = field(default_factory=list)
    optional_gaps: list[GapItem] = field(default_factory=list)
    readiness_pct: int = 0

    @property
    def gap_skill_ids(self) -> list[str]:
        """Essential gap IDs first, then optional: the order Act should follow."""
        return [gap.skill_id for gap in (*self.essential_gaps, *self.optional_gaps)]


def _gap_name(graph: CareerGraph, skill_id: str) -> str:
    return graph.skill_name(skill_id)


def build_plan_parts(
    levels: Mapping[str, int], occupation: Occupation, graph: CareerGraph
) -> PlanParts:
    """Split the occupation's requirements into have / essential / optional.

    Args:
        levels: Skill ID -> user's 1-5 rating. Missing skills count as 0.
        occupation: The target role.
        graph: Catalogue used for skill names and scoring.

    Returns:
        The three lists plus readiness, all ordered by importance.
    """
    have: list[HaveItem] = []
    essential: list[GapItem] = []
    optional: list[GapItem] = []

    for requirement in sorted(
        occupation.requires, key=lambda r: (-r.importance, graph.skill_name(r.skill_id))
    ):
        have_level = levels.get(requirement.skill_id, 0)
        name = _gap_name(graph, requirement.skill_id)

        if have_level >= requirement.level:
            have.append(
                HaveItem(
                    skill=name,
                    skill_id=requirement.skill_id,
                    level=have_level,
                    need=requirement.level,
                )
            )
            continue

        gap = GapItem(
            skill=name,
            skill_id=requirement.skill_id,
            have=have_level,
            need=requirement.level,
            importance=round(requirement.importance, 2),
        )
        if requirement.importance >= ESSENTIAL_THRESHOLD:
            essential.append(gap)
        else:
            optional.append(gap)

    return PlanParts(
        have=have,
        essential_gaps=essential,
        optional_gaps=optional,
        readiness_pct=graph.fit(levels, occupation).fit_pct,
    )


def build_bridge_roles(
    levels: Mapping[str, int],
    target: Occupation,
    graph: CareerGraph,
    limit: int = 3,
) -> list[BridgeRole]:
    """Find reachable roles that also move the user toward the target.

    A candidate must (a) be covered at 50% or more by the current profile and
    (b) share at least one required skill with the target. Candidates are ranked
    by how many target requirements they share, then by how reachable they are.

    ``closes`` lists the *target's* skills the candidate would give the user on
    the way, the reason it counts as a bridge rather than a detour.
    """
    target_skills = {r.skill_id for r in target.requires}
    target_needs = {r.skill_id: r.level for r in target.requires}
    bridges: list[tuple[int, float, BridgeRole]] = []

    for candidate in graph.rank(levels, min_fit=BRIDGE_MIN_FIT):
        if candidate.occupation.id == target.id:
            continue

        shared = target_skills & {r.skill_id for r in candidate.occupation.requires}
        if not shared:
            continue

        closes = [
            graph.skill_name(skill_id)
            for skill_id in sorted(shared, key=lambda s: graph.skill_name(s))
            if levels.get(skill_id, 0) < target_needs[skill_id]
        ]
        bridges.append(
            (
                len(shared),
                candidate.fit,
                BridgeRole(
                    occupation_id=candidate.occupation.id,
                    title=candidate.occupation.title,
                    reaches_pct=candidate.fit_pct,
                    closes=closes,
                    time=candidate.occupation.typical_time_to_enter,
                ),
            )
        )

    bridges.sort(key=lambda item: (-item[0], -item[1], item[2].title))
    return [bridge for _, _, bridge in bridges[:limit]]


def build_outlook(
    levels: Mapping[str, int],
    target: Occupation,
    graph: CareerGraph,
    limit: int = 8,
) -> list[OutlookItem]:
    """Return trend badges for the target's skills plus the user's own skills.

    These are **hand-assigned seed estimates**, not live labour-market data. The
    UI shows a disclaimer next to them.
    """
    ordered: list[str] = []
    for requirement in sorted(target.requires, key=lambda r: (-r.importance, r.skill_id)):
        ordered.append(requirement.skill_id)
    ordered.extend(sorted(levels))

    items: list[OutlookItem] = []
    seen: set[str] = set()
    for skill_id in ordered:
        if skill_id in seen:
            continue
        skill = graph.skill(skill_id)
        if skill is None:
            continue
        seen.add(skill_id)
        items.append(OutlookItem(skill=skill.name, trend=skill.trend, note=skill.trend_note))
        if len(items) >= limit:
            break
    return items


def estimate_timeline(parts: PlanParts) -> str:
    """Estimate time to close the gaps at a steady weekly effort.

    Essential gaps are assumed to need more practice per level than optional
    ones. This is an ordering aid, not a promise.
    """
    hours = 0
    for gap in parts.essential_gaps:
        hours += (gap.need - gap.have) * HOURS_PER_LEVEL
    for gap in parts.optional_gaps:
        hours += (gap.need - gap.have) * HOURS_PER_LEVEL // 2

    if hours <= 0:
        return "Ready to apply now"

    weeks = max(2, round(hours / STUDY_HOURS_PER_WEEK))
    if weeks < 8:
        return f"About {weeks} weeks at {STUDY_HOURS_PER_WEEK} hours a week"
    months_low = max(2, round(weeks / 4.33))
    months_high = max(months_low + 1, round(weeks * 1.35 / 4.33))
    return f"About {months_low}-{months_high} months at {STUDY_HOURS_PER_WEEK} hours a week"
