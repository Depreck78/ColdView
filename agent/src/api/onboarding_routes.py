"""Onboarding routes — first-run setup helpers.

Currently exposes a single broker-connect endpoint used by the onboarding
wizard's "Connect Alpaca" step: it persists the Alpaca API credentials to the
connector's own config file (``~/.coldview/alpaca.json``, owner-only) and runs a
non-mutating connection check.

Mounted by ``agent/api_server.py`` via ``register_onboarding_routes(app)``.
Loopback/API-key gated like every other write endpoint.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field

from src.api.security import require_auth

logger = logging.getLogger(__name__)


class AlpacaConnectRequest(BaseModel):
    api_key: str = ""
    secret_key: str = ""
    profile: str = Field(default="paper")  # paper | live-readonly | live
    feed: str = Field(default="iex")       # iex (free) | sip (paid)
    save: bool = True


def register_onboarding_routes(app: FastAPI) -> None:
    """Mount onboarding helper routes onto ``app``."""

    @app.get("/onboarding/broker/alpaca", dependencies=[Depends(require_auth)])
    async def alpaca_status() -> dict[str, Any]:
        """Report the saved Alpaca connection status (from ~/.coldview/alpaca.json)."""
        try:
            from src.trading.connectors.alpaca import sdk as alpaca
        except Exception as exc:  # pragma: no cover - import guard
            return {"configured": False, "ok": False, "error": f"Alpaca connector unavailable: {exc}"}
        try:
            report = alpaca.check_status()  # no arg → loads the saved config
        except Exception as exc:
            return {"configured": False, "ok": False, "error": str(exc)}
        err = str(report.get("error") or "").lower()
        ok = report.get("status") == "ok"
        configured = ok or not ("not configured" in err or "missing" in err)
        return {
            "configured": configured,
            "ok": ok,
            "report": report,
            "error": report.get("error"),
            "account": report.get("account"),
        }

    @app.post("/onboarding/broker/alpaca", dependencies=[Depends(require_auth)])
    async def connect_alpaca(body: AlpacaConnectRequest) -> dict[str, Any]:
        try:
            from src.trading.connectors.alpaca import sdk as alpaca
        except Exception as exc:  # pragma: no cover - import guard
            logger.warning("onboarding: alpaca connector unavailable: %s", exc)
            return {"ok": False, "saved": False, "error": f"Alpaca connector unavailable: {exc}"}

        try:
            cfg = alpaca.AlpacaConfig.from_mapping({
                "api_key": body.api_key.strip(),
                "secret_key": body.secret_key.strip(),
                "profile": body.profile,
                "feed": body.feed,
            })
        except Exception as exc:  # invalid profile/feed
            return {"ok": False, "saved": False, "error": str(exc)}

        # Persist credentials to the connector's owner-only config file so they
        # survive restarts and are picked up by every Alpaca tool. Saved even if
        # the live check can't run yet (e.g. alpaca-py not installed) so the
        # keys aren't lost.
        saved = False
        if body.save and body.api_key.strip() and body.secret_key.strip():
            try:
                alpaca.save_config(cfg)
                saved = True
            except Exception as exc:
                return {"ok": False, "saved": False, "error": f"Could not save Alpaca config: {exc}"}

        try:
            report = alpaca.check_status(cfg)
        except Exception as exc:  # health check should not raise, but be safe
            return {"ok": False, "saved": saved, "error": str(exc)}

        return {
            "ok": report.get("status") == "ok",
            "saved": saved,
            "report": report,
            "error": report.get("error"),
        }
