//! V24-R4 wiki/494 §3 — workspace sync orchestrator.
//!
//! `sync_workspace_async(work_dir, profile_name)` is the public surface
//! consumed by:
//!   1. `musu indexer sync` CLI subcommand (operator-driven).
//!   2. `bridge::handlers::companies::create` fire-and-forget post-INSERT
//!      hook (C-R4-7 plan amendment — wraps this in `tokio::spawn` so the
//!      201 Created response isn't blocked on disk work).
//!
//! Empty / missing work_dir handling (C-R4-5 plan amendment): R3 confirmed
//! `POST /api/companies` accepts an empty `work_dir`. We MUST NOT error when
//! called against that empty value — the company row was already committed
//! and the user just doesn't have a workspace path yet. Return an
//! `Ok(SyncReport { skipped_reason: "no_work_dir", .. })` so the caller can
//! log the skip and move on.

use std::path::PathBuf;
use std::time::Instant;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::indexer::db;
use crate::indexer::profile::Profile;
use crate::indexer::scanner::{self, IndexEntry};

/// Per-call sync summary. Surfaced via tracing in the CLI path; the bridge
/// fire-and-forget path ignores it (failures log via tracing::warn). Plain
/// data — no methods — so external consumers can deserialize from JSON if
/// we ever expose a /api/index-sync route (V25 candidate).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SyncReport {
    pub files_indexed: usize,
    pub symbols_extracted: usize,
    pub sections_extracted: usize,
    pub duration_ms: u64,
    /// Set to a short reason string when sync did NOT actually run.
    /// Currently only `"no_work_dir"` (C-R4-5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skipped_reason: Option<String>,
}

/// Insert N rows in a single transaction. FTS5 INSERT is roughly 10× faster
/// inside a transaction than per-row. Batch size of 500 keeps each tx small
/// enough that a mid-batch failure only loses ~500 rows (and we'd re-sync
/// anyway). Tuned by perf-fixture experiments; not load-bearing — bump
/// freely if the r4_scanner_perf gate starts failing.
const BATCH_SIZE: usize = 500;

/// PUBLIC R4 ENTRY POINT — called from both CLI and R1 bridge hook.
///
/// Idempotent at the row level (each sync wipes + repopulates the FTS5
/// table). Concurrency: SQLite WAL mode handles a single writer at a time;
/// concurrent `sync_workspace_async` calls against the same workspace
/// serialize on the WAL lock. We do NOT add an in-process mutex — operators
/// rarely sync the same workspace twice in parallel and SQLite's busy
/// timeout (5s, set in db.rs) is plenty.
pub async fn sync_workspace_async(work_dir: PathBuf, profile_name: String) -> Result<SyncReport> {
    let start = Instant::now();

    // ── C-R4-5 EMPTY / MISSING work_dir GATE ──────────────────────────────
    // R1 create_company accepts empty work_dir; the post-create hook MUST
    // be a no-op in that case rather than erroring (which would log a
    // misleading WARN on every empty-workspace company creation).
    if work_dir.as_os_str().is_empty() || !work_dir.exists() {
        return Ok(SyncReport {
            skipped_reason: Some("no_work_dir".to_string()),
            duration_ms: start.elapsed().as_millis() as u64,
            ..SyncReport::default()
        });
    }

    let profile =
        Profile::load_or_default(&work_dir, &profile_name).context("load workspace profile")?;

    // ── 1. Scan (CPU-bound, parallel via rayon) ───────────────────────────
    //
    // We MUST run the rayon-driven scan on `spawn_blocking` so it doesn't
    // hog a tokio worker thread for the entire walk. The rayon thread pool
    // is internal to `scan`, but the call itself blocks until the parallel
    // iterator collects — that's what `spawn_blocking` is for.
    let work_dir_for_scan = work_dir.clone();
    let profile_for_scan = profile.clone();
    let (entries, stats) =
        tokio::task::spawn_blocking(move || scanner::scan(&work_dir_for_scan, &profile_for_scan))
            .await
            .context("scan task panicked")?
            .context("scanner::scan failed")?;

    // ── 2. Open / create the per-workspace DB and wipe stale rows ─────────
    let pool = db::open_index_db(&work_dir)
        .await
        .with_context(|| format!("open .musu_dev.db at {}", work_dir.display()))?;

    // Wipe entire search_index — simpler than per-path deletes, and a full
    // re-scan beats stale rows from deleted files. The Python writer does
    // per-path DELETE-then-INSERT; we go heavier on the cycle since R4 is
    // re-sync only (no incremental update path).
    sqlx::query("DELETE FROM search_index")
        .execute(&pool)
        .await
        .context("wipe search_index before re-insert")?;

    // ── 3. Batch-insert rows in transactions ──────────────────────────────
    insert_batched(&pool, &entries).await?;

    // ── 4. Metadata bookkeeping (C-R4-4) ──────────────────────────────────
    db::put_meta(&pool, "workspace_name", &profile.name).await?;
    let now_iso = chrono::Utc::now().to_rfc3339();
    db::put_meta(&pool, "last_sync_at", &now_iso).await?;

    let elapsed = start.elapsed();
    Ok(SyncReport {
        files_indexed: stats.files_indexed,
        symbols_extracted: stats.symbols_extracted,
        sections_extracted: stats.sections_extracted,
        duration_ms: elapsed.as_millis() as u64,
        skipped_reason: None,
    })
}

/// Drive a sequence of `(path, title, content, type)` INSERTs into FTS5,
/// transaction-batched at `BATCH_SIZE` per commit. Returns early on the
/// first error; the partial state is fine — the next sync wipes it.
async fn insert_batched(pool: &SqlitePool, entries: &[IndexEntry]) -> Result<()> {
    for chunk in entries.chunks(BATCH_SIZE) {
        let mut tx = pool.begin().await.context("begin batch tx")?;
        for e in chunk {
            sqlx::query(
                "INSERT INTO search_index (path, title, content, type) \
                 VALUES (?, ?, ?, ?)",
            )
            .bind(&e.path)
            .bind(&e.title)
            .bind(&e.content)
            .bind(e.kind)
            .execute(&mut *tx)
            .await
            .context("insert FTS5 row")?;
        }
        tx.commit().await.context("commit batch tx")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// C-R4-5 gate: empty work_dir argument returns a `skipped_reason`
    /// report instead of erroring. This is the contract R1 relies on.
    #[tokio::test]
    async fn sync_empty_work_dir_skips_cleanly() {
        let report = sync_workspace_async(PathBuf::new(), "empty".into())
            .await
            .expect("must not error on empty work_dir");
        assert_eq!(report.files_indexed, 0);
        assert_eq!(report.skipped_reason.as_deref(), Some("no_work_dir"));
    }

    /// C-R4-5 gate: a non-empty but non-existent path also yields a
    /// skipped_reason report (not an io::Error). The R1 hook can't know
    /// in advance that the user typed a typoed path.
    #[tokio::test]
    async fn sync_missing_work_dir_skips_cleanly() {
        let report = sync_workspace_async(
            PathBuf::from("/this/path/should/not/exist/r4-test"),
            "bogus".into(),
        )
        .await
        .expect("must not error on missing work_dir");
        assert_eq!(report.skipped_reason.as_deref(), Some("no_work_dir"));
    }

    /// Smoke: tempdir + a small file content → search_index gets populated
    /// + index_meta has both rows.
    #[tokio::test]
    async fn sync_tempdir_populates_index_and_meta() {
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join("alpha.rs"),
            "pub fn hello() {}\npub struct Greeter;\n",
        )
        .unwrap();
        std::fs::write(dir.path().join("notes.md"), "# Title\n\nbody\n").unwrap();

        let report = sync_workspace_async(dir.path().to_path_buf(), "tdco".into())
            .await
            .expect("sync ok");
        assert!(report.files_indexed >= 2, "expected ≥2 files: {report:?}");
        assert!(
            report.symbols_extracted >= 2,
            "expected hello + Greeter: {report:?}"
        );
        assert!(report.skipped_reason.is_none());

        // Verify meta rows present.
        let pool = db::open_index_db(dir.path()).await.unwrap();
        let row: (String,) =
            sqlx::query_as("SELECT value FROM index_meta WHERE key = 'workspace_name'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(row.0, "tdco");
        let _last_sync: (String,) =
            sqlx::query_as("SELECT value FROM index_meta WHERE key = 'last_sync_at'")
                .fetch_one(&pool)
                .await
                .unwrap();
    }
}
