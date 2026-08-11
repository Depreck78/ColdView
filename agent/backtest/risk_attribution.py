"""Risk attribution: marginal and component contribution to risk (MCTR/CCTR).

The "Explain" step of the Agentic Risk CIO (Milestone 1). Answers *which
positions actually drive portfolio volatility* — not which have the largest
weight. This is pure covariance math (``MCTR = Σw / σ_p``, ``CCTR = w ⊙ MCTR``,
components summing to portfolio vol); no factor model is required, so it ships
in Phase 1. Barra-style *factor* attribution is a separate, later effort.

Pure function of returns + weights — same conventions as ``risk_xray``:
no I/O, strict-JSON-safe outputs via ``_finite``, trailing returns only.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

from backtest.risk_xray import PERIODS_PER_YEAR, _finite


def risk_contributions(
    returns: pd.DataFrame,
    weights: Mapping[str, float] | Sequence[float],
    *,
    periods_per_year: int = PERIODS_PER_YEAR,
) -> dict[str, Any]:
    """Decompose portfolio volatility into per-symbol risk contributions.

    Args:
        returns: Per-symbol return panel (columns = symbols), already aligned.
        weights: Symbol → weight map, or a weight vector ordered like the
            columns of ``returns``.
        periods_per_year: Annualization factor for the reported vols.

    Returns:
        Strict-JSON-safe dict with the annualized portfolio vol and a
        ``contributions`` list (one row per symbol) sorted by descending
        component contribution. Each row: ``weight``, ``mctr`` (marginal,
        annualized), ``cctr`` (component, annualized), and ``pct`` (share of
        total risk; the ``pct`` values sum to 1). Diversification shows up as
        ``pct`` diverging from ``weight``.
    """
    cols = list(returns.columns)
    if len(cols) < 1:
        return {"annualized_vol": None, "contributions": [], "note": "no symbols"}

    if isinstance(weights, Mapping):
        w = np.array([float(weights.get(sym, 0.0)) for sym in cols], dtype=float)
    else:
        w = np.asarray(list(weights), dtype=float)
        if len(w) != len(cols):
            raise ValueError("weight vector length does not match number of symbols")

    total = float(w.sum())
    if total <= 0 or not math.isfinite(total):
        return {"annualized_vol": None, "contributions": [], "note": "weights sum to zero"}
    w = w / total

    cov = returns.cov().to_numpy(dtype=float)  # per-period covariance
    port_var = float(w @ cov @ w)
    if port_var <= 0 or not math.isfinite(port_var):
        return {"annualized_vol": None, "contributions": [], "note": "portfolio variance is zero"}
    port_vol = math.sqrt(port_var)

    # Marginal contribution to risk (per-period), then component contribution.
    mctr = (cov @ w) / port_vol
    cctr = w * mctr  # components sum to port_vol
    ann = math.sqrt(periods_per_year)

    rows = []
    for i, sym in enumerate(cols):
        rows.append(
            {
                "symbol": sym,
                "weight": _finite(float(w[i])),
                "mctr": _finite(float(mctr[i]) * ann),
                "cctr": _finite(float(cctr[i]) * ann),
                "pct": _finite(float(cctr[i]) / port_vol),
            }
        )
    rows.sort(key=lambda r: (r["cctr"] is not None, r["cctr"]), reverse=True)

    return {
        "annualized_vol": _finite(port_vol * ann),
        "contributions": rows,
    }
