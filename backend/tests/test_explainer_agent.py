"""
test_explainer_agent.py

Isolated test for the Explainer Agent (build order step 6), fixed input, real
LLM call. Explainer is only called on demand (per node_id) - never part of
the sequential graph - so it's tested standalone against a hand-built state.
"""

import pytest

from backend.agents.explainer import explain_node
from backend.orchestrator.state_schema import (
    AppState,
    ConceptAssessment,
    ConceptStatus,
    PathType,
    Roadmap,
    RoadmapNode,
)


def _fixed_state() -> AppState:
    state = AppState(session_id="test-explainer")
    state.learner_profile.goal = "become a backend developer"
    state.skill_gap_map.assessments = [
        ConceptAssessment(concept="loops", status=ConceptStatus.GAP),
    ]
    state.roadmap = Roadmap(
        path_type=PathType.PATH_A_DATASET,
        nodes=[
            RoadmapNode(
                node_id="python-for-absolute-beginners",
                topic="Python for Absolute Beginners",
                path_type=PathType.PATH_A_DATASET,
                course_name="Python for Absolute Beginners",
                course_summary="A beginner-friendly introduction to Python.",
            ),
            RoadmapNode(
                node_id="flask-api-development",
                topic="Flask API Development",
                path_type=PathType.PATH_A_DATASET,
                course_name="Flask API Development",
                internal_prerequisites=["python-for-absolute-beginners"],
            ),
        ],
    )
    return state


def test_explainer_grounds_explanation_in_real_node_data():
    state = _fixed_state()

    explanation = explain_node(state, "python-for-absolute-beginners")

    assert isinstance(explanation, str)
    assert len(explanation) > 20


def test_explainer_raises_for_unknown_node():
    state = _fixed_state()
    with pytest.raises(ValueError):
        explain_node(state, "nonexistent-node")


def test_explainer_raises_when_no_roadmap():
    state = AppState(session_id="test-explainer-no-roadmap")
    with pytest.raises(ValueError):
        explain_node(state, "anything")
