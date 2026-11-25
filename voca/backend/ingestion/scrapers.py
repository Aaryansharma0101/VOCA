"""Offline resource collection. NEVER imported by the API.

One working example: the Python Job Board (``python.org/jobs``) is a public,
server-rendered listing page, which makes it a good demonstration target. It
produces ``internship``-kind entries because the source lists openings, not
courses; every entry keeps its source URL so it can be verified or removed.

Rules respected here:

* ``robots.txt`` is checked before fetching, and the fetch is skipped if the
  path is disallowed;
* one polite request with a descriptive User-Agent, no crawling in a loop;
* output is written to ``data/scraped_resources.json`` and upserted into Neo4j /
  Supabase when configured. Seed files are never modified.

Usage (from ``backend/``)::

    python -m ingestion.scrapers --limit 20
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import httpx  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.models import Resource  # noqa: E402

BASE_URL = "https://www.python.org"
LIST_URL = f"{BASE_URL}/jobs/"
USER_AGENT = "VocaSeedBot/1.0 (manual run; contact the project maintainer)"

#: Title keywords -> seed skill IDs. Deliberately small and explicit: a wrong
#: mapping is worse than no mapping.
SKILL_KEYWORDS: dict[str, str] = {
    "python": "python",
    "django": "python",
    "flask": "python",
    "data": "data-analysis",
    "analytics": "data-analysis",
    "sql": "sql",
    "machine learning": "machine-learning",
    "ml": "machine-learning",
    "devops": "docker",
    "kubernetes": "docker",
    "aws": "cloud-computing",
    "cloud": "cloud-computing",
    "security": "cybersecurity",
    "backend": "api-design",
    "back-end": "api-design",
    "api": "api-design",
    "frontend": "javascript",
    "front-end": "javascript",
    "test": "quality-assurance",
}


def _robots_allows(url: str) -> bool:
    """Ask the host's robots.txt whether ``url`` may be fetched."""
    parsed = urlparse(url)
    parser = RobotFileParser()
    parser.set_url(f"{parsed.scheme}://{parsed.netloc}/robots.txt")
    try:
        parser.read()
    except Exception:
        # If robots.txt cannot be read, do not scrape.
        return False
    return parser.can_fetch(USER_AGENT, url)


def fetch_page(url: str) -> str:
    """Fetch one page politely; returns HTML.

    Raises:
        RuntimeError: if robots.txt disallows the path or the response is not 200.
    """
    if not _robots_allows(url):
        raise RuntimeError(f"robots.txt disallows {url}; refusing to fetch.")

    response = httpx.get(
        url, timeout=20.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}
    )
    if response.status_code != 200:
        raise RuntimeError(f"{url} returned HTTP {response.status_code}.")
    return response.text


def _skills_for(text: str) -> list[str]:
    """Map title keywords onto seed skill IDs, preserving order and uniqueness."""
    lowered = text.lower()
    found: list[str] = []
    for keyword, skill_id in SKILL_KEYWORDS.items():
        if re.search(rf"\b{re.escape(keyword)}\b", lowered) and skill_id not in found:
            found.append(skill_id)
    return found


def parse_resources(html: str, base_url: str = BASE_URL) -> list[Resource]:
    """Turn one listing page into Resource objects.

    Only entries whose title maps to at least one known skill are kept, so the
    Act stage never receives a resource it cannot attribute to a gap.
    """
    soup = BeautifulSoup(html, "html.parser")
    resources: list[Resource] = []

    for item in soup.select("ol.list-recent-jobs > li"):
        link = item.select_one("h2.listing-company a")
        if link is None or not link.get("href"):
            continue

        title = link.get_text(" ", strip=True)
        url = urljoin(base_url, str(link["href"]))
        slug = url.rstrip("/").rsplit("/", 1)[-1] or title

        company_node = item.select_one("span.listing-company-name")
        company_lines = (
            company_node.get_text("\n", strip=True).splitlines() if company_node else []
        )
        # The span holds "New", the title and the company name on separate lines.
        company = company_lines[-1] if len(company_lines) > 1 else "Python Job Board"
        if company.strip().lower() == title.strip().lower():
            company = "Python Job Board"

        location_node = item.select_one("span.listing-location")
        location = location_node.get_text(" ", strip=True) if location_node else "Not stated"

        skills = _skills_for(f"{title} {company}")
        if not skills:
            continue

        resources.append(
            Resource(
                id=f"scraped-python-jobs-{slug}",
                title=title,
                provider=company[:80],
                kind="internship",
                skill_ids=skills,
                region="global",
                cost="free",
                url=url,
                description=(
                    f"Live opening listed on the Python Job Board ({location}). "
                    "Scraped manually; verify it is still open before applying."
                ),
            )
        )

    return resources


def save_resources(resources: list[Resource]) -> Path:
    """Write to the local JSON cache and upsert into any configured database."""
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    path = settings.data_dir / "scraped_resources.json"
    existing: dict[str, dict] = {}
    if path.exists():
        for row in json.loads(path.read_text(encoding="utf-8")):
            existing[row["id"]] = row
    for resource in resources:
        existing[resource.id] = resource.model_dump(mode="json")
    path.write_text(json.dumps(list(existing.values()), indent=2), encoding="utf-8")

    if settings.neo4j_uri.strip():
        try:
            from neo4j import GraphDatabase

            driver = GraphDatabase.driver(
                settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password)
            )
            with driver.session() as session:
                for resource in resources:
                    session.run(
                        "MERGE (r:Resource {id: $id}) SET r += $props",
                        id=resource.id,
                        props=resource.model_dump(mode="json", exclude={"skill_ids"}),
                    ).consume()
                    for skill_id in resource.skill_ids:
                        session.run(
                            "MATCH (r:Resource {id: $rid}), (s:Skill {id: $sid}) "
                            "MERGE (r)-[:COVERS]->(s)",
                            rid=resource.id,
                            sid=skill_id,
                        ).consume()
            driver.close()
            print(f"Neo4j: upserted {len(resources)} scraped resources.")
        except Exception as exc:
            print(f"Neo4j upsert skipped: {exc}")

    return path


def run_scrape_cycle(limit: int = 20) -> list[Resource]:
    """Fetch, parse and store one listing page. Returns what was written."""
    html = fetch_page(LIST_URL)
    resources = parse_resources(html)[:limit]
    path = save_resources(resources)
    print(f"Wrote {len(resources)} resources to {path}")
    return resources


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape one listing page.")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    try:
        resources = run_scrape_cycle(limit=args.limit)
    except Exception as exc:
        print(f"Scrape failed: {exc}")
        return 1
    for resource in resources[:5]:
        print(f"  - {resource.title} ({resource.provider}) -> {', '.join(resource.skill_ids)}")
    return 0 if resources else 1


if __name__ == "__main__":
    raise SystemExit(main())
