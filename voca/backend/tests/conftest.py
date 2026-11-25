"""Shared fixtures: an in-memory graph and an API client that needs no model.

Importing ``app.main`` is safe without any credentials: the graph loads from
``ingestion/seed`` and the profile store falls back to SQLite.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import reset_settings_cache  # noqa: E402
from app.main import app, get_graph, get_store  # noqa: E402
from app.services.graph import CareerGraph, load_seed  # noqa: E402


@pytest.fixture(autouse=True)
def _local_backends(monkeypatch) -> Iterator[None]:
    """Keep tests independent of a developer's optional database config.

    Without this, a configured ``.env`` would make the health test report
    Supabase/Neo4j as active and would make the suite depend on external
    services. The LLM key is deliberately left alone so the live test can run
    when it is configured.
    """
    for name in ("NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD", "SUPABASE_URL", "SUPABASE_KEY"):
        monkeypatch.setenv(name, "")
    reset_settings_cache()
    get_graph.cache_clear()
    get_store.cache_clear()
    yield
    reset_settings_cache()
    get_graph.cache_clear()
    get_store.cache_clear()


@pytest.fixture(scope="session")
def graph() -> CareerGraph:
    """The real seed catalogue, always in memory."""
    skills, occupations, resources = load_seed()
    return CareerGraph(skills, occupations, resources, backend="memory")


@pytest.fixture()
def client() -> TestClient:
    """FastAPI test client using the app's own (memory-backed) graph."""
    return TestClient(app)
