"""
test_assessment_agent.py

Isolated tests for each phase of the Assessment Agent, fixed input, real LLM
calls where an LLM is actually involved. Checklist confirmation and quiz
grading are now structured (no free-text parsing - see assessment.py's
module docstring), so those two phases are pure/deterministic and don't
need an LLM at all; only quiz generation does.
"""

from backend.agents.assessment import grade_pending_quiz, run_assessment, submit_checklist_concepts
from backend.common.llm_client import LLMClient
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ConceptAssessment,
    ConceptStatus,
    MCQQuestion,
)


def test_present_checklist_phase():
    state = AppState(session_id="test-assessment-checklist")
    state.learner_profile.stated_known_skills = ["Python"]

    result = run_assessment(state)

    assert len(result.conversation_history) == 1
    assert result.conversation_history[0].role == "assistant"
    assert result.pending_checklist_concepts, "expected candidate concepts to be offered"
    assert result.next_agent == AgentName.ASSESSMENT
    assert result.awaiting_input is True
    assert result.progress_log[-1].event_type == "checklist_presented"


def test_submit_checklist_concepts_confirms_and_builds_quiz():
    state = AppState(session_id="test-assessment-quiz-gen")
    state.learner_profile.stated_known_skills = ["Python"]
    state.pending_checklist_concepts = ["variables", "loops", "functions", "conditionals"]

    result = submit_checklist_concepts(state, ["variables", "loops"], LLMClient())

    assert result.pending_checklist_concepts == []
    confirmed = [a.concept for a in result.skill_gap_map.assessments]
    assert confirmed == ["variables", "loops"]
    assert all(a.status == ConceptStatus.CLAIMED_UNCONFIRMED for a in result.skill_gap_map.assessments)
    assert len(result.pending_quiz) == 2
    assert result.next_agent == AgentName.ASSESSMENT
    assert result.awaiting_input is True


def test_submit_checklist_concepts_ignores_options_not_offered():
    state = AppState(session_id="test-assessment-quiz-gen-filter")
    state.pending_checklist_concepts = ["variables", "loops"]

    result = submit_checklist_concepts(state, ["variables", "something-not-offered"], LLMClient())

    confirmed = [a.concept for a in result.skill_gap_map.assessments]
    assert confirmed == ["variables"]


def test_submit_checklist_concepts_handles_none_confirmed():
    state = AppState(session_id="test-assessment-quiz-gen-none")
    state.pending_checklist_concepts = ["variables", "loops"]

    result = submit_checklist_concepts(state, [], LLMClient())

    assert result.pending_quiz == []
    assert result.skill_gap_map.assessments == []
    assert result.next_agent == AgentName.PATH_A
    assert result.awaiting_input is False


def test_grade_pending_quiz_scores_deterministically():
    state = AppState(session_id="test-assessment-grade")
    state.skill_gap_map.assessments = [
        ConceptAssessment(concept="variables", status=ConceptStatus.CLAIMED_UNCONFIRMED),
        ConceptAssessment(concept="loops", status=ConceptStatus.CLAIMED_UNCONFIRMED),
    ]
    state.pending_quiz = [
        MCQQuestion(
            question="What is a variable used for?",
            options=["Storing data", "Repeating code", "Defining a class", "Importing a module"],
            correct_option_index=0,
            explanation="Variables store data for later use.",
        ),
        MCQQuestion(
            question="What does a for-loop do?",
            options=["Stores data", "Repeats a block of code", "Opens a file", "Sorts a list"],
            correct_option_index=1,
            explanation="A for-loop repeats a block of code.",
        ),
    ]

    results = grade_pending_quiz(state, ["Storing data", "Repeats a block of code"])

    assert state.pending_quiz == []
    assert state.skill_gap_map.assessments[0].status == ConceptStatus.KNOWN
    assert state.skill_gap_map.assessments[0].quiz_score == 1.0
    assert state.skill_gap_map.assessments[1].status == ConceptStatus.KNOWN
    assert state.skill_gap_map.assessments[1].quiz_score == 1.0
    assert all(r["correct"] for r in results)


def test_grade_pending_quiz_marks_wrong_answers_as_gap():
    state = AppState(session_id="test-assessment-grade-wrong")
    state.skill_gap_map.assessments = [
        ConceptAssessment(concept="recursion", status=ConceptStatus.CLAIMED_UNCONFIRMED),
    ]
    state.pending_quiz = [
        MCQQuestion(
            question="What is recursion?",
            options=["A function calling itself", "A loop", "A variable", "A class"],
            correct_option_index=0,
            explanation="Recursion is when a function calls itself.",
        ),
    ]

    results = grade_pending_quiz(state, ["A class"])

    assert state.skill_gap_map.assessments[0].status == ConceptStatus.GAP
    assert state.skill_gap_map.assessments[0].quiz_score == 0.0
    assert results[0]["correct"] is False
    assert results[0]["correct_answer"] == "A function calling itself"
    assert results[0]["explanation"] == "Recursion is when a function calls itself."


def test_run_assessment_stays_paused_if_chat_called_mid_structured_phase():
    """Defensive case: /chat somehow gets called while pending_quiz or
    pending_checklist_concepts is set (shouldn't happen with the UI hiding
    the composer, but must not crash or misbehave if it does)."""
    state = AppState(session_id="test-assessment-defensive-pause")
    state.pending_checklist_concepts = ["variables"]

    result = run_assessment(state)

    assert result.pending_checklist_concepts == ["variables"]
    assert result.next_agent == AgentName.ASSESSMENT
    assert result.awaiting_input is True
