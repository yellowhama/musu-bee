"""Unit tests for ErrorCode enum, AdapterResult.error_code, and fallback trigger conditions."""
from __future__ import annotations

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from musu_core.adapters.base import (
    AdapterContext,
    AdapterResult,
    ErrorCode,
    RETRIABLE_ERROR_CODES,
)
from musu_core.adapters.claude_local import ClaudeLocalAdapter
from musu_core.adapters.process import ProcessAdapter


def run(coro):
    """Run a coroutine synchronously (matches pattern in test_adapters.py)."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_ctx(**kwargs) -> AdapterContext:
    defaults = dict(
        run_id=str(uuid.uuid4()),
        prompt="hello",
        agent_id="agent-1",
        agent_name="test-agent",
        agent_role="assistant",
        adapter_type="claude_local",
    )
    defaults.update(kwargs)
    return AdapterContext(**defaults)


def stream_json_result(summary: str = "ok", session_id: str = "sess-1") -> str:
    return json.dumps({
        "type": "result",
        "session_id": session_id,
        "result": summary,
        "usage": {"input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 0},
        "total_cost_usd": 0.001,
    })


# ---------------------------------------------------------------------------
# ErrorCode enum basics
# ---------------------------------------------------------------------------


def test_error_code_values():
    assert ErrorCode.RATE_LIMIT == "rate_limit"
    assert ErrorCode.TIMEOUT == "timeout"
    assert ErrorCode.CONTEXT_EXCEEDED == "context_exceeded"
    assert ErrorCode.MODEL_UNAVAILABLE == "model_unavailable"
    assert ErrorCode.UNKNOWN == "unknown"


def test_retriable_error_codes_contains_expected():
    assert ErrorCode.RATE_LIMIT in RETRIABLE_ERROR_CODES
    assert ErrorCode.TIMEOUT in RETRIABLE_ERROR_CODES
    assert ErrorCode.MODEL_UNAVAILABLE in RETRIABLE_ERROR_CODES
    assert ErrorCode.UNKNOWN in RETRIABLE_ERROR_CODES


def test_context_exceeded_is_not_retriable():
    assert ErrorCode.CONTEXT_EXCEEDED not in RETRIABLE_ERROR_CODES


def test_adapter_result_error_code_defaults_none():
    r = AdapterResult(run_id="x", success=True, summary="ok")
    assert r.error_code is None


def test_adapter_result_error_code_set():
    r = AdapterResult(run_id="x", success=False, summary="", error_code=ErrorCode.TIMEOUT)
    assert r.error_code == ErrorCode.TIMEOUT


# ---------------------------------------------------------------------------
# ClaudeLocalAdapter — error_code detection
# ---------------------------------------------------------------------------


def _make_proc(returncode: int, stdout: bytes = b"", stderr: bytes = b""):
    proc = MagicMock()
    proc.returncode = returncode
    proc.kill = MagicMock()

    # stdin must support write(), drain() (awaitable), close()
    stdin_mock = MagicMock()
    stdin_mock.write = MagicMock()
    stdin_mock.close = MagicMock()

    async def _drain():
        pass

    stdin_mock.drain = _drain
    proc.stdin = stdin_mock

    # stdout/stderr must support async read() that returns b"" to signal EOF
    stdout_mock = MagicMock()
    _stdout_iter = iter([stdout, b""])

    async def _read_stdout(n):
        return next(_stdout_iter, b"")

    stdout_mock.read = _read_stdout
    proc.stdout = stdout_mock

    stderr_mock = MagicMock()
    _stderr_iter = iter([stderr, b""])

    async def _read_stderr(n):
        return next(_stderr_iter, b"")

    stderr_mock.read = _read_stderr
    proc.stderr = stderr_mock

    async def _wait():
        pass

    proc.wait = _wait
    return proc


def _make_proc_process(returncode: int, stdout: bytes = b"", stderr: bytes = b""):
    """Build a subprocess mock for ProcessAdapter (uses proc.communicate())."""
    proc = MagicMock()
    proc.returncode = returncode
    proc.kill = MagicMock()
    proc.communicate = AsyncMock(return_value=(stdout, stderr))
    return proc


def _make_wait_for(proc):
    """Return a fake asyncio.wait_for that awaits the coroutine directly (no timeout)."""
    async def fake_wait_for(coro, timeout):
        return await coro
    return fake_wait_for


def test_claude_local_success_has_no_error_code():
    ctx = make_ctx()
    stdout = stream_json_result("done").encode()
    proc = _make_proc(0, stdout)
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        with patch("asyncio.wait_for", side_effect=_make_wait_for(proc)):
            result = run(ClaudeLocalAdapter().execute(ctx))
    assert result.success
    assert result.error_code is None


def test_claude_local_timeout_sets_error_code():
    ctx = make_ctx(config={"timeout_sec": 1})

    async def fake_wait_for(coro, timeout):
        raise asyncio.TimeoutError

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_make_proc(0))):
        with patch("asyncio.wait_for", side_effect=fake_wait_for):
            result = run(ClaudeLocalAdapter().execute(ctx))

    assert not result.success
    assert result.error_code == ErrorCode.TIMEOUT
    assert result.is_retriable is True


def test_claude_local_rate_limit_sets_error_code():
    ctx = make_ctx()
    proc = _make_proc(1, b"", b"Error: rate limit exceeded (429)")
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        with patch("asyncio.wait_for", side_effect=_make_wait_for(proc)):
            result = run(ClaudeLocalAdapter().execute(ctx))
    assert not result.success
    assert result.error_code == ErrorCode.RATE_LIMIT
    assert result.is_retriable is True


def test_claude_local_context_exceeded_sets_error_code():
    ctx = make_ctx()
    proc = _make_proc(1, b"", b"Error: context window exceeded, input too long")
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        with patch("asyncio.wait_for", side_effect=_make_wait_for(proc)):
            result = run(ClaudeLocalAdapter().execute(ctx))
    assert not result.success
    assert result.error_code == ErrorCode.CONTEXT_EXCEEDED
    assert result.is_retriable is False


def test_claude_local_model_unavailable_sets_error_code():
    ctx = make_ctx()
    proc = _make_proc(1, b"", b"connection refused: model not available")
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        with patch("asyncio.wait_for", side_effect=_make_wait_for(proc)):
            result = run(ClaudeLocalAdapter().execute(ctx))
    assert not result.success
    assert result.error_code == ErrorCode.MODEL_UNAVAILABLE
    assert result.is_retriable is True


def test_claude_local_unknown_error_sets_error_code():
    ctx = make_ctx()
    proc = _make_proc(1, b"", b"some unexpected error")
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        with patch("asyncio.wait_for", side_effect=_make_wait_for(proc)):
            result = run(ClaudeLocalAdapter().execute(ctx))
    assert not result.success
    assert result.error_code == ErrorCode.UNKNOWN
    assert result.is_retriable is False


# ---------------------------------------------------------------------------
# ProcessAdapter — error_code detection
# ---------------------------------------------------------------------------


def test_process_timeout_sets_error_code():
    ctx = make_ctx(adapter_type="process", config={"command": "sleep", "timeout_sec": 1})

    async def fake_wait_for(coro, timeout):
        raise asyncio.TimeoutError

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_make_proc_process(0))):
        with patch("asyncio.wait_for", side_effect=fake_wait_for):
            result = run(ProcessAdapter().execute(ctx))

    assert not result.success
    assert result.error_code == ErrorCode.TIMEOUT
    assert result.is_retriable is True


def test_process_rate_limit_sets_error_code():
    ctx = make_ctx(adapter_type="process", config={"command": "echo"})
    proc = _make_proc_process(1, b"", b"rate limit exceeded 429")
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        result = run(ProcessAdapter().execute(ctx))
    assert not result.success
    assert result.error_code == ErrorCode.RATE_LIMIT
    assert result.is_retriable is True


def test_process_context_exceeded_sets_error_code():
    ctx = make_ctx(adapter_type="process", config={"command": "echo"})
    proc = _make_proc_process(1, b"", b"context_length limit exceeded")
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        result = run(ProcessAdapter().execute(ctx))
    assert not result.success
    assert result.error_code == ErrorCode.CONTEXT_EXCEEDED
    assert result.is_retriable is False


def test_process_unknown_error_sets_error_code():
    ctx = make_ctx(adapter_type="process", config={"command": "echo"})
    proc = _make_proc_process(1, b"", b"some random failure")
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        result = run(ProcessAdapter().execute(ctx))
    assert not result.success
    assert result.error_code == ErrorCode.UNKNOWN


def test_process_success_has_no_error_code():
    ctx = make_ctx(adapter_type="process", config={"command": "echo"})
    proc = _make_proc_process(0, b"hello", b"")
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
        result = run(ProcessAdapter().execute(ctx))
    assert result.success
    assert result.error_code is None


# ---------------------------------------------------------------------------
# Fallback trigger conditions
# ---------------------------------------------------------------------------


def test_retriable_codes_trigger_fallback():
    """All retriable error codes should satisfy the fallback condition."""
    for code in RETRIABLE_ERROR_CODES:
        result = AdapterResult(
            run_id="x", success=False, summary="", error_code=code, is_retriable=True
        )
        should_fallback = (
            not result.success
            and (
                (result.error_code is not None and result.error_code in RETRIABLE_ERROR_CODES)
                or (result.error_code is None and result.is_retriable)
            )
        )
        assert should_fallback, f"Expected fallback for error_code={code}"


def test_context_exceeded_does_not_trigger_fallback():
    result = AdapterResult(
        run_id="x", success=False, summary="", error_code=ErrorCode.CONTEXT_EXCEEDED, is_retriable=False
    )
    should_fallback = (
        not result.success
        and (
            (result.error_code is not None and result.error_code in RETRIABLE_ERROR_CODES)
            or (result.error_code is None and result.is_retriable)
        )
    )
    assert not should_fallback


def test_no_error_code_falls_back_to_is_retriable_flag():
    # Old adapters that don't set error_code but set is_retriable=True should still fallback
    result = AdapterResult(
        run_id="x", success=False, summary="", error_code=None, is_retriable=True
    )
    should_fallback = (
        not result.success
        and (
            (result.error_code is not None and result.error_code in RETRIABLE_ERROR_CODES)
            or (result.error_code is None and result.is_retriable)
        )
    )
    assert should_fallback


def test_no_error_code_no_retriable_flag_does_not_fallback():
    result = AdapterResult(
        run_id="x", success=False, summary="", error_code=None, is_retriable=False
    )
    should_fallback = (
        not result.success
        and (
            (result.error_code is not None and result.error_code in RETRIABLE_ERROR_CODES)
            or (result.error_code is None and result.is_retriable)
        )
    )
    assert not should_fallback


def test_success_result_never_triggers_fallback():
    result = AdapterResult(
        run_id="x", success=True, summary="done", error_code=None, is_retriable=False
    )
    should_fallback = (
        not result.success
        and (
            (result.error_code is not None and result.error_code in RETRIABLE_ERROR_CODES)
            or (result.error_code is None and result.is_retriable)
        )
    )
    assert not should_fallback
