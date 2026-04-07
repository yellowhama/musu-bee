"""Unit tests for router.py — RouteRequest dispatch + execution_log recording."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from musu_core.adapters.base import AdapterResult
from musu_core.backends.local import LocalBackend
from musu_core.config import Config
from musu_core.router import RouteRequest, RouteResult, Router, make_router


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_db(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture
def backend(tmp_db):
    return LocalBackend(tmp_db)


@pytest.fixture
def cfg():
    return Config(
        db_path=":memory:",
        default_model="claude-test",
        claude_command="claude",
        adapter_timeout_sec=10,
    )


@pytest.fixture
def router(backend, cfg):
    return Router(backend=backend, config=cfg)


@pytest.fixture
def agent_id(backend):
    agent = backend.agents.create(
        name="test-agent",
        role="assistant",
        adapter_type="claude_local",
        adapter_config={"model": "claude-sonnet-4-5"},
    )
    return agent.id


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_adapter_result(run_id: str, success: bool = True, summary: str = "ok") -> AdapterResult:
    return AdapterResult(run_id=run_id, success=success, summary=summary, session_id="sess-1")


def _good_stream_json(session_id: str = "s1") -> bytes:
    events = [
        json.dumps({"type": "system", "subtype": "init", "session_id": session_id, "model": "m"}),
        json.dumps({"type": "result", "session_id": session_id, "result": "Router test OK", "usage": {"input_tokens": 1, "output_tokens": 1, "cache_read_input_tokens": 0}}),
    ]
    return "\n".join(events).encode()


# ---------------------------------------------------------------------------
# Basic routing
# ---------------------------------------------------------------------------


def test_route_unknown_agent(router):
    req = RouteRequest(agent_id="nonexistent", prompt="hello")
    result = asyncio.run(router.route(req))
    assert not result.success
    assert "not found" in result.error


def test_route_unknown_adapter_type(backend, cfg, tmp_db):
    agent = backend.agents.create(name="x", adapter_type="bogus_type")
    r = Router(backend=backend, config=cfg)
    req = RouteRequest(agent_id=agent.id, prompt="hello")
    result = asyncio.run(r.route(req))
    assert not result.success
    assert "Unknown adapter type" in result.error


def test_route_success_logs_execution(router, backend, agent_id):
    proc = MagicMock()
    proc.returncode = 0
    proc.communicate = AsyncMock(return_value=(_good_stream_json(), b""))

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        result = asyncio.run(router.route(RouteRequest(agent_id=agent_id, prompt="do it")))

    assert result.success
    assert result.summary == "Router test OK"
    assert result.session_id == "s1"

    # Execution log must have been written
    logs = backend.get_execution_log(agent_id=agent_id)
    assert logs, "execution_log should have at least one entry"
    assert any(e["event"] in ("completed", "started") for e in logs)


def test_route_failure_logged(router, backend, agent_id):
    proc = MagicMock()
    proc.returncode = 1
    proc.communicate = AsyncMock(return_value=(b"", b"something went wrong"))

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        result = asyncio.run(router.route(RouteRequest(agent_id=agent_id, prompt="fail")))

    assert not result.success
    logs = backend.get_execution_log(agent_id=agent_id)
    assert any(e["event"] == "failed" for e in logs)


def test_route_forwards_session_id(router, backend, agent_id):
    captured_args: list = []

    async def fake_exec(cmd, *args, stdin, stdout, stderr, cwd, env):
        captured_args.extend(args)
        proc = MagicMock()
        proc.returncode = 0
        proc.communicate = AsyncMock(return_value=(_good_stream_json("s-resume"), b""))
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(
            router.route(RouteRequest(agent_id=agent_id, prompt="hi", session_id="s-resume"))
        )

    assert "--resume" in captured_args
    idx = captured_args.index("--resume")
    assert captured_args[idx + 1] == "s-resume"


def test_route_links_task_id(router, backend, agent_id):
    task = backend.tasks.create(title="Task A", assignee_agent_id=agent_id)
    proc = MagicMock()
    proc.returncode = 0
    proc.communicate = AsyncMock(return_value=(_good_stream_json(), b""))

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        result = asyncio.run(
            router.route(RouteRequest(agent_id=agent_id, prompt="work", task_id=task.id))
        )

    assert result.success
    logs = backend.get_execution_log(task_id=task.id)
    assert logs, "execution_log should reference the task"


# ---------------------------------------------------------------------------
# make_router factory
# ---------------------------------------------------------------------------


def test_make_router_creates_router(tmp_db):
    cfg = Config(db_path=tmp_db)
    r = make_router(db_path=tmp_db, config=cfg)
    assert isinstance(r, Router)


# ---------------------------------------------------------------------------
# Acceptance: import from musu_core.router
# ---------------------------------------------------------------------------


def test_import_from_package():
    from musu_core import router as r_module
    assert hasattr(r_module, "Router")
    assert hasattr(r_module, "RouteRequest")
    assert hasattr(r_module, "RouteResult")
    assert hasattr(r_module, "make_router")


# ---------------------------------------------------------------------------
# Fallback chain (MUS-884)
# ---------------------------------------------------------------------------


@pytest.fixture
def agent_with_fallback(backend):
    """Agent configured with a hermes fallback."""
    agent = backend.agents.create(
        name="fallback-agent",
        role="assistant",
        adapter_type="claude_local",
        adapter_config={"model": "claude-sonnet-4-5"},
    )
    # Store fallback_chain in DB
    backend._db.execute(
        "UPDATE agents SET fallback_chain = ? WHERE id = ?",
        (json.dumps([{"adapter_type": "hermes", "model": "qwen3.5-9b"}]), agent.id),
    )
    return agent.id


def test_fallback_triggered_on_retriable_failure(router, backend, agent_with_fallback):
    """Primary adapter fails with is_retriable=True → fallback adapter is called."""
    primary_fail = AdapterResult(
        run_id="r1",
        success=False,
        summary="",
        error="rate limit",
        is_retriable=True,
    )
    fallback_ok = AdapterResult(
        run_id="r1",
        success=True,
        summary="fallback response",
        is_retriable=False,
    )

    primary_mock = AsyncMock(return_value=primary_fail)
    fallback_mock = AsyncMock(return_value=fallback_ok)

    with patch("musu_core.adapters.claude_local.ClaudeLocalAdapter.execute", primary_mock), \
         patch("musu_core.adapters.hermes.HermesAdapter.execute", fallback_mock):
        result = asyncio.run(router.route(RouteRequest(agent_id=agent_with_fallback, prompt="go")))

    assert result.success
    assert result.summary == "fallback response"
    assert result.adapter_result is not None
    assert result.adapter_result.raw.get("fallback_used") == "hermes"
    fallback_mock.assert_called_once()


def test_fallback_not_triggered_on_non_retriable_failure(router, backend, agent_with_fallback):
    """Primary adapter fails with is_retriable=False → fallback NOT called."""
    primary_fail = AdapterResult(
        run_id="r2",
        success=False,
        summary="",
        error="bad prompt (400)",
        is_retriable=False,
    )

    primary_mock = AsyncMock(return_value=primary_fail)
    fallback_mock = AsyncMock()

    with patch("musu_core.adapters.claude_local.ClaudeLocalAdapter.execute", primary_mock), \
         patch("musu_core.adapters.hermes.HermesAdapter.execute", fallback_mock):
        result = asyncio.run(router.route(RouteRequest(agent_id=agent_with_fallback, prompt="bad")))

    assert not result.success
    fallback_mock.assert_not_called()


def test_fallback_stops_on_non_retriable_fallback_failure(router, backend, agent_with_fallback):
    """Fallback adapter returns non-retriable failure → chain stops immediately."""
    primary_fail = AdapterResult(
        run_id="r3", success=False, summary="", error="rate limit", is_retriable=True
    )
    fallback_fail = AdapterResult(
        run_id="r3", success=False, summary="", error="bad model config", is_retriable=False
    )

    primary_mock = AsyncMock(return_value=primary_fail)
    fallback_mock = AsyncMock(return_value=fallback_fail)

    with patch("musu_core.adapters.claude_local.ClaudeLocalAdapter.execute", primary_mock), \
         patch("musu_core.adapters.hermes.HermesAdapter.execute", fallback_mock):
        result = asyncio.run(router.route(RouteRequest(agent_id=agent_with_fallback, prompt="bad")))

    assert not result.success
    fallback_mock.assert_called_once()


def test_is_retriable_field_on_adapter_result():
    """AdapterResult.is_retriable defaults to False."""
    r = AdapterResult(run_id="x", success=True, summary="ok")
    assert r.is_retriable is False

    r2 = AdapterResult(run_id="x", success=False, summary="", is_retriable=True)
    assert r2.is_retriable is True
