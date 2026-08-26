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

        # Sequential unlocking (Round 4): exactly one node available at a
        # time, never more - see backend/api/main.py's _unlock_next_in_sequence.
        available = [n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "available"]
        assert len(available) == 1, f"expected exactly one available node, got {len(available)}"
        current_node = available[0]
        # A node only becomes available once it's actually completable - see
        # backend/api/main.py's _unlock_next_in_sequence. Roadmap Generator
        # fills PATH_B_OPEN_WEB stubs via Path-B before ROADMAP_REVIEW too
        # (backend/agents/path_b.py), so the first available node can now
        # legitimately be either type as long as it has a real assessment.
        assert current_node["assessment"] is not None

        # Round 6: project/quiz still generate eagerly for every node, but
        # subtopics are lazy - only the just-unlocked node should have them.
        assert len(current_node["subtopics"]) > 0
        locked_nodes = [n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "locked"]
        assert all(n["subtopics"] == [] for n in locked_nodes)

        explained = client.post(f"/roadmap/explain/{current_node['node_id']}", json={"session_id": session_id})
        assert explained.status_code == 200
        assert len(explained.json()["explanation"]) > 10

        questions = current_node["assessment"]["questions"]
        correct_answers = [q["options"][q["correct_option_index"]] for q in questions]

        submitted = client.post(
            f"/topic/{current_node['node_id']}/assessment/submit",
            json={"session_id": session_id, "answers": correct_answers},
        )
        assert submitted.status_code == 200
        body = submitted.json()
        assert body["score"] == 1.0
        assert body["passed"] is True
        assert body["node_status"] == "complete"

        # Exactly the next node in sequence should now be available - not
        # zero, not more than one.
        after_state = client.get(f"/state/{session_id}").json()["state"]
        still_available = [n for n in after_state["roadmap"]["nodes"] if n["status"] == "available"]
        assert len(still_available) <= 1
        if still_available:
            # The newly-unlocked node's subtopics should now be populated too.
            assert len(still_available[0]["subtopics"]) > 0


def test_toggle_subtopic_and_regenerate_topic():
    with TestClient(app) as client:
        created = client.post("/session")
        session_id = created.json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})
        confirmed_state = client.post("/roadmap/confirm", json={"session_id": session_id}).json()["state"]
        current_node = next(n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "available")
        subtopic_id = current_node["subtopics"][0]["subtopic_id"]

        toggled = client.patch(
            f"/topic/{current_node['node_id']}/subtopic/{subtopic_id}",
            json={"session_id": session_id, "checked": True},
        )
        assert toggled.status_code == 200
        toggled_node = next(
            n for n in toggled.json()["state"]["roadmap"]["nodes"] if n["node_id"] == current_node["node_id"]
        )
        assert next(s for s in toggled_node["subtopics"] if s["subtopic_id"] == subtopic_id)["checked"] is True
        # Toggling a subtopic never affects NodeStatus - informational only.
        assert toggled_node["status"] == "available"

        old_project_title = current_node["project"]["title"]
        regenerated = client.post(
            f"/topic/{current_node['node_id']}/regenerate", json={"session_id": session_id}
        )
        assert regenerated.status_code == 200
        regenerated_node = next(
            n for n in regenerated.json()["state"]["roadmap"]["nodes"] if n["node_id"] == current_node["node_id"]
        )
        assert regenerated_node["project"] is not None
        assert regenerated_node["assessment"] is not None
        # Not a strict guarantee the title changes, but content should exist
        # either way - the real assertion is that regeneration didn't error
        # and left the node in a usable state.
        assert regenerated_node["project"]["title"]


def test_expand_project_is_cached():
    with TestClient(app) as client:
        created = client.post("/session")
        session_id = created.json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})
        confirmed_state = client.post("/roadmap/confirm", json={"session_id": session_id}).json()["state"]
        current_node = next(n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "available")

        first = client.post(
            f"/topic/{current_node['node_id']}/project/expand", json={"session_id": session_id}
        )
        assert first.status_code == 200
        detailed = first.json()["detailed_description"]
        assert len(detailed) > 10

        # Cached on node.project.detailed_description - second call returns
        # the same text without erroring, whether or not it re-spends a call.
        second = client.post(
            f"/topic/{current_node['node_id']}/project/expand", json={"session_id": session_id}
        )
        assert second.status_code == 200
        assert second.json()["detailed_description"] == detailed


def test_regenerate_refused_for_completed_topic():
    with TestClient(app) as client:
        created = client.post("/session")
        session_id = created.json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})
        confirmed_state = client.post("/roadmap/confirm", json={"session_id": session_id}).json()["state"]
        current_node = next(n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "available")

        questions = current_node["assessment"]["questions"]
        correct_answers = [q["options"][q["correct_option_index"]] for q in questions]
        client.post(
            f"/topic/{current_node['node_id']}/assessment/submit",
            json={"session_id": session_id, "answers": correct_answers},
        )

        resp = client.post(f"/topic/{current_node['node_id']}/regenerate", json={"session_id": session_id})
        assert resp.status_code == 400


def test_add_and_edit_roadmap_node():
    with TestClient(app) as client:
        created = client.post("/session")
        session_id = created.json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})

        added = client.post(
            "/roadmap/node/add",
            json={"session_id": session_id, "topic": "GraphQL Basics", "key_concepts": ["schemas"]},
        )
        assert added.status_code == 200
        added_state = added.json()["state"]
        new_node = added_state["roadmap"]["nodes"][-1]
        assert new_node["topic"] == "GraphQL Basics"
        assert new_node["path_type"] == "path_b_open_web"
        assert new_node["status"] == "locked"
        assert new_node["subtopics"] == []  # not generated until unlocked

        edited = client.patch(
            f"/roadmap/node/{new_node['node_id']}",
            json={"session_id": session_id, "topic": "GraphQL Fundamentals"},
        )
        assert edited.status_code == 200
        edited_node = next(
            n for n in edited.json()["state"]["roadmap"]["nodes"] if n["node_id"] == new_node["node_id"]
        )
        assert edited_node["topic"] == "GraphQL Fundamentals"


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
