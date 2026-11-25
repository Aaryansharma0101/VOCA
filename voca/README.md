# Voca

Career transitions in three stages: 01 Understand, 02 Plan, 03 Act.

Voca reads a person's career story, maps it onto a skills catalogue, computes the
route to a target occupation (gaps, bridge roles, readiness, outlook), and then
points at free resources that close the gaps.

The rule that shapes the whole codebase: **the model extracts and explains; code
computes.** Every number shown to the user is reproducible from the seed data.

| Stage | Endpoint | In | Out | Computed by |
| --- | --- | --- | --- | --- |
| Understand | `POST /understand` | free-text story | skills + career matches | LLM extracts, code normalises, graph ranks |
| Plan | `POST /plan` | skills + target | gaps, bridge roles, outlook, readiness, summary | code computes, LLM explains |
| Act | `POST /act` | gap skill IDs | practice + learning resources | code ranks the catalogue |

## Stack

Python 3.11, FastAPI, Pydantic v2, Neo4j (optional), Supabase (optional).
Next.js 14 (App Router), TypeScript, Tailwind CSS 3, shadcn-style components,
Cytoscape.js, Inter, Lucide icons.

Everything is free to run. Two optional services degrade to local equivalents:

* **Neo4j** to in-memory graph loaded from the same seed files.
* **Supabase** to SQLite file at `backend/data/profiles.db` (plus browser `localStorage`).

You need **one LLM key** and nothing else.

## Quick start (Windows)

Double-click **`start.bat`** in this folder. On the first run it creates the
backend virtual environment, installs dependencies, downloads `cloudflared` if
needed, then starts:

* the API at <http://127.0.0.1:8000>
* the frontend at <http://127.0.0.1:3001>
* a Cloudflare quick tunnel, whose public URL is printed and saved to
  `.run/public-url.txt`

The public URL only works while this PC and the three processes stay running,
and it changes whenever the tunnel restarts. **`stop.bat`** shuts everything
down. Add `LLM_API_KEY` to `voca/.env` before using Understand or Plan.

### Manual start

#### 1. Backend

```bash
cd voca
cp .env.example .env          # set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check it: <http://localhost:8000/health> returns
`{"status":"ok","llm_configured":true,"neo4j":false,"supabase":false}`.

#### 2. Frontend

```bash
cd voca/frontend
npm install
npm run dev                    # http://localhost:3000
```

Point the frontend elsewhere with `NEXT_PUBLIC_API_BASE_URL`
(default `http://localhost:8000`).

#### 3. Use it

Landing to Start free, paste a story (or click an example), Analyse my skills,
edit levels, Plan this career, Build my plan, Find opportunities.

## Environment variables

| Key | Required | Purpose |
| --- | --- | --- |
| `LLM_BASE_URL` | yes | OpenAI-compatible base URL, e.g. `https://openrouter.ai/api/v1` |
| `LLM_API_KEY` | yes | Key for that endpoint |
| `LLM_MODEL` | yes | Model identifier understood by that endpoint |
| `NEO4J_URI` | no | Leave empty for the in-memory graph |
| `NEO4J_USER` / `NEO4J_PASSWORD` | no | Only used with `NEO4J_URI` |
| `SUPABASE_URL` / `SUPABASE_KEY` | no | Leave empty to store profiles in SQLite |
| `EMBEDDING_MODEL` | no | Used only if `sentence-transformers` is installed |
| `FRONTEND_ORIGIN` | no | CORS origin, default `http://localhost:3000` |

`Settings` reads `voca/.env` first, then `backend/.env` if present.

## Loading the seed data into Neo4j / Supabase

Both are optional. The API reads `backend/ingestion/seed/*.json` at startup, so
with neither configured everything already works.

```bash
cd backend

# Neo4j (idempotent: clears and rewrites the nodes this project owns)
docker compose -f ../docker-compose.yml up -d neo4j   # or use your own instance
pip install "neo4j>=5.23,<6.0"
python -m ingestion.load_seed --neo4j-only
# then set NEO4J_URI=bolt://localhost:7687 in .env and restart the API

# Supabase (create the tables first, SQL is in ingestion/load_seed.py)
pip install "supabase>=2.9,<3.0"
python -m ingestion.load_seed --supabase-only
```

`/health` reports which backends are **actually in use**, not merely configured:
an unreachable Neo4j falls back to memory and reports `"neo4j": false`.

### Supabase tables

`ingestion/load_seed.py` documents the `skills`, `occupations` and `resources`
DDL. Profiles need:

```sql
create table profiles (
  id text primary key,
  saved_at timestamptz not null default now(),
  payload jsonb not null
);
```

## How the numbers are computed

```text
fit(occupation) = Σ importance × min(have / need, 1)   /   Σ importance
```

* `importance` (0 to 1) and `level` (1 to 5) come from the occupation's requirements.
* `have` is the user's self-rating; missing skills count as 0.
* Readiness is the same formula as a percentage.

Gap and bridge rules:

* **Essential gap**: `importance >= 0.6` and `have < need`.
* **Optional gap**: `importance < 0.6` and `have < need`.
* **Bridge role**: user fit `>= 50%`, shares at least one required skill with
  the target, ranked by shared requirements then reachability, top 3.
* **Outlook**: trend labels for the target's skills plus the user's skills,
  read from the seed. Hand-assigned estimates, **not live labour-market data**.
* **Timeline**: essential gaps at 16 hours per level, optional at 8, over 8
  hours a week. An ordering aid, not a promise.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{status, llm_configured, neo4j, supabase}` |
| GET | `/skills` | full skill catalogue |
| GET | `/occupations` | `{id, title, industry}` |
| GET | `/occupations/{id}` | full detail + requirements (used by the skill graph) |
| POST | `/understand` | story to skills, interests, career matches |
| POST | `/plan` | skills + target to gaps, bridges, outlook, summary, steps |
| POST | `/act` | gap IDs (+ region, free-only) to practice and learn lists |
| POST | `/profiles` | save profile + plan |
| GET | `/profiles/{id}` | load a saved profile |

Failure behaviour: one retry on a bad or failed model call, then a **502 with a
readable `detail`**. No endpoint substitutes fabricated data for a failure.

## Tests

```bash
cd backend
python -m pytest tests -q
```

* `tests/test_plan.py`: gap classification, readiness arithmetic, bridge rules,
  outlook, timeline, `/plan` wiring (model mocked).
* `tests/test_extract.py`: extraction and normalisation with a mocked model,
  `/understand` end-to-end, error paths, one live test skipped without a key.
* `tests/eval/stories.json` + `tests/eval/run_eval.py`: 5 labelled stories and a
  precision/recall runner (`python tests/eval/run_eval.py`). A prompt change that
  lowers mean F1 is a regression.

## Project layout

```text
backend/
  app/
    config.py        env-backed settings
    models.py        Pydantic contracts (wire + LLM)
    llm.py           the only LLM entry point; one retry, clear errors
    main.py          FastAPI endpoints
    services/
      graph.py       CareerGraph: in-memory and Neo4j backends, scoring
      extract.py     story to skills (LLM)
      normalise.py   labels to skill IDs (aliases + rapidfuzz + optional embeddings)
      plan.py        gaps, bridges, outlook, timeline, readiness
      explain.py     summary + steps from a fixed fact sheet (LLM)
      recommend.py   gaps to practice and learn resources
      store.py       profiles: Supabase or SQLite
  ingestion/
    seed/            86 skills, 36 occupations, 94 resources
    load_seed.py     idempotent Neo4j/Supabase loader
    scrapers.py      offline scraper (python.org job board), never in a request
  tests/
frontend/
  src/app/           /, /understand, /dashboard, /plan, /opportunities, /profile
  src/components/    app shell, providers, UI primitives, Cytoscape graph
  src/lib/           typed API client and contracts
```

## Assumptions

1. **Next.js 14 + Tailwind 3 + hand-built shadcn-style primitives.** The spec
   asked for shadcn/ui; the components follow its API (`cn`, variant props,
   composable cards) without Radix, because every control here is a plain button
   or div. No extra dependencies, no CLI step.
2. **`GET /occupations/{id}` was added** beyond the listed endpoints. The skill
   graph needs a role's description and requirements to explain a clicked node
   without running a plan (which requires the model).
3. **Profiles save the whole plan** as JSON, not normalised rows. It keeps the
   SQLite/Supabase paths identical and avoids a schema migration per field.
4. **"Fit" is requirement coverage, not a hiring probability.** A 30% fit means a
   third of the role's weighted requirements are met; nothing about the market.
5. **The example scraper targets the python.org job board** and writes
   `internship`-kind entries, because the source lists real openings rather than
   courses. It is manual, offline, and never imported by the API.
6. **Levels are self-assessed.** The model proposes them from evidence, and the
   UI lets the user correct them; the plan uses the corrected values.

## Known limitations

* **Seed data only.** 86 skills and 36 occupations is enough to demonstrate the
  product, not to advise on the whole labour market. ESCO/O*NET can replace the
  seed via `ingestion/load_seed.py` (see `ingestion/seed/README.md`).
* **Outlook is an estimate.** Trend labels are hand-assigned in the seed and
  clearly labelled as such in the UI. There is no live jobs feed.
* **LLM output may be imperfect.** Extraction can miss a skill or misread a
  level. The UI is built for correction: edit levels, remove skills, add skills
  from the catalogue. An unmatched label is shown, never silently mapped.
* **The plan narrative needs the model.** If the LLM fails, `/plan` returns 502
  rather than prose invented from nothing. The computed gaps are not lost; the
  page keeps the previous plan and shows the error.
* **Resource links should be verified.** Entries point at provider home pages or
  search URLs on purpose (deep links rot). Check cost and availability.
* **Neo4j was not exercised in this environment** (no Docker available). The
  backend is implemented and the fallback is tested; load and verify it locally
  before relying on it.
* **Profiles without Supabase are machine-local.** SQLite on the backend, plus
  `localStorage` in the browser. Saving an ID and loading it only travels between
  devices if Supabase is configured.
* **No authentication.** Anyone with a profile ID can read that profile. Do not
  store sensitive personal data.