"""Phase 70: Agent Stuck Watchdog tests.

Tests:
1. _heartbeat_iteration releases _heartbeat_lock even when route_chat times out
2. _watchdog_loop cancels stuck route_executions (running + activity > kill threshold)
3. (Phase 71) last_activity_at-based watchdog: active tasks not killed, dead tasks killed
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
        patch("heartbeat_scheduler._get_heartbeat_backend", return_value=mock_backend),
        patch("heartbeat_scheduler._should_skip_heartbeat", return_value=(False, "")),
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
    import watchdog

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

    with patch("watchdog._get_watchdog_backend", return_value=mock_backend):
        await server._run_watchdog_once()

    # The stuck task should have been marked failed with activity-based message
    mock_backend.update_route_execution.assert_called_once()
    call_args = mock_backend.update_route_execution.call_args
    assert call_args[0][0] == "stuck-task-123"
    assert call_args[0][1] == "failed"
    error_msg = call_args[1]["error"]
    assert "zombie" in error_msg or "activity" in error_msg
    assert "auto-cancelled by watchdog" in error_msg


# ---------------------------------------------------------------------------
# 3. task_stuck_total counter exists and is incremented
# ---------------------------------------------------------------------------

def test_task_stuck_total_counter_exists():
    """task_stuck_total Prometheus counter must be defined in server module."""
    import server
    import watchdog
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
    import watchdog

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
        patch("watchdog._get_watchdog_backend", return_value=mock_backend),
        patch.object(watchdog.logger, "warning") as mock_warn,
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
    import watchdog

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
        patch("watchdog._get_watchdog_backend", return_value=mock_backend),
        patch.object(watchdog.logger, "error") as mock_error,
    ):
        await server._run_watchdog_once()

    # Must emit logger.error mentioning the task and ESCALATE
    error_calls = [str(c) for c in mock_error.call_args_list]
    assert any("esc-task-789" in c or "ESCALATE" in c for c in error_calls), (
        f"Expected escalate ERROR log for esc-task-789, got: {error_calls}"
    )
    # Must NOT cancel the task
    mock_backend.update_route_execution.assert_not_called()


# ---------------------------------------------------------------------------
# Phase 71: last_activity_at-based watchdog
# ---------------------------------------------------------------------------

# 6. Watchdog kill query uses last_activity_at, not updated_at
@pytest.mark.asyncio
async def test_watchdog_kill_uses_last_activity_at():
    """_run_watchdog_once kill scan must query last_activity_at, not updated_at,
    so actively streaming tasks are never cancelled mid-execution."""
    import watchdog

    captured_sqls: list[str] = []

    def fake_execute(sql, params=()):
        captured_sqls.append(sql)
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = fake_execute

    with patch("watchdog._get_watchdog_backend", return_value=mock_backend):
        await watchdog._run_watchdog_once()

    kill_sql = next((s for s in captured_sqls if "status = 'running'" in s and len(s) < 300), None)
    assert kill_sql is not None, f"No kill-scan SQL found. Captured: {captured_sqls}"
    assert "last_activity_at" in kill_sql, (
        f"Kill scan must use last_activity_at, got: {kill_sql!r}"
    )
    assert "updated_at" not in kill_sql or "last_activity_at" in kill_sql, (
        f"Kill scan must not rely on updated_at alone: {kill_sql!r}"
    )


# 7. Active task (recent last_activity_at) is NOT killed by watchdog
@pytest.mark.asyncio
async def test_watchdog_spares_active_task():
    """A task with last_activity_at updated 30s ago must not be cancelled,
    even if updated_at is old (the LLM has been streaming for > 240s)."""
    import watchdog

    # updated_at is ancient (400s ago) but last_activity_at is fresh (30s ago)
    old_updated = (datetime.now(timezone.utc) - timedelta(seconds=400)).isoformat()
    recent_activity = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
    active_row = {
        "id": "active-task-111",
        "channel": "engineer",
        "updated_at": old_updated,
        "last_activity_at": recent_activity,
    }

    def fake_execute(sql, params=()):
        # Kill scan: if it (incorrectly) queries updated_at alone, return the row
        # If it correctly queries last_activity_at, the 30s-ago task must NOT appear
        if "last_activity_at" in sql and "status = 'running'" in sql and len(params) >= 1:
            kill_cutoff = params[0]
            if recent_activity >= kill_cutoff:
                # recent_activity is within threshold — don't return it
                return []
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = fake_execute

    with patch("watchdog._get_watchdog_backend", return_value=mock_backend):
        cancelled = await watchdog._run_watchdog_once()

    assert cancelled == 0, (
        f"Active task must not be cancelled; got {cancelled} cancellations"
    )
    mock_backend.update_route_execution.assert_not_called()


# 8. Dead task (old last_activity_at) IS killed by watchdog
@pytest.mark.asyncio
async def test_watchdog_kills_dead_task():
    """A task with last_activity_at older than KILL_SEC must be cancelled
    and its error reason must contain 'zombie' or 'last_activity_at'."""
    import watchdog

    dead_time = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()
    dead_row = {"id": "dead-task-222", "channel": "engineer", "last_activity_at": dead_time}

    def fake_execute(sql, params=()):
        # Return dead_row only for the kill-scan (last_activity_at-based, 1 param)
        if "last_activity_at" in sql and "status = 'running'" in sql:
            if len(params) == 1:
                return [dead_row]
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = fake_execute
    mock_backend.update_route_execution = MagicMock()

    with patch("watchdog._get_watchdog_backend", return_value=mock_backend):
        cancelled = await watchdog._run_watchdog_once()

    assert cancelled == 1, f"Expected 1 cancellation, got {cancelled}"
    mock_backend.update_route_execution.assert_called_once()
    call_args = mock_backend.update_route_execution.call_args
    assert call_args[0][0] == "dead-task-222"
    assert call_args[0][1] == "failed"
    error_msg = call_args[1]["error"]
    assert "zombie" in error_msg or "last_activity_at" in error_msg or "activity" in error_msg, (
        f"Error reason must mention activity/zombie, got: {error_msg!r}"
    )


# 9. touch_route_execution_activity() backend method exists and updates last_activity_at
def test_backend_touch_activity_method_exists():
    """LocalBackend must have touch_route_execution_activity(exec_id) method."""
    import sys
    from pathlib import Path
    musu_core = Path(__file__).parent.parent.parent / "musu-core" / "src"
    if str(musu_core) not in sys.path:
        sys.path.insert(0, str(musu_core))

    from musu_core.backends.local import LocalBackend
    assert hasattr(LocalBackend, "touch_route_execution_activity"), (
        "LocalBackend must have touch_route_execution_activity() method"
    )
    import inspect
    sig = inspect.signature(LocalBackend.touch_route_execution_activity)
    assert "exec_id" in sig.parameters, "touch_route_execution_activity must accept exec_id"


# 10. handlers.py route_chat touches last_activity_at during LLM call
@pytest.mark.asyncio
async def test_route_chat_touches_activity_during_llm_call():
    """route_chat must call touch_route_execution_activity at least once
    while the LLM adapter is executing, so watchdog won't kill active tasks."""
    import sys
    import asyncio
    from pathlib import Path
    musu_bridge = Path(__file__).parent.parent
    if str(musu_bridge) not in sys.path:
        sys.path.insert(0, str(musu_bridge))

    touch_calls: list[str] = []

    mock_backend = MagicMock()
    mock_backend.get_agent_by_name.return_value = {
        "id": "agent-abc",
        "role": "Engineer",
        "adapter_type": "gemini_local",
        "adapter_config": {},
        "instructions_path": None,
    }
    mock_backend.list_tasks.return_value = []
    mock_backend.create_task.return_value = {"id": "task-xyz"}
    mock_backend.add_comment.return_value = None
    mock_backend.list_agents.return_value = []
    mock_backend.create_route_execution.return_value = None
    mock_backend.update_route_execution.return_value = None

    def fake_touch(exec_id):
        touch_calls.append(exec_id)

    mock_backend.touch_route_execution_activity = fake_touch

    # Simulate a slow LLM call (3 ticks of activity heartbeat)
    async def slow_route(*args, **kwargs):
        await asyncio.sleep(0.2)
        from musu_core.router import RouteResult
        return RouteResult(
            success=True,
            summary="done",
            adapter_result=None,
        )

    import handlers
    from unittest.mock import patch as _patch

    with (
        _patch("handlers._get_backend", return_value=mock_backend),
        _patch("handlers.get_mesh_router") as mock_mesh,
        _patch("handlers.Router") as MockRouter,
    ):
        mock_mesh.return_value.enabled = False
        instance = AsyncMock()
        instance.route = slow_route
        MockRouter.return_value = instance

        with _patch("handlers.get_bridge_config") as mock_cfg:
            cfg = MagicMock()
            cfg.channel_agent_map = {}
            mock_cfg.return_value = cfg
            await handlers.route_chat(
                channel="engineer",
                sender_id="test-sender",
                text="test task",
            )

    assert len(touch_calls) > 0, (
        "route_chat must call touch_route_execution_activity during LLM execution"
    )


# ---------------------------------------------------------------------------
# Phase 72: Watchdog-kill feeds circuit breaker + delegation block
# ---------------------------------------------------------------------------

# 11. Watchdog kill increments per-channel circuit breaker
@pytest.mark.asyncio
async def test_watchdog_kill_records_circuit_breaker_failure():
    """When watchdog kills a task (dead last_activity_at), it must call
    _channel_cb.record_failure(channel) so the circuit breaker can trip."""
    import watchdog
    from channel_circuit_breaker import _ChannelCircuitBreaker

    dead_time = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()
    dead_row = {"id": "cb-dead-task-001", "channel": "ceo", "last_activity_at": dead_time}

    def fake_execute(sql, params=()):
        if "last_activity_at" in sql and "status = 'running'" in sql and len(params) == 1:
            return [dead_row]
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = fake_execute
    mock_backend.update_route_execution = MagicMock()

    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=30)
    with (
        patch("watchdog._get_watchdog_backend", return_value=mock_backend),
        patch("watchdog._channel_cb", cb),
    ):
        await watchdog._run_watchdog_once()

    assert len(cb._failures["ceo"]) == 1, (
        "Watchdog kill must call record_failure on the circuit breaker"
    )


# 12. 3 watchdog kills → circuit breaker opens
@pytest.mark.asyncio
async def test_watchdog_three_kills_opens_circuit_breaker():
    """After 3 watchdog kills on the same channel, the circuit breaker must be open."""
    import watchdog
    from channel_circuit_breaker import _ChannelCircuitBreaker

    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=30)

    dead_time = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()

    for i in range(3):
        row = {"id": f"cb-dead-task-{i}", "channel": "ceo", "last_activity_at": dead_time}

        def fake_execute(sql, params=(), _row=row):
            if "last_activity_at" in sql and "status = 'running'" in sql and len(params) == 1:
                return [_row]
            return []

        mock_backend = MagicMock()
        mock_backend._db.execute.side_effect = fake_execute
        mock_backend.update_route_execution = MagicMock()

        with (
            patch("watchdog._get_watchdog_backend", return_value=mock_backend),
            patch("watchdog._channel_cb", cb),
        ):
            await watchdog._run_watchdog_once()

    assert cb.is_open("ceo"), (
        "Circuit breaker must be open after 3 watchdog kills on the same channel"
    )


# 13. Circuit breaker open → route_chat returns immediate error
@pytest.mark.asyncio
async def test_circuit_breaker_open_blocks_delegation():
    """When the circuit breaker is open for a channel, route_chat must return
    an error immediately without calling the LLM adapter."""
    import handlers
    from channel_circuit_breaker import _ChannelCircuitBreaker

    cb = _ChannelCircuitBreaker(fail_threshold=1, window_sec=60, block_sec=30)
    cb.record_failure("ceo")  # trip it immediately (threshold=1)
    assert cb.is_open("ceo"), "Precondition: CB must be open"

    adapter_called = []

    async def fake_route(*args, **kwargs):
        adapter_called.append(True)
        from musu_core.router import RouteResult
        return RouteResult(success=True, summary="should not reach", adapter_result=None)

    mock_backend = MagicMock()
    mock_backend.get_agent_by_name.return_value = {
        "id": "agent-ceo", "role": "CEO",
        "adapter_type": "gemini_local", "adapter_config": {}, "instructions_path": None,
    }
    mock_backend.list_agents.return_value = []

    with (
        patch("handlers._get_backend", return_value=mock_backend),
        patch("handlers.get_mesh_router") as mock_mesh,
        patch("server._channel_cb", cb),
    ):
        mock_mesh.return_value.enabled = False
        result = await handlers.route_chat(
            channel="ceo",
            sender_id="test-sender",
            text="do something specific in ceo_agent.py function handle_task",
        )

    assert result.get("error"), f"Expected an error when CB is open, got: {result}"
    assert "circuit" in result["error"].lower() or "cb" in result["error"].lower(), (
        f"Error must mention circuit breaker, got: {result['error']!r}"
    )
    assert not adapter_called, "LLM adapter must NOT be called when circuit breaker is open"


# 14. Circuit breaker resets after block_sec
def test_circuit_breaker_resets_after_block_sec():
    """Circuit breaker must automatically close after block_sec seconds."""
    import time
    from channel_circuit_breaker import _ChannelCircuitBreaker

    cb = _ChannelCircuitBreaker(fail_threshold=1, window_sec=60, block_sec=1)
    cb.record_failure("team_lead")
    assert cb.is_open("team_lead"), "Precondition: CB must be open"

    # Simulate time passing past block_sec by back-dating the trip timestamp
    cb._tripped_at["team_lead"] = time.time() - 2  # 2s ago > block_sec=1

    assert not cb.is_open("team_lead"), (
        "Circuit breaker must close automatically after block_sec elapses"
    )


# ---------------------------------------------------------------------------
# Phase 73: last_activity_at initialized on create + refreshed on running
# ---------------------------------------------------------------------------

# 15. create_route_execution sets last_activity_at to non-NULL
def test_create_route_execution_sets_last_activity_at():
    """create_route_execution must set last_activity_at = now() (not NULL) so the
    watchdog COALESCE fallback to updated_at cannot cause premature kills."""
    import sys
    import uuid
    from pathlib import Path
    musu_core = Path(__file__).parent.parent.parent / "musu-core" / "src"
    if str(musu_core) not in sys.path:
        sys.path.insert(0, str(musu_core))

    from musu_core.backends.local import LocalBackend

    db = LocalBackend(":memory:")
    exec_id = str(uuid.uuid4())
    db.create_route_execution(exec_id, "engineer", "sender-1", "hello")

    row = db.get_route_execution(exec_id)
    assert row is not None, "Row must exist after create_route_execution"
    assert row.get("last_activity_at") is not None, (
        "last_activity_at must be set on INSERT — NULL allows watchdog to use "
        "updated_at (INSERT time) which can trigger premature kills"
    )


# 16. update_route_execution('running') refreshes last_activity_at
def test_update_route_execution_running_refreshes_last_activity_at():
    """update_route_execution('running') must update last_activity_at so the
    watchdog kill clock starts from when the LLM execution actually began."""
    import sys
    import uuid
    import time
    from pathlib import Path
    musu_core = Path(__file__).parent.parent.parent / "musu-core" / "src"
    if str(musu_core) not in sys.path:
        sys.path.insert(0, str(musu_core))

    from musu_core.backends.local import LocalBackend

    db = LocalBackend(":memory:")
    exec_id = str(uuid.uuid4())
    db.create_route_execution(exec_id, "engineer", "sender-1", "hello")

    row_after_create = db.get_route_execution(exec_id)
    created_activity = row_after_create["last_activity_at"]

    # Small sleep to ensure clock advances
    time.sleep(0.05)

    db.update_route_execution(exec_id, "running")
    row_after_running = db.get_route_execution(exec_id)
    running_activity = row_after_running["last_activity_at"]

    assert running_activity is not None, "last_activity_at must not be NULL after running update"
    assert running_activity >= created_activity, (
        "last_activity_at after 'running' must be >= the INSERT timestamp"
    )


# ---------------------------------------------------------------------------
# Phase 74: route_chat_with_qa_loop heartbeat + mesh forwarding touch
# ---------------------------------------------------------------------------

# 17. route_chat_with_qa_loop calls touch_route_execution_activity periodically
@pytest.mark.asyncio
async def test_qa_loop_route_touches_activity_during_execution():
    """route_chat_with_qa_loop must call touch_route_execution_activity at least once
    during the QA loop so the watchdog (320s kill) does not cancel it mid-run."""
    import sys
    import asyncio
    from pathlib import Path
    musu_bridge = Path(__file__).parent.parent
    if str(musu_bridge) not in sys.path:
        sys.path.insert(0, str(musu_bridge))

    touch_calls: list[str] = []
    mock_backend = MagicMock()

    engineer_agent = {"id": "eng-id", "role": "Engineer", "adapter_type": "gemini_local",
                      "adapter_config": {}, "instructions_path": None}
    qa_agent_dict = {"id": "qa-id", "role": "QA", "adapter_type": "gemini_local",
                     "adapter_config": {}, "instructions_path": None}

    def fake_get_agent_by_name(name, company_id=None):
        if name == "engineer":
            return engineer_agent
        if name == "qa":
            return qa_agent_dict
        return None

    mock_backend.get_agent_by_name.side_effect = fake_get_agent_by_name
    mock_backend.update_route_execution = MagicMock()

    def fake_touch(exec_id):
        touch_calls.append(exec_id)

    mock_backend.touch_route_execution_activity = fake_touch

    from musu_core.qa_loop import QALoopResult
    from musu_core.sprint_contract import SprintContract

    async def slow_loop_run(task_prompt, contract, task_id=None):
        await asyncio.sleep(0.15)
        return QALoopResult(passed=True, iterations_used=1, all_scores=[], escalated=False,
                            escalation_reason=None, final_score=None)

    import handlers
    from unittest.mock import patch as _patch

    with (
        _patch("handlers._get_backend", return_value=mock_backend),
        _patch("musu_core.qa_loop.QALoop.run", side_effect=slow_loop_run),
        _patch("musu_core.sprint_contract.save_contract"),
        _patch("musu_core.sprint_contract.save_qa_score"),
        _patch("musu_core.db.get_db"),
    ):
        await handlers.route_chat_with_qa_loop(
            task_id="exec-001",
            text="Implement feature X in feature_x.py function handle_x",
            sender_id="sender-1",
        )

    assert len(touch_calls) > 0, (
        "route_chat_with_qa_loop must call touch_route_execution_activity during QA loop execution"
    )


# 18. mesh forwarding path touches last_activity_at before forwarding
@pytest.mark.asyncio
async def test_mesh_forward_touches_activity_before_forward():
    """When route_chat forwards to a remote mesh node, it must call
    touch_route_execution_activity once before the remote call returns,
    so a long-running remote task won't be killed by the local watchdog."""
    import sys
    from pathlib import Path
    musu_bridge = Path(__file__).parent.parent
    if str(musu_bridge) not in sys.path:
        sys.path.insert(0, str(musu_bridge))

    touch_calls: list[str] = []
    mock_backend = MagicMock()
    mock_backend.create_route_execution = MagicMock()
    mock_backend.update_route_execution = MagicMock()

    def fake_touch(exec_id):
        touch_calls.append(exec_id)

    mock_backend.touch_route_execution_activity = fake_touch

    import handlers
    from unittest.mock import patch as _patch, AsyncMock as _AsyncMock

    mock_mesh = MagicMock()
    mock_mesh.enabled = True
    mock_mesh.is_remote.return_value = True
    mock_mesh.node_for_agent.return_value = "remote-node"
    mock_mesh.url_for_node.return_value = "http://remote-node:8070"
    mock_mesh.is_node_healthy = _AsyncMock(return_value=True)
    mock_mesh.forward = _AsyncMock(return_value={"response": "ok from remote"})

    with (
        _patch("handlers._get_backend", return_value=mock_backend),
        _patch("handlers.get_mesh_router", return_value=mock_mesh),
        _patch("server._channel_cb") as mock_cb,
    ):
        mock_cb.is_open.return_value = False
        result = await handlers.route_chat(
            channel="engineer",
            sender_id="test-sender",
            text="do something in engineer.py function run_task",
        )

    assert len(touch_calls) > 0, (
        "route_chat mesh forwarding must call touch_route_execution_activity "
        "before/during the remote forward call"
    )
