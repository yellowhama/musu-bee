"""musu-worker FastAPI server — listens on :9700.

Endpoints:
  GET  /health           — liveness + GPU info
  GET  /capabilities     — available adapters / CLIs
  POST /execute/cli      — run claude or codex CLI
  POST /execute/process  — run arbitrary command (intentional RCE endpoint)

SECURITY NOTE
-------------
/execute/process is an intentional Remote Code Execution (RCE) endpoint.
It runs any command passed by the caller with the privileges of the worker
process.  This is required for the musu multi-machine orchestration model.

MUSU_WORKER_TOKEN **must** be set in any deployment that is accessible beyond
a trusted, isolated network (e.g. Tailscale).  Without a token every caller
can execute arbitrary commands on the host.  A startup warning is emitted
when the token is absent.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
from typing import Any
import asyncio

import uvicorn
from fastapi import Depends, FastAPI
from fastapi import HTTPException
from starlette import status
from pydantic import BaseModel, Field

from musu_core.middleware import apply_musu_middlewares
from musu_worker.auth import require_auth, warn_if_open_mode
from musu_worker.executors import ExecResult, run_cli, run_process

app = FastAPI(title="musu-worker", version="0.1.0")
_bearer_token = os.environ.get("MUSU_WORKER_TOKEN")
apply_musu_middlewares(
    app,
    bearer_token=_bearer_token,
    rate_limit_capacity=10,
    rate_limit_window_seconds=60,  # 1 minute
    rate_limit_key_type="token" if _bearer_token else "ip",
)


@app.on_event("startup")
async def _startup() -> None:
    warn_if_open_mode()


# ---------------------------------------------------------------------------
# Concurrency guard (prevents process explosion)
# ---------------------------------------------------------------------------


def _get_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


_MAX_CONCURRENT_RUNS = _get_int_env("MUSU_WORKER_MAX_CONCURRENT_RUNS", 2)
_CONCURRENCY_MODE = (os.environ.get("MUSU_WORKER_CONCURRENCY_MODE") or "reject").strip().lower()
_WAIT_TIMEOUT_SEC = float(os.environ.get("MUSU_WORKER_CONCURRENCY_WAIT_TIMEOUT_SEC") or "2")

_run_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_RUNS)


async def concurrency_guard():
    acquired = False
    try:
        if _CONCURRENCY_MODE == "wait":
            try:
                await asyncio.wait_for(_run_semaphore.acquire(), timeout=_WAIT_TIMEOUT_SEC)
            except asyncio.TimeoutError as exc:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Worker is busy (concurrency cap={_MAX_CONCURRENT_RUNS}, mode=wait, "
                        f"wait_timeout_sec={_WAIT_TIMEOUT_SEC}). Retry later."
                    ),
                ) from exc
            acquired = True
            yield
            return

        # default: reject (near-immediate attempt)
        try:
            await asyncio.wait_for(_run_semaphore.acquire(), timeout=0.001)
        except asyncio.TimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Worker is busy (concurrency cap={_MAX_CONCURRENT_RUNS}, mode=reject). Retry later.",
            ) from exc
        acquired = True
        yield
    finally:
        if acquired:
            _run_semaphore.release()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


def _gpu_info() -> str:
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.free",
             "--format=csv,noheader,nounits"],
            timeout=5,
        ).decode().strip()
        return out
    except Exception:
        return "N/A"


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "hostname": platform.node(),
        "gpu": _gpu_info(),
        "python": platform.python_version(),
    }


# ---------------------------------------------------------------------------
# Capabilities
# ---------------------------------------------------------------------------


@app.get("/capabilities")
async def capabilities(_: None = Depends(require_auth)) -> dict[str, Any]:
    available_clis = [c for c in ("claude", "codex") if shutil.which(c)]
    return {
        "clis": available_clis,
        "adapters": ["remote_cli", "remote_process"],
    }


# ---------------------------------------------------------------------------
# Execute CLI
# ---------------------------------------------------------------------------


class CLIRequest(BaseModel):
    prompt: str = Field(max_length=50000)
    cli_type: str = "claude"
    model: str | None = None
    session_id: str | None = None
    cwd: str | None = None
    timeout_sec: int = Field(default=300, ge=1, le=3600)


class CLIResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    success: bool
    session_id: str | None = None


@app.post("/execute/cli", response_model=CLIResponse)
async def execute_cli(
    req: CLIRequest,
    _: None = Depends(require_auth),
    __: None = Depends(concurrency_guard),
) -> CLIResponse:
    result: ExecResult = await run_cli(
        cli_type=req.cli_type,
        prompt=req.prompt,
        model=req.model,
        session_id=req.session_id,
        cwd=req.cwd,
        timeout_sec=req.timeout_sec,
    )
    return CLIResponse(
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        success=result.success,
    )


# ---------------------------------------------------------------------------
# Execute Process
# ---------------------------------------------------------------------------


class ProcessRequest(BaseModel):
    command: str = Field(max_length=1000)
    args: list[str] = Field(default_factory=list, max_items=100)
    cwd: str | None = None
    timeout_sec: int = Field(default=600, ge=1, le=7200)
    env: dict[str, str] = Field(default_factory=dict)


class ProcessResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    success: bool


@app.post("/execute/process", response_model=ProcessResponse)
async def execute_process(
    req: ProcessRequest,
    _: None = Depends(require_auth),
    __: None = Depends(concurrency_guard),
) -> ProcessResponse:
    result: ExecResult = await run_process(
        command=req.command,
        args=req.args,
        cwd=req.cwd,
        timeout_sec=req.timeout_sec,
        env_extra=req.env or None,
    )
    return ProcessResponse(
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        success=result.success,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def run() -> None:
    host = os.environ.get("MUSU_WORKER_HOST", "0.0.0.0")
    port = int(os.environ.get("MUSU_WORKER_PORT", "9700"))
    uvicorn.run("musu_worker.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    run()
