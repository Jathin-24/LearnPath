"""
test_round7_resume_and_roadmap_modify.py

Round 7: structured resume-profile extraction (backend/agents/
knowledge_extractor.py's extract_resume_profile) and the pre-confirm
"Modify with AI" full roadmap regeneration route (/roadmap/modify).

The resume upload ROUTE itself (POST /profile/resume) needs a real PDF file,
which isn't exercised here - extract_resume_profile is tested directly, in
isolation, against plain resume text (same pattern as
test_knowledge_extractor.py's extract_knowledge, if one exists) since that's
where the actual extraction logic lives; main.py's route is a thin
read-PDF-then-call-this wrapper.
"""

from fastapi.testclient import TestClient

from backend.agents.knowledge_extractor import extract_resume_profile
from backend.api.main import app
from backend.common import db

_SAMPLE_RESUME_TEXT = """
Jordan Rivera
jordan.rivera@example.com

Currently a Backend Developer at Acme Corp, building Python/FastAPI services.

Skills: Python, PostgreSQL, Docker, REST API design
Certifications: AWS Certified Developer - Associate
Hobbies: rock climbing, chess
Languages: Fluent in Spanish and English
Volunteer: Weekend coding tutor at a local community center
Education: B.S. in Computer Science, State University
"""


def test_extract_resume_profile_pulls_structured_fields():
    """Real LLM call - checks the extractor actually separates skills,
    certifications, and hobbies into their own fields rather than dumping
    everything into one bucket, and that leftover facts (languages,
    volunteer work - nothing else fits) land in extra_info rather than
    being silently dropped."""
    result = extract_resume_profile(_SAMPLE_RESUME_TEXT)

    assert result.email == "jordan.rivera@example.com"
    assert result.professional_role
    assert any("python" in s.lower() for s in result.skills)
    assert any("aws" in c.lower() for c in result.certifications)
    assert any("climbing" in h.lower() or "chess" in h.lower() for h in result.hobbies)
    assert result.extra_info
    assert "spanish" in result.extra_info.lower() or "volunteer" in result.extra_info.lower()


def _seed_goal(session_id: str, goal: str) -> None:
    state = db.load_state(session_id)
    state.learner_profile.goal = goal
    db.save_state(state)


def test_roadmap_modify_reruns_course_selection_with_instructions():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})

        state_before = client.get(f"/state/{session_id}").json()["state"]
        assert state_before["stage"] == "roadmap_review"

        resp = client.post(
            "/roadmap/modify",
            json={
                "session_id": session_id,
                "instructions": "keep it to at most 3 topics, focused only on databases",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["state"]["roadmap"] is not None
        assert body["state"]["learner_profile"]["roadmap_instructions"] == (
            "keep it to at most 3 topics, focused only on databases"
        )
        assert body["state"]["stage"] == "roadmap_review"


def test_roadmap_modify_rejects_empty_instructions():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})

        resp = client.post("/roadmap/modify", json={"session_id": session_id, "instructions": "   "})
        assert resp.status_code == 400


def test_roadmap_modify_refused_after_confirm():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})
        client.post("/roadmap/confirm", json={"session_id": session_id})

        resp = client.post(
            "/roadmap/modify", json={"session_id": session_id, "instructions": "add more topics"}
        )
        assert resp.status_code == 400
