"""WebSocket flooding defense for musu-bridge.

Per-connection rate limiter: if a single connection sends more than
MUSU_BRIDGE_WS_MAX_MSGS messages within MUSU_BRIDGE_WS_WINDOW_SECS seconds,
that connection is dropped with a close code 1008 (policy violation).

Usage — wrap a WebSocket handler:

    from ws_guard import ws_rate_limit

    @router.websocket("/chat/ws/{channel}")
    async def handle_chat_ws(ws: WebSocket, channel: str):
        async with ws_rate_limit(ws):
            # normal handler logic — call ws_guard.tick() per message
            ...

Or call directly inside a message loop:

    guard = WsRateLimiter()
    while True:
        msg = await ws.receive_text()
        guard.tick()   # raises WsFloodError on violation
        ...
"""
from __future__ import annotations

import asyncio
import collections
import contextlib
import os
import time

from fastapi import WebSocket, WebSocketDisconnect


class WsFloodError(Exception):
    """Raised when a WebSocket connection exceeds the rate limit."""


class WsRateLimiter:
    """Sliding-window per-connection rate limiter."""

    def __init__(
        self,
        max_msgs: int | None = None,
        window_secs: float | None = None,
    ) -> None:
        self._max_msgs = max_msgs or int(
            os.environ.get("MUSU_BRIDGE_WS_MAX_MSGS", "60")
        )
        self._window = window_secs or float(
            os.environ.get("MUSU_BRIDGE_WS_WINDOW_SECS", "10")
        )
        self._timestamps: collections.deque[float] = collections.deque()

    def tick(self) -> None:
        """Record one message. Raises WsFloodError if the rate limit is exceeded."""
        now = time.monotonic()
        cutoff = now - self._window

        # Evict timestamps outside the window
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()

        if len(self._timestamps) >= self._max_msgs:
            raise WsFloodError(
                f"Rate limit: {self._max_msgs} msgs / {self._window}s exceeded"
            )

        self._timestamps.append(now)


@contextlib.asynccontextmanager
async def ws_rate_limit(ws: WebSocket, **kwargs):
    """Context manager that closes the WebSocket on flood detection."""
    guard = WsRateLimiter(**kwargs)
    try:
        yield guard
    except WsFloodError as exc:
        import logging
        logging.getLogger(__name__).warning(
            "ws_guard: closing flooded connection — %s", exc
        )
        with contextlib.suppress(Exception):
            await ws.close(code=1008, reason="Rate limit exceeded")
    except WebSocketDisconnect:
        pass
