# Frontend Developer Guide

This is the reference for building a frontend against the existing backend -
written for someone with **no prior context** on this project. The current
`frontend/` (React + TS + Vite + Tailwind) is a working reference
implementation, not a spec you need to match - build whatever UI you want
against the API described here. `docs/api_contract.md` is an older,
higher-level planning doc; this file reflects the backend **as it actually
is today**.

If anything here seems to disagree with the running backend, the backend
wins - this is a snapshot, not a generated spec.

---

## 1. What this app does

An AI-personalized learning path recommender. A learner states a goal
("become a backend developer"), the backend runs them through a skills
assessment, then builds a **sequenced roadmap** of topics - each with a
project and quizzes - either grounded in an internal 80-course dataset
("Path A") or synthesized from a live web search when nothing in the
dataset fits ("Path B"). The learner works through topics **one at a
time, strictly in order**: sub-concepts within a topic, then a mandatory
final quiz, then the topic's project unlocks, then the next topic opens.

## 2. Tech stack & running it locally

- **Backend**: Python, FastAPI, Postgres (one JSONB column per session -
  no ORM), LangGraph (orchestrates the onboarding conversation only),
  Pydantic v2 for all data shapes.
- **LLM**: multi-provider with failover (Groq + OpenRouter free tier
  configured today) via `backend/common/llm_client.py`. Real calls, no
  mocking anywhere in this codebase - if you write backend tests, use
  real fixtures.
- **Search**: Tavily, for Path-B web/YouTube resources.

```bash
# from repo root, with a Python venv that has requirements installed
uvicorn backend.api.main:app --port 8000
# NOT --reload on Windows - see CLAUDE.md, it orphans workers
```

Required env vars (`.env` at repo root):
```
LLM_PROVIDERS=groq,openrouter
LLM_API_KEYS=key1,key2
LLM_MODELS=openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b:free
DATABASE_URL=postgresql://user:pass@localhost/learning_path_db
TAVILY_API_KEY=...
```

CORS currently allows `localhost:5173`/`5174` (both http and 127.0.0.1
variants) - see `backend/api/main.py`'s `CORSMiddleware` setup. If your
frontend runs on a different port, add it there (it's a plain Python
list, dev-only, no build step needed).

`GET /health` returns `{"status", "llm_endpoints": [...], "llm_config_error"}`
- each LLM endpoint's circuit-breaker state (`healthy`/`cooling_down`/`dead`).
Good first call to sanity-check your setup.

## 3. The session model (read this before anything else)

There is **no JWT, no cookies, no bearer tokens**. Everything is a
`session_id` (a UUID) that you get once and pass as a plain field in every
request body (or path segment for GETs). The backend has exactly one
mutable object per session: `AppState`, described in full in section 5.
Every route either reads it, mutates it, and writes it back
(`db.save_state`), or is a pure read.

Two ways to get a `session_id`:

- **Guest**: `POST /session` (empty body) → `{"session_id": "...", "state": {...}}`.
  Not tied to a user account; there's no way to log back into a guest
  session from a different device/browser.
- **Authenticated**: `POST /auth/signup` `{"username", "password"}` →
  `{"user_id", "username", "session_id"}`, or `POST /auth/login` with the
  same body shape. **One session per user** - there's no multi-device or
  multi-session support; logging in always returns the same session_id for
  that account. Passwords are bcrypt-hashed; that's the entire auth model,
  no email verification, no password reset.

Store the returned `session_id` (and `user_id`/`username` if you signed
up/logged in) in `localStorage` and attach it to every subsequent call.
The reference frontend's pattern (`frontend/src/session.ts`) is a single
`{user_id, username, session_id}` object under one `localStorage` key -
copy that shape or invent your own, it's frontend-only.

`GET /state/{session_id}` → `{"state": AppState}` is your escape hatch -
call it any time to resync the full state after a page load or a route
whose response doesn't happen to include the full state.

## 4. The stage state machine

`AppState.stage` (a string enum) tells you which "mode" the learner is in.
Route which page/UI to show off of this field after loading state:

```
onboarding        -> conversational goal-setting (drive via POST /chat)
assessment        -> skills checklist + quiz (see section 6.1)
path_selection     -> (currently a pass-through, not user-facing)
roadmap_generation -> (transient, not usually observed)
roadmap_review     -> roadmap built, not yet confirmed - review/edit/confirm screen
in_progress        -> roadmap confirmed, learner working through topics
complete           -> 100% of roadmap topics done
```

`AppState.roadmap` is `null` until Path-A/Path-B has run; once it exists,
each `RoadmapNode.status` (`locked` | `available` | `in_progress` |
`complete`) tells you what's clickable. **Exactly one node is
`available` at a time** - this app is deliberately sequential, not a free
-for-all topic picker (see `main.py`'s `_unlock_next_in_sequence`).

## 5. Data shapes

The authoritative source is `backend/orchestrator/state_schema.py`
(Pydantic) - `frontend/src/types.ts` is a hand-maintained TypeScript
mirror of it, useful to skim even if you don't reuse the file directly. Key
shapes, summarized:

```ts
LearnerProfile {
  // Identity - required before leaving onboarding
  name, email, age, gender: string | null
  occupation_status: "student" | "working_professional" | null
  student_percentage, professional_role: string | null

  // Learning profile
  goal, timeline: string | null
  interests, stated_known_skills, prior_learning_history: string[]
  hobbies, certifications: string[]           // auto-filled from resume, editable

  // Provenance (hints merged into LLM prompts, never ground truth alone)
  imported_context_raw: string | null          // pasted from another AI tool
  resume_raw: string | null                    // extracted resume text
  resume_filename, resume_uploaded_at: string | null

  roadmap_instructions: string | null           // persistent free-text steering,
                                                 // see section 6.4
}

SkillGapMap {
  assessments: { concept, status: "known"|"claimed_unconfirmed"|"gap"|"learned",
                 quiz_score: number | null, source_course: string | null }[]
}

Subtopic {
  subtopic_id, name: string
  status: "locked" | "available" | "passed" | "skipped"
  quiz: TopicAssessment | null   // generated lazily, see section 6.2
}

TopicAssessment {
  questions: MCQQuestion[]
  pass_threshold: number         // 0.7 today
  last_score: number | null
  attempts: number
}

MCQQuestion {
  question: string
  options: string[]              // exactly 4
  correct_option_index: number   // yes, this IS sent to the frontend - see note below
  explanation: string
}

WebResource { title: string, url: string, snippet: string }

ProjectAssignment {
  title, description: string
  success_criteria: string[]
  detailed_description: string | null   // filled on demand, see /project/expand
}

RoadmapNode {
  node_id, topic: string
  path_type: "path_a_dataset" | "path_b_open_web"
  status: "locked" | "available" | "in_progress" | "complete"
  course_name, course_search_link, course_summary: string | null   // Path A
  youtube_links, web_sources: WebResource[]                         // Path B
  cheat_sheet_notes: string | null                                  // Path B
  internal_prerequisites: string[]        // node_ids
  external_prerequisite_concepts: string[]
  project: ProjectAssignment | null       // null until the topic's final quiz unlocks it
  assessment: TopicAssessment | null      // the topic's FINAL quiz - null until earned
  subtopics: Subtopic[]                   // empty until the node is unlocked
  key_concepts: string[]
  estimated_days: number
  completed_at: string | null
  time_spent_seconds: number
  notes: string                            // learner's private free-text notes
  next_review_at: string | null            // spaced-repetition, section 6.5
  review_count: number
}

Roadmap { path_type, nodes: RoadmapNode[], current_node_id: string | null }

AppState {
  session_id, user_id: string | null
  stage: ConversationStage
  learner_profile: LearnerProfile
  skill_gap_map: SkillGapMap
  roadmap: Roadmap | null
  conversation_history: { role: "user"|"assistant", content, timestamp,
                           agent: string | null }[]
  progress_log: { timestamp, agent, event_type, detail }[]   // audit trail, handy for debugging
  current_streak_days, longest_streak_days: number
  last_active_date: string | null
  // a few internal scratch/routing fields you can ignore: next_agent,
  // last_user_message, pending_quiz, pending_checklist_concepts, awaiting_input
}
```

**Note on `correct_option_index`**: every `MCQQuestion` the backend sends
already includes the correct answer's index. Grading is always done
server-side (deterministic index comparison, never an LLM judgment call) -
the frontend never needs to know or check the answer itself, just collect
the learner's selected option text and POST it to the relevant `/submit`
route. Don't rely on this field being absent; it isn't hidden.

## 6. Key flows

### 6.1 Onboarding → assessment → roadmap generation

Drive the whole onboarding conversation through **one route**:

```
POST /chat  { session_id, message }
  -> { state, assistant_message }
```

This is stateful and resumable - the backend's LangGraph figures out from
`state.next_agent`/`state.awaiting_input` who should act next. You mostly
just: render `assistant_message` as a chat bubble, take the learner's next
message, POST it again. Two points in this flow have **structured
alternatives** to free-text (use these instead of trying to parse "yes"/
"no" out of chat):

- When `state.pending_checklist_concepts` is non-empty: render it as a
  checkbox list, then `POST /assessment/checklist/submit
  { session_id, confirmed_concepts: string[] }` instead of chatting.
- When `state.pending_quiz` is non-empty: render it as an MCQ form, then
  `POST /assessment/quiz/submit { session_id, answers: string[] }`
  (`results` in the response tells you per-question correct/incorrect).

Once the learner has a goal, trigger roadmap building explicitly:

```
POST /roadmap/generate/path-a { session_id }
  -> { roadmap, path_type }
```

This runs retrieval + LLM course selection + roadmap assembly all at
once (can take 10-30s) - show a loading state. `state.stage` becomes
`roadmap_review` when it's done. **Nothing is generated eagerly beyond
the topic list itself** - no project, no quiz, for any topic yet (see
6.2). The learner reviews the topic list (`roadmap.nodes`, already
prerequisite-ordered) and either:

- `POST /roadmap/confirm { session_id }` → locks it in, `stage` becomes
  `in_progress`, unlocks exactly the first topic.
- Edits first: `POST /roadmap/reorder`, `POST /roadmap/skip/{node_id}`,
  `POST /roadmap/node/add`, `PATCH /roadmap/node/{node_id}` - all
  restricted to nodes still `locked` (i.e., pre-confirm, everything is
  locked, so this is unrestricted at this stage).
- Or asks the AI to rebuild the topic list itself:
  `POST /roadmap/modify { session_id, instructions }` - free text, re-runs
  course selection (can change WHICH topics appear, not just wording).
  **Only works pre-confirm** (400 otherwise).

### 6.2 Working through a topic: subtopics → final quiz → project

This is the core loop, and it's **deliberately lazy** - nothing about a
topic beyond its name/summary is generated until the learner actually
reaches it, and within a topic, nothing beyond the current sub-concept is
generated until they get there. Budget your UI for this: expect
`project: null` and `assessment: null` on a freshly-unlocked topic, and
build toward revealing them.

1. The moment a topic becomes `available`, its `subtopics` array is
   populated (4-8 short items), first one `status: "available"`, the rest
   `"locked"`. No quiz exists yet for any of them.
2. For the current subtopic: `POST /topic/{node_id}/subtopic/{subtopic_id}/quiz/generate
   { session_id }` → generates (or returns, if already generated) a short
   quiz (`state.roadmap...subtopics[i].quiz`). This is your "Done
   Learning" action.
3. `POST /topic/{node_id}/subtopic/{subtopic_id}/quiz/submit
   { session_id, answers }` → `{ score, passed, results, state }`. Passing
   flips that subtopic to `"passed"` and the next one to `"available"`.
   Failing leaves it retryable (same questions, resubmit).
4. Alternatively, `POST /topic/{node_id}/subtopic/{subtopic_id}/skip
   { session_id }` - allowed any time a subtopic is `"available"`, no quiz
   needed. Per-subtopic skip is fine; the topic's own final quiz (next
   step) is **not** skippable.
5. Once **every** subtopic is `"passed"` or `"skipped"`, the backend
   automatically generates the topic's `project` and final `assessment`
   (one combined call) - this happens as a side effect of the last
   subtopic's submit/skip response, so just re-render from the `state` you
   get back. If a topic happens to have zero subtopics, this triggers
   immediately on unlock.
6. `POST /topic/{node_id}/assessment/submit { session_id, answers }` →
   `{ score, passed, node_status, results }`. Passing sets `node.status =
   "complete"`, unlocks the next topic, and is the single gate that also
   reveals the project (see below) - **note this response does NOT
   include the full `state`**, so re-fetch (`GET /state/{session_id}`) or
   keep local state in sync yourself if you need `node.project` to render
   immediately after.
7. `node.project` only becomes non-null once step 6 passes. Suggested UX
   (what the reference frontend does): show a locked/teaser card for both
   the final quiz and the project *before* they're reachable, so the
   learner always knows what's coming - lock icon + "unlocks once every
   sub-concept is done (`n`/`total`)" is enough, don't hide the section
   entirely.
8. Optional: `POST /topic/{node_id}/project/expand { session_id }` →
   `{ detailed_description }`, a longer step-by-step version, generated
   once and cached onto `project.detailed_description`.

Supporting routes for the topic page: `POST /topic/{node_id}/refresh-web`
(more web/YouTube resources, safe on any topic type), `POST
/topic/{node_id}/time { session_id, seconds }` (study timer, call
periodically e.g. every 30s while the page is open, not every second),
`PATCH /topic/{node_id}/notes { session_id, notes }` (private freeform
notes), `POST /roadmap/explain/{node_id} { session_id }` → `{ explanation
}` ("why is this topic in my roadmap" - one-off explainer call).

### 6.3 Mid-roadmap chat

Once `stage` is `roadmap_review` or `in_progress`, `POST /chat` stops
running the onboarding graph and instead answers via a lighter-weight
"Topic Tutor" grounded in whatever topic is currently `available`/
`in_progress`, plus the learner's resume/interests/knowledge-base context.
Same request/response shape as onboarding chat - you don't need to branch
your frontend logic on this, the backend handles the switch internally.

### 6.4 Regenerating / steering content with AI

Three related but distinct actions:

- `POST /roadmap/modify { session_id, instructions }` - pre-confirm only,
  re-picks topics (section 6.1).
- `POST /topic/{node_id}/regenerate { session_id, instructions? }` -
  post-confirm, rewrites ONE topic's project/quiz/subtopics from scratch
  (refused - 400 - if that topic is already `complete`). `instructions`
  is optional free text.
- `POST /roadmap/regenerate { session_id, instructions? }` - same, applied
  to every not-yet-`complete` topic at once.

All three, when `instructions` is provided, persist it onto
`learner_profile.roadmap_instructions` - so it keeps influencing content
generated later too (e.g. a topic that unlocks next week still honors it),
not just the one call.

### 6.5 Engagement features (new this round)

- **Streak**: `current_streak_days`/`longest_streak_days` on `AppState`,
  also surfaced pre-computed on `GET /dashboard/{session_id}`. Bumped
  server-side automatically by activity routes (time tracking, quiz
  submits) - nothing for the frontend to POST directly, just display it.
- **Badges**: `GET /dashboard/{session_id}` → `badges: {id, label, icon,
  achieved}[]` - six fixed badges (first topic, 5 sub-concepts, perfect
  quiz, 3-day streak, halfway, roadmap complete), all derived server-side.
- **Spaced-repetition review**: once a topic completes, it's scheduled for
  a quick one-question recall check a few days later (schedule: 3/7/14/30
  days, graduates after 4 correct answers in a row; a wrong answer resets
  to a 1-day interval without failing anything permanent).
  - `GET /review/due/{session_id}` → `{ due: [{node_id, topic}] }` - poll
    this on the dashboard.
  - `POST /review/{node_id}/generate { session_id }` → `{ question_index,
    question }` - reuses a question from that topic's own final quiz, no
    new LLM call.
  - `POST /review/{node_id}/submit { session_id, question_index, answer }`
    → `{ correct, result, next_review_at }`.

## 7. Profile, resume, and personalization

`PATCH /profile { session_id, ...fields }` - partial update, every field
optional, same shape as `LearnerProfile` (see section 5). Occupation
status must be exactly `"student"` or `"working_professional"` if
provided.

`POST /profile/resume` - **multipart form**, fields `session_id` (text)
and `file` (a PDF). Extracts text, stores it, and:
- Runs it through structured extraction and **auto-fills blank
  `LearnerProfile` fields only** (never overwrites something the learner
  already typed) - name, email, age, gender, occupation, role, goal,
  interests, skills, hobbies, certifications, prior history.
- Feeds a freeform knowledge-base extraction too (separate from the above -
  see `GET /knowledge/{session_id}` / `DELETE /knowledge/{entry_id}`,
  categorized facts the learner can review and remove).
- Stores the raw PDF bytes (authenticated users only - guest sessions
  don't persist the file, only the extracted text). Retrieve/display it
  via `GET /profile/resume/file/{session_id}` (returns the raw PDF,
  `Content-Type: application/pdf` - `<a href>` it directly, don't fetch-
  and-blob it).

`POST /context/import { session_id, imported_text }` - an alternate
personalization input: the learner pastes a summary they got from another
AI tool. Same knowledge-base extraction as resume upload.

All of the above (resume text, imported context, knowledge base entries)
feed into every subsequent LLM prompt automatically (onboarding chat,
mid-roadmap tutor, roadmap generation) - nothing further to wire up
once it's uploaded/imported.

## 8. Analytics

`GET /analytics/{session_id}` →
```ts
{
  quiz_pass_rate: number            // 0-1
  topics_completed_this_week: number
  total_time_spent_seconds: number
  topics_total, topics_completed: number
  average_score: number             // 0-1
  per_topic_time: { topic: string, seconds: number }[]
  skill_summary: { known, learned, claimed_unconfirmed, gap: number }
}
```
Scoped to Path-A dataset topics only (`path_type == "path_a_dataset"`) for
the topic-count fields - Path-B topics aren't counted toward "topics_total"
today.

## 9. Error handling conventions

- `404` - session/node/entity not found.
- `400` - a precondition wasn't met (e.g. submitting a quiz for a topic
  that isn't the current one, modifying a confirmed roadmap). The `detail`
  string is written to be shown to the learner as-is if you want.
- `502` - an LLM/search call failed after retries. Treat as "try again",
  not a validation problem - these are real external-API failures
  (rate limits, transient errors), not bugs to work around.
- No route ever throws an unhandled 500 for a bad LLM response - agents
  validate LLM output against a schema and retry once internally; a
  second failure surfaces as a 502, never malformed JSON reaching you.

## 10. Suggested screens (non-prescriptive - make it look good, this is just what needs a home)

- **Landing/marketing** - what the app does, sign up / log in.
- **Onboarding chat** - the `/chat` conversation, checklist, quiz.
- **Profile** - identity fields, learning profile, resume upload +
  viewer, knowledge-base review, "start a new goal."
- **Roadmap review** - the pre-confirm topic list/graph, edit actions,
  "Modify with AI," confirm button.
- **Dashboard** - progress %, current topic, streak, badges, due reviews,
  skill radar, roadmap list/graph, regenerate.
- **Topic detail** - the core loop from section 6.2: subtopics with
  locked/available/passed states, inline quizzes, locked final-quiz/
  project previews, resources, notes, timer.
- **Analytics** - the data from section 8, however you want to chart it.
- **Complete** - reached at 100%, restart-a-new-goal CTA.

The existing `frontend/src/pages/*` is a full working example of all of
these if you want a reference for interaction details (e.g. exactly when
a button should be disabled) - but the visual design is entirely open,
go make it good.
