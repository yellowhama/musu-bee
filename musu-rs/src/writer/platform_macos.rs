//! macOS subprocess hardening — wiki/495 §3.
//!
//! macOS has no equivalent of Linux's `PR_SET_PDEATHSIG`. We document the
//! limitation here and rely on best-effort SIGTERM-then-SIGKILL on cancel.
//! Operator's macOS is secondary per wiki/495 §1.

#![cfg(target_os = "macos")]

use tokio::process::Command;

/// No-op: macOS has no pre_exec hook we can use to guarantee child death on
/// parent exit. Cancel path issues SIGTERM + grace + SIGKILL via tokio.
pub fn configure(_cmd: &mut Command) {
    // Intentionally empty. Documented limitation.
}
