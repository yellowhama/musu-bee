"""Zombie channel guard tests.

Verifies that route_execution records are never left in 'running' state
when api_delegate_task encounters an early-exit condition.

Sprint Contract: fix/zombie-channel-guard
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
os.environ.setdefault("MUSU_PLAN", "pro")  # bypass daily task limit in tests
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)

_VALID_TEXT = (
    "Read musu-bridge/handlers.py route_chat function and verify "
    "that the error handling on line 69 returns the correct dict structure. "
    "pytest musu-bridge/tests/test_server.py -v should pass after inspection."
)


class TestUnknownChannelReturns400:
    """Unknown channel must return 400 before any DB record is created."""

    def test_unknown_channel_returns_400(self):
        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "nonexistent_channel_xyz", "text": _VALID_TEXT},
            headers=_AUTH,
        )
        assert resp.status_code == 400
        assert "channel" in resp.json().get("detail", "").lower()

    def test_unknown_channel_no_zombie_record(self):
        """No route_execution record should exist after a 400 rejection."""
        from handlers import _get_backend

        backend = _get_backend()
        rows_before = len(backend.list_route_executions(status="running") if hasattr(backend, "list_route_executions") else [])

        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "totally_unknown_channel", "text": _VALID_TEXT},
            headers=_AUTH,
        )
        assert resp.status_code == 400

        # No new running records should have been created
        rows_after = len(backend.list_route_executions(status="running") if hasattr(backend, "list_route_executions") else [])
        assert rows_after == rows_before


class TestOuterFailureSafetyNet:
    """Outer exception in _run_with_retry must mark record as failed, not leave it running."""

    def setup_method(self):
        """Clear running route_execution records for 'engineer' before each test."""
        from handlers import _get_backend
        backend = _get_backend()
        try:
            backend._db.execute(
                "UPDATE route_executions SET status='cancelled' WHERE channel='engineer' AND status='running'"
            )
        except Exception:
            pass

    def test_semaphore_crash_marks_record_failed(self):
        """If the semaphore itself raises, the record must be marked failed."""
        from handlers import cancel_task_record, _get_backend

        with patch("server.route_chat", new_callable=AsyncMock) as _mock_chat, \
             patch("server._get_channel_semaphore") as mock_sem:
            # Make the semaphore context manager raise on __aenter__
            mock_ctx = MagicMock()
            mock_ctx.at_capacity.return_value = False
            mock_ctx.__aenter__ = AsyncMock(side_effect=RuntimeError("semaphore boom"))
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_sem.return_value = mock_ctx

            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
            # Should still accept the task (202) — background task handles the failure
            assert resp.status_code == 202
            task_id = resp.json()["task_id"]

            # Give the background task a moment to run and fail
            import time
            time.sleep(0.1)

            backend = _get_backend()
            rec = backend.get_route_execution(task_id)
            assert rec is not None
            # Must not be left in "running" — should be "failed"
            assert rec.get("status") in ("failed", "cancelled"), (
                f"Expected failed/cancelled, got: {rec.get('status')}"
            )


class TestAllEarlyExitPathsCleanUp:
    """Every early-exit within _run_with_retry must call cancel_task_record."""

    def setup_method(self):
        """Clear running route_execution records for 'engineer' before each test."""
        from handlers import _get_backend
        backend = _get_backend()
        try:
            backend._db.execute(
                "UPDATE route_executions SET status='cancelled' WHERE channel='engineer' AND status='running'"
            )
        except Exception:
            pass

    def test_unhandled_exception_in_run_once_marks_record_failed(self):
        """An unexpected exception in _run_once must mark the record as failed, not leave it running."""
        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat, \
             patch("server._get_channel_semaphore") as mock_sem:
            mock_ctx = MagicMock()
            mock_ctx.at_capacity.return_value = False
            mock_ctx.__aenter__ = AsyncMock(return_value=None)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_sem.return_value = mock_ctx

            # Raise an unexpected exception (not RuntimeError/TimeoutError) on first attempt
            mock_chat.side_effect = ValueError("unexpected internal error")

            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
            assert resp.status_code == 202
            task_id = resp.json()["task_id"]

            import time
            time.sleep(0.1)

            from handlers import _get_backend
            backend = _get_backend()
            rec = backend.get_route_execution(task_id)
            assert rec is not None
            assert rec.get("status") in ("failed", "cancelled"), (
                f"Expected failed/cancelled after unhandled exception, got: {rec.get('status')}"
            )
