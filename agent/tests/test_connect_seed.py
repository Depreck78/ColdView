"""Tests for the one-click connect config seeding.

The seeder edits the user's real ``agent.json``, so the merge behaviour is the
part that must not be wrong: it may add a missing broker entry, and it must
never overwrite an existing one or drop unrelated config.
"""

from __future__ import annotations

import json

import pytest

from src.api import connect_routes


@pytest.fixture()
def config_path(tmp_path, monkeypatch):
    """Point the seeder at a throwaway agent.json."""
    path = tmp_path / "agent.json"
    monkeypatch.setattr(connect_routes, "_agent_config_path", lambda: path)
    return path


def test_seeds_into_a_missing_file(config_path):
    assert connect_routes._ensure_seeded("robinhood") is True
    written = json.loads(config_path.read_text())
    assert "robinhood" in written["mcpServers"]
    # The seed must be read-only: no order-placing tool may appear.
    tools = written["mcpServers"]["robinhood"]["enabledTools"]
    assert "place_equity_order" not in tools and "cancel_equity_order" not in tools
    assert "get_equity_positions" in tools


def test_preserves_unrelated_config_and_other_servers(config_path):
    config_path.write_text(
        json.dumps(
            {
                "model": "claude-opus-4-5",
                "mcpServers": {"someOther": {"type": "stdio", "command": "x"}},
            }
        )
    )
    assert connect_routes._ensure_seeded("robinhood") is True
    written = json.loads(config_path.read_text())
    assert written["model"] == "claude-opus-4-5"          # unrelated key kept
    assert "someOther" in written["mcpServers"]            # sibling server kept
    assert "robinhood" in written["mcpServers"]            # ours added


def test_never_overwrites_an_existing_entry(config_path):
    custom = {"type": "streamableHttp", "url": "https://example.test", "enabledTools": ["x"]}
    config_path.write_text(json.dumps({"mcpServers": {"robinhood": custom}}))
    assert connect_routes._ensure_seeded("robinhood") is False
    written = json.loads(config_path.read_text())
    assert written["mcpServers"]["robinhood"] == custom    # untouched


def test_written_file_is_owner_only(config_path):
    connect_routes._ensure_seeded("robinhood")
    assert (config_path.stat().st_mode & 0o777) == 0o600


def test_malformed_json_is_reported_not_clobbered(config_path):
    config_path.write_text("{ not json")
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        connect_routes._ensure_seeded("robinhood")
    # The unreadable file must be left exactly as it was.
    assert config_path.read_text() == "{ not json"


def test_unknown_broker_has_no_seed(config_path):
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        connect_routes._ensure_seeded("binance")
