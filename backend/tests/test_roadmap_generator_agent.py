"""
test_roadmap_generator_agent.py

Isolated test for the Roadmap Generator Agent (build order step 6), fixed
input - a small hand-built roadmap (not routed through Path-A, to keep LLM
call volume low and the test deterministic about node count).
"""

import pytest

from backend.agents.roadmap_generator import run_roadmap_generator
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ConversationStage,
    PathType,
    Roadmap,
    RoadmapNode,
)


def _fixed_state() -> AppState:
    state = AppState(session_id="test-roadmap-gen")
    state.roadmap = Roadmap(
        path_type=PathType.PATH_A_DATASET,
        nodes=[
            RoadmapNode(
                node_id="networking-fundamentals",
                topic="Networking Fundamentals",
                path_type=PathType.PATH_B_OPEN_WEB,
            ),
            RoadmapNode(
                node_id="python-for-absolute-beginners",
                topic="Python for Absolute Beginners",
                path_type=PathType.PATH_A_DATASET,
                course_name="Python for Absolute Beginners",
                course_summary="A beginner-friendly introduction to Python covering variables, "
                "loops, functions, and conditionals.",
                internal_prerequisites=["networking-fundamentals"],
            ),
        ],
    )
    return state


def test_roadmap_generator_attaches_project_and_assessment_to_dataset_and_web_nodes():
    """PATH_A_DATASET nodes get project/quiz generated grounded in the
    course; PATH_B_OPEN_WEB stub nodes get theirs via a real web search +
    synthesis (backend/agents/path_b.py) - both fully filled by the time
    ROADMAP_REVIEW is reached, so no dead unfilled node ever reaches the
    learner. Real Tavily + LLM calls for the stub node."""
    state = _fixed_state()

    result = run_roadmap_generator(state)

    dataset_node = result.roadmap.get_node("python-for-absolute-beginners")
    assert dataset_node.project is not None
    assert dataset_node.project.title
    assert dataset_node.project.description
    assert dataset_node.assessment is not None
    assert len(dataset_node.assessment.questions) == 3
    for q in dataset_node.assessment.questions:
        assert len(q.options) == 4
        assert 0 <= q.correct_option_index < 4

    stub_node = result.roadmap.get_node("networking-fundamentals")
    assert stub_node.project is not None
    assert stub_node.assessment is not None
    assert len(stub_node.assessment.questions) == 3
    assert stub_node.cheat_sheet_notes

    assert result.stage == ConversationStage.ROADMAP_REVIEW
    assert result.next_agent == AgentName.DONE


def test_roadmap_generator_requires_existing_roadmap():
    state = AppState(session_id="test-roadmap-gen-no-roadmap")
    with pytest.raises(ValueError):
        run_roadmap_generator(state)
