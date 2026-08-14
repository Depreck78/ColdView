"""AI provider helpers — list the models a connected provider/key can access.

Powers the AI Settings + onboarding "Cloud (API)" flow: instead of typing a
model id, the user enters their key and picks from the models the provider's
API returns. Works for OpenAI-compatible providers (``GET {base}/models`` with a
Bearer key) and Anthropic (``x-api-key`` header).

Mounted by ``agent/api_server.py`` via ``register_ai_routes(app)``.
Loopback/API-key gated. The key is used only to make the upstream request; it is
not persisted by this endpoint.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, FastAPI
from pydantic import BaseModel

from src.api.security import require_auth

logger = logging.getLogger(__name__)

_PROVIDERS_PATH = Path(__file__).resolve().parent.parent / "providers" / "llm_providers.json"


def _load_providers() -> list[dict[str, Any]]:
    try:
        data = json.loads(_PROVIDERS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _provider_cfg(name: str) -> dict[str, Any]:
    for p in _load_providers():
        if isinstance(p, dict) and p.get("name") == name:
            return p
    return {}


class ListModelsRequest(BaseModel):
    provider: str
    api_key: str = ""
    base_url: str = ""


def register_ai_routes(app: FastAPI) -> None:
    """Mount AI provider helper routes onto ``app``."""

    @app.post("/ai/models", dependencies=[Depends(require_auth)])
    async def list_models(body: ListModelsRequest) -> dict[str, Any]:
        cfg = _provider_cfg(body.provider)

        # Resolve key + base URL: request wins, else the saved env values.
        key = body.api_key.strip()
        if not key and cfg.get("api_key_env"):
            key = (os.environ.get(str(cfg["api_key_env"])) or "").strip()  # noqa: env-gate (dynamic provider key name)

        base = body.base_url.strip()
        if not base:
            env = cfg.get("base_url_env")
            base = (os.environ.get(str(env)) if env else "") or str(cfg.get("default_base_url") or "")  # noqa: env-gate (dynamic base-url env name)
        base = base.strip().rstrip("/")

        if not base:
            return {"ok": False, "error": "No base URL configured for this provider.", "models": []}
        if cfg.get("api_key_required", True) and not key:
            return {"ok": False, "error": "Enter your API key to list models.", "models": []}

        # Per-provider request shape.
        if body.provider == "anthropic":
            url = f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"
            headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
        else:
            url = f"{base}/models"
            headers = {"Authorization": f"Bearer {key}"} if key else {}

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(url, headers=headers)
        except Exception as exc:
            return {"ok": False, "error": f"Could not reach provider: {exc}", "models": []}

        if resp.status_code in (401, 403):
            return {"ok": False, "error": "Invalid or unauthorized API key.", "models": []}
        if resp.status_code >= 400:
            return {"ok": False, "error": f"Provider returned HTTP {resp.status_code}.", "models": []}

        try:
            data = resp.json()
        except Exception:
            return {"ok": False, "error": "Unexpected response from the provider.", "models": []}

        items = data.get("data") if isinstance(data, dict) else data
        models: list[str] = []
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict):
                    mid = it.get("id") or it.get("name")
                    if mid:
                        models.append(str(mid))
                elif isinstance(it, str):
                    models.append(it)

        models = sorted(set(models))
        return {"ok": True, "models": models, "count": len(models)}
