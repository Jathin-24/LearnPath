"""
test_auth_routes.py

Integration test for the simple username/password auth routes (build order
Round 1), against real Postgres. Signup creates a user + their one session;
login returns the SAME session_id on repeat logins (one session per user,
per the "simple, not much logic" requirement - no multi-session UI).
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


def test_signup_then_login_returns_same_session(client):
    username = _unique_username()
    password = "correct-horse-battery-staple"

    signup_resp = client.post("/auth/signup", json={"username": username, "password": password})
    assert signup_resp.status_code == 200
    signup_body = signup_resp.json()
    assert signup_body["username"] == username
    session_id = signup_body["session_id"]

    login_resp = client.post("/auth/login", json={"username": username, "password": password})
    assert login_resp.status_code == 200
    login_body = login_resp.json()
    assert login_body["user_id"] == signup_body["user_id"]
    assert login_body["session_id"] == session_id  # same session, not a new one


def test_signup_duplicate_username_rejected(client):
    username = _unique_username()
    client.post("/auth/signup", json={"username": username, "password": "pw12345"})

    resp = client.post("/auth/signup", json={"username": username, "password": "different-pw"})
    assert resp.status_code == 409


def test_login_wrong_password_rejected(client):
    username = _unique_username()
    client.post("/auth/signup", json={"username": username, "password": "the-real-password"})

    resp = client.post("/auth/login", json={"username": username, "password": "wrong-password"})
    assert resp.status_code == 401


def test_login_unknown_username_rejected(client):
    resp = client.post(
        "/auth/login", json={"username": _unique_username(), "password": "whatever"}
    )
    assert resp.status_code == 401
