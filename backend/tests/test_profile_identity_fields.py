"""
test_profile_identity_fields.py

Round 4: extended identity fields on PATCH /profile (name, email, age,
gender, occupation_status, student_percentage, professional_role).
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_patch_profile_saves_identity_fields(client):
    session_id = client.post("/session").json()["session_id"]

    resp = client.patch(
        "/profile",
        json={
            "session_id": session_id,
            "name": "Asha Rao",
            "email": "asha@example.com",
            "age": 22,
            "gender": "female",
            "occupation_status": "student",
            "student_percentage": "88%",
        },
    )
    assert resp.status_code == 200
    profile = resp.json()["state"]["learner_profile"]
    assert profile["name"] == "Asha Rao"
    assert profile["email"] == "asha@example.com"
    assert profile["age"] == 22
    assert profile["gender"] == "female"
    assert profile["occupation_status"] == "student"
    assert profile["student_percentage"] == "88%"
    assert profile["professional_role"] is None


def test_patch_profile_rejects_invalid_occupation_status(client):
    session_id = client.post("/session").json()["session_id"]

    resp = client.patch(
        "/profile",
        json={"session_id": session_id, "occupation_status": "astronaut"},
    )
    assert resp.status_code == 400
