//! PRAGMA application — wiki/492 §5.2.
//!
//! Applied at every connection (sqlx pool already configures journal_mode +
//! busy_timeout at acquisition; this fn doubles down at apply-time so a
//! migration always observes the intended policy). Idempotent.
//!
//! Policy:
//!   journal_mode = WAL          (concurrent readers; better crash recovery)
//!   synchronous  = NORMAL       (fsync on checkpoint only; WAL-friendly)
//!   temp_store   = MEMORY       (no /tmp churn for sort/join scratch)
//!   foreign_keys = ON           (route_executions.company_id enforced)
//!   busy_timeout = 5000 ms      (matches sqlx pool's acquire timeout)
//!
//! **Critic H-1 invariant**: foreign_keys=ON is safe ONLY because audit_log
//! has no FK on company_id (see schema.rs §4.3). If a future schema adds a
//! FK on audit_log.company_id, audit writes will start failing silently
//! per C-SEC-10 (warn-only). Don't.

use anyhow::Result;
use sqlx::SqlitePool;

/// Apply the schema-v1 PRAGMA policy to a pool. Safe to call repeatedly.
///
/// Returns an error if any PRAGMA fails to set. WAL set is non-persistent
/// at the per-pool level for `:memory:` DBs (which use MEMORY journal); we
/// tolerate that by ignoring the WAL response value — the file-backed DB
/// will pick it up persistently.
pub async fn apply_pragmas(pool: &SqlitePool) -> Result<()> {
    // WAL set returns the resulting mode; in-memory DBs return "memory".
    // We don't enforce the response — file-backed musu.db will be WAL.
    let _: Result<(), sqlx::Error> = sqlx::query("PRAGMA journal_mode = WAL")
        .execute(pool)
        .await
        .map(|_| ());

    sqlx::query("PRAGMA synchronous = NORMAL")
        .execute(pool)
        .await
        .map_err(|e| anyhow::anyhow!("PRAGMA synchronous: {e}"))?;

    sqlx::query("PRAGMA temp_store = MEMORY")
        .execute(pool)
        .await
        .map_err(|e| anyhow::anyhow!("PRAGMA temp_store: {e}"))?;

    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(pool)
        .await
        .map_err(|e| anyhow::anyhow!("PRAGMA foreign_keys: {e}"))?;

    sqlx::query("PRAGMA busy_timeout = 5000")
        .execute(pool)
        .await
        .map_err(|e| anyhow::anyhow!("PRAGMA busy_timeout: {e}"))?;

    tracing::debug!("schema-v1 pragmas applied");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::schema::SCHEMA_V1_STATEMENTS;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::Row;
    use std::str::FromStr;

    async fn mem_pool() -> SqlitePool {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .create_if_missing(true);
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn foreign_keys_enabled_after_apply() {
        let pool = mem_pool().await;
        apply_pragmas(&pool).await.unwrap();
        let row = sqlx::query("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        // PRAGMA foreign_keys returns INTEGER 0 or 1.
        let v: i64 = row.try_get(0).unwrap();
        assert_eq!(v, 1, "foreign_keys must be ON after apply_pragmas");
    }

    #[tokio::test]
    async fn foreign_keys_actually_enforces() {
        // Critic L-3a: don't trust the PRAGMA pragma_foreign_keys return —
        // demonstrate FK enforcement by inserting an FK-violating row.
        let pool = mem_pool().await;
        apply_pragmas(&pool).await.unwrap();
        for stmt in SCHEMA_V1_STATEMENTS {
            sqlx::query(stmt).execute(&pool).await.unwrap();
        }

        // route_executions.company_id → companies(id). Insert with a
        // company_id that doesn't exist; FK ON should reject.
        let res = sqlx::query(
            "INSERT INTO route_executions \
             (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
             VALUES ('t', 'ghost', 'c', 's', 'h', 'pending', 1)",
        )
        .execute(&pool)
        .await;
        assert!(
            res.is_err(),
            "FK violation should error when foreign_keys=ON; got: {res:?}"
        );
    }

    #[tokio::test]
    async fn busy_timeout_is_set() {
        let pool = mem_pool().await;
        apply_pragmas(&pool).await.unwrap();
        let row = sqlx::query("PRAGMA busy_timeout")
            .fetch_one(&pool)
            .await
            .unwrap();
        let v: i64 = row.try_get(0).unwrap();
        assert_eq!(v, 5000, "busy_timeout should be 5000ms");
    }
}
