//! V24-R4 wiki/494 §3 — `<work_dir>/.musu_dev.db` schema management.
//!
//! Schema:
//!   * `search_index` — FTS5 virtual table holding (path, title, content, type)
//!     with `unicode61` tokenizer. Identical column ordering to Python's
//!     `core.py` so the `snippet(search_index, 2, ...)` call in §4 C1 still
//!     points at `content`.
//!   * `index_meta`   — flat key/value table (C-R4-4 plan amendment). Holds
//!     `workspace_name` + `last_sync_at` (ISO-8601 UTC).
//!
//! Schema-drift policy (R4-W3 / OQ resolution): if an existing FTS5 table
//! has different columns (e.g. a stale Python-era schema with extra columns
//! we don't carry), we DROP + recreate. The index is derived state — losing
//! it just forces a re-scan on the next `sync_workspace_async` call.
//!
//! Connection pooling: we open a small `SqlitePool` per `.musu_dev.db` file.
//! sqlx pools are cheap on local sqlite; the alternative (raw `SqliteConnectOptions`
//! + single connection) would require explicit busy-timeout management.

use std::path::Path;
use std::str::FromStr;

use anyhow::{Context, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;

/// File name within the workspace root (Python parity — see plan §4 C4).
pub const DB_FILE: &str = ".musu_dev.db";

/// Open (or create) the per-workspace index DB at `<work_dir>/.musu_dev.db`.
/// Applies WAL + busy-timeout + schema ensure. Idempotent on re-open.
pub async fn open_index_db(work_dir: &Path) -> Result<SqlitePool> {
    std::fs::create_dir_all(work_dir).ok();
    let db_path = work_dir.join(DB_FILE);

    // sqlx wants `sqlite://...` URLs with forward slashes; on Windows we
    // normalize so `D:\foo\bar\.musu_dev.db` becomes a valid URL.
    let path_str = db_path.to_string_lossy().replace('\\', "/");
    let url = format!("sqlite://{}", path_str);

    let opts = SqliteConnectOptions::from_str(&url)
        .with_context(|| format!("invalid sqlite url derived from {}", db_path.display()))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .min_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect_with(opts)
        .await
        .with_context(|| format!("connect to {}", db_path.display()))?;

    ensure_schema(&pool).await?;
    Ok(pool)
}

/// Apply (or recreate-on-drift) the FTS5 + meta schema. Idempotent.
async fn ensure_schema(pool: &SqlitePool) -> Result<()> {
    // Drift guard: introspect `search_index` columns. If the column list
    // doesn't exactly match what R4 expects, drop + recreate. Loss is
    // tolerable — index is derived state, next sync repopulates it.
    if needs_rebuild(pool).await? {
        sqlx::query("DROP TABLE IF EXISTS search_index")
            .execute(pool)
            .await
            .context("drop legacy search_index")?;
    }

    sqlx::query(
        "CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(\
             path, title, content, type, tokenize='unicode61')",
    )
    .execute(pool)
    .await
    .context("create search_index FTS5 table")?;

    // C-R4-4: metadata sidecar. FTS5 virtual tables can't hold non-indexed
    // metadata, so we keep a regular key/value table next to it.
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS index_meta (\
             key TEXT PRIMARY KEY,\
             value TEXT NOT NULL)",
    )
    .execute(pool)
    .await
    .context("create index_meta table")?;

    Ok(())
}

/// Returns true when an existing `search_index` table has a column shape that
/// doesn't match R4's (path, title, content, type). Pure FTS5 introspection
/// via `PRAGMA table_info`. Missing table → false (CREATE handles it).
async fn needs_rebuild(pool: &SqlitePool) -> Result<bool> {
    // sqlite_master row: type='table', name='search_index' (FTS5 tables show
    // up as type='table' in sqlite_master even though they're virtual).
    let exists: Option<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='search_index' LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .context("introspect search_index existence")?;

    if exists.is_none() {
        return Ok(false);
    }

    // FTS5 `table_info` lists the virtual columns. Compare against the
    // canonical set; anything else → rebuild.
    let cols: Vec<(i32, String, String, i32, Option<String>, i32)> =
        sqlx::query_as("PRAGMA table_info(search_index)")
            .fetch_all(pool)
            .await
            .context("PRAGMA table_info(search_index)")?;

    let names: Vec<&str> = cols.iter().map(|c| c.1.as_str()).collect();
    let expected = ["path", "title", "content", "type"];
    let matches = names.len() == expected.len()
        && names
            .iter()
            .zip(expected.iter())
            .all(|(a, b)| a.eq_ignore_ascii_case(b));
    Ok(!matches)
}

/// Upsert a key into `index_meta`. Used by sync.rs to record
/// `workspace_name` + `last_sync_at`.
pub async fn put_meta(pool: &SqlitePool, key: &str, value: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO index_meta (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .context("upsert index_meta row")?;
    Ok(())
}
