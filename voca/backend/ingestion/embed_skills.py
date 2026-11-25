"""Pre-compute ESCO skill embeddings and store them in Supabase (pgvector).

Normalisation must be fast and offline, so embeddings are computed once here -
never inside a request. The same model named by ``EMBEDDING_MODEL`` is used by
:mod:`app.services.normalise` when embedding a user's skill label, so the
vectors are comparable.

Pipeline:
    1. Read skill IDs and labels from Neo4j (or the ESCO CSV).
    2. Embed label + description with sentence-transformers (local, free, CPU).
    3. Upsert ``id``, ``label`` and ``embedding`` into the Supabase ``skills``
       table; make the vector column dimension match the model (384 for
       ``all-MiniLM-L6-v2``).

TODO:
    * Add the pgvector index and similarity RPC in a documented SQL migration
      (``ivfflat``/``hnsw`` with cosine distance).
    * Normalise vectors before insert so cosine and dot product agree.
    * Skip rows whose content hash has not changed, to keep re-runs cheap.
"""

from __future__ import annotations

from collections.abc import Sequence


def embed_skill_labels(labels: Sequence[str]) -> list[list[float]]:
    """Embed skill labels in batches with the configured local model.

    Args:
        labels: Skill labels to embed.

    Returns:
        One vector per label, in input order.

    TODO: implement; batch size ~64, show progress, force CPU determinism.
    """
    # TODO: implement.
    raise NotImplementedError("embed_skill_labels is not implemented yet.")


def upsert_skill_embeddings(rows: Sequence[tuple[str, str, list[float]]]) -> int:
    """Write ``(skill_id, label, embedding)`` rows to Supabase.

    Args:
        rows: Triples to upsert.

    Returns:
        Number of rows upserted.

    TODO: implement with ``services.get_supabase().table("skills").upsert``;
    chunk requests to stay under the API payload limit.
    """
    # TODO: implement.
    raise NotImplementedError("upsert_skill_embeddings is not implemented yet.")
