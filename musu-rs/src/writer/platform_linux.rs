//! Linux-specific subprocess hardening — wiki/495 §3 + R5-W2.
//!
//! Installs `PR_SET_PDEATHSIG = SIGKILL` via `pre_exec` so that when the
//! bridge process dies, the claude subprocess (and by extension all its
//! MCP-server grandchildren) receives SIGKILL.

#![cfg(target_os = "linux")]

use std::io;

use tokio::process::Command;

/// Install pre_exec on `cmd` so the child gets SIGKILL when the parent dies.
///
/// SAFETY: pre_exec runs after fork() but before exec() — the only async-signal-
/// safe operations are allowed. `prctl()` is on the AS-safe list.
pub fn configure(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    // SAFETY: see above.
    unsafe {
        cmd.pre_exec(|| {
            // PR_SET_PDEATHSIG = 1
            let r = libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL, 0, 0, 0);
            if r != 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        });
    }
}
