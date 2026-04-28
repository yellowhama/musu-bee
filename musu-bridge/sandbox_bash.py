"""Sandbox Bash — local command execution with safety guards.

Allows agents to run bash commands on the local machine with:
- Blocked command patterns (destructive operations)
- Timeout enforcement
- Output size limits
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

logger = logging.getLogger("musu.sandbox_bash")

MAX_TIMEOUT = 120  # seconds
MAX_OUTPUT_BYTES = 50_000  # ~50KB

# Commands that are never allowed (case-insensitive substring match)
_BLOCKED_PATTERNS = [
    r"rm\s+-rf\s+/\s*$",       # rm -rf /
    r"rm\s+-rf\s+/\*",         # rm -rf /*
    r"mkfs\.",                  # mkfs.ext4 etc
    r"dd\s+if=.*of=/dev/",     # dd to device
    r":\(\)\{.*\|.*&\}\s*;",   # fork bomb
    r"\bshutdown\b",
    r"\breboot\b",
    r"\bhalt\b",
    r"\bpoweroff\b",
    r"chmod\s+(-R\s+)?777\s+/", # chmod 777 /
    r">\s*/dev/sd",             # write to disk device
    r"curl.*\|\s*(ba)?sh",      # curl | bash (pipe to shell)
    r"wget.*\|\s*(ba)?sh",      # wget | bash
]

_BLOCKED_RE = [re.compile(p, re.IGNORECASE) for p in _BLOCKED_PATTERNS]


def _is_blocked(command: str) -> str | None:
    """Return the matched pattern description if blocked, else None."""
    for pattern in _BLOCKED_RE:
        if pattern.search(command):
            return pattern.pattern
    return None


async def execute_bash(
    command: str,
    cwd: str | None = None,
    timeout: int = 30,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Execute a bash command with safety checks.

    Returns:
        {"exit_code": int, "stdout": str, "stderr": str, "duration_ms": float}
        or {"error": str} if blocked/failed.
    """
    # Enforce timeout limit
    timeout = min(max(timeout, 1), MAX_TIMEOUT)

    # Check blocked commands
    blocked = _is_blocked(command)
    if blocked:
        logger.warning("sandbox_bash: BLOCKED command=%r pattern=%s", command[:80], blocked)
        return {"error": f"Command blocked by safety guard (matched: {blocked})"}

    start = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )

        duration_ms = (time.monotonic() - start) * 1000

        stdout = stdout_bytes.decode(errors="replace")[:MAX_OUTPUT_BYTES]
        stderr = stderr_bytes.decode(errors="replace")[:MAX_OUTPUT_BYTES]

        logger.info(
            "sandbox_bash: cmd=%r exit=%d duration=%.0fms",
            command[:80], proc.returncode, duration_ms,
        )

        return {
            "exit_code": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "duration_ms": round(duration_ms, 1),
        }
    except asyncio.TimeoutError:
        duration_ms = (time.monotonic() - start) * 1000
        logger.warning("sandbox_bash: TIMEOUT cmd=%r after %ds", command[:80], timeout)
        return {"error": f"Command timed out after {timeout}s", "duration_ms": round(duration_ms, 1)}
    except Exception as exc:
        return {"error": f"Execution failed: {exc}"}
