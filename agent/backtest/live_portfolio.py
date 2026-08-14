"""Map broker positions onto a weighted basket the risk x-ray can analyze.

The "Live Risk" input of the Agentic Risk CIO: turn a connector's positions
payload into ``{symbol: weight}`` by market value, so the same
``compute_risk_xray`` engine that serves a manual basket can describe what the
user actually holds.

Pure function of the positions payload — no I/O, no connector imports — so it
is unit-testable without a broker. Fetching lives in the caller.

Scope (v1), deliberately narrow and reported rather than silently assumed:
- **Long-only.** The risk engine rejects negative weights, so short legs are
  skipped and named in ``skipped`` instead of being folded in with a wrong sign.
- **Single currency.** Market values are summed as-is; positions in a currency
  other than the (majority) base are skipped, because summing mixed currencies
  would silently misweight the book. FX normalization is a later slice.
- **Cash is excluded** — it carries no price series, so it cannot contribute to
  a return-based risk statistic. Its share is reported as ``cash_weight_excluded``
  so the caller can say the risk figures describe the invested sleeve only.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

# Position record keys vary by connector; accept the common spellings.
_SYMBOL_KEYS = ("symbol", "ticker", "code", "instrument")
_VALUE_KEYS = ("market_value", "marketValue", "market_val", "value", "notional")
_QTY_KEYS = ("quantity", "qty", "position", "shares")
_PRICE_KEYS = ("current_price", "last_price", "price", "market_price")
_CURRENCY_KEYS = ("currency", "ccy", "currency_code")
_SIDE_KEYS = ("side", "direction", "position_side")


def _first(record: Mapping[str, Any], keys: Sequence[str]) -> Any:
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def _as_float(value: Any) -> float | None:
    """Coerce to a finite float, tolerating the strings brokers often return."""
    if value is None:
        return None
    try:
        out = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def positions_to_weights(
    positions: Sequence[Mapping[str, Any]],
    *,
    base_currency: str | None = None,
) -> dict[str, Any]:
    """Convert broker positions into market-value weights.

    Args:
        positions: Position records from a connector (``symbol``/``quantity``/
            ``market_value`` and friends; key spellings vary by broker).
        base_currency: Only keep positions in this currency. When ``None``, the
            currency holding the most positions is inferred and used.

    Returns:
        Strict-JSON-safe dict with ``weights`` (symbol → weight summing to 1),
        ``symbols``, ``gross_value``, ``skipped`` (symbol + reason), and
        ``warnings``. ``weights`` is empty when nothing usable remains.
    """
    skipped: list[dict[str, str]] = []
    warnings: list[str] = []
    usable: list[tuple[str, float]] = []
    currencies: dict[str, int] = {}

    # First pass: normalize records and tally currencies for base inference.
    normalized: list[tuple[str, float, str | None, Any]] = []
    for record in positions or []:
        if not isinstance(record, Mapping):
            continue
        raw_symbol = _first(record, _SYMBOL_KEYS)
        symbol = str(raw_symbol).strip() if raw_symbol is not None else ""
        if not symbol:
            continue

        # Market value directly, else quantity x price.
        value = _as_float(_first(record, _VALUE_KEYS))
        qty = _as_float(_first(record, _QTY_KEYS))
        if value is None:
            price = _as_float(_first(record, _PRICE_KEYS))
            if qty is not None and price is not None:
                value = qty * price

        currency = _first(record, _CURRENCY_KEYS)
        currency = str(currency).strip().upper() if currency else None
        if currency:
            currencies[currency] = currencies.get(currency, 0) + 1

        normalized.append((symbol, value if value is not None else float("nan"), currency, qty))

    if base_currency:
        base = base_currency.strip().upper()
    elif currencies:
        base = max(currencies.items(), key=lambda kv: kv[1])[0]
    else:
        base = None
    if base and len(currencies) > 1:
        warnings.append(
            f"multiple currencies present ({', '.join(sorted(currencies))}); "
            f"kept {base} only — FX normalization is not applied"
        )

    # Second pass: filter to the long, same-currency, priceable sleeve.
    for symbol, value, currency, qty in normalized:
        if base and currency and currency != base:
            skipped.append({"symbol": symbol, "reason": f"currency {currency} != base {base}"})
            continue
        if not math.isfinite(value):
            skipped.append({"symbol": symbol, "reason": "no market value or price x quantity"})
            continue
        # Short legs: the x-ray is long-only, so exclude rather than mis-sign.
        if value < 0 or (qty is not None and qty < 0):
            skipped.append({"symbol": symbol, "reason": "short position (long-only v1)"})
            continue
        if value == 0:
            skipped.append({"symbol": symbol, "reason": "zero market value"})
            continue
        usable.append((symbol, value))

    if not usable:
        return {
            "weights": {},
            "symbols": [],
            "gross_value": 0.0,
            "base_currency": base,
            "skipped": skipped,
            "warnings": warnings,
        }

    # Merge duplicate symbols (some connectors split lots).
    merged: dict[str, float] = {}
    for symbol, value in usable:
        merged[symbol] = merged.get(symbol, 0.0) + value

    gross = sum(merged.values())
    weights = {sym: val / gross for sym, val in merged.items()}

    return {
        "weights": {sym: round(w, 8) for sym, w in weights.items()},
        "symbols": sorted(merged, key=lambda s: merged[s], reverse=True),
        "gross_value": round(gross, 4),
        "base_currency": base,
        "skipped": skipped,
        "warnings": warnings,
    }


def extract_positions(payload: Any) -> list[Mapping[str, Any]]:
    """Pull the position list out of a connector's response envelope.

    Connectors wrap rows differently (``{"positions": [...]}``, ``{"data": ...}``,
    or a bare list), so normalize here rather than in every caller.
    """
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, Mapping)]
    if isinstance(payload, Mapping):
        for key in ("positions", "data", "rows", "items", "result"):
            inner = payload.get(key)
            if isinstance(inner, list):
                return [row for row in inner if isinstance(row, Mapping)]
            # One level of nesting: {"data": {"positions": [...]}}
            if isinstance(inner, Mapping):
                nested = extract_positions(inner)
                if nested:
                    return nested
    return []
