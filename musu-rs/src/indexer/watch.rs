//! V24-R4 wiki/494 §3 — file-watch sync (`musu indexer watch`).
//!
//! Debounce policy: 2 seconds quiescence before re-syncing. Matches
//! Python parity (paraphrased — Python's watcher coalesced events on a
//! 2s timer). DB-sidecar files (`*.db-wal`, `*.db-shm`) are ignored so
//! we don't loop on our own sqlite writes.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::Notify;

pub async fn run_watch(work_dir: PathBuf, name: String) -> Result<()> {
    // Initial sync so the index isn't stale on startup.
    let initial =
        crate::indexer::sync::sync_workspace_async(work_dir.clone(), name.clone()).await?;
    tracing::info!(
        files = initial.files_indexed,
        duration_ms = initial.duration_ms,
        "initial watch sync complete; entering loop"
    );

    let notify = Arc::new(Notify::new());
    let dirty: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));

    let notify_clone = notify.clone();
    let dirty_clone = dirty.clone();
    let work_dir_for_filter = work_dir.clone();

    let mut watcher = RecommendedWatcher::new(
        move |event_result: notify::Result<notify::Event>| {
            let event = match event_result {
                Ok(e) => e,
                Err(e) => {
                    tracing::warn!(error = %e, "watcher event error");
                    return;
                }
            };
            // Skip the DB sidecar to avoid feedback loops on our own sqlite
            // writes (-wal / -shm get touched on every commit).
            let interesting = event.paths.iter().any(|p| {
                let s = p.to_string_lossy();
                !(s.ends_with(".db-wal")
                    || s.ends_with(".db-shm")
                    || s.contains("/.musu_dev.db")
                    || s.contains("\\.musu_dev.db"))
            });
            if !interesting {
                return;
            }
            // Ignore work_dir's own sidecar specifically (defensive).
            if event.paths.iter().all(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with(".musu_dev.db"))
                    .unwrap_or(false)
            }) {
                return;
            }
            let _ = &work_dir_for_filter; // capture for closure
            *dirty_clone.lock().unwrap() = true;
            notify_clone.notify_one();
        },
        notify::Config::default(),
    )?;
    watcher.watch(&work_dir, RecursiveMode::Recursive)?;

    loop {
        notify.notified().await;
        // Debounce: coalesce burst events into a single re-sync.
        tokio::time::sleep(Duration::from_secs(2)).await;
        let do_sync = {
            let mut d = dirty.lock().unwrap();
            let v = *d;
            *d = false;
            v
        };
        if !do_sync {
            continue;
        }
        match crate::indexer::sync::sync_workspace_async(work_dir.clone(), name.clone()).await {
            Ok(r) => tracing::info!(
                files = r.files_indexed,
                duration_ms = r.duration_ms,
                "watch re-sync complete"
            ),
            Err(e) => tracing::warn!(error = %e, "watch re-sync failed"),
        }
    }
}
