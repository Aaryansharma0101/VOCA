"""Profile and plan persistence with a working local fallback.

If Supabase is configured and reachable, records go to the ``profiles`` table.
Otherwise - or if the call fails - they go to a local SQLite file under
``data/``. The browser also keeps a copy in ``localStorage``, so the product is
usable with no database at all.

Supabase table expected (create it once in the SQL editor)::

    create table profiles (
      id text primary key,
      saved_at timestamptz not null default now(),
      payload jsonb not null
    );
"""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Final

from ..config import get_settings
from ..models import ProfileRecord, ProfileSaveRequest

logger = logging.getLogger(__name__)

_SCHEMA: Final[str] = """
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    saved_at TEXT NOT NULL,
    payload TEXT NOT NULL
)
"""


class ProfileStore:
    """Save and load profiles, preferring Supabase and degrading to SQLite."""

    def __init__(self, sqlite_path: Path | None = None) -> None:
        settings = get_settings()
        self._path = sqlite_path or (settings.data_dir / "profiles.db")
        self._supabase = None
        self._supabase_failed = False

        if settings.supabase_url.strip() and settings.supabase_key.strip():
            try:
                from supabase import create_client

                self._supabase = create_client(settings.supabase_url, settings.supabase_key)
            except Exception as exc:
                logger.warning("Supabase client could not be created (%s); using SQLite.", exc)
                self._supabase_failed = True

    @property
    def backend(self) -> str:
        """Which store will be used for the next write."""
        return "supabase" if self._supabase is not None else "sqlite"

    # ------------------------------------------------------------------ #
    # SQLite
    # ------------------------------------------------------------------ #
    def _connect(self) -> sqlite3.Connection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._path)
        connection.execute(_SCHEMA)
        return connection

    def _sqlite_save(self, record: ProfileRecord) -> None:
        payload = record.model_dump(mode="json")
        with self._connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO profiles (id, saved_at, payload) VALUES (?, ?, ?)",
                (record.id, record.saved_at, json.dumps(payload)),
            )

    def _sqlite_get(self, profile_id: str) -> ProfileRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload FROM profiles WHERE id = ?", (profile_id,)
            ).fetchone()
        if row is None:
            return None
        return ProfileRecord.model_validate(json.loads(row[0]))

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def save(self, payload: ProfileSaveRequest) -> ProfileRecord:
        """Persist a profile (with its plan, if supplied) and return the record."""
        record = ProfileRecord(
            id=uuid.uuid4().hex[:12],
            saved_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            skills=payload.skills,
            target_occupation_id=payload.target_occupation_id,
            story=payload.story,
            plan=payload.plan,
            storage="sqlite",
        )

        if self._supabase is not None:
            try:
                self._supabase.table("profiles").insert(
                    {"id": record.id, "saved_at": record.saved_at, "payload": record.model_dump(mode="json")}
                ).execute()
                return record.model_copy(update={"storage": "supabase"})
            except Exception as exc:
                logger.warning("Supabase insert failed (%s); falling back to SQLite.", exc)
                self._supabase = None

        self._sqlite_save(record)
        return record

    def get(self, profile_id: str) -> ProfileRecord | None:
        """Load a profile by ID from whichever store is active."""
        if self._supabase is not None:
            try:
                response = (
                    self._supabase.table("profiles")
                    .select("*")
                    .eq("id", profile_id)
                    .execute()
                )
                rows = response.data or []
                if rows:
                    payload = rows[0].get("payload")
                    record = ProfileRecord.model_validate(payload)
                    return record.model_copy(update={"storage": "supabase"})
            except Exception as exc:
                logger.warning("Supabase read failed (%s); falling back to SQLite.", exc)
                self._supabase = None

        return self._sqlite_get(profile_id)
