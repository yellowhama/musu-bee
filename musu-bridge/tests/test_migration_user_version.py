"""V23.5 H-3 — PRAGMA user_version watermark written by apply_pending.

Verifies that ``musu_core.migrations.apply_pending`` writes
``PRAGMA user_version = len(MIGRATIONS)`` after every migration succeeded
and that ``get_user_version`` reads it back. Readiness gating in
``server.py`` (see test_health_ready.py) depends on this contract.

Atomicity claim: the loop applies up_fn sequentially; if any up_fn
raises, control exits before the PRAGMA write so user_version stays at
its prior value (0 on a fresh DB). The test_apply_pending_failure_does_not_advance
case exercises that path.
"""
from __future__ import annotations

import sqlite3

import pytest

from musu_core.migrations import (
    MIGRATIONS,
    apply_pending,
    get_user_version,
)


def _fresh_conn() -> sqlite3.Connection:
    """In-memory SQLite connection seeded with minimal base schema needed by
    the v1+ migrations (agents/messages/etc.). We import the same _SCHEMA the
    runtime uses to keep this test honest about real apply_pending behavior.
    """
    from musu_core.db import _SCHEMA  # noqa: PLC0415

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def test_fresh_db_user_version_is_zero_before_apply_pending() -> None:
    """SQLite default: PRAGMA user_version starts at 0 on a brand-new DB."""
    conn = sqlite3.connect(":memory:")
    assert get_user_version(conn) == 0


def test_apply_pending_sets_user_version_to_migrations_length() -> None:
    """After successful apply_pending, PRAGMA user_version == len(MIGRATIONS).

    This is the watermark /health/ready compares against MIGRATIONS_MIN_VERSION.
    """
    conn = _fresh_conn()
    applied = apply_pending(conn)

    assert len(applied) == len(MIGRATIONS)
    assert get_user_version(conn) == len(MIGRATIONS)


def test_apply_pending_idempotent_on_user_version() -> None:
    """Re-running apply_pending must leave PRAGMA user_version stable, not
    accumulate / double. (Migrations themselves are idempotent via
    _column_exists guards; the PRAGMA write is a pure assignment.)"""
    conn = _fresh_conn()
    apply_pending(conn)
    first = get_user_version(conn)

    apply_pending(conn)
    second = get_user_version(conn)

    assert first == second == len(MIGRATIONS)


def test_user_version_persists_across_connections_inmemory_simulation() -> None:
    """PRAGMA user_version is a per-database persistent value (stored in the
    file header). Using a shared-cache in-memory URI we simulate that
    persistence: a second connection sees the value written by the first."""
    uri = "file:test_user_version_db?mode=memory&cache=shared"
    conn1 = sqlite3.connect(uri, uri=True)
    conn2 = sqlite3.connect(uri, uri=True)
    try:
        # Seed schema + migrate on conn1
        conn1.row_factory = sqlite3.Row
        from musu_core.db import _SCHEMA  # noqa: PLC0415
        conn1.executescript(_SCHEMA)
        apply_pending(conn1)

        # conn2 should see the same watermark
        assert get_user_version(conn2) == len(MIGRATIONS)
    finally:
        conn1.close()
        conn2.close()


def test_apply_pending_failure_does_not_advance_user_version(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If a migration raises, the loop exits before the PRAGMA write so the
    watermark stays at the prior value (0 on a fresh DB). Readiness sees
    'not_ready / schema_below_min' rather than a false-green watermark.
    """
    from musu_core import migrations as mig_mod  # noqa: PLC0415

    conn = _fresh_conn()
    assert get_user_version(conn) == 0

    # Inject a poison migration at position 1 (after v1). MIGRATIONS is a
    # module-level list; we restore via monkeypatch.setattr.
    original = list(mig_mod.MIGRATIONS)

    def _boom(_conn: sqlite3.Connection) -> None:
        raise RuntimeError("synthetic migration failure")

    # Replace migration at index 1 with poison; keep its down_fn as no-op.
    poisoned = list(original)
    poisoned[1] = ("v_poison", _boom, lambda c: None)
    monkeypatch.setattr(mig_mod, "MIGRATIONS", poisoned)

    with pytest.raises(RuntimeError, match="synthetic migration failure"):
        apply_pending(conn)

    # Watermark must NOT have advanced — readiness will correctly report
    # schema_below_min downstream.
    assert get_user_version(conn) == 0


def test_user_version_value_matches_published_min(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cross-check: the value apply_pending writes is exactly the value
    server.MIGRATIONS_MIN_VERSION asserts against. Drift here would cause
    silent readiness failures after a migration is added without bumping
    the gate constant."""
    from server import MIGRATIONS_MIN_VERSION  # noqa: PLC0415

    conn = _fresh_conn()
    apply_pending(conn)

    assert get_user_version(conn) == MIGRATIONS_MIN_VERSION


def test_get_user_version_handles_simulated_future_migration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When a future migration is appended to MIGRATIONS, apply_pending writes
    the new length. Simulates a binary one ahead of the current schema HEAD."""
    from musu_core import migrations as mig_mod  # noqa: PLC0415

    extended = list(mig_mod.MIGRATIONS) + [
        ("v_future_noop", lambda c: None, lambda c: None),
    ]
    monkeypatch.setattr(mig_mod, "MIGRATIONS", extended)

    conn = _fresh_conn()
    apply_pending(conn)

    assert get_user_version(conn) == len(extended)
    assert get_user_version(conn) == len(mig_mod.MIGRATIONS)
