//! Endpoint handlers + router builder.
//!
//! wiki/491 §5: 8 R-fast endpoints.
//! wiki/495 §3: +2 R5 endpoints (`GET /api/tasks/events`, `DELETE /api/tasks/{id}`).
//! wiki/496 §3 (D10): +1 R6 endpoint (`POST /api/system/update`).
//! wiki/494 §3 (R4): +1 R4 endpoint (`GET /api/index-search`).

pub mod companies;
pub mod health;
pub mod index_search;
pub mod nodes;
pub mod run;
pub mod sse;
pub mod system_update;
pub mod tasks;
// V26-W9 wiki/512: workflow DAG builder + CRUD.
pub mod workflow;
// V27: cross-machine task forwarding.
pub mod forward;
// V27: remote filesystem API.
pub mod files;
// V27-F4: fleet node-status and capability reporting.
pub mod fleet;
// V27-F7: easy token pairing.
pub mod pair;
// V27-F10: WebDAV mount endpoint.
pub mod webdav;
// Port unification: generic reverse-proxy to internal services.
pub mod proxy;
// A-3: WebSocket proxy to musu-port.
pub mod ws_proxy;

use axum::routing::{self, get, post};
use axum::Router;

use super::AppState;

/// Build the native-route Router. Everything NOT matched here falls
/// through to the facade reverse-proxy in `bridge::mod`.
pub fn native_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health::get_health))
        .route("/health/ready", get(health::get_health_ready))
        .route(
            "/api/companies",
            get(companies::list).post(companies::create),
        )
        // V24-R3 wiki/493 §3 R1 patch: single-row GET for control plane's
        // `get_company` MCP tool. Read-only, no audit (Critic C3).
        .route("/api/companies/:id", get(companies::get))
        .route("/api/companies/:id/activate", post(companies::activate))
        .route("/api/companies/:id/run", post(run::run_company))
        .route("/api/tasks/delegate", post(tasks::delegate))
        // R5 (wiki/495 §3): SSE event stream + cancel handler.
        .route("/api/tasks/events", get(sse::task_events))
        .route(
            "/api/tasks/:task_id",
            routing::get(tasks::get_task)
                .delete(crate::writer::cancel::cancel_task),
        )
        .route("/api/nodes", get(nodes::list))
        .route("/api/nodes/add", post(nodes::add))
        // V27: cross-machine task routing.
        .route("/api/tasks/forward", post(forward::receive_forwarded))
        // V27-F1: result callback from peer after forwarded task completes.
        .route("/api/tasks/callback", post(forward::receive_callback))
        .route("/api/nodes/accept-peer", post(nodes::accept_peer))
        // R6 (wiki/496 §3 D10): trigger auto-update via supervisor-spawned
        // detached child. Inherits the bridge's bearer-token auth
        // (S5) — no separate gate.
        .route(
            "/api/system/update",
            post(system_update::post_system_update),
        )
        // R4 (wiki/494 §3): native /api/index-search replacing Python
        // server.py:2711-2743. Byte-compat response shape; read-only
        // (no audit.write per C5).
        .route("/api/index-search", get(index_search::get))
        // V27: Remote filesystem API.
        .route("/api/files", get(files::list_dir).delete(files::delete_path))
        .route("/api/files/read", get(files::read_file))
        .route("/api/files/write", post(files::write_file))
        .route("/api/files/mkdir", post(files::mkdir))
        .route("/api/files/info", get(files::file_info))
        // V27-F3: Fleet dashboard.
        .route("/api/fleet/status", get(fleet::fleet_status))
        .route("/api/fleet/node-status", get(fleet::node_status))
        .route("/api/tasks", get(fleet::list_tasks))
        // V27-F7: Easy token pairing.
        .route("/api/pair/offer", post(pair::create_pair_offer))
        .route("/api/pair/accept", post(pair::accept_pair))
        // V27-F10: WebDAV mount endpoint.
        .route("/webdav", routing::any(webdav::handle_webdav))
        .route("/webdav/*path", routing::any(webdav::handle_webdav))
        // Port unification: proxy internal services through the gateway.
        .route("/brain", routing::any(proxy::proxy_brainai))
        .route("/brain/*path", routing::any(proxy::proxy_brainai))
        .route("/worker", routing::any(proxy::proxy_worker))
        .route("/worker/*path", routing::any(proxy::proxy_worker))
        // A-3: WebSocket proxy to musu-port chat.
        .route("/chat/ws/*path", get(ws_proxy::ws_proxy_chat))
        // W9 (wiki/512): workflow DAG builder + CRUD routes.
        .merge(workflow::router())
        // W13 (wiki/513): MCP HTTP+SSE endpoint — same 14 tools as stdio.
        .merge(crate::control::http_server::mcp_router())
}
