# API Contract — Path A / Path B / Merge

All routes live under FastAPI. `AppState` (from `state_schema.py`) is the
canonical request/response shape wherever full state is returned. Database:
**local Postgres** for dev (already installed), can move to Supabase later
for deployment without changing the API contract - that's an infra swap
only, not a code change, as long as we go through an ORM/repository layer
rather than raw queries scattered through route handlers.

---

## Core chat / session routes (build first, provider-agnostic of path)

### `POST /session`
Creates a new session. Returns `session_id`, initializes empty `AppState`.

### `POST /chat`
```
Request:  { "session_id": str, "message": str }
Response: { "state": AppState, "assistant_message": str }
```
Routes internally through the orchestrator based on `state.stage` and
`state.next_agent`. This single endpoint drives Onboarding, Assessment, and
the Explainer chat sidebar - the orchestrator decides which agent handles
the message, the route itself stays thin.

### `POST /context/import`
```
Request:  { "session_id": str, "imported_text": str }
Response: { "state": AppState }
```
Stores into `learner_profile.imported_context_raw` (see context_export_prompt.md).
Optional step, called from the onboarding "paste from another AI" screen.

### `GET /state/{session_id}`
Returns current `AppState`. Used by frontend to rehydrate on reload.

### `GET /health`
```
Response: { "status": "ok", "llm_endpoints": [ ...client.status() output... ] }
```

---

## Path A (BUILD THIS FIRST - primary path)

### `POST /roadmap/generate/path-a`
```
Request:  { "session_id": str }
Response: { "roadmap": Roadmap, "path_type": "path_a_dataset" }
```
Internally:
1. RAG retrieval over `enriched_courses.json` using `learner_profile.goal`
   + `skill_gap_map.gaps()` as the query
2. Walk `internal_prerequisites` to sequence retrieved courses into a DAG
   order (topological sort)
3. For each course, attach a `ProjectAssignment` (Project Generator agent)
   and `TopicAssessment` (Assessment agent, question-generation mode)
4. Any `external_prerequisite_concepts` encountered get added as roadmap
   nodes with `path_type: path_b_open_web` and flagged for the Path-B agent
   to fill in resources for (this is the natural integration point between
   the two paths, even while Path B's own full flow isn't built yet)
5. Assemble into `Roadmap`, set `state.stage = ROADMAP_REVIEW`

### `POST /roadmap/confirm`
```
Request:  { "session_id": str }
Response: { "state": AppState }
```
Moves `state.stage` from `ROADMAP_REVIEW` to `IN_PROGRESS`, locks in the
roadmap, unlocks the first available node(s) (those with no unmet
prerequisites) from `LOCKED` to `AVAILABLE`.

### `POST /roadmap/explain/{node_id}`
```
Response: { "explanation": str }
```
Explainer Agent, grounded in `learner_profile` + `skill_gap_map` + the
specific node's data - not a generic LLM call, must cite the actual
reason this node is in the roadmap (concept gap it addresses, prerequisite
chain it's part of).

### `POST /topic/{node_id}/assessment/submit`
```
Request:  { "session_id": str, "answers": list[str] }
Response: { "score": float, "passed": bool, "node_status": NodeStatus }
```
Scores against `TopicAssessment.pass_threshold`. On pass: node → COMPLETE,
downstream nodes with this as a prerequisite get re-checked and possibly
unlocked. On fail: `attempts` increments, remediation suggestion returned.

### `GET /dashboard/{session_id}`
```
Response: {
  "percent_complete": float,
  "skill_radar": { concept: status },
  "current_node": RoadmapNode | null,
  "next_recommended_action": str
}
```

---

## Path B (contract defined now, implement after Path A is solid)

### `POST /roadmap/generate/path-b`
```
Request:  { "session_id": str, "topic": str }
Response: { "roadmap_nodes": list[RoadmapNode], "path_type": "path_b_open_web" }
```
Internally: web/YouTube search (Tavily) -> transcript extraction for
top roadmap-style videos -> LLM synthesis into topic sequence with
`youtube_links`, `cheat_sheet_notes`, `web_sources` populated per node.
Called either standalone (goal doesn't match dataset at all) or per-node
(filling in an `external_prerequisite_concepts` gap flagged by Path A).

---

## Merge (contract defined now, trivial once both paths exist)

### `POST /roadmap/merge`
```
Request:  { "session_id": str }
Response: { "roadmap": Roadmap, "path_type": "mixed" }
```
Combines Path A nodes + any Path B nodes generated to fill external-concept
gaps into one `Roadmap.nodes` list, re-runs prerequisite unlocking logic
across the merged set. This is mostly bookkeeping once both paths produce
valid `RoadmapNode` objects, since they already share the same schema.

---

## Why this ordering works
Path A's route already accounts for Path B's existence (step 4 above,
external concept flagging) without requiring Path B to be built yet - those
nodes just sit as `LOCKED`/unfilled until Path B is implemented. So building
Path A first doesn't create rework later; it creates the exact seams Path B
will plug into.
