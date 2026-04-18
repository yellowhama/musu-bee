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
# v4: add company layer tables
# ---------------------------------------------------------------------------


def _v4_up(conn: sqlite3.Connection) -> None:
    """Add company layer tables: companies, role_templates, project_index, approvals_queue."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS companies (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            template_key TEXT NOT NULL DEFAULT 'default',
            workspace_id TEXT NOT NULL DEFAULT '',
            meta        TEXT NOT NULL DEFAULT '{}',
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS company_role_templates (
            id          TEXT PRIMARY KEY,
            company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            role        TEXT NOT NULL,
            instructions TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS company_project_index (
            id          TEXT PRIMARY KEY,
            company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            project_name TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paused', 'archived')),
            assigned_to TEXT REFERENCES agents(id) ON DELETE SET NULL,
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS company_approvals_queue (
            id          TEXT PRIMARY KEY,
            company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            status      TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
            requested_by TEXT NOT NULL DEFAULT '',
            reason      TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_role_templates_company ON company_role_templates(company_id);
        CREATE INDEX IF NOT EXISTS idx_project_index_company ON company_project_index(company_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_company ON company_approvals_queue(company_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_status ON company_approvals_queue(status);
    """)


def _v4_down(conn: sqlite3.Connection) -> None:
    """Drop company layer tables."""
    conn.executescript("""
        DROP TABLE IF EXISTS company_approvals_queue;
        DROP TABLE IF EXISTS company_project_index;
        DROP TABLE IF EXISTS company_role_templates;
        DROP TABLE IF EXISTS companies;
    """)


# ---------------------------------------------------------------------------
# v5: add retry_count to route_executions
# ---------------------------------------------------------------------------


def _v5_up(conn: sqlite3.Connection) -> None:
    """Add retry_count INTEGER column to route_executions (if it exists)."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='route_executions'"
    ).fetchone()
    if row is None:
        return  # Table doesn't exist yet; _SCHEMA will create it with the column.
    if not _column_exists(conn, "route_executions", "retry_count"):
        conn.execute(
            "ALTER TABLE route_executions "
            "ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;"
        )
        conn.commit()


def _v5_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    try:
        conn.execute("ALTER TABLE route_executions DROP COLUMN retry_count;")
        conn.commit()
    except sqlite3.OperationalError:
        pass


# ---------------------------------------------------------------------------
# v6: add created_at index to route_executions for list pagination
# ---------------------------------------------------------------------------


def _v6_up(conn: sqlite3.Connection) -> None:
    """Add created_at index to route_executions (used by list_route_executions ORDER BY)."""
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_route_executions_created"
        " ON route_executions(created_at);"
    )
    conn.commit()


def _v6_down(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("DROP INDEX IF EXISTS idx_route_executions_created;")
        conn.commit()
    except sqlite3.OperationalError:
        pass


# ---------------------------------------------------------------------------
# v7: add company_id to route_executions for company-scoped cost/activity queries
# ---------------------------------------------------------------------------


def _v7_up(conn: sqlite3.Connection) -> None:
    """Add company_id TEXT column + index to route_executions."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='route_executions'"
    ).fetchone()
    if row is None:
        return  # Table doesn't exist yet; _SCHEMA will create it with the column.
    if not _column_exists(conn, "route_executions", "company_id"):
        conn.execute("ALTER TABLE route_executions ADD COLUMN company_id TEXT;")
        conn.commit()
    # Always ensure the index exists (covers fresh DBs where _SCHEMA skips index creation)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_route_executions_company"
        " ON route_executions(company_id);"
    )
    conn.commit()


def _v7_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    # SQLite does not support DROP COLUMN in older versions; index drop only.
    try:
        conn.execute("DROP INDEX IF EXISTS idx_route_executions_company;")
        conn.commit()
    except sqlite3.OperationalError:
        pass


# ---------------------------------------------------------------------------
# v8: add goals table
# ---------------------------------------------------------------------------


def _v8_up(conn: sqlite3.Connection) -> None:
    """Add goals table for company-scoped goals tracking."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='goals'"
    ).fetchone()
    if row is not None:
        return  # Already exists
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS goals (
            id          TEXT PRIMARY KEY,
            company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status      TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'completed', 'cancelled')),
            due_date    TEXT,
            meta        TEXT NOT NULL DEFAULT '{}',
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS idx_goals_company ON goals(company_id);
        CREATE INDEX IF NOT EXISTS idx_goals_status  ON goals(status);
    """)


def _v8_down(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        DROP INDEX IF EXISTS idx_goals_status;
        DROP INDEX IF EXISTS idx_goals_company;
        DROP TABLE IF EXISTS goals;
    """)


# ---------------------------------------------------------------------------
# v9: composite index on route_executions(company_id, status)
# ---------------------------------------------------------------------------


def _v9_up(conn: sqlite3.Connection) -> None:
    """Add composite index for cost aggregation queries."""
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_route_executions_company_status"
        " ON route_executions(company_id, status);"
    )
    conn.commit()


def _v9_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    conn.execute("DROP INDEX IF EXISTS idx_route_executions_company_status;")
    conn.commit()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

#: Ordered list of (version_label, up_fn, down_fn)
MIGRATIONS: list[tuple[str, MigrationFn, MigrationFn]] = [
    ("v1_fallback_chain", _v1_up, _v1_down),
    ("v2_messages_agent_id", _v2_up, _v2_down),
    ("v3_fallback_metrics_drop_fk", _v3_up, _v3_down),
    ("v4_company_layer", _v4_up, _v4_down),
    ("v5_route_executions_retry_count", _v5_up, _v5_down),
    ("v6_route_executions_created_index", _v6_up, _v6_down),
    ("v7_route_executions_company_id", _v7_up, _v7_down),
    ("v8_goals_table", _v8_up, _v8_down),
    ("v9_route_executions_composite_idx", _v9_up, _v9_down),
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
