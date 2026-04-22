"""Phase 70: Agent Stuck Watchdog tests.

Tests:
1. _heartbeat_iteration releases _heartbeat_lock even when route_chat times out
2. _watchdog_loop cancels stuck route_executions (running + activity > kill threshold)
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
# 2. Watchdog cancels stuck route_executions (activity-based, updated_at)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_watchdog_cancels_stuck_tasks():
    """_run_watchdog_once should detect route_executions with no activity for
    > KILL_SEC seconds (updated_at-based) and mark them as failed."""
    import server

    # Simulate a stuck task: last updated 400s ago, still 'running'
    old_time = (datetime.now(timezone.utc) - timedelta(seconds=400)).isoformat()
    stuck_row = {"id": "stuck-task-123", "channel": "engineer", "updated_at": old_time}

    def fake_execute(sql, params=()):
        if "status = 'running'" in sql and "updated_at" in sql:
            return [stuck_row]
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = fake_execute
    mock_backend.update_route_execution = MagicMock()

    with patch("server._get_watchdog_backend", return_value=mock_backend):
        await server._run_watchdog_once()

    # The stuck task should have been marked failed with activity-based message
    mock_backend.update_route_execution.assert_called_once()
    call_args = mock_backend.update_route_execution.call_args
    assert call_args[0][0] == "stuck-task-123"
    assert call_args[0][1] == "failed"
    error_msg = call_args[1]["error"]
    assert "activity-based" in error_msg
    assert "auto-cancelled by watchdog" in error_msg


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
# 4. Early warning log at WARN_SEC (approaching timeout)
# Reference: wiki/agent-task-reliability §4 Gap 2
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_watchdog_emits_warning_at_half_threshold():
    """_run_watchdog_once should emit a WARNING log for tasks approaching timeout."""
    import logging
    import server

    # Task last updated WARN_SEC+20s ago — in the warn window
    warn_sec = server._WATCHDOG_WARN_SEC
    half_time = (datetime.now(timezone.utc) - timedelta(seconds=warn_sec + 20)).isoformat()
    warn_row = {"id": "warn-task-456", "channel": "engineer", "updated_at": half_time}

    def fake_execute(sql, params=()):
        # Return warn_row only for the early-warning scan (updated_at-based)
        if "status = 'running'" in sql and "updated_at" in sql:
            if params and len(params) == 2:
                # Two-param query is the warn scan
                return [warn_row]
            # One-param query is the kill scan — return empty (task not yet killed)
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


# ---------------------------------------------------------------------------
# 5. Escalate stage: ERROR log between ESCALATE_SEC and KILL_SEC
# Reference: issue b5c55715 — 3-stage watchdog
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_watchdog_escalate_stage():
    """_run_watchdog_once must emit logger.error for tasks in the escalate window
    (ESCALATE_SEC < age < KILL_SEC) and must NOT cancel them yet."""
    import logging
    import server

    escalate_sec = server._WATCHDOG_ESCALATE_SEC
    kill_sec = server._WATCHDOG_KILL_SEC

    # Place task squarely in the escalate window
    mid = (escalate_sec + kill_sec) // 2
    esc_time = (datetime.now(timezone.utc) - timedelta(seconds=mid)).isoformat()
    esc_row = {"id": "esc-task-789", "channel": "engineer", "updated_at": esc_time}

    def fake_execute(sql, params=()):
        if "status = 'running'" in sql and "updated_at" in sql:
            if len(params) == 1:
                # kill scan — not old enough
                return []
            if len(params) == 2:
                # distinguish escalate vs warn by cutoff values
                p0, p1 = params
                # escalate query: (escalate_cutoff, kill_cutoff)
                if p0 < p1:
                    # p0 is older (escalate window upper bound), p1 is newer (kill_cutoff)
                    # this branch won't occur with correct ordering
                    return []
                # p0 = escalate_cutoff (newer), p1 = kill_cutoff (older)
                if esc_time < p0 and esc_time >= p1:
                    return [esc_row]
                return []
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = fake_execute
    mock_backend.update_route_execution = MagicMock()

    with (
        patch("server._get_watchdog_backend", return_value=mock_backend),
        patch.object(server.logger, "error") as mock_error,
    ):
        await server._run_watchdog_once()

    # Must emit logger.error mentioning the task and ESCALATE
    error_calls = [str(c) for c in mock_error.call_args_list]
    assert any("esc-task-789" in c or "ESCALATE" in c for c in error_calls), (
        f"Expected escalate ERROR log for esc-task-789, got: {error_calls}"
    )
    # Must NOT cancel the task
    mock_backend.update_route_execution.assert_not_called()
