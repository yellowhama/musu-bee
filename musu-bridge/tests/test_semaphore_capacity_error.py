"""Regression test: semaphore acquire timeout → error='channel_at_capacity'.

Root cause (issue 4d9c377a): when the channel semaphore's __aenter__ timed out,
asyncio.TimeoutError escaped to the outer `except Exception` handler, recording
the error as "outer failure: semaphore boom" and leaving the semaphore slot
unreleased (channel wedged).

Fix: separate `except asyncio.TimeoutError` before the generic handler records
error="channel_at_capacity" so callers can distinguish saturation from crashes.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
os.environ.setdefault("MUSU_PLAN", "pro")
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

_AUTH = {"Authorization": "Bearer test-token"}

from fastapi.testclient import TestClient  # noqa: E402

_client = TestClient(app, raise_server_exceptions=False)

_VALID_TEXT = (
    "Read musu-bridge/handlers.py route_chat function and verify "
    "the error handling on line 69 returns the correct dict. "
    "pytest musu-bridge/tests/test_server.py -v should pass after check. "
    "expected_output: pytest exits 0 with all tests passing."
)


def _make_saturated_semaphore_mock() -> MagicMock:
    """Return a _ChannelSemaphore mock whose __aenter__ raises asyncio.TimeoutError."""
    mock_ctx = MagicMock()
    mock_ctx.at_capacity.return_value = False
    mock_ctx.__aenter__ = AsyncMock(side_effect=asyncio.TimeoutError())
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    return mock_ctx


class TestSemaphoreCapacityError:
    """Semaphore acquire timeout must record error='channel_at_capacity', not a crash."""

    def setup_method(self):
        import server
        server._channel_semaphores.clear()

    def test_semaphore_timeout_records_channel_at_capacity(self):
        """asyncio.TimeoutError from semaphore __aenter__ → error='channel_at_capacity'."""
        with patch("server._get_channel_semaphore", return_value=_make_saturated_semaphore_mock()):
            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )

        assert resp.status_code == 202, f"Expected 202 (background task), got {resp.status_code}"
        task_id = resp.json()["task_id"]

        # Background task runs the semaphore acquire — give it a moment to settle
        time.sleep(0.15)

        from handlers import _get_backend
        backend = _get_backend()
        rec = backend.get_route_execution(task_id)
        assert rec is not None, "Route execution record must exist"
        assert rec.get("status") in ("failed", "cancelled"), (
            f"Expected failed/cancelled after semaphore timeout, got: {rec.get('status')!r}"
        )
        assert rec.get("error") == "channel_at_capacity", (
            f"Expected error='channel_at_capacity', got: {rec.get('error')!r}\n"
            "The fix must NOT record 'outer failure: ...' for semaphore saturation."
        )

    def test_semaphore_timeout_does_not_record_outer_failure(self):
        """asyncio.TimeoutError must NOT reach the generic 'outer failure' handler."""
        errors_recorded: list[str] = []

        original_cancel = None

        def capturing_cancel(task_id: str, error: str = "cancelled") -> bool:
            errors_recorded.append(error)
            if original_cancel:
                return original_cancel(task_id, error=error)
            return True

        import server as _server
        import handlers as _handlers

        with patch("server._get_channel_semaphore", return_value=_make_saturated_semaphore_mock()), \
             patch("server.cancel_task_record", side_effect=capturing_cancel):
            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )

        assert resp.status_code == 202
        time.sleep(0.15)

        assert errors_recorded, "cancel_task_record must be called on semaphore timeout"
        assert all(
            "outer failure" not in e for e in errors_recorded
        ), (
            f"Semaphore timeout must not produce 'outer failure' error. Got: {errors_recorded}"
        )
        assert any(e == "channel_at_capacity" for e in errors_recorded), (
            f"Expected 'channel_at_capacity' in errors, got: {errors_recorded}"
        )

    def test_semaphore_release_not_called_after_acquire_timeout(self):
        """__aexit__ must not be invoked when __aenter__ raises TimeoutError.

        asyncio context manager protocol: if __aenter__ raises, __aexit__ is NOT called.
        This means the semaphore slot is never over-released, preventing the channel wedge.
        """
        mock_ctx = _make_saturated_semaphore_mock()

        with patch("server._get_channel_semaphore", return_value=mock_ctx):
            _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )

        time.sleep(0.15)

        mock_ctx.__aexit__.assert_not_called()
