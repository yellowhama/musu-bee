"""RemoteProcessAdapter — DEPRECATED in v21.E. Use ScheduledProcessAdapter.

Hardcoded `worker_url` bypasses the scheduler; the adapter sends every
agent's run to the same machine regardless of capacity, runtime class,
or current load. ScheduledProcessAdapter (v21.C) replaces this by
posting a ResourceRequest, letting the scheduler bind to a machine
based on declared requirements, then dispatching to the bound bridge.

Migration path (no schema change required):
    1. In agents.adapter_config, replace
           "adapter_type": "remote_process",
           "worker_url":   "http://...",
       with
           "adapter_type": "scheduled_process",
           "machine_urls": {"<machine_id>": "http://...", ...},
           "requires":     {...},
           "affinity":     {...}   # optional
    2. Add a row to `machines` for each worker, and let bridges
       heartbeat `machine_capacity` (21.B/C).

This adapter is kept registered to avoid breaking existing agent
configs on rolling deployments. A DeprecationWarning fires on
construction; remove in v22.

Config keys (in agents.adapter_config):
  worker_url   str        Base URL of the target musu-worker  (required)
  worker_token str        Bearer token for musu-worker auth   (optional)
  command      str        Executable to run on the remote node (required)
  args         list[str]  Arguments list                       []
  cwd          str        Working directory on the remote node (optional)
  timeout_sec  int        Per-execution timeout in seconds     [600]
  env          dict       Extra env vars forwarded to the process {}
"""

from __future__ import annotations

import warnings
from typing import Any

import httpx

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter


class RemoteProcessAdapter(BaseAdapter):
    """Call musu-worker POST /execute/process over HTTP.

    .. deprecated:: v21.E (2026-05-15)
       Use :class:`musu_core.adapters.scheduled_process.ScheduledProcessAdapter`
       instead. The scheduled variant respects capacity / runtime class
       / affinity declared in the agent's ``requires`` / ``affinity``
       blocks instead of hardcoding a single worker URL.
    """

    def __init__(self) -> None:
        super().__init__()
        warnings.warn(
            "RemoteProcessAdapter is deprecated as of v21.E. Switch to "
            "ScheduledProcessAdapter (adapter_type='scheduled_process') "
            "to route work through the v21.C scheduler. "
            "RemoteProcessAdapter will be removed in v22.",
            DeprecationWarning,
            stacklevel=2,
        )

    @property
    def adapter_type(self) -> str:
        return "remote_process"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        worker_url: str = ctx.config.get("worker_url", "")
        if not worker_url:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error="remote_process adapter requires 'worker_url' in adapter_config",
            )

        command: str = ctx.config.get("command", "")
        if not command:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error="remote_process adapter requires 'command' in adapter_config",
            )

        worker_token: str | None = ctx.config.get("worker_token")
        args: list[str] = ctx.config.get("args", [])
        cwd: str | None = ctx.cwd or ctx.config.get("cwd")
        timeout_sec: int = int(ctx.config.get("timeout_sec", 600))
        env_extra: dict[str, str] = ctx.config.get("env", {})

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if worker_token:
            headers["Authorization"] = f"Bearer {worker_token}"

        payload: dict[str, Any] = {
            "command": command,
            "args": args,
            "timeout_sec": timeout_sec,
        }
        if cwd:
            payload["cwd"] = cwd
        if env_extra:
            payload["env"] = env_extra

        http_timeout = timeout_sec + 10

        try:
            async with httpx.AsyncClient(timeout=http_timeout) as client:
                resp = await client.post(
                    f"{worker_url.rstrip('/')}/execute/process",
                    json=payload,
                    headers=headers,
                )
        except httpx.ConnectError as exc:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=f"Cannot connect to worker at {worker_url}: {exc}",
            )
        except httpx.TimeoutException:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=f"HTTP timeout connecting to worker at {worker_url}",
            )

        if resp.status_code not in (200, 201):
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=f"Worker returned HTTP {resp.status_code}: {resp.text[:200]}",
                raw={"status_code": resp.status_code},
            )

        try:
            data = resp.json()
        except Exception:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error="Worker returned non-JSON response",
                raw={"body_snippet": resp.text[:200]},
            )

        exit_code: int = data.get("exit_code", -1)
        stdout: str = data.get("stdout", "")
        stderr: str = data.get("stderr", "")
        success: bool = bool(data.get("success", exit_code == 0))

        error: str | None = None
        if not success:
            if stderr.strip():
                error = stderr.strip().splitlines()[0]
            else:
                error = f"Process exited with code {exit_code}"

        return AdapterResult(
            run_id=ctx.run_id,
            success=success,
            summary=stdout.strip(),
            error=error,
            raw={"exit_code": exit_code, "stderr_snippet": stderr[:200]},
        )
