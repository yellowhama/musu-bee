//! Schema v1 DDL — wiki/492 §4 byte-exact column freeze.
//!
//! Each statement here was verified against R1 handler INSERT/SELECT
//! statements (companies.rs:148-160, tasks.rs:96-108, run.rs:75-87,
//! audit.rs:65-77, dedup.rs:104-110). Drift = HIGH Critic finding.
//!
//! All CREATE TABLEs use `IF NOT EXISTS` (idempotent) and `STRICT` mode
//! (SQLite 3.37+; sqlx 0.7 bundles ≥3.41). Indexes use `IF NOT EXISTS`.
//!
//! **Invariant (Critic H-1)**: `audit_log.company_id` has NO foreign key.
//! audit_log is forensic; rows must outlive companies. Builder MUST NOT
//! add a FK declaration on audit_log.company_id even if "consistency"
//! tempts it. Integration test `audit_log_company_id_is_not_fk` verifies.

/// All schema-v1 DDL statements applied as a unit (wiki/492 §4).
///
/// Order matters: companies BEFORE route_executions (FK target).
/// Each statement is idempotent (`IF NOT EXISTS`) — re-running is a no-op.
pub const SCHEMA_V1_STATEMENTS: &[&str] = &[
    // ---- §4.1 companies (10 cols + 2 indexes) ----
    "CREATE TABLE IF NOT EXISTS companies (
        id            TEXT    NOT NULL PRIMARY KEY,
        name          TEXT    NOT NULL,
        workspace_id  TEXT    NOT NULL DEFAULT '',
        status        TEXT    NOT NULL DEFAULT 'draft',
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        meta          TEXT    NOT NULL DEFAULT '{}',
        purpose       TEXT    NOT NULL DEFAULT '',
        work_dir      TEXT    NOT NULL DEFAULT '',
        test_cmd      TEXT    NOT NULL DEFAULT 'python -m pytest -q'
    ) STRICT",
    "CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_companies_status    ON companies(status)",
    // ---- §4.2 route_executions (7 cols + 3 indexes; FK→companies SET NULL) ----
    "CREATE TABLE IF NOT EXISTS route_executions (
        task_id      TEXT    NOT NULL PRIMARY KEY,
        company_id   TEXT,
        channel      TEXT    NOT NULL,
        sender_id    TEXT    NOT NULL,
        input_hash   TEXT    NOT NULL,
        status       TEXT    NOT NULL DEFAULT 'pending',
        created_at   INTEGER NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    ) STRICT",
    "CREATE INDEX IF NOT EXISTS idx_route_exec_created ON route_executions(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_route_exec_status  ON route_executions(status)",
    "CREATE INDEX IF NOT EXISTS idx_route_exec_hash    ON route_executions(input_hash)",
    // ---- §4.3 audit_log (9 cols, AUTOINCREMENT id, NO FK on company_id) ----
    // Critic H-1 invariant: company_id is a forensic string ref, NEVER a FK.
    "CREATE TABLE IF NOT EXISTS audit_log (
        id           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        ts           INTEGER NOT NULL,
        actor_ip     TEXT    NOT NULL,
        method       TEXT    NOT NULL,
        path         TEXT    NOT NULL,
        status_code  INTEGER NOT NULL,
        agent_id     TEXT,
        note         TEXT,
        company_id   TEXT
    ) STRICT",
    "CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_log(ts)",
    "CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log(company_id)",
    // ---- §4.4 machines (8 cols + 1 index; R3+ readiness) ----
    "CREATE TABLE IF NOT EXISTS machines (
        id              TEXT    NOT NULL PRIMARY KEY,
        name            TEXT    NOT NULL,
        url             TEXT    NOT NULL,
        tailscale_ip    TEXT,
        capacity_json   TEXT    NOT NULL DEFAULT '{}',
        last_seen_at    INTEGER,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
    ) STRICT",
    "CREATE INDEX IF NOT EXISTS idx_machines_last_seen ON machines(last_seen_at)",
];

/// Schema-v2 ALTER TABLE statements — wiki/495 §4.
///
/// All additions are NULLable (no DEFAULT) so existing rows survive the
/// migration with NULLs in the new columns. Builder UPDATEs populate them
/// per-task as runs complete.
///
/// Order doesn't matter (each ALTER is independent), but listed in the
/// order columns appear in the post-migration row.
///
/// 6 cols (Critic C3 added `started_at`):
///   - `output` TEXT          — final claude assistant text (SQLite-only per Q3)
///   - `error` TEXT           — first stderr line OR runner error context
///   - `exit_code` INTEGER    — claude subprocess return code (NULL on cancel)
///   - `duration_sec` REAL    — wall-clock seconds from spawn to terminal
///   - `started_at` INTEGER   — set when subprocess actually spawns (post-queue admission)
///   - `updated_at` INTEGER   — bumped on every status transition
pub const SCHEMA_V2_ALTER_STATEMENTS: &[&str] = &[
    "ALTER TABLE route_executions ADD COLUMN output       TEXT",
    "ALTER TABLE route_executions ADD COLUMN error        TEXT",
    "ALTER TABLE route_executions ADD COLUMN exit_code    INTEGER",
    "ALTER TABLE route_executions ADD COLUMN duration_sec REAL",
    "ALTER TABLE route_executions ADD COLUMN started_at   INTEGER",
    "ALTER TABLE route_executions ADD COLUMN updated_at   INTEGER",
];

/// Schema-v3 ALTER TABLE statement — wiki/511 §2 (W12).
///
/// Adds `cross_machine` to audit_log: INTEGER (SQLite boolean, 0/1).
/// NULLable, no DEFAULT — existing rows get NULL (= unknown/local).
/// V27 uses this for cross-machine task delegation measurement
/// (master plan §9.13: weekly ≥5 triggers V27 entry).
///
/// No index: low cardinality (boolean), read via full-table scans in
/// reporting queries only.
pub const SCHEMA_V3_ALTER_STATEMENTS: &[&str] = &[
    "ALTER TABLE audit_log ADD COLUMN cross_machine INTEGER",
];

/// Schema-v4 DDL statements — wiki/512 §4 (W9).
///
/// Adds workflow DAG tables. Two new tables:
///   - `workflows`: top-level workflow with spec_json blob
///   - `workflow_steps`: per-agent steps with dependency tracking
///
/// Schema matches Python `musu-bridge/handlers.py:2697-2756` table shape
/// (1:1 column parity for cross-bridge compatibility).
///
/// Uses TEXT timestamps (ISO-8601) instead of INTEGER for consistency with
/// the Python bridge's datetime strings. FK cascade on steps → workflows.
pub const SCHEMA_V4_STATEMENTS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS workflows (
        id          TEXT NOT NULL PRIMARY KEY,
        company_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        spec_json   TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY (company_id) REFERENCES companies(id)
    )",
    "CREATE TABLE IF NOT EXISTS workflow_steps (
        id              TEXT    NOT NULL PRIMARY KEY,
        workflow_id     TEXT    NOT NULL,
        agent_id        TEXT    NOT NULL,
        assigned_pc     TEXT,
        status          TEXT    NOT NULL DEFAULT 'pending',
        depends_on_json TEXT    NOT NULL DEFAULT '[]',
        input_json      TEXT,
        started_at      TEXT,
        finished_at     TEXT,
        updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        retry_count     INTEGER NOT NULL DEFAULT 0,
        result_json     TEXT,
        error_json      TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
    )",
    "CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id)",
    "CREATE INDEX IF NOT EXISTS idx_workflow_steps_status   ON workflow_steps(status, assigned_pc)",
];

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::{Row, SqlitePool};
    use std::str::FromStr;

    /// Create an in-memory SQLite pool for tests.
    async fn mem_pool() -> SqlitePool {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .create_if_missing(true);
        SqlitePoolOptions::new()
            .max_connections(1) // shared :memory: requires single conn
            .connect_with(opts)
            .await
            .expect("mem pool")
    }

    async fn apply_all(pool: &SqlitePool) {
        for stmt in SCHEMA_V1_STATEMENTS {
            sqlx::query(stmt).execute(pool).await.expect(stmt);
        }
    }

    #[tokio::test]
    async fn all_v1_tables_create() {
        let pool = mem_pool().await;
        apply_all(&pool).await;

        for tbl in ["companies", "route_executions", "audit_log", "machines"] {
            let row = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
                .bind(tbl)
                .fetch_optional(&pool)
                .await
                .expect("query");
            assert!(row.is_some(), "table {tbl} not created");
        }
    }

    #[tokio::test]
    async fn strict_mode_rejects_type_mismatch() {
        // Critic L-3b: STRICT mode must reject string → INTEGER column.
        let pool = mem_pool().await;
        apply_all(&pool).await;

        // companies.created_at is INTEGER NOT NULL; bind a string.
        let res = sqlx::query(
            "INSERT INTO companies (id, name, created_at, updated_at) \
             VALUES ('test', 'Test', 'not-an-integer', 0)",
        )
        .execute(&pool)
        .await;
        assert!(
            res.is_err(),
            "STRICT mode should reject string → INTEGER, got: {res:?}"
        );
    }

    #[tokio::test]
    async fn audit_log_company_id_is_not_fk() {
        // Critic H-1: audit_log.company_id has NO FK. INSERT with
        // nonexistent company_id MUST succeed even with foreign_keys=ON.
        let pool = mem_pool().await;
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        apply_all(&pool).await;

        // Insert audit row with company_id that does not exist in companies.
        let res = sqlx::query(
            "INSERT INTO audit_log (ts, actor_ip, method, path, status_code, company_id) \
             VALUES (1, '127.0.0.1', 'GET', '/x', 200, 'company-does-not-exist')",
        )
        .execute(&pool)
        .await;
        assert!(
            res.is_ok(),
            "audit_log.company_id must NOT be a FK; insert failed: {res:?}"
        );

        // Sanity check: inserting into route_executions.company_id pointing
        // at a nonexistent company SHOULD fail (this one IS a FK).
        let res2 = sqlx::query(
            "INSERT INTO route_executions \
             (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
             VALUES ('t1', 'company-does-not-exist', 'ch', 's', 'h', 'pending', 1)",
        )
        .execute(&pool)
        .await;
        assert!(
            res2.is_err(),
            "route_executions.company_id IS a FK; insert should have failed"
        );
    }

    #[tokio::test]
    async fn companies_columns_match_r1_insert() {
        // Bind every column R1's companies.rs:148-160 INSERT touches.
        let pool = mem_pool().await;
        apply_all(&pool).await;
        let res = sqlx::query(
            "INSERT INTO companies \
             (id, name, workspace_id, status, created_at, updated_at, \
              meta, purpose, work_dir, test_cmd) \
             VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)",
        )
        .bind("c1")
        .bind("Test Co")
        .bind("")
        .bind(1i64)
        .bind(1i64)
        .bind("{}")
        .bind("")
        .bind("")
        .bind("python -m pytest -q")
        .execute(&pool)
        .await;
        assert!(res.is_ok(), "R1 companies INSERT failed: {res:?}");
    }

    #[tokio::test]
    async fn route_executions_columns_match_r1_insert() {
        // Bind every column R1's tasks.rs:96-108 INSERT touches.
        let pool = mem_pool().await;
        apply_all(&pool).await;
        let res = sqlx::query(
            "INSERT INTO route_executions \
             (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
             VALUES (?, ?, ?, ?, ?, 'pending', ?)",
        )
        .bind("t1")
        .bind::<Option<String>>(None) // FK passes on NULL
        .bind("ch")
        .bind("sender")
        .bind("hash")
        .bind(1i64)
        .execute(&pool)
        .await;
        assert!(res.is_ok(), "R1 route_executions INSERT failed: {res:?}");
    }

    #[tokio::test]
    async fn audit_log_columns_match_r1_insert() {
        // Bind every column R1's audit.rs:65-77 INSERT touches.
        let pool = mem_pool().await;
        apply_all(&pool).await;
        let res = sqlx::query(
            "INSERT INTO audit_log \
             (ts, actor_ip, method, path, status_code, agent_id, note, company_id) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(1i64)
        .bind("127.0.0.1")
        .bind("GET")
        .bind("/x")
        .bind(200i64)
        .bind::<Option<String>>(None)
        .bind::<Option<String>>(None)
        .bind::<Option<String>>(None)
        .execute(&pool)
        .await;
        assert!(res.is_ok(), "R1 audit_log INSERT failed: {res:?}");

        // id must AUTOINCREMENT.
        let row = sqlx::query("SELECT id FROM audit_log LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        let id: i64 = row.try_get("id").unwrap();
        assert!(id >= 1, "AUTOINCREMENT should start at 1");
    }
}
