# Final Implementation Decisions

Everything below is settled. Nothing in this list should be re-decided during
the Claude Code build - if a decision here seems wrong once you're building,
come back and discuss it rather than silently deviating.

## RAG embeddings
**Local, free — sentence-transformers**, model `all-MiniLM-L6-v2` (small,
fast, no API key, good enough quality for 80-course retrieval at this scale).
No paid embedding API needed anywhere in this pipeline.

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
Skipped for the whole Path A build/testing phase. `session_id` (UUID) is
sufficient. Add Supabase auth only at deploy time, not before - it's an
additive layer on top of the existing session model, not a rework.

## Status: all backend design decisions closed
Data foundation, state schema, LLM client (with failover), API contracts
(Path A / B / merge), and the four items above are all settled. Nothing
should be waiting on further discussion here before Claude Code starts
building steps 1-6 of the build order in CLAUDE.md.
