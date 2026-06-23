//! Boot-time reconcile of `~/.musu` legacy runtime binaries (U-A).
//!
//! After a Microsoft Store / MSIX **update**, the runtime executes from the
//! package install location (`WindowsApps\...`), NOT from `~/.musu/bin`. A
//! prior **direct-download** install (or an older code path) may have left a
//! stale `~/.musu/bin/musu(.exe)` / `musud(.exe)` behind. Those stale binaries
//! are a version-skew hazard: anything that resolves `~/.musu/bin/musu` (e.g.
//! `musu supervise`) would run an old build alongside the new packaged one.
//!
//! This module removes ONLY those two specific stale runtime binaries, and ONLY
//! when running inside an MSIX package, and NEVER the binary currently
//! executing us. It NEVER touches user data (`companies/`, `db/`, `data/`,
//! `logs/`, `docs/`), `musu.toml`, or the service registry (`services/*.json` —
//! `bridge::run` already sweeps that every boot, see bridge/mod.rs:388).
//!
//! Design (Critic SAFE shape): a PURE [`plan_reconcile`] that decides what to
//! do (existence checks on a closed two-entry allowlist only — no dir walks, no
//! globs), and a thin [`execute`] that performs best-effort deletion with a
//! belt-and-suspenders never-touch guard at the delete boundary. The whole flow
//! is fail-open: any failure degrades to "leave the file, keep booting".

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Durable marker recording the last version reconcile ran for. SKIP-
/// OPTIMIZATION ONLY — never a safety gate. A missing/unreadable/stale marker
/// MUST mean "run reconcile" (fail-toward-running).
#[derive(Serialize, Deserialize, Debug, Clone)]
struct ReconcileMarker {
    version: String,
    reconciled_at: u64,
}

/// What [`plan_reconcile`] decided. Only [`ReconcileAction::RemoveStaleBin`]
/// causes a deletion; [`ReconcileAction::Noop`] carries a human reason for logs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ReconcileAction {
    /// Delete this exact, vetted stale runtime binary path.
    RemoveStaleBin(PathBuf),
    /// Nothing to do; the string explains why (for tracing).
    Noop(String),
}

/// Platform `musu` binary file name (matches `super::musu_binary_name()`).
fn musu_bin_name() -> &'static str {
    #[cfg(windows)]
    {
        "musu.exe"
    }
    #[cfg(not(windows))]
    {
        "musu"
    }
}

/// Platform `musud` binary file name (matches `super::musud_binary_name()`).
fn musud_bin_name() -> &'static str {
    #[cfg(windows)]
    {
        "musud.exe"
    }
    #[cfg(not(windows))]
    {
        "musud"
    }
}

/// TRUE runtime fact: are we executing from inside an MSIX package?
///
/// Wraps [`super::distribution::has_package_identity`] DIRECTLY (the
/// `GetCurrentPackageFullName` probe). DELIBERATELY does NOT read
/// `MUSU_DISTRIBUTION` and does NOT call `DistributionMode::current()` — both
/// are poisoned by the force-set env var in `run_startup` (startup.rs:110-112).
#[cfg(windows)]
pub(crate) fn running_inside_msix_package() -> bool {
    super::distribution::has_package_identity()
}

#[cfg(not(windows))]
pub(crate) fn running_inside_msix_package() -> bool {
    // No package identity concept off Windows; never an MSIX runtime.
    false
}

/// Canonicalize for comparison, falling back to the literal path when the
/// target does not exist / cannot be canonicalized (mirrors
/// runner.rs:435-437).
fn canon(p: &Path) -> PathBuf {
    p.canonicalize().unwrap_or_else(|_| p.to_path_buf())
}

/// PURE planner. The ONLY IO it performs is `exists()` checks on the two exact
/// allowlist entries (and canonicalization for the self-delete comparison). It
/// schedules a [`ReconcileAction::RemoveStaleBin`] for a path ONLY when that
/// path is one of the two named entries, exists, and is NOT the running exe.
///
/// Gating (BOTH required before ANY removal):
///   * `inside_msix == true` — else the local `bin/` is the live install.
///   * `running_exe` is NOT under `home/bin` — else we'd risk self-deletion.
///
/// The `last_reconciled` marker is a skip-optimization only: it lets the common
/// "already clean" case short-circuit, but a stale bin that is actually present
/// is cleaned regardless of the marker (the allowlist + guards are the safety
/// net, not the marker).
pub(crate) fn plan_reconcile(
    home: &Path,
    inside_msix: bool,
    running_exe: &Path,
    running_version: &str,
    last_reconciled: Option<&str>,
) -> Vec<ReconcileAction> {
    // Guard 1: direct-download / no package identity → bin/ is the live runtime.
    if !inside_msix {
        return vec![ReconcileAction::Noop(
            "direct-download, bin/ is live".to_string(),
        )];
    }

    let bin_dir = home.join("bin");
    let running_canon = canon(running_exe);

    // Guard 2: refuse to ever schedule deletion of the binary executing us.
    // If we are running FROM ~/.musu/bin, the whole bin/ is live-in-use here.
    let bin_dir_canon = canon(&bin_dir);
    if running_canon.starts_with(&bin_dir_canon) {
        return vec![ReconcileAction::Noop(
            "running from bin/, refusing self-delete".to_string(),
        )];
    }

    // Closed, named allowlist — the ONLY two paths reconcile may ever remove.
    let candidates = [
        bin_dir.join(musu_bin_name()),
        bin_dir.join(musud_bin_name()),
    ];

    let mut actions: Vec<ReconcileAction> = Vec::new();
    for path in candidates {
        if !path.exists() {
            continue;
        }
        // Never schedule the running exe (defense-in-depth; Guard 2 already
        // excludes the bin/ dir, but a packaged exe could in theory share a
        // file name — compare canonicalized paths to be certain).
        if canon(&path) == running_canon {
            continue;
        }
        actions.push(ReconcileAction::RemoveStaleBin(path));
    }

    if actions.is_empty() {
        // Nothing stale present. The marker just lets callers note this was a
        // clean pass for the current version.
        let reason = if last_reconciled == Some(running_version) {
            format!("already reconciled for version {running_version}, no stale bins")
        } else {
            "no stale bins present".to_string()
        };
        return vec![ReconcileAction::Noop(reason)];
    }

    actions
}

/// Belt-and-suspenders never-touch guard at the delete boundary. A path is
/// deletable ONLY if its file name is exactly `musu(.exe)` or `musud(.exe)` AND
/// its parent directory is exactly `home/bin`. Any path failing this is a bug
/// (or a future careless edit) — we warn + skip, converting it into a no-op
/// rather than deleting something we shouldn't.
fn is_vetted_stale_bin(home: &Path, path: &Path) -> bool {
    let expected_parent = home.join("bin");
    let parent_ok = path.parent() == Some(expected_parent.as_path());
    let name_ok = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n == musu_bin_name() || n == musud_bin_name())
        .unwrap_or(false);
    parent_ok && name_ok
}

/// Thin executor. Best-effort: a remove failure is logged and swallowed; it
/// NEVER errors. Re-validates every `RemoveStaleBin` target against the
/// never-touch guard before deleting (so even a mis-built action list cannot
/// delete user data).
pub(crate) fn execute(home: &Path, actions: &[ReconcileAction]) {
    for action in actions {
        match action {
            ReconcileAction::Noop(reason) => {
                tracing::debug!(reason = %reason, "reconcile: noop");
            }
            ReconcileAction::RemoveStaleBin(path) => {
                if !is_vetted_stale_bin(home, path) {
                    tracing::warn!(
                        path = %path.display(),
                        "reconcile: refusing to remove non-allowlisted path (never-touch guard)"
                    );
                    continue;
                }
                match std::fs::remove_file(path) {
                    Ok(()) => {
                        tracing::info!(path = %path.display(), "reconcile: removed stale runtime binary");
                    }
                    Err(e) => {
                        tracing::warn!(
                            path = %path.display(),
                            error = %e,
                            "reconcile: failed to remove stale runtime binary (continuing)"
                        );
                    }
                }
            }
        }
    }
}

fn marker_path(home: &Path) -> PathBuf {
    home.join("services").join("reconciled-version.json")
}

/// Load the durable marker. Any failure (missing/unreadable/corrupt) returns
/// `None`, which means "run reconcile" (fail-toward-running).
fn load_marker(home: &Path) -> Option<ReconcileMarker> {
    let body = std::fs::read(marker_path(home)).ok()?;
    serde_json::from_slice(&body).ok()
}

/// Write the durable marker best-effort with the current running version. Any
/// failure is logged and swallowed (a missing marker just re-runs reconcile
/// next boot, which is safe).
fn write_marker(home: &Path, running_version: &str) {
    let services_dir = home.join("services");
    let _ = std::fs::create_dir_all(&services_dir);
    let reconciled_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let marker = ReconcileMarker {
        version: running_version.to_string(),
        reconciled_at,
    };
    match serde_json::to_vec_pretty(&marker) {
        Ok(body) => {
            if let Err(e) = std::fs::write(marker_path(home), body) {
                tracing::warn!(error = %e, "reconcile: failed to write marker (will re-run next boot)");
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "reconcile: failed to serialize marker");
        }
    }
}

/// Orchestrator called from `run_startup`. Computes the TRUE MSIX fact, the
/// running exe, and the running version, loads the marker, plans + executes,
/// then writes the marker. Returns `()` and NEVER errors — it must never block
/// the boot path from reaching `bridge::run()`.
pub(crate) fn run_reconcile(home: &Path) {
    let inside_msix = running_inside_msix_package();
    let running_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            // Without a known running exe we cannot prove we're not about to
            // delete ourselves — fail-open and skip entirely.
            tracing::warn!(error = %e, "reconcile: current_exe unavailable, skipping");
            return;
        }
    };
    let running_version = env!("CARGO_PKG_VERSION");
    let marker = load_marker(home);
    let last_reconciled = marker.as_ref().map(|m| m.version.as_str());

    let actions = plan_reconcile(home, inside_msix, &running_exe, running_version, last_reconciled);
    execute(home, &actions);

    // Best-effort marker write so the common clean case can short-circuit the
    // existence checks next boot. Never a safety gate.
    write_marker(home, running_version);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Seed the user-data dirs runner.rs preserves, plus dummy files inside, so
    /// tests can assert they survive a reconcile.
    fn seed_user_data(home: &Path) {
        for sub in ["bin", "companies", "db", "data", "logs", "docs", "services"] {
            fs::create_dir_all(home.join(sub)).unwrap();
        }
        fs::write(home.join("db").join("musu.db"), b"USERDATA").unwrap();
        fs::write(home.join("companies").join("acme.json"), b"USERDATA").unwrap();
        fs::write(home.join("logs").join("bridge.log"), b"USERDATA").unwrap();
        fs::write(home.join("musu.toml"), b"# config").unwrap();
    }

    fn write_bin(home: &Path, name: &str) -> PathBuf {
        let p = home.join("bin").join(name);
        fs::write(&p, b"OLDBINARY").unwrap();
        p
    }

    fn outside_exe(tmp: &TempDir) -> PathBuf {
        // A "packaged" exe location well outside ~/.musu/bin.
        let p = tmp.path().join("WindowsApps").join(musu_bin_name());
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, b"PACKAGED").unwrap();
        p
    }

    #[test]
    fn direct_download_never_removes_even_if_bins_present() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);
        write_bin(&home, musu_bin_name());
        write_bin(&home, musud_bin_name());
        let exe = outside_exe(&tmp);

        let actions = plan_reconcile(&home, false, &exe, "9.9.9", None);
        assert!(
            actions.iter().all(|a| matches!(a, ReconcileAction::Noop(_))),
            "direct-download must schedule no removals, got {actions:?}"
        );
        // And executing the (noop) plan leaves the bins in place.
        execute(&home, &actions);
        assert!(home.join("bin").join(musu_bin_name()).exists());
        assert!(home.join("bin").join(musud_bin_name()).exists());
    }

    #[test]
    fn msix_running_from_bin_refuses_self_delete() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);
        let running = write_bin(&home, musu_bin_name());
        write_bin(&home, musud_bin_name());

        // inside_msix=true but the running exe IS ~/.musu/bin/musu(.exe).
        let actions = plan_reconcile(&home, true, &running, "9.9.9", None);
        assert_eq!(actions.len(), 1);
        match &actions[0] {
            ReconcileAction::Noop(reason) => assert!(reason.contains("self-delete")),
            other => panic!("expected self-delete Noop, got {other:?}"),
        }
        execute(&home, &actions);
        // Nothing removed.
        assert!(home.join("bin").join(musu_bin_name()).exists());
        assert!(home.join("bin").join(musud_bin_name()).exists());
    }

    #[test]
    fn msix_outside_bin_removes_both_stale_bins_and_preserves_user_data() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);
        write_bin(&home, musu_bin_name());
        write_bin(&home, musud_bin_name());
        let exe = outside_exe(&tmp);

        let actions = plan_reconcile(&home, true, &exe, "9.9.9", None);
        let removals: Vec<_> = actions
            .iter()
            .filter(|a| matches!(a, ReconcileAction::RemoveStaleBin(_)))
            .collect();
        assert_eq!(removals.len(), 2, "expected both stale bins scheduled, got {actions:?}");

        execute(&home, &actions);

        // Both stale bins gone.
        assert!(!home.join("bin").join(musu_bin_name()).exists());
        assert!(!home.join("bin").join(musud_bin_name()).exists());
        // User data untouched.
        assert!(home.join("db").join("musu.db").exists());
        assert!(home.join("companies").join("acme.json").exists());
        assert!(home.join("logs").join("bridge.log").exists());
        assert!(home.join("musu.toml").exists());
    }

    #[test]
    fn never_touch_guard_rejects_path_outside_bin() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);

        // Craft a malicious action pointing at user data under db/.
        let evil = home.join("db").join("musu.db");
        assert!(evil.exists());
        let actions = vec![ReconcileAction::RemoveStaleBin(evil.clone())];

        execute(&home, &actions);
        // The guard rejected it: file survives.
        assert!(evil.exists(), "never-touch guard must not delete db/musu.db");
    }

    #[test]
    fn never_touch_guard_rejects_wrong_filename_in_bin() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);

        // A non-allowlisted file that happens to live in bin/.
        let other = home.join("bin").join("helper.dll");
        fs::write(&other, b"KEEP").unwrap();
        let actions = vec![ReconcileAction::RemoveStaleBin(other.clone())];

        execute(&home, &actions);
        assert!(other.exists(), "never-touch guard must not delete bin/helper.dll");
    }

    #[test]
    fn marker_current_and_no_stale_bin_short_circuits() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);
        // No bins present; marker says we already reconciled this version.
        let exe = outside_exe(&tmp);

        let actions = plan_reconcile(&home, true, &exe, "9.9.9", Some("9.9.9"));
        assert_eq!(actions.len(), 1);
        match &actions[0] {
            ReconcileAction::Noop(reason) => {
                assert!(reason.contains("already reconciled"), "got {reason}")
            }
            other => panic!("expected already-reconciled Noop, got {other:?}"),
        }
    }

    #[test]
    fn missing_marker_still_runs_and_cleans_stale_bin() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);
        write_bin(&home, musu_bin_name());
        let exe = outside_exe(&tmp);

        // last_reconciled = None (missing/unreadable marker) → MUST run.
        let actions = plan_reconcile(&home, true, &exe, "9.9.9", None);
        assert!(
            actions
                .iter()
                .any(|a| matches!(a, ReconcileAction::RemoveStaleBin(_))),
            "missing marker must fail-toward-running, got {actions:?}"
        );
    }

    #[test]
    fn stale_bin_cleaned_even_when_marker_matches_version() {
        // Marker says current version, but a stale bin is actually present:
        // the allowlist+guards are the safety net, so it must still be cleaned.
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);
        write_bin(&home, musu_bin_name());
        let exe = outside_exe(&tmp);

        let actions = plan_reconcile(&home, true, &exe, "9.9.9", Some("9.9.9"));
        assert!(
            actions
                .iter()
                .any(|a| matches!(a, ReconcileAction::RemoveStaleBin(_))),
            "stale bin present must be cleaned regardless of marker, got {actions:?}"
        );
    }

    #[test]
    fn musu_toml_untouched_after_full_run() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_user_data(&home);
        write_bin(&home, musu_bin_name());
        write_bin(&home, musud_bin_name());

        // Full orchestrator via plan+execute with an outside exe.
        let exe = outside_exe(&tmp);
        let actions = plan_reconcile(&home, true, &exe, "9.9.9", None);
        execute(&home, &actions);

        assert!(home.join("musu.toml").exists(), "musu.toml must never be deleted");
    }

    #[test]
    fn marker_roundtrips() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        fs::create_dir_all(home.join("services")).unwrap();
        write_marker(&home, "1.2.3");
        let loaded = load_marker(&home).expect("marker should load");
        assert_eq!(loaded.version, "1.2.3");
    }
}
