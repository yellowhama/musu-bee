from collections import deque
import time
from typing import Dict


class SlidingWindowLimiter:
    def __init__(self, capacity: int, window_seconds: int):
        self.capacity = capacity
        self.window_seconds = window_seconds
        # Store (timestamp, count) for each client
        self.client_requests: Dict[str, deque[float]] = {}

    def allow_request(self, client_id: str) -> bool:
        now = time.time()
        # Clean up old requests
        self._cleanup_old_requests(client_id, now)

        if client_id not in self.client_requests:
            self.client_requests[client_id] = deque()

        if len(self.client_requests[client_id]) < self.capacity:
            self.client_requests[client_id].append(now)
            return True
        return False

    def get_remaining_requests(self, client_id: str) -> int:
        now = time.time()
        self._cleanup_old_requests(client_id, now)
        if client_id not in self.client_requests:
            return self.capacity
        return self.capacity - len(self.client_requests[client_id])

    def get_reset_time(self, client_id: str) -> int:
        now = time.time()
        self._cleanup_old_requests(client_id, now)
        if client_id not in self.client_requests or not self.client_requests[client_id]:
            return 0  # No requests made, so no reset needed immediately

        # The reset time is when the oldest request in the window expires
        oldest_request_time = self.client_requests[client_id][0]
        return int(oldest_request_time + self.window_seconds - now)

    def _cleanup_old_requests(self, client_id: str, now: float):
        if client_id in self.client_requests:
            while (
                self.client_requests[client_id]
                and self.client_requests[client_id][0] <= now - self.window_seconds
            ):
                self.client_requests[client_id].popleft()
