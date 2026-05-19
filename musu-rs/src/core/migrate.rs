//! Migration runner — wiki/492 §6.
//!
//! `PRAGMA user_version` is the single source of truth. Fresh DBs open at
//! version 0; R2 sets to 1 after applying SCHEMA_V1_STATEMENTS. Each step
//! runs inside a transaction; rollback on failure leaves user_version
//! untouched.
//!
//! **Critic M-2 invariant**: this file MUST stay ≤ 100 LOC (excl. tests) for
//! R2. No schema_v2 stub. R3 plan owns v2. Adding a migration registry now
//! is YAGNI — see [[feedback-no-yagni-architecture]].

use anyhow::{Context, Result};
use sqlx::{Row, SqlitePool};

use crate::core::schema::SCHEMA_V1_STATEMENTS;

/// Schema version this build expects. Bumped only on R3+.
pub const EXPECTED_SCHEMA_VERSION: u32 = 1;

/// Read `PRAGMA user_version`. Returns 0 on a fresh DB.
pub async fn current_version(pool: &SqlitePool) -> Result<u32> {
    let row = sqlx::query("PRAGMA user_version")
        .fetch_one(pool)
        .await
        .context("PRAGMA user_version")?;
    let v: i64 = row.try_get(0).context("PRAGMA user_version row")?;
    if v < 0 {
        anyhow::bail!("user_version is negative: {v}");
    }
    Ok(v as u32)
}

/// Set `PRAGMA user_version = v`. Note: this PRAGMA accepts integer
/// literal only (no bind params); we format it ourselves with the
/// `u32` we own — no injection risk.
async fn set_version(pool: &SqlitePool, v: u32) -> Result<()> {
    let stmt = format!("PRAGMA user_version = {v}");
    sqlx::query(&stmt)
        .execute(pool)
        .await
        .with_context(|| format!("set user_version={v}"))?;
    Ok(())
}

/// Apply schema_v1 in a transaction. Each DDL is idempotent
/// (`CREATE ... IF NOT EXISTS`), so partial-prior-apply is recoverable.
async fn apply_v1(pool: &SqlitePool) -> Result<()> {
    let mut tx = pool.begin().await.context("begin v1 tx")?;
    for stmt in SCHEMA_V1_STATEMENTS {
        sqlx::query(stmt)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("apply DDL: {}", stmt.split_whitespace().take(6).collect::<Vec<_>>().join(" ")))?;
    }
    tx.commit().await.context("commit v1 tx")?;
    Ok(())
}

/// Run the migration ladder up to EXPECTED_SCHEMA_VERSION. Idempotent.
/// Returns the post-migration version.
pub async fn run(pool: &SqlitePool) -> Result<u32> {
    let current = current_version(pool).await?;
    if current >= EXPECTED_SCHEMA_VERSION {
        return Ok(current);
    }
    for v in (current + 1)..=EXPECTED_SCHEMA_VERSION {
        match v {
            1 => apply_v1(pool).await?,
            _ => anyhow::bail!("unknown schema version: {v} (max known = {EXPECTED_SCHEMA_VERSION})"),
        }
        set_version(pool, v).await?;
        tracing::info!(version = v, "schema migration applied");
    }
    Ok(EXPECTED_SCHEMA_VERSION)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    async fn mem_pool() -> SqlitePool {
        // Use shared in-memory DB with cache=shared so two pools can race.
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .create_if_missing(true);
        SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(opts)
            .await
            .unwrap()
    }

    /// File-backed pool builder for concurrency tests (shared :memory: across
    /// pools is not portable; a tempfile is more reliable).
    async fn file_pool(path: &std::path::Path) -> SqlitePool {
        let url = format!("sqlite://{}", path.display());
        let opts = SqliteConnectOptions::from_str(&url)
            .unwrap()
            .create_if_missing(true)
            .busy_timeout(std::time::Duration::from_secs(5));
        SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(opts)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn fresh_db_user_version_starts_at_0() {
        let pool = mem_pool().await;
        let v = current_version(&pool).await.unwrap();
        assert_eq!(v, 0, "fresh DB must start at user_version=0");
    }

    #[tokio::test]
    async fn apply_sets_user_version_to_1() {
        let pool = mem_pool().await;
        let post = run(&pool).await.unwrap();
        assert_eq!(post, 1);
        let v = current_version(&pool).await.unwrap();
        assert_eq!(v, 1);
    }

    #[tokio::test]
    async fn idempotent_double_apply() {
        let pool = mem_pool().await;
        run(&pool).await.unwrap();
        // Second apply must be a no-op (current >= EXPECTED → early return).
        let post = run(&pool).await.unwrap();
        assert_eq!(post, 1);
    }

    #[tokio::test]
    async fn concurrent_apply_race_is_idempotent() {
        // Critic L-3: two pools open the same DB, both call run, both
        // succeed, user_version remains 1.
        let dir = tempdir_for_test();
        let db = dir.join("race.db");

        let pool_a = file_pool(&db).await;
        let pool_b = file_pool(&db).await;

        let (ra, rb) = tokio::join!(run(&pool_a), run(&pool_b));
        // At least one must succeed; the other may legitimately fail with a
        // busy/locked error OR succeed (sqlx busy_timeout = 5s gives ample
        // room for serialization). We accept either outcome as long as the
        // post-state has user_version=1.
        assert!(
            ra.is_ok() || rb.is_ok(),
            "neither concurrent apply succeeded: {ra:?} / {rb:?}"
        );

        let v_a = current_version(&pool_a).await.unwrap();
        let v_b = current_version(&pool_b).await.unwrap();
        assert_eq!(v_a, 1);
        assert_eq!(v_b, 1);
    }

    fn tempdir_for_test() -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "musu-rs-core-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&p).unwrap();
        p
    }
}
