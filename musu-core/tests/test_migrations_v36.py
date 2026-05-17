"""v36 — agents.isolation_profile column."""
from __future__ import annotations

import json

from musu_core.db import Database
from musu_core.migrations import MIGRATIONS, _v36_down, _v36_up


def _columns(conn, table: str) -> set[str]:
    return {row[1] for row in conn.execute(
        f"PRAGMA table_info({table})"
    ).fetchall()}


def test_v36_registered_last() -> None:
    """v36 was the tail when added. Now v37 (V23.4 Phase 4 T2-A' wiki/432) is
    the new tail; v36 must remain registered and ordered immediately before
    v37 to keep the migration chain stable.
    """
    labels = [m[0] for m in MIGRATIONS]
    assert "v36_agents_isolation_profile" in labels
    v36_idx = labels.index("v36_agents_isolation_profile")
    # v37 is the new tail; v36 is its immediate predecessor.
    assert labels[v36_idx + 1] == "v37_workflows"


def test_v36_adds_isolation_profile_column() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    assert "isolation_profile" in _columns(conn, "agents"), (
        "isolation_profile column missing after fresh init"
    )


def test_v36_column_is_nullable_text() -> None:
    """NULL = legacy / no sandbox. JSON string = active profile."""
    db = Database(":memory:")
    conn = db._get_conn()
    # Inspect column type via PRAGMA
    cols_info = list(conn.execute("PRAGMA table_info(agents)").fetchall())
    iso = next(c for c in cols_info if c[1] == "isolation_profile")
    # cols_info: (cid, name, type, notnull, dflt_value, pk)
    assert iso[2] == "TEXT" or iso[2] == ""  # SQLite allows empty type
    assert iso[3] == 0, "should be nullable"


def test_v36_round_trip_via_insert(backend) -> None:
    """Insert with a real JSON profile + read it back."""
    profile = {
        "allow_read": ["/usr", "/lib"],
        "allow_write": ["/tmp/musu"],
        "allow_net": [{"host": "api.musu.pro", "port": 443}],
        "cpu_secs": 600,
        "mem_mb": 2048,
        "strip_env": ["AWS_SECRET"],
    }
    backend.execute(
        "INSERT INTO agents(id, name, isolation_profile) VALUES (?, ?, ?)",
        ("a-iso", "iso-agent", json.dumps(profile)),
    )
    rows = backend.execute(
        "SELECT isolation_profile FROM agents WHERE id=?", ("a-iso",),
    )
    back = json.loads(rows[0]["isolation_profile"])
    assert back == profile


def test_v36_null_isolation_is_allowed(backend) -> None:
    """Existing agents have NULL — must not break inserts."""
    backend.execute(
        "INSERT INTO agents(id, name) VALUES (?, ?)",
        ("a-legacy", "legacy-agent"),
    )
    rows = backend.execute(
        "SELECT isolation_profile FROM agents WHERE id=?", ("a-legacy",),
    )
    assert rows[0]["isolation_profile"] is None


def test_v36_up_idempotent() -> None:
    """Re-running _v36_up on a fresh DB doesn't error."""
    db = Database(":memory:")
    conn = db._get_conn()
    # apply_pending already ran _v36_up; running again should be a no-op.
    _v36_up(conn)
    assert "isolation_profile" in _columns(conn, "agents")


def test_v36_down_drops_column_or_is_noop() -> None:
    """_v36_down removes the column on SQLite ≥ 3.35, no-op below.

    Either way it must not raise.
    """
    db = Database(":memory:")
    conn = db._get_conn()
    _v36_down(conn)
    # If SQLite ≥ 3.35, column should be gone. Otherwise still present.
    # Both are acceptable — the test just guards against exceptions.
    cols = _columns(conn, "agents")
    # If gone, no assertion needed; if still there, it must still be nullable.
    if "isolation_profile" in cols:
        info = list(conn.execute(
            "PRAGMA table_info(agents)"
        ).fetchall())
        iso = next(c for c in info if c[1] == "isolation_profile")
        assert iso[3] == 0
