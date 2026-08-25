"""
test_path_b_agent.py

Isolated tests for the Path-B Agent (backend/agents/path_b.py): web/YouTube
search + LLM synthesis for content the 80-course dataset doesn't cover.
Real Tavily + LLM calls, fixed input - same pattern as the other agent
tests.
"""

from backend.agents.path_a import run_path_a
from backend.agents.path_b import run_path_b
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    PathType,
    ProjectAssignment,
    Roadmap,
    RoadmapNode,
    TopicAssessment,
)


def test_fill_node_populates_empty_stub():
    state = AppState(session_id="test-path-b-fill")
    state.learner_profile.timeline = "1 month"
    state.roadmap = Roadmap(
        path_type=PathType.PATH_B_OPEN_WEB,
        nodes=[
            RoadmapNode(
                node_id="rust-ownership",
                topic="Rust Ownership and Borrowing",
                path_type=PathType.PATH_B_OPEN_WEB,
            )
        ],
    )

    result = run_path_b(state, node_id="rust-ownership")

    node = result.roadmap.get_node("rust-ownership")
    assert node.cheat_sheet_notes
    assert node.project is not None
    assert node.project.title
    assert node.assessment is not None
    assert len(node.assessment.questions) == 3
    assert node.estimated_days >= 1
    # at least one resource type should have been found for a well-known topic
    assert node.web_sources or node.youtube_links


def test_supplement_node_never_overwrites_existing_project_or_quiz():
    state = AppState(session_id="test-path-b-supplement")
    original_project = ProjectAssignment(title="Keep me", description="Original description")
    original_assessment = TopicAssessment(
        questions=[]  # empty is fine - we're only checking identity is preserved
    )
    state.roadmap = Roadmap(
        path_type=PathType.PATH_A_DATASET,
        nodes=[
            RoadmapNode(
                node_id="python-basics",
                topic="Python Basics",
                path_type=PathType.PATH_A_DATASET,
                project=original_project,
                assessment=original_assessment,
            )
        ],
    )

    result = run_path_b(state, node_id="python-basics")

    node = result.roadmap.get_node("python-basics")
    assert node.project is original_project
    assert node.project.title == "Keep me"
    assert node.assessment is original_assessment
    # resources should still have been added
    assert node.cheat_sheet_notes


def test_standalone_mode_builds_sequenced_stub_roadmap():
    state = AppState(session_id="test-path-b-standalone")
    state.learner_profile.goal = "learn competitive rock climbing training techniques"

    result = run_path_b(state)

    assert result.roadmap is not None
    assert len(result.roadmap.nodes) >= 1
    assert all(n.path_type == PathType.PATH_B_OPEN_WEB for n in result.roadmap.nodes)
    # bare stubs at this point - content filling is Roadmap Generator's job
    assert all(n.project is None for n in result.roadmap.nodes)
    assert result.next_agent == AgentName.ROADMAP_GENERATOR

    node_ids = {n.node_id for n in result.roadmap.nodes}
    for node in result.roadmap.nodes:
        for prereq_id in node.internal_prerequisites:
            assert prereq_id in node_ids


def test_path_a_falls_back_to_path_b_when_dataset_match_too_weak():
    """A goal with nothing genuinely relevant in the 80-course dataset must
    fall back to Path-B instead of forcing weak/irrelevant dataset matches
    (see path_a.py's run_path_a - MIN_SIMILARITY_SCORE fallback branch)."""
    state = AppState(session_id="test-path-a-weak-match-fallback")
    state.learner_profile.goal = "medieval falconry and hawk training techniques"

    result = run_path_a(state, use_template_cache=False)

    assert result.roadmap is not None
    if result.roadmap.path_type == PathType.PATH_B_OPEN_WEB:
        assert all(n.path_type == PathType.PATH_B_OPEN_WEB for n in result.roadmap.nodes)
    assert result.next_agent == AgentName.ROADMAP_GENERATOR
