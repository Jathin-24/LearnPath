"""
test_round5_platform_routes.py

Route-level tests for Round 5 Phase 5/6 additions: personal notes per
topic (PATCH /topic/{node_id}/notes) and starting a new goal
(POST /goal/restart) - the capability the Tutor's mid-roadmap redirect and
the Complete page both point learners to.
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.common import db
from backend.orchestrator.state_schema import (
    ConversationStage,
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


def test_update_topic_notes_persists(client):
    session_id = client.post("/session").json()["session_id"]
    _seed_roadmap(
        session_id, [RoadmapNode(node_id="a", topic="Topic A", path_type=PathType.PATH_A_DATASET)]
    )

    resp = client.patch(
        "/topic/a/notes", json={"session_id": session_id, "notes": "remember: closures capture by reference"}
    )
    assert resp.status_code == 200
    assert resp.json()["notes"] == "remember: closures capture by reference"

    after = db.load_state(session_id)
    assert after.roadmap.get_node("a").notes == "remember: closures capture by reference"


def test_update_topic_notes_404_for_unknown_node(client):
    session_id = client.post("/session").json()["session_id"]
    _seed_roadmap(
        session_id, [RoadmapNode(node_id="a", topic="Topic A", path_type=PathType.PATH_A_DATASET)]
    )

    resp = client.patch("/topic/nonexistent/notes", json={"session_id": session_id, "notes": "x"})
    assert resp.status_code == 404


def test_restart_goal_clears_goal_data_but_keeps_identity(client):
    session_id = client.post("/session").json()["session_id"]
    _seed_roadmap(session_id, [RoadmapNode(node_id="a", topic="Topic A", path_type=PathType.PATH_A_DATASET)])
    state = db.load_state(session_id)
    state.learner_profile.name = "Ada Lovelace"
    state.learner_profile.email = "ada@example.com"
    state.learner_profile.goal = "become a backend developer"
    state.learner_profile.interests = ["backend"]
    state.stage = ConversationStage.COMPLETE
    db.save_state(state)

    resp = client.post("/goal/restart", json={"session_id": session_id})
    assert resp.status_code == 200
    body = resp.json()["state"]

    assert body["learner_profile"]["name"] == "Ada Lovelace"
    assert body["learner_profile"]["email"] == "ada@example.com"
    assert body["learner_profile"]["goal"] is None
    assert body["learner_profile"]["interests"] == []
    assert body["roadmap"] is None
    assert body["stage"] == "onboarding"
    assert body["next_agent"] == "profiler"
    assert body["conversation_history"] == []
