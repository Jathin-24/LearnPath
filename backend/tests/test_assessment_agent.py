"""
test_assessment_agent.py

Isolated tests for each phase of the Assessment Agent (build order step 6),
fixed input, real LLM calls. Each phase is tested independently by
constructing the AppState a real conversation would have reached by that
point, per CLAUDE.md: "Test each in isolation (pytest, fixed input)."
"""

from backend.agents.assessment import CHECKLIST_MARKER, run_assessment
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ChatTurn,
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
    assert result.conversation_history[0].content.startswith(CHECKLIST_MARKER)
    assert result.next_agent == AgentName.DONE
    assert result.progress_log[-1].event_type == "checklist_presented"


def test_generate_quiz_phase_confirms_concepts_and_builds_quiz():
    state = AppState(session_id="test-assessment-quiz-gen")
    state.learner_profile.stated_known_skills = ["Python"]
    state.conversation_history = [
        ChatTurn(
            role="assistant",
            content=f"{CHECKLIST_MARKER}Concepts:\n- variables\n- loops\n- functions\n- conditionals",
        )
    ]
    state.last_user_message = "I know variables and loops well."

    result = run_assessment(state)

    confirmed = [a.concept for a in result.skill_gap_map.assessments]
    assert confirmed, "expected at least one concept confirmed"
    assert all(a.status == ConceptStatus.CLAIMED_UNCONFIRMED for a in result.skill_gap_map.assessments)
    assert len(result.pending_quiz) == len(result.skill_gap_map.assessments)
    assert result.next_agent == AgentName.DONE


def test_grade_quiz_phase_scores_deterministically():
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
        ),
        MCQQuestion(
            question="What does a for-loop do?",
            options=["Stores data", "Repeats a block of code", "Opens a file", "Sorts a list"],
            correct_option_index=1,
        ),
    ]
    state.last_user_message = "Question 1: A. Question 2: B."

    result = run_assessment(state)

    assert result.pending_quiz == []
    assert result.next_agent == AgentName.PATH_A
    assert result.skill_gap_map.assessments[0].status == ConceptStatus.KNOWN
    assert result.skill_gap_map.assessments[0].quiz_score == 1.0
    assert result.skill_gap_map.assessments[1].status == ConceptStatus.KNOWN
    assert result.skill_gap_map.assessments[1].quiz_score == 1.0


def test_grade_quiz_phase_marks_wrong_answers_as_gap():
    state = AppState(session_id="test-assessment-grade-wrong")
    state.skill_gap_map.assessments = [
        ConceptAssessment(concept="recursion", status=ConceptStatus.CLAIMED_UNCONFIRMED),
    ]
    state.pending_quiz = [
        MCQQuestion(
            question="What is recursion?",
            options=["A function calling itself", "A loop", "A variable", "A class"],
            correct_option_index=0,
        ),
    ]
    state.last_user_message = "I'll guess D."

    result = run_assessment(state)

    assert result.skill_gap_map.assessments[0].status == ConceptStatus.GAP
    assert result.skill_gap_map.assessments[0].quiz_score == 0.0
