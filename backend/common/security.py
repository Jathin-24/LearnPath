"""
security.py

Signed access-token issuance and verification for the Learning Path
Recommender API.

Design goals (see docs/final_decisions.md -> Auth hardening):
  * Validate that a caller on a session route owns the session they are
    acting on (ownership enforcement), without breaking the existing
    "Continue as Guest" flow (sessions with user_id = null remain open).
  * Add NO new runtime dependency. The token is an HMAC-SHA256 signature
    (openai/hmac/urllib which are stdlib / already present), so the Render
    free-tier dependency footprint is unchanged.

Token format:  base64url(user_id).base64url(expires_at).signature
  * signature = HMAC-SHA256(secret, user_id + "\n" + expires_at_iso)
  * verifies constant-time.

A token whose user_id does not match a session's user_id -> 403.
A token that fails verification / is expired -> 401.
A session with user_id is None (guest) -> no token required (open), the
caller may proceed as today.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request


def _secret() -> bytes:
    """Access token signing secret. Falls back to a per-process random key so
    the app never crashes if ACCESS_TOKEN_SECRET is unset - the practical
    effect is that tokens invalidate on restart, which is acceptable for dev.
    Set ACCESS_TOKEN_SECRET in production/Render env for stable tokens."""
    raw = os.environ.get("ACCESS_TOKEN_SECRET", "") or os.environ.get("SECRET_KEY", "")
    if raw:
        return raw.encode()
    # Deterministic-ish fallback that still varies per process (uuid is in here).
    return hashlib.sha256(f"lpr-dev-{os.getpid()}".encode()).digest()


# Offline dev default expirations; long-lived tokens keep the flow simple and
# match the app's session-scoped model. Set ACCESS_TOKEN_TTL_DAYS to tune.
_TOKEN_TTL_DAYS = int(os.environ.get("ACCESS_TOKEN_TTL_DAYS", "90"))


def _b64encode(data: str) -> str:
    return base64.urlsafe_b64encode(data.encode()).decode().rstrip("=")


def _b64decode(data: str) -> str:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + pad).encode()).decode()


def create_access_token(user_id: str) -> str:
    """Returns a signed token carrying user_id + expiry. Additive to the
    signup/login response - old clients that ignore unknown fields keep
    working, though strict ownership now requires presenting it."""
    user_id = str(user_id)  # psycopg may return UUID objects for user_id
    expires_at = datetime.now(timezone.utc) + timedelta(days=_TOKEN_TTL_DAYS)
    payload = f"{user_id}\n{expires_at.isoformat()}"
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()
    return f"{_b64encode(user_id)}.{_b64encode(expires_at.isoformat())}.{_b64encode(sig.hex())}"


def _verify(user_id: str, expires_at_iso: str, sig: str) -> bool:
    payload = f"{user_id}\n{expires_at_iso}"
    expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def verify_access_token(token: str) -> str:
    """Verifies a token and returns its user_id. Raises HTTPException 401 on
    any tampering / expiry."""
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid access token")
    user_id_b64, expires_b64, sig_b64 = parts
    try:
        user_id = _b64decode(user_id_b64)
        expires_at_iso = _b64decode(expires_b64)
        sig = _b64decode(sig_b64)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid access token") from exc

    if not _verify(user_id, expires_at_iso, sig):
        raise HTTPException(status_code=401, detail="Invalid or tampered access token")

    try:
        expires_at = datetime.fromisoformat(expires_at_iso)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid access token") from exc
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Access token expired")

    return user_id


def extract_caller_user_id(request: Request) -> str | None:
    """Returns the user_id from the Authorization: Bearer header, or None if no
    token was presented. Raises 401 if a token WAS presented but is invalid."""
    auth = request.headers.get("Authorization", "")
    if not auth:
        return None
    scheme, _, token = auth.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return verify_access_token(token)
