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

use crate::core::schema::{
    SCHEMA_V1_STATEMENTS, SCHEMA_V2_ALTER_STATEMENTS, SCHEMA_V3_ALTER_STATEMENTS,
    SCHEMA_V4_STATEMENTS,
};

/// Schema version this build expects. Bumped per R-phase:
///   - R2 (wiki/492) shipped v1.
///   - R5 (wiki/495) ships v2 — 6 additive NULLable columns on route_executions.
///   - W12 (wiki/511) ships v3 — 1 additive NULLable column on audit_log.
///   - W9 (wiki/512) ships v4 — workflows + workflow_steps tables.
pub const EXPECTED_SCHEMA_VERSION: u32 = 4;

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
        sqlx::query(stmt).execute(&mut *tx).await.with_context(|| {
            format!(
                "apply DDL: {}",
                stmt.split_whitespace()
                    .take(6)
                    .collect::<Vec<_>>()
                    .join(" ")
            )
        })?;
    }
    tx.commit().await.context("commit v1 tx")?;
    Ok(())
}

/// Apply schema_v2: 6 ALTER TABLE statements on route_executions in one tx.
/// SQLite's `ALTER TABLE ADD COLUMN` is metadata-only (no row rewrite); the
/// six statements together hit <100ms. wiki/495 §4.
///
/// `ALTER TABLE ADD COLUMN` is not DDL-idempotent (re-running on an existing
/// column errors with "duplicate column name"). To make `run()` re-entrant
/// under concurrent-boot races (§4.2 / Critic L-3) we read existing column
/// names from `pragma_table_info` once and SKIP statements whose column is
/// already present. The skipped path keeps `apply_v2` a true no-op when
/// invoked twice — which matches the schema_v1 contract.
async fn apply_v2(pool: &SqlitePool) -> Result<()> {
    // Existing column names on route_executions (cheap; ~7-13 rows).
    let existing: Vec<(String,)> =
        sqlx::query_as("SELECT name FROM pragma_table_info('route_executions')")
            .fetch_all(pool)
            .await
            .context("read route_executions table_info")?;
    let existing: std::collections::HashSet<String> = existing.into_iter().map(|r| r.0).collect();

    let mut tx = pool.begin().await.context("begin v2 tx")?;
    for stmt in SCHEMA_V2_ALTER_STATEMENTS {
        // Extract the column name from `ALTER TABLE ... ADD COLUMN <name> <type>`.
        // Format is fixed in schema.rs so a simple whitespace split is sound.
        let col = stmt
            .split_whitespace()
            .nth(5)
            .expect("malformed v2 ALTER statement");
        if existing.contains(col) {
            tracing::debug!(column = col, "v2: column already present, skipping ALTER");
            continue;
        }
        sqlx::query(stmt)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("apply v2 DDL: {}", stmt))?;
    }
    tx.commit().await.context("commit v2 tx")?;
    Ok(())
}

/// Apply schema_v3: 1 ALTER TABLE statement on audit_log in one tx.
/// Adds `cross_machine INTEGER` (NULLable). wiki/511 §2.
///
/// Same idempotent pattern as apply_v2: read existing column names,
/// skip if already present.
async fn apply_v3(pool: &SqlitePool) -> Result<()> {
    let existing: Vec<(String,)> =
        sqlx::query_as("SELECT name FROM pragma_table_info('audit_log')")
            .fetch_all(pool)
            .await
            .context("read audit_log table_info")?;
    let existing: std::collections::HashSet<String> = existing.into_iter().map(|r| r.0).collect();

    let mut tx = pool.begin().await.context("begin v3 tx")?;
    for stmt in SCHEMA_V3_ALTER_STATEMENTS {
        let col = stmt
            .split_whitespace()
            .nth(5)
            .expect("malformed v3 ALTER statement");
        if existing.contains(col) {
            tracing::debug!(column = col, "v3: column already present, skipping ALTER");
            continue;
        }
        sqlx::query(stmt)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("apply v3 DDL: {}", stmt))?;
    }
    tx.commit().await.context("commit v3 tx")?;
    Ok(())
}

/// Apply schema_v4: workflows + workflow_steps CREATE TABLE statements.
/// Uses `CREATE TABLE IF NOT EXISTS` — DDL-idempotent (same pattern as v1).
/// wiki/512 §4 (W9).
async fn apply_v4(pool: &SqlitePool) -> Result<()> {
    let mut tx = pool.begin().await.context("begin v4 tx")?;
    for stmt in SCHEMA_V4_STATEMENTS {
        sqlx::query(stmt).execute(&mut *tx).await.with_context(|| {
            format!(
                "apply v4 DDL: {}",
                stmt.split_whitespace()
                    .take(6)
                    .collect::<Vec<_>>()
                    .join(" ")
            )
        })?;
    }
    tx.commit().await.context("commit v4 tx")?;
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
            2 => apply_v2(pool).await?,
            3 => apply_v3(pool).await?,
            4 => apply_v4(pool).await?,
            _ => {
                anyhow::bail!("unknown schema version: {v} (max known = {EXPECTED_SCHEMA_VERSION})")
            }
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
    async fn apply_sets_user_version_to_expected() {
        let pool = mem_pool().await;
        let post = run(&pool).await.unwrap();
        assert_eq!(post, EXPECTED_SCHEMA_VERSION);
        let v = current_version(&pool).await.unwrap();
        assert_eq!(v, EXPECTED_SCHEMA_VERSION);
    }

    #[tokio::test]
    async fn idempotent_double_apply() {
        let pool = mem_pool().await;
        run(&pool).await.unwrap();
        // Second apply must be a no-op (current >= EXPECTED → early return).
        let post = run(&pool).await.unwrap();
        assert_eq!(post, EXPECTED_SCHEMA_VERSION);
    }

    /// R5: v1→v2 ladder adds 6 NULLable columns to route_executions.
    #[tokio::test]
    async fn v1_to_v2_apply_adds_6_cols() {
        let pool = mem_pool().await;
        // Apply v1 only.
        apply_v1(&pool).await.unwrap();
        set_version(&pool, 1).await.unwrap();
        // Now apply v2.
        apply_v2(&pool).await.unwrap();
        set_version(&pool, 2).await.unwrap();

        // PRAGMA table_info confirms the new columns.
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT name FROM pragma_table_info('route_executions') WHERE name IN \
             ('output','error','exit_code','duration_sec','started_at','updated_at')",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(rows.len(), 6, "expected 6 new cols; got: {:?}", rows);
    }

    /// R5: v2 idempotent — running migrate again after v2 is a no-op.
    #[tokio::test]
    async fn v2_idempotent_double_apply() {
        let pool = mem_pool().await;
        let v1 = run(&pool).await.unwrap();
        assert_eq!(v1, EXPECTED_SCHEMA_VERSION);
        // Second call hits the early-return.
        let v2 = run(&pool).await.unwrap();
        assert_eq!(v2, EXPECTED_SCHEMA_VERSION);
    }

    /// R5: v2 preserves existing v1 rows.
    #[tokio::test]
    async fn v2_preserves_existing_rows() {
        let pool = mem_pool().await;
        // Apply v1, insert a row, then run() to take us up to v2.
        apply_v1(&pool).await.unwrap();
        set_version(&pool, 1).await.unwrap();
        sqlx::query(
            "INSERT INTO route_executions \
             (task_id, channel, sender_id, input_hash, status, created_at) \
             VALUES ('keep-me', 'ch', 's', 'h', 'done', 100)",
        )
        .execute(&pool)
        .await
        .unwrap();
        let post = run(&pool).await.unwrap();
        assert_eq!(post, EXPECTED_SCHEMA_VERSION);

        let (task_id, status, output): (String, String, Option<String>) = sqlx::query_as(
            "SELECT task_id, status, output FROM route_executions WHERE task_id = 'keep-me'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(task_id, "keep-me");
        assert_eq!(status, "done");
        assert!(
            output.is_none(),
            "new col `output` must be NULL on legacy row"
        );
    }

    #[tokio::test]
    async fn concurrent_apply_race_is_idempotent() {
        // Critic L-3: two pools open the same DB, both call run, both
        // converge to EXPECTED_SCHEMA_VERSION without data corruption.
        //
        // R5 detail: schema v2 uses `ALTER TABLE ADD COLUMN` which is NOT
        // DDL-idempotent — racing pools can have one apply v2 fully and the
        // other fail mid-v2 on a duplicate-column error. We accept that one
        // pool may need to re-run to catch up; the invariant under test is
        // that NO ROW CORRUPTION occurs and that re-running converges both
        // pools to EXPECTED_SCHEMA_VERSION. wiki/495 §4.2.
        let dir = tempdir_for_test();
        let db = dir.join("race.db");

        let pool_a = file_pool(&db).await;
        let pool_b = file_pool(&db).await;

        let (ra, rb) = tokio::join!(run(&pool_a), run(&pool_b));
        // At least one must succeed; the other may legitimately fail with a
        // busy/locked error OR a duplicate-column ALTER on v2.
        assert!(
            ra.is_ok() || rb.is_ok(),
            "neither concurrent apply succeeded: {ra:?} / {rb:?}"
        );

        // Catch-up pass: re-run on whichever pool errored. After a winning
        // peer committed up to EXPECTED_SCHEMA_VERSION, run()'s early-return
        // makes this a no-op.
        if ra.is_err() {
            let _ = run(&pool_a).await;
        }
        if rb.is_err() {
            let _ = run(&pool_b).await;
        }

        let v_a = current_version(&pool_a).await.unwrap();
        let v_b = current_version(&pool_b).await.unwrap();
        assert_eq!(v_a, EXPECTED_SCHEMA_VERSION);
        assert_eq!(v_b, EXPECTED_SCHEMA_VERSION);
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
