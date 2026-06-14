//! musu-startup — a logic-free Service-mode shim.
//!
//! The runtime bridge entry point lives in `musu startup` (the `musu` binary).
//! This stub exists ONLY because the MSIX `windows.startupTask` extension is
//! exe-path-only — it cannot pass `startup` as an argument to `musu.exe`. So the
//! logon startupTask names THIS exe, which does exactly one thing: run the bridge
//! in Service mode (bridge only, NEVER device-flow — a 900s blocking poll on a
//! headless logon would be a severe regression).
//!
//! It is built from the SAME crate as `musu`, so there is zero version skew with
//! the runtime it shares (`musu_rs::install::startup::run_startup`). It emits
//! nothing on stdout (keeps the `r3_stdout_clean` invariant green). "One app"
//! stays true as a packaging/perception claim; this shim is invisible to the user
//! (no window, no Start-menu entry) — see ARCHITECTURE_BINARIES_PROCESSES_PACKAGING.
//!
//! User-facing launches (Start menu / cockpit) go through `musu-desktop.exe` →
//! `musu.exe startup open`, NOT this stub. This stub is the logon path only.

use anyhow::Result;
use musu_rs::install::startup::{run_startup, LaunchMode};

#[tokio::main]
async fn main() -> Result<()> {
    // Log to stderr so stdout stays clean; bridge runtime, service mode only.
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .try_init();
    run_startup(LaunchMode::Service).await
}
