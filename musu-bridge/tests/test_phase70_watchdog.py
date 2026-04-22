"""Phase 70: Agent Stuck Watchdog tests.

Tests:
1. _heartbeat_iteration releases _heartbeat_lock even when route_chat times out
2. _watchdog_loop cancels stuck route_executions (running + age > 360s)
"""
import asyncio
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# 1. Heartbeat timeout releases _heartbeat_lock
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_heartbeat_timeout_releases_lock():
    """If route_chat hangs and asyncio.wait_for raises TimeoutError,
    _heartbeat_lock must be released so future heartbeats can proceed."""
    import server

    # Mock _should_skip_heartbeat to allow running
    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = []  # no running tasks, no failures

    async def slow_route_chat(**kwargs):
        await asyncio.sleep(9999)  # simulate hang

    with (
        patch("server._get_heartbeat_backend", return_value=mock_backend),
        patch("server._should_skip_heartbeat", return_value=(False, "")),
        patch("server.route_chat", side_effect=asyncio.TimeoutError()),
    ):
        # Should complete without raising, and lock must be free afterward
        await server._heartbeat_iteration(
            agent_name="ceo",
            company_id=None,
            diag_summary="",
        )

    # Lock must not be held — a second acquisition should succeed immediately
    acquired = server._heartbeat_lock.locked()
    assert not acquired, "_heartbeat_lock still held after TimeoutError — deadlock risk"


# ---------------------------------------------------------------------------
# 2. Watchdog cancels stuck route_executions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_watchdog_cancels_stuck_tasks():
    """_watchdog_loop should detect route_executions stuck in 'running' state
    for > 360 seconds and mark them as failed."""
    import server

    # Simulate a stuck task: created 400s ago, still 'running'
    old_time = (datetime.now(timezone.utc) - timedelta(seconds=400)).isoformat()
    stuck_row = {"id": "stuck-task-123", "channel": "engineer", "created_at": old_time}

    call_count = [0]

    def fake_execute(sql, params=()):
        if "status = 'running'" in sql and "created_at" in sql:
            return [stuck_row]
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = fake_execute
    mock_backend.update_route_execution = MagicMock()

    with patch("server._get_watchdog_backend", return_value=mock_backend):
        await server._run_watchdog_once()

    # The stuck task should have been marked failed
    mock_backend.update_route_execution.assert_called_once_with(
        "stuck-task-123",
        "failed",
        error=pytest.approx("auto-cancelled by watchdog: stuck > 360s", abs=0),
    )


# ---------------------------------------------------------------------------
# 3. task_stuck_total counter exists and is incremented
# ---------------------------------------------------------------------------

def test_task_stuck_total_counter_exists():
    """task_stuck_total Prometheus counter must be defined in server module."""
    import server
    # If prometheus unavailable, the counter may be None — that's fine.
    # If available, it must be a Counter instance.
    if server._PROMETHEUS_AVAILABLE:
        assert server._task_stuck_total is not None
        # Should have labels channel and reason
        # Just calling labels() verifies the label names exist
        server._task_stuck_total.labels(channel="ceo", reason="heartbeat_timeout")
    else:
        # prometheus not installed; attribute should at least exist as None
        assert hasattr(server, "_task_stuck_total")


# ---------------------------------------------------------------------------
# 4. Early warning log at 180s (50% of threshold)
# Reference: wiki/agent-task-reliability §4 Gap 2
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_watchdog_emits_warning_at_half_threshold():
    """_run_watchdog_once should emit a WARNING log for tasks approaching timeout (>180s)."""
    import logging
    import server

    half_time = (datetime.now(timezone.utc) - timedelta(seconds=200)).isoformat()
    warn_row = {"id": "warn-task-456", "channel": "engineer", "created_at": half_time}

    def fake_execute(sql, params=()):
        # Return warn_row only for the early-warning scan (< kill cutoff, > warn cutoff)
        # Return empty for the kill scan (> kill cutoff)
        if "status = 'running'" in sql and "created_at" in sql:
            # Distinguish by params: warn cutoff is ~180s, kill cutoff is ~360s
            if params:
                cutoff_str = params[0]
                cutoff_dt = datetime.fromisoformat(cutoff_str)
                age_s = (datetime.now(timezone.utc) - cutoff_dt).total_seconds()
                if 150 < age_s < 250:  # warn window (~180s)
                    return [warn_row]
            return []
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = fake_execute
    mock_backend.update_route_execution = MagicMock()

    with (
        patch("server._get_watchdog_backend", return_value=mock_backend),
        patch.object(server.logger, "warning") as mock_warn,
    ):
        await server._run_watchdog_once()

    # Should emit at least one warning mentioning the task or "approaching"
    warning_calls = [str(c) for c in mock_warn.call_args_list]
    assert any("warn-task-456" in c or "approaching" in c for c in warning_calls), (
        f"Expected early-warning log for warn-task-456, got: {warning_calls}"
    )
    # Must NOT have called update_route_execution (task is not killed, only warned)
    mock_backend.update_route_execution.assert_not_called()
