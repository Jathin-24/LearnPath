# CLAUDE.md

This file is read automatically by Claude Code at the start of every session
in this repo. It contains the full design context from planning done in
Claude chat, so you don't need to re-explain the project each time you open
Claude Code.

## Project
AI-Powered Personalized Learning Path Recommender. Full context in
`docs/project_brief.md` - read that first.

## Current priority
**Path A only, backend only, no frontend yet.** Do not build Path B logic
or any React/frontend code until told to. Path A's API routes are designed
to leave clean seams for Path B (see `docs/api_contract.md`), so building
Path A first will not require rework later.

All implementation decisions (embeddings, assessment format, persistence,
node IDs, auth timing) are closed - see `docs/final_decisions.md`. Do not
re-decide these during the build.

## Build order right now
1. FastAPI project skeleton (routes as thin wrappers per `docs/api_contract.md`)
2. Local Postgres connection (already installed locally - use it directly for
   dev; do not set up Supabase yet, that's a deploy-time swap only)
3. RAG index over `backend/data/enriched_courses.json` (Chroma or FAISS -
   your call, test retrieval quality standalone before wiring into an agent)
4. LangGraph orchestrator using `backend/orchestrator/state_schema.py` as the
   ONLY state shape - do not invent parallel state structures
5. Agents in order: Profiler -> Assessment -> Path-A -> Roadmap Generator
   (Path A only) -> Explainer. Test each in isolation (pytest, fixed input)
   before wiring into the graph.
6. All LLM calls go through `backend/common/llm_client.py` - do not call
   provider SDKs directly from agent code. This client already handles
   multi-key failover (tested, see file docstring).

## Files already built and tested - use these, don't regenerate them
- `backend/data_prep/enrich_courses.py` - offline course enrichment (already run once)
- `backend/data_prep/split_prerequisites.py` - already run once
- `backend/data/enriched_courses.json` - the actual enriched 80-course dataset, ready to use
- `backend/orchestrator/state_schema.py` - shared Pydantic state contract, tested
- `backend/common/llm_client.py` - multi-key/provider failover LLM client, tested
- `docs/user_workflow.md` + `.mermaid` - full user journey
- `docs/api_contract.md` - route specs for Path A (build now), Path B (later), merge (later)
- `docs/context_export_prompt.md` - the "import context from another AI" feature spec
- `docs/project_brief.md` - full architecture summary

## Environment variables expected
```
LLM_PROVIDERS=xai,xai,anthropic       # comma-separated, priority order
LLM_API_KEYS=key1,key2,key3           # matching order, never commit real values
LLM_MODELS=grok-4,grok-4,claude-sonnet-4-6
DATABASE_URL=postgresql://localhost/learning_path_db   # local Postgres
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
  done. Integration-test the full Path A graph end to end before moving to
  frontend work.
