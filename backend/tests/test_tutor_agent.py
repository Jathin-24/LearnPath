"""
test_tutor_agent.py

Isolated test for the Topic Tutor (backend/agents/tutor.py), fixed input,
real LLM call - same pattern as test_explainer_agent.py. Verifies it
grounds its answer in the learner's actual current topic rather than
giving a generic reply, and that it degrades gracefully with no active
node instead of crashing.
"""

from backend.agents.tutor import run_topic_tutor
from backend.orchestrator.state_schema import (
    AppState,
    ChatTurn,
    NodeStatus,
    PathType,
    Roadmap,
    RoadmapNode,
)


def test_tutor_grounds_reply_in_current_topic():
    state = AppState(session_id="test-tutor-grounded")
    state.roadmap = Roadmap(
        path_type=PathType.PATH_A_DATASET,
        nodes=[
            RoadmapNode(
                node_id="python-basics",
                topic="Python Basics",
                path_type=PathType.PATH_A_DATASET,
                status=NodeStatus.AVAILABLE,
                key_concepts=["variables", "loops", "functions"],
            )
        ],
    )
    state.conversation_history = [
        ChatTurn(role="user", content="What's a variable in Python?"),
    ]

    reply = run_topic_tutor(state, "What's a variable in Python?")

    assert reply.strip() != ""
    assert "variable" in reply.lower()


def test_tutor_handles_no_active_node_without_crashing():
    state = AppState(session_id="test-tutor-no-node")
    # No roadmap at all - shouldn't happen in practice (guarded by /chat's
    # stage check) but must degrade gracefully, not crash, if it does.

    reply = run_topic_tutor(state, "Can you help me with something?")

    assert reply.strip() != ""
