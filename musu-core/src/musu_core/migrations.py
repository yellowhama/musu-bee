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


# ---------------------------------------------------------------------------
# v27: node_runtimes (fleet capability state per (node, runtime))
# ---------------------------------------------------------------------------


def _v27_up(conn: sqlite3.Connection) -> None:
    """Create node_runtimes table for fleet capability tracking.

    Schema mirrors musu_core.fleet.runtimes.RuntimeCapability one-for-one.
    Inspired by Kubernetes NodeCondition + Nomad fingerprints — status
    (presence) and health (works?) are deliberately separate columns
    rather than collapsed into one "state" field, so dashboards can tell
    "binary missing" apart from "binary present but probe failed."

    schema_version is forward-compat insurance because CLAUDE.md treats
    DB migrations as gated on explicit user approval; better to ship an
    unused INTEGER column now than to ask again later.

    Three timestamp columns are intentional and not redundant:
      detected_at           — last successful detection (K8s lastTransitionTime
                              for the success case)
      last_probe_attempt_at — last attempt regardless of outcome
      state_changed_at      — when status or health actually flipped
    All three are unix-float seconds matching v26's pattern.

    PK (node_name, runtime_name) makes UPSERT natural and prevents the
    "same node logs two rows for the same runtime" foot-gun.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS node_runtimes (
            node_name             TEXT NOT NULL,
            runtime_name          TEXT NOT NULL,
            status                TEXT NOT NULL,
            health                TEXT NOT NULL DEFAULT 'unknown',
            reason                TEXT NOT NULL DEFAULT '',
            version               TEXT NOT NULL DEFAULT '',
            detection_method      TEXT NOT NULL DEFAULT '',
            binary_path           TEXT NOT NULL DEFAULT '',
            notes                 TEXT NOT NULL DEFAULT '',
            probe_error           TEXT NOT NULL DEFAULT '',
            detected_at           REAL NOT NULL DEFAULT 0,
            last_probe_attempt_at REAL NOT NULL DEFAULT 0,
            state_changed_at      REAL NOT NULL DEFAULT 0,
            schema_version        INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (node_name, runtime_name)
        );
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_node_runtimes_node ON node_runtimes(node_name);"
    )
    conn.commit()


def _v27_down(conn: sqlite3.Connection) -> None:
    """Drop the node_runtimes table (only fully reversible v27 contents)."""
    conn.execute("DROP INDEX IF EXISTS idx_node_runtimes_node;")
    conn.execute("DROP TABLE IF EXISTS node_runtimes;")
    conn.commit()


def _v28_up(conn: sqlite3.Connection) -> None:
    """v19.A: agent hierarchy (reports_to) + heartbeat run model.

    Four schema changes in one migration:

      1. agents.reports_to (self-FK, NULL = top-level / CEO candidate).
         ON DELETE SET NULL — losing a manager promotes subordinates to
         top-level rather than cascading the loss across the company.

      2. heartbeat_runs — Paperclip-style run lifecycle. Each row is one
         agent execution triggered by a wake event. parent_run_id is a
         self-FK that records "CEO woke this subordinate", used by the
         dispatcher's cycle detection (Phase 2/3, not enforced at the
         schema level).

      3. heartbeat_run_events — append-only event stream per run.
         event_type is intentionally not CHECK-constrained so new event
         types (tool_call, approval_request, message_delta, ...) can be
         added without further migrations. The composite index
         (run_id, created_at) is what makes "play back this run's
         timeline" cheap.

      4. agent_sessions — first-class conversation container. The
         existing messages.session_id (TEXT) is left as-is; only new
         sessions get a real PK. A future migration can backfill if the
         lack of FK integrity bites.

    ALTER TABLE ADD COLUMN is gated by PRAGMA table_info() because SQLite
    < 3.35 lacks ADD COLUMN IF NOT EXISTS and we cannot raise the minimum
    SQLite version for downstream users.
    """
    # 1. agents.reports_to
    cols = {row[1] for row in conn.execute("PRAGMA table_info(agents)").fetchall()}
    if "reports_to" not in cols:
        conn.execute(
            "ALTER TABLE agents ADD COLUMN reports_to TEXT "
            "REFERENCES agents(id) ON DELETE SET NULL"
        )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON agents(reports_to)"
    )

    # 2. heartbeat_runs
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS heartbeat_runs (
            id              TEXT PRIMARY KEY,
            agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            issue_id        TEXT REFERENCES issues(id) ON DELETE SET NULL,
            parent_run_id   TEXT REFERENCES heartbeat_runs(id) ON DELETE SET NULL,
            wake_reason     TEXT NOT NULL,
            wake_payload    TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','running','waiting_approval','completed','failed','cancelled')),
            summary         TEXT NOT NULL DEFAULT '',
            error           TEXT NOT NULL DEFAULT '',
            started_at      TEXT,
            ended_at        TEXT,
            created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_agent ON heartbeat_runs(agent_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_issue ON heartbeat_runs(issue_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_status ON heartbeat_runs(status)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_parent ON heartbeat_runs(parent_run_id)"
    )

    # 3. heartbeat_run_events
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS heartbeat_run_events (
            id              TEXT PRIMARY KEY,
            run_id          TEXT NOT NULL REFERENCES heartbeat_runs(id) ON DELETE CASCADE,
            event_type      TEXT NOT NULL,
            payload         TEXT NOT NULL DEFAULT '{}',
            created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_heartbeat_run_events_run "
        "ON heartbeat_run_events(run_id, created_at)"
    )

    # 4. agent_sessions
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_sessions (
            id              TEXT PRIMARY KEY,
            agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            user_id         TEXT NOT NULL DEFAULT '',
            title           TEXT NOT NULL DEFAULT '',
            meta            TEXT NOT NULL DEFAULT '{}',
            started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            ended_at        TEXT,
            last_message_at TEXT,
            message_count   INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions(user_id)"
    )

    conn.commit()


def _v28_down(conn: sqlite3.Connection) -> None:
    """Roll back v28.

    Drops the three new tables and the agents.reports_to index. The
    column itself is dropped via ALTER TABLE DROP COLUMN, which requires
    SQLite >= 3.35; on older runtimes the column harmlessly remains
    (NULL for every row). This matches v25's "graceful older-SQLite"
    pattern.
    """
    conn.execute("DROP INDEX IF EXISTS idx_agent_sessions_user")
    conn.execute("DROP INDEX IF EXISTS idx_agent_sessions_agent")
    conn.execute("DROP TABLE IF EXISTS agent_sessions")
    conn.execute("DROP INDEX IF EXISTS idx_heartbeat_run_events_run")
    conn.execute("DROP TABLE IF EXISTS heartbeat_run_events")
    conn.execute("DROP INDEX IF EXISTS idx_heartbeat_runs_parent")
    conn.execute("DROP INDEX IF EXISTS idx_heartbeat_runs_status")
    conn.execute("DROP INDEX IF EXISTS idx_heartbeat_runs_issue")
    conn.execute("DROP INDEX IF EXISTS idx_heartbeat_runs_agent")
    conn.execute("DROP TABLE IF EXISTS heartbeat_runs")
    conn.execute("DROP INDEX IF EXISTS idx_agents_reports_to")
    try:
        conn.execute("ALTER TABLE agents DROP COLUMN reports_to")
    except sqlite3.OperationalError:
        pass
    conn.commit()


# ---------------------------------------------------------------------------
# v29: dispatch hardening — run_approvals table + agents.home_node column
# ---------------------------------------------------------------------------


def _v29_up(conn: sqlite3.Connection) -> None:
    """v19.C: run-level user approvals + multi-machine agent routing.

    Two schema additions:

      1. run_approvals — one row per request_approval(prompt) call inside
         an adapter. The dispatcher transitions the parent heartbeat_run to
         status='waiting_approval' in the same transaction as inserting the
         pending row. Partial index on status='pending' speeds the "show
         unanswered approvals" query without bloating index size for
         resolved history.

      2. agents.home_node — names which mesh node the agent runs on. NULL
         or empty keeps the v19.A/B "wherever the dispatcher runs" default.
         No FK to a nodes table because nodes live in nodes.toml; a bogus
         value surfaces as "peer unreachable" at wake time.

    ALTER TABLE ADD COLUMN is PRAGMA-gated (matches the v28 idiom for
    SQLite < 3.35 compatibility on downstream installs).
    """
    # 1. run_approvals
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS run_approvals (
            id           TEXT PRIMARY KEY,
            run_id       TEXT NOT NULL REFERENCES heartbeat_runs(id) ON DELETE CASCADE,
            prompt       TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','declined')),
            requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            responded_at TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_run_approvals_run ON run_approvals(run_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_run_approvals_pending "
        "ON run_approvals(status) WHERE status='pending'"
    )

    # 2. agents.home_node
    cols = {row[1] for row in conn.execute("PRAGMA table_info(agents)").fetchall()}
    if "home_node" not in cols:
        conn.execute("ALTER TABLE agents ADD COLUMN home_node TEXT DEFAULT NULL")

    conn.commit()


def _v29_down(conn: sqlite3.Connection) -> None:
    """Roll back v29.

    Drops run_approvals + indexes. agents.home_node is dropped where SQLite
    supports DROP COLUMN (>=3.35); older runtimes leave it as a harmless
    NULL column — matches the v28_down "graceful older-SQLite" pattern.
    """
    conn.execute("DROP INDEX IF EXISTS idx_run_approvals_pending")
    conn.execute("DROP INDEX IF EXISTS idx_run_approvals_run")
    conn.execute("DROP TABLE IF EXISTS run_approvals")
    try:
        conn.execute("ALTER TABLE agents DROP COLUMN home_node")
    except sqlite3.OperationalError:
        pass
    conn.commit()


# ---------------------------------------------------------------------------
# v30: explicit monotonic seq on heartbeat_run_events
# ---------------------------------------------------------------------------


def _v30_up(conn: sqlite3.Connection) -> None:
    """v19.E: explicit monotonic seq column on heartbeat_run_events.

    Problem this fixes: v19.A through v19.D ordered events by
    (created_at, id) or (created_at, rowid). created_at has only ms
    resolution; id is uuid hex (alphabetic, non-temporal); rowid is
    monotonic per INSERT but is a SQLite implementation detail. Same-
    ms event bursts could reorder non-deterministically.

    Schema additions:
      - heartbeat_run_events.seq INTEGER NOT NULL DEFAULT 0
      - UNIQUE INDEX on seq (also speeds the MAX(seq) lookup that
        record_event runs on every INSERT post-v30)

    Backfill: SET seq = rowid for all existing rows. SQLite rowid is
    monotonic per INSERT in this connection, so this preserves the
    v19.D-era ordering exactly — no historical event reorders at the
    migration moment.

    Forward INSERTs (post-migration): record_event computes
    `COALESCE(MAX(seq), 0) + 1` before each INSERT. The Database._lock
    around execute() serializes record_event calls in-process; SQLite
    WAL handles disk-level durability.

    Why not AUTOINCREMENT: SQLite refuses `ALTER TABLE ADD COLUMN
    ... AUTOINCREMENT` (`near "AUTOINCREMENT": syntax error`).
    AUTOINCREMENT works only inside CREATE TABLE and only on INTEGER
    PRIMARY KEY columns. Computed-in-record_event is the simplest
    alternative.
    """
    cols = {
        row[1]
        for row in conn.execute(
            "PRAGMA table_info(heartbeat_run_events)"
        ).fetchall()
    }
    if "seq" not in cols:
        conn.execute(
            "ALTER TABLE heartbeat_run_events "
            "ADD COLUMN seq INTEGER NOT NULL DEFAULT 0"
        )
        conn.execute(
            "UPDATE heartbeat_run_events SET seq = rowid"
        )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS "
        "idx_heartbeat_run_events_seq ON heartbeat_run_events(seq)"
    )
    conn.commit()


def _v30_down(conn: sqlite3.Connection) -> None:
    """Roll back v30 — drop seq index and column.

    On SQLite < 3.35 the column drop is a no-op; the column remains
    at its DEFAULT (0). This matches v28/v29's graceful-older-SQLite
    pattern.
    """
    conn.execute("DROP INDEX IF EXISTS idx_heartbeat_run_events_seq")
    try:
        conn.execute(
            "ALTER TABLE heartbeat_run_events DROP COLUMN seq"
        )
    except sqlite3.OperationalError:
        pass
    conn.commit()


def _v31_up(conn: sqlite3.Connection) -> None:
    """v19.F Phase B: operational counters for dispatch.

    Adds dispatch_counters table with 3 seed rows for the orphan-
    resume observability story. Counter increments come from
    submit_approval branches via dispatch.counters.increment_counter.

    Idempotent: CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE on seeds.
    Re-running on an already-upgraded DB is a no-op.
    """
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dispatch_counters ("
        "name  TEXT PRIMARY KEY, "
        "value INTEGER NOT NULL DEFAULT 0"
        ")"
    )
    conn.execute(
        "INSERT OR IGNORE INTO dispatch_counters (name, value) VALUES "
        "('approvals_resolved_in_memory', 0), "
        "('approvals_resolved_orphan_resume', 0), "
        "('approvals_declined_orphan', 0)"
    )
    conn.commit()


def _v31_down(conn: sqlite3.Connection) -> None:
    """Roll back v31 — drop dispatch_counters table."""
    conn.execute("DROP TABLE IF EXISTS dispatch_counters")
    conn.commit()


def _v32_up(conn: sqlite3.Connection) -> None:
    """v19.F.2 Phase C: row-level approval state for multi-process bridge.

    Adds heartbeat_runs.approval_status (NULL / 'pending' / 'approved' /
    'declined') with a partial index on non-NULL values. The column is
    a mirror of the existing run_approvals.status atomicity guard; it
    makes run-level approval state directly observable from
    heartbeat_runs without a join, and provides defense-in-depth for
    cross-process bridge deployments.

    Idempotent: PRAGMA table_info gated. Re-running on an upgraded DB
    is a no-op.
    """
    cols = {row[1] for row in conn.execute(
        "PRAGMA table_info(heartbeat_runs)"
    ).fetchall()}
    if "approval_status" not in cols:
        conn.execute(
            "ALTER TABLE heartbeat_runs ADD COLUMN approval_status TEXT NULL"
        )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_approval_status_run "
        "ON heartbeat_runs(approval_status) "
        "WHERE approval_status IS NOT NULL"
    )
    conn.commit()


def _v32_down(conn: sqlite3.Connection) -> None:
    """Roll back v32 — drop partial index + approval_status column.

    On SQLite < 3.35 the column drop is a no-op; the column stays at
    NULL. Matches v28/v29/v30 graceful-older-SQLite pattern.
    """
    conn.execute("DROP INDEX IF EXISTS idx_approval_status_run")
    try:
        conn.execute(
            "ALTER TABLE heartbeat_runs DROP COLUMN approval_status"
        )
    except sqlite3.OperationalError:
        pass
    conn.commit()


def _v33_up(conn: sqlite3.Connection) -> None:
    """v21.B: machines table + machine_id FK columns on agents and
    heartbeat_runs.

    machines = K8s Node equivalent. One row per user device, registered
    when the bridge starts. capacity_json carries GPU + CPU + memory
    inventory (v34 will normalize into separate machine_capacity table).

    Note: wiki/347 §4 21.B originally said "companies + machines + FKs"
    but `companies` already exists in db.py:_SCHEMA. v33 = machines new
    + 2 FK columns on existing tables.

    Idempotent: CREATE TABLE IF NOT EXISTS + PRAGMA-gated column adds.
    Re-running on an upgraded DB is a no-op.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS machines (
            id            TEXT PRIMARY KEY,
            hostname      TEXT NOT NULL DEFAULT '',
            os            TEXT NOT NULL DEFAULT '',
            arch          TEXT NOT NULL DEFAULT '',
            capacity_json TEXT NOT NULL DEFAULT '{}',
            status        TEXT NOT NULL DEFAULT 'online'
                          CHECK (status IN ('online','offline','draining')),
            last_seen_at  TEXT,
            created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status)"
    )

    agent_cols = {row[1] for row in conn.execute(
        "PRAGMA table_info(agents)"
    ).fetchall()}
    if "machine_id" not in agent_cols:
        conn.execute(
            "ALTER TABLE agents ADD COLUMN machine_id TEXT "
            "REFERENCES machines(id) ON DELETE SET NULL"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agents_machine "
            "ON agents(machine_id) WHERE machine_id IS NOT NULL"
        )

    hb_cols = {row[1] for row in conn.execute(
        "PRAGMA table_info(heartbeat_runs)"
    ).fetchall()}
    if "machine_id" not in hb_cols:
        conn.execute(
            "ALTER TABLE heartbeat_runs ADD COLUMN machine_id TEXT "
            "REFERENCES machines(id) ON DELETE SET NULL"
        )
    if "resource_class" not in hb_cols:
        conn.execute(
            "ALTER TABLE heartbeat_runs ADD COLUMN resource_class TEXT"
        )
    conn.commit()


def _v33_down(conn: sqlite3.Connection) -> None:
    """Roll back v33 — drop machine_id columns + machines table.

    On SQLite <3.35 column drops are no-op; matches v28/v29/v32 pattern.
    """
    conn.execute("DROP INDEX IF EXISTS idx_agents_machine")
    for stmt in (
        "ALTER TABLE agents DROP COLUMN machine_id",
        "ALTER TABLE heartbeat_runs DROP COLUMN machine_id",
        "ALTER TABLE heartbeat_runs DROP COLUMN resource_class",
    ):
        try:
            conn.execute(stmt)
        except sqlite3.OperationalError:
            pass
    conn.execute("DROP INDEX IF EXISTS idx_machines_status")
    conn.execute("DROP TABLE IF EXISTS machines")
    conn.commit()


def _v34_up(conn: sqlite3.Connection) -> None:
    """v21.C: resource_requests — agent run queue for the scheduler.

    CEO controller inserts pending rows; SchedulerReconciler reads
    pending in (priority DESC, created_at) order, filters/scores
    machines (using machine_capacity v35), atomically binds via
    UPDATE WHERE bound_machine_id IS NULL.

    Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS resource_requests (
            id                TEXT PRIMARY KEY,
            company_id        TEXT REFERENCES companies(id) ON DELETE CASCADE,
            agent_id          TEXT REFERENCES agents(id) ON DELETE CASCADE,
            priority          INTEGER NOT NULL DEFAULT 0,
            requires_json     TEXT NOT NULL DEFAULT '{}',
            affinity_json     TEXT NOT NULL DEFAULT '{}',
            status            TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','bound','running','completed','failed','cancelled')),
            bound_machine_id  TEXT REFERENCES machines(id) ON DELETE SET NULL,
            bound_at          TEXT,
            completed_at      TEXT,
            error             TEXT,
            created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_resource_requests_pending "
        "ON resource_requests(priority DESC, created_at) "
        "WHERE status='pending'"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_resource_requests_company "
        "ON resource_requests(company_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_resource_requests_machine "
        "ON resource_requests(bound_machine_id) "
        "WHERE bound_machine_id IS NOT NULL"
    )
    conn.commit()


def _v34_down(conn: sqlite3.Connection) -> None:
    conn.execute("DROP INDEX IF EXISTS idx_resource_requests_pending")
    conn.execute("DROP INDEX IF EXISTS idx_resource_requests_company")
    conn.execute("DROP INDEX IF EXISTS idx_resource_requests_machine")
    conn.execute("DROP TABLE IF EXISTS resource_requests")
    conn.commit()


def _v35_up(conn: sqlite3.Connection) -> None:
    """v21.C: machine_capacity — per-machine resource availability.

    1:1 with machines (v33), separate table so bridges can heartbeat
    capacity without bumping machines.updated_at (would otherwise
    trigger watch storms on every heartbeat).
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS machine_capacity (
            machine_id           TEXT PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
            gpu_models_json      TEXT NOT NULL DEFAULT '[]',
            gpu_vram_total_gb    REAL NOT NULL DEFAULT 0,
            gpu_vram_free_gb     REAL NOT NULL DEFAULT 0,
            cpu_cores            INTEGER NOT NULL DEFAULT 0,
            cpu_idle_pct         REAL NOT NULL DEFAULT 0,
            mem_total_gb         REAL NOT NULL DEFAULT 0,
            mem_free_gb          REAL NOT NULL DEFAULT 0,
            runtime_classes_json TEXT NOT NULL DEFAULT '[]',
            last_heartbeat_at    TEXT,
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
        """
    )
    conn.commit()


def _v35_down(conn: sqlite3.Connection) -> None:
    conn.execute("DROP TABLE IF EXISTS machine_capacity")
    conn.commit()


def _v36_up(conn: sqlite3.Connection) -> None:
    """v21.D: agents.isolation_profile — JSON sandbox profile per agent.

    Stores an IsolationProfile (allow_read / allow_write / allow_net /
    cpu_secs / mem_mb / strip_env). The supervisor reads this column
    before spawning the agent and hands it to the platform-specific
    Isolation impl.

    NULL = no sandbox (legacy / opt-in rollout). Empty JSON object {}
    = sandbox with empty allowlists (deny everything).

    Idempotent: PRAGMA table_info gate before ALTER TABLE.
    """
    cols = {row[1] for row in conn.execute(
        "PRAGMA table_info(agents)"
    ).fetchall()}
    if "isolation_profile" not in cols:
        conn.execute(
            "ALTER TABLE agents ADD COLUMN isolation_profile TEXT"
        )
    conn.commit()


def _v36_down(conn: sqlite3.Connection) -> None:
    """Roll back v36 — drop isolation_profile column.

    SQLite ≥ 3.35 supports DROP COLUMN; for older we'd need rebuild.
    Wrap in a check; on older SQLite this is a no-op + logged.
    """
    cols = {row[1] for row in conn.execute(
        "PRAGMA table_info(agents)"
    ).fetchall()}
    if "isolation_profile" in cols:
        try:
            conn.execute("ALTER TABLE agents DROP COLUMN isolation_profile")
        except sqlite3.OperationalError:
            # SQLite < 3.35 — DROP COLUMN unsupported. Leave the column
            # in place; it's nullable so re-apply of _v36_up is a no-op.
            pass
    conn.commit()


def _v37_up(conn: sqlite3.Connection) -> None:
    """v37: workflows + workflow_steps tables for T2-A' asyncio executor.

    Per wiki/432 §2.1. Idempotent + atomic — single executescript with
    BEGIN/COMMIT. Mirrors _v3_up at :99 and _v4_up at :135 idiom.

    `assigned_pc REFERENCES machines(id) ON DELETE SET NULL`: per
    Researcher F-R7.1 — cascade would orphan steps mid-run; SET NULL
    lets executor treat as "needs reassignment" without deleting
    workflow state.

    `workflow_steps.updated_at`: per Auditor A-HIGH-1 (wiki/432 §12).
    `KindSource.timestamp_column` defaults to `"updated_at"`
    (controllers/sources.py:74). Without this column, SSE subscribe to
    workflow_steps raises sqlite3.OperationalError. All UPDATEs in
    handlers + executor MUST bump updated_at.
    """
    cur = conn.cursor()
    row = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='workflows'"
    ).fetchone()
    if row:
        return
    conn.executescript(
        """
        BEGIN;
        CREATE TABLE workflows (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            name TEXT NOT NULL,
            spec_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'paused', 'succeeded', 'failed', 'cancelled')),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_workflows_company ON workflows(company_id);
        CREATE INDEX idx_workflows_status ON workflows(status);

        CREATE TABLE workflow_steps (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            agent_id TEXT NOT NULL,
            assigned_pc TEXT REFERENCES machines(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'timeout', 'skipped')),
            input_json TEXT,
            result_json TEXT,
            error_json TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            depends_on_json TEXT NOT NULL DEFAULT '[]',
            started_at INTEGER,
            finished_at INTEGER,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1)
        );
        CREATE INDEX idx_workflow_steps_dispatch ON workflow_steps(assigned_pc, status);
        CREATE INDEX idx_workflow_steps_workflow ON workflow_steps(workflow_id);
        CREATE INDEX idx_workflow_steps_updated ON workflow_steps(updated_at);
        COMMIT;
        """
    )


def _v37_down(conn: sqlite3.Connection) -> None:
    """Roll back v37 — drop workflow_steps + workflows tables."""
    conn.executescript(
        """
        BEGIN;
        DROP INDEX IF EXISTS idx_workflow_steps_updated;
        DROP INDEX IF EXISTS idx_workflow_steps_workflow;
        DROP INDEX IF EXISTS idx_workflow_steps_dispatch;
        DROP TABLE IF EXISTS workflow_steps;
        DROP INDEX IF EXISTS idx_workflows_status;
        DROP INDEX IF EXISTS idx_workflows_company;
        DROP TABLE IF EXISTS workflows;
        COMMIT;
        """
    )


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
    ("v27_node_runtimes", _v27_up, _v27_down),
    ("v28_agent_hierarchy_and_runs", _v28_up, _v28_down),
    ("v29_dispatch_hardening", _v29_up, _v29_down),
    ("v30_event_seq", _v30_up, _v30_down),
    ("v31_dispatch_counters", _v31_up, _v31_down),
    ("v32_approval_status", _v32_up, _v32_down),
    ("v33_machines_and_fks", _v33_up, _v33_down),
    ("v34_resource_requests", _v34_up, _v34_down),
    ("v35_machine_capacity", _v35_up, _v35_down),
    ("v36_agents_isolation_profile", _v36_up, _v36_down),
    ("v37_workflows", _v37_up, _v37_down),
]


def get_user_version(conn: sqlite3.Connection) -> int:
    """Return the current SQLite PRAGMA user_version (schema watermark).

    Set by ``apply_pending`` after all migrations succeed; readiness probes
    (e.g. /health/ready) compare against ``len(MIGRATIONS)`` to detect a
    partially-applied or stale schema before serving traffic.
    """
    cur = conn.execute("PRAGMA user_version")
    row = cur.fetchone()
    return int(row[0]) if row is not None else 0


def apply_pending(conn: sqlite3.Connection) -> list[str]:
    """Apply all pending migrations and return labels of those that ran.

    After every up_fn returns successfully, writes ``PRAGMA user_version =
    len(MIGRATIONS)`` so readiness probes can assert schema completeness.
    The write is reached only when every migration succeeded — if any
    up_fn raises, control never reaches the PRAGMA write and the
    watermark stays at its prior value (or 0 on a fresh DB), so partial
    application is observable to /health/ready as schema_below_min.

    Note on transactionality: individual _v*_up implementations wrap their
    DDL in their own BEGIN/COMMIT via executescript, so each migration is
    already durable when this loop advances. The post-loop PRAGMA write
    therefore acts as a final "all green" watermark rather than a single
    atomic envelope around every DDL statement — which matches SQLite's
    semantics for PRAGMA user_version (auto-commits, not bound to the
    enclosing transaction in all builds).
    """
    applied: list[str] = []
    for label, up_fn, _ in MIGRATIONS:
        up_fn(conn)
        applied.append(label)
    # Watermark: only written when every migration above succeeded.
    conn.execute(f"PRAGMA user_version = {len(MIGRATIONS)}")
    conn.commit()
    return applied


def rollback(conn: sqlite3.Connection, label: str) -> bool:
    """Roll back a single named migration. Returns True if found."""
    for mig_label, _, down_fn in MIGRATIONS:
        if mig_label == label:
            down_fn(conn)
            return True
    return False
