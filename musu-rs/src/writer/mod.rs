//! musu-rs `writer` module — wiki/495.
//!
//! Native Rust agent-task runner. Replaces the Python `musu-bridge` writer-
//! stub previously reachable via `:8071/api/tasks/delegate`. Owns claude
//! subprocess lifecycle, SSE event broadcasting, cancel handling.
//!
//! Public surface consumed by `bridge::handlers`:
//!   - `TaskRunnerHandle` / `TaskSpec`     (runner.rs)
//!   - `SseBroadcaster` / `TaskEvent`      (sse.rs)
//!   - `cancel_task` axum handler          (cancel.rs)

pub mod cancel;
pub mod claude;
pub mod env;
pub mod runner;
pub mod sse;

#[cfg(target_os = "linux")]
pub mod platform_linux;
#[cfg(target_os = "macos")]
pub mod platform_macos;
#[cfg(target_os = "windows")]
pub mod platform_windows;

pub use runner::{TaskRunnerHandle, TaskSpec};
pub use sse::SseBroadcaster;

/// Entry point invoked from `main.rs` for `musu writer`.
///
/// The writer module is normally consumed by the bridge process (the
/// runner is wired into AppState). A standalone `musu writer` subcommand
/// has no independent role in V24-R5 — it's reserved for future work
/// (e.g. operator-mode batch reconciliation or repair tooling).
pub async fn run() -> anyhow::Result<()> {
    anyhow::bail!(
        "`musu writer` is reserved for future use. The writer runner is now \
         embedded in `musu bridge` (wiki/495 §1). Run that instead."
    )
}
