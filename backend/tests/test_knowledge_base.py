"""
test_knowledge_base.py

Integration test for the per-user knowledge base (Round 6): importing
context extracts structured, categorized facts (backend/agents/
knowledge_extractor.py) into the user_knowledge table, surfaced via
GET /knowledge/{session_id} and removable via DELETE /knowledge/{id}.
Against real Postgres + real LLM, per this repo's no-mocking convention.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _unique_username() -> str:
    return f"testuser-{uuid.uuid4().hex[:12]}"


def _signup(client) -> str:
    resp = client.post(
        "/auth/signup",
        json={"username": _unique_username(), "password": "correct-horse-battery-staple"},
    )
    assert resp.status_code == 200
    return resp.json()["session_id"]


def test_import_context_extracts_structured_knowledge(client):
    session_id = _signup(client)

    imported_text = """Goals:
- Become a backend developer within 6 months

Current Skills / Experience:
- Knows Python at a beginner level

Interests:
- Interested in building APIs

Learning Style & Pace:
- Prefers hands-on projects over reading

Constraints:
- Can only study on weekends

Things I Find Difficult or Dislike:
- Finds regular expressions confusing"""

    resp = client.post(
        "/context/import", json={"session_id": session_id, "imported_text": imported_text}
    )
    assert resp.status_code == 200
    assert resp.json()["state"]["learner_profile"]["imported_context_raw"] == imported_text

    knowledge_resp = client.get(f"/knowledge/{session_id}")
    assert knowledge_resp.status_code == 200
    entries = knowledge_resp.json()["entries"]
    assert len(entries) > 0, "expected at least one fact extracted from the imported text"
    assert all(e["source"] == "import" for e in entries)
    assert all(e["category"] for e in entries)


def test_delete_knowledge_entry(client):
    session_id = _signup(client)
    client.post(
        "/context/import",
        json={
            "session_id": session_id,
            "imported_text": "Goals:\n- Learn data engineering\n",
        },
    )
    entries = client.get(f"/knowledge/{session_id}").json()["entries"]
    assert len(entries) > 0
    entry_id = entries[0]["id"]

    delete_resp = client.request(
        "DELETE", f"/knowledge/{entry_id}", json={"session_id": session_id}
    )
    assert delete_resp.status_code == 200

    remaining = client.get(f"/knowledge/{session_id}").json()["entries"]
    assert entry_id not in [e["id"] for e in remaining]


def test_knowledge_empty_for_anonymous_session(client):
    created = client.post("/session")
    session_id = created.json()["session_id"]
    resp = client.get(f"/knowledge/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["entries"] == []
