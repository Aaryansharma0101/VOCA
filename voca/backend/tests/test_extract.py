"""Extraction and normalisation tests. The model is always mocked.

Offline tests must pass with no API key. The one live test is skipped unless a
key and model are configured, so it can never turn a clean checkout red.
"""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.llm import LLMError, is_configured
from app.models import ExtractedSkillOut, ExtractionResult
from app.services import extract as extract_module
from app.services.extract import EXTRACT_PROMPT, extract_skills
from app.services.normalise import match_label, normalise_skills, normalise_text


def _result(*skills: tuple[str, int]) -> ExtractionResult:
    return ExtractionResult(
        skills=[
            ExtractedSkillOut(name=name, level=level, evidence=f"I did {name}.", kind="hard")
            for name, level in skills
        ],
        interests=["working with data"],
    )


# --------------------------------------------------------------------------- #
# Prompt contract
# --------------------------------------------------------------------------- #
def test_prompt_includes_story_and_forbids_invention() -> None:
    rendered = EXTRACT_PROMPT.format(story="I taught English for six years.")
    assert "I taught English for six years." in rendered
    assert "evidence" in rendered.lower()
    assert '"skills"' in rendered
    assert "Never infer" in rendered


# --------------------------------------------------------------------------- #
# Extraction with a mocked model
# --------------------------------------------------------------------------- #
def test_extract_uses_model_output(monkeypatch) -> None:
    def fake_json_completion(prompt: str, schema):  # noqa: ANN001
        assert "warehouse" in prompt
        return _result(("spreadsheets", 4), ("team leadership", 3))

    monkeypatch.setattr(extract_module, "json_completion", fake_json_completion)
    result = extract_skills("I run the night shift in a warehouse.")

    assert [skill.name for skill in result.skills] == ["spreadsheets", "team leadership"]
    assert result.interests == ["working with data"]


def test_extract_cleans_bad_entries(monkeypatch) -> None:
    """Blank labels and out-of-range levels are dropped or clamped."""
    messy = ExtractionResult(
        skills=[
            ExtractedSkillOut(name="   ", level=3),
            ExtractedSkillOut(name="SQL", level=9),
        ],
        interests=["a", "A", "  "],
    )
    monkeypatch.setattr(extract_module, "json_completion", lambda *a, **k: messy)
    result = extract_skills("Some story.")

    assert [skill.name for skill in result.skills] == ["SQL"]
    assert result.skills[0].level == 5
    assert result.interests == ["a"]


def test_extract_propagates_llm_failure(monkeypatch) -> None:
    """A failed model call raises, so the API can return a clear 502."""
    def boom(*_args, **_kwargs):
        raise LLMError("The language model request failed: connection reset")

    monkeypatch.setattr(extract_module, "json_completion", boom)
    with pytest.raises(LLMError, match="connection reset"):
        extract_skills("Some story.")


# --------------------------------------------------------------------------- #
# Normalisation
# --------------------------------------------------------------------------- #
def test_normalise_text_folds_case_punctuation_and_plurals() -> None:
    assert normalise_text("  Data   Analysis! ") == "data analysi"
    assert normalise_text("Spreadsheets") == normalise_text("spreadsheet")


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("SQL", "sql"),
        ("postgres", "sql"),
        ("Python programming", "python"),
        ("team leadership", "leadership"),
        ("communication", "communication"),
    ],
)
def test_labels_map_to_seed_skills(graph, label: str, expected: str) -> None:
    skill_id, confidence = match_label(label, graph)
    assert skill_id == expected
    assert confidence > 0


def test_unknown_label_stays_unmatched(graph) -> None:
    skill_id, confidence = match_label("interpretive dance choreography", graph)
    assert skill_id is None
    assert confidence == 0.0


@pytest.mark.parametrize(
    "label",
    [
        "redesigned our department intranet",
        "presented at staff training days",
        "ran parent evenings",
    ],
)
def test_sentence_fragments_do_not_match_unrelated_skills(graph, label: str) -> None:
    # Partial-substring scoring used to turn "redesigned" into "design" and
    # "staff training" into "model training", inventing skills the story
    # never mentioned.
    skill_id, confidence = match_label(label, graph)
    assert skill_id is None
    assert confidence == 0.0


def test_typo_still_matches_the_intended_skill(graph) -> None:
    skill_id, confidence = match_label("spreadshets", graph)
    assert skill_id == "excel"
    assert confidence >= 0.84


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("patient triage", "patient-assessment"),
        ("track stock in spreadsheets", "excel"),
        ("supplier negotiation", "negotiation"),
    ],
)
def test_phrases_match_whole_word_aliases(graph, label: str, expected: str) -> None:
    skill_id, confidence = match_label(label, graph)
    assert skill_id == expected
    assert confidence > 0


def test_generic_word_inside_a_phrase_stays_unmatched(graph) -> None:
    # "design" alone must not turn an intranet redesign into Graphic design.
    skill_id, confidence = match_label("intranet design", graph)
    assert skill_id is None
    assert confidence == 0.0


def test_normalise_deduplicates_and_uses_canonical_names(graph) -> None:
    result = normalise_skills(
        [
            ExtractedSkillOut(name="spreadsheets", level=3, evidence="Excel daily."),
            ExtractedSkillOut(name="Excel", level=4, evidence="Built pivot tables."),
            ExtractedSkillOut(name="Sheep shearing", level=2),
        ],
        graph,
    )

    assert len(result) == 2
    excel = result[0]
    assert (excel.skill_id, excel.name, excel.level) == ("excel", "Excel", 4)
    assert excel.matched is True
    assert "pivot tables" in excel.evidence
    assert result[1].matched is False and result[1].skill_id is None
    assert result[1].name == "Sheep shearing"


# --------------------------------------------------------------------------- #
# Endpoint
# --------------------------------------------------------------------------- #
STORY = (
    "I run the night shift in a distribution centre. I track stock in "
    "spreadsheets, built a small Excel tool that flags slow-moving items, and cut "
    "picking errors by reorganising the aisles. I manage a team of twelve and "
    "report weekly numbers to the site manager."
)


def test_understand_returns_skills_and_matches(client, monkeypatch) -> None:
    """A realistic story yields >=5 skills and >=3 career matches."""
    extraction = _result(
        ("inventory management", 4),
        ("spreadsheets", 4),
        ("process improvement", 3),
        ("team leadership", 4),
        ("reporting", 3),
        ("communication", 3),
    )
    monkeypatch.setattr("app.main.extract_skills", lambda _story: extraction)

    response = client.post("/understand", json={"story": STORY})

    assert response.status_code == 200
    body = response.json()
    assert len(body["skills"]) >= 5
    assert len(body["career_matches"]) >= 3
    assert body["interests"] == ["working with data"]

    matched = [skill for skill in body["skills"] if skill["matched"]]
    assert len(matched) >= 5
    assert all(1 <= skill["level"] <= 5 for skill in matched)
    assert all(skill["evidence"] for skill in matched)

    top = body["career_matches"][0]
    assert top["fit_pct"] >= body["career_matches"][-1]["fit_pct"]
    assert top["matched_skills"] and top["why"]


def test_understand_returns_502_when_model_fails(client, monkeypatch) -> None:
    def boom(_story: str):
        raise LLMError("LLM_MODEL is not set.")

    monkeypatch.setattr("app.main.extract_skills", boom)
    response = client.post("/understand", json={"story": STORY})

    assert response.status_code == 502
    assert "LLM_MODEL" in response.json()["detail"]


def test_health_reports_backends(client) -> None:
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["neo4j"] is False  # NEO4J_URI is unset in tests
    assert body["supabase"] is False
    assert body["llm_configured"] is is_configured()


def test_cors_allows_loopback_frontend(client) -> None:
    """Opening the app at 127.0.0.1:3001 must not look like a dead API."""
    response = client.options(
        "/understand",
        headers={
            "Origin": "http://127.0.0.1:3001",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3001"


# --------------------------------------------------------------------------- #
# Live smoke test (skipped without credentials)
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(
    not (get_settings().llm_api_key.strip() and get_settings().llm_model.strip()),
    reason="LLM_API_KEY and LLM_MODEL are not configured",
)
def test_live_extraction_finds_python() -> None:
    result = extract_skills(
        "I write Python services backed by Postgres and maintain their tests."
    )
    labels = " ".join(skill.name.lower() for skill in result.skills)
    assert result.skills
    assert "python" in labels
