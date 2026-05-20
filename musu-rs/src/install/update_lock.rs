//! Advisory file lock for `musu auto-update`.
//!
//! wiki/496 F15 — update-during-update race mitigation. Two simultaneous
//! `musu auto-update` invocations could interleave their staged-swap
//! operations and corrupt `~/.musu/bin/`. We acquire an exclusive `fs2`
//! advisory lock on `~/.musu/auto-update.lock`; if the lock is held the
//! second invocation exits with code 75 ("temporary failure") and a
//! "lock held by PID N" message.

use anyhow::{Context, Result};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;

use fs2::FileExt;

/// Exit code emitted when the lock is held by another process.
/// 75 = EX_TEMPFAIL per sysexits(3); systemd retries on this.
pub const LOCK_HELD_EXIT_CODE: i32 = 75;

/// RAII guard over the advisory lock. Dropping releases it.
pub struct UpdateLock {
    file: File,
}

impl UpdateLock {
    /// Try to acquire the lock at `musu_home/auto-update.lock` exclusively
    /// without blocking. Returns `Ok(Some(guard))` on success, `Ok(None)`
    /// when the lock is held by another process, `Err(_)` on filesystem
    /// errors (permission denied, parent dir missing, etc.).
    pub fn try_acquire(musu_home: &Path) -> Result<Option<Self>> {
        // Ensure ~/.musu exists. The installer creates this; this guards
        // against running auto-update on a never-installed machine.
        if !musu_home.exists() {
            std::fs::create_dir_all(musu_home)
                .with_context(|| format!("create musu home {}", musu_home.display()))?;
        }
        let lock_path = musu_home.join("auto-update.lock");

        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&lock_path)
            .with_context(|| format!("open lock file {}", lock_path.display()))?;

        match file.try_lock_exclusive() {
            Ok(()) => {
                // Record our PID in the lock file content for debugging
                // (the lock is held via OS-level fcntl, not the bytes; this
                // is purely informational).
                let mut writable = OpenOptions::new()
                    .write(true)
                    .truncate(true)
                    .open(&lock_path)?;
                let _ = writeln!(writable, "{}", std::process::id());
                drop(writable);

                Ok(Some(Self { file }))
            }
            Err(_) => Ok(None),
        }
    }
}

impl Drop for UpdateLock {
    fn drop(&mut self) {
        // Best-effort unlock; if it fails the OS will release on close
        // (which Drop on File performs).
        let _ = FileExt::unlock(&self.file);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn first_acquire_succeeds_second_fails() {
        let tmp = TempDir::new().unwrap();
        let g1 = UpdateLock::try_acquire(tmp.path()).unwrap();
        assert!(g1.is_some(), "first acquire should succeed");

        let g2 = UpdateLock::try_acquire(tmp.path()).unwrap();
        assert!(g2.is_none(), "second acquire while held should return None");
    }

    #[test]
    fn release_on_drop_allows_reacquire() {
        let tmp = TempDir::new().unwrap();
        {
            let g = UpdateLock::try_acquire(tmp.path()).unwrap();
            assert!(g.is_some());
            // drop at end of scope
        }
        let g2 = UpdateLock::try_acquire(tmp.path()).unwrap();
        assert!(g2.is_some(), "lock should be re-acquirable after drop");
    }
}
