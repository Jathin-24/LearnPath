"""
test_multi_turn_chat_resume.py

Regression test for the exact bug caught during live browser testing: a
second /chat-style graph.invoke() call on a session paused mid-Assessment
was being silently dropped (next_agent="done" was reused as both "pause
signal" and "resume target", so the conditional entry point routed straight
to END instead of back into Assessment). Simulates two sequential
graph.invoke() calls the way /chat actually does it - not a single call like
the other graph tests.
"""

from backend.orchestrator.graph import build_graph
from backend.orchestrator.state_schema import AgentName, AppState, ChatTurn


def test_second_invoke_resumes_assessment_instead_of_terminating():
    graph = build_graph()

    # Simulate exactly what db.save_state/load_state round-trips after a
    # first /chat call left the session paused at the checklist step.
    state = AppState(session_id="test-multi-turn-resume")
    state.learner_profile.stated_known_skills = ["Python"]
    state.conversation_history = [
        ChatTurn(
            role="assistant",
            content="[ASSESSMENT:CHECKLIST]Concepts:\n- variables\n- loops\n- functions",
        )
    ]
    state.next_agent = AgentName.ASSESSMENT
    state.awaiting_input = True
    state.last_user_message = "I know variables and loops."

    result = graph.invoke(state)

    visited = [event.agent for event in result["progress_log"]]
    assert AgentName.ASSESSMENT in visited, (
        "second invoke() must actually run Assessment again, not silently "
        "terminate because next_agent was 'done'"
    )
    assert len(result["pending_quiz"]) > 0, "expected the quiz-generation phase to have run"
