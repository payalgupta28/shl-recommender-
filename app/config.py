"""
config.py
=========
Central place for settings. Values can come from environment variables (good for
the deployed service / SHL's evaluator) OR from the request headers sent by our
web UI (good for the user who pastes their own free-tier key).

We support three free-tier providers. Each has a sensible default model that you
can override from the UI or with an env var.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()  # read a local .env file if present (never committed)

# Default model per provider. These are good free-tier choices as of 2026;
# the UI lets the user override them.
DEFAULT_MODELS = {
    "groq": "llama-3.3-70b-versatile",
    "gemini": "gemini-2.5-flash",
    "openrouter": "meta-llama/llama-3.3-70b-instruct:free",
}

SUPPORTED_PROVIDERS = tuple(DEFAULT_MODELS.keys())

# How many catalog items we retrieve and hand to the LLM as grounded candidates.
RETRIEVE_K = int(os.getenv("RETRIEVE_K", "30"))

# Hard limit from the SHL spec: a shortlist is 1..10 items.
MAX_RECOMMENDATIONS = 10

# SHL caps each conversation at 8 messages (user + assistant combined).
MAX_TURNS = 8

# Stay safely under the evaluator's 30s per-call timeout.
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "24"))


@dataclass
class LLMCredentials:
    """Resolved LLM settings for a single /chat call."""
    provider: str
    api_key: str
    model: str

    @property
    def is_usable(self) -> bool:
        return bool(self.provider) and bool(self.api_key)


def resolve_credentials(
    header_provider: str | None,
    header_key: str | None,
    header_model: str | None,
) -> LLMCredentials:
    """
    Decide which LLM to use for THIS request.

    Priority: request headers (the UI) win over environment variables (the
    server). This lets a user try their own key without redeploying, while the
    deployed instance can still serve SHL's evaluator using a server-side key.
    """
    provider = (header_provider or os.getenv("LLM_PROVIDER") or "").strip().lower()
    api_key = (header_key or os.getenv("LLM_API_KEY") or "").strip()
    model = (header_model or os.getenv("LLM_MODEL") or "").strip()

    if provider and provider not in SUPPORTED_PROVIDERS:
        provider = ""  # unknown provider -> treat as "no LLM configured"

    if provider and not model:
        model = DEFAULT_MODELS[provider]

    return LLMCredentials(provider=provider, api_key=api_key, model=model)


def server_llm_ready() -> bool:
    """True if the server itself has an LLM key (so the UI need not ask for one)."""
    return resolve_credentials(None, None, None).is_usable
