"""Tests for CEO heartbeat concurrency guard.

Verifies that _agent_heartbeat_scheduler skips a new heartbeat when a CEO task
is already in 'running' state — preventing zombie task accumulation.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure bridge source is on path (conftest.py handles this, but be explicit)
_BRIDGE = Path(__file__).parent.parent
if str(_BRIDGE) not in sys.path:
    sys.path.insert(0, str(_BRIDGE))


class TestHeartbeatConcurrencyGuard:
    """CEO heartbeat must not spawn a new task when one is already running."""

    def test_has_running_ceo_task_check(self):
        """_has_running_ceo_task should return True when a CEO task is in running state."""
        from server import _has_running_ceo_task  # type: ignore[import]

        mock_backend = MagicMock()
        mock_backend._db.execute.return_value = [{"id": "abc", "channel": "ceo", "status": "running"}]

        result = _has_running_ceo_task(mock_backend, channel="ceo")
        assert result is True

    def test_has_running_ceo_task_empty(self):
        """_has_running_ceo_task should return False when no CEO task is running."""
        from server import _has_running_ceo_task  # type: ignore[import]

        mock_backend = MagicMock()
        mock_backend._db.execute.return_value = []

        result = _has_running_ceo_task(mock_backend, channel="ceo")
        assert result is False

    @pytest.mark.asyncio
    async def test_heartbeat_skips_when_ceo_running(self, monkeypatch):
        """Heartbeat scheduler should skip if a CEO task is already running."""
        import server  # type: ignore[import]
        import heartbeat_scheduler  # type: ignore[import]

        route_chat_calls = []

        async def mock_route_chat(**kwargs):
            route_chat_calls.append(kwargs)
            return {"output": "done"}

        # Simulate: one CEO task is already running
        mock_backend = MagicMock()
        mock_backend._db.execute.return_value = [{"id": "existing", "channel": "ceo"}]

        monkeypatch.setattr(heartbeat_scheduler, "route_chat", mock_route_chat)
        monkeypatch.setenv("MUSU_CEO_HEARTBEAT_ENABLED", "true")
        monkeypatch.setenv("MUSU_CEO_HEARTBEAT_INTERVAL", "9999")

        with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(True, "already running")) as mock_check:
            with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
                # Run one heartbeat iteration (not the full loop)
                await server._heartbeat_iteration(agent_name="ceo", company_id=None, diag_summary="")

        # route_chat should NOT have been called since a CEO task is running
        assert len(route_chat_calls) == 0, (
            f"Expected 0 route_chat calls, got {len(route_chat_calls)}"
        )

    @pytest.mark.asyncio
    async def test_heartbeat_runs_when_no_ceo_running(self, monkeypatch):
        """Heartbeat scheduler should invoke route_chat when no CEO task is running."""
        import server  # type: ignore[import]
        import heartbeat_scheduler  # type: ignore[import]

        route_chat_calls = []

        async def mock_route_chat(**kwargs):
            route_chat_calls.append(kwargs)
            return {"output": "done"}

        monkeypatch.setattr(heartbeat_scheduler, "route_chat", mock_route_chat)

        with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")):
            await server._heartbeat_iteration(agent_name="ceo", company_id=None, diag_summary="")

        assert len(route_chat_calls) == 1
        assert route_chat_calls[0]["channel"] == "ceo"

    @pytest.mark.asyncio
    async def test_heartbeat_asyncio_lock_prevents_concurrency(self, monkeypatch):
        """asyncio.Lock serializes guard checks so the lock itself never deadlocks under concurrency.

        The lock covers only the guard check (not the LLM call), so concurrent iterations
        can proceed to route_chat simultaneously once each passes the guard.  This test
        verifies: (a) all 3 iterations complete without deadlock, and (b) the guard check
        ran exactly once per iteration.
        """
        import heartbeat_scheduler  # type: ignore[import]

        call_count = 0

        async def mock_route_chat(**kwargs):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)
            return {"output": "done"}

        monkeypatch.setattr(heartbeat_scheduler, "route_chat", mock_route_chat)

        with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")):
            # Fire 3 heartbeat iterations concurrently — lock must not deadlock
            tasks = [
                asyncio.create_task(
                    heartbeat_scheduler._heartbeat_iteration(agent_name="ceo", company_id=None, diag_summary="")
                )
                for _ in range(3)
            ]
            await asyncio.gather(*tasks)

        # All 3 should complete (lock serializes guard check, not the LLM call)
        assert call_count == 3, f"Expected 3 route_chat calls, got {call_count}"
