//! sqlx pool initialization.
//!
//! wiki/491 §2 (post-Critic A-5): sqlx 0.7 with sqlite + runtime-tokio-rustls.
//! R1 tolerates schema-not-applied: pool init succeeds even if `musu.db`
//! is missing; handlers return 500 "schema not applied" until R2 ships.

use std::path::Path;
use std::str::FromStr;

use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;

/// Open (or create) a sqlite pool against the given path. The pool uses
/// WAL journal mode and a small connection cap appropriate for an
/// embedded single-process bridge.
pub async fn init_pool(db_path: &Path) -> Result<SqlitePool> {
    // Ensure the parent directory exists. sqlx will create the file but
    // not the directory.
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let url = format!("sqlite://{}", db_path.display());
    let opts = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .min_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect_with(opts)
        .await?;

    tracing::info!(path = %db_path.display(), "sqlite pool initialized");
    Ok(pool)
}

/// Check whether the `companies` table exists. Used by /health to surface
/// schema-not-applied to the operator.
pub async fn schema_applied(pool: &SqlitePool) -> bool {
    let r: Result<Option<(String,)>, _> = sqlx::query_as(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='companies' LIMIT 1",
    )
    .fetch_optional(pool)
    .await;
    matches!(r, Ok(Some(_)))
}

/// Check whether the `audit_log` table exists.
pub async fn audit_schema_applied(pool: &SqlitePool) -> bool {
    let r: Result<Option<(String,)>, _> = sqlx::query_as(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log' LIMIT 1",
    )
    .fetch_optional(pool)
    .await;
    matches!(r, Ok(Some(_)))
}
