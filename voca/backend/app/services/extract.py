"""Story -> skills, interests and levels. The only other model call in the app.

Output is deliberately narrow: a label, a 1-5 level, a short evidence quote and
a kind. No skill IDs, no occupations, no advice. Normalisation maps labels onto
the catalogue afterwards, so a hallucinated label can never become a graph node.
"""

from __future__ import annotations

from typing import Final

from ..llm import json_completion
from ..models import ExtractionResult, sanitize_text

EXTRACT_PROMPT: Final[str] = """You extract what a person can actually do from their career story.

Rules:
- Only extract skills the story supports with something they did. Never infer
  aspirations, interests-as-skills, or skills that merely sound related.
- name is a short, standard skill label of 1 to 3 words ("Excel", "inventory
  management", "team leadership", "curriculum design"). Never copy a sentence
  or clause from the story; evidence carries the person's wording instead.
- level is 1-5: 1 = heard of it, 2 = assisted, 3 = did it independently,
  4 = led or taught it, 5 = recognised expert. Judge only from the story.
- evidence must be a short phrase copied from the story (under 20 words).
- kind is one of: hard, soft, digital, domain.
- 3 to 10 skills. One per entry, no duplicates, most important first.
- interests: up to 4 short phrases for what the person seems to want next.
  Leave empty if the story does not say.
- Never use em dashes or en dashes. Write plainly, like a thoughtful person, not like marketing copy.

Return exactly this JSON shape:
{{"skills": [{{"name": "...", "level": 3, "evidence": "...", "kind": "hard"}}],
  "interests": ["..."]}}

Career story:
\"\"\"
{story}
\"\"\"
"""

#: Labels longer than this are almost certainly a sentence, not a skill.
_MAX_LABEL_CHARS: Final[int] = 60
_MAX_SKILLS: Final[int] = 12


def _clean(result: ExtractionResult) -> ExtractionResult:
    """Drop empty or absurd labels and clamp the level to 1-5."""
    skills = []
    for skill in result.skills:
        name = " ".join(skill.name.split())[: _MAX_LABEL_CHARS + 1]
        if not name or len(name) > _MAX_LABEL_CHARS:
            continue
        skills.append(
            skill.model_copy(update={"name": sanitize_text(name), "level": max(1, min(5, skill.level))})
        )

    interests = []
    for interest in result.interests:
        text = " ".join(interest.split())
        if text and text.lower() not in {i.lower() for i in interests}:
            interests.append(sanitize_text(text[:80]))

    return ExtractionResult(skills=skills[:_MAX_SKILLS], interests=interests[:4])


def extract_skills(story: str) -> ExtractionResult:
    """Extract skills and interests from a career story.

    Args:
        story: The user's own words. Blank input is rejected by the API layer.

    Returns:
        Skills with labels, levels, evidence and kinds, plus interests.

    Raises:
        app.llm.LLMError: if both attempts fail or the JSON does not validate.
    """
    result = json_completion(EXTRACT_PROMPT.format(story=story.strip()), ExtractionResult)
    return _clean(result)
