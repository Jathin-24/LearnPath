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


class _CapturingLLMClient:
    """Stands in for LLMClient just to inspect the prompt actually sent -
    real LLM calls elsewhere in this file cover response quality; this one
    is about verifying resume/knowledge context reaches the prompt at all."""

    def __init__(self):
        self.last_prompt: str | None = None

    def complete(self, prompt: str, max_tokens: int = 400) -> str:
        self.last_prompt = prompt
        return "A backend developer builds the server side of applications."


def test_tutor_injects_resume_context_into_prompt():
    """Regression test for the gap where resume/knowledge context only
    shaped the one-time onboarding conversation (profiler.py) and was
    silently dropped for every mid-roadmap Tutor message after that."""
    state = AppState(session_id="test-tutor-personalization")
    state.learner_profile.resume_raw = "Experienced baker who wants to switch into backend engineering."
    state.roadmap = Roadmap(
        path_type=PathType.PATH_A_DATASET,
        nodes=[
            RoadmapNode(
                node_id="python-basics",
                topic="Python Basics",
                path_type=PathType.PATH_A_DATASET,
                status=NodeStatus.AVAILABLE,
            )
        ],
    )

    client = _CapturingLLMClient()
    run_topic_tutor(state, "What's a variable?", llm_client=client)

    assert client.last_prompt is not None
    assert "baker" in client.last_prompt
