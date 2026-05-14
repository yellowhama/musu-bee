"""WatchDispatcher — cross-machine + in-process change notification.

Three signal sources, one dispatch:

1. **In-process**: code that writes SQLite locally calls
   `notify(table, key, op)`. Subscribers' asyncio.Queue receives the
   event with microsecond latency.

2. **Polling (KindSource)**: existing in `sources.py`. The dispatcher
   does NOT replace polling — it augments it for low-latency local
   signal. Polling remains the source of truth for cross-machine
   eventual consistency.

3. **Webhook ingestion**: external bridges POST `/watch/notify` into
   the local musu-bridge endpoint (wired in 21.B T4). The endpoint
   calls `dispatcher.notify(...)` — same code path as in-process.

Subscribers iterate via async for:

    sub = dispatcher.subscribe("agents")
    async for event in sub:
        ...   # event.table, event.key, event.op, event.ts

The dispatcher does NOT itself fetch row data — it only signals that
something changed for `(table, key)`. Subscribers' reconcilers read
the row from SQLite. This keeps the dispatcher payload-free (no
serialization, no version drift, no cross-process dataclass shape
contracts).

Bounded delivery: each subscription has a bounded asyncio.Queue
(default 1000). Overflow drops oldest events and logs a warning, so
a slow subscriber slows only itself.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Callable, Literal, Optional

from musu_core.controllers.sources import _ALLOWED_TABLES

logger = logging.getLogger(__name__)


WatchOp = Literal["create", "update", "delete"]


@dataclass(frozen=True)
class WatchEvent:
    table: str
    key: str
    op: WatchOp
    ts: float  # monotonic, set at notify()


class WatchSubscription:
    """One subscriber's view of the dispatcher.

    Async-iterable. Calling `unsubscribe()` (or breaking the loop and
    letting the dispatcher tear down) ends iteration.
    """

    def __init__(
        self,
        dispatcher: "WatchDispatcher",
        table: str,
        filter_fn: Optional[Callable[[WatchEvent], bool]] = None,
        maxsize: int = 1000,
    ) -> None:
        self._dispatcher = dispatcher
        self.table = table
        self._filter_fn = filter_fn
        self._queue: asyncio.Queue[WatchEvent] = asyncio.Queue(maxsize=maxsize)
        self._closed = False
        self._dropped = 0

    def _push(self, event: WatchEvent) -> None:
        if self._closed:
            return
        if self._filter_fn is not None and not self._filter_fn(event):
            return
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            # Drop oldest, push new. Bounded delivery contract: slow
            # subscriber slows only itself.
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self._queue.put_nowait(event)
            self._dropped += 1
            if self._dropped == 1 or self._dropped % 100 == 0:
                logger.warning(
                    "WatchSubscription[%s] dropped %d events (slow consumer)",
                    self.table, self._dropped,
                )

    def __aiter__(self) -> "WatchSubscription":
        return self

    async def __anext__(self) -> WatchEvent:
        if self._closed and self._queue.empty():
            raise StopAsyncIteration
        # Wait for next event OR for close
        get_task = asyncio.create_task(self._queue.get())
        close_task = asyncio.create_task(self._dispatcher._closed_event.wait())
        done, pending = await asyncio.wait(
            {get_task, close_task}, return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
        if get_task in done:
            return get_task.result()
        # close fired
        if not self._queue.empty():
            try:
                return self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        self._closed = True
        raise StopAsyncIteration

    def unsubscribe(self) -> None:
        self._closed = True
        self._dispatcher._remove_subscriber(self)

    @property
    def dropped_count(self) -> int:
        return self._dropped


class WatchDispatcher:
    """Fan-out notify -> matching subscribers.

    Thread-safety: `notify()` is callable from any thread (uses
    `call_soon_threadsafe` to enqueue into subscriber queues on the
    dispatcher's loop). `subscribe()` and `unsubscribe()` are async-
    loop-only.
    """

    def __init__(self) -> None:
        # table -> list[WatchSubscription]
        self._subs: dict[str, list[WatchSubscription]] = {}
        self._closed_event = asyncio.Event()
        self._closed = False
        # Capture the loop subscriptions were created on for
        # cross-thread notify routing.
        try:
            self._loop: Optional[asyncio.AbstractEventLoop] = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

    def subscribe(
        self,
        table: str,
        filter_fn: Optional[Callable[[WatchEvent], bool]] = None,
        maxsize: int = 1000,
    ) -> WatchSubscription:
        if table not in _ALLOWED_TABLES:
            raise ValueError(
                f"WatchDispatcher: table {table!r} not in allowlist"
            )
        if self._closed:
            raise RuntimeError("WatchDispatcher is closed")
        if self._loop is None:
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
        sub = WatchSubscription(self, table, filter_fn, maxsize)
        self._subs.setdefault(table, []).append(sub)
        return sub

    def notify(
        self, table: str, key: str, op: WatchOp = "update"
    ) -> None:
        """Fan-out a change signal. Returns immediately. Safe from
        sync code (in-process callers) and from non-async threads
        (cross-thread callers).
        """
        if self._closed:
            return
        event = WatchEvent(table=table, key=str(key), op=op, ts=time.monotonic())
        subs = list(self._subs.get(table, ()))
        if not subs:
            return
        # If we're not in the dispatcher loop, schedule the push via
        # call_soon_threadsafe so subscriber queues are touched on
        # their owning loop.
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self._loop or self._loop is None:
            for sub in subs:
                sub._push(event)
        else:
            for sub in subs:
                self._loop.call_soon_threadsafe(sub._push, event)

    def _remove_subscriber(self, sub: WatchSubscription) -> None:
        bucket = self._subs.get(sub.table, [])
        if sub in bucket:
            bucket.remove(sub)
            if not bucket:
                self._subs.pop(sub.table, None)

    def close(self) -> None:
        """Tear down all subscriptions. Idempotent."""
        if self._closed:
            return
        self._closed = True
        self._closed_event.set()
        for bucket in self._subs.values():
            for sub in bucket:
                sub._closed = True
        self._subs.clear()

    def subscriber_count(self, table: Optional[str] = None) -> int:
        if table is None:
            return sum(len(v) for v in self._subs.values())
        return len(self._subs.get(table, ()))
