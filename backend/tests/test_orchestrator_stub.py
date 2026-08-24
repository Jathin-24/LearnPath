"""
test_orchestrator_stub.py

Proves the LangGraph routing works (build order step 5) before any agent has
real logic: a fresh AppState should flow through all 4 stub nodes in order
and terminate. (Explainer is intentionally not part of this chain - see
graph.py docstring: it's an on-demand, per-node route, not a sequential step.)
"""

from backend.orchestrator.graph import build_stub_graph
from backend.orchestrator.state_schema import AgentName, AppState


def test_stub_graph_visits_all_agents_in_order_and_terminates():
    graph = build_stub_graph()
    state = AppState(session_id="test-session")

    result = graph.invoke(state)

    visited = [event.agent for event in result["progress_log"]]
    assert visited == [
        AgentName.PROFILER,
        AgentName.ASSESSMENT,
        AgentName.PATH_A,
        AgentName.ROADMAP_GENERATOR,
    ]
    assert result["next_agent"] == AgentName.DONE
