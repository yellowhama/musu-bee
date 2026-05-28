//! Mesh File Proxy (W4)
//!
//! Allows streaming access to files located on remote nodes
//! without fully replicating them across the network.
//! Features HTTP Range request support for efficient binary proxying.

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;

use crate::bridge::AppState;

/// Proxies a file read request to a remote node, supporting Range headers.
pub async fn proxy_file(
    State(state): State<AppState>,
    Path((node_id, path)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // 1. Resolve node_id to an IP/port using discovery
    let musu_home = state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));

    let peers = crate::peer::discovery::resolve_all_peers(musu_home);
    let peer = peers
        .into_iter()
        .find(|p| p.name.as_deref() == Some(node_id.as_str()) || p.addr == node_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Node {} not found", node_id)))?;

    // 2. Construct the URL to the remote node's /api/files/read endpoint
    let target_url = format!("http://{}/api/files/read?path={}", peer.addr, path);

    // 3. Forward the request, preserving headers (except Host) for caching and ranges
    let mut req_builder = state.http_client.get(&target_url);
    for (k, v) in headers.iter() {
        if k != axum::http::header::HOST {
            req_builder = req_builder.header(k, v);
        }
    }

    let resp = req_builder.send().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to proxy request: {}", e),
        )
    })?;

    // 4. Stream the response back to the client
    let mut builder = axum::response::Response::builder().status(resp.status());

    // Copy essential headers back
    for (k, v) in resp.headers() {
        builder = builder.header(k, v);
    }

    let stream = resp.bytes_stream();
    let body = axum::body::Body::from_stream(stream);

    builder.body(body).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to build response: {}", e),
        )
    })
}

use std::sync::{Mutex, OnceLock};

type OfflineWrite = (String, String, Vec<u8>);
type OfflineWriteQueue = Mutex<Vec<OfflineWrite>>;

/// In-memory queue for offline write operations.
/// In production, this should be backed by SQLite (WAL) to survive restarts.
fn get_offline_queue() -> &'static OfflineWriteQueue {
    static OFFLINE_WRITE_QUEUE: OnceLock<OfflineWriteQueue> = OnceLock::new();
    OFFLINE_WRITE_QUEUE.get_or_init(|| Mutex::new(Vec::new()))
}

/// Proxies a file write request to a remote node. If the node is offline, buffers it.
pub async fn proxy_write_file(
    State(state): State<AppState>,
    Path((node_id, path)): Path<(String, String)>,
    body: axum::body::Bytes,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let musu_home = state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));

    let peers = crate::peer::discovery::resolve_all_peers(musu_home);
    let peer = peers
        .into_iter()
        .find(|p| p.name.as_deref() == Some(node_id.as_str()) || p.addr == node_id);

    if let Some(p) = peer {
        let target_url = format!("http://{}/api/files/write?path={}", p.addr, path);
        match state
            .http_client
            .post(&target_url)
            .body(body.to_vec())
            .send()
            .await
        {
            Ok(resp) => {
                if resp.status().is_success() {
                    return Ok((StatusCode::OK, "Write successful".to_string()));
                }
            }
            Err(e) => {
                tracing::warn!("Target node is offline, buffering write: {}", e);
            }
        }
    } else {
        tracing::warn!("Node not found, buffering write for future peer discovery");
    }

    // Node offline or request failed: Buffer it
    let mut queue = get_offline_queue().lock().unwrap();
    queue.push((node_id.clone(), path.clone(), body.to_vec()));
    tracing::info!(
        "Queued write operation for {}, file: {}. Queue size: {}",
        node_id,
        path,
        queue.len()
    );

    Ok((
        StatusCode::ACCEPTED,
        "Write queued for offline sync".to_string(),
    ))
}
