# LearnPath — AI-Powered Personalized Learning Path Recommender

> "Tell us your goal. We'll find your gaps and build the path — not someone else's."

LearnPath is a full-stack application that asks a learner what they want to
learn and what they already know, then generates a **personalized, sequenced
roadmap** — each topic broken into sub-concepts with quizzes, a mandatory
final quiz, and a project — grounded in an internal 80-course dataset where
possible, or synthesized from a live web search where it isn't.

The result is a learning journey built around your **actual** knowledge gaps,
not a generic tutorial order.

---

## Table of Contents

1. [About the Project](#about-the-project)
2. [Key Features](#key-features)
3. [The Approach](#the-approach)
4. [Tech Stack](#tech-stack)
5. [Architecture](#architecture)
6. [Project Layout](#project-layout)
7. [Getting Started (Installation)](#getting-started-installation)
8. [Environment Variables](#environment-variables)
9. [Running the App](#running-the-app)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Documentation](#documentation)

---

## About the Project

Generic tutorials assume everyone starts from the same point. In reality,
learners waste hours covering concepts they already know and miss the ones
they actually need.

LearnPath fixes this with an end-to-end flow:

1. **Intake** — the learner states a goal and answers a few conversational
   questions (Profiler Agent), optionally importing context from another AI
   tool they already use or uploading a resume.
2. **Assessment** — a structured concept checklist plus an adaptive,
   deterministically-graded MCQ quiz identifies exactly what the learner knows.
3. **Roadmap** — an orchestrator builds a sequenced roadmap (
   prerequisites before dependents), grounded in a curated 80-course dataset
   (Path A) or populated from live web/YouTube search (Path B) when the goal
   falls outside dataset coverage.
4. **Learn** — each topic unlocks sequentially: sub-concept quizzes, a final
   quiz that must be passed before the topic's project, a Topic Tutor for
   questions, notes, resources, and a progress dashboard with analytics,
   streaks, badges, and spaced-repetition review.

## Key Features

- **Conversational onboarding** — the Profiler Agent conducts the intake
  naturally instead of a rigid form.
- **AI-driven skills assessment** — concept checklist + adaptive MCQ quiz,
  scored with the project's shared deterministic grading module.
- **Two-path roadmap engine**:
  - **Path A** — RAG retrieval over an enriched 80-course dataset with
    prerequisite-graph traversal.
  - **Path B** — live web/YouTube search + synthesis for goals outside the
    dataset (Tavily-powered).
- **Full roadmap editing** — reorder, skip, add, edit, or delete topics;
  regenerate the roadmap with free-text instructions and an "explain why you
  recommended this" agent per node.
- **Sequential unlocking** — topics progress one at a time and stay
  single-topic-focused, so learners never get overwhelmed.
- **Per-sub-concept quizzes** — deterministically graded, with a **mandatory
  final quiz gating the project**.
- **Topic Tutor** — an in-topic LLM assistant that grounds answers in the
  learner's current topic and profile.
- **Personalization everywhere** — resume upload + imported context feed a
  persistent per-user knowledge base that is injected into every LLM prompt,
  including ongoing chat.
- **Engagement** — activity streaks, achievement badges, and
  spaced-repetition review reminders (d, 3, 7 day intervals).
- **Analytics dashboard** — time per topic, quiz pass rates, weekly progress,
  skill radar, and more, rendered with Recharts + ReactFlow.
- **Polished UX** — dark/light mode, animated hero, custom cursor effects, and
  a fully responsive Tailwind design.

## The Approach

### 1. Multi-agent orchestration

The backend is built around **eight specialized agents** coordinated by a
LangGraph orchestrator. Each agent has one job:

| Agent | Responsibility |
|---|---|
| Profiler | Conversational intake → structured `LearnerProfile` |
| Assessment | Concept checklist + adaptive MCQ → `SkillGapMap`; also scores topic quizzes |
| Path-A | RAG retrieval + prerequisite traversal → dataset-grounded roadmap nodes |
| Path-B | Web/YouTube search + transcript synthesis → open-roadmap nodes |
| Roadmap Generator | Merges Path-A/B output into one roadmap, attaches projects & assessments |
| Knowledge Extractor | Extracts structured facts from resumes / imported context |
| Explainer | Answers "why this recommendation" per node |
| Topic Tutor | In-topic Q&A during learning |

### 2. A single source of truth

Every agent reads and writes **one shared Pydantic state schema**
(`backend/orchestrator/state_schema.py` — `AppState`). Each agent's LLM output
is validated against its schema before being written to state: retry once with
a stricter prompt, then fail loud. Malformed data never flows downstream
silently.

### 3. Grounded generation (RAG)

`backend/data/enriched_courses.json` — an enriched 80-course dataset — is
indexed with **TF-IDF + FAISS** into a local retrieval index
(`backend/rag/`). Path A retrieves the most relevant courses and walks their
prerequisites. TF-IDF was chosen over neural embeddings to keep the free-tier
deploy memory-friendly while comfortably serving an 80-course index.

### 4. Routing confidence — the two-path model

A router picks Path A, Path B, or both based on retrieval confidence. Because
a goal can sit partially inside the dataset, **external prerequisite concepts
are flagged and routed to Path B** instead of becoming dead links.

### 5. Generate → review → confirm

Roadmap generation is LLM-expensive, so it never streams into the roadmap:
the app generates a full draft, lets the learner review and edit it (with
explanations per node), and only then locks it in.

### 6. Reliability-first engineering

- Deterministic grading for every quiz (`backend/common/grading.py`).
- All LLM calls go through `backend/common/llm_client.py` — a multi-key,
  multi-provider client with **automatic failover on rate limits/errors**.
- A per-session append-only progress log doubles as the dashboard's data and
  the debugging trail.
- Each agent has its own pytest (real Postgres + real LLM calls, no mocking).

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, Pydantic v2 |
| Orchestration | LangGraph |
| Database | PostgreSQL (local dev, Supabase in production) — JSONB per session, no ORM |
| RAG | scikit-learn TF-IDF + FAISS |
| LLM | Multi-provider (Groq + OpenRouter), automatic failover |
| Web search | Tavily |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Visuals | React Flow (roadmap), Recharts (analytics), Framer Motion, GSAP |
| Auth | bcrypt username/password sessions |
| Tests | pytest (backend), tsc/oxlint (frontend) |

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌───────────────────────────┐
│   React/Vite │ ───▶ │   FastAPI    │ ───▶ │   LangGraph orchestrator  │
│   (Frontend) │ ◀─── │  (Backend)   │      │  Profiler → Assessment →  │
└──────────────┘      └──────────────┘      │  Path-A/Path-B → Generator│
         ▲                 │                 └────────────┬──────────────┘
         │                 ▼                             ▼
         │        ┌──────────────────┐        ┌────────────────────┐
         │        │   PostgreSQL     │        │  RAG (TF-IDF +    │
         │        │  (JSONB state,   │        │   FAISS over      │
         │        │   users, kb)     │        │   80 courses)     │
         │        └──────────────────┘        └────────────────────┘
         │                 │                            │
         └─────────────────┴────────────────────────────┘
                                             ▼
                                     LLM multi-provider
                                       + Tavily search
```

**Runtime flow:** `React/Vite → FastAPI → LangGraph → RAG (FAISS + TF-IDF) → LLM/Tavily → PostgreSQL`

## Project Layout

```
backend/
  agents/            one file per agent (profiler, assessment, path_a, path_b,
                     roadmap_generator, explainer, tutor, knowledge_extractor)
  api/main.py        every FastAPI route
  orchestrator/      shared Pydantic state schema (state_schema.py) + LangGraph graph
  common/            LLM client, DB access, config, deterministic grading, slugify
  data/              the enriched 80-course dataset (enriched_courses.json)
  data_prep/         offline enrichment pipeline (already run once)
  rag/               TF-IDF + FAISS index build and retrieval
  tests/             pytest suites, real Postgres/LLM calls, no mocking
frontend/
  src/pages/         one file per screen (Login, Chat, Profile, RoadmapReview,
                     Dashboard, TopicDetail, Analytics, ImportContext, ...)
  src/components/    shared UI (buttons, cards, roadmap graph/list, charts, effects)
  src/api.ts         typed wrapper around every backend route
  src/types.ts       hand-maintained mirror of state_schema.py
docs/                project brief, API contract, deployment guide, decisions
```

## Getting Started (Installation)

### Prerequisites

- Python **3.11+**
- Node.js **18+** (npm)
- PostgreSQL running locally (or a Supabase URL — see Environment Variables)

### 1. Backend

```bash
# Clone and enter the repo
git clone <your-repo-url>
cd learning-path-recommender

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Copy the template and fill in real values (`.env` is git-ignored — never
commit your keys):

```bash
cp .env.example .env     # Windows: copy .env.example .env
```

Make sure your Postgres database exists (tables are created automatically on
first run):

```sql
CREATE DATABASE learning_path_db;
```

Optionally rebuild the RAG index (only needed if
`backend/data/enriched_courses.json` changes — the committed index is ready):

```bash
python -m backend.rag.build_index
```

### 2. Frontend

```bash
cd frontend
npm install
```

The frontend works out of the box against `http://127.0.0.1:8000`. Only if
your backend lives elsewhere, copy `frontend/.env.example` to `frontend/.env`
and set:

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDERS` | Yes | Comma-separated providers in priority order, e.g. `groq,groq,openrouter` |
| `LLM_API_KEYS` | Yes | Matching comma-separated API keys (position-matched with providers) |
| `LLM_MODELS` | Yes | Matching comma-separated model names, e.g. `openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b:free` |
| `DATABASE_URL` | Yes | Postgres connection string (local or Supabase pooler) |
| `TAVILY_API_KEY` | Yes | [Tavily](https://tavily.com) free API key — used for Path B (web/YouTube) and "find more resources" |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS origins for a deployed frontend |

Get free keys at [Groq](https://console.groq.com),
[OpenRouter](https://openrouter.ai), and [Tavily](https://tavily.com).
The LLM client tries endpoints in order and **fails over automatically** on a
rate limit or error.

## Running the App

**Backend** (from the repo root):

```bash
uvicorn backend.api.main:app --port 8000
```

- Health/status: `http://127.0.0.1:8000/health`
- Interactive API docs (Swagger): `http://127.0.0.1:8000/docs`

> **Windows note:** do **not** use `--reload` here — the WatchFiles reloader
> spawns the real worker as a child process that gets orphaned (and keeps
> serving stale code) when you kill the parent. Restart manually instead.

**Frontend** (from `frontend/`):

```bash
npm run dev
```

Open **http://localhost:5173**, sign up, state a goal, and walk through the
onboarding. The roadmap generates in a few seconds (LLM + RAG).

## Testing

**Backend** — 60+ tests against real Postgres and real LLM providers (no
mocking), one test file per agent plus route integration tests:

```bash
pytest backend/tests/ -v
```

> A full run takes several minutes and can hit free-tier LLM rate limits if
> repeated back-to-back.

**Frontend:**

```bash
cd frontend
npm run lint        # oxlint
npx tsc --noEmit    # TypeScript check
```

## Deployment

The app is designed to deploy on free tiers with no code changes:

| Piece | Host | Notes |
|---|---|---|
| Database | [Supabase](https://supabase.com) | Use the **Session pooler** connection string; tables auto-create on startup |
| Backend | [Render](https://render.com) | Start command: `uvicorn backend.api.main:app --host 0.0.0.0 --port $PORT` |
| Frontend | [Vercel](https://vercel.com) | Root directory `frontend`, framework Vite |

Full step-by-step instructions (including the `ALLOWED_ORIGINS` CORS setup) in
[`docs/deployment_guide.md`](docs/deployment_guide.md).

## Documentation

More detail lives in `docs/`:

- [`docs/project_brief.md`](docs/project_brief.md) — original design brief and how it maps to judging criteria
- [`docs/api_contract.md`](docs/api_contract.md) — canonical API route specs
- [`docs/user_workflow.md`](docs/user_workflow.md) — the page-by-page user journey
- [`docs/frontend_developer_guide.md`](docs/frontend_developer_guide.md) — backend routes and flows for frontend work
- [`docs/final_decisions.md`](docs/final_decisions.md) — closed implementation decisions
- [`docs/deployment_guide.md`](docs/deployment_guide.md) — putting it on the internet

## Status

Both roadmap paths (dataset-grounded **Path A** and web-sourced **Path B**)
are fully built across backend and frontend, including auth, resume parsing,
sequential roadmap unlocking, lazy sub-concept quizzes, AI-steered roadmap
regeneration, personalization, analytics, and engagement features
(streaks, badges, spaced-repetition review). The app targets the hackathon
deliverable of a working, demoable product grounded in real LLM calls and a
real database — no mocked responses.