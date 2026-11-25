# Seed data

This folder makes Voca runnable with **no downloads and no API keys beyond an
LLM key**. It is hand-built, small and deliberately boring.

| File | Contents |
| --- | --- |
| `skills.json` | 86 skills: `id`, `name`, `category` (`hard`/`soft`/`digital`/`domain`), `aliases`, `trend`, `trend_note` |
| `occupations.json` | 33 occupations across technology, healthcare, finance, creative, education, trades, retail/operations and the public sector. Each requirement has `importance` (0 to 1) and `level` (1 to 5) |
| `resources.json` | 90 free/paid learning and practice opportunities from well-known providers |

## How it is used

* `app/services/graph.py` loads these files into either an in-memory graph or
  Neo4j, using the same IDs.
* `app/services/normalise.py` uses `name` + `aliases` to map LLM labels onto
  skill IDs.
* `app/services/plan.py` reads `importance` to split essential from optional
  gaps, and `trend` / `trend_note` for the outlook section.
* `app/services/recommend.py` ranks resources by how many requested skills they
  cover.

## Replacing it with real taxonomies

This is a seed, not a taxonomy. ESCO (free, EU) or O*NET (free, US) can replace
it without touching the API:

1. Map ESCO/O*NET skill URIs into `skills.json` `id`s (any stable string works).
2. Build `occupations.json` by mapping `essential`/`optional` relations to
   `importance` 0.6 to 1.0 and 0.0 to 0.59, and derive `level` from proficiency
   descriptors.
3. Keep `resources.json` skill references pointing at the new IDs.
4. Re-run `python -m ingestion.load_seed`.

The scoring formula (`sum(importance * min(have/need, 1)) / sum(importance)`)
does not depend on which taxonomy produced the numbers.

## Caveats

* Trend labels are **hand-assigned estimates**, not live labour-market data.
  The UI labels them as estimates.
* Resource URLs are top-level pages or provider search URLs on purpose: deep
  links rot. Verify a link before relying on it.
* Occupation descriptions are written for the product, not taken from a
  licensed source.
