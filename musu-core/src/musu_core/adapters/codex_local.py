"""Codex CLI subprocess adapter (OpenAI, mirrors claude_local pattern)."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter, ErrorCode, UsageSummary


def _parse_codex_output(stdout: str) -> dict[str, Any]:
    """Parse Codex CLI output.

    Codex outputs structured JSON when using --output-format json,
    or plain text otherwise.
    """
    session_id: str | None = None
    summary = ""

    # Try JSON parsing first
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
            if isinstance(event, dict):
                session_id = event.get("session_id") or session_id
                if event.get("type") == "result":
                    summary = event.get("result", "")
                elif event.get("type") == "message" and event.get("role") == "assistant":
                    content = event.get("content", "")
                    if content:
                        summary = content
        except json.JSONDecodeError:
            continue

    # Fallback: treat entire stdout as response
    if not summary:
        summary = stdout.strip()

    return {
        "session_id": session_id,
        "summary": summary,
    }


class CodexLocalAdapter(BaseAdapter):
    """Run Codex CLI as a subprocess."""

    @property
    def adapter_type(self) -> str:
        return "codex_local"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        command = ctx.config.get("command", "codex")
        model = ctx.config.get("model", "")
        cwd = ctx.cwd or ctx.config.get("cwd") or os.getcwd()
        timeout_sec = int(ctx.config.get("timeout_sec", 300))
        full_auto = bool(ctx.config.get("full_auto", True))

        def build_env() -> dict[str, str]:
            env = os.environ.copy()
            if ctx.task_id:
                env["MUSU_TASK_ID"] = ctx.task_id
            env["MUSU_AGENT_ID"] = ctx.agent_id
            env["MUSU_RUN_ID"] = ctx.run_id
            return env

        args: list[str] = []
        if full_auto:
            args.append("--full-auto")
        if model:
            args += ["--model", model]
        args += ["--quiet", ctx.prompt]

        proc = await asyncio.create_subprocess_exec(
            command,
            *args,
            stdin=asyncio.subprocess.PIPE,
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
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=f"Timed out after {timeout_sec}s",
                is_retriable=True,
                error_code=ErrorCode.TIMEOUT,
                raw={"exit_code": -1},
            )

        exit_code = proc.returncode or 0
        stdout = stdout_bytes.decode(errors="replace")
        stderr = stderr_bytes.decode(errors="replace")

        parsed = _parse_codex_output(stdout)
        success = exit_code == 0 and bool(parsed.get("summary"))

        error: str | None = None
        if not success:
            if stderr.strip():
                error = stderr.strip().splitlines()[0]
            elif exit_code != 0:
                error = f"Codex exited with code {exit_code}"
            else:
                error = "Empty response from Codex"

        error_code: ErrorCode | None = None
        is_retriable = False
        if not success:
            combined = f"{stderr} {stdout}".lower()
            if exit_code == -1:
                error_code = ErrorCode.TIMEOUT
                is_retriable = True
            elif any(h in combined for h in ("rate limit", "429", "too many requests")):
                error_code = ErrorCode.RATE_LIMIT
                is_retriable = True
            elif any(h in combined for h in ("context", "too long", "maximum context")):
                error_code = ErrorCode.CONTEXT_EXCEEDED
                is_retriable = False
            elif any(h in combined for h in ("timed out", "timeout")):
                error_code = ErrorCode.TIMEOUT
                is_retriable = True
            else:
                error_code = ErrorCode.UNKNOWN
                is_retriable = False

        return AdapterResult(
            run_id=ctx.run_id,
            success=success,
            summary=parsed.get("summary", ""),
            session_id=parsed.get("session_id"),
            error=error,
            is_retriable=is_retriable,
            error_code=error_code,
            raw={
                "exit_code": exit_code,
                "stdout_snippet": stdout[:500],
                "stderr_snippet": stderr[:200],
            },
        )
