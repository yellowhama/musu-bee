"""Rate-limited workqueue with per-item dedup.

Combines two strategies (sample-controller pattern, wiki/345.1 §4):

- Per-item exponential backoff: 5ms -> 1000s, base 2, capped.
- Global token bucket: 50/s steady, burst 300.

On `add_rate_limited`, the actual delay is `max(per_item, global)` —
neither strategy alone is sufficient (per-item alone lets a thundering
herd burst; global alone lets one hot-failing key starve others).

Dedup invariants:
- Adding a request already in the pending queue is a no-op.
- Adding a request currently being reconciled is a no-op. The
  reconciler is expected to re-poll on its next pass.
- `done(req)` releases the in-flight slot.
- `forget(req)` resets the per-item backoff counter.
"""
from __future__ import annotations

import asyncio
import itertools
import time
from typing import Optional

from musu_core.controllers.reconciler import ReconcileRequest


_BASE_BACKOFF_S = 0.005  # 5 ms
_MAX_BACKOFF_S = 1000.0
_DEFAULT_TOKEN_RATE = 50.0  # tokens per second
_DEFAULT_TOKEN_CAPACITY = 300.0


class RateLimitedQueue:
    """async priority queue with dedup + rate limiting.

    Items are ordered by (priority, monotonic_seq) — lower priority value
    fires first. monotonic_seq breaks ties without comparing
    ReconcileRequest objects directly (frozen dataclasses without total
    order would otherwise crash PriorityQueue).
    """

    def __init__(
        self,
        token_rate: float = _DEFAULT_TOKEN_RATE,
        token_capacity: float = _DEFAULT_TOKEN_CAPACITY,
    ) -> None:
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._seq = itertools.count()
        # ReconcileRequest -> backoff exponent (number of failures seen)
        self._failures: dict[ReconcileRequest, int] = {}
        # ReconcileRequest -> True if currently queued or in-flight
        self._tracked: dict[ReconcileRequest, str] = {}  # "pending" | "in_flight"
        self._token_rate = token_rate
        self._token_capacity = token_capacity
        self._tokens: float = token_capacity
        self._tokens_updated = time.monotonic()
        # Serializes refill+decrement so multiple consumers can't race
        # and produce a negative `needed` that hot-spins the loop.
        self._token_lock = asyncio.Lock()
        self._shutdown = False
        # Sentinel pushed during shutdown to wake any blocked get().
        self._shutdown_event = asyncio.Event()

    # ----- public API -----

    def add(self, req: ReconcileRequest, priority: int = 0) -> bool:
        """Enqueue immediately. Returns True if enqueued, False if deduped.

        Dedup: if `req` is already pending or in-flight, no-op.
        """
        if self._shutdown:
            return False
        state = self._tracked.get(req)
        if state is not None:
            return False
        self._tracked[req] = "pending"
        self._queue.put_nowait((priority, next(self._seq), req))
        return True

    def add_rate_limited(self, req: ReconcileRequest, priority: int = 0) -> None:
        """Enqueue after backoff. Increments failure counter."""
        if self._shutdown:
            return
        exp = self._failures.get(req, 0)
        delay = self._backoff_for(exp)
        self._failures[req] = exp + 1
        # Schedule delayed enqueue on the running loop. Python 3.13+
        # deprecates get_event_loop() outside a running coroutine; this
        # call site is only reached from within the reconcile loop, so
        # get_running_loop is safe and warning-free.
        loop = asyncio.get_running_loop()
        loop.call_later(delay, self._safe_add, req, priority)

    def _safe_add(self, req: ReconcileRequest, priority: int) -> None:
        # call_later target — drop silently if shutdown happened
        # between scheduling and firing.
        if self._shutdown:
            return
        # dedup-friendly: if it was re-added by the meantime, no-op
        if self._tracked.get(req) is not None:
            return
        self._tracked[req] = "pending"
        self._queue.put_nowait((priority, next(self._seq), req))

    def forget(self, req: ReconcileRequest) -> None:
        """Clear per-item backoff counter."""
        self._failures.pop(req, None)

    async def get(self) -> Optional[ReconcileRequest]:
        """Pop next request. Consumes one global token.

        Returns None on shutdown. Shutdown is a hard stop: pending items
        in the queue are NOT drained — reconcilers re-pick up state on
        next ControllerManager.start() via the source's initial cursor.
        """
        # Shutdown check up front — don't pull from queue once stopped.
        if self._shutdown:
            return None
        # Wait for either a queue item or shutdown
        getter = asyncio.create_task(self._queue.get())
        shutdown_waiter = asyncio.create_task(self._shutdown_event.wait())
        done, pending = await asyncio.wait(
            {getter, shutdown_waiter},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
        # Shutdown wins ties: if both fire in the same wake, treat as
        # shutdown and let the pulled item (if any) get dropped.
        if shutdown_waiter in done:
            if getter in done:
                # We accidentally popped one — return it to the queue
                # would just be lost on shutdown anyway. Drop it.
                try:
                    _, _, req = getter.result()
                    # Best-effort: clear its tracked state so a future
                    # ControllerManager re-instance can re-enqueue.
                    self._tracked.pop(req, None)
                except Exception:
                    pass
            else:
                try:
                    await getter
                except (asyncio.CancelledError, Exception):
                    pass
            return None
        item = getter.result()
        await self._wait_for_token()
        _, _, req = item
        self._tracked[req] = "in_flight"
        return req

    def done(self, req: ReconcileRequest) -> None:
        """Release in-flight slot. Reconciler MUST call after each pass."""
        self._tracked.pop(req, None)

    def __len__(self) -> int:
        return self._queue.qsize()

    def shutdown(self) -> None:
        """Idempotent. Drains future adds, wakes blocked get() with None."""
        if self._shutdown:
            return
        self._shutdown = True
        self._shutdown_event.set()

    # ----- internals -----

    def _backoff_for(self, exp: int) -> float:
        return min(_BASE_BACKOFF_S * (2 ** exp), _MAX_BACKOFF_S)

    def _refill_tokens(self) -> None:
        now = time.monotonic()
        elapsed = now - self._tokens_updated
        self._tokens = min(
            self._token_capacity, self._tokens + elapsed * self._token_rate
        )
        self._tokens_updated = now

    async def _wait_for_token(self) -> None:
        while True:
            async with self._token_lock:
                self._refill_tokens()
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return
                # Compute wait outside the sleep so we hold the lock
                # only for the math, not the wait itself.
                needed = 1.0 - self._tokens
            wait_s = max(needed / self._token_rate, 1e-3)
            await asyncio.sleep(wait_s)
