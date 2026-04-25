"""Phase 89: Fencing Token — musu-core unit tests (TDD RED first).

Covers:
  test_lease_token_initialized_to_1
  test_lease_token_increments_on_running
  test_stale_write_rejected
  test_correct_token_accepted
  test_tombstone_set_on_terminal
  test_tombstone_blocks_new_execution
"""
from __future__ import annotations

import logging
import sys
import uuid
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).parent.parent.parent
_MUSU_CORE = _ROOT / "musu-core" / "src"
if str(_MUSU_CORE) not in sys.path:
    sys.path.insert(0, str(_MUSU_CORE))


def _make_backend(tmp_path):
    from musu_core.backends.local import LocalBackend
    return LocalBackend(str(tmp_path / "test.db"))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_lease_token_initialized_to_1(tmp_path):
    """create_route_execution must set lease_token=1."""
    backend = _make_backend(tmp_path)
    eid = str(uuid.uuid4())
    backend.create_route_execution(eid, "engineer", "u1", "do work")
    rows = backend._db.execute(
        "SELECT lease_token FROM route_executions WHERE id = ?", (eid,)
    )
    assert rows, "route execution not found"
    assert rows[0]["lease_token"] == 1


def test_lease_token_increments_on_running(tmp_path):
    """update_route_execution('running', expected_lease_token=1) increments token to 2."""
    backend = _make_backend(tmp_path)
    eid = str(uuid.uuid4())
    backend.create_route_execution(eid, "engineer", "u1", "do work")
    backend.update_route_execution(eid, "running", expected_lease_token=1)
    rows = backend._db.execute(
        "SELECT lease_token, status FROM route_executions WHERE id = ?", (eid,)
    )
    assert rows[0]["lease_token"] == 2
    assert rows[0]["status"] == "running"


def test_stale_write_rejected(tmp_path, caplog):
    """Passing an outdated expected_lease_token to update must be rejected (no DB change, WARNING logged)."""
    backend = _make_backend(tmp_path)
    eid = str(uuid.uuid4())
    backend.create_route_execution(eid, "engineer", "u1", "work")
    # Advance token to 2
    backend.update_route_execution(eid, "running", expected_lease_token=1)

    with caplog.at_level(logging.WARNING):
        # Pass stale token (still 1) — should be rejected
        backend.update_route_execution(eid, "done", expected_lease_token=1)

    rows = backend._db.execute(
        "SELECT status, lease_token FROM route_executions WHERE id = ?", (eid,)
    )
    # Status must NOT be 'done' — zombie was rejected
    assert rows[0]["status"] == "running", (
        f"Expected status=running after stale write, got {rows[0]['status']!r}"
    )
    assert any(
        "zombie" in r.message.lower() or "lease_token" in r.message.lower()
        for r in caplog.records
    ), "Expected a WARNING about zombie/lease_token mismatch"


def test_correct_token_accepted(tmp_path):
    """Correct expected_lease_token on done transitions status to 'done'."""
    backend = _make_backend(tmp_path)
    eid = str(uuid.uuid4())
    backend.create_route_execution(eid, "engineer", "u1", "work")
    backend.update_route_execution(eid, "running", expected_lease_token=1)
    # Token is now 2 — use correct token
    backend.update_route_execution(eid, "done", expected_lease_token=2)
    rows = backend._db.execute(
        "SELECT status FROM route_executions WHERE id = ?", (eid,)
    )
    assert rows[0]["status"] == "done"


def test_tombstone_set_on_terminal(tmp_path):
    """After done with correct token, a tombstone row must exist for (channel, sender_id)."""
    backend = _make_backend(tmp_path)
    eid = str(uuid.uuid4())
    backend.create_route_execution(eid, "engineer", "u1", "work")
    backend.update_route_execution(eid, "running", expected_lease_token=1)
    backend.update_route_execution(eid, "done", expected_lease_token=2)

    rows = backend._db.execute(
        "SELECT tombstone_until FROM route_execution_tombstones"
        " WHERE channel = ? AND sender_id = ?",
        ("engineer", "u1"),
    )
    assert len(rows) == 1, "Expected one tombstone row after done"
    assert rows[0]["tombstone_until"] is not None
    # tombstone_until must be a future timestamp
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    assert rows[0]["tombstone_until"] > now, (
        f"tombstone_until {rows[0]['tombstone_until']!r} should be in the future"
    )


def test_tombstone_blocks_new_execution(tmp_path):
    """After a done execution creates a tombstone, a new create_route_execution for the same
    (channel, sender_id) within the lockout window must raise RuntimeError."""
    backend = _make_backend(tmp_path)
    eid = str(uuid.uuid4())
    backend.create_route_execution(eid, "engineer", "u1", "work")
    backend.update_route_execution(eid, "running", expected_lease_token=1)
    backend.update_route_execution(eid, "done", expected_lease_token=2)

    eid2 = str(uuid.uuid4())
    with pytest.raises(RuntimeError, match="tombstone"):
        backend.create_route_execution(eid2, "engineer", "u1", "new work")
