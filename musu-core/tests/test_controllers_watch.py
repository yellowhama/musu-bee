"""Tests for controllers.watch — WatchDispatcher in-proc notify."""
from __future__ import annotations

import asyncio

import pytest

from musu_core.controllers.watch import (
    WatchDispatcher,
    WatchEvent,
    WatchSubscription,
)


async def test_notify_and_subscribe_roundtrip():
    d = WatchDispatcher()
    sub = d.subscribe("agents")
    d.notify("agents", "a1", "create")
    event = await asyncio.wait_for(sub.__anext__(), timeout=1.0)
    assert event.table == "agents"
    assert event.key == "a1"
    assert event.op == "create"
    d.close()


async def test_multiple_subscribers_fan_out():
    d = WatchDispatcher()
    s1 = d.subscribe("agents")
    s2 = d.subscribe("agents")
    d.notify("agents", "a1")
    e1 = await asyncio.wait_for(s1.__anext__(), timeout=1.0)
    e2 = await asyncio.wait_for(s2.__anext__(), timeout=1.0)
    assert e1.key == e2.key == "a1"
    d.close()


async def test_filter_fn_drops_non_matching():
    d = WatchDispatcher()
    sub = d.subscribe(
        "agents",
        filter_fn=lambda e: e.op == "create",
    )
    d.notify("agents", "a1", "update")  # filtered out
    d.notify("agents", "a2", "create")  # passes
    event = await asyncio.wait_for(sub.__anext__(), timeout=1.0)
    assert event.key == "a2"
    d.close()


async def test_subscriber_isolated_per_table():
    d = WatchDispatcher()
    agents_sub = d.subscribe("agents")
    machines_sub = d.subscribe("machines")
    d.notify("agents", "a1")
    e = await asyncio.wait_for(agents_sub.__anext__(), timeout=1.0)
    assert e.table == "agents"
    # machines_sub should NOT receive — drain with a tight timeout
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(machines_sub.__anext__(), timeout=0.1)
    d.close()


async def test_unsubscribe_stops_delivery():
    d = WatchDispatcher()
    sub = d.subscribe("agents")
    sub.unsubscribe()
    d.notify("agents", "a1")
    # Iteration must end without yielding the post-unsubscribe event
    with pytest.raises((StopAsyncIteration, asyncio.TimeoutError)):
        await asyncio.wait_for(sub.__anext__(), timeout=0.2)
    d.close()


async def test_unknown_table_rejected():
    d = WatchDispatcher()
    with pytest.raises(ValueError):
        d.subscribe("nonexistent_table")
    d.close()


async def test_slow_subscriber_drops_oldest():
    d = WatchDispatcher()
    sub = d.subscribe("agents", maxsize=3)
    # 5 events into a maxsize-3 queue
    for i in range(5):
        d.notify("agents", f"a{i}")
    # Latest 3 should remain; oldest 2 dropped
    seen = []
    for _ in range(3):
        e = await asyncio.wait_for(sub.__anext__(), timeout=1.0)
        seen.append(e.key)
    assert seen == ["a2", "a3", "a4"]
    assert sub.dropped_count == 2
    d.close()


async def test_close_ends_iteration():
    d = WatchDispatcher()
    sub = d.subscribe("agents")
    d.notify("agents", "a1")
    # Consume the event
    e = await asyncio.wait_for(sub.__anext__(), timeout=1.0)
    assert e.key == "a1"
    # Close and verify next call ends iteration
    d.close()
    with pytest.raises(StopAsyncIteration):
        await asyncio.wait_for(sub.__anext__(), timeout=1.0)


async def test_watch_event_is_frozen_dataclass():
    e = WatchEvent(table="t", key="k", op="update", ts=1.0)
    with pytest.raises(Exception):
        e.table = "other"  # type: ignore[misc]


async def test_subscriber_count():
    d = WatchDispatcher()
    assert d.subscriber_count() == 0
    s1 = d.subscribe("agents")
    s2 = d.subscribe("agents")
    s3 = d.subscribe("machines")
    assert d.subscriber_count() == 3
    assert d.subscriber_count("agents") == 2
    assert d.subscriber_count("machines") == 1
    s1.unsubscribe()
    assert d.subscriber_count() == 2
    d.close()


async def test_notify_after_close_is_noop():
    d = WatchDispatcher()
    sub = d.subscribe("agents")
    d.close()
    d.notify("agents", "a1")  # must not raise


async def test_subscribe_after_close_raises():
    d = WatchDispatcher()
    d.close()
    with pytest.raises(RuntimeError):
        d.subscribe("agents")
