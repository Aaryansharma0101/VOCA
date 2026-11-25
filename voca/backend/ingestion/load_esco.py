"""Load the ESCO taxonomy into Neo4j.

ESCO (European Skills, Competences, Qualifications and Occupations) is free to
use with attribution; the CSV/JSON release is downloaded once by this script,
not per request.

Responsibilities:
    1. Read the ESCO skills and occupations files from ``data/esco/``.
    2. Upsert ``(:Skill {id, label, description})`` and
       ``(:Occupation {id, title, description})`` nodes.
    3. Upsert ``ESSENTIAL_FOR`` / ``OPTIONAL_FOR`` relations from occupations to
       skills, plus the occupation hierarchy.
    4. Print a summary (node/relation counts) and leave the database idempotent:
       running twice must not duplicate anything.

IDs written here are the ESCO IDs that Supabase (embeddings, resources, trends)
also uses. Never rewrite them per environment.

Usage (TODO)::

    python -m ingestion.load_esco --data-dir data/esco

TODO:
    * Record the ESCO release version in a ``:Meta`` node so the graph can be
      reproduced.
    * Batch writes with ``UNWIND`` (5-10k rows per transaction).
    * Add ``--dry-run`` that parses and validates without writing.
"""

from __future__ import annotations

from pathlib import Path


def load_skills(data_dir: Path) -> int:
    """Upsert skills from the ESCO skill CSV into Neo4j.

    Args:
        data_dir: Directory holding the extracted ESCO files.

    Returns:
        Number of skill nodes written.

    TODO: implement; map ESCO columns to ``id``, ``label``, ``description``.
    """
    # TODO: implement.
    raise NotImplementedError("load_skills is not implemented yet.")


def load_occupations(data_dir: Path) -> int:
    """Upsert occupations and their essential/optional skill relations.

    Args:
        data_dir: Directory holding the extracted ESCO files.

    Returns:
        Number of occupation nodes written.

    TODO: implement; the relation type decides essential vs optional in
    :func:`app.services.plan.classify_gaps`, so get it right here.
    """
    # TODO: implement.
    raise NotImplementedError("load_occupations is not implemented yet.")


def load_hierarchy(data_dir: Path) -> int:
    """Upsert ``BROADER_THAN`` relations between occupations (ISCO levels).

    Args:
        data_dir: Directory holding the extracted ESCO files.

    Returns:
        Number of relations written.

    TODO: implement; used only for display, not for scoring.
    """
    # TODO: implement.
    raise NotImplementedError("load_hierarchy is not implemented yet.")
