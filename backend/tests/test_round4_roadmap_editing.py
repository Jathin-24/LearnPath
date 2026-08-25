"""
test_round4_roadmap_editing.py

Round 4: strict sequential unlocking, roadmap reorder/skip (locked nodes
only), and the Chat single-topic-focus guardrail. Builds a small roadmap
directly via db.save_state (same pattern as test_round3_routes.py) so these
stay fast and focused on the routes themselves, not Path-A/LLM generation.
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.common import db
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ConversationStage,
    NodeStatus,
    PathType,
    Roadmap,
    RoadmapNode,
)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _seed_roadmap(session_id: str, nodes: list[RoadmapNode]) -> None:
    state = db.load_state(session_id)
    state.roadmap = Roadmap(path_type=PathType.PATH_A_DATASET, nodes=nodes)
    db.save_state(state)


def _three_node_roadmap() -> list[RoadmapNode]:
    return [
        RoadmapNode(node_id="a", topic="Topic A", path_type=PathType.PATH_A_DATASET),
        RoadmapNode(node_id="b", topic="Topic B", path_type=PathType.PATH_A_DATASET),
        RoadmapNode(node_id="c", topic="Topic C", path_type=PathType.PATH_A_DATASET),
    ]


def test_confirm_unlocks_exactly_one_node_skipping_path_b_stubs(client):
    session_id = client.post("/session").json()["session_id"]
    _seed_roadmap(
        session_id,
        [
            RoadmapNode(node_id="stub", topic="External Concept", path_type=PathType.PATH_B_OPEN_WEB),
            *_three_node_roadmap(),
        ],
    )

    resp = client.post("/roadmap/confirm", json={"session_id": session_id})
    nodes = resp.json()["state"]["roadmap"]["nodes"]
    available = [n for n in nodes if n["status"] == "available"]
    assert len(available) == 1
    assert available[0]["node_id"] == "a"  # first PATH_A_DATASET node, stub skipped


def test_reorder_swaps_two_locked_nodes(client):
    session_id = client.post("/session").json()["session_id"]
    _seed_roadmap(session_id, _three_node_roadmap())
    client.post("/roadmap/confirm", json={"session_id": session_id})  # "a" becomes available

    resp = client.post(
        "/roadmap/reorder", json={"session_id": session_id, "node_id": "c", "direction": "up"}
    )
    assert resp.status_code == 200
    order = [n["node_id"] for n in resp.json()["state"]["roadmap"]["nodes"]]
    assert order == ["a", "c", "b"]


def test_reorder_rejects_non_locked_node(client):
    session_id = client.post("/session").json()["session_id"]
    _seed_roadmap(session_id, _three_node_roadmap())
    client.post("/roadmap/confirm", json={"session_id": session_id})  # "a" becomes available

    resp = client.post(
        "/roadmap/reorder", json={"session_id": session_id, "node_id": "a", "direction": "down"}
    )
    assert resp.status_code == 400


def test_skip_removes_locked_node_and_cleans_up_references(client):
    session_id = client.post("/session").json()["session_id"]
    nodes = _three_node_roadmap()
    nodes[2].internal_prerequisites = ["b"]  # c depends on b
    _seed_roadmap(session_id, nodes)
    client.post("/roadmap/confirm", json={"session_id": session_id})

    resp = client.post("/roadmap/skip/b", json={"session_id": session_id})
    assert resp.status_code == 200
    remaining = resp.json()["state"]["roadmap"]["nodes"]
    ids = [n["node_id"] for n in remaining]
    assert "b" not in ids
    c_node = next(n for n in remaining if n["node_id"] == "c")
    assert "b" not in c_node["internal_prerequisites"]


def test_skip_rejects_non_locked_node(client):
    session_id = client.post("/session").json()["session_id"]
    _seed_roadmap(session_id, _three_node_roadmap())
    client.post("/roadmap/confirm", json={"session_id": session_id})  # "a" becomes available

    resp = client.post("/roadmap/skip/a", json={"session_id": session_id})
    assert resp.status_code == 400


def test_submit_assessment_rejects_non_available_node(client):
    from backend.orchestrator.state_schema import MCQQuestion, TopicAssessment

    session_id = client.post("/session").json()["session_id"]
    nodes = _three_node_roadmap()
    for n in nodes:
        n.assessment = TopicAssessment(
            questions=[MCQQuestion(question="?", options=["x", "y"], correct_option_index=0)]
        )
    _seed_roadmap(session_id, nodes)
    client.post("/roadmap/confirm", json={"session_id": session_id})  # only "a" is available

    resp = client.post(
        "/topic/b/assessment/submit", json={"session_id": session_id, "answers": ["x"]}
    )
    assert resp.status_code == 400
    assert "one at a time" in resp.json()["detail"]


def test_chat_uses_topic_tutor_instead_of_processing_mid_roadmap(client):
    """Mid-roadmap, /chat must route through the Topic Tutor (agents/tutor.py)
    - grounded, real answers about the current topic - not re-run the
    Profiler/Assessment onboarding chain as if this were a fresh goal."""
    session_id = client.post("/session").json()["session_id"]
    state = db.load_state(session_id)
    state.stage = ConversationStage.IN_PROGRESS
    state.learner_profile.goal = "become a backend developer"
    state.roadmap = Roadmap(
        path_type=PathType.PATH_A_DATASET,
        nodes=[
            RoadmapNode(
                node_id="python-basics",
                topic="Python Basics",
                path_type=PathType.PATH_A_DATASET,
                status=NodeStatus.AVAILABLE,
                key_concepts=["variables", "loops"],
            )
        ],
    )
    db.save_state(state)

    resp = client.post(
        "/chat", json={"session_id": session_id, "message": "What's a variable in Python?"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["assistant_message"].strip() != ""

    after = db.load_state(session_id)
    assert after.conversation_history[-2].content == "What's a variable in Python?"
    assert after.conversation_history[-1].content == body["assistant_message"]
    # The onboarding chain must NOT have run for this turn.
    visited_agents = {e.agent for e in after.progress_log}
    assert AgentName.PROFILER not in visited_agents
    assert AgentName.ASSESSMENT not in visited_agents
