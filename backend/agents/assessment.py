"""
assessment.py

Assessment Agent: two-phase skill-gap check driven off
learner_profile.stated_known_skills.

  1. present_checklist - RAG-retrieve concepts tied to the skills the learner
     claimed, present as a checklist, pause for a structured confirmation
     (see state.pending_checklist_concepts).
  2. submit_checklist_concepts - given the learner's confirmed concepts
     (a plain list, chosen via checkboxes in the frontend - no LLM guessing
     involved), generate a short adaptive MCQ quiz over those concepts
     (held in state.pending_quiz), pause for structured answers.

Grading (grade_pending_quiz) is deterministic: it compares the learner's
selected options against MCQQuestion.correct_option_index. Never an LLM
judgment call on correctness itself - per docs/final_decisions.md
("auto-gradable, deterministic, no LLM-as-judge grading step").

Both the checklist confirmation and the quiz answers arrive as structured
data via dedicated routes (backend/api/main.py's
POST /assessment/checklist/submit and POST /assessment/quiz/submit), not
as free-text chat messages parsed by an extra LLM call - a learner who
ticks two checkboxes and hits "Confirm" shouldn't need an LLM to guess
which two concepts they meant, and a misparse there used to mean silently
wrong skill-gap data. run_assessment() itself only handles the initial
checklist presentation; once state.pending_checklist_concepts or
state.pending_quiz is set, it just stays paused until the frontend calls
the matching dedicated route (see module docstring in main.py).
"""

import json

from pydantic import BaseModel, ValidationError

from backend.common.grading import grade_mcq_batch
from backend.common.llm_client import LLMClient
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ChatTurn,
    ConceptAssessment,
    ConceptStatus,
    MCQQuestion,
)
from backend.rag.retriever import retrieve

MAX_CHECKLIST_CONCEPTS = 15
MAX_QUIZ_QUESTIONS = 5


def _parse_json(raw_text: str) -> dict:
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def _gather_candidate_concepts(state: AppState) -> dict[str, str]:
    """concept -> source course name, deduped, capped."""
    concepts: dict[str, str] = {}
    skills = state.learner_profile.stated_known_skills or (
        [state.learner_profile.goal] if state.learner_profile.goal else []
    )
    for skill in skills:
        for course in retrieve(skill, k=2):
            for concept in course.get("concepts", []):
                concepts.setdefault(concept, course["course_name"])
                if len(concepts) >= MAX_CHECKLIST_CONCEPTS:
                    return concepts
    return concepts


def _present_checklist(state: AppState) -> AppState:
    candidates = _gather_candidate_concepts(state)
    if not candidates:
        state.log(AgentName.ASSESSMENT, "checklist_skipped", "no matching dataset concepts")
        state.next_agent = AgentName.PATH_A
        state.awaiting_input = False
        return state

    state.pending_checklist_concepts = list(candidates.keys())
    reply = "Quick check before we build your roadmap - tap anything below you're already confident with."
    state.conversation_history.append(ChatTurn(role="assistant", content=reply))
    state.log(AgentName.ASSESSMENT, "checklist_presented", detail=f"{len(candidates)} concepts")
    # Pause here, waiting for a structured confirmation via
    # POST /assessment/checklist/submit - next_agent points at ASSESSMENT
    # itself so a resumed /chat call (if one somehow arrives first) re-enters
    # here rather than restarting or silently terminating (see graph.py).
    state.next_agent = AgentName.ASSESSMENT
    state.awaiting_input = True
    return state


class QuizGenerationOutput(BaseModel):
    questions: list[MCQQuestion]


def _build_quiz_prompt(concepts: list[str]) -> str:
    return f"""Generate a short multiple-choice quiz to verify whether a learner genuinely \
knows these concepts (they claimed to, and self-report is unreliable): {json.dumps(concepts)}

Write exactly {len(concepts)} questions, ONE per concept, in the SAME ORDER as the list above. \
Each question needs exactly 4 options, a 0-indexed correct_option_index, and a one-sentence \
explanation of why that answer is correct (shown to the learner if they get it wrong). Keep \
questions practical, not trivia.

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "questions": [
    {{"question": "...", "options": ["...", "...", "...", "..."], "correct_option_index": 0, \
"explanation": "..."}}
  ]
}}"""


def _call_llm_for_quiz(client: LLMClient, concepts: list[str]) -> QuizGenerationOutput:
    prompt = _build_quiz_prompt(concepts)

    def attempt(p: str) -> QuizGenerationOutput:
        output = QuizGenerationOutput.model_validate(_parse_json(client.complete(p, max_tokens=1500)))
        if len(output.questions) != len(concepts):
            raise ValueError(f"expected {len(concepts)} questions, got {len(output.questions)}")
        return output

    try:
        return attempt(prompt)
    except (json.JSONDecodeError, ValidationError, ValueError):
        stricter = prompt + (
            f"\n\nYou MUST return exactly {len(concepts)} questions, one per concept, in the "
            "same order. Respond with ONLY valid JSON."
        )
        return attempt(stricter)  # let this raise if it fails again - fail loud


def submit_checklist_concepts(
    state: AppState, confirmed_concepts: list[str], client: LLMClient
) -> AppState:
    """Called from POST /assessment/checklist/submit with a plain list of
    concept strings the learner ticked - deterministic membership check
    against what was actually offered, no LLM involved in this step."""
    candidates = set(state.pending_checklist_concepts)
    confirmed = [c for c in confirmed_concepts if c in candidates][:MAX_QUIZ_QUESTIONS]
    state.pending_checklist_concepts = []

    state.conversation_history.append(
        ChatTurn(
            role="user",
            content=f"I already know: {', '.join(confirmed)}" if confirmed else "None of these yet",
        )
    )

    if not confirmed:
        state.log(AgentName.ASSESSMENT, "no_concepts_confirmed", "")
        reply = "No worries - we'll build your roadmap from scratch on these topics."
        state.conversation_history.append(ChatTurn(role="assistant", content=reply))
        state.next_agent = AgentName.PATH_A
        state.awaiting_input = False
        return state

    course_by_concept = _gather_candidate_concepts(state)
    for concept in confirmed:
        state.skill_gap_map.assessments.append(
            ConceptAssessment(
                concept=concept,
                status=ConceptStatus.CLAIMED_UNCONFIRMED,
                source_course=course_by_concept.get(concept),
            )
        )

    quiz = _call_llm_for_quiz(client, confirmed)
    state.pending_quiz = quiz.questions

    reply = f"Let's confirm with a quick {len(quiz.questions)}-question quiz."
    state.conversation_history.append(ChatTurn(role="assistant", content=reply))
    state.log(AgentName.ASSESSMENT, "quiz_generated", detail=f"{len(quiz.questions)} questions")
    # Pause here, waiting for structured answers via
    # POST /assessment/quiz/submit (see grade_pending_quiz below).
    state.next_agent = AgentName.ASSESSMENT
    state.awaiting_input = True
    return state


def grade_pending_quiz(state: AppState, answers: list[str]) -> list[dict]:
    """Called from POST /assessment/quiz/submit. Mutates state in place
    (skill_gap_map, conversation_history, pending_quiz) and returns a
    per-question results list for remediation display - deterministic
    exact-match grading via grade_mcq_batch, same as the topic checkpoint
    quiz in main.py."""
    questions = state.pending_quiz
    score, results = grade_mcq_batch(questions, answers)

    # The last n assessments are exactly the CLAIMED_UNCONFIRMED entries this
    # quiz covers - appended in the same order the quiz was generated in.
    pending_assessments = state.skill_gap_map.assessments[-len(questions):]
    for assessment, result in zip(pending_assessments, results):
        assessment.quiz_score = 1.0 if result["correct"] else 0.0
        assessment.status = ConceptStatus.KNOWN if result["correct"] else ConceptStatus.GAP

    n = len(questions)
    correct_count = round(score * n)
    score_pct = round(score * 100)
    reply = (
        f"You got {correct_count}/{n} right ({score_pct}%). "
        + ("A few gaps to cover in your roadmap - that's exactly what it's for."
           if correct_count < n else "Great, no gaps from this round!")
    )
    state.conversation_history.append(ChatTurn(role="assistant", content=reply))
    state.log(AgentName.ASSESSMENT, "quiz_graded", detail=f"{correct_count}/{n} correct")
    state.pending_quiz = []
    return results


def run_assessment(state: AppState, llm_client: LLMClient | None = None) -> AppState:
    if state.pending_quiz or state.pending_checklist_concepts:
        # Waiting on a structured submission via a dedicated route (see
        # module docstring) - not free-text chat. Stay paused; this only
        # happens if /chat is somehow called during this window instead of
        # the expected checkbox/quiz UI.
        state.log(AgentName.ASSESSMENT, "chat_ignored_awaiting_structured_input", "")
        state.next_agent = AgentName.ASSESSMENT
        state.awaiting_input = True
        return state

    return _present_checklist(state)
