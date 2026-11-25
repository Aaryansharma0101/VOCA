"""Collect job-posting trends per ESCO occupation into Supabase.

The Plan stage's outlook is computed by code from these rows (see
:func:`app.services.plan.compute_outlook`); the LLM never sees the raw data
until it is reduced to a direction.

Data source: a free job-board API or public dataset, queried with each
occupation's title and alternate labels. Record the query and the observation
date with every row so trends are reproducible.

Table shape (``job_trends``)::

    occupation_id  text        -- ESCO ID
    period         date        -- first day of the month
    postings       integer     -- postings observed for that query
    source         text        -- which dataset/API produced the row
    recorded_at    timestamptz

Usage (TODO)::

    python -m ingestion.job_trends --months 12
    python -m ingestion.job_trends --schedule      # APScheduler, weekly

TODO:
    * Pick the free source and document its rate limit and licence in the
      README.
    * De-duplicate on ``(occupation_id, period, source)`` via upsert.
    * Keep a raw JSON copy of each API response for audit.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.models import Outlook

#: How far back a single scheduled run looks, in months.
DEFAULT_LOOKBACK_MONTHS: int = 12


def fetch_postings(occupation_title: str, months: int = DEFAULT_LOOKBACK_MONTHS) -> list[dict[str, object]]:
    """Query a free job source for postings matching an occupation title.

    Args:
        occupation_title: Search phrase (occupation title or alternate label).
        months: How much history to request.

    Returns:
        Raw ``{"period": date, "postings": int, "source": str}`` records.

    TODO: implement with httpx against the chosen free API; respect its rate
    limit and paginate.
    """
    # TODO: implement.
    raise NotImplementedError("fetch_postings is not implemented yet.")


def store_trends(rows: Sequence[dict[str, object]]) -> int:
    """Upsert trend rows into Supabase ``job_trends``.

    Args:
        rows: Records from :func:`fetch_postings`.

    Returns:
        Number of rows upserted.

    TODO: implement with ``services.get_supabase().table("job_trends").upsert``.
    """
    # TODO: implement.
    raise NotImplementedError("store_trends is not implemented yet.")


def run_cycle(months: int = DEFAULT_LOOKBACK_MONTHS) -> int:
    """Refresh trends for every occupation that has a target in use.

    Args:
        months: History window per occupation.

    Returns:
        Number of rows written.

    TODO: read the occupation list from Neo4j; skip occupations refreshed this
    period; log a one-line summary.
    """
    # TODO: implement.
    raise NotImplementedError("run_cycle is not implemented yet.")


def start_scheduler() -> None:
    """Start the weekly APScheduler job for :func:`run_cycle`.

    Runs in a separate ingestion process, never inside the API. TODO: implement
    with ``BackgroundScheduler``, a weekly trigger, ``max_instances=1`` and
    ``coalesce=True``.
    """
    # TODO: implement.
    raise NotImplementedError("start_scheduler is not implemented yet.")


def summarise(rows: Sequence[dict[str, object]]) -> Outlook:
    """Reduce raw trend rows to an :class:`Outlook` (pure, unit-testable).

    TODO: keep this free of I/O; :func:`app.services.plan.compute_outlook` is
    responsible for reading rows and calling this.
    """
    # TODO: implement.
    raise NotImplementedError("summarise is not implemented yet.")
