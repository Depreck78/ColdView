"""Trade journal routes — store trades and generate AI reflections.

Powers the "Journal" workflow: a table of trades that the user can edit by hand,
and where the agent's model writes a per-trade reflection (what happened, why,
the lesson, and a discipline grade). Trades persist to ``~/.coldview/journal.json``.

Mounted by ``agent/api_server.py`` via ``register_journal_routes(app)``.
Loopback/API-key gated like every other write endpoint.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from src.api.security import require_auth

logger = logging.getLogger(__name__)


def _journal_path() -> Path:
    from src.config.paths import get_runtime_root
    return get_runtime_root() / "journal.json"


def _load() -> list[dict[str, Any]]:
    path = _journal_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save(trades: list[dict[str, Any]]) -> None:
    path = _journal_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(trades, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


class Trade(BaseModel):
    id: str = ""
    date: str = ""
    symbol: str = ""
    side: str = "long"           # long | short
    qty: float | None = None
    entry: float | None = None
    exit: float | None = None
    pnl: float | None = None
    pnl_pct: float | None = None
    notes: str = ""
    what_happened: str = ""
    why_happened: str = ""
    lesson: str = ""
    grade: str = ""
    ai_generated: bool = False


def _compute_pnl(t: dict[str, Any]) -> dict[str, Any]:
    """Fill pnl / pnl_pct from entry, exit, qty, side when they're absent."""
    entry, exit_, qty = t.get("entry"), t.get("exit"), t.get("qty")
    if entry and exit_ is not None and qty is not None and t.get("pnl") is None:
        sign = -1.0 if str(t.get("side")) == "short" else 1.0
        try:
            t["pnl"] = round((float(exit_) - float(entry)) * float(qty) * sign, 2)
            t["pnl_pct"] = round((float(exit_) - float(entry)) / float(entry) * sign, 4)
        except (TypeError, ValueError, ZeroDivisionError):
            pass
    return t


def _reflect_prompt(t: dict[str, Any]) -> str:
    outcome = "open"
    if t.get("pnl") is not None:
        outcome = "win" if t["pnl"] > 0 else "loss" if t["pnl"] < 0 else "scratch"
    lines = [
        f"Symbol: {t.get('symbol') or '?'}",
        f"Side: {t.get('side') or '?'}",
        f"Quantity: {t.get('qty')}",
        f"Entry: {t.get('entry')}   Exit: {t.get('exit')}",
        f"P&L: {t.get('pnl')} ({t.get('pnl_pct')})   Outcome: {outcome}",
        f"Date: {t.get('date') or '?'}",
        f"Trader notes: {t.get('notes') or '(none)'}",
    ]
    return (
        "You are a disciplined trading coach reflecting on a single trade. Be concise, "
        "specific, and honest. Reply with ONLY a JSON object with these keys:\n"
        '  "what_happened": 1-2 sentences describing the trade objectively.\n'
        '  "why_happened": 1-2 sentences on the likely cause of the outcome (setup, market, execution/psychology).\n'
        '  "lesson": if a loss, what to do differently next time; if a win, why it worked and how to repeat it.\n'
        '  "grade": a single letter A-F grading execution & discipline (NOT just profit).\n\n'
        "Trade:\n" + "\n".join(lines)
    )


def _parse_reflection(text: str) -> dict[str, str]:
    """Extract the reflection JSON; degrade to putting raw text in what_happened."""
    out = {"what_happened": "", "why_happened": "", "lesson": "", "grade": ""}
    match = re.search(r"\{.*\}", text or "", re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            for k in out:
                if isinstance(data.get(k), str):
                    out[k] = data[k].strip()
            out["grade"] = (out["grade"] or "").strip()[:2]
            if any(out.values()):
                return out
        except Exception:
            pass
    out["what_happened"] = (text or "").strip()[:600]
    return out


def register_journal_routes(app: FastAPI) -> None:
    """Mount trade-journal routes onto ``app``."""

    @app.get("/journal", dependencies=[Depends(require_auth)])
    async def list_trades() -> dict[str, Any]:
        trades = _load()
        trades.sort(key=lambda t: str(t.get("date") or ""), reverse=True)
        return {"trades": trades}

    @app.post("/journal", dependencies=[Depends(require_auth)])
    async def upsert_trade(body: Trade) -> dict[str, Any]:
        trade = _compute_pnl(body.model_dump())
        trades = _load()
        if not trade.get("id"):
            trade["id"] = uuid.uuid4().hex[:12]
            trades.append(trade)
        else:
            for i, t in enumerate(trades):
                if t.get("id") == trade["id"]:
                    trades[i] = trade
                    break
            else:
                trades.append(trade)
        _save(trades)
        return trade

    @app.delete("/journal/{trade_id}", dependencies=[Depends(require_auth)])
    async def delete_trade(trade_id: str) -> dict[str, Any]:
        trades = [t for t in _load() if t.get("id") != trade_id]
        _save(trades)
        return {"deleted": trade_id}

    @app.post("/journal/{trade_id}/reflect", dependencies=[Depends(require_auth)])
    async def reflect(trade_id: str) -> dict[str, Any]:
        trades = _load()
        trade = next((t for t in trades if t.get("id") == trade_id), None)
        if trade is None:
            raise HTTPException(status_code=404, detail="Trade not found")

        try:
            from src.providers.llm import build_llm
            llm = build_llm()
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"AI model not configured: {exc}")

        start = time.time()
        try:
            resp = await run_in_threadpool(llm.invoke, _reflect_prompt(trade))
        except Exception as exc:
            logger.warning("journal reflect failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"AI reflection failed: {exc}")

        text = getattr(resp, "content", None) or str(resp)
        reflection = _parse_reflection(text)
        trade.update(reflection)
        trade["ai_generated"] = True
        _save(trades)
        logger.info("journal reflect for %s in %.1fs", trade_id, time.time() - start)
        return trade
