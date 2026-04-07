"""Generic subprocess adapter — runs any command with the prompt as stdin."""

from __future__ import annotations

import asyncio
import os

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter, ErrorCode


class ProcessAdapter(BaseAdapter):
    """Execute an arbitrary command with prompt on stdin, capture stdout as summary."""

    @property
    def adapter_type(self) -> str:
        return "process"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        command: str = ctx.config.get("command", "")
        args: list[str] = ctx.config.get("args", [])
        cwd: str = ctx.cwd or ctx.config.get("cwd") or os.getcwd()
        timeout_sec: int = int(ctx.config.get("timeout_sec", 120))

        if not command:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error="process adapter requires 'command' in adapter_config",
            )

        env = os.environ.copy()
        env["MUSU_RUN_ID"] = ctx.run_id
        env["MUSU_AGENT_ID"] = ctx.agent_id
        if ctx.task_id:
            env["MUSU_TASK_ID"] = ctx.task_id

        try:
            proc = await asyncio.create_subprocess_exec(
                command,
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(input=ctx.prompt.encode()),
                timeout=timeout_sec,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=f"Process timed out after {timeout_sec}s",
                is_retriable=True,
                error_code=ErrorCode.TIMEOUT,
            )
        except Exception as exc:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=str(exc),
                is_retriable=True,
                error_code=ErrorCode.UNKNOWN,
            )

        exit_code = proc.returncode if proc.returncode is not None else -1
        stdout = stdout_bytes.decode(errors="replace").strip()
        stderr = stderr_bytes.decode(errors="replace").strip()
        success = exit_code == 0

        error_code: ErrorCode | None = None
        is_retriable = False
        if not success:
            combined = f"{stderr} {stdout}".lower()
            if any(h in combined for h in ("rate limit", "429", "too many requests")):
                error_code = ErrorCode.RATE_LIMIT
                is_retriable = True
            elif any(h in combined for h in ("context", "too long", "context_length")):
                error_code = ErrorCode.CONTEXT_EXCEEDED
                is_retriable = False
            elif any(h in combined for h in ("connection refused", "no such model", "model not found")):
                error_code = ErrorCode.MODEL_UNAVAILABLE
                is_retriable = True
            else:
                error_code = ErrorCode.UNKNOWN
                is_retriable = False

        return AdapterResult(
            run_id=ctx.run_id,
            success=success,
            summary=stdout,
            error=stderr.splitlines()[0] if not success and stderr else None,
            is_retriable=is_retriable,
            error_code=error_code,
            raw={"exit_code": exit_code, "stderr_snippet": stderr[:200]},
        )
