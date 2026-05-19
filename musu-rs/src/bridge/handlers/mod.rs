//! Endpoint handlers + router builder.
//!
//! wiki/491 §5: 8 R-fast endpoints.

pub mod companies;
pub mod health;
pub mod nodes;
pub mod run;
pub mod tasks;

use axum::routing::{get, post};
use axum::Router;

use super::AppState;

/// Build the native-route Router. Everything NOT matched here falls
/// through to the facade reverse-proxy in `bridge::mod`.
pub fn native_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health::get_health))
        .route("/health/ready", get(health::get_health_ready))
        .route("/api/companies", get(companies::list).post(companies::create))
        .route(
            "/api/companies/:id/activate",
            post(companies::activate),
        )
        .route("/api/companies/:id/run", post(run::run_company))
        .route("/api/tasks/delegate", post(tasks::delegate))
        .route("/api/nodes", get(nodes::list))
        .route("/api/nodes/add", post(nodes::add))
}
