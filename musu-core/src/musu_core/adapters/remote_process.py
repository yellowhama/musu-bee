"""RemoteProcessAdapter — executes a command on a remote musu-worker node.

Config keys (in agents.adapter_config):
  worker_url   str        Base URL of the target musu-worker  (required)
                          e.g. "http://100.121.211.106:9700"
  worker_token str        Bearer token for musu-worker auth   (optional)
  command      str        Executable to run on the remote node (required)
  args         list[str]  Arguments list                       []
  cwd          str        Working directory on the remote node (optional)
  timeout_sec  int        Per-execution timeout in seconds     [600]
  env          dict       Extra env vars forwarded to the process {}
"""

from __future__ import annotations

from typing import Any

import httpx

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter


class RemoteProcessAdapter(BaseAdapter):
    """Call musu-worker POST /execute/process over HTTP."""

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
