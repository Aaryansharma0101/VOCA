"""Score skill extraction against the hand-labelled stories.

Run from ``backend/`` (no test framework needed)::

    python tests/eval/run_eval.py

For every story the runner extracts skills, lower-cases the labels and compares
them with ``expected_skills`` using set precision/recall. It prints a per-story
breakdown and an aggregate score, then exits non-zero when the mean F1 falls
below :data:`MIN_F1`, so it can gate prompt changes in CI.

The runner needs a configured LLM (``LLM_API_KEY`` and ``LLM_MODEL``); it
refuses to pretend it passed when the provider is unreachable.

Label matching is intentionally forgiving: the point is whether the model found
the right *concepts*, not whether it used the catalogue's wording. Compare
against seed IDs only after normalisation, which the API does per request.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402  (path bootstrap above)
from app.llm import LLMError  # noqa: E402
from app.services.extract import extract_skills  # noqa: E402

EVAL_SET_PATH = Path(__file__).with_name("stories.json")

#: Mean F1 below which the run is considered a regression.
MIN_F1: float = 0.60


def load_eval_set(path: Path = EVAL_SET_PATH) -> list[dict[str, object]]:
    """Load the labelled stories from disk.

    Args:
        path: JSON file written in the format of ``stories.json``.

    Returns:
        The ``stories`` list.

    Raises:
        ValueError: when the file is malformed or a story is missing a field.
    """
    data = json.loads(path.read_text(encoding="utf-8"))
    stories = data.get("stories")
    if not isinstance(stories, list) or not stories:
        raise ValueError(f"{path} contains no stories")

    for story in stories:
        missing = {"id", "story", "expected_skills"} - set(story)
        if missing:
            raise ValueError(f"story {story.get('id', '<unknown>')} is missing {sorted(missing)}")
    return stories


def score(expected: set[str], actual: set[str]) -> tuple[float, float, float]:
    """Return ``(precision, recall, f1)`` for two label sets.

    Args:
        expected: Hand-labelled skills, lower-cased.
        actual: Extracted skills, lower-cased.

    Returns:
        Three floats in 0-1; a zero for anything undefined (no overlap or two
        empty sets).
    """
    if not expected and not actual:
        return 1.0, 1.0, 1.0
    if not expected or not actual:
        return 0.0, 0.0, 0.0

    overlap = len(expected & actual)
    precision = overlap / len(actual)
    recall = overlap / len(expected)
    f1 = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)
    return precision, recall, f1


def evaluate(story: dict[str, object]) -> tuple[set[str], set[str], float, float, float]:
    """Extract skills for one story and score them.

    Args:
        story: One entry from the eval set.

    Returns:
        The expected set, the extracted set and the three metrics.
    """
    expected = {str(label).strip().lower() for label in story["expected_skills"]}  # type: ignore[union-attr]
    extracted = extract_skills(str(story["story"]))
    actual = {skill.name.strip().lower() for skill in extracted.skills if skill.name.strip()}
    precision, recall, f1 = score(expected, actual)
    return expected, actual, precision, recall, f1


def main() -> int:
    """Run the evaluation set and print a table plus the mean F1."""
    parser = argparse.ArgumentParser(description="Evaluate skill extraction.")
    parser.add_argument("--set", type=Path, default=EVAL_SET_PATH, help="Path to stories.json")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.llm_api_key or not settings.llm_model:
        print("LLM_API_KEY and LLM_MODEL must be set; copy .env.example to .env.")
        return 2

    stories = load_eval_set(args.set)
    scores: list[float] = []

    for story in stories:
        try:
            expected, actual, precision, recall, f1 = evaluate(story)
        except LLMError as exc:
            print(f"extraction unavailable: {exc}")
            return 2

        scores.append(f1)
        print(f"{story['id']:<28} P={precision:.2f} R={recall:.2f} F1={f1:.2f}")
        missed = expected - actual
        extra = actual - expected
        if missed:
            print(f"  missed: {', '.join(sorted(missed))}")
        if extra:
            print(f"  extra:  {', '.join(sorted(extra))}")

    mean_f1 = sum(scores) / len(scores)
    print(f"\nmean F1 = {mean_f1:.2f} over {len(scores)} stories")
    if mean_f1 < MIN_F1:
        print(f"below threshold ({MIN_F1:.2f})")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
