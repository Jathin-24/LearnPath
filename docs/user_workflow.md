# Complete User Workflow — Personalized Learning Path Recommender

See `user_workflow.mermaid` for the visual flow. This doc walks through what
the user actually sees and does at each stage, and which agent handles it.

---

## 1. Landing Page
Simple value prop + "Get Started." No fake urgency, no forced upsell page
(unlike the rough wireframe you sketched — we skip the "Page2 try-now" detour;
it doesn't map to any real functionality, just adds friction).

## 2. Auth (Sign Up / Login)
Supabase auth (free tier). Returning users skip straight to Dashboard with
their existing profile and roadmap state intact.

## 3. Onboarding Chat — **Profiler Agent**
Conversational, not a form. User types their goal in natural language
("I want to become a backend developer in 3 months"). Agent extracts:
- Goal / target role
- Timeline
- Interests
- Any prior learning history they mention

This becomes the first fields in the shared learner-state object.

## 4. Skill Assessment — **Assessment Agent**
Two-step, as you designed:
1. User names skills they already have (e.g. "I know HTML")
2. For each named skill, a **concept checklist** is shown (pulled from
   `enriched_courses.json` concept tags) — user ticks what they actually know
3. A short **adaptive quiz** (3–5 questions) on the ticked concepts, to catch
   over-reporting
4. Output: a skill-gap map (concepts known vs. missing) written to shared state

## 5. Path Selection
The router (using RAG match confidence against the 80-course dataset)
decides whether to offer:
- **Path A (Dataset-Grounded)** — goal maps well to existing courses
- **Path B (Open/Web-Sourced)** — goal falls outside dataset coverage (e.g.
  "system design"), so Path-B Agent searches web/YouTube and synthesizes
- **Both** — shown side by side, user picks, if it's ambiguous

## 6. Roadmap Generation
- **Path A**: Path-A Agent does RAG retrieval + walks the prerequisite graph
  → sequenced list of courses with projects/assessments per topic
- **Path B**: Path-B Agent pulls YouTube roadmap videos + transcripts, web
  search for current best practices → synthesized topic sequence with
  YouTube links, cheat sheets, and notes
- Roadmap Generator merges either into one structure: **topic nodes**, each
  with prerequisites, a project, and an assessment attached

## 7. Roadmap Preview Page
Visual graph (React Flow) of topic nodes and their dependencies. Each node
has a **"Why this?"** button → calls the **Explainer Agent**, which answers
grounded in the user's stated goal + skill-gap map (not a generic LLM
guess). User can edit/reorder before confirming.

## 8. Dashboard (main hub after first roadmap is built)
- Progress bar / % complete
- Skill radar chart (skills gained vs. gaps remaining)
- Roadmap view with current topic highlighted
- "Next recommended action" card

## 9. Topic Detail Page (one per roadmap node)
- **Path A topics**: course card (title, summary, strengths/weaknesses from
  reviews, search link)
- **Path B topics**: YouTube links/channels, cheat sheet, curated notes
- A **project** assignment for that topic
- An **assessment/quiz** for that topic
- Persistent chat sidebar to the Explainer Agent for any question

## 10. Assessment Scoring
Assessment Agent scores the quiz. Pass → topic marked complete, skill-gap
map updates, state persists. Fail → remediation resource suggested, retry
loop back to the topic page (this is the "adapt based on feedback" piece
the brief asks for).

## 11. Loop Back to Dashboard
After each topic completion, user returns to Dashboard, sees updated
progress, and the "next recommended action" advances to the next node.

## 12. Roadmap Complete Page
Summary of skills gained, option to start a new goal (loops back to step 3
with the existing profile retained, not reset).

---

## Where each agent sits in this flow
| Agent | Pages it powers |
|---|---|
| Profiler | Onboarding chat |
| Assessment | Skill assessment, topic quizzes, scoring |
| Path-A | Roadmap generation (dataset route) |
| Path-B | Roadmap generation (web-sourced route) |
| Project Generator | Topic detail pages |
| Explainer | "Why this?" buttons, chat sidebar everywhere |
| Orchestrator | Routes between all of the above via shared state |
