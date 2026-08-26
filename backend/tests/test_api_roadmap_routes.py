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


def _pass_all_subtopics(client: TestClient, session_id: str, node_id: str, subtopics: list[dict]) -> dict:
    """Drives every subtopic to PASSED via the real quiz generate/submit
    routes (strictly sequential, per the user's explicit ask), then returns
    the refreshed node dict - by the last one, generate_final_content
    should have populated project/assessment."""
    node: dict = {}
    for sub in subtopics:
        gen = client.post(
            f"/topic/{node_id}/subtopic/{sub['subtopic_id']}/quiz/generate",
            json={"session_id": session_id},
        )
        assert gen.status_code == 200
        node = next(n for n in gen.json()["state"]["roadmap"]["nodes"] if n["node_id"] == node_id)
        quiz = next(s for s in node["subtopics"] if s["subtopic_id"] == sub["subtopic_id"])["quiz"]
        answers = [q["options"][q["correct_option_index"]] for q in quiz["questions"]]

        sub_resp = client.post(
            f"/topic/{node_id}/subtopic/{sub['subtopic_id']}/quiz/submit",
            json={"session_id": session_id, "answers": answers},
        )
        assert sub_resp.status_code == 200
        assert sub_resp.json()["passed"] is True
        node = next(n for n in sub_resp.json()["state"]["roadmap"]["nodes"] if n["node_id"] == node_id)
    return node


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
        node_id = current_node["node_id"]
        # A node only becomes available once it's actually completable - see
        # backend/api/main.py's _unlock_next_in_sequence. Round 7: a
        # PATH_A_DATASET node's project/quiz are no longer eager - a
        # freshly-unlocked one has subtopics but no final assessment until
        # they're all resolved. PATH_B_OPEN_WEB nodes (e.g. an external
        # prerequisite concept, often first in the sequence) still fill
        # eagerly via run_path_b - see roadmap_generator.py's module
        # docstring for why that split is intentional.
        if current_node["path_type"] == "path_a_dataset":
            assert current_node["assessment"] is None
        else:
            assert current_node["assessment"] is not None
        assert len(current_node["subtopics"]) > 0
        assert current_node["subtopics"][0]["status"] == "available"
        assert all(s["status"] == "locked" for s in current_node["subtopics"][1:])
        locked_nodes = [n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "locked"]
        assert all(n["subtopics"] == [] for n in locked_nodes)

        explained = client.post(f"/roadmap/explain/{node_id}", json={"session_id": session_id})
        assert explained.status_code == 200
        assert len(explained.json()["explanation"]) > 10

        # The final quiz can't be taken until every sub-concept is resolved.
        blocked = client.post(
            f"/topic/{node_id}/assessment/submit", json={"session_id": session_id, "answers": []}
        )
        assert blocked.status_code == 400

        node_after_subtopics = _pass_all_subtopics(client, session_id, node_id, current_node["subtopics"])
        assert node_after_subtopics["project"] is not None
        assert node_after_subtopics["assessment"] is not None

        questions = node_after_subtopics["assessment"]["questions"]
        correct_answers = [q["options"][q["correct_option_index"]] for q in questions]

        submitted = client.post(
            f"/topic/{node_id}/assessment/submit",
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


def test_subtopic_quiz_generate_submit_skip_and_regenerate_topic():
    with TestClient(app) as client:
        created = client.post("/session")
        session_id = created.json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})
        confirmed_state = client.post("/roadmap/confirm", json={"session_id": session_id}).json()["state"]
        current_node = next(n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "available")
        node_id = current_node["node_id"]
        subtopics = current_node["subtopics"]
        first_id = subtopics[0]["subtopic_id"]

        if len(subtopics) > 1:
            # Locked (not-yet-reached) subtopics can't start a quiz.
            second_id = subtopics[1]["subtopic_id"]
            blocked = client.post(
                f"/topic/{node_id}/subtopic/{second_id}/quiz/generate", json={"session_id": session_id}
            )
            assert blocked.status_code == 400

        generated = client.post(
            f"/topic/{node_id}/subtopic/{first_id}/quiz/generate", json={"session_id": session_id}
        )
        assert generated.status_code == 200
        gen_node = next(n for n in generated.json()["state"]["roadmap"]["nodes"] if n["node_id"] == node_id)
        quiz = next(s for s in gen_node["subtopics"] if s["subtopic_id"] == first_id)["quiz"]
        assert len(quiz["questions"]) >= 1

        wrong = ["definitely not a real option"] * len(quiz["questions"])
        failed = client.post(
            f"/topic/{node_id}/subtopic/{first_id}/quiz/submit",
            json={"session_id": session_id, "answers": wrong},
        )
        assert failed.status_code == 200
        assert failed.json()["passed"] is False
        after_fail_node = next(
            n for n in failed.json()["state"]["roadmap"]["nodes"] if n["node_id"] == node_id
        )
        assert next(s for s in after_fail_node["subtopics"] if s["subtopic_id"] == first_id)["status"] == "available"

        correct = [q["options"][q["correct_option_index"]] for q in quiz["questions"]]
        passed = client.post(
            f"/topic/{node_id}/subtopic/{first_id}/quiz/submit",
            json={"session_id": session_id, "answers": correct},
        )
        assert passed.status_code == 200
        assert passed.json()["passed"] is True
        passed_node = next(n for n in passed.json()["state"]["roadmap"]["nodes"] if n["node_id"] == node_id)
        assert next(s for s in passed_node["subtopics"] if s["subtopic_id"] == first_id)["status"] == "passed"

        if len(subtopics) > 1:
            second_id = subtopics[1]["subtopic_id"]
            assert next(s for s in passed_node["subtopics"] if s["subtopic_id"] == second_id)["status"] == "available"
            # Per-subtopic skip is allowed (unlike the mandatory final quiz).
            skipped = client.post(
                f"/topic/{node_id}/subtopic/{second_id}/skip", json={"session_id": session_id}
            )
            assert skipped.status_code == 200
            skipped_node = next(
                n for n in skipped.json()["state"]["roadmap"]["nodes"] if n["node_id"] == node_id
            )
            assert next(s for s in skipped_node["subtopics"] if s["subtopic_id"] == second_id)["status"] == "skipped"

        regenerated = client.post(
            f"/topic/{node_id}/regenerate",
            json={"session_id": session_id, "instructions": "make it more example-driven"},
        )
        assert regenerated.status_code == 200
        regenerated_node = next(
            n for n in regenerated.json()["state"]["roadmap"]["nodes"] if n["node_id"] == node_id
        )
        assert regenerated_node["project"] is not None
        assert regenerated_node["assessment"] is not None
        assert regenerated_node["project"]["title"]


def _skip_all_subtopics_and_reach_final_quiz(client: TestClient, session_id: str, node_id: str, node: dict) -> dict:
    """Skips every subtopic (cheap - no quiz-generation LLM calls) so the
    node's final quiz/project generate, for tests that only care about
    behavior downstream of "all subtopics resolved"."""
    while any(s["status"] in ("available", "locked") for s in node["subtopics"]):
        available = next(s for s in node["subtopics"] if s["status"] == "available")
        resp = client.post(
            f"/topic/{node_id}/subtopic/{available['subtopic_id']}/skip", json={"session_id": session_id}
        )
        assert resp.status_code == 200
        node = next(n for n in resp.json()["state"]["roadmap"]["nodes"] if n["node_id"] == node_id)
    return node


def test_expand_project_is_cached():
    with TestClient(app) as client:
        created = client.post("/session")
        session_id = created.json()["session_id"]
        _seed_goal(session_id, "become a backend developer")
        client.post("/roadmap/generate/path-a", json={"session_id": session_id})
        confirmed_state = client.post("/roadmap/confirm", json={"session_id": session_id}).json()["state"]
        current_node = next(n for n in confirmed_state["roadmap"]["nodes"] if n["status"] == "available")
        node_id = current_node["node_id"]

        node = _skip_all_subtopics_and_reach_final_quiz(client, session_id, node_id, current_node)
        assert node["project"] is not None

        first = client.post(f"/topic/{node_id}/project/expand", json={"session_id": session_id})
        assert first.status_code == 200
        detailed = first.json()["detailed_description"]
        assert len(detailed) > 10

        # Cached on node.project.detailed_description - second call returns
        # the same text without erroring, whether or not it re-spends a call.
        second = client.post(f"/topic/{node_id}/project/expand", json={"session_id": session_id})
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
        node_id = current_node["node_id"]

        node = _skip_all_subtopics_and_reach_final_quiz(client, session_id, node_id, current_node)
        assert node["assessment"] is not None

        questions = node["assessment"]["questions"]
        correct_answers = [q["options"][q["correct_option_index"]] for q in questions]
        client.post(
            f"/topic/{node_id}/assessment/submit",
            json={"session_id": session_id, "answers": correct_answers},
        )

        resp = client.post(f"/topic/{node_id}/regenerate", json={"session_id": session_id})
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
