//! File real-time sync — V27-F9.
//!
//! Watches shared directories for changes and pushes deltas to peers.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

const SYNC_EVENT_QUEUE_CAPACITY: usize = 1024;
const SYNC_BATCH_MAX_EVENTS: usize = 256;
const SYNC_BATCH_MAX_WINDOW: Duration = Duration::from_secs(2);
const SYNC_BATCH_COOLDOWN: Duration = Duration::from_millis(50);
const SYNC_BATCH_DEBOUNCE: Duration = Duration::from_millis(500);

/// File sync event.
#[derive(Debug, Clone)]
pub struct SyncEvent {
    pub path: PathBuf,
    pub kind: SyncEventKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncEventKind {
    Created,
    Modified,
    Deleted,
    #[allow(dead_code)]
    Renamed {
        to: PathBuf,
    },
}

/// Start watching a directory for changes.
///
/// Returns a receiver that gets `SyncEvent`s and the watcher handle.
pub fn start_watcher(
    paths: &[PathBuf],
) -> anyhow::Result<(mpsc::Receiver<SyncEvent>, RecommendedWatcher)> {
    let (tx, rx) = mpsc::channel(SYNC_EVENT_QUEUE_CAPACITY);

    let tx_clone = tx.clone();
    let mut watcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| match res {
            Ok(event) => {
                let kind = match event.kind {
                    EventKind::Create(_) => SyncEventKind::Created,
                    EventKind::Modify(_) => SyncEventKind::Modified,
                    EventKind::Remove(_) => SyncEventKind::Deleted,
                    _ => return,
                };
                for path in &event.paths {
                    if let Err(e) = tx_clone.try_send(SyncEvent {
                        path: path.clone(),
                        kind: kind.clone(),
                    }) {
                        tracing::warn!(
                            path = %path.display(),
                            err = %e,
                            capacity = SYNC_EVENT_QUEUE_CAPACITY,
                            "file sync event queue full; dropping event"
                        );
                    }
                }
            }
            Err(e) => {
                tracing::warn!(err = %e, "file watcher error");
            }
        })?;

    for path in paths {
        if path.exists() {
            watcher.watch(path, RecursiveMode::Recursive)?;
            tracing::info!(path = %path.display(), "watching for file changes");
        } else {
            tracing::warn!(path = %path.display(), "sync path does not exist, skipping");
        }
    }

    Ok((rx, watcher))
}

/// Sync loop: watches for file changes and pushes them to peers.
pub async fn run_sync_loop(
    mut rx: mpsc::Receiver<SyncEvent>,
    _watcher: RecommendedWatcher,
    peers: Vec<String>,
    token: String,
) {
    let client = reqwest::Client::new();
    let mut pending: Vec<SyncEvent> = Vec::new();

    loop {
        match rx.recv().await {
            Some(event) => pending.push(event),
            None => break, // channel closed
        }

        let batch_started = tokio::time::Instant::now();
        while pending.len() < SYNC_BATCH_MAX_EVENTS {
            let remaining_window = SYNC_BATCH_MAX_WINDOW
                .saturating_sub(batch_started.elapsed())
                .min(SYNC_BATCH_DEBOUNCE);
            if remaining_window.is_zero() {
                break;
            }

            let Ok(Some(event)) = tokio::time::timeout(remaining_window, rx.recv()).await else {
                break;
            };
            pending.push(event);
        }

        let reached_batch_cap = pending.len() >= SYNC_BATCH_MAX_EVENTS;
        let batch = coalesce_sync_batch(std::mem::take(&mut pending));
        for event in &batch {
            tracing::debug!(
                path = %event.path.display(),
                kind = ?event.kind,
                "sync event"
            );

            match &event.kind {
                SyncEventKind::Created | SyncEventKind::Modified => {
                    // Read file and push to peers.
                    if event.path.is_file() {
                        match tokio::fs::read(&event.path).await {
                            Ok(data) => {
                                let path_str = event.path.to_string_lossy().to_string();
                                for peer in &peers {
                                    let url = format!(
                                        "http://{}/api/files/write?path={}",
                                        peer,
                                        urlencoding::encode(&path_str)
                                    );
                                    match client
                                        .post(&url)
                                        .bearer_auth(&token)
                                        .body(data.clone())
                                        .timeout(Duration::from_secs(30))
                                        .send()
                                        .await
                                    {
                                        Ok(resp) if resp.status().is_success() => {
                                            tracing::info!(
                                                peer = %peer,
                                                path = %path_str,
                                                "file synced to peer"
                                            );
                                        }
                                        Ok(resp) => {
                                            tracing::warn!(
                                                peer = %peer,
                                                status = %resp.status(),
                                                "sync push rejected"
                                            );
                                        }
                                        Err(e) => {
                                            tracing::warn!(
                                                peer = %peer,
                                                err = %e,
                                                "sync push failed"
                                            );
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!(
                                    path = %event.path.display(),
                                    err = %e,
                                    "could not read file for sync"
                                );
                            }
                        }
                    }
                }
                SyncEventKind::Deleted => {
                    // Notify peers of deletion.
                    let path_str = event.path.to_string_lossy().to_string();
                    for peer in &peers {
                        let url = format!(
                            "http://{}/api/files?path={}",
                            peer,
                            urlencoding::encode(&path_str)
                        );
                        let _ = client
                            .delete(&url)
                            .bearer_auth(&token)
                            .timeout(Duration::from_secs(10))
                            .send()
                            .await;
                    }
                }
                SyncEventKind::Renamed { .. } => {
                    // Treat as delete + create — handled by the OS emitting
                    // separate Remove + Create events.
                }
            }
        }

        if reached_batch_cap {
            tracing::warn!(
                max_events = SYNC_BATCH_MAX_EVENTS,
                "file sync batch cap reached; yielding before next batch"
            );
            tokio::time::sleep(SYNC_BATCH_COOLDOWN).await;
        }
    }
}

fn coalesce_sync_batch(batch: Vec<SyncEvent>) -> Vec<SyncEvent> {
    let mut by_path: BTreeMap<PathBuf, SyncEventKind> = BTreeMap::new();
    for event in batch {
        by_path.insert(event.path, event.kind);
    }

    by_path
        .into_iter()
        .map(|(path, kind)| SyncEvent { path, kind })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coalesce_sync_batch_keeps_latest_event_for_each_path() {
        let a = PathBuf::from("a.txt");
        let b = PathBuf::from("b.txt");

        let batch = coalesce_sync_batch(vec![
            SyncEvent {
                path: a.clone(),
                kind: SyncEventKind::Created,
            },
            SyncEvent {
                path: b.clone(),
                kind: SyncEventKind::Modified,
            },
            SyncEvent {
                path: a.clone(),
                kind: SyncEventKind::Deleted,
            },
        ]);

        assert_eq!(batch.len(), 2);
        assert_eq!(batch[0].path, a);
        assert_eq!(batch[0].kind, SyncEventKind::Deleted);
        assert_eq!(batch[1].path, b);
        assert_eq!(batch[1].kind, SyncEventKind::Modified);
    }
}
