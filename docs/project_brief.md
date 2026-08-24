# AI-Powered Personalized Learning Path Recommender — Project Brief

## 1. Core Architecture
- **Backend**: Python, FastAPI, LangGraph (multi-agent orchestration)
- **Frontend**: React + React Flow (roadmap visualization) + Recharts (progress/skill charts) — **not started yet, backend first**
- **RAG**: Chroma or FAISS, embedding `enriched_courses.json` via local `sentence-transformers` (`all-MiniLM-L6-v2`) — free, no API key
- **Database**: local Postgres for dev (JSON column per session, keyed by `session_id`); Supabase is a deploy-time swap only, not used yet
- **LLM**: `backend/common/llm_client.py` — multi-key, multi-provider client with automatic failover on rate limits (tested). Configure via `LLM_PROVIDERS` / `LLM_API_KEYS` / `LLM_MODELS` env vars, priority-ordered, never hardcoded
- **Hosting**: Render/Railway (backend), Vercel (frontend) — all free tier, deploy-time only

## 2. The Two-Path Model
- **Path A (Dataset-Grounded)**: RAG retrieval over 80 enriched courses + prerequisite DAG traversal — **primary path, build this first**
- **Path B (Open/Web-Sourced)**: web/YouTube search, transcript synthesis, for goals outside dataset
  coverage or for external prerequisite concepts flagged in the data — **build after Path A is solid**
- Router decides based on RAG match confidence; can offer both when ambiguous
- Path A's API is designed with clean seams for Path B to plug into later (external-concept
  nodes sit unfilled until Path B exists) — building Path A alone first creates no rework

## 3. Data Foundation (done)
- Raw dataset: 109,776 reviews across 80 courses, no metadata
- `enrich_courses.py`: one-time LLM pass → per-course concepts, difficulty, strengths/weaknesses,
  summary, auto-generated search link
- `split_prerequisites.py`: separates prerequisite edges into `internal_prerequisites` (real
  dataset courses) vs `external_prerequisite_concepts` (routed to Path B, not a dead link)
- Output: `enriched_courses.json` — validated, 0 parse errors, 0 dangling internal edges

## 4. Import-Context Feature
Optional onboarding step: user copies a set prompt (see `context_export_prompt.md`), pastes
it into another AI tool they've already used, gets a self-summary back, pastes that into our
app → stored as `learner_profile.imported_context_raw`. Profiler Agent treats it as a hint
alongside live conversation, not ground truth on its own. No cross-platform data access on
our end — user explicitly controls the copy/paste each time.

## 5. Seven Agents
| Agent | Responsibility |
|---|---|
| Profiler | Conversational intake → `LearnerProfile` (incl. imported context) |
| Assessment | Concept checklist + adaptive MCQ quiz → `SkillGapMap`; also scores topic-level MCQ quizzes |
| Path-A | RAG retrieval + prerequisite traversal → dataset-grounded roadmap nodes |
| Path-B | Web/YouTube search + transcript synthesis → open roadmap nodes |
| Roadmap Generator | Merges Path-A/B output into one `Roadmap`, attaches projects/assessments |
| Project Generator | Creates project assignments per topic |
| Explainer | Answers "why this recommendation," grounded in profile + skill-gap map |
| Orchestrator | Routes between agents via `next_agent` field in shared state |

## 6. Shared State Contract
`state_schema.py` — Pydantic models (`AppState`, `LearnerProfile`, `SkillGapMap`, `Roadmap`,
`RoadmapNode`, `ProgressEvent`, etc.). Every agent reads/writes only this schema. Validated,
tested with a full multi-agent simulation, JSON round-trip confirmed. This is the single
source of truth flowing through LangGraph.

## 7. Roadmap Generation Flow (confirmed decision)
Explicit **generate → review → confirm** step, not streaming:
1. Path-A/B agents produce roadmap nodes
2. Roadmap Generator assembles the full `Roadmap` object
3. State moves to `ROADMAP_REVIEW` — user sees the full visual roadmap, can ask "why this?"
   per node (Explainer Agent), edit before confirming
4. On confirm, state moves to `IN_PROGRESS` and the roadmap is locked in
Reasoning: roadmap generation is LLM-expensive; a discrete review step avoids costly
regeneration on user edits and keeps `AppState` unambiguous (generated vs. not).

## 8. Complete User Workflow
See `user_workflow.md` / `user_workflow.mermaid`: Landing → Auth → Onboarding (Profiler) →
Assessment (checklist + quiz) → Path Selection → Roadmap Generation → Review/Confirm →
Dashboard → Topic Detail (course/project/quiz, Explainer sidebar) → Progress loop →
Roadmap Complete.

## 9. Backend Build Order (Path A focus)
1. Project skeleton (FastAPI, folder structure, `.env` config)
2. Shared state schema — **done**, `state_schema.py` (now includes MCQ assessment format)
3. Local Postgres connection — JSON column per session, keyed by `session_id`
4. RAG index over `enriched_courses.json` using local sentence-transformers — test retrieval
   quality standalone first
5. LangGraph orchestrator with stub agents — prove routing works before adding real logic
6. Implement agents one at a time, **Path A only for now**: Profiler → Assessment → Path-A →
   Roadmap Generator (Path A) → Explainer — test each in isolation before integrating.
   Path-B stays a stub that flags external-concept nodes as unfilled.
7. FastAPI routes per `api_contract.md`: `/session`, `/chat`, `/context/import`,
   `/state/{id}`, `/health`, `/roadmap/generate/path-a`, `/roadmap/confirm`,
   `/roadmap/explain/{node_id}`, `/topic/{node_id}/assessment/submit`, `/dashboard/{id}`

## 10. Reliability Practices
- Every agent's LLM output validated against its Pydantic schema; retry once on failure,
  fail loud rather than pass malformed state downstream
- All LLM calls go through `llm_client.py` — multi-key/provider failover, tested (rate-limit
  → automatic switch to next configured key, exhaustion raises a single catchable exception)
- `progress_log` (append-only) doubles as dashboard data and debugging trail
- pytest per agent against fixed inputs before full-graph integration testing

## 11. Files Delivered So Far
- `enrich_courses.py`, `split_prerequisites.py` — offline data pipeline
- `enriched_courses.json` — the actual enriched 80-course dataset (validated)
- `state_schema.py` — shared Pydantic state contract (MCQ assessments, import-context field), tested
- `llm_client.py` — multi-key/provider failover LLM client, tested
- `user_workflow.md` / `.mermaid` — full page-by-page user journey
- `api_contract.md` — route specs for Path A (build now), Path B & merge (later)
- `context_export_prompt.md` — import-context feature spec
- `final_decisions.md` — closed implementation decisions (embeddings, assessment format,
  persistence, node IDs, auth timing)
- `CLAUDE.md` — repo-root context file, read automatically by Claude Code

## 12. Mapping to Judging Criteria
- **Problem Understanding (20%)**: two-path model directly addresses "one-size-fits-all is
  ineffective" from the brief
- **Functionality (25%)**: all five "what to build" items covered — conversational intake,
  profiling, recommendation engine, roadmap w/ prerequisites, explainer, dashboard
- **AI/ML Implementation (20%)**: RAG, multi-agent orchestration, adaptive assessment,
  LLM-derived prerequisite graph
- **Innovation (15%)**: dual dataset/open-web path routing, external-concept flagging,
  import-context feature
- **UX (10%)**: dropped dead-end/upsell pages from the original wireframe, tightened flow
- **Code Quality (10%)**: shared validated state schema, per-agent testing, multi-key
  failover LLM client, reliability practices above

## 13. Next Step
All design decisions are closed (see `final_decisions.md`). Work is now happening in
Claude Code, building the Path A backend per the order in `CLAUDE.md`. Return to this
chat only for design forks worth discussing before implementing.
