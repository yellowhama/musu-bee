"""Claude CLI subprocess adapter (mirrors Paperclip claude_local pattern)."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter, ErrorCode, UsageSummary, resolve_instructions

# Env vars that cause "cannot be launched inside another session" errors when
# Claude Code runs nested inside another Claude Code session.
_NESTING_VARS = [
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SESSION",
    "CLAUDE_CODE_PARENT_SESSION",
]


def _parse_stream_json(stdout: str) -> dict[str, Any]:
    """Extract session_id, summary, usage from claude --output-format stream-json output."""
    session_id: str | None = None
    model = ""
    final_result: dict[str, Any] | None = None
    assistant_texts: list[str] = []

    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        event_type = event.get("type", "")

        if event_type == "system" and event.get("subtype") == "init":
            session_id = event.get("session_id") or session_id
            model = event.get("model", model)
            continue

        if event_type == "assistant":
            session_id = event.get("session_id") or session_id
            message = event.get("message", {})
            for block in message.get("content", []):
                if isinstance(block, dict) and block.get("type") == "text":
                    text = block.get("text", "")
                    if text:
                        assistant_texts.append(text)
            continue

        if event_type == "result":
            final_result = event
            session_id = event.get("session_id") or session_id

    if not final_result:
        return {
            "session_id": session_id,
            "model": model,
            "summary": "\n\n".join(assistant_texts).strip(),
            "usage": None,
            "cost_usd": None,
            "result_json": None,
        }

    usage_obj = final_result.get("usage", {}) or {}
    usage = UsageSummary(
        input_tokens=int(usage_obj.get("input_tokens", 0)),
        cached_input_tokens=int(usage_obj.get("cache_read_input_tokens", 0)),
        output_tokens=int(usage_obj.get("output_tokens", 0)),
        cache_creation_input_tokens=int(usage_obj.get("cache_creation_input_tokens", 0)),
    )
    cost_raw = final_result.get("total_cost_usd")
    cost_usd = float(cost_raw) if isinstance(cost_raw, (int, float)) else None

    # Token audit logging — include full usage breakdown so cost can be reconciled
    import logging as _log
    _log.getLogger("musu.token_audit").info(
        "token_audit: in=%d cached=%d cache_create=%d out=%d cost=$%.4f model=%s usage=%s",
        usage.input_tokens, usage.cached_input_tokens, usage.cache_creation_input_tokens,
        usage.output_tokens, cost_usd or 0.0, model, dict(usage_obj),
    )

    summary = (final_result.get("result") or "\n\n".join(assistant_texts)).strip()

    return {
        "session_id": session_id,
        "model": model,
        "summary": summary,
        "usage": usage,
        "cost_usd": cost_usd,
        "result_json": final_result,
    }


def _is_unknown_session_error(result_json: dict[str, Any] | None) -> bool:
    if not result_json:
        return False
    subtype = result_json.get("subtype", "")
    result_text = str(result_json.get("result", "")).lower()
    return "unknown_session" in subtype or "session not found" in result_text or "invalid session" in result_text


class ClaudeLocalAdapter(BaseAdapter):
    """Run Claude CLI as a subprocess, stream-JSON mode."""

    @property
    def adapter_type(self) -> str:
        return "claude_local"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        command = ctx.config.get("command", "claude")
        model = ctx.config.get("model", "claude-sonnet-4-5")
        cwd = ctx.cwd or ctx.config.get("cwd") or os.getcwd()
        timeout_sec = int(ctx.config.get("timeout_sec", 300))
        instructions_path = resolve_instructions(
            ctx.instructions_path or ctx.config.get("instructions_path"),
            self.adapter_type
        )
        dangerously_skip_permissions = bool(ctx.config.get("dangerously_skip_permissions", False))

        def build_env() -> dict[str, str]:
            env = os.environ.copy()
            # Strip nesting vars that prevent nested Claude Code launch
            for key in _NESTING_VARS:
                env.pop(key, None)
            # Forward task context
            if ctx.task_id:
                env["MUSU_TASK_ID"] = ctx.task_id
                # Per-task workspace for file-based agent communication
                from musu_core.task_workspace import TaskWorkspace
                ws = TaskWorkspace(ctx.task_id)
                if ws.exists():
                    env["MUSU_TASK_WORKSPACE"] = str(ws.path)
            env["MUSU_AGENT_ID"] = ctx.agent_id
            env["MUSU_RUN_ID"] = ctx.run_id
            if ctx.company_id:
                env["PAPERCLIP_COMPANY_ID"] = ctx.company_id
            return env

        def build_args(resume_session_id: str | None) -> list[str]:
            args = [
                "--print", "-",
                "--output-format", "stream-json",
                "--verbose",
            ]
            if resume_session_id:
                args += ["--resume", resume_session_id]
            if dangerously_skip_permissions:
                args.append("--dangerously-skip-permissions")
            if model:
                args += ["--model", model]
            if instructions_path:
                args += ["--append-system-prompt-file", instructions_path]
            max_tokens = ctx.config.get("max_tokens", 4096)
            args += ["--max-tokens", str(max_tokens)]
            return args

        async def run_attempt(resume_session_id: str | None) -> tuple[int, str, str]:
            args = build_args(resume_session_id)
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
                proc.stdin.write(ctx.prompt.encode())
                await proc.stdin.drain()
                proc.stdin.close()

                stdout_chunks: list[bytes] = []
                stderr_chunks: list[bytes] = []

                async def read_stdout() -> None:
                    while True:
                        chunk = await proc.stdout.read(4096)
                        if not chunk:
                            break
                        stdout_chunks.append(chunk)

                async def read_stderr() -> None:
                    while True:
                        chunk = await proc.stderr.read(4096)
                        if not chunk:
                            break
                        stderr_chunks.append(chunk)

                try:
                    await asyncio.wait_for(
                        asyncio.gather(read_stdout(), read_stderr(), proc.wait()),
                        timeout=timeout_sec,
                    )
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
                    return -1, b"".join(stdout_chunks).decode(errors="replace"), f"Timed out after {timeout_sec}s"

                return (
                    proc.returncode or 0,
                    b"".join(stdout_chunks).decode(errors="replace"),
                    b"".join(stderr_chunks).decode(errors="replace"),
                )
            except Exception:
                proc.kill()
                raise

        exit_code, stdout, stderr = await run_attempt(ctx.session_id)

        parsed = _parse_stream_json(stdout)

        # Retry without --resume if session is unknown
        if exit_code != 0 and ctx.session_id and _is_unknown_session_error(parsed.get("result_json")):
            exit_code, stdout, stderr = await run_attempt(None)
            parsed = _parse_stream_json(stdout)
            parsed["session_id"] = None  # session was dropped

        success = exit_code == 0 and bool(parsed.get("summary"))
        error: str | None = None
        if not success:
            if stderr.strip():
                error = stderr.strip().splitlines()[0]
            elif exit_code != 0:
                error = f"Claude exited with code {exit_code}"
            else:
                error = "Empty response from Claude"

        # Classify the error and decide whether fallback is safe.
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
            elif any(h in combined for h in ("context", "too long", "maximum context", "context window", "context_length")):
                error_code = ErrorCode.CONTEXT_EXCEEDED
                is_retriable = False  # same context will fail any adapter
            elif any(h in combined for h in ("connect error", "connection refused", "model not available", "model_not_found", "no such model")):
                error_code = ErrorCode.MODEL_UNAVAILABLE
                is_retriable = True
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
            usage=parsed.get("usage"),
            cost_usd=parsed.get("cost_usd"),
            error=error,
            is_retriable=is_retriable,
            error_code=error_code,
            raw={
                "exit_code": exit_code,
                "stdout_snippet": stdout[:500],
                "stderr_snippet": stderr[:200],
                "result_json": parsed.get("result_json"),
            },
        )
