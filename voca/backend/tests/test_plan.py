"""Plan-stage tests with hand-made profiles.

All arithmetic is checked against numbers worked out by hand, so a change to
the formula shows up here rather than in a user's plan.
"""

from __future__ import annotations

import pytest

from app.models import ExplanationResult
from app.services.plan import (
    ESSENTIAL_THRESHOLD,
    build_bridge_roles,
    build_outlook,
    build_plan_parts,
    estimate_timeline,
)

TARGET = "junior-data-analyst"


def _tool_levels(graph) -> dict[str, int]:
    """Every requirement of the target at level 3: a fully-covering profile."""
    occupation = graph.occupation(TARGET)
    assert occupation is not None
    return {requirement.skill_id: 3 for requirement in occupation.requires}


def test_essential_and_optional_split(graph) -> None:
    """importance >= 0.6 with a shortfall is essential; below is optional."""
    occupation = graph.occupation(TARGET)
    # sql 2/3, excel 4/3 (met), communication 2/3, everything else absent.
    parts = build_plan_parts(
        {"sql": 2, "excel": 4, "communication": 2}, occupation, graph
    )

    essential_ids = {gap.skill_id for gap in parts.essential_gaps}
    optional_ids = {gap.skill_id for gap in parts.optional_gaps}

    assert essential_ids == {"sql", "data-analysis", "data-visualisation", "statistics"}
    assert optional_ids == {"communication", "attention-to-detail"}
    assert [item.skill_id for item in parts.have] == ["excel"]

    assert all(gap.importance >= ESSENTIAL_THRESHOLD for gap in parts.essential_gaps)
    assert all(gap.importance < ESSENTIAL_THRESHOLD for gap in parts.optional_gaps)
    assert all(gap.have < gap.need for gap in (*parts.essential_gaps, *parts.optional_gaps))


def test_gap_levels_are_reported_per_skill(graph) -> None:
    """Each gap carries the user's level and what the role expects."""
    occupation = graph.occupation(TARGET)
    parts = build_plan_parts({"sql": 2}, occupation, graph)
    sql_gap = next(gap for gap in parts.essential_gaps if gap.skill_id == "sql")

    assert (sql_gap.skill, sql_gap.have, sql_gap.need) == ("SQL", 2, 3)
    assert sql_gap.importance == pytest.approx(0.95)


def test_readiness_matches_weighted_formula(graph) -> None:
    """readiness = weighted coverage * 100, worked out by hand.

    Weights sum to 5.10 for this target. With sql and excel fully met the score
    is (0.95 + 0.90) / 5.10 = 36.27%, which rounds to 36.
    """
    occupation = graph.occupation(TARGET)

    empty = build_plan_parts({}, occupation, graph)
    assert empty.readiness_pct == 0

    partial = build_plan_parts({"sql": 3, "excel": 3}, occupation, graph)
    assert partial.readiness_pct == 36

    full = build_plan_parts(_tool_levels(graph), occupation, graph)
    assert full.readiness_pct == 100
    assert full.essential_gaps == [] and full.optional_gaps == []
    assert estimate_timeline(full) == "Ready to apply now"


def test_bridge_roles_are_reachable_and_share_target_skills(graph) -> None:
    """A bridge is >=50% reachable and shares at least one target requirement."""
    target = graph.occupation("data-scientist")
    profile = _tool_levels(graph)  # the whole junior analyst role, at level 3

    bridges = build_bridge_roles(profile, target, graph)
    target_skills = {requirement.skill_id for requirement in target.requires}

    assert 1 <= len(bridges) <= 3
    for bridge in bridges:
        assert bridge.reaches_pct >= 50
        assert bridge.occupation_id != target.id
        candidate = graph.occupation(bridge.occupation_id)
        assert {r.skill_id for r in candidate.requires} & target_skills
        assert bridge.time == candidate.typical_time_to_enter
        # closes only names skills the user still lacks for the target.
        assert "Machine learning" not in bridge.closes

    assert "junior-data-analyst" in {bridge.occupation_id for bridge in bridges}


def test_bridge_roles_exclude_distant_occupations(graph) -> None:
    """A profile with nothing relevant gets no bridge role."""
    target = graph.occupation("data-scientist")
    assert build_bridge_roles({"welding": 4}, target, graph) == []


def test_outlook_covers_target_and_user_skills(graph) -> None:
    """Outlook entries come from seed trends only, and are capped."""
    target = graph.occupation("data-scientist")
    outlook = build_outlook({"excel": 3, "welding": 2}, target, graph)

    names = [item.skill for item in outlook]
    assert len(outlook) <= 8
    assert len(names) == len(set(names))
    assert "Python" in names  # a target requirement
    assert all(item.trend in {"growing", "stable", "fading"} for item in outlook)
    assert all(item.note for item in outlook)


def test_plan_endpoint_returns_all_sections(graph, client, monkeypatch) -> None:
    """POST /plan wires the computed sections to the grounded explanation."""

    def fake_explain(**kwargs) -> ExplanationResult:
        # The real call would hit a model; return a grounded answer shape only.
        return ExplanationResult(summary="Computed summary.", steps=["Learn SQL basics."])

    monkeypatch.setattr("app.main.explain_plan", fake_explain)

    response = client.post(
        "/plan",
        json={
            "skills": [{"skill_id": "sql", "level": 2}, {"skill_id": "excel", "level": 4}],
            "target_occupation_id": TARGET,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["target"]["title"] == "Junior Data Analyst"
    assert body["summary"] == "Computed summary."
    assert body["steps"] == ["Learn SQL basics."]
    assert body["essential_gaps"] and body["optional_gaps"]
    # (0.90 for excel + 0.95 * 2/3 partial credit for sql) / 5.10 = 30.1%
    assert body["readiness_pct"] == 30
    assert body["outlook"]
    assert body["timeline"].startswith("About")


def test_plan_rejects_unknown_target(client) -> None:
    """An unknown occupation is a 404, not an empty plan."""
    response = client.post(
        "/plan", json={"skills": [{"skill_id": "sql", "level": 2}], "target_occupation_id": "nope"}
    )
    assert response.status_code == 404
