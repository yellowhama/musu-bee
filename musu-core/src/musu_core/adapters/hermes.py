"""Hermes Agent CLI subprocess adapter (NousResearch, MIT, 200+ model support)."""

from __future__ import annotations

import asyncio
import os
from typing import Any

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter


def _parse_hermes_output(stdout: str) -> tuple[str, str | None]:
    """Parse Hermes stdout into (response_text, session_id).

    Hermes output format:
        <response text>
        session_id: <id>   ← optional last line
    """
    lines = stdout.splitlines()
    session_id: str | None = None

    if lines and lines[-1].startswith("session_id:"):
        raw = lines[-1].split(":", 1)[1].strip()
        if raw:
            session_id = raw
        lines = lines[:-1]

    response = "\n".join(lines).strip()
    return response, session_id


class HermesAdapter(BaseAdapter):
    """Run Hermes Agent CLI as a subprocess.

    adapter_config keys:
        command      (str)  executable name or path, default "hermes"
        model        (str)  model string forwarded via -m, optional
        provider     (str)  provider prefix (e.g. "openrouter"), optional
        toolsets     (list) toolsets to enable, optional
        timeout_sec  (int)  wall-clock timeout in seconds, default 300
        yolo         (bool) pass --yolo flag, default True
        quiet        (bool) pass -Q flag for clean stdout, default True
    """

    @property
    def adapter_type(self) -> str:
        return "hermes"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        command = ctx.config.get("command", "hermes")
        model: str | None = ctx.config.get("model")
        provider: str | None = ctx.config.get("provider")
        toolsets: list[str] = ctx.config.get("toolsets") or []
        timeout_sec = int(ctx.config.get("timeout_sec", 300))
        yolo = bool(ctx.config.get("yolo", True))
        quiet = bool(ctx.config.get("quiet", True))
        cwd = ctx.cwd or ctx.config.get("cwd") or os.getcwd()

        def build_env() -> dict[str, str]:
            env = os.environ.copy()
            if ctx.task_id:
                env["MUSU_TASK_ID"] = ctx.task_id
            env["MUSU_AGENT_ID"] = ctx.agent_id
            env["MUSU_RUN_ID"] = ctx.run_id
            return env

        def build_args(resume_session_id: str | None) -> list[str]:
            args = ["chat", "-q", ctx.prompt]
            if quiet:
                args.append("-Q")
            if yolo:
                args.append("--yolo")
            if resume_session_id:
                args += ["--resume", resume_session_id]
            if model:
                effective_model = f"{provider}:{model}" if provider else model
                args += ["-m", effective_model]
            for ts in toolsets:
                args += ["--toolset", ts]
            return args

        async def run_attempt(resume_session_id: str | None) -> tuple[int, str, str]:
            args = build_args(resume_session_id)
            proc = await asyncio.create_subprocess_exec(
                command,
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=build_env(),
            )
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=timeout_sec,
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return -1, "", f"Timed out after {timeout_sec}s"
            return (proc.returncode or 0), stdout_bytes.decode(errors="replace"), stderr_bytes.decode(errors="replace")

        exit_code, stdout, stderr = await run_attempt(ctx.session_id)
        response, session_id = _parse_hermes_output(stdout)

        success = exit_code == 0 and bool(response)
        error: str | None = None
        if not success:
            if stderr.strip():
                error = stderr.strip().splitlines()[0]
            elif exit_code != 0:
                error = f"Hermes exited with code {exit_code}"
            else:
                error = "Empty response from Hermes"

        return AdapterResult(
            run_id=ctx.run_id,
            success=success,
            summary=response,
            session_id=session_id,
            error=error,
            raw={
                "exit_code": exit_code,
                "stdout_snippet": stdout[:500],
                "stderr_snippet": stderr[:200],
            },
        )
