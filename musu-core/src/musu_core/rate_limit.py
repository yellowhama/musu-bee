# musu-bee/musu-core/src/musu_core/rate_limit.py

import time
from collections import defaultdict, deque

class SlidingWindowLimiter:
    def __init__(self, capacity: int, window_seconds: int):
        self.capacity = capacity
        self.window_seconds = window_seconds
        self.clients = defaultdict(deque)

    def allow_request(self, client_id: str) -> bool:
        now = time.time()
        timestamps = self.clients[client_id]

        # Remove requests outside the current window
        while timestamps and timestamps[0] <= now - self.window_seconds:
            timestamps.popleft()

        if len(timestamps) < self.capacity:
            timestamps.append(now)
            return True
        else:
            return False

    def get_remaining_requests(self, client_id: str) -> int:
        now = time.time()
        timestamps = self.clients[client_id]

        # Ensure timestamps are up-to-date
        while timestamps and timestamps[0] <= now - self.window_seconds:
            timestamps.popleft()

        return self.capacity - len(timestamps)

    def get_reset_time(self, client_id: str) -> int:
        now = time.time()
        timestamps = self.clients[client_id]
        if not timestamps:
            return 0  # No requests yet, so no reset needed
        
        # The reset time is when the oldest request in the window will expire
        return max(0, int(self.window_seconds - (now - timestamps[0]) + 0.999))
