"""
test_round7_engagement_features.py

Round 7: activity streaks, achievement badges, and spaced-repetition topic
review. None of these need an LLM call (badges/streak are pure derived
state, review reuses questions already generated for the topic's own
final quiz), so these tests run fast and don't touch Groq/OpenRouter.
"""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.common import db
from backend.orchestrator.state_schema import (
    MCQQuestion,
    NodeStatus,
    PathType,
    Roadmap,
    RoadmapNode,
    TopicAssessment,
)


def _seed_one_node_roadmap(session_id: str, status: NodeStatus = NodeStatus.AVAILABLE) -> None:
    state = db.load_state(session_id)
    question = MCQQuestion(
        question="2 + 2?", options=["3", "4", "5"], correct_option_index=1, explanation="basic math"
    )
    state.roadmap = Roadmap(
        path_type=PathType.PATH_A_DATASET,
        nodes=[
            RoadmapNode(
                node_id="a",
                topic="Topic A",
                path_type=PathType.PATH_A_DATASET,
                status=status,
                assessment=TopicAssessment(questions=[question, question], pass_threshold=0.5),
            )
        ],
    )
    db.save_state(state)


def test_time_spent_and_quiz_submit_build_a_streak():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_one_node_roadmap(session_id)

        resp = client.post(f"/topic/a/time", json={"session_id": session_id, "seconds": 30})
        assert resp.status_code == 200

        state = db.load_state(session_id)
        assert state.current_streak_days == 1
        assert state.longest_streak_days == 1
        assert state.last_active_date == datetime.now(timezone.utc).date().isoformat()

        # Same day again - no double-count.
        client.post(f"/topic/a/time", json={"session_id": session_id, "seconds": 30})
        state = db.load_state(session_id)
        assert state.current_streak_days == 1


def test_streak_continues_from_yesterday_and_resets_after_a_gap():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_one_node_roadmap(session_id)

        state = db.load_state(session_id)
        yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        state.last_active_date = yesterday
        state.current_streak_days = 4
        state.longest_streak_days = 4
        db.save_state(state)

        client.post(f"/topic/a/time", json={"session_id": session_id, "seconds": 10})
        state = db.load_state(session_id)
        assert state.current_streak_days == 5
        assert state.longest_streak_days == 5

        # Now simulate a 3-day-old last-active date - the streak must reset,
        # not continue.
        long_ago = (datetime.now(timezone.utc).date() - timedelta(days=3)).isoformat()
        state.last_active_date = long_ago
        db.save_state(state)

        client.post(f"/topic/a/time", json={"session_id": session_id, "seconds": 10})
        state = db.load_state(session_id)
        assert state.current_streak_days == 1
        assert state.longest_streak_days == 5  # best-ever streak is preserved


def test_dashboard_badges_reflect_progress():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_one_node_roadmap(session_id, status=NodeStatus.AVAILABLE)

        before = client.get(f"/dashboard/{session_id}").json()
        assert {b["id"]: b["achieved"] for b in before["badges"]}["first_topic"] is False

        correct_answer = "4"
        submitted = client.post(
            "/topic/a/assessment/submit",
            json={"session_id": session_id, "answers": [correct_answer, correct_answer]},
        )
        assert submitted.status_code == 200
        assert submitted.json()["passed"] is True

        after = client.get(f"/dashboard/{session_id}").json()
        achieved = {b["id"]: b["achieved"] for b in after["badges"]}
        assert achieved["first_topic"] is True
        assert achieved["perfect_quiz"] is True
        assert achieved["roadmap_complete"] is True  # only node in this fixture, now complete

        # Completing the topic should also have scheduled its first review.
        state = db.load_state(session_id)
        assert state.roadmap.get_node("a").next_review_at is not None


def test_review_due_generate_submit_and_schedule_advances():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_one_node_roadmap(session_id, status=NodeStatus.COMPLETE)

        state = db.load_state(session_id)
        node = state.roadmap.get_node("a")
        node.next_review_at = datetime(2020, 1, 1, tzinfo=timezone.utc)  # force it due
        db.save_state(state)

        due = client.get(f"/review/due/{session_id}").json()
        assert due["due"] == [{"node_id": "a", "topic": "Topic A"}]

        gen = client.post("/review/a/generate", json={"session_id": session_id})
        assert gen.status_code == 200
        question_index = gen.json()["question_index"]
        assert gen.json()["question"]["question"] == "2 + 2?"

        wrong = client.post(
            "/review/a/submit",
            json={"session_id": session_id, "question_index": question_index, "answer": "5"},
        )
        assert wrong.status_code == 200
        assert wrong.json()["correct"] is False

        state = db.load_state(session_id)
        node = state.roadmap.get_node("a")
        assert node.review_count == 0  # a wrong answer doesn't advance the schedule
        assert node.next_review_at is not None

        correct = client.post(
            "/review/a/submit",
            json={"session_id": session_id, "question_index": question_index, "answer": "4"},
        )
        assert correct.status_code == 200
        assert correct.json()["correct"] is True

        state = db.load_state(session_id)
        node = state.roadmap.get_node("a")
        assert node.review_count == 1

        # No longer due immediately after a correct answer (pushed days out).
        due_after = client.get(f"/review/due/{session_id}").json()
        assert due_after["due"] == []


def test_review_submit_rejects_invalid_question_index():
    with TestClient(app) as client:
        session_id = client.post("/session").json()["session_id"]
        _seed_one_node_roadmap(session_id, status=NodeStatus.COMPLETE)

        resp = client.post(
            "/review/a/submit",
            json={"session_id": session_id, "question_index": 99, "answer": "4"},
        )
        assert resp.status_code == 400
