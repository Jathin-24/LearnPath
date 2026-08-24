"""
test_api_session.py

Integration test against the real local Postgres (per docs/final_decisions.md,
this is dev-mode persistence, not mocked) covering the session lifecycle wired
in build order step 3: create -> read -> import-context -> dashboard -> 404.
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_session_lifecycle(client):
    created = client.post("/session")
    assert created.status_code == 200
    session_id = created.json()["session_id"]
    assert created.json()["state"]["stage"] == "onboarding"

    fetched = client.get(f"/state/{session_id}")
    assert fetched.status_code == 200
    assert fetched.json()["state"]["session_id"] == session_id

    imported = client.post(
        "/context/import",
        json={"session_id": session_id, "imported_text": "wants to become a backend developer"},
    )
    assert imported.status_code == 200
    assert (
        imported.json()["state"]["learner_profile"]["imported_context_raw"]
        == "wants to become a backend developer"
    )

    dashboard = client.get(f"/dashboard/{session_id}")
    assert dashboard.status_code == 200
    assert dashboard.json()["percent_complete"] == 0.0


def test_state_404_for_unknown_session(client):
    resp = client.get("/state/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
