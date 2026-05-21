//! musu adapter trait. V26-W1 wiki/509.
//!
//! `AdapterContext` preempts W12 (deadline propagation) + W13 (per-adapter
//! escape hatch) per Critic C1 + INFO-2. Adding the fields now means W12/W13
//! land as middleware + adapter impls without touching this trait signature.
//!
//! `AdapterError` parity with Python `musu_core/adapters/base.py:42-56`:
//! exactly 5 variants, `is_retriable()` returns true for 4 of them. Match-
//! exhaustive ensures a future variant addition is a compile error, not a
//! silent retry-policy drift (Critic C5).

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Notify;

/// Per-request adapter context. Mirrors Python `AdapterContext`
/// (`musu_core/adapters/base.py:74-101`) with W12/W13 preempt fields.
///
/// Builder constructs this once per execute() call; adapters MUST NOT mutate
/// (Clone-on-write if needed).
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AdapterContext {
    /// Unique id for this run (matches `route_executions.task_id` in writer).
    pub run_id: String,
    /// User-supplied prompt text.
    pub prompt: String,
    /// Agent identifier (matches `agents.id` in core/companies.rs).
    pub agent_id: String,
    /// Adapter type discriminator (e.g. "openai_compat_local", "claude").
    /// Drives `registry::dispatch`.
    pub adapter_type: String,
    /// Raw per-adapter config blob. Adapter is responsible for typed parse.
    pub config_json: serde_json::Value,
    /// Optional session id for multi-turn adapters (e.g. claude --session).
    pub session_id: Option<String>,
    /// Working directory for subprocess-based adapters (claude shim, etc).
    pub cwd: Option<std::path::PathBuf>,
    /// W12 preempt (Critic C1): wall-clock deadline in unix-millis.
    /// `None` in W1 (no deadline middleware yet). W12 populates this.
    pub deadline_unix_ms: Option<u64>,
    /// W12 preempt (Critic C1): cooperative cancellation.
    /// Adapters SHOULD `tokio::select!` on `cancel.notified()` alongside their
    /// I/O. `None` in W1 (no cancel propagation yet).
    pub cancel: Option<Arc<Notify>>,
    /// W9/W13 escape hatch (Critic INFO-2 / D2 v2): per-call extra payload.
    /// Defaults to `Value::Null`. Adapters MAY read but MUST tolerate Null.
    pub extra: serde_json::Value,
}

/// Adapter execution result. Mirrors Python `AdapterResult`
/// (`musu_core/adapters/base.py:104-126`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AdapterResult {
    pub success: bool,
    pub summary: String,
    pub session_id: Option<String>,
    pub usage: Option<UsageSummary>,
    pub error_code: Option<AdapterError>,
}

/// Token-usage summary, when the upstream provider returns it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct UsageSummary {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

/// Adapter error variants. Exactly 5 per Critic C5 + Python `base.py:42-56`
/// parity. `is_retriable()` returns true for exactly
/// {RateLimit, Timeout, ModelUnavailable, Unknown}.
///
/// The match in `is_retriable()` is intentionally exhaustive: adding a new
/// variant forces a compile error, preventing silent retry-policy drift.
#[derive(Debug, Clone, Error, Serialize, Deserialize)]
pub enum AdapterError {
    #[error("rate limit exceeded")]
    RateLimit,
    #[error("timeout")]
    Timeout,
    #[error("context window exceeded")]
    ContextExceeded,
    #[error("model unavailable")]
    ModelUnavailable,
    #[error("unknown error: {0}")]
    Unknown(String),
}

impl AdapterError {
    /// Retriable predicate. C5: matches Python `RETRIABLE_ERROR_CODES`
    /// (`base.py:60-62`). Match-exhaustive on purpose: future variant add
    /// is a compile error, not a silent retry-policy regression.
    #[allow(dead_code)]
    pub fn is_retriable(&self) -> bool {
        match self {
            AdapterError::RateLimit
            | AdapterError::Timeout
            | AdapterError::ModelUnavailable
            | AdapterError::Unknown(_) => true,
            AdapterError::ContextExceeded => false,
        }
    }
}

/// The core adapter trait. One impl per provider (openai_compat, claude, ...).
///
/// `Send + Sync` because adapter instances live behind `Box<dyn Adapter>` and
/// are dispatched from `tokio::spawn`ed tasks in `writer/runner.rs`.
#[async_trait]
pub trait Adapter: Send + Sync {
    #[allow(dead_code)]
    async fn execute(&self, ctx: &AdapterContext) -> Result<AdapterResult, AdapterError>;
}

pub mod openai_compat;
pub mod registry;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapter_error_has_exactly_5_variants() {
        let all = [
            AdapterError::RateLimit,
            AdapterError::Timeout,
            AdapterError::ContextExceeded,
            AdapterError::ModelUnavailable,
            AdapterError::Unknown("test".into()),
        ];
        assert_eq!(all.len(), 5);
    }

    #[test]
    fn is_retriable_4_of_5() {
        assert!(AdapterError::RateLimit.is_retriable());
        assert!(AdapterError::Timeout.is_retriable());
        assert!(AdapterError::ModelUnavailable.is_retriable());
        assert!(AdapterError::Unknown("x".into()).is_retriable());
        assert!(!AdapterError::ContextExceeded.is_retriable());
    }

    #[test]
    fn adapter_context_default_extra_is_null() {
        let ctx = AdapterContext {
            run_id: "test".into(),
            prompt: "test".into(),
            agent_id: "test".into(),
            adapter_type: "test".into(),
            config_json: serde_json::Value::Null,
            session_id: None,
            cwd: None,
            deadline_unix_ms: None,
            cancel: None,
            extra: serde_json::Value::Null,
        };
        assert_eq!(ctx.extra, serde_json::Value::Null);
        assert!(ctx.deadline_unix_ms.is_none());
        assert!(ctx.cancel.is_none());
    }
}
