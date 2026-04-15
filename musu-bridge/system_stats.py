"""System resource stats — CPU, RAM, GPU, power.

Collected via psutil (CPU/RAM) + nvidia-smi (GPU).
GPU collection is best-effort: returns empty list if nvidia-smi not available.
"""
from __future__ import annotations

import asyncio
import logging
import subprocess
import time
from typing import Any

import psutil

logger = logging.getLogger(__name__)

# Cache to avoid hammering nvidia-smi on every request
_gpu_cache: dict[str, Any] = {"data": [], "ts": 0.0}
_GPU_CACHE_TTL = 2.0  # seconds


def _collect_gpu() -> list[dict]:
    """Run nvidia-smi and parse per-GPU stats. Returns [] on any error."""
    now = time.monotonic()
    if now - _gpu_cache["ts"] < _GPU_CACHE_TTL:
        return _gpu_cache["data"]

    query = (
        "index,name,utilization.gpu,memory.used,memory.total,"
        "power.draw,power.limit,temperature.gpu"
    )
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                f"--query-gpu={query}",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return []

        gpus = []
        for line in result.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 8:
                continue

            def _float(v: str) -> float | None:
                try:
                    return float(v)
                except ValueError:
                    return None

            gpus.append({
                "index": int(parts[0]),
                "name": parts[1],
                "utilization_pct": _float(parts[2]),
                "memory_used_mb": _float(parts[3]),
                "memory_total_mb": _float(parts[4]),
                "power_draw_w": _float(parts[5]),
                "power_limit_w": _float(parts[6]),
                "temperature_c": _float(parts[7]),
            })

        _gpu_cache["data"] = gpus
        _gpu_cache["ts"] = now
        return gpus

    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    except Exception as exc:
        logger.warning("system_stats: nvidia-smi failed — %s", exc)
        return []


def collect_stats() -> dict:
    """Return a snapshot of system resource usage."""
    # CPU — 0.1s interval for a quick but non-zero reading
    cpu_pct = psutil.cpu_percent(interval=0.1)
    cpu_count = psutil.cpu_count(logical=True)
    cpu_freq = psutil.cpu_freq()

    # RAM
    mem = psutil.virtual_memory()

    # Disk (root partition)
    try:
        disk = psutil.disk_usage("/")
        disk_info = {
            "total_gb": round(disk.total / 1e9, 1),
            "used_gb": round(disk.used / 1e9, 1),
            "free_gb": round(disk.free / 1e9, 1),
            "percent": disk.percent,
        }
    except Exception:
        disk_info = None

    return {
        "cpu": {
            "utilization_pct": cpu_pct,
            "count_logical": cpu_count,
            "freq_mhz": round(cpu_freq.current, 1) if cpu_freq else None,
        },
        "ram": {
            "total_gb": round(mem.total / 1e9, 1),
            "used_gb": round(mem.used / 1e9, 1),
            "available_gb": round(mem.available / 1e9, 1),
            "percent": mem.percent,
        },
        "disk": disk_info,
        "gpus": _collect_gpu(),
        "timestamp": time.time(),
    }


async def collect_stats_async() -> dict:
    """Async wrapper — offloads blocking calls to thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, collect_stats)
