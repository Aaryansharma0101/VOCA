"""Map the LLM's skill labels onto seed skill IDs.

Deterministic and offline. Four passes, cheapest first:

1. exact match on the skill name, an alias, or the ID;
2. whole-word alias containment inside a longer label;
3. fuzzy match with ``rapidfuzz`` (default threshold 84/100);
4. optional cosine similarity with ``sentence-transformers``, used **only** if
   that package happens to be installed, never required.

A label that survives none of these is kept with ``skill_id=None``. Showing an
unmatched skill is better than silently mapping it onto the wrong one, and the
UI lets the user remove or re-add it.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Final, Sequence

from ..config import get_settings
from ..models import ExtractedSkillOut, UnderstoodSkill
from .graph import CareerGraph

logger = logging.getLogger(__name__)

#: Minimum rapidfuzz score (0-100) before a fuzzy match is trusted.
FUZZY_THRESHOLD: Final[float] = 84.0
#: Minimum cosine similarity before an embedding match is trusted.
SEMANTIC_THRESHOLD: Final[float] = 0.62

#: Single words too generic to match on their own inside a longer label.
#: "intranet design" should not become Graphic design, for example.
_GENERIC_SINGLE_TOKENS: Final[frozenset[str]] = frozenset(
    {
        "account",
        "accuracy",
        "analysis",
        "branding",
        "chart",
        "cloud",
        "coaching",
        "collaboration",
        "communication",
        "compliance",
        "construction",
        "contract",
        "creativity",
        "design",
        "distribution",
        "documentation",
        "empathy",
        "flexibility",
        "governance",
        "innovation",
        "insurance",
        "integration",
        "judgement",
        "layout",
        "leadership",
        "listening",
        "maintenance",
        "observation",
        "procurement",
        "reasoning",
        "research",
        "resilience",
        "sales",
        "security",
        "supervision",
        "writing",
    }
)

_PUNCTUATION: Final[re.Pattern[str]] = re.compile(r"[^a-z0-9\s+]")


def normalise_text(text: str) -> str:
    """Lower-case, strip punctuation and collapse whitespace.

    A trailing plural ``s`` is dropped so "spreadsheets" and "spreadsheet"
    compare equal. Both sides of every comparison go through this function, so
    the transform only has to be consistent, not linguistically perfect.
    """
    cleaned = _PUNCTUATION.sub(" ", text.lower().replace("&", " and "))
    cleaned = " ".join(cleaned.split())
    if len(cleaned) > 3 and cleaned.endswith("s") and not cleaned.endswith("ss"):
        cleaned = cleaned[:-1]
    return cleaned


@lru_cache(maxsize=1)
def _semantic_model() -> object | None:
    """Load sentence-transformers if, and only if, it is installed."""
    try:
        from sentence_transformers import SentenceTransformer
    except Exception:  # ImportError, or a broken torch install
        return None

    try:
        model = SentenceTransformer(get_settings().embedding_model)
    except Exception as exc:
        logger.warning("Could not load the embedding model (%s); skipping semantic match.", exc)
        return None
    return model


def _semantic_matches(label: str, graph: CareerGraph) -> str | None:
    """Return a skill ID from cosine similarity, or ``None`` when unavailable."""
    model = _semantic_model()
    if model is None:
        return None

    skills = graph.skills
    try:
        vectors = model.encode(  # type: ignore[attr-defined]
            [label, *[f"{s.name}. {', '.join(s.aliases)}" for s in skills]],
            normalize_embeddings=True,
        )
    except Exception as exc:
        logger.warning("Embedding match failed (%s); skipping.", exc)
        return None

    query = vectors[0]
    best_index, best_score = -1, 0.0
    for index, vector in enumerate(vectors[1:], start=1):
        similarity = float(sum(a * b for a, b in zip(query, vector)))
        if similarity > best_score:
            best_index, best_score = index, similarity

    if best_index >= 0 and best_score >= SEMANTIC_THRESHOLD:
        return skills[best_index - 1].id
    return None


def _contains_alias(tokens: list[str], alias: str) -> bool:
    """True when ``alias`` appears as whole, adjacent words inside ``tokens``.

    Whole-token containment is what lets a phrase such as "track stock in
    spreadsheets" resolve to Excel, while "redesigned" stays out of "design".
    Generic single words are excluded so a passing mention cannot invent a
    skill; multi-word aliases are specific enough to trust.
    """
    alias_tokens = alias.split()
    if not alias_tokens:
        return False
    if len(alias_tokens) == 1 and alias in _GENERIC_SINGLE_TOKENS:
        return False
    width = len(alias_tokens)
    return any(
        tokens[index : index + width] == alias_tokens
        for index in range(len(tokens) - width + 1)
    )


def match_label(label: str, graph: CareerGraph) -> tuple[str | None, float]:
    """Resolve one label to ``(skill_id, confidence)``; ``(None, 0.0)`` if unknown."""
    key = normalise_text(label)
    if not key:
        return None, 0.0

    for alias, skill_id in graph.alias_index():
        if alias == key:
            return skill_id, 1.0

    # A longer label often contains the skill as a whole word or phrase
    # ("patient triage", "track stock in spreadsheets"). Prefer the most
    # specific alias so "budget management" beats a bare "budget".
    tokens = key.split()
    best_alias: tuple[str, str] | None = None
    for alias, skill_id in graph.alias_index():
        if not _contains_alias(tokens, alias):
            continue
        if best_alias is None or len(alias.split()) > len(best_alias[0].split()):
            best_alias = (alias, skill_id)
    if best_alias is not None:
        return best_alias[1], 0.95

    try:
        from rapidfuzz import fuzz, process
    except ImportError:  # pragma: no cover - rapidfuzz is a declared dependency
        logger.warning("rapidfuzz is not installed; only exact matches will resolve.")
    else:
        choices = [alias for alias, _ in graph.alias_index()]
        # token_sort_ratio compares whole tokens. WRatio's partial-substring
        # scoring turned "redesigned our department intranet" into "design"
        # (graphic design) and "staff training days" into "model training"
        # (machine learning), so unrelated labels became graph nodes.
        result = process.extractOne(key, choices, scorer=fuzz.token_sort_ratio)
        if result and result[1] >= FUZZY_THRESHOLD:
            # Use the index the matcher returned: duplicate aliases would make
            # ``choices.index`` resolve to the wrong skill.
            skill_id = graph.alias_index()[result[2]][1]
            return skill_id, float(result[1]) / 100.0

    semantic = _semantic_matches(label, graph)
    if semantic is not None:
        return semantic, 0.6
    return None, 0.0


def normalise_skills(
    skills: Sequence[ExtractedSkillOut], graph: CareerGraph
) -> list[UnderstoodSkill]:
    """Map extracted labels onto seed skills, de-duplicating by skill ID.

    Args:
        skills: Skills straight from ``services.extract``.
        graph: The catalogue to match against.

    Returns:
        One entry per distinct skill, in the input order of its best match.
        Unmatched skills keep ``skill_id=None`` and ``matched=False``; the UI
        shows them in a separate, muted style.
    """
    results: list[UnderstoodSkill] = []
    seen: dict[str, int] = {}

    for extracted in skills:
        name = extracted.name.strip()
        if not name:
            continue

        skill_id, confidence = match_label(name, graph)
        canonical = graph.skill(skill_id) if skill_id else None
        kind = canonical.category if canonical else extracted.kind
        display_name = canonical.name if canonical else name

        result = UnderstoodSkill(
            skill_id=skill_id,
            name=display_name,
            level=extracted.level,
            evidence=extracted.evidence.strip(),
            kind=kind,
            matched=skill_id is not None,
        )

        if skill_id is not None and skill_id in seen:
            # Same skill described twice: keep the higher level and the longest
            # evidence quote rather than showing a duplicate card.
            existing = results[seen[skill_id]]
            results[seen[skill_id]] = existing.model_copy(
                update={
                    "level": max(existing.level, result.level),
                    "evidence": max(existing.evidence, result.evidence, key=len),
                }
            )
            continue

        if skill_id is not None:
            seen[skill_id] = len(results)
        results.append(result)

    return results
