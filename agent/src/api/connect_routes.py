"""One-click OAuth broker connect (read-only).

Mounted by ``agent/api_server.py`` via ``register_connect_routes(app)``.

Turns the CLI-only ``coldview connector authorize`` handshake into a button:
the surface seeds the broker's read-only ``mcpServers`` entry into
``~/.coldview/agent.json`` when it is missing, then runs the OAuth flow so the
broker's own sign-in page opens in the user's browser.

Why this needs no Coldview-operated server: the MCP OAuth client uses
**dynamic client registration** (``clientName`` is presented at connect time;
``client_id``/``client_secret`` are optional), and the redirect lands on a
loopback listener. Nothing is proxied through us and no vendor secret exists.

Scope and safety:
- **Read-only.** Only the OAuth/remote-MCP brokers are eligible, and the seed
  written here enables exactly the broker's read tools — never an order tool.
  Turning on execution remains a separate, explicit mandate commit.
- **Local browser required.** The handshake opens a browser and listens on a
  loopback port, so it only works when the API process and the browser share a
  machine. Headless/containerized installs get a clear error pointing at the
  CLI rather than a request that hangs until timeout.
- **Config is merged, never clobbered.** An existing ``mcpServers`` entry for
  the broker is left exactly as-is.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# How long a browser sign-in may take before the worker gives up. Robinhood's
# flow can include a face scan, so this is generous by design.
_AUTHORIZE_TIMEOUT_SECONDS = 300.0

# In-process state for the running handshake, keyed by broker. The flow is a
# single interactive action per broker, so a dict guarded by a lock is enough.
_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()


class ConnectRequest(BaseModel):
    """Request body for POST /live/connect/{broker}."""

    seed_config: bool = Field(
        True,
        description=(
            "Write the broker's read-only mcpServers seed into agent.json when "
            "absent. Existing entries are never overwritten."
        ),
    )


def _agent_config_path() -> Path:
    """Return the path of the main agent config file."""
    from src.config.paths import get_runtime_root

    return get_runtime_root() / "agent.json"


def _seed_for(broker: str) -> Optional[dict]:
    """Return the canonical read-only mcpServers seed for ``broker``."""
    if broker == "robinhood":
        from src.config.schema import robinhood_mcp_server_seed_config

        return robinhood_mcp_server_seed_config()
    return None


def _read_config(path: Path) -> dict:
    """Load the agent config, tolerating a missing file."""
    if not path.exists():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"{path} is not readable JSON ({exc}). Fix or move it, then retry.",
        )
    return loaded if isinstance(loaded, dict) else {}


def _write_config_atomic(path: Path, payload: dict) -> None:
    """Write the config atomically with owner-only permissions."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    text = json.dumps(payload, indent=2) + "\n"
    # Owner-only: the file names broker endpoints and (for other servers) may
    # hold credentials.
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    os.replace(tmp, path)


def _ensure_seeded(broker: str) -> bool:
    """Add the broker's read-only seed to agent.json when absent.

    Returns True when a seed was written, False when an entry already existed.
    """
    seed = _seed_for(broker)
    if seed is None:
        raise HTTPException(
            status_code=400,
            detail=f"No managed config seed is defined for {broker!r}.",
        )

    path = _agent_config_path()
    config = _read_config(path)
    servers = config.get("mcpServers")
    if not isinstance(servers, dict):
        servers = {}

    # Never overwrite an operator's existing entry — they may have tightened it.
    if broker in servers:
        return False

    servers.update(seed.get("mcpServers", {}))
    config["mcpServers"] = servers
    _write_config_atomic(path, config)
    logger.info("seeded read-only %s mcpServers entry into %s", broker, path)
    return True


def _run_authorize(broker: str) -> None:
    """Drive the OAuth handshake; records the outcome in ``_jobs``."""

    def _finish(status: str, error: str | None = None) -> None:
        with _jobs_lock:
            job = _jobs.setdefault(broker, {})
            job["status"] = status
            job["error"] = error
            job["finished_at"] = time.time()

    try:
        from src.config.loader import load_agent_config
        from src.tools.mcp import build_mcp_tool_wrappers

        # Same resolution the CLI uses: the protected, operator-side config.
        agent_config = load_agent_config()
        servers = getattr(agent_config, "mcp_servers", {}) or {}
        server_config = servers.get(broker)
        if server_config is None:
            _finish("error", f"No mcpServers entry for {broker!r} after seeding.")
            return

        # Building the wrappers forces the connection, and the discovery
        # handshake triggers the browser OAuth flow when no token is cached.
        # Raise the timeouts so a slow human sign-in does not trip it.
        if hasattr(server_config, "model_copy"):
            updates: dict[str, float] = {}
            for field in ("init_timeout", "tool_timeout"):
                current = getattr(server_config, field, None)
                if current is None or float(current) < _AUTHORIZE_TIMEOUT_SECONDS:
                    updates[field] = _AUTHORIZE_TIMEOUT_SECONDS
            if updates:
                server_config = server_config.model_copy(update=updates)

        build_mcp_tool_wrappers(broker, server_config)
        _finish("connected")
        logger.info("OAuth handshake completed for %s", broker)
    except Exception as exc:  # noqa: BLE001 — surfaced to the poller
        logger.warning("OAuth handshake failed for %s: %s", broker, exc)
        _finish("error", str(exc))


def register_connect_routes(app: FastAPI) -> None:
    """Mount the one-click connect routes onto ``app``."""
    import sys as _sys

    host = _sys.modules.get("api_server") or _sys.modules.get("agent.api_server")
    if host is None:
        raise RuntimeError(
            "register_connect_routes: api_server module not in sys.modules; "
            "ensure api_server is imported before calling this function"
        )
    require_auth = host.require_auth

    def _validate(broker: str) -> str:
        from src.api.live_routes import _known_live_brokers

        key = broker.strip().lower()
        if key not in set(_known_live_brokers()):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{broker!r} is not an OAuth broker. Key-based brokers are "
                    "configured with their API credentials instead."
                ),
            )
        return key

    def _token_present(broker: str) -> bool:
        from src.api.live_routes import _oauth_token_present

        return _oauth_token_present(broker)

    @app.get("/live/connect/{broker}", dependencies=[Depends(require_auth)])
    async def connect_status(broker: str):
        """Report seed + OAuth state for a broker (poll target for the UI)."""
        key = _validate(broker)
        path = _agent_config_path()
        config = _read_config(path) if path.exists() else {}
        servers = config.get("mcpServers")
        seeded = isinstance(servers, dict) and key in servers

        with _jobs_lock:
            job = dict(_jobs.get(key) or {})

        connected = _token_present(key)
        status = job.get("status")
        if connected:
            status = "connected"
        elif status is None:
            status = "idle"

        return {
            "broker": key,
            "seeded": seeded,
            "connected": connected,
            "status": status,
            "error": job.get("error"),
            "config_path": str(path),
        }

    @app.post("/live/connect/{broker}", dependencies=[Depends(require_auth)])
    async def connect_start(broker: str, request: Request, body: ConnectRequest | None = None):
        """Seed the read-only config and start the broker's OAuth sign-in.

        Returns immediately; the browser opens on the server host and the UI
        polls ``GET /live/connect/{broker}`` until the token lands.
        """
        key = _validate(broker)
        opts = body or ConnectRequest()

        if _token_present(key):
            return {"broker": key, "status": "connected", "seeded": True}

        # The handshake opens a browser and binds a loopback callback, so it
        # only works when this process shares a machine with the user.
        client_host = request.client.host if request.client else ""
        if client_host and client_host not in {"127.0.0.1", "::1", "localhost"}:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Browser sign-in must run on the machine hosting the API. "
                    f"Run `coldview connector authorize {key}-live-mcp` there instead."
                ),
            )

        with _jobs_lock:
            existing = _jobs.get(key)
            if existing and existing.get("status") == "authorizing":
                started = existing.get("started_at", 0.0)
                if time.time() - started < _AUTHORIZE_TIMEOUT_SECONDS:
                    return {"broker": key, "status": "authorizing", "seeded": True}

        seeded_now = _ensure_seeded(key) if opts.seed_config else False

        with _jobs_lock:
            _jobs[key] = {"status": "authorizing", "error": None, "started_at": time.time()}

        thread = threading.Thread(
            target=_run_authorize, args=(key,), name=f"oauth-connect-{key}", daemon=True
        )
        thread.start()

        return {
            "broker": key,
            "status": "authorizing",
            "seeded": True,
            "seeded_now": seeded_now,
            "note": "A browser window should open for the broker's sign-in.",
        }
