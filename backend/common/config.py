"""
config.py

Central place that reads environment variables. Nothing else in the backend
should call os.environ directly for these values - import Settings from here.
"""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    database_url: str = os.environ.get("DATABASE_URL", "")
    llm_providers: str = os.environ.get("LLM_PROVIDERS", "")
    llm_api_keys: str = os.environ.get("LLM_API_KEYS", "")
    llm_models: str = os.environ.get("LLM_MODELS", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
