//! WebSocket reverse-proxy handler for port unification.
//!
//! Phase A-3: forwards WebSocket connections from the unified gateway
//! (`:8070`) to musu-port (Python, default `:1355`).
//!
//! Route: `GET /chat/ws/{path}` → `ws://127.0.0.1:{port}/chat/ws/{path}`
//!
//! Uses axum's built-in `WebSocketUpgrade` for the client-facing side
//! and `tokio-tungstenite` for the upstream connection to musu-port.

use axum::extract::ws::{Message as AxumMessage, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::http::StatusCode;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as TungMessage;
use std::collections::HashMap;
use crate::bridge::AppState;

/// Accept a WebSocket upgrade on `/chat/ws/*path` and proxy it to the
/// upstream musu-port WebSocket at `ws://127.0.0.1:{port}/chat/ws/{path}`.
///
/// The upstream port is resolved from `MUSU_PORT_PORT` env var, falling
/// back to `1355`.
pub async fn ws_proxy_chat(
    ws: WebSocketUpgrade,
    Path(path): Path<String>,
) -> impl IntoResponse {
    let port: u16 = std::env::var("MUSU_PORT_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(1355);
    let upstream_url = format!("ws://127.0.0.1:{}/chat/ws/{}", port, path);

    tracing::debug!(upstream = %upstream_url, "ws_proxy upgrading");

    ws.on_upgrade(move |socket| handle_ws_proxy(socket, upstream_url))
}

/// Proxy PTY WebSocket to a remote peer node
pub async fn ws_proxy_pty(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let node_id = match params.get("node_id") {
        Some(id) => id,
        None => return (StatusCode::BAD_REQUEST, "Missing node_id").into_response(),
    };
    
    let musu_home = state.config.nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
        
    let peers = crate::peer::discovery::resolve_all_peers(musu_home);
    let peer = match peers.into_iter().find(|p| p.name.as_deref() == Some(node_id) || &p.addr == node_id) {
        Some(p) => p,
        None => return (StatusCode::NOT_FOUND, "Node not found").into_response(),
    };

    let upstream_url = format!("ws://{}/api/v1/rpc/pty", peer.addr);
    tracing::debug!(upstream = %upstream_url, "ws_proxy_pty upgrading");

    ws.on_upgrade(move |socket| handle_ws_proxy(socket, upstream_url))
}

/// Bidirectionally pipe messages between a client WebSocket (axum) and
/// an upstream WebSocket (tokio-tungstenite).
async fn handle_ws_proxy(client_ws: WebSocket, upstream_url: String) {
    // Connect to the upstream musu-port WebSocket.
    let (upstream_ws, _resp) = match connect_async(&upstream_url).await {
        Ok(pair) => pair,
        Err(e) => {
            tracing::error!(
                upstream = %upstream_url,
                error = %e,
                "ws_proxy: failed to connect to upstream"
            );
            return;
        }
    };

    tracing::debug!(upstream = %upstream_url, "ws_proxy: upstream connected");

    // Split both sockets into sender/receiver halves.
    let (mut client_tx, mut client_rx) = client_ws.split();
    let (mut upstream_tx, mut upstream_rx) = upstream_ws.split();

    // Task: client → upstream
    let client_to_upstream = async {
        while let Some(msg) = client_rx.next().await {
            match msg {
                Ok(axum_msg) => {
                    let tung_msg = match axum_to_tungstenite(axum_msg) {
                        Some(m) => m,
                        None => continue, // skip unmappable messages
                    };
                    if upstream_tx.send(tung_msg).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    tracing::debug!(error = %e, "ws_proxy: client read error");
                    break;
                }
            }
        }
    };

    // Task: upstream → client
    let upstream_to_client = async {
        while let Some(msg) = upstream_rx.next().await {
            match msg {
                Ok(tung_msg) => {
                    let axum_msg = match tungstenite_to_axum(tung_msg) {
                        Some(m) => m,
                        None => continue,
                    };
                    if client_tx.send(axum_msg).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    tracing::debug!(error = %e, "ws_proxy: upstream read error");
                    break;
                }
            }
        }
    };

    // Run both directions concurrently; when either side closes, the
    // other is dropped (and its socket half-closed).
    tokio::select! {
        _ = client_to_upstream => {
            tracing::debug!("ws_proxy: client side closed");
        }
        _ = upstream_to_client => {
            tracing::debug!("ws_proxy: upstream side closed");
        }
    }

    tracing::debug!(upstream = %upstream_url, "ws_proxy: connection closed");
}

// ── Message type conversion ────────────────────────────────────────

/// Convert an axum `Message` to a tungstenite `Message`.
fn axum_to_tungstenite(msg: AxumMessage) -> Option<TungMessage> {
    match msg {
        AxumMessage::Text(text) => Some(TungMessage::Text(text.to_string())),
        AxumMessage::Binary(data) => Some(TungMessage::Binary(data.to_vec())),
        AxumMessage::Ping(data) => Some(TungMessage::Ping(data.to_vec())),
        AxumMessage::Pong(data) => Some(TungMessage::Pong(data.to_vec())),
        AxumMessage::Close(frame) => {
            let tung_frame = frame.map(|f| {
                tokio_tungstenite::tungstenite::protocol::CloseFrame {
                    code: tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::from(
                        f.code,
                    ),
                    reason: f.reason.into(),
                }
            });
            Some(TungMessage::Close(tung_frame))
        }
    }
}

/// Convert a tungstenite `Message` to an axum `Message`.
fn tungstenite_to_axum(msg: TungMessage) -> Option<AxumMessage> {
    match msg {
        TungMessage::Text(text) => Some(AxumMessage::Text(text.into())),
        TungMessage::Binary(data) => Some(AxumMessage::Binary(data.into())),
        TungMessage::Ping(data) => Some(AxumMessage::Ping(data.into())),
        TungMessage::Pong(data) => Some(AxumMessage::Pong(data.into())),
        TungMessage::Close(frame) => {
            let axum_frame = frame.map(|f| axum::extract::ws::CloseFrame {
                code: f.code.into(),
                reason: f.reason.into(),
            });
            Some(AxumMessage::Close(axum_frame))
        }
        TungMessage::Frame(_) => None, // raw frames are not forwarded
    }
}
