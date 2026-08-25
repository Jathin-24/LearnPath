# CLAUDE.md

This file is read automatically by Claude Code at the start of every session
in this repo. It contains the full design context from planning done in
Claude chat, so you don't need to re-explain the project each time you open
Claude Code.

## Project
AI-Powered Personalized Learning Path Recommender. Full context in
`docs/project_brief.md` - read that first.

## Current status (updated 2026-08-25)
Both Path A and Path B are built, backend and frontend, across five rounds
of work (auth, resume reader, analytics/timer/reminder, identity profile +
sequential roadmap + editing, then Path B + a full UX/quality overhaul -
nav simplification, structured assessment UI, a Topic Tutor, web-sourced
content, personalization, notes). This supersedes the original "Path A
only, no frontend yet" build order below, which is kept for historical
context only - **do not follow it as current instructions.**

Backend: 61+ pytest passing, real Postgres/LLM, no mocking. Frontend:
`tsc --noEmit` clean, React + TypeScript + Vite + Tailwind v4. Round 5 was
built on branch `path-b-and-quality-overhaul`; check `git branch
--show-current` and `git log --oneline -5` before assuming what's on
`main` - ask before merging/pushing, don't assume it's already done.

Not yet started: deployment/hosting, solution documentation (PDF/PPT),
demo video, source ZIP - the remaining hackathon deliverables beyond the
app itself.

All implementation decisions (embeddings, assessment format, persistence,
node IDs, auth timing) are closed - see `docs/final_decisions.md`. Do not
re-decide these; if a past decision seems wrong now, raise it rather than
silently deviating.

## Original build order (historical - already complete)
1. FastAPI project skeleton (routes as thin wrappers per `docs/api_contract.md`)
2. Local Postgres connection (already installed locally - use it directly for
   dev; do not set up Supabase yet, that's a deploy-time swap only)
3. RAG index over `backend/data/enriched_courses.json` (FAISS +
   sentence-transformers)
4. LangGraph orchestrator using `backend/orchestrator/state_schema.py` as the
   ONLY state shape - do not invent parallel state structures
5. Agents: Profiler -> Assessment -> Path-A -> Roadmap Generator -> Explainer,
   each tested in isolation (pytest, fixed input) before wiring into the graph.
   Path-B and the Topic Tutor were added later (Round 5) as agents called
   directly from routes, not LangGraph nodes - see their module docstrings
   for why.
6. All LLM calls go through `backend/common/llm_client.py` - do not call
   provider SDKs directly from agent code. This client already handles
   multi-key failover (tested, see file docstring).

## Files already built and tested - use these, don't regenerate them
- `backend/data_prep/enrich_courses.py`, `split_prerequisites.py` - offline course enrichment (already run once)
- `backend/data/enriched_courses.json` - the actual enriched 80-course dataset
- `backend/orchestrator/state_schema.py` - shared Pydantic state contract, the single source of truth every agent reads/writes
- `backend/orchestrator/graph.py` - LangGraph wiring (Profiler -> Assessment -> Path-A -> Roadmap Generator)
- `backend/common/llm_client.py` - multi-key/provider failover LLM client
- `backend/common/grading.py` - shared deterministic MCQ grading (topic quiz + onboarding quiz both use this)
- `backend/agents/` - profiler, assessment, path_a, path_b, roadmap_generator, explainer, tutor - one file per agent, each with its own module docstring explaining its role and a matching `backend/tests/test_*_agent.py`
- `backend/api/main.py` - all routes; see `docs/api_contract.md` for the original spec (Path B ended up not needing a separate `/roadmap/merge` route - it fills nodes in place instead, see `path_b.py`'s docstring)
- `frontend/src/` - full React app; `types.ts` mirrors `state_schema.py` by hand, keep them in sync when either changes
- `docs/user_workflow.md` + `.mermaid`, `docs/api_contract.md`, `docs/context_export_prompt.md`, `docs/project_brief.md` - original planning docs, still generally accurate for the shape of the system even where specific routes evolved

## Environment variables expected
```
LLM_PROVIDERS=groq,openrouter          # comma-separated, priority order
LLM_API_KEYS=key1,key2                 # matching order, never commit real values
LLM_MODELS=openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b:free
DATABASE_URL=postgresql://localhost/learning_path_db   # local Postgres
TAVILY_API_KEY=...                     # Path-B web/YouTube search (backend/agents/path_b.py)
```
Never hardcode API keys anywhere in source. `.env` must be in `.gitignore`.

## Reliability requirements (non-negotiable)
- Every agent's LLM output must be validated against its Pydantic schema
  before being written to `AppState`. On parse failure: retry once with a
  stricter prompt, then fail loud (raise, log) - never write malformed data
  into shared state silently.
- Every state transition through the orchestrator should call
  `state.log(agent, event_type, detail)` - this is the debugging trail.
- Write a pytest for each agent against a fixed input before considering it
  done. Integration-test routes end to end, not just agent functions in
  isolation - a real bug (Round 5) slipped through agent-level tests
  because the route itself, not the agent, had the bug.

## Dev environment quirks (Windows)
- Don't run the backend with `uvicorn --reload` here - WatchFiles spawns the
  real worker via `multiprocessing.spawn` as a separate child process;
  killing the reloader parent orphans the worker, which keeps serving stale
  code on port 8000 with no obvious error. Restart manually after backend
  edits: find the PID with `netstat -ano | findstr ":8000"`, kill it, start
  a plain `uvicorn backend.api.main:app --port 8000` (no `--reload`).
- Before trusting a "bug" found during live browser verification, confirm
  the backend process actually reflects the latest code first.
