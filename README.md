# Learning Path Recommender

AI-powered, personalized learning path recommender. A learner states a goal,
the app runs them through a skills assessment, then builds a sequenced
roadmap - each topic broken into sub-concepts with their own quizzes, a
mandatory final quiz, and a project - grounded in an internal 80-course
dataset where possible, or synthesized from a live web search where it
isn't. Full-stack: FastAPI backend, React/TypeScript frontend.

For a deep dive on the backend's routes and flows, see
[`docs/frontend_developer_guide.md`](docs/frontend_developer_guide.md). For
deploying this to the internet, see
[`docs/deployment_guide.md`](docs/deployment_guide.md).

## Tech stack

- **Backend**: Python, FastAPI, Postgres (one JSONB column per session, no
  ORM), LangGraph (onboarding conversation orchestration), Pydantic v2.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router.
- **LLM**: multi-provider with automatic failover (Groq + OpenRouter today)
  via `backend/common/llm_client.py` - real calls throughout, no mocking.
- **Search**: Tavily, for web/YouTube-sourced topics and resources.

## Project layout

```
backend/
  agents/         one file per agent (profiler, assessment, path_a, path_b,
                   roadmap_generator, explainer, tutor, knowledge_extractor)
  api/main.py      every FastAPI route
  orchestrator/    shared state schema (state_schema.py) + LangGraph wiring
  common/          LLM client, DB access, config, grading, slugify
  data/            the enriched 80-course dataset
  rag/             embeddings/retrieval over the dataset
  tests/           pytest, real Postgres/LLM calls, no mocking
frontend/
  src/pages/       one file per screen (Chat, Profile, RoadmapReview,
                   Dashboard, TopicDetail, Analytics, ...)
  src/components/  shared UI pieces
  src/api.ts       typed wrapper around every backend route
  src/types.ts     hand-maintained mirror of state_schema.py
docs/              planning docs, the frontend developer guide, deployment guide
```

## Setup

### Backend

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows; source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in real values (never commit `.env`):

```
LLM_PROVIDERS=groq,groq,openrouter
LLM_API_KEYS=key1,key2,key3
LLM_MODELS=openai/gpt-oss-120b,openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b:free
DATABASE_URL=postgresql://postgres:<password>@localhost/learning_path_db
TAVILY_API_KEY=<your Tavily key>
```

- `LLM_PROVIDERS`/`LLM_API_KEYS`/`LLM_MODELS` are comma-separated and
  matched by position - the client tries them in order, failing over to
  the next on a rate limit or error (see `backend/common/llm_client.py`'s
  docstring). Get free API keys from [Groq](https://console.groq.com) and
  [OpenRouter](https://openrouter.ai).
- `TAVILY_API_KEY` - free tier at [tavily.com](https://tavily.com), used
  for web/YouTube-sourced topics (Path B) and the "find more resources"
  feature.
- Requires a local Postgres instance with the database already created:
  `CREATE DATABASE learning_path_db;` (tables are created automatically on
  first run - see `backend/common/db.py`'s `init_db`).

Build the RAG index once (or whenever `backend/data/enriched_courses.json`
changes) - not part of the live request path:

```bash
python -m backend.rag.build_index
```

### Frontend

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env` if your backend isn't on
the default `http://127.0.0.1:8000`:

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Run

**Backend** (from the repo root):

```bash
uvicorn backend.api.main:app --port 8000
```

**On Windows, do not add `--reload`** - WatchFiles spawns the real worker
as a separate child process via `multiprocessing.spawn`; killing the
reloader parent orphans that worker, which keeps serving stale code on
port 8000 with no obvious error. After any backend code change, restart
manually: find the PID (`netstat -ano | findstr ":8000"`), kill it, start
a fresh plain `uvicorn` process. (`--reload` is fine on macOS/Linux.)

Check `http://127.0.0.1:8000/health` (shows LLM endpoint status) and
`http://127.0.0.1:8000/docs` (interactive API docs).

**Frontend** (from `frontend/`):

```bash
npm run dev
```

Opens on `http://localhost:5173`. Sign up, state a goal, and go.

## Test

```bash
pytest backend/tests/ -v
```

Real Groq/OpenRouter/Postgres/Tavily calls, no mocking, per this project's
reliability-first approach - a full run takes several minutes and will hit
free-tier rate limits if run repeatedly in a short window. For the
frontend:

```bash
cd frontend && npx tsc --noEmit
```

## Status

Both the dataset-grounded path (Path A) and the web-sourced path (Path B)
are fully built, backend and frontend, across eight rounds of work:
auth, resume parsing with structured profile auto-fill, sequential
roadmap unlocking, per-sub-concept lazy quizzes with a mandatory final
quiz gating each topic's project, AI-steered roadmap regeneration,
personalization (resume/imported-context/knowledge-base feeding every
LLM prompt including the ongoing chat), analytics, and engagement
features (activity streaks, achievement badges, spaced-repetition topic
review). See `CLAUDE.md` for the full history and `docs/final_decisions.md`
for closed implementation decisions.

Not yet done: hosting/deployment (see `docs/deployment_guide.md` to do
this yourself), solution documentation (PDF/PPT), demo video.
