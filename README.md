# Learning Path Recommender — Backend

AI-powered personalized learning path recommender. Backend-only, Path A only,
for now (see `CLAUDE.md` and `docs/project_brief.md` for full context).

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in real values (never commit `.env`):

```
LLM_PROVIDERS=groq,groq,openrouter
LLM_API_KEYS=key1,key2,key3
LLM_MODELS=openai/gpt-oss-120b,openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b:free
DATABASE_URL=postgresql://postgres:<password>@localhost/learning_path_db
```

Requires a local Postgres instance with a `learning_path_db` database already
created (`CREATE DATABASE learning_path_db;`).

Build the RAG index once (or whenever `backend/data/enriched_courses.json`
changes) - not part of the live request path:

```bash
python -m backend.rag.build_index
```

## Run

```bash
uvicorn backend.api.main:app --reload --port 8000
```

Then check `http://127.0.0.1:8000/health` and `http://127.0.0.1:8000/docs`.

## Test

```bash
pytest backend/tests/ -v
```

Most tests make real calls (Groq/OpenRouter, local Postgres, the RAG index) -
there's no mocking layer, per this project's reliability-first approach. A
full run takes a few minutes.

## Status

Path-A backend is functionally complete end to end (build order steps 1-7 in
`CLAUDE.md`): FastAPI skeleton, shared state schema, Postgres session store,
RAG index over the 80-course dataset, LangGraph orchestrator, all five agents
(Profiler, Assessment, Path-A, Roadmap Generator, Explainer), and every route
in `docs/api_contract.md`'s Path-A section wired to real logic. 24/24 tests
passing, including a full integration test of
generate → confirm → explain → submit-assessment.

Not built yet: Path-B (web/YouTube-sourced roadmap), the merge route, and
the frontend.
