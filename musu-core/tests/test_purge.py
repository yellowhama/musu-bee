import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from musu_core.backends.local import LocalBackend


def _make_backend(tmp_path) -> LocalBackend:
    """Helper: fresh backend with in-memory DB seeded to tmp path."""
    db_path = str(tmp_path / "test.db")
    return LocalBackend(db_path=db_path)


def test_purge_removes_old_failed(tmp_path):
    b = _make_backend(tmp_path)
    db = b._db

    # Insert old failed record (62 days ago)
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('old-1', 'test', 'user', 'hi', 'failed', 3,"
        " datetime('now', '-62 days'))"
    )
    # Insert recent failed record (5 days ago)
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('new-1', 'test', 'user', 'hi', 'failed', 3,"
        " datetime('now', '-5 days'))"
    )
    # Insert old done record (62 days ago)
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('done-1', 'test', 'user', 'hi', 'done', 0,"
        " datetime('now', '-62 days'))"
    )
    # Insert running record — must NOT be deleted
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('run-1', 'test', 'user', 'hi', 'running', 0,"
        " datetime('now', '-62 days'))"
    )

    deleted = b.purge_old_executions(days=30)

    assert deleted == 2, f"Expected 2 deleted, got {deleted}"
    rows = db.execute("SELECT id FROM route_executions ORDER BY id")
    ids = [r["id"] for r in rows]
    assert "old-1" not in ids
    assert "done-1" not in ids
    assert "new-1" in ids   # recent — kept
    assert "run-1" in ids   # running — kept


def test_purge_returns_zero_when_nothing_to_delete(tmp_path):
    b = _make_backend(tmp_path)
    deleted = b.purge_old_executions(days=30)
    assert deleted == 0


def test_purge_respects_days_param(tmp_path):
    b = _make_backend(tmp_path)
    db = b._db
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('r1', 'c', 'u', 'x', 'failed', 3, datetime('now', '-10 days'))"
    )
    # days=30: 10 days ago is recent → not deleted
    assert b.purge_old_executions(days=30) == 0
    # days=7: 10 days ago is old → deleted
    assert b.purge_old_executions(days=7) == 1
