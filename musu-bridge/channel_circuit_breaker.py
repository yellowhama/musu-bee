"""Per-channel circuit breaker for musu-bridge.

Extracted from server.py. Tracks failures per channel with sliding window
and time-based blocking.
"""
from __future__ import annotations

import os

# ── Heartbeat circuit breaker constants ──────────────────────────────────────
CIRCUIT_TRIP_THRESHOLD = 3
CIRCUIT_BACKOFF_BASE_SECONDS = 60
CIRCUIT_WINDOW_MINUTES = 10


class _ChannelCircuitBreaker:
    """Per-channel circuit breaker (in-memory, sliding window).

    Opens after fail_threshold failures within window_sec seconds.
    Once open, stays open for block_sec seconds regardless of window,
    then automatically resets (time-based, no half-open state).
    """

    def __init__(self, fail_threshold: int = 3, window_sec: int = 60, block_sec: int = 30) -> None:
        from collections import defaultdict, deque
        self._fail_threshold = fail_threshold
        self._window_sec = window_sec
        self._block_sec = block_sec
        self._failures: dict[str, deque] = defaultdict(deque)
        self._tripped_at: dict[str, float] = {}

    def _prune(self, channel: str) -> None:
        import time
        cutoff = time.time() - self._window_sec
        dq = self._failures[channel]
        while dq and dq[0] < cutoff:
            dq.popleft()

    def record_failure(self, channel: str) -> None:
        import time
        self._prune(channel)
        self._failures[channel].append(time.time())
        if len(self._failures[channel]) >= self._fail_threshold and channel not in self._tripped_at:
            self._tripped_at[channel] = time.time()

    def is_open(self, channel: str) -> bool:
        import time
        now = time.time()
        tripped = self._tripped_at.get(channel)
        if tripped is not None:
            if now - tripped >= self._block_sec:
                self._tripped_at.pop(channel, None)
                self._failures[channel].clear()
                return False
            return True
        self._prune(channel)
        return len(self._failures[channel]) >= self._fail_threshold

    def state(self, channel: str) -> dict:
        import time
        open_ = self.is_open(channel)
        count = len(self._failures.get(channel, []))
        result: dict = {
            "state": "open" if open_ else "closed",
            "fail_count": count,
            "threshold": self._fail_threshold,
            "window_sec": self._window_sec,
            "block_sec": self._block_sec,
        }
        tripped = self._tripped_at.get(channel)
        if tripped:
            result["block_remaining_sec"] = max(0.0, round(self._block_sec - (time.time() - tripped), 1))
        return result


# ── Default instance ─────────────────────────────────────────────────────────
_CB_FAIL_THRESHOLD = int(os.environ.get("MUSU_CB_FAIL_THRESHOLD", "3"))
_CB_FAIL_WINDOW_SEC = int(os.environ.get("MUSU_CB_FAIL_WINDOW_SEC", "60"))
_CB_BLOCK_SEC = int(os.environ.get("MUSU_CB_BLOCK_SEC", "60"))

_channel_cb = _ChannelCircuitBreaker(
    fail_threshold=_CB_FAIL_THRESHOLD,
    window_sec=_CB_FAIL_WINDOW_SEC,
    block_sec=_CB_BLOCK_SEC,
)
