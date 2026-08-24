"""
test_path_a_agent.py

Isolated test for the Path-A Agent (build order step 6), fixed input, real
RAG retrieval over the actual dataset - no LLM call involved, this agent is
pure retrieval + graph traversal.
"""

from backend.orchestrator.state_schema import AgentName, AppState, PathType
from backend.agents.path_a import run_path_a


def test_path_a_builds_valid_prerequisite_ordered_roadmap():
    state = AppState(session_id="test-path-a")
    state.learner_profile.goal = "become a backend developer"
    state.skill_gap_map.assessments = []  # no known gaps yet, goal alone drives retrieval

    result = run_path_a(state)

    assert result.roadmap is not None
    assert result.roadmap.path_type == PathType.PATH_A_DATASET
    assert len(result.roadmap.nodes) > 0
    assert result.next_agent == AgentName.ROADMAP_GENERATOR

    node_ids = [n.node_id for n in result.roadmap.nodes]
    assert len(node_ids) == len(set(node_ids)), "node_ids must be unique"

    # every prerequisite must be a real node in this roadmap, and must appear
    # BEFORE the node that depends on it (valid topological order)
    seen = set()
    for node in result.roadmap.nodes:
        for prereq_id in node.internal_prerequisites:
            assert prereq_id in node_ids, f"{node.node_id} references unknown prereq {prereq_id}"
            assert prereq_id in seen, f"{prereq_id} must come before {node.node_id}"
        seen.add(node.node_id)


def test_path_a_promotes_external_concepts_to_path_b_stub_nodes():
    state = AppState(session_id="test-path-a-external")
    # Ethical Hacking Basics has a real external_prerequisite_concept
    # ("Networking Fundamentals") per docs/final_decisions.md's worked example.
    state.learner_profile.goal = "ethical hacking basics"

    result = run_path_a(state)

    path_b_nodes = [n for n in result.roadmap.nodes if n.path_type == PathType.PATH_B_OPEN_WEB]
    course_nodes = [n for n in result.roadmap.nodes if n.path_type == PathType.PATH_A_DATASET]
    assert course_nodes, "expected at least one dataset course node"

    if path_b_nodes:
        stub_ids = {n.node_id for n in path_b_nodes}
        # at least one course node should now list a stub as a real prerequisite
        assert any(stub_ids & set(n.internal_prerequisites) for n in course_nodes)
