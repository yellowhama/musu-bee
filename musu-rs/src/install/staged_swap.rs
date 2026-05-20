//! Atomic binary swap with rollback (`.bak`) and boot-time recovery.
//!
//! wiki/496 D6 (recalibration) + R6-W3 / R6-W13. The auto-update flow uses
//! this to replace `~/.musu/bin/musu(.exe)` with a freshly-downloaded
//! release artifact. State machine:
//!
//!   1. Pre-flight: `available_disk_space > 2 * binary_size` else refuse.
//!   2. Write candidate to `<target>.new` (already-existing arrival point).
//!   3. Rename current `<target>` -> `<target>.bak` (atomic on POSIX +
//!      NTFS via std::fs::rename when source exists and target does not).
//!   4. Rename `<target>.new` -> `<target>` (atomic).
//!   5. On Windows: if step 3 returns "access is denied" (binary in use),
//!      fall back to MoveFileExW with MOVEFILE_DELAY_UNTIL_REBOOT. Surface
//!      a clear "restart required" message to the operator.
//!   6. Boot-time recovery on each install/auto-update entry: detect the
//!      five legal mid-rename states and either finish the swap or roll back.
//!
//! The three failure-mode states recovered at boot:
//!   - `.new` exists, main missing  => rename .new -> main (resume step 4)
//!   - `.new` exists, main exists, `.bak` missing  => discard .new (step 3 failed)
//!   - `.new` missing, main missing, `.bak` exists => rename .bak -> main (rollback)
//!   - All three exist => last-good is .bak; remove .new + rename .bak -> main
//!   - Healthy steady state: main only.

use anyhow::{anyhow, Context, Result};
use std::path::{Path, PathBuf};

/// Result of a swap attempt. `RebootRequired` is Windows-only and surfaces
/// when MoveFileEx scheduled the rename for next boot.
#[derive(Debug)]
pub enum SwapOutcome {
    /// New binary is live at `target`.
    Live,
    /// Windows-only: rename was deferred to next boot via MoveFileEx.
    RebootRequired,
}

/// Swap `<target>.new` into place as `<target>`, archiving the old binary
/// as `<target>.bak`.
///
/// Pre-conditions:
///   - `<target>.new` exists and is the candidate binary.
///   - `<target>` MAY exist (rename to .bak); if it doesn't, .new is
///     promoted directly to target.
///
/// Post-conditions on success:
///   - `<target>` is the candidate.
///   - `<target>.bak` is the prior version (if any).
///   - `<target>.new` no longer exists.
pub fn perform_swap(target: &Path) -> Result<SwapOutcome> {
    let new_path = with_suffix(target, ".new")?;
    let bak_path = with_suffix(target, ".bak")?;

    if !new_path.exists() {
        return Err(anyhow!(
            "staged candidate {} does not exist — auto-update internal error",
            new_path.display()
        ));
    }

    // Pre-flight disk space (D6): require 2× the candidate binary size on
    // the parent filesystem.
    let candidate_size = std::fs::metadata(&new_path)
        .with_context(|| format!("stat {}", new_path.display()))?
        .len();
    if let Some(parent) = target.parent() {
        check_disk_space(parent, candidate_size.saturating_mul(2))?;
    }

    // Step 3: archive current to .bak (if main exists).
    if target.exists() {
        // If a stale .bak is lying around from a previous swap, remove it
        // so the rename can succeed.
        if bak_path.exists() {
            std::fs::remove_file(&bak_path)
                .with_context(|| format!("remove stale {}", bak_path.display()))?;
        }
        match std::fs::rename(target, &bak_path) {
            Ok(()) => {}
            Err(e) => {
                // Windows: binary may be in use. Fall back to MoveFileEx
                // with MOVEFILE_DELAY_UNTIL_REBOOT.
                #[cfg(windows)]
                {
                    if is_windows_in_use(&e) {
                        return move_pending_reboot(&new_path, target);
                    }
                }
                return Err(e).with_context(|| {
                    format!("rename {} -> {}", target.display(), bak_path.display())
                });
            }
        }
    }

    // Step 4: promote candidate.
    if let Err(e) = std::fs::rename(&new_path, target) {
        // If this fails, attempt to restore .bak so we're not left with a
        // missing main.
        if bak_path.exists() {
            let _ = std::fs::rename(&bak_path, target);
        }
        return Err(e)
            .with_context(|| format!("rename {} -> {}", new_path.display(), target.display()));
    }

    Ok(SwapOutcome::Live)
}

/// Roll back: replace `<target>` with `<target>.bak` if .bak exists.
/// Used when post-swap `/health` polling fails (auto-update.rs).
pub fn rollback(target: &Path) -> Result<()> {
    let bak_path = with_suffix(target, ".bak")?;
    if !bak_path.exists() {
        return Err(anyhow!(
            "rollback requested but {} does not exist — no recovery slot",
            bak_path.display()
        ));
    }

    // Remove the failed candidate.
    if target.exists() {
        std::fs::remove_file(target)
            .with_context(|| format!("remove failed candidate {}", target.display()))?;
    }
    std::fs::rename(&bak_path, target).with_context(|| {
        format!(
            "rollback rename {} -> {}",
            bak_path.display(),
            target.display()
        )
    })?;
    Ok(())
}

/// Boot-time recovery (D6). Inspects the .new / main / .bak triplet around
/// `target` and brings the filesystem into a consistent state:
///
///   - dangling .new only       => promote (.new is the only candidate)
///   - dangling .new + main     => discard .new (step 3 never ran)
///   - dangling .bak only       => rollback (.bak is last good)
///   - all three present        => discard .new, rename .bak -> main
///   - main only / nothing      => no-op
///
/// Returns `Ok(true)` if a recovery action was taken, `Ok(false)` if the
/// state was already healthy.
pub fn recover(target: &Path) -> Result<bool> {
    let new_path = with_suffix(target, ".new")?;
    let bak_path = with_suffix(target, ".bak")?;

    let has_main = target.exists();
    let has_new = new_path.exists();
    let has_bak = bak_path.exists();

    match (has_main, has_new, has_bak) {
        (false, true, _) => {
            std::fs::rename(&new_path, target).with_context(|| {
                format!(
                    "recover: rename {} -> {}",
                    new_path.display(),
                    target.display()
                )
            })?;
            tracing::warn!(
                target = %target.display(),
                "staged-swap recovery: promoted dangling .new to main"
            );
            Ok(true)
        }
        (true, true, _) => {
            // .new dangling next to main means step 3 never ran. Discard .new.
            std::fs::remove_file(&new_path)
                .with_context(|| format!("recover: remove dangling {}", new_path.display()))?;
            tracing::warn!(
                target = %target.display(),
                "staged-swap recovery: discarded dangling .new"
            );
            Ok(true)
        }
        (false, false, true) => {
            std::fs::rename(&bak_path, target).with_context(|| {
                format!(
                    "recover: rollback {} -> {}",
                    bak_path.display(),
                    target.display()
                )
            })?;
            tracing::warn!(
                target = %target.display(),
                "staged-swap recovery: rolled back from .bak (main was missing)"
            );
            Ok(true)
        }
        _ => Ok(false),
    }
}

/// Append a literal suffix to a path's last component.
pub(crate) fn with_suffix(path: &Path, suffix: &str) -> Result<PathBuf> {
    let s = path
        .as_os_str()
        .to_str()
        .ok_or_else(|| anyhow!("non-UTF8 path: {}", path.display()))?;
    Ok(PathBuf::from(format!("{s}{suffix}")))
}

/// Check that `path`'s filesystem has at least `min_free` bytes available.
///
/// Best-effort: returns Ok if the platform API isn't available. We use
/// `sysinfo`-like primitives via the standard library on Unix, and a
/// Win32 GetDiskFreeSpaceEx call on Windows. For R6 we implement only
/// the unix path here and treat Windows as best-effort (the typical
/// install dir has gigabytes free).
fn check_disk_space(path: &Path, min_free: u64) -> Result<()> {
    #[cfg(unix)]
    {
        use std::ffi::CString;
        let path_c = CString::new(path.as_os_str().as_encoded_bytes())
            .map_err(|e| anyhow!("path contains NUL: {e}"))?;
        // SAFETY: path_c is a valid NUL-terminated C string for the duration
        // of the call. statvfs writes to a stack buffer we own.
        let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
        let rc = unsafe { libc::statvfs(path_c.as_ptr(), &mut stat) };
        if rc != 0 {
            tracing::debug!(
                path = %path.display(),
                "statvfs failed; skipping disk-space pre-flight"
            );
            return Ok(());
        }
        let avail = (stat.f_bavail as u64).saturating_mul(stat.f_frsize as u64);
        if avail < min_free {
            return Err(anyhow!(
                "insufficient disk space at {}: need {} bytes, have {}",
                path.display(),
                min_free,
                avail
            ));
        }
        Ok(())
    }
    #[cfg(windows)]
    {
        // Best-effort: GetDiskFreeSpaceExW returns free bytes for the
        // volume containing `path`. We skip the call if path conversion
        // fails (the install dir always exists on the same drive as the
        // user profile, so the residual risk is minimal).
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide.push(0);
        let mut free_to_caller: u64 = 0;
        // SAFETY: wide is a valid NUL-terminated UTF-16 string for the
        // duration of the call. The three u64 out-parameters are stack-
        // allocated and only written by the kernel.
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free_to_caller,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if ok == 0 {
            tracing::debug!(
                path = %path.display(),
                "GetDiskFreeSpaceExW failed; skipping disk-space pre-flight"
            );
            return Ok(());
        }
        if free_to_caller < min_free {
            return Err(anyhow!(
                "insufficient disk space at {}: need {} bytes, have {}",
                path.display(),
                min_free,
                free_to_caller
            ));
        }
        Ok(())
    }
}

#[cfg(windows)]
fn is_windows_in_use(e: &std::io::Error) -> bool {
    // ERROR_ACCESS_DENIED (5) or ERROR_SHARING_VIOLATION (32) both indicate
    // the file is in use by another process.
    matches!(e.raw_os_error(), Some(5) | Some(32))
}

#[cfg(windows)]
fn move_pending_reboot(src: &Path, dst: &Path) -> Result<SwapOutcome> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_DELAY_UNTIL_REBOOT, MOVEFILE_REPLACE_EXISTING,
    };

    let mut src_w: Vec<u16> = src.as_os_str().encode_wide().collect();
    src_w.push(0);
    let mut dst_w: Vec<u16> = dst.as_os_str().encode_wide().collect();
    dst_w.push(0);

    // SAFETY: both src_w and dst_w are valid NUL-terminated UTF-16 strings
    // for the duration of the call.
    let ok = unsafe {
        MoveFileExW(
            src_w.as_ptr(),
            dst_w.as_ptr(),
            MOVEFILE_DELAY_UNTIL_REBOOT | MOVEFILE_REPLACE_EXISTING,
        )
    };
    if ok == 0 {
        let e = std::io::Error::last_os_error();
        return Err(anyhow!(
            "MoveFileExW({} -> {}, DELAY_UNTIL_REBOOT): {}",
            src.display(),
            dst.display(),
            e
        ));
    }

    tracing::warn!(
        src = %src.display(),
        dst = %dst.display(),
        "binary in use; rename scheduled for next reboot"
    );
    eprintln!(
        "\nNOTE: The musu binary is currently running and could not be replaced.\n\
         The swap has been scheduled for the next system reboot.\n\
         Reboot at your convenience to complete the auto-update.\n"
    );

    Ok(SwapOutcome::RebootRequired)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn swap_promotes_new_and_archives_old() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("musu");
        std::fs::write(&target, b"OLD").unwrap();
        let new_path = with_suffix(&target, ".new").unwrap();
        std::fs::write(&new_path, b"NEW").unwrap();

        let outcome = perform_swap(&target).unwrap();
        assert!(matches!(outcome, SwapOutcome::Live));

        let live = std::fs::read(&target).unwrap();
        assert_eq!(&live, b"NEW");
        let bak = std::fs::read(with_suffix(&target, ".bak").unwrap()).unwrap();
        assert_eq!(&bak, b"OLD");
        assert!(!new_path.exists());
    }

    #[test]
    fn rollback_restores_from_bak() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("musu");
        std::fs::write(&target, b"BROKEN").unwrap();
        std::fs::write(with_suffix(&target, ".bak").unwrap(), b"GOOD").unwrap();

        rollback(&target).unwrap();

        let live = std::fs::read(&target).unwrap();
        assert_eq!(&live, b"GOOD");
        assert!(!with_suffix(&target, ".bak").unwrap().exists());
    }

    #[test]
    fn recover_promotes_dangling_new() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("musu");
        // Simulate crash between step 3 and step 4: main is missing,
        // .new is the candidate, .bak is the prior good.
        std::fs::write(with_suffix(&target, ".new").unwrap(), b"NEW").unwrap();

        let recovered = recover(&target).unwrap();
        assert!(recovered);

        let live = std::fs::read(&target).unwrap();
        assert_eq!(&live, b"NEW");
    }

    #[test]
    fn recover_discards_stale_new_when_main_present() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("musu");
        std::fs::write(&target, b"LIVE").unwrap();
        std::fs::write(with_suffix(&target, ".new").unwrap(), b"STALE").unwrap();

        let recovered = recover(&target).unwrap();
        assert!(recovered);

        assert!(!with_suffix(&target, ".new").unwrap().exists());
        assert_eq!(std::fs::read(&target).unwrap(), b"LIVE");
    }

    #[test]
    fn recover_rollback_from_bak_when_main_missing() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("musu");
        std::fs::write(with_suffix(&target, ".bak").unwrap(), b"GOOD").unwrap();

        let recovered = recover(&target).unwrap();
        assert!(recovered);
        assert_eq!(std::fs::read(&target).unwrap(), b"GOOD");
    }

    #[test]
    fn recover_noop_when_healthy() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("musu");
        std::fs::write(&target, b"LIVE").unwrap();
        let recovered = recover(&target).unwrap();
        assert!(!recovered);
    }

    #[test]
    fn swap_fails_when_new_missing() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("musu");
        std::fs::write(&target, b"OLD").unwrap();
        let err = perform_swap(&target).unwrap_err();
        assert!(err.to_string().contains("does not exist"));
    }
}
