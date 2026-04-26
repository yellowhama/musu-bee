"""Instruction-hash duplicate dispatch gate tests.

Verifies that delegate_task rejects a second dispatch of the same instruction
on the same channel within 120 seconds, even when the first task has already
transitioned to 'failed' (the scenario the old running-only check misses).

Sprint Contract: feat/phase91-validate-task-instruction (instruction dedup gate)
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
os.environ.setdefault("MUSU_PLAN", "pro")
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)

_VALID_TEXT = (
    "Read musu-bridge/handlers.py route_chat function and verify "
    "that the error handling on line 69 returns the correct dict structure. "
    "pytest musu-bridge/tests/test_server.py -v should pass after inspection. "
    "expected_output: pytest exits 0 with all tests passing."
)


def _clear_channel(channel: str = "engineer") -> None:
    """Reset any active records for channel to isolate tests."""
    from handlers import _get_backend
    backend = _get_backend()
    try:
        backend._db.execute(
            "UPDATE route_executions SET status='done'"
            " WHERE channel=? AND status IN ('running','failed','pending')",
            (channel,),
        )
    except Exception:
        pass
    import server
    server._channel_semaphores.pop(channel, None)
    if hasattr(server, "_dispatch_hash_cache"):
        server._dispatch_hash_cache.clear()


class TestInstructionDedupGate:
    """Second dispatch of the same instruction within 120 s must return 409."""

    def setup_method(self):
        _clear_channel("engineer")

    def test_same_instruction_within_window_returns_409(self):
        """Second identical dispatch on same channel within 120 s → 409."""
        # First dispatch — should succeed (202)
        with patch("server.route_chat", new_callable=AsyncMock), \
             patch("server._get_channel_semaphore") as mock_sem:
            mock_ctx = MagicMock()
            mock_ctx.at_capacity.return_value = False
            mock_ctx.__aenter__ = AsyncMock(return_value=None)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_sem.return_value = mock_ctx

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
        assert resp1.status_code == 202, f"Expected 202, got {resp1.status_code}: {resp1.text}"

        # Mark that task as failed (simulates fast failure before second dispatch)
        task_id = resp1.json()["task_id"]
        from handlers import _get_backend
        backend = _get_backend()
        backend._db.execute(
            "UPDATE route_executions SET status='failed' WHERE id=?",
            (task_id,),
        )

        # Second identical dispatch — should be rejected with 409
        resp2 = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": _VALID_TEXT},
            headers=_AUTH,
        )
        assert resp2.status_code == 409, (
            f"Expected 409 for duplicate instruction within window, got {resp2.status_code}: {resp2.text}"
        )
        detail = resp2.json().get("detail", "")
        assert "same instruction" in detail.lower() or "instruction" in detail.lower(), (
            f"409 detail should mention instruction: {detail!r}"
        )
        assert resp2.headers.get("Retry-After") == "120", (
            f"Expected Retry-After: 120, got {resp2.headers.get('Retry-After')!r}"
        )

    def test_different_instruction_same_channel_passes(self):
        """A different instruction on the same channel must not be blocked."""
        other_text = (
            "Read musu-bridge/server.py delegate_task function and confirm "
            "the allow_duplicate flag is checked before DB insertion. "
            "expected_output: pytest exits 0."
        )
        with patch("server.route_chat", new_callable=AsyncMock), \
             patch("server._get_channel_semaphore") as mock_sem:
            mock_ctx = MagicMock()
            mock_ctx.at_capacity.return_value = False
            mock_ctx.__aenter__ = AsyncMock(return_value=None)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_sem.return_value = mock_ctx

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
        assert resp1.status_code == 202

        task_id = resp1.json()["task_id"]
        from handlers import _get_backend
        backend = _get_backend()
        backend._db.execute(
            "UPDATE route_executions SET status='failed' WHERE id=?",
            (task_id,),
        )

        # Different instruction → must pass through
        with patch("server.route_chat", new_callable=AsyncMock), \
             patch("server._get_channel_semaphore") as mock_sem2:
            mock_ctx2 = MagicMock()
            mock_ctx2.at_capacity.return_value = False
            mock_ctx2.__aenter__ = AsyncMock(return_value=None)
            mock_ctx2.__aexit__ = AsyncMock(return_value=False)
            mock_sem2.return_value = mock_ctx2

            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": other_text},
                headers=_AUTH,
            )
        assert resp2.status_code == 202, (
            f"Different instruction should not be blocked, got {resp2.status_code}: {resp2.text}"
        )

    def test_allow_duplicate_true_bypasses_dedup_gate(self):
        """allow_duplicate=True must bypass the instruction-hash gate entirely."""
        with patch("server.route_chat", new_callable=AsyncMock), \
             patch("server._get_channel_semaphore") as mock_sem:
            mock_ctx = MagicMock()
            mock_ctx.at_capacity.return_value = False
            mock_ctx.__aenter__ = AsyncMock(return_value=None)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_sem.return_value = mock_ctx

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
        assert resp1.status_code == 202

        task_id = resp1.json()["task_id"]
        from handlers import _get_backend
        backend = _get_backend()
        backend._db.execute(
            "UPDATE route_executions SET status='failed' WHERE id=?",
            (task_id,),
        )

        # Same instruction, allow_duplicate=True — must pass
        with patch("server.route_chat", new_callable=AsyncMock), \
             patch("server._get_channel_semaphore") as mock_sem2:
            mock_ctx2 = MagicMock()
            mock_ctx2.at_capacity.return_value = False
            mock_ctx2.__aenter__ = AsyncMock(return_value=None)
            mock_ctx2.__aexit__ = AsyncMock(return_value=False)
            mock_sem2.return_value = mock_ctx2

            resp2 = _client.post(
                "/api/tasks/delegate",
                json={
                    "channel": "engineer",
                    "text": _VALID_TEXT,
                    "allow_duplicate": True,
                },
                headers=_AUTH,
            )
        assert resp2.status_code == 202, (
            f"allow_duplicate=True should bypass dedup gate, got {resp2.status_code}: {resp2.text}"
        )

    def test_dedup_gate_also_blocks_running_same_instruction(self):
        """The hash gate must block a second dispatch when first is still running."""
        with patch("server.route_chat", new_callable=AsyncMock), \
             patch("server._get_channel_semaphore") as mock_sem:
            mock_ctx = MagicMock()
            mock_ctx.at_capacity.return_value = False
            mock_ctx.__aenter__ = AsyncMock(return_value=None)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_sem.return_value = mock_ctx

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
        assert resp1.status_code == 202

        # Keep it running — second dispatch should be blocked
        resp2 = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": _VALID_TEXT},
            headers=_AUTH,
        )
        assert resp2.status_code == 409, (
            f"Expected 409 when same instruction is still running, got {resp2.status_code}: {resp2.text}"
        )
