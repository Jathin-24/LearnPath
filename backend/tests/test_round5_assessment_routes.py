"""
test_round5_assessment_routes.py

Route-level integration tests for the structured assessment endpoints
(POST /assessment/checklist/submit, POST /assessment/quiz/submit) added in
Round 5 Phase 1. test_assessment_agent.py already covers the underlying
agent functions in isolation; these tests exist because a real bug slipped
through that isolation: the checklist-submit ROUTE forgot to invoke the
graph cascade when no concepts were confirmed (submit_checklist_concepts
correctly set next_agent=PATH_A, but nothing ever called graph.invoke() to
act on it, so the roadmap silently never got built). Route-level coverage
catches exactly this class of bug.

State is seeded directly at the "checklist pending" point (same pattern as
test_round3/4's _seed_roadmap helpers) rather than driven through /chat -
Profiler's own conversational judgment (how many turns before it considers
itself ready) is legitimately non-deterministic and already covered
elsewhere (test_profiler_agent.py); these tests are about what the
checklist/quiz ROUTES do once that phase has started, not about getting
there via a real conversation.
"""

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.common import db
from backend.orchestrator.state_schema import AgentName, ConversationStage


def _seed_checklist_pending(session_id: str, goal: str, concepts: list[str]) -> None:
    state = db.load_state(session_id)
    state.learner_profile.goal = goal
    state.stage = ConversationStage.ASSESSMENT
    state.pending_checklist_concepts = concepts
    state.next_agent = AgentName.ASSESSMENT
    state.awaiting_input = True
    db.save_state(state)


def test_checklist_submit_with_no_concepts_cascades_into_roadmap_generation():
    """Regression test: confirming zero concepts must still build a full
    roadmap, not just flip next_agent without acting on it."""
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_checklist_pending(session_id, "become a backend developer", ["variables", "loops"])

        resp = client.post(
            "/assessment/checklist/submit",
            json={"session_id": session_id, "confirmed_concepts": []},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["state"]["roadmap"] is not None, "roadmap must actually be built, not left null"
        assert body["state"]["stage"] == "roadmap_review"


def test_checklist_submit_with_concepts_generates_quiz_via_route():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_checklist_pending(session_id, "become a backend developer", ["variables", "loops"])

        resp = client.post(
            "/assessment/checklist/submit",
            json={"session_id": session_id, "confirmed_concepts": ["variables"]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["state"]["pending_quiz"]) == 1
        assert body["state"]["roadmap"] is None, "roadmap shouldn't exist yet - quiz not graded"


def test_quiz_submit_grades_and_cascades_into_roadmap_via_route():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_checklist_pending(session_id, "become a backend developer", ["variables"])

        client.post(
            "/assessment/checklist/submit",
            json={"session_id": session_id, "confirmed_concepts": ["variables"]},
        )
        state = db.load_state(session_id)
        questions = state.pending_quiz
        assert questions, "expected the quiz to have been generated"
        answers = [q.options[q.correct_option_index] for q in questions]

        resp = client.post(
            "/assessment/quiz/submit",
            json={"session_id": session_id, "answers": answers},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["results"]) == len(questions)
        assert all(r["correct"] for r in body["results"])
        assert body["state"]["roadmap"] is not None
        assert body["state"]["stage"] == "roadmap_review"
