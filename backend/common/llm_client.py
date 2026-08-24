"""
llm_client.py

Shared LLM client for the LIVE agent runtime (distinct from the offline
enrich_courses.py client, which only ever needed one key for a one-time job).

This is what every agent imports. It solves the problem you asked for:
"multiple API keys, when limit exceeds, automatically switch to the other."

Design:
- You configure a PRIORITY-ORDERED list of "endpoints" (provider + api_key +
  model). Could be multiple keys for the same provider (e.g. two xAI keys on
  different accounts) and/or multiple providers (xAI, Anthropic, etc.)
- On each call, it tries endpoints in priority order.
- If an endpoint fails with a rate-limit/quota-type error, it's marked
  "cooling down" for a backoff window and the client moves to the next
  endpoint immediately (no waiting) - this is what keeps the orchestrator
  from stalling mid-conversation.
- If an endpoint fails with a transient error (timeout, 5xx), it retries
  that SAME endpoint with exponential backoff up to a max, then moves on.
- If an endpoint fails with a non-retryable error (bad request, auth
  failure), it's marked "dead" for this process run and skipped entirely.
- If ALL endpoints are exhausted, raises AllEndpointsExhaustedError - the
  orchestrator should catch this and degrade gracefully (e.g. tell the user
  "having trouble reaching the AI service, please try again shortly")
  rather than crash.

Configure endpoints via environment variables (comma-separated, same order):
    LLM_PROVIDERS=xai,xai,anthropic
    LLM_API_KEYS=key1,key2,key3
    LLM_MODELS=grok-4,grok-4,claude-sonnet-4-6
"""

import os
import time
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("llm_client")

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    import openai
except ImportError:
    openai = None


class EndpointState(str, Enum):
    HEALTHY = "healthy"
    COOLING_DOWN = "cooling_down"   # hit rate limit, temporarily skipped
    DEAD = "dead"                    # non-retryable error, skipped for this run


class RateLimitError(Exception):
    """Raised internally when a provider signals rate-limit/quota exhaustion."""


class TransientError(Exception):
    """Raised internally for retryable errors (timeouts, 5xx)."""


class NonRetryableError(Exception):
    """Raised internally for errors that mean this endpoint is unusable (bad auth etc)."""


class AllEndpointsExhaustedError(Exception):
    """Raised when every configured endpoint failed for this call."""


@dataclass
class Endpoint:
    provider: str          # "xai" | "anthropic"
    api_key: str
    model: str
    state: EndpointState = EndpointState.HEALTHY
    cooldown_until: float = 0.0   # epoch seconds
    consecutive_failures: int = 0

    def label(self) -> str:
        # last 4 chars of key only, for logging - never log full keys
        return f"{self.provider}:{self.model}:...{self.api_key[-4:]}"

    def is_available(self) -> bool:
        if self.state == EndpointState.DEAD:
            return False
        if self.state == EndpointState.COOLING_DOWN:
            if time.time() >= self.cooldown_until:
                self.state = EndpointState.HEALTHY
                return True
            return False
        return True


def _classify_error(provider: str, exc: Exception) -> type:
    """Map a provider-specific exception to one of our internal error types."""
    msg = str(exc).lower()
    status = getattr(exc, "status_code", None)

    if status == 429 or "rate limit" in msg or "quota" in msg or "insufficient_quota" in msg:
        return RateLimitError
    if status in (401, 403) or "invalid api key" in msg or "authentication" in msg:
        return NonRetryableError
    if status and status >= 500:
        return TransientError
    if "timeout" in msg or "connection" in msg:
        return TransientError
    # default: treat unknown errors as transient rather than dead, so we don't
    # permanently blacklist an endpoint over one weird one-off error
    return TransientError


class LLMClient:
    def __init__(self, endpoints: Optional[list[Endpoint]] = None,
                 max_retries_per_endpoint: int = 2,
                 base_backoff_seconds: float = 1.0,
                 rate_limit_cooldown_seconds: float = 60.0):
        self.endpoints = endpoints or self._load_endpoints_from_env()
        if not self.endpoints:
            raise ValueError(
                "No LLM endpoints configured. Set LLM_PROVIDERS / LLM_API_KEYS / "
                "LLM_MODELS environment variables (comma-separated, same order)."
            )
        self.max_retries_per_endpoint = max_retries_per_endpoint
        self.base_backoff_seconds = base_backoff_seconds
        self.rate_limit_cooldown_seconds = rate_limit_cooldown_seconds
        self._clients_cache = {}

    @staticmethod
    def _load_endpoints_from_env() -> list[Endpoint]:
        providers = os.environ.get("LLM_PROVIDERS", "")
        keys = os.environ.get("LLM_API_KEYS", "")
        models = os.environ.get("LLM_MODELS", "")

        providers = [p.strip() for p in providers.split(",") if p.strip()]
        keys = [k.strip() for k in keys.split(",") if k.strip()]
        models = [m.strip() for m in models.split(",") if m.strip()]

        if not (len(providers) == len(keys) == len(models)):
            raise ValueError(
                f"LLM_PROVIDERS ({len(providers)}), LLM_API_KEYS ({len(keys)}), "
                f"LLM_MODELS ({len(models)}) must all have the same length."
            )
        return [Endpoint(provider=p, api_key=k, model=m)
                for p, k, m in zip(providers, keys, models)]

    # OpenAI-compatible providers: same SDK, just a different base_url.
    _OPENAI_COMPATIBLE_BASE_URLS = {
        "xai": "https://api.x.ai/v1",
        "groq": "https://api.groq.com/openai/v1",
        "openrouter": "https://openrouter.ai/api/v1",
    }

    def _get_provider_client(self, endpoint: Endpoint):
        cache_key = (endpoint.provider, endpoint.api_key)
        if cache_key in self._clients_cache:
            return self._clients_cache[cache_key]

        if endpoint.provider in self._OPENAI_COMPATIBLE_BASE_URLS:
            if openai is None:
                raise SystemExit("Run: pip install openai --break-system-packages")
            client = openai.OpenAI(
                api_key=endpoint.api_key,
                base_url=self._OPENAI_COMPATIBLE_BASE_URLS[endpoint.provider],
            )
        elif endpoint.provider == "anthropic":
            if anthropic is None:
                raise SystemExit("Run: pip install anthropic --break-system-packages")
            client = anthropic.Anthropic(api_key=endpoint.api_key)
        else:
            raise ValueError(f"Unknown provider: {endpoint.provider}")

        self._clients_cache[cache_key] = client
        return client

    def _call_endpoint(self, endpoint: Endpoint, prompt: str, max_tokens: int) -> str:
        client = self._get_provider_client(endpoint)
        try:
            if endpoint.provider in self._OPENAI_COMPATIBLE_BASE_URLS:
                response = client.chat.completions.create(
                    model=endpoint.model,
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": prompt}],
                )
                return response.choices[0].message.content.strip()
            else:  # anthropic
                response = client.messages.create(
                    model=endpoint.model,
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": prompt}],
                )
                return response.content[0].text.strip()
        except Exception as exc:
            error_type = _classify_error(endpoint.provider, exc)
            raise error_type(str(exc)) from exc

    def complete(self, prompt: str, max_tokens: int = 600) -> str:
        """Try endpoints in priority order with retry + failover. This is the
        only method agents should call."""
        last_exception = None

        for endpoint in self.endpoints:
            if not endpoint.is_available():
                continue

            for attempt in range(self.max_retries_per_endpoint):
                try:
                    result = self._call_endpoint(endpoint, prompt, max_tokens)
                    endpoint.consecutive_failures = 0
                    return result

                except RateLimitError as exc:
                    logger.warning(
                        f"{endpoint.label()} rate-limited, cooling down "
                        f"{self.rate_limit_cooldown_seconds}s, trying next endpoint."
                    )
                    endpoint.state = EndpointState.COOLING_DOWN
                    endpoint.cooldown_until = time.time() + self.rate_limit_cooldown_seconds
                    last_exception = exc
                    break  # don't retry this endpoint, move to next one immediately

                except NonRetryableError as exc:
                    logger.error(f"{endpoint.label()} non-retryable error, marking dead: {exc}")
                    endpoint.state = EndpointState.DEAD
                    last_exception = exc
                    break  # move to next endpoint

                except TransientError as exc:
                    endpoint.consecutive_failures += 1
                    backoff = self.base_backoff_seconds * (2 ** attempt)
                    logger.warning(
                        f"{endpoint.label()} transient error (attempt "
                        f"{attempt+1}/{self.max_retries_per_endpoint}), "
                        f"retrying in {backoff}s: {exc}"
                    )
                    last_exception = exc
                    if attempt < self.max_retries_per_endpoint - 1:
                        time.sleep(backoff)
                    # else: exhausted retries on this endpoint, loop moves to next endpoint

        raise AllEndpointsExhaustedError(
            f"All {len(self.endpoints)} endpoint(s) failed or unavailable. "
            f"Last error: {last_exception}"
        )

    def status(self) -> list[dict]:
        """For a /health or /debug endpoint - shows endpoint states without leaking keys."""
        return [
            {
                "label": e.label(),
                "state": e.state.value,
                "cooldown_remaining_seconds": max(0, round(e.cooldown_until - time.time())),
                "consecutive_failures": e.consecutive_failures,
            }
            for e in self.endpoints
        ]
