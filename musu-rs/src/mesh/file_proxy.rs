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
    let musu_home = state.config.nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    
    let peers = crate::peer::discovery::resolve_all_peers(musu_home);
    let peer = peers.into_iter().find(|p| p.name.as_deref() == Some(node_id.as_str()) || p.addr == node_id)
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
        (StatusCode::BAD_GATEWAY, format!("Failed to proxy request: {}", e))
    })?;

    // 4. Stream the response back to the client
    let mut builder = axum::response::Response::builder()
        .status(resp.status());
    
    // Copy essential headers back
    for (k, v) in resp.headers() {
        builder = builder.header(k, v);
    }

    let stream = resp.bytes_stream();
    let body = axum::body::Body::from_stream(stream);

    builder.body(body).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to build response: {}", e))
    })
}
