"""
db.py

Session persistence: one JSONB column per session (see docs/final_decisions.md
"Persistence"). No ORM - AppState.model_dump_json() writes directly to the
`state` column, AppState.model_validate_json() reads it back.

Also holds: simple username/password users (one session per user - no
multi-session UI, per the user's "simple, no friction" request) and a
roadmap_templates cache so similar goals reuse a previously-generated
roadmap instead of regenerating from scratch every time (see
backend/agents/path_a.py).
"""

import json
import uuid

import psycopg
from psycopg.rows import dict_row

from backend.common.config import get_settings
from backend.orchestrator.state_schema import AppState

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id);

CREATE TABLE IF NOT EXISTS roadmap_templates (
    template_id UUID PRIMARY KEY,
    goal_text TEXT NOT NULL,
    goal_embedding JSONB NOT NULL,
    nodes_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    usage_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_knowledge (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id),
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resume_files (
    user_id UUID PRIMARY KEY REFERENCES users(user_id),
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    data BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def get_connection() -> psycopg.Connection:
    return psycopg.connect(get_settings().database_url, row_factory=dict_row)


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(_SCHEMA)


def create_session(state: AppState, user_id: str | None = None) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (session_id, user_id, state) VALUES (%s, %s, %s)",
            (state.session_id, user_id, state.model_dump_json()),
        )


def save_state(state: AppState) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE sessions SET state = %s, updated_at = now() WHERE session_id = %s",
            (state.model_dump_json(), state.session_id),
        )


def load_state(session_id: str) -> AppState | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT state FROM sessions WHERE session_id = %s", (session_id,)
        ).fetchone()
    if row is None:
        return None
    return AppState.model_validate(row["state"])


# ---------------------------------------------------------------------------
# Users (simple username/password - see docs, no OAuth/email/reset flow)
# ---------------------------------------------------------------------------

def create_user(username: str, password_hash: str) -> str:
    user_id = str(uuid.uuid4())
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO users (user_id, username, password_hash) VALUES (%s, %s, %s)",
            (user_id, username, password_hash),
        )
    return user_id


def get_user_by_username(username: str) -> dict | None:
    with get_connection() as conn:
        return conn.execute(
            "SELECT user_id, username, password_hash FROM users WHERE username = %s",
            (username,),
        ).fetchone()


def get_session_id_for_user(user_id: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT session_id FROM sessions WHERE user_id = %s", (user_id,)
        ).fetchone()
    return str(row["session_id"]) if row else None


# ---------------------------------------------------------------------------
# Roadmap templates (cross-user reuse cache)
# ---------------------------------------------------------------------------

def find_similar_template(goal_embedding: list[float], threshold: float = 0.85) -> dict | None:
    """Best-matching template (by cosine similarity of goal_embedding) at or
    above threshold, or None. Small expected table size - compares in
    Python rather than needing pgvector."""
    import numpy as np

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT template_id, goal_text, nodes_json, goal_embedding FROM roadmap_templates"
        ).fetchall()
    if not rows:
        return None

    query_vec = np.array(goal_embedding)
    query_vec = query_vec / np.linalg.norm(query_vec)

    best_row, best_score = None, threshold
    for row in rows:
        candidate = np.array(row["goal_embedding"])
        candidate = candidate / np.linalg.norm(candidate)
        score = float(np.dot(query_vec, candidate))
        if score >= best_score:
            best_score, best_row = score, row

    if best_row is not None:
        with get_connection() as conn:
            conn.execute(
                "UPDATE roadmap_templates SET usage_count = usage_count + 1 WHERE template_id = %s",
                (best_row["template_id"],),
            )
    return best_row


def save_roadmap_template(goal_text: str, goal_embedding: list[float], nodes_json: list[dict]) -> None:
    template_id = str(uuid.uuid4())
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO roadmap_templates (template_id, goal_text, goal_embedding, nodes_json) "
            "VALUES (%s, %s, %s, %s)",
            (template_id, goal_text, json.dumps(goal_embedding), json.dumps(nodes_json)),
        )


# ---------------------------------------------------------------------------
# Per-user knowledge base (structured facts extracted from imported context /
# resumes - see backend/agents/knowledge_extractor.py. Keyed by user_id, not
# session_id, so it survives /goal/restart's per-session profile reset.)
# ---------------------------------------------------------------------------

def add_knowledge_entries(user_id: str, entries: list[dict]) -> None:
    """entries: list of {"category": str, "content": str, "source": str}."""
    if not entries:
        return
    with get_connection() as conn:
        for entry in entries:
            conn.execute(
                "INSERT INTO user_knowledge (id, user_id, category, content, source) "
                "VALUES (%s, %s, %s, %s, %s)",
                (str(uuid.uuid4()), user_id, entry["category"], entry["content"], entry["source"]),
            )


def get_knowledge_for_user(user_id: str) -> list[dict]:
    with get_connection() as conn:
        return conn.execute(
            "SELECT id, category, content, source, created_at FROM user_knowledge "
            "WHERE user_id = %s ORDER BY created_at",
            (user_id,),
        ).fetchall()


def delete_knowledge_entry(entry_id: str, user_id: str) -> None:
    """Scoped to user_id too, so one user can't delete another's entry by guessing an id."""
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM user_knowledge WHERE id = %s AND user_id = %s", (entry_id, user_id)
        )


# ---------------------------------------------------------------------------
# Resume file storage (raw PDF bytes, one per user - a fresh upload replaces
# the previous one). Separate from the `sessions.state` JSONB blob so the
# binary never round-trips through AppState serialization - see
# backend/api/main.py's /profile/resume and /profile/resume/file routes.
# ---------------------------------------------------------------------------

def save_resume_file(user_id: str, filename: str, content_type: str, data: bytes) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO resume_files (user_id, filename, content_type, data, uploaded_at) "
            "VALUES (%s, %s, %s, %s, now()) "
            "ON CONFLICT (user_id) DO UPDATE SET "
            "filename = EXCLUDED.filename, content_type = EXCLUDED.content_type, "
            "data = EXCLUDED.data, uploaded_at = EXCLUDED.uploaded_at",
            (user_id, filename, content_type, data),
        )


def get_resume_file(user_id: str) -> dict | None:
    with get_connection() as conn:
        return conn.execute(
            "SELECT filename, content_type, data, uploaded_at FROM resume_files WHERE user_id = %s",
            (user_id,),
        ).fetchone()
