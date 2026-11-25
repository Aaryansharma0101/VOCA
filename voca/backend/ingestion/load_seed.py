"""Load the seed catalogue into Neo4j and/or Supabase. Idempotent.

Both targets are optional; with neither configured the API still works from the
seed files. This script is the only way data enters a database.

Usage (from ``backend/``)::

    python -m ingestion.load_seed                 # everything configured
    python -m ingestion.load_seed --neo4j-only
    python -m ingestion.load_seed --supabase-only

Neo4j: clears and rewrites the ``Skill``, ``Occupation`` and ``Resource`` nodes
this project owns, so re-running never duplicates an edge.

Supabase: upserts by primary key. Create the tables once:

    create table skills (id text primary key, name text, category text,
      aliases jsonb, trend text, trend_note text);
    create table occupations (id text primary key, title text, industry text,
      description text, typical_time_to_enter text, requires jsonb);
    create table resources (id text primary key, title text, provider text,
      kind text, skill_ids jsonb, region text, cost text, url text,
      description text);
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402  (path bootstrap above)
from app.models import Occupation, Resource, Skill  # noqa: E402
from app.services.graph import load_seed  # noqa: E402


def load_neo4j(skills: dict[str, Skill], occupations: dict[str, Occupation],
               resources: list[Resource]) -> None:
    """Rewrite the Voca graph in Neo4j."""
    settings = get_settings()
    try:
        from neo4j import GraphDatabase
    except ImportError as exc:
        raise SystemExit("neo4j is not installed: pip install 'neo4j>=5.23,<6.0'") from exc

    driver = GraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password)
    )
    driver.verify_connectivity()

    skill_rows = [
        {
            "id": skill.id,
            "name": skill.name,
            "category": skill.category,
            "aliases": skill.aliases,
            "trend": skill.trend,
            "trend_note": skill.trend_note,
        }
        for skill in skills.values()
    ]
    occupation_rows = [
        {
            "id": occupation.id,
            "title": occupation.title,
            "industry": occupation.industry,
            "description": occupation.description,
            "typical_time_to_enter": occupation.typical_time_to_enter,
        }
        for occupation in occupations.values()
    ]
    requirement_rows = [
        {
            "occupation_id": occupation.id,
            "skill_id": requirement.skill_id,
            "importance": requirement.importance,
            "level": requirement.level,
        }
        for occupation in occupations.values()
        for requirement in occupation.requires
    ]
    resource_rows = [
        {
            "id": resource.id,
            "title": resource.title,
            "provider": resource.provider,
            "kind": resource.kind,
            "region": resource.region,
            "cost": resource.cost,
            "url": resource.url,
            "description": resource.description,
        }
        for resource in resources
    ]
    cover_rows = [
        {"resource_id": resource.id, "skill_id": skill_id}
        for resource in resources
        for skill_id in resource.skill_ids
    ]

    with driver.session() as session:
        session.run(
            "MATCH (n) WHERE n:Skill OR n:Occupation OR n:Resource DETACH DELETE n"
        ).consume()
        session.run("UNWIND $rows AS row MERGE (s:Skill {id: row.id}) SET s += row",
                    rows=skill_rows).consume()
        session.run(
            "UNWIND $rows AS row MERGE (o:Occupation {id: row.id}) SET o += row",
            rows=occupation_rows,
        ).consume()
        session.run(
            "UNWIND $rows AS row "
            "MATCH (o:Occupation {id: row.occupation_id}) "
            "MATCH (s:Skill {id: row.skill_id}) "
            "MERGE (o)-[r:REQUIRES]->(s) "
            "SET r.importance = row.importance, r.level = row.level",
            rows=requirement_rows,
        ).consume()
        session.run(
            "UNWIND $rows AS row MERGE (r:Resource {id: row.id}) SET r += row",
            rows=resource_rows,
        ).consume()
        session.run(
            "UNWIND $rows AS row "
            "MATCH (r:Resource {id: row.resource_id}) "
            "MATCH (s:Skill {id: row.skill_id}) "
            "MERGE (r)-[:COVERS]->(s)",
            rows=cover_rows,
        ).consume()

    driver.close()
    print(
        f"Neo4j: wrote {len(skill_rows)} skills, {len(occupation_rows)} occupations "
        f"({len(requirement_rows)} requirements), {len(resource_rows)} resources."
    )


def load_supabase(skills: dict[str, Skill], occupations: dict[str, Occupation],
                  resources: list[Resource]) -> None:
    """Upsert the catalogue into Supabase tables."""
    settings = get_settings()
    try:
        from supabase import create_client
    except ImportError as exc:
        raise SystemExit(
            "supabase is not installed: pip install 'supabase>=2.9,<3.0'"
        ) from exc

    client = create_client(settings.supabase_url, settings.supabase_key)
    client.table("skills").upsert(
        [skill.model_dump(mode="json") for skill in skills.values()]
    ).execute()
    client.table("occupations").upsert(
        [occupation.model_dump(mode="json") for occupation in occupations.values()]
    ).execute()
    client.table("resources").upsert(
        [resource.model_dump(mode="json") for resource in resources]
    ).execute()
    print(
        f"Supabase: upserted {len(skills)} skills, {len(occupations)} occupations, "
        f"{len(resources)} resources."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Load the Voca seed catalogue.")
    parser.add_argument("--neo4j-only", action="store_true")
    parser.add_argument("--supabase-only", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    skills, occupations, resources = load_seed(settings.seed_dir)
    print(f"Read {len(skills)} skills, {len(occupations)} occupations, "
          f"{len(resources)} resources from {settings.seed_dir}.")

    has_neo4j = bool(settings.neo4j_uri.strip())
    has_supabase = bool(settings.supabase_url.strip() and settings.supabase_key.strip())

    if not (has_neo4j or has_supabase):
        print(
            "Neither NEO4J_URI nor SUPABASE_URL is configured. Nothing to do: the API\n"
            "already reads these seed files at startup. Set one in .env to use a database."
        )
        return 0

    if has_neo4j and not args.supabase_only:
        load_neo4j(skills, occupations, resources)
    elif not args.supabase_only:
        print("Neo4j: skipped (NEO4J_URI not set).")

    if has_supabase and not args.neo4j_only:
        load_supabase(skills, occupations, resources)
    elif not args.neo4j_only:
        print("Supabase: skipped (SUPABASE_URL/SUPABASE_KEY not set).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
