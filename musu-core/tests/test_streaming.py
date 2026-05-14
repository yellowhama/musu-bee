"""Adapter streaming — BaseAdapter.execute_streaming default + dispatcher wrapper.

Pins the behaviors in contracts/adapter-streaming.md:
  - default emits one terminal on_delta(summary)
  - callback exception is swallowed (FR-003)
  - empty-summary success emits zero deltas
  - failed result emits zero deltas
"""

from __future__ import annotations

import asyncio

import pytest

from musu_core.adapters.base import (
    AdapterContext,
    AdapterResult,
    BaseAdapter,
)


class _OkAdapter(BaseAdapter):
    """Minimal adapter returning a successful AdapterResult."""

    def __init__(self, summary: str = "hello world") -> None:
        self._summary = summary

    @property
    def adapter_type(self) -> str:
        return "test_ok"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        return AdapterResult(run_id=ctx.run_id, success=True, summary=self._summary)


class _FailAdapter(BaseAdapter):
    @property
    def adapter_type(self) -> str:
        return "test_fail"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        return AdapterResult(
            run_id=ctx.run_id, success=False, summary="", error="boom"
        )


def _ctx() -> AdapterContext:
    return AdapterContext(
        run_id="r1",
        prompt="hi",
        agent_id="a1",
        agent_name="tester",
        agent_role="tester",
        adapter_type="test",
    )


def _run(coro):
    return asyncio.run(coro)


def test_default_execute_streaming_emits_one_terminal_delta() -> None:
    """Legacy adapter (no override) emits exactly one delta == summary (FR-002)."""
    deltas: list[str] = []
    adapter = _OkAdapter(summary="hello world")

    async def run():
        result = await adapter.execute_streaming(_ctx(), lambda t: deltas.append(t))
        return result

    result = _run(run())
    assert result.success
    assert deltas == ["hello world"]


def test_callback_exception_is_swallowed() -> None:
    """A buggy on_delta MUST NOT break execute_streaming (FR-003)."""
    adapter = _OkAdapter()

    def bad_callback(_: str) -> None:
        raise RuntimeError("ui exploded")

    async def run():
        return await adapter.execute_streaming(_ctx(), bad_callback)

    result = _run(run())
    assert result.success  # adapter still finished cleanly
    assert result.summary == "hello world"


def test_empty_summary_success_emits_no_delta() -> None:
    """Edge case: success with empty summary → zero deltas (don't fire empty)."""
    deltas: list[str] = []
    adapter = _OkAdapter(summary="")

    async def run():
        return await adapter.execute_streaming(_ctx(), lambda t: deltas.append(t))

    result = _run(run())
    assert result.success
    assert deltas == []


def test_failed_result_emits_no_delta() -> None:
    """Failures shouldn't emit a message_delta; they emit a 'failed' event later."""
    deltas: list[str] = []
    adapter = _FailAdapter()

    async def run():
        return await adapter.execute_streaming(_ctx(), lambda t: deltas.append(t))

    result = _run(run())
    assert not result.success
    assert deltas == []


def test_override_can_emit_multiple_deltas() -> None:
    """Adapter that overrides execute_streaming emits per-chunk."""

    class StreamingAdapter(BaseAdapter):
        @property
        def adapter_type(self) -> str:
            return "test_stream"

        async def execute(self, ctx: AdapterContext) -> AdapterResult:
            return AdapterResult(run_id=ctx.run_id, success=True, summary="abcdef")

        async def execute_streaming(self, ctx, on_delta):
            for chunk in ("abc", "def"):
                on_delta(chunk)
            return AdapterResult(run_id=ctx.run_id, success=True, summary="abcdef")

    deltas: list[str] = []
    adapter = StreamingAdapter()

    async def run():
        return await adapter.execute_streaming(_ctx(), lambda t: deltas.append(t))

    result = _run(run())
    assert result.success
    assert deltas == ["abc", "def"]
