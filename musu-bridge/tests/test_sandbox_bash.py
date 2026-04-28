"""Unit tests for sandbox_bash module (musu-bridge/sandbox_bash.py)."""
from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from sandbox_bash import _is_blocked, execute_bash


# ---------------------------------------------------------------------------
# _is_blocked tests
# ---------------------------------------------------------------------------


def test_blocked_rm_rf():
    """rm -rf / must be blocked."""
    result = _is_blocked("rm -rf /")
    assert result is not None


def test_blocked_shutdown():
    """shutdown now must be blocked."""
    result = _is_blocked("shutdown now")
    assert result is not None


def test_blocked_fork_bomb():
    """Fork bomb must be blocked."""
    result = _is_blocked(":(){ :|:&};:")
    assert result is not None


def test_allowed_ls():
    """ls -la must not be blocked."""
    result = _is_blocked("ls -la")
    assert result is None


def test_allowed_git():
    """git status must not be blocked."""
    result = _is_blocked("git status")
    assert result is None


# ---------------------------------------------------------------------------
# execute_bash tests (async)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_echo():
    """echo hello should succeed with exit_code=0."""
    result = await execute_bash("echo hello")
    assert result["exit_code"] == 0
    assert "hello" in result["stdout"]


@pytest.mark.asyncio
async def test_execute_blocked():
    """Blocked command returns error dict."""
    result = await execute_bash("rm -rf /")
    assert "error" in result
    assert "blocked" in result["error"].lower() or "safety" in result["error"].lower()


@pytest.mark.asyncio
async def test_timeout_enforcement():
    """Command exceeding timeout returns timeout error."""
    result = await execute_bash("sleep 10", timeout=1)
    assert "error" in result
    assert "timed out" in result["error"].lower() or "timeout" in result["error"].lower()
