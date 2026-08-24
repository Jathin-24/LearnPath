"""
test_path_a_agent.py

Isolated tests for the Path-A Agent: RAG retrieval + relevance filtering +
LLM planning + prerequisite graph traversal, real dataset, real LLM calls.

use_template_cache=False everywhere here - the roadmap_templates cache
(backend/common/db.py) is shared, real Postgres, and other tests (e.g.
test_api_roadmap_routes.py) write to it using similar goal text. Without
disabling it, these tests could silently start hitting a stale cached
roadmap from a previous test run instead of exercising the actual
retrieval/threshold/planning logic being tested here.
"""

from backend.agents.path_a import run_path_a
from backend.orchestrator.state_schema import AgentName, AppState, PathType


def test_path_a_builds_valid_prerequisite_ordered_roadmap():
    state = AppState(session_id="test-path-a")
    state.learner_profile.goal = "become a backend developer"
    state.skill_gap_map.assessments = []  # no known gaps yet, goal alone drives retrieval

    result = run_path_a(state, use_template_cache=False)

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


def test_path_a_excludes_irrelevant_mobile_courses_for_backend_goal():
    """Regression test for the exact bug a real user hit: 'become a backend
    developer' was pulling in Android App Development and React Native
    Mobile Development because they scored just above the embedding noise
    floor (~0.29-0.32) despite being irrelevant. The similarity threshold +
    LLM planning pass (see path_a.py) should keep the roadmap on-topic."""
    state = AppState(session_id="test-path-a-relevance")
    state.learner_profile.goal = "become a backend developer"
    state.learner_profile.timeline = "2 months"

    result = run_path_a(state, use_template_cache=False)

    topics = {n.topic for n in result.roadmap.nodes}
    off_topic = {"Android App Development", "React Native Mobile Development"}
    assert not (topics & off_topic), f"expected no mobile-dev courses, got: {topics & off_topic}"


def test_path_a_promotes_external_concepts_to_path_b_stub_nodes():
    state = AppState(session_id="test-path-a-external")
    # Ethical Hacking Basics has a real external_prerequisite_concept
    # ("Networking Fundamentals") per docs/final_decisions.md's worked example.
    state.learner_profile.goal = "ethical hacking basics"

    result = run_path_a(state, use_template_cache=False)

    path_b_nodes = [n for n in result.roadmap.nodes if n.path_type == PathType.PATH_B_OPEN_WEB]
    course_nodes = [n for n in result.roadmap.nodes if n.path_type == PathType.PATH_A_DATASET]
    assert course_nodes, "expected at least one dataset course node"

    if path_b_nodes:
        stub_ids = {n.node_id for n in path_b_nodes}
        # at least one course node should now list a stub as a real prerequisite
        assert any(stub_ids & set(n.internal_prerequisites) for n in course_nodes)


def test_path_a_reuses_cached_template_for_similar_goal():
    seed_state = AppState(session_id="test-path-a-template-seed")
    seed_state.learner_profile.goal = "become a professional backend software engineer"
    seeded = run_path_a(seed_state, use_template_cache=False)

    from backend.agents.roadmap_generator import run_roadmap_generator

    finalized = run_roadmap_generator(seeded)
    assert finalized.roadmap is not None

    reuse_state = AppState(session_id="test-path-a-template-reuse")
    reuse_state.learner_profile.goal = "become a professional backend software engineer"
    result = run_path_a(reuse_state, use_template_cache=True)

    reused_event = next(
        (e for e in result.progress_log if e.event_type == "roadmap_reused_from_template"), None
    )
    assert reused_event is not None, "expected the just-saved template to be reused"
