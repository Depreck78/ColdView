"""Extended portfolio risk metrics: CAPM beta, parametric (variance-covariance)
VaR/ES, and Sharpe/Sortino for an arbitrary basket.

These extend ``backtest.risk_xray`` (Agentic Risk CIO — Milestone 1, the
"Measure" step) and follow its conventions exactly: pure functions of return
series with no I/O and no loader imports, every reported float passed through
``_finite`` so results survive ``json.dumps(..., allow_nan=False)``, and
look-ahead structurally impossible (trailing returns only).

Dependency note: intentionally numpy/pandas/math only — no scipy — so the
module carries no dependency the rest of ``backtest`` does not already have.
The normal quantile/pdf needed for parametric VaR/ES are provided locally.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np
import pandas as pd

from backtest.risk_xray import PERIODS_PER_YEAR, _finite

_SQRT_2PI = math.sqrt(2.0 * math.pi)


def _norm_pdf(z: float) -> float:
    """Standard normal probability density at ``z``."""
    return math.exp(-0.5 * z * z) / _SQRT_2PI


def _norm_ppf(p: float) -> float:
    """Inverse standard normal CDF via Acklam's rational approximation.

    Accurate to ~1.15e-9 over (0, 1); avoids a scipy dependency. Returns
    ``nan`` for out-of-range input rather than raising.
    """
    if not (0.0 < p < 1.0):
        return float("nan")
    a = (
        -3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02,
        1.383577518672690e02, -3.066479806614716e01, 2.506628277459239e00,
    )
    b = (
        -5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02,
        6.680131188771972e01, -1.328068155288572e01,
    )
    c = (
        -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00,
        -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00,
    )
    d = (
        7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00,
        3.754408661907416e00,
    )
    plow, phigh = 0.02425, 1.0 - 0.02425
    if p < plow:
        q = math.sqrt(-2.0 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0
        )
    if p <= phigh:
        q = p - 0.5
        r = q * q
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (
            ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0
        )
    q = math.sqrt(-2.0 * math.log(1.0 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
        (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0
    )


def sharpe_sortino(
    port_returns: pd.Series,
    *,
    periods_per_year: int = PERIODS_PER_YEAR,
    risk_free_annual: float = 0.0,
) -> dict[str, Any]:
    """Annualized Sharpe and Sortino ratios for a return series.

    Sharpe uses total volatility; Sortino uses the target semideviation
    (root-mean-square of shortfalls below the per-period risk-free target) —
    the textbook downside denominator, distinct from risk_xray's
    ``downside_deviation`` (std of the negative-return subset).
    """
    r = pd.Series(port_returns, dtype=float).dropna()
    if len(r) < 2:
        return {"sharpe": None, "sortino": None, "risk_free_annual": risk_free_annual}

    # A constant series has zero variance, but float std leaves ~1e-18 noise;
    # floor it so a degenerate series reports "undefined" instead of a
    # nonsensical ~1e16 ratio.
    eps = 1e-12
    target = risk_free_annual / periods_per_year
    excess = r - target
    ann_excess = float(excess.mean()) * periods_per_year

    vol = float(r.std(ddof=1))
    ann_vol = vol * math.sqrt(periods_per_year) if vol > eps else 0.0
    sharpe = ann_excess / ann_vol if ann_vol > 0 else None

    shortfall = np.minimum(excess.to_numpy(dtype=float), 0.0)
    downside_dev = float(math.sqrt(np.mean(shortfall**2)))
    ann_downside = downside_dev * math.sqrt(periods_per_year) if downside_dev > eps else 0.0
    sortino = ann_excess / ann_downside if ann_downside > 0 else None

    return {
        "sharpe": _finite(sharpe),
        "sortino": _finite(sortino),
        "risk_free_annual": risk_free_annual,
    }


def parametric_tail_risk(
    port_returns: pd.Series,
    *,
    levels: Sequence[float] = (0.95, 0.99),
    horizon: int = 1,
) -> dict[str, Any]:
    """Parametric (variance-covariance / normal) VaR and ES.

    Reported as positive losses over ``horizon`` periods, matching the sign of
    risk_xray's historical ``_tail_risk``. Assumes returns are normally
    distributed — which understates fat tails; compare against the historical
    figures rather than trusting either alone.
    """
    r = pd.Series(port_returns, dtype=float).dropna()
    out: dict[str, Any] = {"method": "parametric (variance-covariance, normal)", "horizon": horizon}
    if len(r) < 2:
        for level in levels:
            key = f"{int(round(level * 100))}"
            out[f"var_{key}"] = None
            out[f"expected_shortfall_{key}"] = None
        return out

    mu = float(r.mean())
    sigma = float(r.std(ddof=1))
    scale = math.sqrt(horizon)
    for level in levels:
        key = f"{int(round(level * 100))}"
        z = _norm_ppf(level)
        # Positive-loss VaR: z*sigma*sqrt(h) - mu*h.
        var = z * sigma * scale - mu * horizon
        # Normal ES: sigma*sqrt(h)*phi(z)/(1-level) - mu*h.
        es = sigma * scale * _norm_pdf(z) / (1.0 - level) - mu * horizon
        out[f"var_{key}"] = _finite(var)
        out[f"expected_shortfall_{key}"] = _finite(es)
    return out


def capm_beta(
    asset_returns: pd.Series,
    market_returns: pd.Series,
    *,
    periods_per_year: int = PERIODS_PER_YEAR,
    min_overlap: int = 20,
) -> dict[str, Any]:
    """CAPM beta/alpha/R² of an asset (or portfolio) against a market series.

    Aligns the two series on their shared dates (indexes normalized to date),
    then regresses asset on market: beta = cov/var(market), alpha annualized,
    R² = corr². Returns ``None`` fields when the overlap is too thin to trust.
    """
    a = pd.Series(asset_returns, dtype=float).dropna()
    m = pd.Series(market_returns, dtype=float).dropna()

    def _none(overlap: int, note: str) -> dict[str, Any]:
        return {
            "beta": None,
            "alpha_annualized": None,
            "r_squared": None,
            "overlap_days": overlap,
            "note": note,
        }

    # CAPM beta needs date-aligned series. A non-date (e.g. positional) index
    # can't align to a dated benchmark — and coercing it would collapse to
    # duplicate labels — so bail out cleanly instead of raising.
    try:
        a.index = pd.to_datetime(a.index).normalize()
        m.index = pd.to_datetime(m.index).normalize()
    except (ValueError, TypeError):
        return _none(0, "asset/market index is not date-like")
    if a.index.has_duplicates or m.index.has_duplicates:
        return _none(0, "non-unique dates after alignment; cannot compute beta")

    joined = pd.concat([a.rename("a"), m.rename("m")], axis=1, join="inner").dropna()

    if len(joined) < min_overlap:
        return _none(
            int(len(joined)), f"insufficient overlap ({len(joined)} < {min_overlap} days)"
        )

    av = joined["a"].to_numpy(dtype=float)
    mv = joined["m"].to_numpy(dtype=float)
    market_var = float(np.var(mv, ddof=1))
    if market_var <= 0 or not math.isfinite(market_var):
        return _none(int(len(joined)), "market variance is zero")

    cov = float(np.cov(av, mv, ddof=1)[0, 1])
    beta = cov / market_var
    alpha_period = float(np.mean(av) - beta * np.mean(mv))
    corr = float(np.corrcoef(av, mv)[0, 1])
    return {
        "beta": _finite(beta),
        "alpha_annualized": _finite(alpha_period * periods_per_year),
        "r_squared": _finite(corr * corr),
        "overlap_days": int(len(joined)),
    }
