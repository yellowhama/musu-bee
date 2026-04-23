"""Prometheus metrics helpers for musu-bridge.

Extracted from server.py to reduce god-file size.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("musu.metrics")

# ── Optional Prometheus imports ──────────────────────────────────────────────
try:
    from prometheus_fastapi_instrumentator import Instrumentator as _PFI
    from prometheus_client import (
        Counter as _Counter,
        Gauge as _Gauge,
        Histogram as _Histogram,
        REGISTRY as _PROM_REGISTRY,
    )
    _PROMETHEUS_AVAILABLE = True
except ImportError:
    _PROMETHEUS_AVAILABLE = False
    _PFI = None  # type: ignore[assignment,misc]
    _Counter = None  # type: ignore[assignment,misc]
    _Gauge = None  # type: ignore[assignment,misc]
    _Histogram = None  # type: ignore[assignment,misc]
    _PROM_REGISTRY = None  # type: ignore[assignment,misc]


# ── Metric factory helpers ───────────────────────────────────────────────────
def _prom_counter(name: str, doc: str, labels: list[str]) -> Any:
    try:
        return _Counter(name, doc, labels)
    except (ValueError, TypeError):
        return _PROM_REGISTRY._names_to_collectors.get(name) if _PROM_REGISTRY else None


def _prom_histogram(name: str, doc: str, labels: list[str], buckets: list[float]) -> Any:
    try:
        return _Histogram(name, doc, labels, buckets=buckets)
    except (ValueError, TypeError):
        return _PROM_REGISTRY._names_to_collectors.get(name) if _PROM_REGISTRY else None


def _prom_gauge(name: str, doc: str) -> Any:
    try:
        return _Gauge(name, doc)
    except (ValueError, TypeError):
        return _PROM_REGISTRY._names_to_collectors.get(name) if _PROM_REGISTRY else None


# ── Metric objects ───────────────────────────────────────────────────────────
if _PROMETHEUS_AVAILABLE:
    _agent_tasks_total = _prom_counter(
        "agent_tasks_total",
        "Tasks delegated by channel and outcome",
        ["channel", "status"],
    )
    _agent_task_duration = _prom_histogram(
        "agent_task_duration_seconds",
        "Wall-clock time for agent tasks",
        ["channel"],
        buckets=[30, 60, 120, 300, 600, 900, 1800],
    )
    _active_tasks_gauge = _prom_gauge("active_tasks_count", "Currently running async tasks")
    _task_stuck_total = _prom_counter(
        "task_stuck_total",
        "Tasks detected as stuck (no output / timeout) by channel and detection reason",
        ["channel", "reason"],
    )
else:
    _agent_tasks_total = None
    _agent_task_duration = None
    _active_tasks_gauge = None
    _task_stuck_total = None


# ── Active tasks count callback ──────────────────────────────────────────────
# server.py owns _active_tasks dict; we accept a callable to read its length.
_active_tasks_len: Callable[[], int] = lambda: 0


def set_active_tasks_len(fn: Callable[[], int]) -> None:
    """Register the callable that returns len(_active_tasks)."""
    global _active_tasks_len
    _active_tasks_len = fn


# ── Recording helpers ────────────────────────────────────────────────────────
def _record_task_metric(channel: str, status: str, duration_s: float | None = None) -> None:
    """Increment agent task counters. No-op if prometheus unavailable."""
    if _agent_tasks_total is not None:
        _agent_tasks_total.labels(channel=channel, status=status).inc()
    if duration_s is not None and _agent_task_duration is not None:
        _agent_task_duration.labels(channel=channel).observe(duration_s)
    if _active_tasks_gauge is not None:
        _active_tasks_gauge.set(_active_tasks_len())


def _increment_stuck_counter(channel: str, reason: str) -> None:
    """Increment task_stuck_total counter. No-op if prometheus unavailable."""
    if _task_stuck_total is not None:
        _task_stuck_total.labels(channel=channel, reason=reason).inc()


def instrument_app(app: Any) -> None:
    """Attach Prometheus instrumentator to the FastAPI app."""
    if _PROMETHEUS_AVAILABLE and _PFI is not None:
        try:
            _PFI().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
        except ValueError:
            pass
