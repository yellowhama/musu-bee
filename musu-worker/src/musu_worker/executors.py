"""CLI and process executors for musu-worker."""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any


@dataclass
class ExecResult:
    stdout: str
    stderr: str
    exit_code: int
    success: bool


async def run_process(
    command: str,
    args: list[str],
    cwd: str | None,
    timeout_sec: int = 600,
    env_extra: dict[str, str] | None = None,
) -> ExecResult:
    """Run an arbitrary process asynchronously."""
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)

    proc = await asyncio.create_subprocess_exec(
        command,
        *args,
        cwd=cwd or None,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout_sec
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return ExecResult(
            stdout="",
            stderr=f"Timed out after {timeout_sec}s",
            exit_code=-1,
            success=False,
        )

    rc = proc.returncode if proc.returncode is not None else -1
    return ExecResult(
        stdout=stdout_bytes.decode(errors="replace"),
        stderr=stderr_bytes.decode(errors="replace"),
        exit_code=rc,
        success=(rc == 0),
    )


async def run_cli(
    cli_type: str,
    prompt: str,
    model: str | None,
    session_id: str | None,
    cwd: str | None,
    timeout_sec: int = 300,
) -> ExecResult:
    """Run claude or codex CLI with a prompt and return the result."""
    if cli_type not in ("claude", "codex"):
        return ExecResult(
            stdout="",
            stderr=f"Unknown cli_type: {cli_type!r}. Must be 'claude' or 'codex'.",
            exit_code=1,
            success=False,
        )

    bin_path = shutil.which(cli_type)
    if bin_path is None:
        return ExecResult(
            stdout="",
            stderr=f"{cli_type} CLI not found on PATH",
            exit_code=1,
            success=False,
        )

    args: list[str] = []
    if cli_type == "claude":
        args += ["--print", "--output-format", "text"]
        if model:
            args += ["--model", model]
        if session_id:
            args += ["--resume", session_id]
        args += [prompt]
    else:  # codex
        args += ["-q"]
        if model:
            args += ["--model", model]
        args += [prompt]

    return await run_process(
        bin_path, args, cwd=cwd, timeout_sec=timeout_sec
    )
