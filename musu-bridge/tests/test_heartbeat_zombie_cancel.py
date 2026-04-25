"""Tests for heartbeat timeout/error zombie prevention.

Verifies that _heartbeat_iteration and _node_manager_heartbeat cancel the
route_execution DB record when route_chat times out or raises an exception,
preventing zombie 'running' records.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

_BRIDGE = Path(__file__).parent.parent
if str(_BRIDGE) not in sys.path:
    sys.path.insert(0, str(_BRIDGE))


# ---------------------------------------------------------------------------
# _heartbeat_iteration — timeout path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_heartbeat_iteration_timeout_cancels_record(monkeypatch):
    """On asyncio.TimeoutError, _heartbeat_iteration must cancel the exec record."""
    import heartbeat_scheduler

    cancelled_ids = []

    async def slow_route_chat(**kwargs):
        await asyncio.sleep(9999)

    def fake_cancel(task_id, error="cancelled"):
        cancelled_ids.append(task_id)
        return True

    created_exec_ids = []

    mock_backend = MagicMock()

    def fake_create(exec_id, *a, **kw):
        created_exec_ids.append(exec_id)

    mock_backend.create_route_execution.side_effect = fake_create
    mock_backend.update_route_execution.return_value = None

    monkeypatch.setattr(heartbeat_scheduler, "route_chat", slow_route_chat)
    monkeypatch.setenv("MUSU_HEARTBEAT_TIMEOUT_SEC", "1")

    with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")):
        with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
            with patch("heartbeat_scheduler.cancel_task_record", side_effect=fake_cancel):
                await heartbeat_scheduler._heartbeat_iteration(
                    agent_name="ceo",
                    company_id="test-co",
                    diag_summary="",
                )

    # A record must have been created and then cancelled
    assert len(created_exec_ids) == 1, "Expected one exec record created before route_chat"
    assert len(cancelled_ids) == 1, "Expected cancel_task_record called on timeout"
    assert cancelled_ids[0] == created_exec_ids[0], "Cancelled id must match created exec_id"


@pytest.mark.asyncio
async def test_heartbeat_iteration_timeout_increments_stuck_counter(monkeypatch):
    """On asyncio.TimeoutError, _increment_stuck_counter must be called."""
    import heartbeat_scheduler

    stuck_calls = []

    async def slow_route_chat(**kwargs):
        await asyncio.sleep(9999)

    monkeypatch.setattr(heartbeat_scheduler, "route_chat", slow_route_chat)
    monkeypatch.setenv("MUSU_HEARTBEAT_TIMEOUT_SEC", "1")

    mock_backend = MagicMock()

    with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")):
        with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
            with patch("heartbeat_scheduler.cancel_task_record"):
                with patch("heartbeat_scheduler._increment_stuck_counter", side_effect=lambda *a: stuck_calls.append(a)):
                    await heartbeat_scheduler._heartbeat_iteration(
                        agent_name="ceo",
                        company_id="test-co",
                        diag_summary="",
                    )

    assert len(stuck_calls) > 0, "_increment_stuck_counter not called on timeout"


# ---------------------------------------------------------------------------
# _heartbeat_iteration — exception path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_heartbeat_iteration_exception_cancels_record(monkeypatch):
    """On unexpected exception from route_chat, _heartbeat_iteration must cancel the record."""
    import heartbeat_scheduler

    cancelled_ids = []
    created_exec_ids = []

    async def bad_route_chat(**kwargs):
        raise RuntimeError("llm exploded")

    def fake_cancel(task_id, error="cancelled"):
        cancelled_ids.append(task_id)
        return True

    mock_backend = MagicMock()

    def fake_create(exec_id, *a, **kw):
        created_exec_ids.append(exec_id)

    mock_backend.create_route_execution.side_effect = fake_create
    mock_backend.update_route_execution.return_value = None

    monkeypatch.setattr(heartbeat_scheduler, "route_chat", bad_route_chat)

    with patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")):
        with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
            with patch("heartbeat_scheduler.cancel_task_record", side_effect=fake_cancel):
                # Exception should propagate (re-raised after cancel)
                with pytest.raises(RuntimeError, match="llm exploded"):
                    await heartbeat_scheduler._heartbeat_iteration(
                        agent_name="ceo",
                        company_id="test-co",
                        diag_summary="",
                    )

    assert len(created_exec_ids) == 1, "Expected one exec record created before route_chat"
    assert len(cancelled_ids) == 1, "Expected cancel_task_record called on exception"
    assert cancelled_ids[0] == created_exec_ids[0]


# ---------------------------------------------------------------------------
# _node_manager_heartbeat — exception path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_node_manager_heartbeat_exception_cancels_record(monkeypatch):
    """On exception in _node_manager_heartbeat, the route_execution record must be cancelled."""
    import heartbeat_scheduler

    cancelled_ids = []
    created_exec_ids = []

    async def bad_route_chat(**kwargs):
        raise RuntimeError("node manager error")

    def fake_cancel(task_id, error="cancelled"):
        cancelled_ids.append(task_id)
        return True

    mock_backend = MagicMock()

    def fake_create(exec_id, *a, **kw):
        created_exec_ids.append(exec_id)

    mock_backend.create_route_execution.side_effect = fake_create
    mock_backend.update_route_execution.return_value = None

    # config.get_config and mesh_router.get_mesh_router are imported inside the function
    mock_cfg = MagicMock()
    mock_cfg.node_name = "local"
    mock_router_inst = MagicMock()
    mock_router_inst._self_name = "local"

    monkeypatch.setattr(heartbeat_scheduler, "route_chat", bad_route_chat)
    monkeypatch.setenv("MUSU_NODE_HEARTBEAT_INTERVAL", "9999")

    # Sleep calls: [0]=stagger 90s (pass), [1]=interval sleep (cancel after iteration ran)
    sleep_call_count = 0

    async def fake_sleep(n):
        nonlocal sleep_call_count
        sleep_call_count += 1
        if sleep_call_count >= 2:
            raise asyncio.CancelledError()
        # First sleep (stagger): return immediately so loop body executes

    with patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend):
        with patch("heartbeat_scheduler.cancel_task_record", side_effect=fake_cancel):
            with patch("config.get_config", return_value=mock_cfg):
                with patch("mesh_router.get_mesh_router", return_value=mock_router_inst):
                    with patch("asyncio.sleep", side_effect=fake_sleep):
                        with pytest.raises(asyncio.CancelledError):
                            await heartbeat_scheduler._node_manager_heartbeat()

    assert len(created_exec_ids) >= 1, "Expected exec record created before route_chat"
    assert len(cancelled_ids) >= 1, "Expected cancel_task_record called on exception"
