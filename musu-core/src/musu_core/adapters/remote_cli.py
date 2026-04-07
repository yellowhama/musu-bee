"""RemoteCLIAdapter — executes Claude/Codex CLI on a remote musu-worker node.

Config keys (in agents.adapter_config):
  worker_url   str   Base URL of the target musu-worker  (required)
                     e.g. "http://100.121.211.106:9700"
  worker_token str   Bearer token for musu-worker auth   (optional)
  cli_type     str   "claude" or "codex"                 [claude]
  model        str   Model override forwarded to the CLI  (optional)
  timeout_sec  int   Per-execution timeout in seconds     [300]
  cwd          str   Working directory on the remote node (optional)
"""

from __future__ import annotations

from typing import Any

import httpx

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter


class RemoteCLIAdapter(BaseAdapter):
    """Call musu-worker POST /execute/cli over HTTP."""

    @property
    def adapter_type(self) -> str:
        return "remote_cli"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        worker_url: str = ctx.config.get("worker_url", "")
        if not worker_url:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error="remote_cli adapter requires 'worker_url' in adapter_config",
            )

        worker_token: str | None = ctx.config.get("worker_token")
        cli_type: str = ctx.config.get("cli_type", "claude")
        model: str | None = ctx.config.get("model")
        timeout_sec: int = int(ctx.config.get("timeout_sec", 300))
        cwd: str | None = ctx.cwd or ctx.config.get("cwd")

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if worker_token:
            headers["Authorization"] = f"Bearer {worker_token}"

        payload: dict[str, Any] = {
            "prompt": ctx.prompt,
            "cli_type": cli_type,
            "timeout_sec": timeout_sec,
        }
        if model:
            payload["model"] = model
        if ctx.session_id:
            payload["session_id"] = ctx.session_id
        if cwd:
            payload["cwd"] = cwd

        # Allow extra grace time for the HTTP layer on top of the exec timeout.
        http_timeout = timeout_sec + 10

        try:
            async with httpx.AsyncClient(timeout=http_timeout) as client:
                resp = await client.post(
                    f"{worker_url.rstrip('/')}/execute/cli",
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
        session_id: str | None = data.get("session_id")

        error: str | None = None
        if not success:
            if stderr.strip():
                error = stderr.strip().splitlines()[0]
            else:
                error = f"CLI exited with code {exit_code}"

        return AdapterResult(
            run_id=ctx.run_id,
            success=success,
            summary=stdout.strip(),
            session_id=session_id,
            error=error,
            raw={"exit_code": exit_code, "stderr_snippet": stderr[:200]},
        )
