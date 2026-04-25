"""Regression tests for Phase 90 fixes.

Issues:
  72fb69af — semaphore boom + route_timeout + zombie duplicate dispatch
  679bc93c — same root cause

Covers:
  1. _ChannelSemaphore.acquire() raises asyncio.TimeoutError after timeout,
     not blocking indefinitely (semaphore boom fix).
  2. _route_timeout_sec returns >= 600s for engineer/team_lead/qa/ceo channels.
  3. _node_manager_heartbeat skips when a task is already running for that channel
     (zombie duplicate dispatch fix).
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
sys.path.insert(0, str(Path(__file__).parent.parent))


# ── Fix 1: Semaphore acquire timeout ─────────────────────────────────────────


class TestSemaphoreAcquireTimeout:
    """_ChannelSemaphore.acquire(timeout=N) must raise TimeoutError when blocked."""

    @pytest.mark.asyncio
    async def test_acquire_with_timeout_raises_when_blocked(self):
        """acquire(timeout=0.05) raises TimeoutError when semaphore is at capacity."""
        from server import _ChannelSemaphore

        sem = _ChannelSemaphore(1)
        await sem.acquire()  # consume the single slot

        with pytest.raises(asyncio.TimeoutError):
            await sem.acquire(timeout=0.05)

    @pytest.mark.asyncio
    async def test_acquire_with_timeout_succeeds_when_available(self):
        """acquire(timeout=N) succeeds immediately when a slot is available."""
        from server import _ChannelSemaphore

        sem = _ChannelSemaphore(2)
        await sem.acquire(timeout=1.0)
        assert sem.available == 1

    @pytest.mark.asyncio
    async def test_aenter_uses_timeout_from_env(self, monkeypatch):
        """__aenter__ must use MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC env var."""
        from server import _ChannelSemaphore

        monkeypatch.setenv("MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC", "0.05")
        sem = _ChannelSemaphore(1)
        await sem.acquire()  # fill the slot

        with pytest.raises(asyncio.TimeoutError):
            async with sem:
                pass  # should raise before entering

    @pytest.mark.asyncio
    async def test_acquire_without_timeout_is_still_valid(self):
        """acquire() without timeout still works correctly for happy path."""
        from server import _ChannelSemaphore

        sem = _ChannelSemaphore(3)
        await sem.acquire()
        await sem.acquire()
        assert sem.available == 1
        sem.release()
        sem.release()
        assert sem.available == 3

    @pytest.mark.asyncio
    async def test_timeout_during_acquire_does_not_corrupt_semaphore(self):
        """A timed-out acquire must not decrement available (no phantom slot consumed)."""
        from server import _ChannelSemaphore

        sem = _ChannelSemaphore(1)
        await sem.acquire()  # fill the slot
        available_before = sem.available

        with pytest.raises(asyncio.TimeoutError):
            await sem.acquire(timeout=0.05)

        # available must be unchanged — timed-out acquire must not count
        assert sem.available == available_before


# ── Fix 2: Route timeout defaults ─────────────────────────────────────────────


class TestRouteTimeoutDefaults:
    """_route_timeout_sec must return >=600s for heavy-LLM channels."""

    def test_engineer_timeout_is_600(self, monkeypatch):
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC_ENGINEER", raising=False)
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC", raising=False)
        from handlers import _route_timeout_sec
        assert _route_timeout_sec("engineer") >= 600.0

    def test_team_lead_timeout_is_600(self, monkeypatch):
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC_TEAM_LEAD", raising=False)
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC", raising=False)
        from handlers import _route_timeout_sec
        assert _route_timeout_sec("team_lead") >= 600.0

    def test_qa_timeout_is_600(self, monkeypatch):
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC_QA", raising=False)
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC", raising=False)
        from handlers import _route_timeout_sec
        assert _route_timeout_sec("qa") >= 600.0

    def test_ceo_timeout_is_600(self, monkeypatch):
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC_CEO", raising=False)
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC", raising=False)
        from handlers import _route_timeout_sec
        assert _route_timeout_sec("ceo") >= 600.0

    def test_unknown_channel_fallback_is_600(self, monkeypatch):
        monkeypatch.delenv("MUSU_ROUTE_TIMEOUT_SEC", raising=False)
        from handlers import _route_timeout_sec
        assert _route_timeout_sec("unknown_channel_xyz") >= 600.0

    def test_env_override_respected(self, monkeypatch):
        monkeypatch.setenv("MUSU_ROUTE_TIMEOUT_SEC_ENGINEER", "999")
        from handlers import _route_timeout_sec
        assert _route_timeout_sec("engineer") == 999.0


# ── Fix 3: Node manager heartbeat zombie guard ────────────────────────────────


class TestNodeManagerHeartbeatZombieGuard:
    """_node_manager_heartbeat must skip when a task is already running."""

    @pytest.mark.asyncio
    async def test_skips_when_already_running(self, monkeypatch):
        """If _should_skip_heartbeat returns 'already running', route_chat must NOT be called."""
        import heartbeat_scheduler

        route_chat_calls = []

        async def mock_route_chat(**kwargs):
            route_chat_calls.append(kwargs)
            return {"response": "ok"}

        monkeypatch.setattr(heartbeat_scheduler, "route_chat", mock_route_chat)
        monkeypatch.setenv("MUSU_NODE_HEARTBEAT_INTERVAL", "9999")
        monkeypatch.setenv("MUSU_NODE_HEARTBEAT_ENABLED", "true")

        mock_backend = MagicMock()

        with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(True, "already running")), \
             patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend), \
             patch("mesh_router.get_mesh_router") as mock_mesh, \
             patch("config.get_config") as mock_cfg:
            mock_mesh.return_value._self_name = "4060"
            mock_cfg.return_value.node_name = "4060"

            # Patch asyncio.sleep to break the loop after one iteration
            sleep_calls = []
            original_sleep = asyncio.sleep

            async def mock_sleep(t):
                sleep_calls.append(t)
                if len(sleep_calls) >= 2:
                    raise asyncio.CancelledError()
                # Skip the initial 90s stagger
                return

            with patch("asyncio.sleep", side_effect=mock_sleep):
                try:
                    await heartbeat_scheduler._node_manager_heartbeat()
                except asyncio.CancelledError:
                    pass

        assert len(route_chat_calls) == 0, (
            f"route_chat must not be called when already running, got {len(route_chat_calls)} calls"
        )

    @pytest.mark.asyncio
    async def test_cancels_record_on_timeout(self, monkeypatch):
        """route_chat timeout must cancel the execution record, not leave it running."""
        import heartbeat_scheduler

        cancelled_ids = []

        async def mock_route_chat(**kwargs):
            raise asyncio.TimeoutError()

        def mock_cancel(task_id, error=""):
            cancelled_ids.append(task_id)
            return True

        monkeypatch.setattr(heartbeat_scheduler, "route_chat", mock_route_chat)
        monkeypatch.setattr(heartbeat_scheduler, "cancel_task_record", mock_cancel)
        monkeypatch.setenv("MUSU_NODE_HEARTBEAT_INTERVAL", "9999")
        monkeypatch.setenv("MUSU_NODE_HEARTBEAT_TIMEOUT_SEC", "1")

        mock_backend = MagicMock()
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.touch_route_execution_activity.return_value = None

        sleep_calls = []

        async def mock_sleep(t):
            sleep_calls.append(t)
            if len(sleep_calls) >= 2:
                raise asyncio.CancelledError()

        with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")), \
             patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend), \
             patch("mesh_router.get_mesh_router") as mock_mesh, \
             patch("config.get_config") as mock_cfg, \
             patch("asyncio.sleep", side_effect=mock_sleep), \
             patch("asyncio.wait_for", side_effect=asyncio.TimeoutError):
            mock_mesh.return_value._self_name = "4060"
            mock_cfg.return_value.node_name = "4060"
            try:
                await heartbeat_scheduler._node_manager_heartbeat()
            except asyncio.CancelledError:
                pass

        assert len(cancelled_ids) > 0, "cancel_task_record must be called on timeout"
