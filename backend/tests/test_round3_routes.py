"""
test_round3_routes.py

Integration tests for Round 3's Profile/Timer/Analytics routes, real
Postgres. Builds a small roadmap directly via db.save_state (bypassing
Path-A/Roadmap Generator - those are already covered elsewhere) so these
tests stay focused on the routes themselves.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.common import db
from backend.orchestrator.state_schema import (
    AppState,
    MCQQuestion,
    PathType,
    ProjectAssignment,
    Roadmap,
    RoadmapNode,
    TopicAssessment,
)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _create_session_with_roadmap(client) -> str:
    session_id = client.post("/session").json()["session_id"]
    state = db.load_state(session_id)
    state.roadmap = Roadmap(
        path_type=PathType.PATH_A_DATASET,
        nodes=[
            RoadmapNode(
                node_id="python-basics",
                topic="Python Basics",
                path_type=PathType.PATH_A_DATASET,
                course_name="Python Basics",
                project=ProjectAssignment(title="Build a CLI tool", description="..."),
                assessment=TopicAssessment(
                    questions=[
                        MCQQuestion(
                            question="What is a variable?",
                            options=["A container for data", "A loop", "A class", "A file"],
                            correct_option_index=0,
                        )
                    ]
                ),
            )
        ],
    )
    db.save_state(state)
    return session_id


def test_patch_profile_updates_only_provided_fields(client):
    session_id = client.post("/session").json()["session_id"]

    resp = client.patch(
        "/profile",
        json={"session_id": session_id, "goal": "become a data scientist", "timeline": "6 months"},
    )
    assert resp.status_code == 200
    profile = resp.json()["state"]["learner_profile"]
    assert profile["goal"] == "become a data scientist"
    assert profile["timeline"] == "6 months"
    assert profile["interests"] == []  # untouched, not wiped out


def test_record_time_spent_accumulates(client):
    session_id = _create_session_with_roadmap(client)

    first = client.post("/topic/python-basics/time", json={"session_id": session_id, "seconds": 30})
    assert first.status_code == 200
    assert first.json()["time_spent_seconds"] == 30

    second = client.post("/topic/python-basics/time", json={"session_id": session_id, "seconds": 15})
    assert second.json()["time_spent_seconds"] == 45


def test_analytics_reflects_time_and_completion(client):
    session_id = _create_session_with_roadmap(client)
    client.post("/roadmap/confirm", json={"session_id": session_id})  # unlocks python-basics
    client.post("/topic/python-basics/time", json={"session_id": session_id, "seconds": 120})

    before = client.get(f"/analytics/{session_id}").json()
    assert before["total_time_spent_seconds"] == 120
    assert before["quiz_pass_rate"] == 0.0
    assert before["topics_completed_this_week"] == 0

    submitted = client.post(
        "/topic/python-basics/assessment/submit",
        json={"session_id": session_id, "answers": ["A container for data"]},
    )
    assert submitted.json()["passed"] is True

    after = client.get(f"/analytics/{session_id}").json()
    assert after["quiz_pass_rate"] == 1.0
    assert after["topics_completed_this_week"] == 1


def test_analytics_for_unknown_session_404s(client):
    resp = client.get(f"/analytics/{uuid.uuid4()}")
    assert resp.status_code == 404
