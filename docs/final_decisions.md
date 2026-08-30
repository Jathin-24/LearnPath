# Final Implementation Decisions

Everything below is settled. Nothing in this list should be re-decided during
the Claude Code build - if a decision here seems wrong once you're building,
come back and discuss it rather than silently deviating.

## RAG embeddings
**TF-IDF (sklearn `TfidfVectorizer`, 4096 features) + FAISS `IndexFlatIP`
(cosine similarity), no neural embedding model.** Chosen deliberately over
sentence-transformers (`all-MiniLM-L6-v2`):

- **Render free-tier constraint (the deciding factor)**: the previous stack
  bundled `torch` + `sentence-transformers`, which exceeded the free tier's
  build-time/startup memory budget and could not be hosted reliably. TF-IDF
  has no model download and no heavy ML dependency, so the same 80-course
  index builds, loads, and serves comfortably on Render's 512MB free tier.
- No paid embedding API needed anywhere in this pipeline.
- **Known tradeoff (accepted)**: TF-IDF is lexical, so retrieval misses some
  semantic overlap neural embeddings would catch; the hybrid planner
  compensates by letting the LLM do semantic candidate selection on top of
  retrieval (`backend/agents/path_a.py`), and the index is small (80 courses)
  so raw lexical recall is sufficient for the right candidates to surface.
- Revisit neural embeddings (via a managed embedding API) as future-state
  production evolution if retrieval quality ever becomes a measurable
  bottleneck.

## Topic assessments
**Multiple-choice only.** `TopicAssessment.questions` is a list of
`MCQQuestion` (question, options, correct_option_index) — see updated
`state_schema.py`. Auto-gradable, deterministic, no LLM-as-judge grading
step needed, which removes a whole class of reliability risk from the
scoring path. Free-text/open-ended questions are explicitly out of scope
for now.

## Persistence
**One JSON column per session** in local Postgres (`sessions` table:
`session_id UUID PRIMARY KEY, state JSONB, updated_at TIMESTAMP`).
`AppState.model_dump_json()` writes directly to the column, `AppState.
model_validate_json()` reads it back — no ORM mapping layer. Revisit only
if/when you need cross-session analytics that JSONB queries can't handle
well.

## Node IDs
Slugified topic/course name (e.g. `"React Native Mobile Development"` ->
`"react-native-mobile-development"`). Deterministic, readable in logs and
debug output, no separate ID service.

## Auth
Current state: `session_id` (UUID) is the sole identity/access token and
`user_id` is tied to sessions, but **authorization is NOT yet hardened** —
most routes resolve state by a client-supplied `session_id` alone
(`backend/api/main.py` `_load_or_404`) without verifying ownership against
the authenticated user, so any holder of a session_id can read/write that
state. This is the known P0 hardening gap (see the jury evaluation): the
intended fix is to resolve the current user from a real identity (access
token / JWT) on every protected operation and enforce session/resource
ownership checks. Routes that touch per-user resources (knowledge entries,
resume file) already scope by `state.user_id`.

## Status: all backend design decisions closed
Data foundation, state schema, LLM client (with failover), API contracts
(Path A / B / merge), and the four items above are all settled. Nothing
should be waiting on further discussion here before Claude Code starts
building steps 1-6 of the build order in CLAUDE.md.
