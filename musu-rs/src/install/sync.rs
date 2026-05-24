//! File real-time sync — V27-F9.
//!
//! Watches shared directories for changes and pushes deltas to peers.

use std::path::PathBuf;
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

/// File sync event.
#[derive(Debug, Clone)]
pub struct SyncEvent {
    pub path: PathBuf,
    pub kind: SyncEventKind,
}

#[derive(Debug, Clone)]
pub enum SyncEventKind {
    Created,
    Modified,
    Deleted,
    #[allow(dead_code)]
    Renamed { to: PathBuf },
}

/// Start watching a directory for changes.
///
/// Returns a receiver that gets `SyncEvent`s and the watcher handle.
pub fn start_watcher(
    paths: &[PathBuf],
) -> anyhow::Result<(mpsc::UnboundedReceiver<SyncEvent>, RecommendedWatcher)> {
    let (tx, rx) = mpsc::unbounded_channel();

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
                    let _ = tx_clone.send(SyncEvent {
                        path: path.clone(),
                        kind: kind.clone(),
                    });
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
    mut rx: mpsc::UnboundedReceiver<SyncEvent>,
    _watcher: RecommendedWatcher,
    peers: Vec<String>,
    token: String,
) {
    let client = reqwest::Client::new();
    // Debounce: collect events for 500ms before processing.
    let mut pending: Vec<SyncEvent> = Vec::new();
    let debounce = Duration::from_millis(500);

    loop {
        // Wait for first event.
        match rx.recv().await {
            Some(event) => pending.push(event),
            None => break, // channel closed
        }

        // Collect more events within debounce window.
        while let Ok(Some(event)) = tokio::time::timeout(debounce, rx.recv()).await {
            pending.push(event);
        }

        // Process batch.
        let batch: Vec<SyncEvent> = std::mem::take(&mut pending);
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
    }
}
