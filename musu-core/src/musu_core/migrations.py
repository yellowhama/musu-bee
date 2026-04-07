"""Database migration helpers for musu-core SQLite schema.

Each migration is a (up, down) pair keyed by a sequential version string.
The runtime applies *up* when the column is absent and *down* to roll back.

Usage (applied automatically by db._open):
    from musu_core.migrations import apply_pending
    apply_pending(conn)
"""

from __future__ import annotations

import sqlite3
from typing import Callable

# ---------------------------------------------------------------------------
# Migration registry
# ---------------------------------------------------------------------------

MigrationFn = Callable[[sqlite3.Connection], None]


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


# ---------------------------------------------------------------------------
# v1: add fallback_chain to agents
# ---------------------------------------------------------------------------


def _v1_up(conn: sqlite3.Connection) -> None:
    """Add fallback_chain TEXT column to agents table."""
    if not _column_exists(conn, "agents", "fallback_chain"):
        conn.execute(
            "ALTER TABLE agents ADD COLUMN fallback_chain TEXT DEFAULT NULL;"
        )
        conn.commit()


def _v1_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    """SQLite does not support DROP COLUMN in older versions.

    To roll back: recreate the table without fallback_chain.
    This is a no-op on SQLite < 3.35; callers that need a hard rollback
    should recreate the database from _SCHEMA.
    """
    try:
        conn.execute(
            "ALTER TABLE agents DROP COLUMN fallback_chain;"
        )
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Older SQLite — drop-column not supported; acceptable for dev


# ---------------------------------------------------------------------------
# v2: add agent_id to messages
# ---------------------------------------------------------------------------


def _v2_up(conn: sqlite3.Connection) -> None:
    """Add agent_id TEXT column to messages table."""
    if not _column_exists(conn, "messages", "agent_id"):
        conn.execute(
            "ALTER TABLE messages ADD COLUMN agent_id TEXT DEFAULT NULL;"
        )
        conn.commit()


def _v2_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    try:
        conn.execute("ALTER TABLE messages DROP COLUMN agent_id;")
        conn.commit()
    except sqlite3.OperationalError:
        pass


# ---------------------------------------------------------------------------
# v3: remove FK constraint from fallback_metrics.agent_id
# ---------------------------------------------------------------------------
# SQLite does not support ALTER TABLE DROP CONSTRAINT.  We recreate the table
# without the FK so that agent_id can store any string (including IDs from
# external systems like Paperclip) without violating referential integrity.


def _v3_up(conn: sqlite3.Connection) -> None:
    """Recreate fallback_metrics without the FK on agent_id (if needed)."""
    # Detect whether the FK is still present by checking the table's SQL definition.
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='fallback_metrics'"
    ).fetchone()
    if row is None:
        return  # Table doesn't exist yet; schema will create it correctly.
    if "REFERENCES" not in (row[0] or ""):
        return  # Already migrated or was never created with FK.

    conn.executescript("""
        BEGIN;
        CREATE TABLE fallback_metrics_new (
            id              TEXT PRIMARY KEY,
            agent_id        TEXT,
            run_id          TEXT NOT NULL,
            fallback_reason TEXT NOT NULL DEFAULT 'unknown',
            fallback_adapter TEXT NOT NULL DEFAULT '',
            chain_exhausted  INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        INSERT INTO fallback_metrics_new
            SELECT id, agent_id, run_id, fallback_reason,
                   fallback_adapter, chain_exhausted, created_at
            FROM fallback_metrics;
        DROP TABLE fallback_metrics;
        ALTER TABLE fallback_metrics_new RENAME TO fallback_metrics;
        CREATE INDEX IF NOT EXISTS idx_fallback_metrics_agent
            ON fallback_metrics(agent_id);
        CREATE INDEX IF NOT EXISTS idx_fallback_metrics_created
            ON fallback_metrics(created_at);
        COMMIT;
    """)


def _v3_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    pass  # Restoring the FK is not necessary for rollback purposes.


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

#: Ordered list of (version_label, up_fn, down_fn)
MIGRATIONS: list[tuple[str, MigrationFn, MigrationFn]] = [
    ("v1_fallback_chain", _v1_up, _v1_down),
    ("v2_messages_agent_id", _v2_up, _v2_down),
    ("v3_fallback_metrics_drop_fk", _v3_up, _v3_down),
]


def apply_pending(conn: sqlite3.Connection) -> list[str]:
    """Apply all pending migrations and return labels of those that ran."""
    applied: list[str] = []
    for label, up_fn, _ in MIGRATIONS:
        up_fn(conn)
        applied.append(label)
    return applied


def rollback(conn: sqlite3.Connection, label: str) -> bool:
    """Roll back a single named migration. Returns True if found."""
    for mig_label, _, down_fn in MIGRATIONS:
        if mig_label == label:
            down_fn(conn)
            return True
    return False
