"""OpenClaw CLI subprocess adapter (347k+ stars, 50+ channel support)."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter, ErrorCode


def _parse_openclaw_output(stdout: str, use_json: bool) -> tuple[str, dict[str, Any]]:
    """Parse OpenClaw stdout into (response_text, metadata).

    If --json was used, parse structured output.
    Otherwise, return raw text.
    """
    if not use_json:
        return stdout.strip(), {}

    # OpenClaw --json outputs structured payload
    try:
        data = json.loads(stdout)
        # Extract the agent message from various possible formats
        if isinstance(data, dict):
            response = data.get("message", data.get("response", data.get("text", "")))
            return str(response).strip(), data
        return stdout.strip(), {}
    except json.JSONDecodeError:
        # Fallback: might be JSONL (one JSON per line, last is the response)
        lines = stdout.strip().splitlines()
        for line in reversed(lines):
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    response = obj.get("message", obj.get("response", obj.get("text", "")))
                    if response:
                        return str(response).strip(), obj
            except json.JSONDecodeError:
                continue
        return stdout.strip(), {}


class OpenClawAdapter(BaseAdapter):
    """Run OpenClaw CLI as a subprocess.

    adapter_config keys:
        command      (str)  executable name or path, default "openclaw"
        profile      (int)  agent profile number, optional
        timeout_sec  (int)  wall-clock timeout in seconds, default 300
        json_output  (bool) use --json flag for structured output, default True
        no_color     (bool) disable ANSI colors, default True
    """

    @property
    def adapter_type(self) -> str:
        return "openclaw"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        command = ctx.config.get("command", "openclaw")
        profile: int | None = ctx.config.get("profile")
        timeout_sec = int(ctx.config.get("timeout_sec", 300))
        use_json = bool(ctx.config.get("json_output", True))
        no_color = bool(ctx.config.get("no_color", True))
        cwd = ctx.cwd or ctx.config.get("cwd") or os.getcwd()

        def build_env() -> dict[str, str]:
            env = os.environ.copy()
            if ctx.task_id:
                env["MUSU_TASK_ID"] = ctx.task_id
            env["MUSU_AGENT_ID"] = ctx.agent_id
            env["MUSU_RUN_ID"] = ctx.run_id
            if ctx.company_id:
                env["PAPERCLIP_COMPANY_ID"] = ctx.company_id
            return env

        def build_args() -> list[str]:
            args = ["agent", "--message", ctx.prompt, "--non-interactive"]
            if use_json:
                args.append("--json")
            if no_color:
                args.append("--no-color")
            if profile is not None:
                args += ["--profile", str(profile)]
            return args

        args = build_args()
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
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=f"Timed out after {timeout_sec}s",
                is_retriable=True,
                error_code=ErrorCode.TIMEOUT,
            )

        exit_code = proc.returncode or 0
        stdout = stdout_bytes.decode(errors="replace")
        stderr = stderr_bytes.decode(errors="replace")

        response, metadata = _parse_openclaw_output(stdout, use_json)
        success = exit_code == 0 and bool(response)

        error: str | None = None
        error_code: ErrorCode | None = None
        is_retriable = False

        if not success:
            combined = f"{stderr} {stdout}".lower()
            if any(h in combined for h in ("rate limit", "429", "too many requests")):
                error_code = ErrorCode.RATE_LIMIT
                is_retriable = True
            elif any(h in combined for h in ("context", "too long", "token limit")):
                error_code = ErrorCode.CONTEXT_EXCEEDED
            elif any(h in combined for h in ("timeout", "timed out")):
                error_code = ErrorCode.TIMEOUT
                is_retriable = True
            else:
                error_code = ErrorCode.UNKNOWN

            if stderr.strip():
                error = stderr.strip().splitlines()[0]
            elif exit_code != 0:
                error = f"OpenClaw exited with code {exit_code}"
            else:
                error = "Empty response from OpenClaw"

        return AdapterResult(
            run_id=ctx.run_id,
            success=success,
            summary=response,
            error=error,
            is_retriable=is_retriable,
            error_code=error_code,
            raw={
                "exit_code": exit_code,
                "stdout_snippet": stdout[:500],
                "stderr_snippet": stderr[:200],
                "metadata": metadata,
            },
        )
