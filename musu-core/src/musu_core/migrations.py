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
# v10: kvstore table for lightweight key-value persistence
# ---------------------------------------------------------------------------


def _v10_up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS kvstore (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )"""
    )


def _v10_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    pass  # non-destructive — keep the table on rollback


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

#: Ordered list of (version_label, up_fn, down_fn)
def _v11_up(conn: sqlite3.Connection) -> None:
    """Add dedup guards: partial UNIQUE on active agents, UNIQUE on company name."""
    # Partial unique index: only one active agent per name allowed.
    # Paused/retired duplicates (from old seeds) are untouched.
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_name_active"
        " ON agents(name) WHERE status = 'active';"
    )
    # Companies must have unique names — no two musu_corp rows ever again.
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name"
        " ON companies(name);"
    )
    conn.commit()


def _v11_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    conn.execute("DROP INDEX IF EXISTS idx_agents_name_active;")
    conn.execute("DROP INDEX IF EXISTS idx_companies_name;")
    conn.commit()


# ---------------------------------------------------------------------------
# v12: sprint_contracts + qa_scores tables (Harness B)
# ---------------------------------------------------------------------------


def _v12_up(conn: sqlite3.Connection) -> None:
    """Add sprint_contracts and qa_scores tables for QA harness loop."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sprint_contracts (
            id                       TEXT PRIMARY KEY,
            task_id                  TEXT,
            task                     TEXT NOT NULL,
            scope_json               TEXT NOT NULL DEFAULT '[]',
            out_of_scope_json        TEXT NOT NULL DEFAULT '[]',
            acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
            done_definition          TEXT NOT NULL DEFAULT '',
            created_at               REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS qa_scores (
            id           TEXT PRIMARY KEY,
            contract_id  TEXT REFERENCES sprint_contracts(id),
            task_id      TEXT,
            iteration    INTEGER NOT NULL DEFAULT 1,
            functionality INTEGER NOT NULL,
            correctness   INTEGER NOT NULL,
            completeness  INTEGER NOT NULL,
            code_quality  INTEGER NOT NULL,
            pass         INTEGER NOT NULL DEFAULT 0,
            feedback     TEXT NOT NULL DEFAULT '',
            created_at   REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_qa_scores_contract_id
            ON qa_scores(contract_id);

        CREATE INDEX IF NOT EXISTS idx_sprint_contracts_task_id
            ON sprint_contracts(task_id);
    """)
    conn.commit()


def _v12_down(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        DROP INDEX IF EXISTS idx_qa_scores_contract_id;
        DROP INDEX IF EXISTS idx_sprint_contracts_task_id;
        DROP TABLE IF EXISTS qa_scores;
        DROP TABLE IF EXISTS sprint_contracts;
    """)
    conn.commit()


# ---------------------------------------------------------------------------
# v13: add status + purpose to companies
# ---------------------------------------------------------------------------


def _v13_up(conn: sqlite3.Connection) -> None:
    """Add status (active/inactive) and purpose to companies table."""
    if not _column_exists(conn, "companies", "status"):
        conn.execute(
            "ALTER TABLE companies ADD COLUMN status TEXT NOT NULL DEFAULT 'active' "
            "CHECK (status IN ('active', 'inactive'));"
        )
    if not _column_exists(conn, "companies", "purpose"):
        conn.execute(
            "ALTER TABLE companies ADD COLUMN purpose TEXT NOT NULL DEFAULT '';"
        )
    conn.commit()


def _v13_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    """SQLite < 3.35 cannot DROP COLUMN — no-op."""


# ---------------------------------------------------------------------------
# v14: add company_id to agents (company-scoped agents)
# ---------------------------------------------------------------------------


def _v14_up(conn: sqlite3.Connection) -> None:
    """Add company_id FK to agents; unique (company_id, name) for active agents."""
    if not _column_exists(conn, "agents", "company_id"):
        conn.execute(
            "ALTER TABLE agents ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;"
        )
    # Two partial unique indexes to handle NULL company_id (SQLite NULLs are distinct):
    # 1) Global agents: unique name when company_id IS NULL
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_global_name_active "
        "ON agents(name) WHERE status = 'active' AND company_id IS NULL;"
    )
    # 2) Company-scoped agents: unique (company_id, name) when company_id IS NOT NULL
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_company_name_active "
        "ON agents(company_id, name) WHERE status = 'active' AND company_id IS NOT NULL;"
    )
    conn.commit()


def _v14_down(conn: sqlite3.Connection) -> None:
    conn.execute("DROP INDEX IF EXISTS idx_agents_global_name_active;")
    conn.execute("DROP INDEX IF EXISTS idx_agents_company_name_active;")
    conn.commit()


# ---------------------------------------------------------------------------
# v15: add cost/token columns to route_executions
# ---------------------------------------------------------------------------


def _v15_up(conn: sqlite3.Connection) -> None:
    """Add cost_usd, input_tokens, output_tokens to route_executions."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='route_executions'"
    ).fetchone()
    if row is None:
        return
    if not _column_exists(conn, "route_executions", "cost_usd"):
        conn.execute("ALTER TABLE route_executions ADD COLUMN cost_usd REAL;")
    if not _column_exists(conn, "route_executions", "input_tokens"):
        conn.execute("ALTER TABLE route_executions ADD COLUMN input_tokens INTEGER;")
    if not _column_exists(conn, "route_executions", "output_tokens"):
        conn.execute("ALTER TABLE route_executions ADD COLUMN output_tokens INTEGER;")
    if not _column_exists(conn, "route_executions", "duration_sec"):
        conn.execute("ALTER TABLE route_executions ADD COLUMN duration_sec REAL;")
    conn.commit()


def _v15_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    pass  # SQLite < 3.35 cannot DROP COLUMN


# ---------------------------------------------------------------------------
# v16: add group_id to messages for inter-device group chat
# ---------------------------------------------------------------------------


def _v16_up(conn: sqlite3.Connection) -> None:
    """Add group_id to messages for CEO board / team channels."""
    if not _column_exists(conn, "messages", "group_id"):
        conn.execute("ALTER TABLE messages ADD COLUMN group_id TEXT;")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);")
    conn.commit()


def _v16_down(conn: sqlite3.Connection) -> None:
    conn.execute("DROP INDEX IF EXISTS idx_messages_group;")
    conn.commit()


# ---------------------------------------------------------------------------
# v17: add last_activity_at to route_executions for activity-based watchdog
# ---------------------------------------------------------------------------


def _v17_up(conn: sqlite3.Connection) -> None:
    """Add last_activity_at to route_executions for activity-based watchdog."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='route_executions'"
    ).fetchone()
    if row is None:
        return
    if not _column_exists(conn, "route_executions", "last_activity_at"):
        conn.execute(
            "ALTER TABLE route_executions ADD COLUMN last_activity_at TEXT;"
        )
        # Backfill: seed with updated_at so existing rows aren't immediately killed
        conn.execute(
            "UPDATE route_executions SET last_activity_at = updated_at "
            "WHERE last_activity_at IS NULL;"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_re_last_activity "
            "ON route_executions(last_activity_at);"
        )
    conn.commit()


def _v17_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    conn.execute("DROP INDEX IF EXISTS idx_re_last_activity;")
    conn.commit()


def _v18_up(conn: sqlite3.Connection) -> None:
    """node_events table for bridge start/stop lifecycle tracking."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS node_events (
            id         TEXT PRIMARY KEY,
            node       TEXT NOT NULL,
            event_type TEXT NOT NULL,
            meta       TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
    """)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_node_events_created "
        "ON node_events(created_at DESC);"
    )
    conn.commit()


def _v18_down(conn: sqlite3.Connection) -> None:
    conn.execute("DROP INDEX IF EXISTS idx_node_events_created;")
    conn.execute("DROP TABLE IF EXISTS node_events;")
    conn.commit()


# ---------------------------------------------------------------------------
# v19: add lease_token to route_executions for fencing token anti-zombie
# ---------------------------------------------------------------------------


def _v19_up(conn: sqlite3.Connection) -> None:
    """Add lease_token INTEGER DEFAULT 0 column to route_executions."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='route_executions'"
    ).fetchone()
    if row is None:
        return  # Table doesn't exist yet; _SCHEMA will create it with the column.
    if not _column_exists(conn, "route_executions", "lease_token"):
        conn.execute(
            "ALTER TABLE route_executions ADD COLUMN lease_token INTEGER DEFAULT 0;"
        )
        conn.commit()


def _v19_down(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE route_executions DROP COLUMN lease_token;")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Older SQLite — drop-column not supported


# ---------------------------------------------------------------------------
# v20: route_execution_tombstones table for zombie create prevention
# ---------------------------------------------------------------------------


def _v20_up(conn: sqlite3.Connection) -> None:
    """Create route_execution_tombstones table (channel, sender_id) PK."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS route_execution_tombstones (
            channel       TEXT NOT NULL,
            sender_id     TEXT NOT NULL,
            tombstone_until TEXT NOT NULL,
            PRIMARY KEY (channel, sender_id)
        )
    """)
    conn.commit()


def _v20_down(conn: sqlite3.Connection) -> None:
    conn.execute("DROP TABLE IF EXISTS route_execution_tombstones;")
    conn.commit()


# ---------------------------------------------------------------------------
# v21: add goal_id/project_id linkage to issues
# ---------------------------------------------------------------------------


def _v21_up(conn: sqlite3.Connection) -> None:
    """Add goal_id/project_id columns + indexes to issues."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='issues'"
    ).fetchone()
    if row is None:
        return
    if not _column_exists(conn, "issues", "goal_id"):
        conn.execute("ALTER TABLE issues ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;")
        conn.commit()
    if not _column_exists(conn, "issues", "project_id"):
        conn.execute(
            "ALTER TABLE issues ADD COLUMN project_id TEXT REFERENCES company_project_index(id) ON DELETE SET NULL;"
        )
        conn.commit()
    conn.execute("CREATE INDEX IF NOT EXISTS idx_issues_goal ON issues(goal_id);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);")
    conn.commit()


def _v21_down(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("DROP INDEX IF EXISTS idx_issues_goal;")
        conn.execute("DROP INDEX IF EXISTS idx_issues_project;")
        conn.execute("ALTER TABLE issues DROP COLUMN goal_id;")
        conn.execute("ALTER TABLE issues DROP COLUMN project_id;")
        conn.commit()
    except sqlite3.OperationalError:
        pass


# ---------------------------------------------------------------------------
# v22: agent budgets + company governance config (Harness preset)
# ---------------------------------------------------------------------------


def _v22_up(conn: sqlite3.Connection) -> None:
    """Add budget columns to agents and governance_config to companies."""
    if not _column_exists(conn, "agents", "budget_usd_monthly"):
        conn.execute("ALTER TABLE agents ADD COLUMN budget_usd_monthly REAL DEFAULT NULL;")
    if not _column_exists(conn, "agents", "budget_usd_spent"):
        conn.execute("ALTER TABLE agents ADD COLUMN budget_usd_spent REAL DEFAULT 0.0;")
    if not _column_exists(conn, "agents", "budget_reset_at"):
        conn.execute("ALTER TABLE agents ADD COLUMN budget_reset_at TEXT DEFAULT NULL;")
    if not _column_exists(conn, "companies", "governance_config"):
        conn.execute("ALTER TABLE companies ADD COLUMN governance_config TEXT NOT NULL DEFAULT '{}';")
    conn.commit()


def _v22_down(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE agents DROP COLUMN budget_usd_monthly;")
        conn.execute("ALTER TABLE agents DROP COLUMN budget_usd_spent;")
        conn.execute("ALTER TABLE agents DROP COLUMN budget_reset_at;")
        conn.execute("ALTER TABLE companies DROP COLUMN governance_config;")
        conn.commit()
    except sqlite3.OperationalError:
        pass


# ---------------------------------------------------------------------------
# v23: budget_transactions audit trail
# ---------------------------------------------------------------------------


def _v23_up(conn: sqlite3.Connection) -> None:
    """Create budget_transactions table for audit trail."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS budget_transactions (
            id          TEXT PRIMARY KEY,
            agent_id    TEXT NOT NULL REFERENCES agents(id),
            company_id  TEXT REFERENCES companies(id),
            amount_usd  REAL NOT NULL,
            type        TEXT NOT NULL CHECK (type IN ('charge', 'reset', 'adjust')),
            run_id      TEXT,
            description TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_budget_tx_agent
            ON budget_transactions(agent_id);
        CREATE INDEX IF NOT EXISTS idx_budget_tx_created
            ON budget_transactions(created_at DESC);
    """)
    conn.commit()


def _v23_down(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        DROP INDEX IF EXISTS idx_budget_tx_created;
        DROP INDEX IF EXISTS idx_budget_tx_agent;
        DROP TABLE IF EXISTS budget_transactions;
    """)
    conn.commit()


# ---------------------------------------------------------------------------
# v24: allowed_tools per agent (tool access control)
# ---------------------------------------------------------------------------


def _v24_up(conn: sqlite3.Connection) -> None:
    """Add allowed_tools JSON column to agents (NULL = all tools allowed)."""
    if not _column_exists(conn, "agents", "allowed_tools"):
        conn.execute("ALTER TABLE agents ADD COLUMN allowed_tools TEXT DEFAULT NULL;")
        conn.commit()


def _v24_down(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE agents DROP COLUMN allowed_tools;")
        conn.commit()
    except sqlite3.OperationalError:
        pass


# ---------------------------------------------------------------------------
# v25: sprint_contracts.locked (operator-edit lock once Engineer accepts)
# ---------------------------------------------------------------------------


def _v25_up(conn: sqlite3.Connection) -> None:
    """Add locked flag to sprint_contracts.

    locked=0: operator may PUT updates to the contract.
    locked=1: contract is frozen because the Engineer has accepted it;
              PUT returns 409 Conflict.

    Lock transitions are one-way for now (no unlock endpoint). Future:
    a "renegotiate" flow could unlock.
    """
    if not _column_exists(conn, "sprint_contracts", "locked"):
        conn.execute(
            "ALTER TABLE sprint_contracts ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;"
        )
        conn.commit()


def _v25_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    """SQLite < 3.35 cannot DROP COLUMN — no-op."""


# ---------------------------------------------------------------------------
# v26: sprint_contracts.updated_at (audit log for operator edits)
# ---------------------------------------------------------------------------


def _v26_up(conn: sqlite3.Connection) -> None:
    """Add updated_at to sprint_contracts.

    created_at is preserved (the contract was authored once). updated_at
    tracks operator-side edits via PUT /api/tasks/.../sprint-contract.
    Existing rows backfill updated_at = created_at so the audit log has
    a sensible baseline.
    """
    if not _column_exists(conn, "sprint_contracts", "updated_at"):
        conn.execute(
            "ALTER TABLE sprint_contracts ADD COLUMN updated_at REAL NOT NULL DEFAULT 0;"
        )
        conn.execute(
            "UPDATE sprint_contracts SET updated_at = created_at WHERE updated_at = 0;"
        )
        conn.commit()


def _v26_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    """SQLite < 3.35 cannot DROP COLUMN — no-op."""


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
    ("v10_kvstore", _v10_up, _v10_down),
    ("v11_dedup_unique_indexes", _v11_up, _v11_down),
    ("v12_sprint_contracts_qa_scores", _v12_up, _v12_down),
    ("v13_company_status_purpose", _v13_up, _v13_down),
    ("v14_agents_company_id", _v14_up, _v14_down),
    ("v15_route_executions_cost", _v15_up, _v15_down),
    ("v16_messages_group_id", _v16_up, _v16_down),
    ("v17_route_executions_last_activity_at", _v17_up, _v17_down),
    ("v18_node_events", _v18_up, _v18_down),
    ("v19_fencing_token", _v19_up, _v19_down),
    ("v20_tombstone", _v20_up, _v20_down),
    ("v21_issue_goal_project_linkage", _v21_up, _v21_down),
    ("v22_agent_budget_governance", _v22_up, _v22_down),
    ("v23_budget_transactions", _v23_up, _v23_down),
    ("v24_agent_allowed_tools", _v24_up, _v24_down),
    ("v25_sprint_contracts_locked", _v25_up, _v25_down),
    ("v26_sprint_contracts_updated_at", _v26_up, _v26_down),
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
