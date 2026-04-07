"""Tests for fallback metrics collection, escalation, and weekly report (MUS-898)."""

from __future__ import annotations

import asyncio
import json
import logging
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from musu_core.adapters.base import AdapterResult, ErrorCode
from musu_core.backends.local import LocalBackend
from musu_core.config import Config
from musu_core.escalation import escalate_chain_exhausted
from musu_core.fallback_report import generate_report
from musu_core.router import RouteRequest, Router


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
def agent_with_fallback(backend):
    agent = backend.agents.create(
        name="fallback-agent",
        role="assistant",
        adapter_type="claude_local",
        adapter_config={"model": "claude-sonnet-4-5"},
    )
    backend._db.execute(
        "UPDATE agents SET fallback_chain = ? WHERE id = ?",
        (json.dumps([{"adapter_type": "hermes", "model": "qwen3.5-9b"}]), agent.id),
    )
    return agent


# ---------------------------------------------------------------------------
# LocalBackend.record_fallback_metric / get_fallback_metrics
# ---------------------------------------------------------------------------


def test_record_and_query_fallback_metric(backend):
    backend.record_fallback_metric(
        agent_id=None,
        run_id="run-1",
        fallback_reason="rate_limit",
        fallback_adapter="hermes",
        chain_exhausted=False,
    )
    rows = backend.get_fallback_metrics()
    assert len(rows) == 1
    r = rows[0]
    assert r["run_id"] == "run-1"
    assert r["fallback_reason"] == "rate_limit"
    assert r["fallback_adapter"] == "hermes"
    assert r["chain_exhausted"] is False


def test_record_chain_exhausted(backend):
    backend.record_fallback_metric(
        agent_id=None,
        run_id="run-2",
        fallback_reason="timeout",
        chain_exhausted=True,
    )
    rows = backend.get_fallback_metrics()
    assert rows[0]["chain_exhausted"] is True


def test_get_fallback_metrics_agent_filter(backend):
    backend.record_fallback_metric(agent_id="agent-A", run_id="r1", fallback_reason="timeout")
    backend.record_fallback_metric(agent_id="agent-B", run_id="r2", fallback_reason="rate_limit")
    rows = backend.get_fallback_metrics(agent_id="agent-A")
    assert len(rows) == 1
    assert rows[0]["agent_id"] == "agent-A"


def test_prune_fallback_metrics(backend):
    # Insert a row with an old timestamp directly
    backend._db.execute(
        "INSERT INTO fallback_metrics (id, run_id, fallback_reason, created_at)"
        " VALUES ('old-id', 'r-old', 'unknown', '2020-01-01T00:00:00.000Z')"
    )
    backend.record_fallback_metric(agent_id=None, run_id="r-new", fallback_reason="timeout")

    deleted = backend.prune_fallback_metrics(retain_days=30)
    assert deleted == 1
    remaining = backend.get_fallback_metrics(since_days=36500)  # all time
    assert len(remaining) == 1
    assert remaining[0]["run_id"] == "r-new"


# ---------------------------------------------------------------------------
# Router metric instrumentation
# ---------------------------------------------------------------------------


def test_router_records_metric_on_fallback_success(router, backend, agent_with_fallback):
    """When primary fails and fallback succeeds, a non-exhausted metric is recorded."""
    primary_fail = AdapterResult(
        run_id="r1", success=False, summary="", error="rate limit",
        is_retriable=True, error_code=ErrorCode.RATE_LIMIT,
    )
    fallback_ok = AdapterResult(run_id="r1", success=True, summary="fallback ok")

    with patch("musu_core.adapters.claude_local.ClaudeLocalAdapter.execute", AsyncMock(return_value=primary_fail)), \
         patch("musu_core.adapters.hermes.HermesAdapter.execute", AsyncMock(return_value=fallback_ok)):
        result = asyncio.run(router.route(RouteRequest(agent_id=agent_with_fallback.id, prompt="go")))

    assert result.success
    rows = backend.get_fallback_metrics(agent_id=agent_with_fallback.id)
    assert len(rows) == 1
    assert rows[0]["fallback_adapter"] == "hermes"
    assert rows[0]["chain_exhausted"] is False
    assert rows[0]["fallback_reason"] == "rate_limit"


def test_router_records_exhausted_metric_when_all_fail(router, backend, agent_with_fallback):
    """When primary and all fallbacks fail, a chain_exhausted metric is recorded."""
    fail = AdapterResult(
        run_id="r2", success=False, summary="", error="timeout",
        is_retriable=True, error_code=ErrorCode.TIMEOUT,
    )

    with patch("musu_core.adapters.claude_local.ClaudeLocalAdapter.execute", AsyncMock(return_value=fail)), \
         patch("musu_core.adapters.hermes.HermesAdapter.execute", AsyncMock(return_value=fail)):
        result = asyncio.run(router.route(RouteRequest(agent_id=agent_with_fallback.id, prompt="fail")))

    assert not result.success
    rows = backend.get_fallback_metrics(agent_id=agent_with_fallback.id)
    exhausted = [r for r in rows if r["chain_exhausted"]]
    assert len(exhausted) == 1


def test_router_escalates_on_chain_exhaustion(router, backend, agent_with_fallback):
    """escalate_chain_exhausted is called when the chain is fully exhausted."""
    fail = AdapterResult(
        run_id="r3", success=False, summary="", error="rate limit",
        is_retriable=True, error_code=ErrorCode.RATE_LIMIT,
    )

    with patch("musu_core.adapters.claude_local.ClaudeLocalAdapter.execute", AsyncMock(return_value=fail)), \
         patch("musu_core.adapters.hermes.HermesAdapter.execute", AsyncMock(return_value=fail)), \
         patch("musu_core.escalation.escalate_chain_exhausted") as mock_esc:
        asyncio.run(router.route(RouteRequest(agent_id=agent_with_fallback.id, prompt="go")))

    mock_esc.assert_called_once()
    call_kwargs = mock_esc.call_args
    assert call_kwargs.kwargs["agent_id"] == agent_with_fallback.id
    assert "hermes" in call_kwargs.kwargs["fallback_adapters_tried"]


def test_router_no_metric_when_no_fallback_chain(router, backend, cfg):
    """No fallback metric is recorded when the agent has no fallback chain."""
    agent = backend.agents.create(
        name="plain-agent",
        role="assistant",
        adapter_type="claude_local",
        adapter_config={},
    )
    fail = AdapterResult(run_id="r4", success=False, summary="", error="oops", is_retriable=True)

    with patch("musu_core.adapters.claude_local.ClaudeLocalAdapter.execute", AsyncMock(return_value=fail)):
        asyncio.run(router.route(RouteRequest(agent_id=agent.id, prompt="hi")))

    rows = backend.get_fallback_metrics(agent_id=agent.id)
    assert len(rows) == 0


# ---------------------------------------------------------------------------
# Escalation
# ---------------------------------------------------------------------------


def test_escalate_logs_when_no_paperclip_env(caplog):
    with patch.dict("os.environ", {}, clear=True):
        with caplog.at_level(logging.WARNING, logger="musu_core.escalation"):
            escalate_chain_exhausted(
                agent_id="agent-1",
                agent_name="test-agent",
                run_id="run-x",
                error="all failed",
                fallback_adapters_tried=["hermes", "process"],
            )
    assert "FALLBACK_CHAIN_EXHAUSTED" in caplog.text


def test_escalate_posts_comment_when_paperclip_env_set():
    env_vars = {
        "PAPERCLIP_API_URL": "http://localhost:3100",
        "PAPERCLIP_API_KEY": "test-key",
        "PAPERCLIP_TASK_ID": "task-abc",
        "PAPERCLIP_RUN_ID": "run-123",
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 201

    with patch.dict("os.environ", env_vars), \
         patch("httpx.post", return_value=mock_resp) as mock_post:
        escalate_chain_exhausted(
            agent_id="a1",
            agent_name="my-agent",
            run_id="run-1",
            error="rate limit",
            fallback_adapters_tried=["hermes"],
        )

    mock_post.assert_called_once()
    call_args = mock_post.call_args
    assert "task-abc/comments" in call_args.args[0]
    body_text = call_args.kwargs["json"]["body"]
    assert "my-agent" in body_text
    assert "hermes" in body_text


# ---------------------------------------------------------------------------
# Weekly report
# ---------------------------------------------------------------------------


def test_generate_report_empty(backend):
    report = generate_report(backend, since_days=7)
    assert "No fallback events" in report


def test_generate_report_with_data(backend):
    backend.record_fallback_metric(
        agent_id="a1", run_id="r1", fallback_reason="rate_limit",
        fallback_adapter="hermes", chain_exhausted=False,
    )
    backend.record_fallback_metric(
        agent_id="a1", run_id="r1", fallback_reason="timeout",
        fallback_adapter="hermes", chain_exhausted=True,
    )
    backend.record_fallback_metric(
        agent_id="a2", run_id="r2", fallback_reason="rate_limit",
        fallback_adapter="local_llm", chain_exhausted=False,
    )

    report = generate_report(backend, since_days=7)
    assert "Total fallback events:** 3" in report
    assert "Chain-exhausted" in report
    assert "rate_limit" in report
    assert "hermes" in report
    assert "a1" in report
