//! Bridge middleware modules — wiki/511 §3.
//!
//! Middleware order (updated from wiki/491 §8.5):
//!   request_id → deadline → rate_limit → auth → handler

pub mod deadline;

#[allow(unused_imports)] // Used by integration tests + downstream W9/W13 handlers.
pub use deadline::{deadline_middleware, DeadlineMs};
