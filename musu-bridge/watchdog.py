"""Watchdog: detect and cancel stuck tasks, rate-limit watchdog commands.

Extracted from server.py. 3-stage watchdog (warn/escalate/kill) with
configurable thresholds and rate-limited remote commands.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

from channel_circuit_breaker import _channel_cb
from metrics import _increment_stuck_counter

logger = logging.getLogger("musu.watchdog")

# ── Backend accessor ─────────────────────────────────────────────────────────

def _get_watchdog_backend():
    """Return the backend for watchdog stuck-task scanning (thin wrapper for testability)."""
    from handlers import _get_backend
    return _get_backend()


# ── Thresholds ───────────────────────────────────────────────────────────────

_WATCHDOG_KILL_SEC = int(
    os.environ.get("MUSU_WATCHDOG_KILL_SEC")
    or os.environ.get("MUSU_WATCHDOG_STUCK_THRESHOLD_SEC", "720")
)
_WATCHDOG_ESCALATE_SEC = int(os.environ.get("MUSU_WATCHDOG_ESCALATE_SEC", "300"))
_WATCHDOG_WARN_SEC = int(os.environ.get("MUSU_WATCHDOG_WARN_SEC", "120"))
_WATCHDOG_STUCK_THRESHOLD_SEC = _WATCHDOG_KILL_SEC


# ── Core watchdog scan ───────────────────────────────────────────────────────

async def _run_watchdog_once() -> int:
    """Scan route_executions for tasks stuck in 'running' state.

    3-stage watchdog:
      warn (WARN_SEC~ESCALATE_SEC): WARNING log
      escalate (ESCALATE_SEC~KILL_SEC): ERROR log
      kill (>KILL_SEC): mark failed + increment counter

    Returns the number of tasks cancelled.
    """
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    kill_cutoff = (now - timedelta(seconds=_WATCHDOG_KILL_SEC)).isoformat()
    escalate_cutoff = (now - timedelta(seconds=_WATCHDOG_ESCALATE_SEC)).isoformat()
    warn_cutoff = (now - timedelta(seconds=_WATCHDOG_WARN_SEC)).isoformat()

    try:
        backend = _get_watchdog_backend()
        # Use last_activity_at for kill scan — tasks actively streaming update this
        # field every ~30s, so only truly idle tasks cross the threshold.
        # COALESCE falls back to updated_at for rows predating v17 migration.
        stuck_rows = backend._db.execute(
            "SELECT id, channel, COALESCE(last_activity_at, updated_at) as last_activity_at "
            "FROM route_executions "
            "WHERE status = 'running' "
            "AND COALESCE(last_activity_at, updated_at) < ?",
            (kill_cutoff,),
        )
    except Exception as exc:
        logger.warning("watchdog: DB scan failed — %s", exc)
        return 0

    cancelled = 0
    for row in stuck_rows:
        task_id = row["id"] if isinstance(row, dict) else row[0]
        channel = (row["channel"] if isinstance(row, dict) else row[1]) or "unknown"
        last_activity_at = (row.get("last_activity_at") if isinstance(row, dict) else (row[2] if len(row) > 2 else None))
        try:
            backend.update_route_execution(
                task_id,
                "failed",
                error=(
                    f"auto-cancelled by watchdog: zombie — no last_activity_at update "
                    f"for > {_WATCHDOG_KILL_SEC}s"
                ),
            )
            _increment_stuck_counter(channel, "watchdog_timeout")
            _channel_cb.record_failure(channel)
            logger.warning(
                "watchdog: zombie cancel of task %s (agent_id=%s, last_activity_at=%s, kill_threshold=%ds)",
                task_id, channel, last_activity_at, _WATCHDOG_KILL_SEC,
                extra={"agent_id": channel, "task_id": task_id},
            )
            if _channel_cb.is_open(channel):
                logger.warning(
                    "watchdog: circuit breaker OPEN for channel=%r after watchdog kills",
                    channel,
                )
            cancelled += 1
        except Exception as exc:
            logger.warning("watchdog: failed to cancel task %s — %s", task_id, exc)

    # Escalate stage
    try:
        escalate_rows = backend._db.execute(
            "SELECT id, channel, COALESCE(last_activity_at, updated_at) as last_activity_at "
            "FROM route_executions "
            "WHERE status = 'running' "
            "AND COALESCE(last_activity_at, updated_at) < ? "
            "AND COALESCE(last_activity_at, updated_at) >= ?",
            (escalate_cutoff, kill_cutoff),
        )
        for row in escalate_rows:
            task_id = row["id"] if isinstance(row, dict) else row[0]
            channel = (row["channel"] if isinstance(row, dict) else row[1]) or "unknown"
            last_activity_at = (row.get("last_activity_at") if isinstance(row, dict) else (row[2] if len(row) > 2 else None))
            logger.error(
                "watchdog: ESCALATE task %s (agent_id=%s, last_activity_at=%s) stuck >%ds — kill in %ds",
                task_id, channel, last_activity_at, _WATCHDOG_ESCALATE_SEC,
                _WATCHDOG_KILL_SEC - _WATCHDOG_ESCALATE_SEC,
                extra={"agent_id": channel, "task_id": task_id},
            )
    except Exception as exc:
        logger.warning("watchdog: escalate scan failed — %s", exc)

    # Warn stage
    try:
        warn_rows = backend._db.execute(
            "SELECT id, channel, COALESCE(last_activity_at, updated_at) as last_activity_at "
            "FROM route_executions "
            "WHERE status = 'running' "
            "AND COALESCE(last_activity_at, updated_at) < ? "
            "AND COALESCE(last_activity_at, updated_at) >= ?",
            (warn_cutoff, escalate_cutoff),
        )
        for row in warn_rows:
            task_id = row["id"] if isinstance(row, dict) else row[0]
            channel = (row["channel"] if isinstance(row, dict) else row[1]) or "unknown"
            last_activity_at = (row.get("last_activity_at") if isinstance(row, dict) else (row[2] if len(row) > 2 else None))
            logger.warning(
                "watchdog: task %s (agent_id=%s, last_activity_at=%s) approaching timeout (%ds threshold)",
                task_id, channel, last_activity_at, _WATCHDOG_KILL_SEC,
                extra={"agent_id": channel, "task_id": task_id},
            )
    except Exception as exc:
        logger.warning("watchdog: early-warning scan failed — %s", exc)

    return cancelled


async def _watchdog_loop() -> None:
    """Background loop: every 60s scan for and cancel stuck tasks."""
    interval = int(os.environ.get("MUSU_WATCHDOG_INTERVAL_SEC", "60"))
    logger.info("watchdog: started (interval=%ds, threshold=%ds)", interval, _WATCHDOG_STUCK_THRESHOLD_SEC)
    await asyncio.sleep(interval)
    while True:
        try:
            n = await _run_watchdog_once()
            if n:
                logger.info("watchdog: cancelled %d stuck task(s)", n)
        except Exception as exc:
            logger.warning("watchdog: iteration error — %s", exc)
        await asyncio.sleep(interval)


# ── Rate limiting for remote watchdog commands ───────────────────────────────

_WATCHDOG_ALLOWED = frozenset({"bridge:start", "bridge:stop", "bridge:restart", "agents:cleanup"})

_watchdog_rate: dict[str, float] = {}
_WATCHDOG_RATE_WINDOW = 10.0


def _watchdog_rate_check(user_id: str, node: str, command: str) -> bool:
    """Return True if allowed, False if rate-limited. Updates the timestamp on True."""
    key = f"{user_id}:{node}:{command}"
    now = time.monotonic()
    last = _watchdog_rate.get(key, 0.0)
    if now - last < _WATCHDOG_RATE_WINDOW:
        return False
    _watchdog_rate[key] = now
    return True


async def _watchdog_rate_cleanup_loop() -> None:
    """Hourly: remove rate limit entries older than 24 hours to prevent unbounded growth."""
    while True:
        await asyncio.sleep(3600)
        cutoff = time.monotonic() - 86400
        stale = [k for k, v in _watchdog_rate.items() if v < cutoff]
        for k in stale:
            _watchdog_rate.pop(k, None)
        if stale:
            logger.info("watchdog rate cache: cleared %d stale entries", len(stale))
