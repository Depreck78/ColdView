"""Morning Research route — watchlist news digest + movers + daily brief.

Powers the Coldview "Morning Research" retention workflow. Aggregates recent
per-symbol news via the existing news fetchers (Yahoo Finance for US/HK,
Eastmoney for China A-shares) and composes a lightweight heuristic brief.

Returns a camelCase payload that matches the frontend ``MorningBrief`` type
(``frontend/src/types/morning.ts``) so the client needs no field mapping.

Mounted by ``agent/api_server.py`` via ``register_morning_routes(app)``.

This surface is read-only research context. Nothing here is investment advice.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, Query

from src.api.security import require_auth

logger = logging.getLogger(__name__)

DEFAULT_WATCHLIST = ["AAPL.US", "MSFT.US", "NVDA.US", "TSLA.US", "00700.HK"]

# Tiny sentiment lexicon for a dependency-free tag. A heuristic triage cue for
# research only — NOT a sentiment model and NOT investment advice.
_POS = {
    "beat", "beats", "surge", "surges", "soar", "soars", "rally", "rallies",
    "raise", "raises", "raised", "upgrade", "upgraded", "record", "growth",
    "strong", "jump", "jumps", "gain", "gains", "win", "wins", "approval", "tops",
}
_NEG = {
    "miss", "misses", "missed", "plunge", "plunges", "fall", "falls", "drop",
    "drops", "cut", "cuts", "downgrade", "downgraded", "warning", "warns",
    "lawsuit", "probe", "recall", "slump", "weak", "halt", "halts", "delay", "delays",
}


def _sentiment(text: str) -> str:
    """Classify text as positive/negative/neutral via a small keyword lexicon."""
    low = (text or "").lower()
    pos = sum(1 for w in _POS if w in low)
    neg = sum(1 for w in _NEG if w in low)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def _fetch_symbol_news(symbol: str, limit: int) -> list[dict[str, Any]]:
    """Fetch recent articles for one symbol, routed by exchange suffix.

    Reuses the shared fetchers in ``stock_news_tool`` so behaviour matches the
    agent's ``get_stock_news`` tool. Failures degrade to an empty list for that
    symbol rather than failing the whole request.
    """
    try:
        from src.tools.stock_news_tool import (
            _bare_query,
            _fetch_eastmoney_news,
            _fetch_yahoo_news,
            _suffix_of,
        )
    except Exception as exc:  # pragma: no cover - import guard
        logger.warning("morning: stock_news_tool unavailable: %s", exc)
        return []

    query = _bare_query(symbol)
    suffix = _suffix_of(symbol)
    try:
        if suffix in ("SH", "SZ", "BJ"):
            return _fetch_eastmoney_news(query, limit)
        return _fetch_yahoo_news(query, limit)
    except Exception as exc:
        logger.debug("morning: news fetch failed for %s: %s", symbol, exc)
        return []


def _parse_symbols(symbols: str | None) -> list[str]:
    if not symbols:
        return list(DEFAULT_WATCHLIST)
    out: list[str] = []
    for raw in symbols.split(","):
        sym = raw.strip().upper()
        if sym and sym not in out:
            out.append(sym)
    return out[:20] or list(DEFAULT_WATCHLIST)


def _greeting(now: datetime) -> str:
    hour = now.hour
    if hour < 12:
        return "Good morning"
    if hour < 18:
        return "Good afternoon"
    return "Good evening"


def _compose_brief(watchlist: list[str], news: list[dict[str, Any]]) -> tuple[str, str]:
    """Build a short heuristic brief from the fetched headlines.

    An LLM summary can be slotted in here when a provider is configured (see the
    agent runtime); kept heuristic so this route has no hard LLM dependency.
    Returns ``(brief_text, brief_source)``.
    """
    if not news:
        return (
            "No fresh headlines pulled for your watchlist yet — add symbols or "
            "check your data sources in Settings. Either way, review your open "
            "risk and today's catalysts before the bell.",
            "heuristic",
        )
    pos = sum(1 for n in news if n.get("sentiment") == "positive")
    neg = sum(1 for n in news if n.get("sentiment") == "negative")
    tone = "constructive" if pos > neg else "cautious" if neg > pos else "mixed"
    symbols_with_news = sorted({n["symbol"] for n in news})
    lead = ", ".join(symbols_with_news[:5])
    return (
        f"{len(news)} headlines across {len(symbols_with_news)} of your "
        f"{len(watchlist)} watchlist names this morning; overall flow reads "
        f"{tone} ({pos} positive / {neg} negative). In focus: {lead}. Tie each "
        "headline back to your thesis and size to your plan — this is research "
        "context, not a recommendation.",
        "heuristic",
    )


async def _market_summary(watchlist: list[str], news: list[dict[str, str]]) -> tuple[str, str]:
    """Write a concise AI market summary from headlines; fall back to heuristic.

    Returns ``(text, source)`` where source is "ai" or "heuristic".
    """
    if not news:
        return _compose_brief(watchlist, news)[0], "heuristic"

    try:
        from fastapi.concurrency import run_in_threadpool
        from src.providers.llm import build_llm
        llm = build_llm()
    except Exception as exc:  # LLM not configured
        logger.debug("morning summary: LLM unavailable: %s", exc)
        return _compose_brief(watchlist, news)[0], "heuristic"

    headlines = "\n".join(
        f"- [{n['symbol']}] {n['title']}" + (f" — {n['snippet']}" if n.get("snippet") else "")
        for n in news[:24]
    )
    prompt = (
        "You are a market analyst writing a concise pre-market brief for a trader. "
        "Using ONLY the headlines below, summarize the key market themes and notable moves in a "
        "few tight sentences or short bullets — key points only, no filler, no preamble. Then add a "
        "final line starting with 'Watch:' flagging 1-3 concrete opportunities or risks to watch "
        "today. Keep it brief. Do not give financial advice.\n\nHeadlines:\n" + headlines
    )
    try:
        resp = await run_in_threadpool(llm.invoke, prompt)
        text = (getattr(resp, "content", None) or str(resp)).strip()
        return (text, "ai") if text else (_compose_brief(watchlist, news)[0], "heuristic")
    except Exception as exc:
        logger.warning("morning summary LLM failed: %s", exc)
        return _compose_brief(watchlist, news)[0], "heuristic"


def register_morning_routes(app: FastAPI) -> None:
    """Mount the Morning Research route onto ``app``."""

    @app.get("/morning", dependencies=[Depends(require_auth)])
    async def get_morning_brief(
        symbols: str | None = Query(
            default=None,
            description="Comma-separated watchlist, e.g. 'AAPL.US,00700.HK'.",
        ),
        per_symbol: int = Query(default=4, ge=1, le=10),
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        watchlist = _parse_symbols(symbols)

        news: list[dict[str, Any]] = []
        for sym in watchlist:
            for idx, art in enumerate(_fetch_symbol_news(sym, per_symbol)):
                title = str(art.get("title") or "").strip()
                if not title:
                    continue
                snippet = str(art.get("snippet") or "").strip()
                url = str(art.get("url") or "#")
                news.append(
                    {
                        "id": f"{sym}-{idx}-{abs(hash(url or title)) % 10_000_000}",
                        "symbol": sym,
                        "title": title,
                        "source": str(art.get("source") or "News"),
                        "url": url,
                        "published": str(art.get("published") or ""),
                        "snippet": snippet,
                        "sentiment": _sentiment(f"{title} {snippet}"),
                        "kind": "news",
                    }
                )

        brief, brief_source = _compose_brief(watchlist, news)

        return {
            "date": now.date().isoformat(),
            "generatedAt": now.isoformat(),
            "greeting": _greeting(now),
            "brief": brief,
            "briefSource": brief_source,
            "watchlist": watchlist,
            # Live movers need a broker/quote source; the client shows an
            # empty-state prompt when this is empty. Kept [] to avoid a hard
            # dependency on any single market-data provider.
            "movers": [],
            "news": news,
            "isSample": False,
        }

    @app.get("/morning/summary", dependencies=[Depends(require_auth)])
    async def morning_summary(
        symbols: str | None = Query(default=None),
        per_symbol: int = Query(default=4, ge=1, le=8),
    ) -> dict[str, Any]:
        """AI market summary (news-driven) + optional portfolio summary.

        The market section is written by the configured LLM from the headlines;
        it falls back to the heuristic brief if the model is unavailable. The
        portfolio section is null until a broker/positions source is wired, so
        the client hides it.
        """
        watchlist = _parse_symbols(symbols)
        news: list[dict[str, str]] = []
        for sym in watchlist:
            for art in _fetch_symbol_news(sym, per_symbol):
                title = str(art.get("title") or "").strip()
                if title:
                    news.append({"symbol": sym, "title": title, "snippet": str(art.get("snippet") or "").strip()})

        market, source = await _market_summary(watchlist, news)
        return {"market": market, "portfolio": None, "source": source}
