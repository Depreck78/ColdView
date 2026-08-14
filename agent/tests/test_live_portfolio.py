"""Tests for the broker-positions -> weights mapper (Live Risk mode)."""

from __future__ import annotations

import pytest

from backtest.live_portfolio import extract_positions, positions_to_weights


def test_market_value_weights_sum_to_one():
    out = positions_to_weights(
        [
            {"symbol": "AAPL", "quantity": "10", "market_value": "3000"},
            {"symbol": "MSFT", "quantity": "5", "market_value": "1000"},
        ]
    )
    assert out["weights"] == {"AAPL": 0.75, "MSFT": 0.25}
    assert out["gross_value"] == 4000.0
    assert sum(out["weights"].values()) == pytest.approx(1.0)


def test_falls_back_to_quantity_times_price():
    out = positions_to_weights(
        [
            {"symbol": "AAPL", "quantity": 10, "current_price": 100},  # 1000
            {"symbol": "MSFT", "quantity": 10, "current_price": 300},  # 3000
        ]
    )
    assert out["weights"]["MSFT"] == pytest.approx(0.75)


def test_short_positions_are_skipped_not_missigned():
    out = positions_to_weights(
        [
            {"symbol": "AAPL", "quantity": 10, "market_value": 1000},
            {"symbol": "TSLA", "quantity": -5, "market_value": -500},
        ]
    )
    assert "TSLA" not in out["weights"]
    assert any(s["symbol"] == "TSLA" and "short" in s["reason"] for s in out["skipped"])
    # The surviving leg still describes a fully invested basket.
    assert out["weights"] == {"AAPL": 1.0}


def test_mixed_currency_keeps_majority_and_warns():
    out = positions_to_weights(
        [
            {"symbol": "AAPL", "market_value": 1000, "currency": "USD"},
            {"symbol": "MSFT", "market_value": 1000, "currency": "USD"},
            {"symbol": "0700.HK", "market_value": 8000, "currency": "HKD"},
        ]
    )
    assert set(out["weights"]) == {"AAPL", "MSFT"}
    assert out["base_currency"] == "USD"
    assert any("currencies" in w for w in out["warnings"])
    assert any(s["symbol"] == "0700.HK" for s in out["skipped"])


def test_explicit_base_currency_overrides_inference():
    out = positions_to_weights(
        [
            {"symbol": "AAPL", "market_value": 1000, "currency": "USD"},
            {"symbol": "MSFT", "market_value": 1000, "currency": "USD"},
            {"symbol": "0700.HK", "market_value": 8000, "currency": "HKD"},
        ],
        base_currency="hkd",
    )
    assert set(out["weights"]) == {"0700.HK"}


def test_duplicate_lots_are_merged():
    out = positions_to_weights(
        [
            {"symbol": "AAPL", "market_value": 600},
            {"symbol": "AAPL", "market_value": 400},
            {"symbol": "MSFT", "market_value": 1000},
        ]
    )
    assert out["weights"]["AAPL"] == pytest.approx(0.5)
    assert len(out["symbols"]) == 2


def test_unpriceable_and_zero_rows_are_reported():
    out = positions_to_weights(
        [
            {"symbol": "AAPL", "market_value": 1000},
            {"symbol": "WEIRD", "quantity": 5},          # no price → unusable
            {"symbol": "ZERO", "market_value": 0},
        ]
    )
    assert out["weights"] == {"AAPL": 1.0}
    reasons = {s["symbol"]: s["reason"] for s in out["skipped"]}
    assert "WEIRD" in reasons and "ZERO" in reasons


def test_empty_input_returns_empty_not_error():
    out = positions_to_weights([])
    assert out["weights"] == {} and out["symbols"] == [] and out["gross_value"] == 0.0


def test_extract_positions_handles_envelope_shapes():
    rows = [{"symbol": "AAPL"}]
    assert extract_positions(rows) == rows
    assert extract_positions({"positions": rows}) == rows
    assert extract_positions({"data": {"positions": rows}}) == rows
    assert extract_positions({"nothing": 1}) == []
