"""
test_graph_with_real_profiler.py

Wires the real Profiler and Assessment agents into the graph (build_graph,
not build_stub_graph) and confirms the flow still runs end to end (through
whatever remaining stub agents get reached) without breaking. Real LLM calls.
"""

from backend.orchestrator.graph import build_graph
from backend.orchestrator.state_schema import AgentName, AppState


def test_real_profiler_then_stub_chain_terminates():
    graph = build_graph()
    state = AppState(session_id="test-real-graph")
    state.last_user_message = "I want to become a backend developer in 3 months."

    result = graph.invoke(state)

    assert result["learner_profile"].goal, "expected Profiler to extract a goal"

    visited = [event.agent for event in result["progress_log"]]
    assert visited[0] == AgentName.PROFILER
    if len(visited) > 1:
        assert visited[1] == AgentName.ASSESSMENT

    # Either the graph paused mid-conversation (next_agent points at whichever
    # agent should resume, awaiting_input=True) or it cascaded all the way
    # through to a genuine terminal DONE (Roadmap Generator finished).
    if result["awaiting_input"]:
        assert result["next_agent"] in (AgentName.PROFILER, AgentName.ASSESSMENT)
    else:
        assert result["next_agent"] == AgentName.DONE
