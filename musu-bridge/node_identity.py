"""Auto-detect node environment: OS, WSL2, GPU, physical machine identity.

Called at bridge startup to populate node_join with machine metadata.
No external dependencies — uses only stdlib + subprocess.
"""
from __future__ import annotations

import logging
import os
import platform
import subprocess

logger = logging.getLogger(__name__)


def _run(cmd: list[str], timeout: float = 5.0) -> str:
    """Run a command, return stripped stdout or empty string on failure."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, timeout=timeout,
            # Don't use text=True — handle encoding manually for cmd.exe compat
        )
        return result.stdout.decode("utf-8", errors="replace").strip()
    except Exception:
        return ""


def _is_wsl2() -> bool:
    try:
        with open("/proc/version", "r") as f:
            return "microsoft" in f.read().lower()
    except Exception:
        return False


def _detect_os() -> str:
    if _is_wsl2():
        return "wsl2"
    system = platform.system().lower()
    if system == "linux":
        return "linux"
    elif system == "darwin":
        return "macos"
    elif system == "windows":
        return "windows"
    return system


def _detect_gpu() -> str:
    # Try nvidia-smi from multiple known paths
    for nvidia_smi in [
        "nvidia-smi",
        "/usr/lib/wsl/lib/nvidia-smi",   # WSL2
        "/usr/bin/nvidia-smi",            # native Linux
    ]:
        gpu = _run([nvidia_smi, "--query-gpu=name", "--format=csv,noheader"])
        if gpu:
            return gpu.split("\n")[0].strip()
    return ""


def _detect_win_hostname() -> str:
    """Get Windows hostname from WSL2 via cmd.exe."""
    if not _is_wsl2():
        return ""
    # Try full path first, then PATH lookup
    for cmd in ["/mnt/c/WINDOWS/system32/cmd.exe", "cmd.exe"]:
        hostname = _run([cmd, "/c", "hostname"])
        if hostname:
            return hostname.replace("\r", "").replace("\n", "").strip()
    return ""


def _detect_machine_id() -> str:
    try:
        with open("/etc/machine-id", "r") as f:
            return f.read().strip()
    except Exception:
        return ""


def _detect_tailscale_ip() -> str:
    return _run(["tailscale", "ip", "-4"])


def detect_node_identity() -> dict:
    """Auto-detect current node's environment.

    Returns dict with: os, machine, machine_id, hostname, win_hostname,
    gpu, tailscale_ip. All values are strings, empty if not available.
    """
    detected_os = _detect_os()
    hostname = platform.node()
    win_hostname = _detect_win_hostname()
    gpu = _detect_gpu()
    machine_id = _detect_machine_id()
    tailscale_ip = _detect_tailscale_ip()

    # Physical machine name: Windows hostname if WSL2, else hostname
    if detected_os == "wsl2" and win_hostname:
        machine = f"{win_hostname}-pc"
    else:
        machine = f"{hostname}-pc"

    identity = {
        "os": detected_os,
        "machine": machine,
        "machine_id": machine_id,
        "hostname": hostname,
        "win_hostname": win_hostname,
        "gpu": gpu,
        "tailscale_ip": tailscale_ip,
    }

    logger.info(
        "node_identity: os=%s machine=%s win_hostname=%s gpu=%s tailscale=%s",
        detected_os, machine, win_hostname or "(n/a)", gpu or "(none)", tailscale_ip or "(n/a)",
    )
    return identity
