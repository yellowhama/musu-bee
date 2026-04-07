# musu-bee/musu-core/tests/test_rate_limit.py

import time
import pytest
from musu_core.rate_limit import SlidingWindowLimiter

def test_sliding_window_limiter_basic():
    limiter = SlidingWindowLimiter(capacity=3, window_seconds=1)
    client_id = "test_client_1"

    # First 3 requests should be allowed
    assert limiter.allow_request(client_id)
    assert limiter.allow_request(client_id)
    assert limiter.allow_request(client_id)
    assert limiter.get_remaining_requests(client_id) == 0
    assert limiter.get_reset_time(client_id) > 0

    # 4th request should be denied
    assert not limiter.allow_request(client_id)
    assert limiter.get_remaining_requests(client_id) == 0

    # After window passes, new requests should be allowed
    time.sleep(1.1)
    assert limiter.allow_request(client_id)
    assert limiter.get_remaining_requests(client_id) == 2

def test_sliding_window_limiter_multiple_clients():
    limiter = SlidingWindowLimiter(capacity=2, window_seconds=1)
    client_id_1 = "test_client_1"
    client_id_2 = "test_client_2"

    assert limiter.allow_request(client_id_1)
    assert limiter.allow_request(client_id_2)
    assert limiter.get_remaining_requests(client_id_1) == 1
    assert limiter.get_remaining_requests(client_id_2) == 1

    assert limiter.allow_request(client_id_1)
    assert not limiter.allow_request(client_id_1) # client 1 is now limited

    assert limiter.allow_request(client_id_2)
    assert not limiter.allow_request(client_id_2) # client 2 is now limited

    time.sleep(1.1)
    assert limiter.allow_request(client_id_1)
    assert limiter.allow_request(client_id_2)

def test_sliding_window_limiter_edge_cases():
    limiter = SlidingWindowLimiter(capacity=1, window_seconds=0.5)
    client_id = "edge_client"

    # Allow one request
    assert limiter.allow_request(client_id)
    assert limiter.get_remaining_requests(client_id) == 0

    # Deny immediately after
    assert not limiter.allow_request(client_id)

    # Wait just enough for window to pass
    time.sleep(0.51)
    assert limiter.allow_request(client_id)
    assert limiter.get_remaining_requests(client_id) == 0

    # Test get_reset_time with no requests
    limiter_no_requests = SlidingWindowLimiter(capacity=1, window_seconds=1)
    assert limiter_no_requests.get_reset_time("new_client") == 0

def test_sliding_window_limiter_reset_time_accuracy():
    limiter = SlidingWindowLimiter(capacity=1, window_seconds=10)
    client_id = "time_client"

    assert limiter.allow_request(client_id)
    initial_reset_time = limiter.get_reset_time(client_id)
    assert initial_reset_time > 0 and initial_reset_time <= 10

    time.sleep(2)
    assert not limiter.allow_request(client_id)
    new_reset_time = limiter.get_reset_time(client_id)
    assert new_reset_time < initial_reset_time
    assert new_reset_time > 0
