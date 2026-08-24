"""
db.py

Session persistence: one JSONB column per session (see docs/final_decisions.md
"Persistence"). No ORM - AppState.model_dump_json() writes directly to the
`state` column, AppState.model_validate_json() reads it back.
"""

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
"""


def get_connection() -> psycopg.Connection:
    return psycopg.connect(get_settings().database_url, row_factory=dict_row)


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(_SCHEMA)


def create_session(state: AppState) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (session_id, state) VALUES (%s, %s)",
            (state.session_id, state.model_dump_json()),
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
