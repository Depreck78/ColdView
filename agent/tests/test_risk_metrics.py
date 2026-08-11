"""Golden-vector tests for the extended risk metrics (Milestone 1).

Every check reconciles against a hand-computable answer so the numbers can be
trusted, per the Ex1 discipline in the Agentic Risk CIO proposal.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from backtest.risk_attribution import risk_contributions
from backtest.risk_metrics import (
    _norm_pdf,
    _norm_ppf,
    capm_beta,
    parametric_tail_risk,
    sharpe_sortino,
)


def _dates(n: int) -> pd.DatetimeIndex:
    return pd.date_range("2024-01-01", periods=n, freq="D")


# --- inverse normal / pdf against known z-values -------------------------

def test_norm_ppf_known_quantiles():
    assert _norm_ppf(0.95) == pytest.approx(1.6448536, abs=1e-4)
    assert _norm_ppf(0.99) == pytest.approx(2.3263479, abs=1e-4)
    assert _norm_ppf(0.5) == pytest.approx(0.0, abs=1e-6)
    assert math.isnan(_norm_ppf(0.0)) and math.isnan(_norm_ppf(1.0))


def test_norm_pdf_at_zero():
    assert _norm_pdf(0.0) == pytest.approx(1.0 / math.sqrt(2 * math.pi), abs=1e-9)


# --- CAPM beta: exact when asset is a linear function of the market ------

def test_capm_beta_exact_linear():
    rng = np.random.default_rng(0)
    market = pd.Series(rng.normal(0, 0.01, 250), index=_dates(250))
    asset = 1.5 * market  # beta exactly 1.5, alpha 0, R^2 = 1
    out = capm_beta(asset, market)
    assert out["beta"] == pytest.approx(1.5, abs=1e-9)
    assert out["r_squared"] == pytest.approx(1.0, abs=1e-9)
    assert out["alpha_annualized"] == pytest.approx(0.0, abs=1e-9)
    assert out["overlap_days"] == 250


def test_capm_beta_thin_overlap_returns_none():
    market = pd.Series([0.01, -0.02, 0.0], index=_dates(3))
    asset = pd.Series([0.02, -0.01, 0.01], index=_dates(3))
    out = capm_beta(asset, market)
    assert out["beta"] is None and out["overlap_days"] == 3


# --- parametric VaR/ES against the closed-form normal values ------------

def test_parametric_var_matches_normal_formula():
    # Zero-mean series so VaR_95 == z_95 * sigma exactly.
    vals = np.array([-0.02, -0.01, 0.0, 0.01, 0.02] * 20, dtype=float)
    vals = vals - vals.mean()
    r = pd.Series(vals, index=_dates(len(vals)))
    sigma = float(r.std(ddof=1))
    out = parametric_tail_risk(r)
    assert out["var_95"] == pytest.approx(1.6448536 * sigma, rel=1e-3)
    # ES_95 = sigma * phi(z_95) / (1 - 0.95), with mu == 0.
    expected_es = sigma * _norm_pdf(1.6448536) / 0.05
    assert out["expected_shortfall_95"] == pytest.approx(expected_es, rel=1e-3)


# --- Sharpe / Sortino ----------------------------------------------------

def test_sharpe_sortino_signs_and_none():
    rng = np.random.default_rng(1)
    base = rng.normal(0, 0.01, 300)
    # Demean then add a fixed positive drift so the sample mean is exactly
    # positive — otherwise a net-negative draw flips the Sortino/Sharpe order.
    up = pd.Series(base - base.mean() + 0.003, index=_dates(300))
    out = sharpe_sortino(up)
    assert out["sharpe"] is not None and out["sharpe"] > 0
    # With a positive mean and symmetric noise the downside denominator is
    # smaller than total vol, so Sortino exceeds Sharpe.
    assert out["sortino"] > out["sharpe"]

    flat = pd.Series([0.01] * 50, index=_dates(50))  # zero vol -> undefined
    assert sharpe_sortino(flat)["sharpe"] is None


# --- risk contributions: components sum to vol, pct sums to 1 -----------

def test_risk_contributions_equal_uncorrelated():
    rng = np.random.default_rng(2)
    a = rng.normal(0, 0.01, 500)
    b = rng.normal(0, 0.01, 500)
    df = pd.DataFrame({"AAA": a, "BBB": b}, index=_dates(500))
    out = risk_contributions(df, {"AAA": 0.5, "BBB": 0.5})
    pcts = [row["pct"] for row in out["contributions"]]
    assert sum(pcts) == pytest.approx(1.0, abs=1e-9)
    # Roughly balanced for two equal-vol uncorrelated legs.
    assert all(0.35 < p < 0.65 for p in pcts)
    # Components sum to the portfolio vol.
    cctr_sum = sum(row["cctr"] for row in out["contributions"])
    assert cctr_sum == pytest.approx(out["annualized_vol"], rel=1e-9)


def test_risk_contributions_concentrated_weight_dominates():
    rng = np.random.default_rng(3)
    a = rng.normal(0, 0.01, 400)
    b = rng.normal(0, 0.01, 400)
    df = pd.DataFrame({"BIG": a, "small": b}, index=_dates(400))
    out = risk_contributions(df, {"BIG": 0.9, "small": 0.1})
    top = out["contributions"][0]
    assert top["symbol"] == "BIG" and top["pct"] > 0.8
