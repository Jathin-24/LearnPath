"""
test_graph_resume.py

Regression test for the conditional-entry-point fix in graph.py: a session
that paused mid-flow (next_agent != PROFILER) must resume at that node on the
next graph.invoke() call, not restart from Profiler. This is exactly what
/chat does across multiple HTTP requests for the same session_id.
"""

from backend.orchestrator.graph import build_stub_graph
from backend.orchestrator.state_schema import AgentName, AppState


def test_graph_resumes_at_paused_node_instead_of_restarting_profiler():
    graph = build_stub_graph()

    state = AppState(session_id="test-resume")
    state.next_agent = AgentName.PATH_A  # simulate a session paused mid-flow

    result = graph.invoke(state)

    visited = [event.agent for event in result["progress_log"]]
    assert visited == [AgentName.PATH_A, AgentName.ROADMAP_GENERATOR]
    assert AgentName.PROFILER not in visited
    assert AgentName.ASSESSMENT not in visited
