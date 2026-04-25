"""Regression tests for zombie task re-occurrence (issue: c3304a8f).

Two root causes fixed:
1. auto_distribute_loop created orphan route_execution records — it marked a pending
   record as 'running' via raw SQL (no last_activity_at update), then called
   route_task_to_node which created a brand-new record. The original stayed running
   forever with no output.
2. _node_manager_heartbeat never called touch_route_execution_activity after creating
   its record, so watchdog could kill it as a zombie before route_chat's heartbeat began.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

_BRIDGE = Path(__file__).parent.parent
if str(_BRIDGE) not in sys.path:
    sys.path.insert(0, str(_BRIDGE))


# ---------------------------------------------------------------------------
# auto_distribute_loop — reuses existing exec_id (no orphan record)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_auto_distribute_reuses_exec_id(monkeypatch):
    """auto_distribute_loop must pass exec_id to route_chat so the existing
    route_execution record is reused, not orphaned."""
    import heartbeat_scheduler

    route_chat_calls: list[dict] = []

    async def fake_route_chat(**kwargs):
        route_chat_calls.append(kwargs)
        return {"response": "done", "error": None}

    pending_task = {"id": "pending-uuid-1234", "channel": "engineer", "sender_id": "user", "input": "do the thing"}

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = [
        # running count query
        [{"cnt": 0}],
        # pending tasks query
        [pending_task],
    ]
    mock_backend.update_route_execution.return_value = None

    call_count = 0

    async def fake_sleep(n):
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            raise asyncio.CancelledError()

    monkeypatch.setattr(heartbeat_scheduler, "route_chat", fake_route_chat)
    monkeypatch.setenv("MUSU_AUTO_DISTRIBUTE_INTERVAL", "9999")
    monkeypatch.setenv("MUSU_AUTO_DISTRIBUTE_ENABLED", "true")

    with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
        with patch("asyncio.sleep", side_effect=fake_sleep):
            with pytest.raises(asyncio.CancelledError):
                await heartbeat_scheduler.auto_distribute_loop()

    # route_chat must have been called with the existing task_id as exec_id
    assert len(route_chat_calls) == 1, f"Expected 1 route_chat call, got {len(route_chat_calls)}"
    assert route_chat_calls[0]["exec_id"] == "pending-uuid-1234", (
        f"route_chat must receive exec_id matching the pending record, got: {route_chat_calls[0]}"
    )
    assert route_chat_calls[0]["channel"] == "engineer"


@pytest.mark.asyncio
async def test_auto_distribute_uses_update_not_raw_sql(monkeypatch):
    """auto_distribute_loop must call update_route_execution (which refreshes
    last_activity_at) rather than raw SQL (which leaves it stale → watchdog zombie)."""
    import heartbeat_scheduler

    async def fake_route_chat(**kwargs):
        return {"response": "ok", "error": None}

    pending_task = {"id": "task-abc", "channel": "ceo", "sender_id": "system", "input": "heartbeat prompt"}

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = [
        [{"cnt": 0}],
        [pending_task],
    ]

    call_count = 0

    async def fake_sleep(n):
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            raise asyncio.CancelledError()

    monkeypatch.setattr(heartbeat_scheduler, "route_chat", fake_route_chat)
    monkeypatch.setenv("MUSU_AUTO_DISTRIBUTE_INTERVAL", "9999")
    monkeypatch.setenv("MUSU_AUTO_DISTRIBUTE_ENABLED", "true")

    with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
        with patch("asyncio.sleep", side_effect=fake_sleep):
            with pytest.raises(asyncio.CancelledError):
                await heartbeat_scheduler.auto_distribute_loop()

    # update_route_execution must have been called (not just raw SQL)
    mock_backend.update_route_execution.assert_called()
    # Verify it was called with "running" to refresh last_activity_at
    update_calls = [c for c in mock_backend.update_route_execution.call_args_list
                    if "running" in str(c)]
    assert update_calls, (
        "update_route_execution('running') must be called to refresh last_activity_at; "
        "raw SQL bypasses this and causes watchdog zombies"
    )


# ---------------------------------------------------------------------------
# _node_manager_heartbeat — touch_route_execution_activity on record creation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_node_manager_heartbeat_touches_activity_on_create(monkeypatch):
    """_node_manager_heartbeat must call touch_route_execution_activity immediately
    after creating its record so watchdog does not kill it before route_chat starts."""
    import heartbeat_scheduler

    touched_ids: list[str] = []
    created_ids: list[str] = []

    async def slow_route_chat(**kwargs):
        await asyncio.sleep(9999)

    mock_backend = MagicMock()

    def fake_create(exec_id, *a, **kw):
        created_ids.append(exec_id)

    def fake_touch(exec_id):
        touched_ids.append(exec_id)

    mock_backend.create_route_execution.side_effect = fake_create
    mock_backend.update_route_execution.return_value = None
    mock_backend.touch_route_execution_activity.side_effect = fake_touch

    mock_cfg = MagicMock()
    mock_cfg.node_name = "local"
    mock_router = MagicMock()
    mock_router._self_name = "local"

    monkeypatch.setattr(heartbeat_scheduler, "route_chat", slow_route_chat)
    monkeypatch.setenv("MUSU_NODE_HEARTBEAT_INTERVAL", "9999")

    sleep_count = 0

    async def fake_sleep(n):
        nonlocal sleep_count
        sleep_count += 1
        if sleep_count >= 2:
            raise asyncio.CancelledError()

    with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
        with patch("config.get_config", return_value=mock_cfg):
            with patch("mesh_router.get_mesh_router", return_value=mock_router):
                with patch("asyncio.sleep", side_effect=fake_sleep):
                    with patch("heartbeat_scheduler.cancel_task_record"):
                        with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")):
                            with pytest.raises((asyncio.CancelledError, Exception)):
                                await heartbeat_scheduler._node_manager_heartbeat()

    assert len(created_ids) >= 1, "Expected record to be created"
    assert len(touched_ids) >= 1, (
        "touch_route_execution_activity must be called immediately after record creation "
        "to prevent watchdog from treating this record as a zombie"
    )
    assert touched_ids[0] == created_ids[0], (
        f"Touched id {touched_ids[0]!r} must match created id {created_ids[0]!r}"
    )


@pytest.mark.asyncio
async def test_node_manager_heartbeat_activity_touch_before_route_chat(monkeypatch):
    """touch_route_execution_activity must be called BEFORE route_chat to close the
    watchdog gap. If route_chat is called first and takes >720s, the record dies."""
    import heartbeat_scheduler

    call_order: list[str] = []

    async def fake_route_chat(**kwargs):
        call_order.append("route_chat")
        return {"response": "ok"}

    mock_backend = MagicMock()

    def fake_create(exec_id, *a, **kw):
        call_order.append("create")

    def fake_touch(exec_id):
        call_order.append("touch")

    mock_backend.create_route_execution.side_effect = fake_create
    mock_backend.update_route_execution.return_value = None
    mock_backend.touch_route_execution_activity.side_effect = fake_touch

    mock_cfg = MagicMock()
    mock_cfg.node_name = "local"
    mock_router = MagicMock()
    mock_router._self_name = "local"

    monkeypatch.setattr(heartbeat_scheduler, "route_chat", fake_route_chat)
    monkeypatch.setenv("MUSU_NODE_HEARTBEAT_INTERVAL", "9999")

    sleep_count = 0

    async def fake_sleep(n):
        nonlocal sleep_count
        sleep_count += 1
        if sleep_count >= 2:
            raise asyncio.CancelledError()

    with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
        with patch("config.get_config", return_value=mock_cfg):
            with patch("mesh_router.get_mesh_router", return_value=mock_router):
                with patch("asyncio.sleep", side_effect=fake_sleep):
                    with patch("heartbeat_scheduler.cancel_task_record"):
                        with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")):
                            with pytest.raises((asyncio.CancelledError, Exception)):
                                await heartbeat_scheduler._node_manager_heartbeat()

    assert "touch" in call_order, "touch_route_execution_activity must be called"
    assert "route_chat" in call_order, "route_chat must be called"
    touch_idx = call_order.index("touch")
    route_idx = call_order.index("route_chat")
    assert touch_idx < route_idx, (
        f"touch_route_execution_activity (pos {touch_idx}) must be called BEFORE "
        f"route_chat (pos {route_idx}) to close the watchdog gap"
    )
