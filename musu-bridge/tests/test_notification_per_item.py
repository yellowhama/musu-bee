"""v14.3 — per-notification mark-read endpoint."""
from __future__ import annotations

import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from musu_core.backends.local import LocalBackend  # noqa: E402


_NOTIF_SCHEMA = """
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    message_id TEXT,
    group_id TEXT,
    sender_id TEXT,
    preview TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
"""


@pytest.fixture
def backend(tmp_path, monkeypatch):
    db = LocalBackend(str(tmp_path / "test.db"))
    # Notifications table is created lazily by bridge runtime; for tests,
    # create it directly so endpoint logic can read/write.
    db._db.execute(_NOTIF_SCHEMA)
    # Patch the bridge backend so the endpoint uses our test backend.
    import handlers
    monkeypatch.setattr(handlers, "_get_backend", lambda: db)
    return db


def _insert_notification(backend, *, recipient_id: str, sender: str = "ceo") -> str:
    nid = str(uuid.uuid4())
    backend._db.execute(
        "INSERT INTO notifications (id, recipient_id, message_id, group_id, sender_id, preview) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (nid, recipient_id, str(uuid.uuid4()), "group-test", sender, "Hello"),
    )
    return nid


def _api_client():
    from fastapi.testclient import TestClient
    from server import app
    token = os.environ.get("MUSU_BRIDGE_TOKEN", "test-token")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


def test_mark_single_notification_read(backend):
    rid = "user-1"
    n1 = _insert_notification(backend, recipient_id=rid)
    n2 = _insert_notification(backend, recipient_id=rid)
    client = _api_client()

    # Initial: both unread.
    resp = client.get(f"/api/notifications/{rid}")
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert {n1, n2} <= ids

    # Mark one.
    resp = client.post(f"/api/notifications/{rid}/{n1}/read")
    assert resp.status_code == 200
    body = resp.json()
    assert body["marked_read"] is True
    assert body["id"] == n1

    # Verify: only n2 is still unread.
    resp = client.get(f"/api/notifications/{rid}")
    ids = {row["id"] for row in resp.json()}
    assert n1 not in ids
    assert n2 in ids


def test_mark_single_scoped_to_recipient(backend):
    """A user can't mark another user's notification as read."""
    n1 = _insert_notification(backend, recipient_id="user-A")
    client = _api_client()
    # Wrong recipient_id in path → UPDATE matches no rows, n1 still unread.
    resp = client.post(f"/api/notifications/user-B/{n1}/read")
    assert resp.status_code == 200  # endpoint always returns 200
    resp = client.get("/api/notifications/user-A")
    ids = {row["id"] for row in resp.json()}
    assert n1 in ids  # still unread for the real owner


def test_mark_all_still_works(backend):
    """v12 bulk mark-read must remain functional alongside v14.3 per-item."""
    rid = "user-bulk"
    _insert_notification(backend, recipient_id=rid)
    _insert_notification(backend, recipient_id=rid)
    client = _api_client()
    resp = client.post(f"/api/notifications/{rid}/read")
    assert resp.status_code == 200
    resp = client.get(f"/api/notifications/{rid}")
    assert resp.json() == []
