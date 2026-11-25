"""Environment-backed settings, read exactly once per process.

Only this module touches ``os.environ``. Everything else asks
:func:`get_settings`, so swapping an endpoint or a credential is a ``.env``
change, never a code change.

Neo4j and Supabase are optional. Their keys default to empty strings, which the
rest of the app reads as "not configured" and handles by falling back to the
in-memory graph and local SQLite storage.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Final

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT: Final[Path] = Path(__file__).resolve().parents[1]
ROOT_ENV_FILE: Final[Path] = BACKEND_ROOT.parent / ".env"
LOCAL_ENV_FILE: Final[Path] = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    """Typed view of the backend configuration."""

    model_config = SettingsConfigDict(
        env_file=(ROOT_ENV_FILE, LOCAL_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- LLM: any OpenAI-compatible endpoint. Only app/llm.py reads these. ---
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_timeout_seconds: float = 60.0

    # --- Neo4j: optional. Empty URI means "use the in-memory graph". ---
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # --- Supabase: optional. Empty URL means "store profiles in SQLite". ---
    supabase_url: str = ""
    supabase_key: str = ""

    # --- Browser origin allowed by CORS ---
    frontend_origin: str = "http://localhost:3000"

    # --- Optional local embeddings; only used when sentence-transformers is
    # --- already installed. Never required.
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # --- Local storage + seed data ---
    data_dir: Path = BACKEND_ROOT / "data"
    seed_dir: Path = BACKEND_ROOT / "ingestion" / "seed"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached, process-wide settings object."""
    return Settings()


def reset_settings_cache() -> None:
    """Clear the cache. Tests use this after monkeypatching the environment."""
    get_settings.cache_clear()
