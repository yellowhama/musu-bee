"""Gemini CLI subprocess adapter (mirrors claude_local pattern)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

logger = logging.getLogger("musu.adapter.gemini")

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter, ErrorCode, UsageSummary, resolve_instructions


def _prompt_with_instructions(prompt: str, instructions_path: str | None) -> str:
    """Gemini CLI 0.35 no longer accepts append-system-prompt-file; inline it."""
    if not instructions_path:
        return prompt

    try:
        with open(instructions_path, "r", encoding="utf-8") as f:
            instructions = f.read().strip()
    except OSError:
        logger.warning("instructions file not found: %s", instructions_path)
        return prompt

    if not instructions:
        logger.debug("instructions file empty: %s", instructions_path)
        return prompt

    return (
        "<system_instructions>\n"
        f"{instructions}\n"
        "</system_instructions>\n\n"
        "<user_task>\n"
        f"{prompt}\n"
        "</user_task>"
    )


def _parse_stream_json(stdout: str) -> dict[str, Any]:
    """Extract session_id, summary, usage from gemini --output-format stream-json output."""
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
            # Skip non-JSON noise (e.g., "Loaded cached credentials.")
            continue

        event_type = event.get("type", "")

        if event_type == "init":
            session_id = event.get("session_id") or session_id
            model = event.get("model", model)
            continue

        if event_type == "message" and event.get("role") == "assistant":
            content = event.get("content", "")
            if content:
                assistant_texts.append(content)
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

    stats = final_result.get("stats", {})
    usage = UsageSummary(
        input_tokens=int(stats.get("input_tokens", 0)),
        cached_input_tokens=int(stats.get("cached", 0)),
        output_tokens=int(stats.get("output_tokens", 0)),
    )

    summary = "\n\n".join(assistant_texts).strip()
    if not summary:
        summary = final_result.get("response", "")

    return {
        "session_id": session_id,
        "model": model,
        "summary": summary,
        "usage": usage,
        "cost_usd": None,  # Gemini CLI doesn't report cost
        "result_json": final_result,
    }


class GeminiLocalAdapter(BaseAdapter):
    """Run Gemini CLI as a subprocess, stream-JSON mode."""

    @property
    def adapter_type(self) -> str:
        return "gemini_local"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        command = ctx.config.get("command", "gemini")
        model = ctx.config.get("model", "gemini-2.5-flash")
        cwd = ctx.cwd or ctx.config.get("cwd") or os.getcwd()
        timeout_sec = int(ctx.config.get("timeout_sec", 300))
        instructions_path = resolve_instructions(
            ctx.instructions_path or ctx.config.get("instructions_path"),
            self.adapter_type
        )
        yolo = bool(ctx.config.get("yolo", True))
        sandbox = bool(ctx.config.get("sandbox", False))

        def build_env() -> dict[str, str]:
            env = os.environ.copy()
            if ctx.task_id:
                env["MUSU_TASK_ID"] = ctx.task_id
            env["MUSU_AGENT_ID"] = ctx.agent_id
            env["MUSU_RUN_ID"] = ctx.run_id
            if ctx.company_id:
                env["PAPERCLIP_COMPANY_ID"] = ctx.company_id
            return env

        # MCP control: disable_mcp=true → no MCP tools loaded (saves ~40K tokens/call)
        disable_mcp = bool(ctx.config.get("disable_mcp", False))
        allowed_mcp = ctx.config.get("allowed_mcp_servers")  # list of server names or None

        def build_args() -> list[str]:
            prompt = _prompt_with_instructions(ctx.prompt, instructions_path)
            args = [
                "--output-format", "stream-json",
                "--prompt", prompt,
            ]
            if model:
                args += ["--model", model]
            if yolo:
                args.append("--yolo")
            if sandbox:
                args.append("--sandbox")
            if ctx.session_id:
                args += ["--resume", ctx.session_id]
            # MCP control
            if disable_mcp:
                args += ["-e", ""]  # empty extensions list = no MCP servers
            elif allowed_mcp:
                for name in allowed_mcp:
                    args += ["--allowed-mcp-server-names", name]
            return args

        args = build_args()
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

        parsed = _parse_stream_json(stdout)
        # Gemini CLI may exit 1 due to MCP warnings (e.g. disconnected servers)
        # but still produce valid output. Accept if summary exists.
        success = bool(parsed.get("summary"))

        if not success:
            # Filter stderr noise
            stderr_meaningful = [
                l for l in stderr.strip().splitlines()
                if "keychain" not in l.lower()
                and "filekeychain" not in l.lower()
                and "cached credentials" not in l.lower()
                and "listchanged" not in l.lower()
                and "notification" not in l.lower()
            ]
            stderr_useful = "\n".join(stderr_meaningful[:5])
            logger.warning(
                "gemini_local: exit=%d summary_len=%d stdout_len=%d stderr_lines=%s",
                exit_code, len(parsed.get("summary", "")), len(stdout),
                repr(stderr_useful[:500]),
            )

        error: str | None = None
        if not success:
            if stderr.strip():
                # Filter Keychain noise
                meaningful = [
                    l for l in stderr.strip().splitlines()
                    if "keychain" not in l.lower()
                    and "filekeychain" not in l.lower()
                    and "cached credentials" not in l.lower()
                ]
                error = meaningful[0] if meaningful else stderr.strip().splitlines()[0]
            elif exit_code != 0:
                error = f"Gemini exited with code {exit_code}"
            else:
                error = "Empty response from Gemini"

        error_code: ErrorCode | None = None
        is_retriable = False
        if not success:
            combined = f"{stderr} {stdout}".lower()
            if exit_code == -1:
                error_code = ErrorCode.TIMEOUT
                is_retriable = True
            elif any(h in combined for h in ("rate limit", "429", "too many requests", "quota")):
                error_code = ErrorCode.RATE_LIMIT
                is_retriable = True
            elif any(h in combined for h in ("context", "too long", "maximum context")):
                error_code = ErrorCode.CONTEXT_EXCEEDED
                is_retriable = False
            elif any(h in combined for h in ("auth", "unauthorized", "unauthenticated", "login")):
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
