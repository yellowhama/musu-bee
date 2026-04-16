"""Process management utilities using psutil.

Provides list, start, kill, and status operations for host processes.
All operations are synchronous and safe to call from FastAPI async handlers
via run_in_threadpool or direct call (psutil is non-blocking for short ops).
"""

from __future__ import annotations

import os
import signal
import subprocess
import time
from typing import Optional

import psutil
from pydantic import BaseModel


class ProcessInfo(BaseModel):
    pid: int
    name: str
    cmdline: str
    cpu_percent: float
    memory_mb: float
    status: str  # "running" | "sleeping" | "stopped" | "zombie" | "idle"
    started_at: str  # ISO-8601
    username: str


class ProcessStartResult(BaseModel):
    pid: int
    name: str


def _format_iso(create_time: float) -> str:
    import datetime
    return datetime.datetime.utcfromtimestamp(create_time).strftime("%Y-%m-%dT%H:%M:%SZ")


def list_processes(name_filter: str | None = None) -> list[ProcessInfo]:
    """Return all running user-visible processes, optionally filtered by name substring."""
    result: list[ProcessInfo] = []
    for proc in psutil.process_iter(
        ["pid", "name", "cmdline", "cpu_percent", "memory_info", "status", "create_time", "username"]
    ):
        try:
            info = proc.info
            # Skip kernel threads (no cmdline, name starts with '[')
            name = info.get("name") or ""
            cmdline_parts = info.get("cmdline") or []
            cmdline = " ".join(cmdline_parts) if cmdline_parts else name

            if name_filter and name_filter.lower() not in name.lower() and name_filter.lower() not in cmdline.lower():
                continue

            mem_info = info.get("memory_info")
            memory_mb = round(mem_info.rss / 1024 / 1024, 2) if mem_info else 0.0

            result.append(ProcessInfo(
                pid=info["pid"],
                name=name,
                cmdline=cmdline,
                cpu_percent=round(info.get("cpu_percent") or 0.0, 1),
                memory_mb=memory_mb,
                status=info.get("status") or "unknown",
                started_at=_format_iso(info.get("create_time") or 0),
                username=info.get("username") or "",
            ))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    return sorted(result, key=lambda p: p.pid)


def get_process_status(pid: int) -> Optional[ProcessInfo]:
    """Return status for a single PID, or None if not found."""
    try:
        proc = psutil.Process(pid)
        with proc.oneshot():
            name = proc.name()
            try:
                cmdline_parts = proc.cmdline()
                cmdline = " ".join(cmdline_parts) if cmdline_parts else name
            except (psutil.AccessDenied, psutil.ZombieProcess):
                cmdline = name
            mem = proc.memory_info()
            return ProcessInfo(
                pid=pid,
                name=name,
                cmdline=cmdline,
                cpu_percent=round(proc.cpu_percent(interval=0.1), 1),
                memory_mb=round(mem.rss / 1024 / 1024, 2),
                status=proc.status(),
                started_at=_format_iso(proc.create_time()),
                username=proc.username(),
            )
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return None


def kill_process(pid: int, force: bool = False) -> bool:
    """Send SIGTERM (or SIGKILL if force=True) to a process.

    Returns True if signal was sent, False if process not found.
    """
    try:
        proc = psutil.Process(pid)
        if force:
            proc.kill()  # SIGKILL
        else:
            proc.terminate()  # SIGTERM
            # Give it 3s to exit gracefully; escalate to SIGKILL
            try:
                proc.wait(timeout=3)
            except psutil.TimeoutExpired:
                proc.kill()
        return True
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False


def start_process(
    command: str,
    args: list[str],
    cwd: str | None = None,
    env_extra: dict[str, str] | None = None,
) -> ProcessStartResult:
    """Spawn a detached background process.

    The child process is fully detached (new session, stdout/stderr to /dev/null)
    so it survives if the worker restarts.

    Returns the new process PID and name.
    Raises RuntimeError on failure.
    """
    full_env = dict(os.environ)
    if env_extra:
        full_env.update(env_extra)

    cmd = [command, *args]
    devnull = open(os.devnull, "wb")

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd or None,
            env=full_env,
            stdout=devnull,
            stderr=devnull,
            stdin=subprocess.DEVNULL,
            # Detach: new process group so CTRL-C on the worker doesn't kill children
            start_new_session=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"command not found: {command!r}") from exc
    except PermissionError as exc:
        raise RuntimeError(f"permission denied: {command!r}") from exc

    # Brief sleep to detect immediate crash
    time.sleep(0.1)
    if proc.poll() is not None:
        raise RuntimeError(
            f"process exited immediately (code {proc.returncode}): {' '.join(cmd)}"
        )

    return ProcessStartResult(pid=proc.pid, name=command)
