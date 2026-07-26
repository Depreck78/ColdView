"""Ollama local-runtime routes — status, preflight, and one-click install.

Powers the "Local" tab of Coldview's AI Settings: detect whether Ollama and any
models are installed, run a preflight system check (OS, install method, disk,
RAM), and — on explicit user click — install Ollama and pull a good default
model. Install runs as a single background job whose progress is polled.

Mounted by ``agent/api_server.py`` via ``register_ollama_routes(app)``.

Safety: install runs system commands (Homebrew on macOS, the official
ollama.com script on Linux) and is gated behind the same loopback/API-key auth
as every other write endpoint. It is only reachable from a trusted local client.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import shutil
import subprocess
import threading
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI

from src.api.security import require_auth

logger = logging.getLogger(__name__)

# Curated default: small, fast, tool-calling capable — a sane first model.
DEFAULT_MODELS = ["qwen2.5:7b"]
DEFAULT_MODEL_NOTE = "qwen2.5:7b — ~4.7 GB, supports tool calling."

MIN_DISK_GB = 12      # ollama + one model with headroom
REC_RAM_GB = 8        # recommended for comfortable local inference
_LOG_CAP = 400

# ---------------------------------------------------------------------------
# Background install job (single-flight, in-memory).
# ---------------------------------------------------------------------------
_JOB_LOCK = threading.Lock()
_JOB: dict[str, Any] = {
    "state": "idle",      # idle | running | done | error
    "step": "",
    "log": [],
    "error": None,
    "models": [],
    "started_at": None,
    "finished_at": None,
}


def _base_url() -> str:
    return os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


def _append_log(line: str) -> None:
    line = (line or "").rstrip()
    if not line:
        return
    with _JOB_LOCK:
        _JOB["log"].append(line)
        if len(_JOB["log"]) > _LOG_CAP:
            del _JOB["log"][: len(_JOB["log"]) - _LOG_CAP]


def _set_step(step: str) -> None:
    with _JOB_LOCK:
        _JOB["step"] = step
    _append_log(f"› {step}")


def _ollama_binary() -> str | None:
    return shutil.which("ollama")


def _ollama_version() -> str | None:
    binary = _ollama_binary()
    if not binary:
        return None
    try:
        out = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=8)
        return (out.stdout or out.stderr or "").strip() or None
    except Exception:
        return None


def _server_running() -> bool:
    try:
        with urllib.request.urlopen(f"{_base_url()}/api/tags", timeout=2) as resp:  # noqa: S310 - local, fixed host
            return resp.status == 200
    except Exception:
        return False


def _list_models() -> list[dict[str, Any]]:
    try:
        with urllib.request.urlopen(f"{_base_url()}/api/tags", timeout=4) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []
    models = data.get("models") if isinstance(data, dict) else None
    if not isinstance(models, list):
        return []
    out: list[dict[str, Any]] = []
    for m in models:
        if not isinstance(m, dict):
            continue
        name = m.get("name") or m.get("model")
        if not name:
            continue
        size = m.get("size")
        out.append({"name": str(name), "size": int(size) if isinstance(size, (int, float)) else None})
    return out


def _system_info() -> dict[str, Any]:
    system = platform.system().lower()  # darwin | linux | windows
    home = Path.home()
    free_gb = None
    try:
        free_gb = round(shutil.disk_usage(str(home)).free / (1024 ** 3), 1)
    except Exception:
        pass
    ram_gb = None
    try:
        ram_gb = round((os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE")) / (1024 ** 3), 1)
    except Exception:
        pass
    return {"system": system, "arch": platform.machine(), "free_disk_gb": free_gb, "total_ram_gb": ram_gb}


def _install_method(system: str) -> str | None:
    """Return the programmatic install method for this platform, or None."""
    if system == "darwin":
        return "brew" if shutil.which("brew") else None
    if system == "linux":
        return "script" if shutil.which("curl") else None
    return None  # windows / unknown → manual


def _preflight(info: dict[str, Any], method: str | None) -> list[dict[str, Any]]:
    system = info["system"]
    checks: list[dict[str, Any]] = []

    supported = system in ("darwin", "linux", "windows")
    checks.append({
        "id": "os",
        "label": "Operating system",
        "level": "ok" if system in ("darwin", "linux") else ("warn" if supported else "error"),
        "detail": f"{platform.system()} ({info['arch']})",
    })

    if system == "darwin":
        checks.append({
            "id": "method",
            "label": "Install method",
            "level": "ok" if method == "brew" else "warn",
            "detail": "Homebrew detected" if method == "brew" else "Homebrew not found — install from ollama.com instead",
        })
    elif system == "linux":
        checks.append({
            "id": "method",
            "label": "Install method",
            "level": "ok" if method == "script" else "error",
            "detail": "curl available (official install script)" if method == "script" else "curl not found",
        })
    else:
        checks.append({
            "id": "method",
            "label": "Install method",
            "level": "warn",
            "detail": "Automatic install is macOS/Linux only — download from ollama.com",
        })

    free = info.get("free_disk_gb")
    disk_ok = free is None or free >= MIN_DISK_GB
    if free is None:
        disk_detail = "unknown"
    elif disk_ok:
        disk_detail = f"{free} GB free"
    else:
        disk_detail = f"{free} GB free (need ≥ {MIN_DISK_GB} GB)"
    checks.append({"id": "disk", "label": "Free disk space", "level": "ok" if disk_ok else "error", "detail": disk_detail})

    ram = info.get("total_ram_gb")
    checks.append({
        "id": "ram",
        "label": "Memory",
        "level": "ok" if (ram is None or ram >= REC_RAM_GB) else "warn",
        "detail": f"{ram} GB RAM" if ram is not None else "unknown",
    })

    return checks


def _build_status() -> dict[str, Any]:
    info = _system_info()
    method = _install_method(info["system"])
    installed = _ollama_binary() is not None
    running = _server_running()
    models = _list_models() if running else []
    checks = _preflight(info, method)
    has_error = any(c["level"] == "error" for c in checks)

    with _JOB_LOCK:
        job_state = _JOB["state"]

    return {
        "installed": installed,
        "running": running,
        "version": _ollama_version(),
        "baseUrl": _base_url(),
        "models": models,
        "system": info,
        "preflight": checks,
        "installMethod": method,
        # Can we run the one-click install? Method available and no hard blocker.
        "canAutoInstall": method is not None and not has_error,
        "defaultModels": DEFAULT_MODELS,
        "defaultModelNote": DEFAULT_MODEL_NOTE,
        "ready": installed and running and len(models) > 0,
        "installState": job_state,
    }


# ---------------------------------------------------------------------------
# Install job implementation
# ---------------------------------------------------------------------------
def _run_stream(cmd: list[str] | str, *, shell: bool = False, timeout: int = 1800) -> int:
    """Run a command, streaming its combined output into the job log."""
    proc = subprocess.Popen(
        cmd,
        shell=shell,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        _append_log(line)
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise
    return proc.returncode or 0


def _ensure_server_running() -> bool:
    if _server_running():
        return True
    binary = _ollama_binary()
    if not binary:
        return False
    _set_step("Starting the Ollama server")
    try:
        subprocess.Popen(
            [binary, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as exc:
        _append_log(f"Failed to start server: {exc}")
        return False
    # Poll for readiness (~40s).
    import time
    for _ in range(40):
        if _server_running():
            return True
        time.sleep(1)
    return False


def _install_worker(system: str, method: str | None) -> None:
    try:
        # 1) Install the Ollama binary if missing.
        if _ollama_binary() is None:
            if method == "brew":
                _set_step("Installing Ollama via Homebrew")
                if _run_stream(["brew", "install", "ollama"]) != 0:
                    raise RuntimeError("Homebrew install failed — see log above.")
            elif method == "script":
                _set_step("Installing Ollama (official install script)")
                if _run_stream("curl -fsSL https://ollama.com/install.sh | sh", shell=True) != 0:
                    raise RuntimeError("Install script failed — see log above.")
            else:
                raise RuntimeError("No automatic install method for this platform. Install from ollama.com, then retry.")
            _append_log("Ollama installed.")
        else:
            _append_log("Ollama already installed — skipping install.")

        # 2) Make sure the server is up.
        if not _ensure_server_running():
            raise RuntimeError("Ollama server did not become reachable. Try running 'ollama serve' manually.")
        _append_log("Ollama server is running.")

        # 3) Pull the default model(s) not already present.
        present = {m["name"] for m in _list_models()}
        for model in DEFAULT_MODELS:
            if model in present or f"{model}:latest" in present:
                _append_log(f"Model {model} already present — skipping.")
                continue
            _set_step(f"Downloading model {model}")
            if _run_stream([_ollama_binary() or "ollama", "pull", model]) != 0:
                raise RuntimeError(f"Failed to pull {model} — see log above.")
            _append_log(f"Model {model} ready.")

        with _JOB_LOCK:
            _JOB["state"] = "done"
            _JOB["step"] = "Done"
            _JOB["finished_at"] = datetime.now(timezone.utc).isoformat()
        _append_log("✓ Setup complete.")
    except Exception as exc:  # surface any failure to the UI log
        logger.warning("ollama install failed: %s", exc)
        with _JOB_LOCK:
            _JOB["state"] = "error"
            _JOB["error"] = str(exc)
            _JOB["finished_at"] = datetime.now(timezone.utc).isoformat()
        _append_log(f"✗ {exc}")


def register_ollama_routes(app: FastAPI) -> None:
    """Mount the Ollama runtime routes onto ``app``."""

    @app.get("/ollama/status", dependencies=[Depends(require_auth)])
    async def ollama_status() -> dict[str, Any]:
        return _build_status()

    @app.get("/ollama/install/status", dependencies=[Depends(require_auth)])
    async def ollama_install_status() -> dict[str, Any]:
        with _JOB_LOCK:
            job = {
                "state": _JOB["state"],
                "step": _JOB["step"],
                "log": list(_JOB["log"]),
                "error": _JOB["error"],
                "models": list(_JOB["models"]),
                "startedAt": _JOB["started_at"],
                "finishedAt": _JOB["finished_at"],
            }
        return job

    @app.post("/ollama/install", dependencies=[Depends(require_auth)])
    async def ollama_install() -> dict[str, Any]:
        info = _system_info()
        method = _install_method(info["system"])
        checks = _preflight(info, method)
        if any(c["level"] == "error" for c in checks):
            return {"started": False, "reason": "Preflight checks failed.", "preflight": checks}
        if method is None:
            return {
                "started": False,
                "reason": "No automatic install method on this platform. Download Ollama from https://ollama.com/download.",
                "preflight": checks,
            }

        with _JOB_LOCK:
            if _JOB["state"] == "running":
                return {"started": True, "already": True, "state": "running"}
            _JOB.update({
                "state": "running",
                "step": "Starting…",
                "log": [],
                "error": None,
                "models": list(DEFAULT_MODELS),
                "started_at": datetime.now(timezone.utc).isoformat(),
                "finished_at": None,
            })

        threading.Thread(
            target=_install_worker, args=(info["system"], method), name="ollama-install", daemon=True
        ).start()
        return {"started": True, "state": "running"}
