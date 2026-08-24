"""
test_api_roadmap_routes.py

Integration test for the roadmap routes (build order step 7): generate ->
confirm -> explain -> submit assessment. Seeds learner_profile.goal directly
via the DB layer (bypassing Profiler, which is already covered in isolation
in test_profiler_agent.py) so this test stays focused on the route wiring
itself, against real Postgres + real LLM/RAG calls.
"""

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.common import db


def _seed_goal(session_id: str, goal: str) -> None:
    state = db.load_state(session_id)
    state.learner_profile.goal = goal
    db.save_state(state)


def test_generate_confirm_explain_submit_flow():
    with TestClient(app) as client:
        created = client.post("/session")
        session_id = created.json()["session_id"]
        _seed_goal(session_id, "become a backend developer")

        generated = client.post("/roadmap/generate/path-a", json={"session_id": session_id})
        assert generated.status_code == 200
        roadmap = generated.json()["roadmap"]
        assert roadmap["path_type"] == "path_a_dataset"
        assert len(roadmap["nodes"]) > 0

        state_after_generate = client.get(f"/state/{session_id}").json()["state"]
        assert state_after_generate["stage"] == "roadmap_review"

        confirmed = client.post("/roadmap/confirm", json={"session_id": session_id})
        assert confirmed.status_code == 200
        confirmed_state = confirmed.json()["state"]
        assert confirmed_state["stage"] == "in_progress"
        available = [n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "available"]
        assert available, "expected at least one node with no prerequisites to be unlocked"

        first_node_id = available[0]["node_id"]

        explained = client.post(f"/roadmap/explain/{first_node_id}", json={"session_id": session_id})
        assert explained.status_code == 200
        assert len(explained.json()["explanation"]) > 10

        dataset_node = next(
            n for n in confirmed_state["roadmap"]["nodes"]
            if n["path_type"] == "path_a_dataset" and n["assessment"]
        )
        questions = dataset_node["assessment"]["questions"]
        correct_answers = [q["options"][q["correct_option_index"]] for q in questions]

        submitted = client.post(
            f"/topic/{dataset_node['node_id']}/assessment/submit",
            json={"session_id": session_id, "answers": correct_answers},
        )
        assert submitted.status_code == 200
        body = submitted.json()
        assert body["score"] == 1.0
        assert body["passed"] is True
        assert body["node_status"] == "complete"


def test_submit_assessment_404_for_unknown_node():
    with TestClient(app) as client:
        created = client.post("/session")
        session_id = created.json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})

        resp = client.post(
            "/topic/nonexistent-node/assessment/submit",
            json={"session_id": session_id, "answers": []},
        )
        assert resp.status_code == 404
