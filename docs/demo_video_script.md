# LearnPath — Demo Video Script (narrated)

> For HCLTech AMPLIFIED Round 2 submission. ~4–5 minutes.
> Recording needs: screen capture + microphone. Before recording, make sure the
> backend (127.0.0.1:8000) and frontend (localhost:5173) are both running, and
> prep an account with a profile already completed (so demos don't stall on the
> gating) — but for the frist ~2 minutes leave the app in a fresh/guest state.

---

## 0. Opening (0:00–0:25) — Title card
**Visual:** Dark slide, "LearnPath — AI-Powered Personalized Learning Path Recommender".

**Narrator:**
> "Every online course platform can recommend a course. LearnPath does something different — it figures out *what you should learn next*, in the right order, and adapts as you go. Here's how it works."

---

## 1. The problem, in one sentence (0:25–0:50)
**Visual:** Cut to the landing page.

**Narrator:**
> "Learners don't fail from missing content — they fail from missing the right *sequence*. Two people with the same career goal need different paths based on what they already know. LearnPath is a closed-loop adaptive system: it profiles you, diagnoses your skill gaps, plans a prerequisite-ordered roadmap, verifies you learn, and visibly adapts."

---

## 2. Auth + profile (0:50–1:15)
**Visual:** Sign up / log in, land on Profile.

**Narrator:**
> "After a quick sign-up, LearnPath gating keeps the app focused: sections stay locked until your profile is complete — your goal, timeline, and background. In a real deployment this is where the Profiler Agent would have already filled it conversationally. For this demo, the profile is pre-filled so we can move fast."

---

## 3. Onboarding — Profiler Agent (1:15–1:45)
**Visual:** The onboarding chat. Type a natural-language goal.

**Narrator:**
> "The Profiler Agent is conversational — not a form. A learner types something like: *'I want to become a backend developer in three months — I already know JavaScript but I've never touched databases.'* The agent extracts the goal, the timeline, interests, and prior history into a structured learner profile in a single reply."

---

## 4. Skill assessment — Assessment Agent (1:45–2:20)
**Visual:** Concept checklist, then adaptive quiz.

**Narrator:**
> "Next, the Assessment Agent checks what's actually known. It shows concept checklists pulled from the course dataset, then runs a short adaptive quiz. Grading is *deterministic* — a shared grading module, never an LLM guessing pass or fail — so the skill-gap map is reliable: JavaScript is green, databases and HTTP are red."

---

## 5. The two-path recommendation (2:20–2:50)
**Visual:** Path A vs Path B explanation panel (or narrate over roadmap preview).

**Narrator:**
> "This goal maps cleanly onto our 80-course, 109,776-review dataset, so Path A is chosen: RAG retrieval finds candidate courses, an LLM confirms semantic fit, and a prerequisite graph with a topological sort guarantees order. For goals outside the catalog — say, 'system design' — Path B takes over and searches the live web and YouTube, synthesizing current resources. Both paths can even combine inside one roadmap: if a course needs an external concept like 'HTTP Basics', it becomes a live web node instead of a dead link."

---

## 6. Roadmap preview + Explainer (2:50–3:20)
**Visual:** Roadmap preview (React Flow). Click a node's "Why this?" button.

**Narrator:**
> "Here's the roadmap. Each node has prerequisites, a project, and an assessment. Click 'Why this?' and the Explainer Agent answers grounded in *this* learner's goal and gap map — not a generic LLM guess. The learner can reorder, skip, or add topics before confirming."

---

## 7. Learning + lazy content (3:20–3:50)
**Visual:** Topic detail page — expand a node, run a sub-concept quiz.

**Narrator:**
> "On confirm, exactly one topic unlocks at a time, in order. Each topic breaks into sub-concepts with short quizzes, a mandatory final assessment, and a hands-on project. Content is generated *lazily* — we don't spend LLM calls on modules you haven't reached yet."

---

## 8. Dashboard + adaptation (3:50–4:20)
**Visual:** Dashboard — progress bar, skill radar, next-action card.

**Narrator:**
> "Back on the dashboard you see progress, a skill radar of what you've gained versus what's left, and a 'next action' card. Crucially, the roadmap is *regenerable*: with one instruction — 'I want more focus on databases' — the system rebuilds the path while preserving completed topics. That's the adaptation the brief asks for."

---

## 9. Close (4:20–4:40) — Repo + docs
**Visual:** The GitHub repo / docs list, closing slide.

**Narrator:**
> "LearnPath is production-shaped: eight LangGraph agents, a RAG index built on real review data, multi-provider LLM failover, and full documentation. The repo and a deep-dive technical deck are linked. We don't just recommend what to learn — we continuously decide what you should learn next."

---

## Recording checklist
- [ ] Backend running: `uvicorn backend.api.main:app --host 127.0.0.1 --port 8000`
- [ ] Frontend running: `npm run dev` from `frontend/` → http://localhost:5173
- [ ] Account + pre-filled profile ready for the fast path; guest path for the open.
- [ ] /health returns all-green before recording (multi-provider failover visible).
- [ ] Capture at 1080p, ~60s per scene budget; total ≤ 5 minutes.
