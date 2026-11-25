"""The LLM writes the readable plan from already-computed facts.

This is the second and last model call. It receives a fixed fact sheet and
returns a summary plus ordered steps. It must not add skills, salaries,
timelines or opportunities: the prompt says so, and every number it can mention
is supplied in the sheet.

If the model fails, :class:`app.llm.LLMError` propagates and the API returns a
clear 502. The computed plan is never replaced with invented prose.
"""

from __future__ import annotations

from typing import Final, Sequence

from ..llm import json_completion
from ..models import BridgeRole, ExplanationResult, GapItem, HaveItem, OutlookItem, sanitize_text

EXPLAIN_PROMPT: Final[str] = """You explain a career-transition plan to the person it is for.

Use ONLY the facts below. Do not add skills, roles, salaries, timelines, courses
or opportunities that are not listed. Do not soften or contradict the numbers.
If a list is empty, say plainly that nothing is outstanding there.

Write:
- summary: 90-150 words, second person, plain language. Cover, in this order:
  where they stand (readiness), what separates them from the target, which
  bridge role is most realistic now, and what the outlook labels mean.
- steps: 4-6 short imperatives, in the order to do them. Each step must name a
  skill or bridge role from the facts. No course names, no prices.
- Never use em dashes or en dashes. Write plainly, like a thoughtful person, not like marketing copy.

FACTS
Target role: {target_title} ({target_industry})
Readiness: {readiness}% of the target's requirements met
Timeline estimate: {timeline}
Already has: {have}
Essential gaps: {essential}
Optional improvements: {optional}
Bridge roles: {bridges}
Outlook: {outlook}

Return JSON only, shaped like:
{{"summary": "...", "steps": ["...", "..."]}}
"""


def _format_names(items: Sequence[HaveItem] | Sequence[GapItem]) -> str:
    """Comma-separated names, or ``none`` so the prompt has no empty slot."""
    names = [item.skill for item in items]
    return ", ".join(names) if names else "none"


def _format_gaps(gaps: Sequence[GapItem]) -> str:
    """Gap names with their have -> need levels, or ``none``."""
    if not gaps:
        return "none"
    return "; ".join(f"{gap.skill} ({gap.have}/5 now, needs {gap.need}/5)" for gap in gaps)


def _format_bridges(bridges: Sequence[BridgeRole]) -> str:
    """Bridge title, reachability and what each one closes, or ``none``."""
    if not bridges:
        return "none"
    parts = []
    for bridge in bridges:
        closes = ", ".join(bridge.closes) if bridge.closes else "nothing outstanding"
        parts.append(
            f"{bridge.title} (reachable at {bridge.reaches_pct}%, closes: {closes}, "
            f"typical entry time {bridge.time or 'unknown'})"
        )
    return "; ".join(parts)


def _format_outlook(outlook: Sequence[OutlookItem]) -> str:
    """Trend labels with their seed notes, or ``none``."""
    if not outlook:
        return "none"
    return "; ".join(f"{item.skill}: {item.trend} ({item.note})" for item in outlook)


def build_fact_sheet(
    *,
    target_title: str,
    target_industry: str,
    readiness_pct: int,
    timeline: str,
    have: Sequence[HaveItem],
    essential_gaps: Sequence[GapItem],
    optional_gaps: Sequence[GapItem],
    bridges: Sequence[BridgeRole],
    outlook: Sequence[OutlookItem],
) -> str:
    """Render the prompt text. Exposed so tests can assert the guard rails."""
    return EXPLAIN_PROMPT.format(
        target_title=target_title,
        target_industry=target_industry,
        readiness=readiness_pct,
        timeline=timeline,
        have=_format_names(have),
        essential=_format_gaps(essential_gaps),
        optional=_format_gaps(optional_gaps),
        bridges=_format_bridges(bridges),
        outlook=_format_outlook(outlook),
    )


def explain_plan(
    *,
    target_title: str,
    target_industry: str,
    readiness_pct: int,
    timeline: str,
    have: Sequence[HaveItem],
    essential_gaps: Sequence[GapItem],
    optional_gaps: Sequence[GapItem],
    bridges: Sequence[BridgeRole],
    outlook: Sequence[OutlookItem],
) -> ExplanationResult:
    """Ask the model for a summary and steps grounded in the fact sheet.

    Raises:
        app.llm.LLMError: when both attempts fail. The caller turns this into a
            502 the UI can display; it must not substitute invented prose.
    """
    prompt = build_fact_sheet(
        target_title=target_title,
        target_industry=target_industry,
        readiness_pct=readiness_pct,
        timeline=timeline,
        have=have,
        essential_gaps=essential_gaps,
        optional_gaps=optional_gaps,
        bridges=bridges,
        outlook=outlook,
    )
    result = json_completion(prompt, ExplanationResult)
    return ExplanationResult(
        summary=sanitize_text(result.summary.strip() or "No summary was generated."),
        steps=[sanitize_text(step.strip()) for step in result.steps if step.strip()][:6],
    )
