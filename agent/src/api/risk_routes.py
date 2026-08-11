"""Risk HTTP routes (Agentic Risk CIO — Milestone 0).

Mounted by ``agent/api_server.py`` via ``register_risk_routes(app)``.

Milestone 0 surfaces the existing, unit-tested ``backtest.risk_xray`` engine
over HTTP so the frontend Risk page can render a portfolio risk x-ray
(concentration/HHI, annualized volatility, max drawdown, historical
VaR/expected shortfall, diversification, correlation/beta) for an explicit
basket. The math and the loader-fallback data fetch already live in
``src.tools.portfolio_risk_tool.PortfolioRiskXrayTool`` — this route only does
request validation, rate limiting, and error mapping, so the endpoint and the
agent tool can never drift apart.
"""

from __future__ import annotations

import json
import logging
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, status
from pydantic import BaseModel, Field

from src.api.system_routes import _SlidingWindowRateLimiter, _client_key

logger = logging.getLogger(__name__)

# A risk x-ray fetches up to a year of daily bars for every symbol in the
# basket, so it is heavier than /correlation; a tighter ceiling is warranted.
_risk_rate_limiter = _SlidingWindowRateLimiter(max_requests=20, window_seconds=60.0)


# ---------------------------------------------------------------------------
# Pydantic models (defined locally -- NO shared modules, per maintainer rule)
# ---------------------------------------------------------------------------

class RiskXrayRequest(BaseModel):
    """Request body for POST /risk/xray."""

    symbols: List[str] = Field(
        ..., description="Symbols in the basket, e.g. [\"AAPL.US\", \"MSFT.US\", \"SPY\"]."
    )
    weights: Optional[Dict[str, float]] = Field(
        None, description="Optional symbol → weight map. Equal weights when omitted."
    )
    start_date: Optional[str] = Field(
        None, description="YYYY-MM-DD. Defaults to one year before end_date."
    )
    end_date: Optional[str] = Field(
        None, description="YYYY-MM-DD. Defaults to today (UTC)."
    )
    source: str = Field(
        "auto", description="Data source preference; 'auto' walks the fallback chain."
    )
    interval: str = Field("1D", description="Bar interval passed to the loaders.")
    benchmark: Optional[str] = Field(
        None,
        description=(
            "Benchmark symbol for CAPM beta (e.g. 'SPY'). When omitted, the "
            "regional benchmark is inferred from the basket. '' skips CAPM."
        ),
    )


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def register_risk_routes(app: FastAPI) -> None:
    """Mount the risk routes onto ``app``.

    Resolves ``require_auth`` from the host ``api_server`` module via
    ``sys.modules`` (same pattern as ``register_system_routes``).
    """
    import sys as _sys

    host = _sys.modules.get("api_server") or _sys.modules.get("agent.api_server")
    if host is None:
        raise RuntimeError(
            "register_risk_routes: api_server module not in sys.modules; "
            "ensure api_server is imported before calling this function"
        )
    require_auth = host.require_auth

    @app.post("/risk/xray", dependencies=[Depends(require_auth)])
    async def post_risk_xray(request: Request, body: RiskXrayRequest):
        """Portfolio risk x-ray for an explicit basket.

        Fetches recent daily closes for each symbol through the loader
        fallback chain and returns concentration (HHI/effective N),
        annualized volatility, max drawdown, historical VaR/expected
        shortfall, diversification, and correlation/beta. Long-only; weights
        are renormalized when they do not sum to 1.
        """
        from src.tools.portfolio_risk_tool import PortfolioRiskXrayTool

        if not _risk_rate_limiter.allow(_client_key(request)):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded, try again later",
            )

        symbols = [s.strip() for s in body.symbols if isinstance(s, str) and s.strip()]
        if len(symbols) < 1:
            raise HTTPException(status_code=400, detail="At least 1 symbol required")

        tool = PortfolioRiskXrayTool()
        raw = tool.execute(
            symbols=symbols,
            weights=body.weights,
            start_date=body.start_date,
            end_date=body.end_date,
            source=body.source,
            interval=body.interval,
            benchmark=body.benchmark,
        )

        # The tool always returns a strict-JSON envelope: {"status": "ok",
        # "data": ..., "meta": ...} or {"status": "error", "error": ...}.
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            logger.exception("risk x-ray returned non-JSON for symbols=%s", symbols)
            raise HTTPException(status_code=500, detail="Risk x-ray computation failed")

        if payload.get("status") == "error":
            # Bad basket / insufficient data is a client error, not a 500.
            raise HTTPException(status_code=400, detail=str(payload.get("error")))

        return payload
