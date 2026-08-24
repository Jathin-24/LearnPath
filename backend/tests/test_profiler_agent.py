"""
test_profiler_agent.py

Isolated test for the Profiler Agent (build order step 6), fixed input, real
LLM call against the configured free-tier endpoints - per CLAUDE.md: "Test
each in isolation (pytest, fixed input) before wiring into the graph."
"""

from backend.agents.profiler import run_profiler
from backend.orchestrator.state_schema import AgentName, AppState, ConversationStage


def test_profiler_extracts_goal_from_first_message():
    state = AppState(session_id="test-profiler")
    state.last_user_message = "I want to become a backend developer in 3 months."

    result = run_profiler(state)

    assert result.learner_profile.goal, "expected a goal to be extracted"
    assert len(result.conversation_history) == 2
    assert result.conversation_history[0].role == "user"
    assert result.conversation_history[1].role == "assistant"
    assert len(result.progress_log) == 1
    assert result.progress_log[0].agent == AgentName.PROFILER
    assert result.next_agent in (AgentName.ASSESSMENT, AgentName.PROFILER)
    if result.next_agent == AgentName.ASSESSMENT:
        assert result.stage == ConversationStage.ASSESSMENT
        assert result.awaiting_input is False
    else:
        assert result.awaiting_input is True  # paused, resumes at PROFILER next turn


def test_profiler_merges_across_turns_without_duplicating():
    state = AppState(session_id="test-profiler-2")
    state.learner_profile.goal = "become a backend developer"
    state.learner_profile.interests = ["APIs"]
    state.last_user_message = "I already know Python basics and I'm also interested in databases."

    result = run_profiler(state)

    assert result.learner_profile.goal == "become a backend developer"
    assert "APIs" in result.learner_profile.interests  # not dropped
    assert len(result.learner_profile.interests) == len(set(result.learner_profile.interests))
