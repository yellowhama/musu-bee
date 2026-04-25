"""test_node_events.py — Bridge lifecycle events (Phase 87)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# LocalBackend unit tests
# ---------------------------------------------------------------------------

def test_record_node_event_creates_row():
    """record_node_event returns an id and the row is retrievable."""
    from musu_core.backends.local import LocalBackend

    backend = LocalBackend(":memory:")
    event_id = backend.record_node_event("test-node", "bridge_started")

    assert event_id is not None
    events = backend.list_node_events()
    assert len(events) == 1
    e = events[0]
    assert e["id"] == event_id
    assert e["node"] == "test-node"
    assert e["event_type"] == "bridge_started"
    assert "created_at" in e


def test_record_multiple_events_contains_both():
    """list_node_events returns all recorded events."""
    from musu_core.backends.local import LocalBackend

    backend = LocalBackend(":memory:")
    backend.record_node_event("node", "bridge_started")
    backend.record_node_event("node", "bridge_stopped")

    events = backend.list_node_events()
    types = {e["event_type"] for e in events}
    assert "bridge_started" in types
    assert "bridge_stopped" in types


def test_list_node_events_limit():
    """list_node_events respects limit parameter."""
    from musu_core.backends.local import LocalBackend

    backend = LocalBackend(":memory:")
    for i in range(10):
        backend.record_node_event("node", f"event_{i}")

    events = backend.list_node_events(limit=3)
    assert len(events) == 3


def test_record_node_event_with_meta():
    """meta dict is serialized and returned as dict."""
    from musu_core.backends.local import LocalBackend

    backend = LocalBackend(":memory:")
    backend.record_node_event("node", "bridge_started", meta={"pid": 12345})

    events = backend.list_node_events()
    assert events[0]["meta"] == {"pid": 12345}


# ---------------------------------------------------------------------------
# API integration tests
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    from server import app
    return TestClient(app, raise_server_exceptions=True)


def test_api_admin_events_returns_list(client):
    """GET /api/admin/events with auth returns {events: list}."""
    resp = client.get(
        "/api/admin/events",
        headers={"Authorization": "Bearer test-token"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "events" in data
    assert isinstance(data["events"], list)


def test_api_admin_events_no_auth(client):
    """GET /api/admin/events without Bearer → 401."""
    resp = client.get("/api/admin/events")
    assert resp.status_code == 401


def test_api_admin_events_limit_param(client):
    """limit query param is accepted."""
    resp = client.get(
        "/api/admin/events?limit=5",
        headers={"Authorization": "Bearer test-token"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["events"]) <= 5
