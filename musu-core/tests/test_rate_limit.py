import time
from unittest.mock import patch

import pytest

from musu_core.rate_limit import SlidingWindowLimiter


@pytest.fixture
def limiter():
    return SlidingWindowLimiter(capacity=60, window_seconds=60)


def test_allow_request_within_capacity(limiter):
    client_id = "test_client_1"
    for _ in range(60):
        assert limiter.allow_request(client_id)
    assert not limiter.allow_request(client_id)


def test_get_remaining_requests(limiter):
    client_id = "test_client_1"
    assert limiter.get_remaining_requests(client_id) == 60
    limiter.allow_request(client_id)
    assert limiter.get_remaining_requests(client_id) == 59
    for _ in range(59):
        limiter.allow_request(client_id)
    assert limiter.get_remaining_requests(client_id) == 0


def test_get_reset_time(limiter):
    client_id = "test_client_1"
    with patch("time.time", return_value=100.0):
        limiter.allow_request(client_id)
    
    with patch("time.time", return_value=100.0):
        # Should be 60 seconds from now (100.0 + 60.0 - 100.0)
        assert limiter.get_reset_time(client_id) == 60 

    with patch("time.time", return_value=130.0):
        # Oldest request at 100.0, window ends at 160.0. Current time is 130.0.
        # So reset in 160 - 130 = 30 seconds
        assert limiter.get_reset_time(client_id) == 30

    with patch("time.time", return_value=160.0):
        # Oldest request expires, should be 0 or 60 (if no requests)
        assert limiter.get_reset_time(client_id) == 0

    with patch("time.time", return_value=161.0):
        # All requests cleaned up, should return 0 (no immediate reset needed)
        assert limiter.get_reset_time(client_id) == 0


def test_sliding_window_resets_after_window_expires(limiter):
    client_id = "test_client_1"
    with patch("time.time", return_value=100.0):
        for _ in range(60):
            assert limiter.allow_request(client_id)
        assert not limiter.allow_request(client_id)

    with patch("time.time", return_value=100.0 + 60.0 + 0.1):  # Just after window
        assert limiter.allow_request(client_id)  # Should allow new requests


def test_multiple_clients_independent(limiter):
    client_id_1 = "test_client_1"
    client_id_2 = "test_client_2"

    for _ in range(60):
        assert limiter.allow_request(client_id_1)
    assert not limiter.allow_request(client_id_1)

    # Client 2 should still be able to make requests
    for _ in range(60):
        assert limiter.allow_request(client_id_2)
    assert not limiter.allow_request(client_id_2)

    assert limiter.get_remaining_requests(client_id_1) == 0
    assert limiter.get_remaining_requests(client_id_2) == 0


def test_cleanup_old_requests_logic():
    limiter = SlidingWindowLimiter(capacity=3, window_seconds=10)
    client_id = "test_client_cleanup"

    with patch("time.time", side_effect=[0, 1, 2, 10, 11]):
        limiter.allow_request(client_id)  # at t=0
        limiter.allow_request(client_id)  # at t=1
        limiter.allow_request(client_id)  # at t=2
        assert limiter.allow_request(client_id) # t=10, oldest (t=0) removed, now len < capacity

        assert limiter.allow_request(client_id) # t=11, oldest (t=1) removed, now at 11, oldest t=2. 3-1=2 still here
        assert len(limiter.client_requests[client_id]) == 3
        # Timestamps should be [2, 10, 11]

    # Test case where no requests are made
    limiter = SlidingWindowLimiter(capacity=10, window_seconds=60)
    assert limiter.get_remaining_requests("new_client") == 10
    assert limiter.get_reset_time("new_client") == 0

