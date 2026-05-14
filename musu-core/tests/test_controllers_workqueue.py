"""Tests for controllers.workqueue — rate limiting + dedup."""
from __future__ import annotations

import asyncio
import time

import pytest

from musu_core.controllers.reconciler import ReconcileRequest
from musu_core.controllers.workqueue import RateLimitedQueue


def _req(key: str = "k1") -> ReconcileRequest:
    return ReconcileRequest(table="agents", key=key)


async def test_add_and_get_roundtrip():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    req = _req()
    assert q.add(req) is True
    got = await q.get()
    assert got == req
    q.done(req)


async def test_dedup_pending():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    req = _req()
    assert q.add(req) is True
    assert q.add(req) is False  # dedup
    assert len(q) == 1


async def test_dedup_in_flight():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    req = _req()
    q.add(req)
    got = await q.get()
    assert got == req
    # While in-flight, add should dedup
    assert q.add(req) is False
    q.done(req)
    # After done, can re-enqueue
    assert q.add(req) is True


async def test_done_releases_dedup():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    req = _req()
    q.add(req)
    await q.get()
    q.done(req)
    assert q.add(req) is True


async def test_forget_resets_backoff():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    req = _req()
    q.add(req)
    await q.get()
    q.done(req)
    q.add_rate_limited(req)  # bump exponent
    q.forget(req)
    # Internal state check: failures should be cleared
    assert req not in q._failures


async def test_rate_limited_retry_uses_backoff():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    req = _req()
    q.add(req)
    await q.get()
    q.done(req)
    # First rate-limited add: 5ms backoff
    start = time.monotonic()
    q.add_rate_limited(req)
    got = await asyncio.wait_for(q.get(), timeout=2.0)
    elapsed = time.monotonic() - start
    assert got == req
    # Allow generous bound — Windows timer resolution etc.
    assert 0.001 <= elapsed <= 0.5, f"first backoff was {elapsed*1000:.0f}ms"


async def test_priority_order():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    a = _req("a")
    b = _req("b")
    q.add(a, priority=10)
    q.add(b, priority=0)
    # Lower priority value fires first
    first = await q.get()
    assert first == b
    q.done(b)
    second = await q.get()
    assert second == a
    q.done(a)


async def test_shutdown_wakes_blocked_get():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)

    async def reader():
        return await q.get()

    task = asyncio.create_task(reader())
    await asyncio.sleep(0.05)
    q.shutdown()
    result = await asyncio.wait_for(task, timeout=2.0)
    assert result is None


async def test_shutdown_idempotent():
    q = RateLimitedQueue()
    q.shutdown()
    q.shutdown()  # no error
    assert q.add(_req()) is False  # add after shutdown is no-op


async def test_token_bucket_throttles_burst():
    # Tight rate forces throttling
    q = RateLimitedQueue(token_rate=10.0, token_capacity=2.0)
    for i in range(5):
        q.add(_req(f"k{i}"), priority=0)
    start = time.monotonic()
    for i in range(5):
        got = await asyncio.wait_for(q.get(), timeout=2.0)
        q.done(got)
    elapsed = time.monotonic() - start
    # After consuming the 2-token burst, the next 3 require waiting
    # 1/10s each = 0.3s minimum.
    assert elapsed >= 0.2, f"throttling didn't engage (elapsed={elapsed:.2f}s)"


async def test_len_reflects_queue_size():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    assert len(q) == 0
    q.add(_req("a"))
    q.add(_req("b"))
    assert len(q) == 2


async def test_get_after_shutdown_returns_none():
    """Shutdown is a clean stop: pending items are dropped, get -> None.

    Contract: after shutdown(), the queue is closed for consumption.
    Reconcilers re-pick up state on next ControllerManager.start() via
    the source's initial cursor — there's no need for the queue to
    "drain on shutdown".
    """
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    q.add(_req())
    q.shutdown()
    result = await asyncio.wait_for(q.get(), timeout=1.0)
    assert result is None


async def test_concurrent_get_from_two_consumers():
    q = RateLimitedQueue(token_rate=10_000, token_capacity=1000)
    q.add(_req("a"))
    q.add(_req("b"))

    async def consume():
        r = await q.get()
        q.done(r)
        return r

    a, b = await asyncio.gather(consume(), consume())
    keys = sorted([a.key, b.key])
    assert keys == ["a", "b"]
