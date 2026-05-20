//! Endpoint handlers + router builder.
//!
//! wiki/491 §5: 8 R-fast endpoints.
//! wiki/495 §3: +2 R5 endpoints (`GET /api/tasks/events`, `DELETE /api/tasks/{id}`).
//! wiki/496 §3 (D10): +1 R6 endpoint (`POST /api/system/update`).

pub mod companies;
pub mod health;
pub mod nodes;
pub mod run;
pub mod sse;
pub mod system_update;
pub mod tasks;

use axum::routing::{delete, get, post};
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
        .route("/api/companies/:id/activate", post(companies::activate))
        .route("/api/companies/:id/run", post(run::run_company))
        .route("/api/tasks/delegate", post(tasks::delegate))
        // R5 (wiki/495 §3): SSE event stream + cancel handler.
        .route("/api/tasks/events", get(sse::task_events))
        .route(
            "/api/tasks/:task_id",
            delete(crate::writer::cancel::cancel_task),
        )
        .route("/api/nodes", get(nodes::list))
        .route("/api/nodes/add", post(nodes::add))
        // R6 (wiki/496 §3 D10): trigger auto-update via supervisor-spawned
        // detached child. Inherits the bridge's bearer-token auth
        // (S5) — no separate gate.
        .route(
            "/api/system/update",
            post(system_update::post_system_update),
        )
}
