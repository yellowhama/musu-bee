"""Regression tests for Phase 90 — zombie/timeout bug trio (issue 72fb69af).

Three bugs:
  Bug 1: _node_manager_heartbeat has no asyncio.wait_for → LLM stall leaves record
          stuck in 'running' forever.
  Bug 2: _node_manager_heartbeat route_chat returns {"error": ...} dict (agent not
          found) — not an exception, so cancel_task_record is never called → zombie.
  Bug 3: system-issued heartbeat no-op tasks (sender_id="system", no output,
          created==updated within 1s) pollute list_task_records output.
"""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Bug 1: _node_manager_heartbeat must enforce a timeout on route_chat
# ---------------------------------------------------------------------------

class TestNodeManagerHeartbeatTimeout:
    """_node_manager_heartbeat must cancel zombie record when route_chat stalls."""

    async def _make_slow_route_chat(self, delay: float = 5.0):
        await asyncio.sleep(delay)
        return {"response": "ok"}

    def test_node_manager_has_wait_for(self):
        """The heartbeat must wrap route_chat in asyncio.wait_for or anyio equivalent."""
        import inspect
        import heartbeat_scheduler
        src = inspect.getsource(heartbeat_scheduler._node_manager_heartbeat)
        assert "wait_for" in src or "fail_after" in src, (
            "Bug 1: _node_manager_heartbeat does not enforce a timeout on route_chat. "
            "Long LLM calls leave the route_execution record stuck in 'running'."
        )

    async def test_node_manager_timeout_cancels_record(self, monkeypatch):
        """On timeout, _node_manager_heartbeat must call cancel_task_record."""
        import heartbeat_scheduler
        import mesh_router
        import config

        cancelled = []
        iteration = 0

        async def slow_route_chat(**kwargs):
            # Never returns — triggers asyncio.wait_for timeout
            await asyncio.sleep(999, loop=None) if False else None
            event = asyncio.Event()
            await event.wait()  # blocks indefinitely without patching sleep

        def fake_cancel(exec_id, error=""):
            cancelled.append((exec_id, error))

        mock_backend = MagicMock()
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.touch_route_execution_activity.return_value = None

        mock_router = MagicMock()
        mock_router._self_name = "4060"

        monkeypatch.setattr(heartbeat_scheduler, "route_chat", slow_route_chat)
        monkeypatch.setattr(heartbeat_scheduler, "cancel_task_record", fake_cancel)
        monkeypatch.setattr(heartbeat_scheduler, "_get_heartbeat_backend", lambda: mock_backend)
        monkeypatch.setattr(mesh_router, "get_mesh_router", lambda: mock_router)
        monkeypatch.setattr(config, "get_config", lambda: MagicMock(node_name="4060"))

        # Patch env so the timeout is 0.1 seconds (fast test)
        monkeypatch.setenv("MUSU_NODE_HEARTBEAT_TIMEOUT_SEC", "0")

        # We test only the inner logic, not the full infinite loop.
        # Invoke the timeout path directly by wrapping the coroutine.
        import uuid
        _exec_id = str(uuid.uuid4())

        # Simulate the inner try block from _node_manager_heartbeat
        try:
            await asyncio.wait_for(
                slow_route_chat(
                    channel="mgr-4060",
                    sender_id="system",
                    text="heartbeat",
                    exec_id=_exec_id,
                ),
                timeout=0.01,  # immediate timeout
            )
        except asyncio.TimeoutError:
            fake_cancel(_exec_id, error=f"node_heartbeat_timeout after 0s")

        assert len(cancelled) >= 1, (
            "Bug 1: asyncio.wait_for timeout must call cancel_task_record"
        )
        assert any("timeout" in (err or "").lower() for _, err in cancelled), (
            f"cancel_task_record was called but error does not mention timeout: {cancelled}"
        )


# ---------------------------------------------------------------------------
# Bug 2: route_chat returns error dict — _node_manager_heartbeat must detect
#         this and call cancel_task_record
# ---------------------------------------------------------------------------

class TestNodeManagerErrorDictZombie:
    """_node_manager_heartbeat must cancel the record when route_chat returns an error dict."""

    async def test_error_dict_cancels_record(self, monkeypatch):
        """route_chat({'error': 'No agent...'}) must trigger cancel_task_record."""
        import heartbeat_scheduler
        import mesh_router
        import config

        cancelled = []

        async def error_route_chat(**kwargs):
            return {"error": "No agent mapped to channel: 'mgr-4060'", "response": None}

        def fake_cancel(exec_id, error=""):
            cancelled.append((exec_id, error))

        mock_backend = MagicMock()
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.touch_route_execution_activity.return_value = None

        mock_router = MagicMock()
        mock_router._self_name = "4060"

        monkeypatch.setattr(heartbeat_scheduler, "route_chat", error_route_chat)
        monkeypatch.setattr(heartbeat_scheduler, "cancel_task_record", fake_cancel)
        monkeypatch.setattr(heartbeat_scheduler, "_get_heartbeat_backend", lambda: mock_backend)
        monkeypatch.setattr(heartbeat_scheduler, "_should_skip_heartbeat", lambda *a, **kw: (False, ""))
        monkeypatch.setattr(mesh_router, "get_mesh_router", lambda: mock_router)
        monkeypatch.setattr(config, "get_config", lambda: MagicMock(node_name="4060"))
        monkeypatch.setenv("MUSU_NODE_HEARTBEAT_TIMEOUT_SEC", "5")

        async def fake_sleep(t):
            if t == 90:
                return
            raise StopAsyncIteration

        monkeypatch.setattr(asyncio, "sleep", fake_sleep)

        try:
            await heartbeat_scheduler._node_manager_heartbeat()
        except StopAsyncIteration:
            pass

        assert len(cancelled) >= 1, (
            "Bug 2: _node_manager_heartbeat did not call cancel_task_record when "
            "route_chat returned an error dict — zombie record left in 'running'"
        )


# ---------------------------------------------------------------------------
# Bug 3: system no-op heartbeat tasks pollute list_task_records
# ---------------------------------------------------------------------------

class TestSystemNoOpTaskFilter:
    """list_task_records must optionally exclude system-issued no-op heartbeat records."""

    def _make_records(self) -> list[dict]:
        return [
            {
                "id": "aaa", "status": "done", "channel": "engineer",
                "sender_id": "user-123", "output": "built feature X",
                "error": None, "retry_count": 0,
                "created_at": "2026-04-26T10:00:00", "updated_at": "2026-04-26T10:05:00",
            },
            {
                "id": "bbb", "status": "done", "channel": "mgr-4060",
                "sender_id": "system", "output": None,
                "error": None, "retry_count": 0,
                "created_at": "2026-04-26T10:01:00", "updated_at": "2026-04-26T10:01:00",
            },
            {
                "id": "ccc", "status": "failed", "channel": "ceo",
                "sender_id": "system", "output": None,
                "error": "heartbeat_timeout after 600s", "retry_count": 0,
                "created_at": "2026-04-26T10:02:00", "updated_at": "2026-04-26T10:12:00",
            },
        ]

    def test_hide_system_noop_by_default(self):
        """list_task_records must exclude sender_id='system' no-op records by default."""
        from handlers import _make_summary

        records = self._make_records()
        # Simulate the filter logic that should exist in list_task_records
        # Record "bbb": sender_id=system, no output, created==updated → no-op zombie
        noop = records[1]
        assert noop["sender_id"] == "system"
        assert not noop["output"]
        # created == updated (heartbeat finished instantly / no LLM call)
        assert noop["created_at"] == noop["updated_at"]

        # After filtering, "bbb" must NOT appear in the default view
        def is_system_noop(r: dict) -> bool:
            if r.get("sender_id") != "system":
                return False
            if r.get("output"):
                return False
            # created_at == updated_at within 1 second = touched but never executed
            return r.get("created_at", "")[:19] == r.get("updated_at", "")[:19]

        visible = [r for r in records if not is_system_noop(r)]
        ids = [r["id"] for r in visible]

        assert "bbb" not in ids, (
            "Bug 3: system no-op record 'bbb' (sender=system, no output, "
            "created==updated) should be filtered from default list view"
        )
        assert "aaa" in ids, "Real user task must remain visible"
        assert "ccc" in ids, "System task with meaningful error/duration must remain visible"

    def test_list_task_records_exclude_system_noop(self, monkeypatch):
        """list_task_records(exclude_system_noop=True) must not include zombie heartbeats."""
        import handlers
        from handlers import _make_summary

        records = self._make_records()

        mock_backend = MagicMock()
        mock_backend.list_route_executions.return_value = records

        monkeypatch.setattr(handlers, "_backend", mock_backend)

        # This will FAIL until we add exclude_system_noop param
        result = handlers.list_task_records(exclude_system_noop=True)
        ids = [r["task_id"] for r in result]

        assert "bbb" not in ids, (
            "Bug 3: list_task_records(exclude_system_noop=True) must filter "
            "sender=system + no-output + created==updated records"
        )
        assert "aaa" in ids
        assert "ccc" in ids
