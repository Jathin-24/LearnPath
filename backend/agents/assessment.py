"""
assessment.py

Assessment Agent: three-phase skill-gap check driven off
learner_profile.stated_known_skills.

  1. present_checklist - RAG-retrieve concepts tied to the skills the learner
     claimed, present as a checklist, pause for the learner's reply.
  2. generate_quiz - parse which concepts the learner actually confirmed
     (ConceptAssessment status=CLAIMED_UNCONFIRMED), generate a short adaptive
     MCQ quiz over those concepts (held in state.pending_quiz - see
     state_schema.py for why that field exists), pause for answers.
  3. grade_quiz - deterministic auto-grading: compare the learner's selected
     options against MCQQuestion.correct_option_index. Never an LLM judgment
     call on correctness itself - only extraction of which option the learner
     picked - per docs/final_decisions.md ("auto-gradable, deterministic, no
     LLM-as-judge grading step").

Phase is derived entirely from AppState, no extra flags: pending_quiz
non-empty means "grade"; the last assistant turn's marker plus a new user
reply means "generate_quiz"; otherwise "present_checklist".
"""

import json

from pydantic import BaseModel, ValidationError

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

CHECKLIST_MARKER = "[ASSESSMENT:CHECKLIST]"
QUIZ_MARKER = "[ASSESSMENT:QUIZ]"
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
        return state

    bullet_list = "\n".join(f"- {c}" for c in candidates)
    reply = (
        f"{CHECKLIST_MARKER}Based on what you've told me, here are some concepts related "
        f"to your stated skills:\n{bullet_list}\n\nWhich of these do you actually know? "
        "List them, or say 'none of these' if you're not confident on any."
    )
    state.conversation_history.append(ChatTurn(role="assistant", content=reply))
    state.log(AgentName.ASSESSMENT, "checklist_presented", detail=f"{len(candidates)} concepts")
    state.next_agent = AgentName.DONE
    return state


class ConfirmedConceptsOutput(BaseModel):
    confirmed_concepts: list[str]


def _extract_confirmed_concepts(user_reply: str, candidates: list[str], client: LLMClient) -> list[str]:
    prompt = f"""A learner was shown this checklist of concepts and asked which they actually know:
{json.dumps(candidates)}

Their reply: "{user_reply}"

Respond with ONLY a JSON object (no markdown fences, no preamble):
{{"confirmed_concepts": ["exact strings from the checklist above that the learner confirmed they know"]}}
If they said none, return an empty list. Only include exact matches from the checklist."""

    try:
        output = ConfirmedConceptsOutput.model_validate(_parse_json(client.complete(prompt, max_tokens=400)))
    except (json.JSONDecodeError, ValidationError):
        stricter = prompt + "\n\nRespond with ONLY valid JSON, nothing else."
        output = ConfirmedConceptsOutput.model_validate(_parse_json(client.complete(stricter, max_tokens=400)))

    return [c for c in output.confirmed_concepts if c in candidates]


class QuizGenerationOutput(BaseModel):
    questions: list[MCQQuestion]


def _build_quiz_prompt(concepts: list[str]) -> str:
    return f"""Generate a short multiple-choice quiz to verify whether a learner genuinely \
knows these concepts (they claimed to, and self-report is unreliable): {json.dumps(concepts)}

Write exactly {len(concepts)} questions, ONE per concept, in the SAME ORDER as the list above. \
Each question needs exactly 4 options and a 0-indexed correct_option_index. Keep questions \
practical, not trivia.

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "questions": [
    {{"question": "...", "options": ["...", "...", "...", "..."], "correct_option_index": 0}}
  ]
}}"""


def _call_llm_for_quiz(client: LLMClient, concepts: list[str]) -> QuizGenerationOutput:
    prompt = _build_quiz_prompt(concepts)

    def attempt(p: str) -> QuizGenerationOutput:
        output = QuizGenerationOutput.model_validate(_parse_json(client.complete(p, max_tokens=1200)))
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


def _generate_quiz(state: AppState, client: LLMClient) -> AppState:
    if state.last_user_message:
        state.conversation_history.append(ChatTurn(role="user", content=state.last_user_message))

    candidates = _gather_candidate_concepts(state)
    confirmed = _extract_confirmed_concepts(state.last_user_message or "", list(candidates.keys()), client)
    confirmed = confirmed[:MAX_QUIZ_QUESTIONS]

    if not confirmed:
        state.log(AgentName.ASSESSMENT, "no_concepts_confirmed", "")
        reply = f"{QUIZ_MARKER}No worries - we'll build your roadmap from scratch on these topics."
        state.conversation_history.append(ChatTurn(role="assistant", content=reply))
        state.next_agent = AgentName.PATH_A
        return state

    for concept in confirmed:
        state.skill_gap_map.assessments.append(
            ConceptAssessment(
                concept=concept,
                status=ConceptStatus.CLAIMED_UNCONFIRMED,
                source_course=candidates.get(concept),
            )
        )

    quiz = _call_llm_for_quiz(client, confirmed)
    state.pending_quiz = quiz.questions

    question_lines = []
    for i, q in enumerate(quiz.questions, 1):
        opts = "\n".join(f"   {chr(65 + j)}. {opt}" for j, opt in enumerate(q.options))
        question_lines.append(f"{i}. {q.question}\n{opts}")
    reply = (
        f"{QUIZ_MARKER}Let's confirm with a quick quiz:\n\n"
        + "\n\n".join(question_lines)
        + "\n\nReply with your answers, e.g. '1: B, 2: A, 3: C'."
    )
    state.conversation_history.append(ChatTurn(role="assistant", content=reply))
    state.log(AgentName.ASSESSMENT, "quiz_generated", detail=f"{len(quiz.questions)} questions")
    state.next_agent = AgentName.DONE
    return state


class SelectedOptionsOutput(BaseModel):
    selected_option_indices: list[int]


def _extract_selected_options(user_reply: str, n: int, client: LLMClient) -> list[int]:
    prompt = f"""A learner was given a {n}-question multiple choice quiz (options labeled \
A, B, C, D = indices 0, 1, 2, 3) and replied with their answers: "{user_reply}"

Extract which option index (0-3) they selected for each of the {n} questions, in order. \
Use -1 if their answer for a question is missing or unclear.

Respond with ONLY a JSON object (no markdown fences, no preamble):
{{"selected_option_indices": [list of exactly {n} integers, each 0-3 or -1]}}"""

    def attempt(p: str) -> list[int]:
        output = SelectedOptionsOutput.model_validate(_parse_json(client.complete(p, max_tokens=300)))
        if len(output.selected_option_indices) != n:
            raise ValueError("length mismatch")
        return output.selected_option_indices

    try:
        return attempt(prompt)
    except (json.JSONDecodeError, ValidationError, ValueError):
        stricter = prompt + f"\n\nYou MUST return exactly {n} integers. Respond with ONLY valid JSON."
        return attempt(stricter)  # fail loud on 2nd failure


def _grade_quiz(state: AppState, client: LLMClient) -> AppState:
    if state.last_user_message:
        state.conversation_history.append(ChatTurn(role="user", content=state.last_user_message))

    n = len(state.pending_quiz)
    selections = _extract_selected_options(state.last_user_message or "", n, client)

    # The last n assessments are exactly the CLAIMED_UNCONFIRMED entries this
    # quiz covers - appended in the same order the quiz was generated in.
    pending_assessments = state.skill_gap_map.assessments[-n:]

    correct = 0
    for assessment, question, selected_idx in zip(pending_assessments, state.pending_quiz, selections):
        is_correct = selected_idx == question.correct_option_index
        assessment.quiz_score = 1.0 if is_correct else 0.0
        assessment.status = ConceptStatus.KNOWN if is_correct else ConceptStatus.GAP
        if is_correct:
            correct += 1

    score_pct = round(100 * correct / n) if n else 0
    reply = (
        f"You got {correct}/{n} right ({score_pct}%). "
        + ("A few gaps to cover in your roadmap - that's exactly what it's for."
           if correct < n else "Great, no gaps from this round!")
    )
    state.conversation_history.append(ChatTurn(role="assistant", content=reply))
    state.log(AgentName.ASSESSMENT, "quiz_graded", detail=f"{correct}/{n} correct")
    state.pending_quiz = []
    state.next_agent = AgentName.PATH_A
    return state


def run_assessment(state: AppState, llm_client: LLMClient | None = None) -> AppState:
    client = llm_client or LLMClient()

    if state.pending_quiz:
        return _grade_quiz(state, client)

    last_assistant = next(
        (turn for turn in reversed(state.conversation_history) if turn.role == "assistant"), None
    )
    if last_assistant and last_assistant.content.startswith(CHECKLIST_MARKER) and state.last_user_message:
        return _generate_quiz(state, client)

    return _present_checklist(state)
