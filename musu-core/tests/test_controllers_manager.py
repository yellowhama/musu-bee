"""Tests for controllers.manager — Controller + ControllerManager."""
from __future__ import annotations

import asyncio
import time

import pytest

from musu_core.controllers.manager import Controller, ControllerManager
from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)
from musu_core.controllers.sources import ChannelSource
from musu_core.controllers.workqueue import RateLimitedQueue


class _Counter(Reconciler):
    def __init__(self):
        self.calls: list[ReconcileRequest] = []
        self.result_factory = lambda req: ReconcileResult()
        self.delay_s: float = 0.0

    async def reconcile(self, req):
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        self.calls.append(req)
        return self.result_factory(req)


def _ctrl(name: str, reconciler: Reconciler, source) -> Controller:
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    return Controller(name, reconciler, [source], q)


async def test_lifecycle_start_stop(backend):
    mgr = ControllerManager(backend)
    rec = _Counter()
    src = ChannelSource(
        lambda e: [ReconcileRequest(table="t", key=str(e))]
    )
    mgr.add(_ctrl("a", rec, src))
    await mgr.start()
    src.emit("x")
    await asyncio.sleep(0.1)
    await mgr.stop()
    assert any(r.key == "x" for r in rec.calls)


async def test_duplicate_name_rejected(backend):
    mgr = ControllerManager(backend)
    src = ChannelSource(lambda e: [])
    mgr.add(_ctrl("dup", _Counter(), src))
    with pytest.raises(ValueError):
        mgr.add(_ctrl("dup", _Counter(), ChannelSource(lambda e: [])))


async def test_reconciler_exception_recovered(backend):
    mgr = ControllerManager(backend)
    rec = _Counter()
    seen_after_exc = []

    def factory(req):
        if req.key not in seen_after_exc:
            seen_after_exc.append(req.key)
            raise RuntimeError("transient")
        return ReconcileResult()

    rec.result_factory = factory
    src = ChannelSource(
        lambda e: [ReconcileRequest(table="t", key=str(e))]
    )
    mgr.add(_ctrl("e", rec, src))
    await mgr.start()
    src.emit("k1")
    # Wait for retry: first call raises, requeue with 5ms backoff, second call succeeds
    await asyncio.sleep(0.5)
    await mgr.stop()
    keys = [c.key for c in rec.calls]
    assert keys.count("k1") >= 2, f"expected retry, got {keys}"


async def test_requeue_after_ms_triggers_delayed(backend):
    mgr = ControllerManager(backend)
    rec = _Counter()

    state = {"fired": 0}

    def factory(req):
        state["fired"] += 1
        if state["fired"] == 1:
            return ReconcileResult(requeue_after_ms=80)
        return ReconcileResult()

    rec.result_factory = factory
    src = ChannelSource(
        lambda e: [ReconcileRequest(table="t", key=str(e))]
    )
    mgr.add(_ctrl("r", rec, src))
    await mgr.start()
    src.emit("k")
    start = time.monotonic()
    deadline = start + 2.0
    while time.monotonic() < deadline and state["fired"] < 2:
        await asyncio.sleep(0.02)
    elapsed = time.monotonic() - start
    await mgr.stop()
    assert state["fired"] >= 2
    assert elapsed >= 0.06, (
        f"second call too fast ({elapsed*1000:.0f}ms) — delayed requeue likely broken"
    )


async def test_requeue_true_reenqueues_immediately(backend):
    mgr = ControllerManager(backend)
    rec = _Counter()
    state = {"fired": 0}

    def factory(req):
        state["fired"] += 1
        if state["fired"] < 3:
            return ReconcileResult(requeue=True)
        return ReconcileResult()

    rec.result_factory = factory
    src = ChannelSource(
        lambda e: [ReconcileRequest(table="t", key=str(e))]
    )
    mgr.add(_ctrl("rr", rec, src))
    await mgr.start()
    src.emit("k")
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline and state["fired"] < 3:
        await asyncio.sleep(0.02)
    await mgr.stop()
    assert state["fired"] == 3


async def test_stop_cancels_running_tasks(backend):
    mgr = ControllerManager(backend)
    rec = _Counter()
    rec.delay_s = 5.0  # long-running reconcile
    src = ChannelSource(
        lambda e: [ReconcileRequest(table="t", key=str(e))]
    )
    mgr.add(_ctrl("s", rec, src))
    await mgr.start()
    src.emit("k")
    await asyncio.sleep(0.05)
    start = time.monotonic()
    await mgr.stop(timeout=2.0)
    elapsed = time.monotonic() - start
    assert elapsed < 3.0, "stop should not block for full reconcile delay"
