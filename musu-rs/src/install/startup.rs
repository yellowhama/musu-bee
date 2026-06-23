//! Packaged-runtime bridge entry point — now a subcommand (`musu startup`) rather
//! than a separate `musu-startup.exe` (single-binary integration, 2026-06-11:
//! one runtime binary kills the version-skew class the 3-exe split caused).
//!
//! Two launch modes, distinguished by an explicit argv signal (NOT `is_terminal()`
//! — a GUI double-click has no TTY, so TTY detection would misclassify a user
//! launch as a service launch):
//!
//!   * `musu startup open` — the USER explicitly opened MUSU Desktop. Runs the
//!     FULL onboarding: ensure bridge token, start the bridge in the foreground,
//!     AND — if not signed in — drive device-flow login in a background task that
//!     opens the browser. Bridge stays up regardless of login.
//!
//!   * `musu startup` (bare) / `musu startup --service` — unattended logon
//!     `windows.startupTask` / service boot. `bridge::run()` ONLY, NEVER
//!     device-flow (a 900s blocking poll on every headless logon would be a
//!     severe regression).
//!
//! Packaging contract (build-msix.ps1): the `windows.startupTask` invokes
//! `musu.exe startup` (service mode). The user-facing desktop shell invokes
//! `musu.exe startup open` for the full onboarding sequence.

use anyhow::Result;
use chrono::Utc;
use serde::Serialize;
use std::path::Path;

/// Launch intent derived from the args after `startup`. Explicit signal, not TTY.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchMode {
    /// Explicit user launch (Desktop). Full sequence incl. device-flow.
    UserOpen,
    /// Unattended logon/service boot. Bridge only, never device-flow.
    Service,
}

impl LaunchMode {
    /// Classify from the args that FOLLOW the `startup` subcommand (clap hands us
    /// just those). `open` → UserOpen; `--service`/bare/unknown → Service (safe
    /// default: only an explicit `open` opts into device-flow).
    pub fn from_args<I: IntoIterator<Item = String>>(args: I) -> Self {
        for arg in args {
            match arg.as_str() {
                "open" => return LaunchMode::UserOpen,
                "--service" => return LaunchMode::Service,
                _ => {}
            }
        }
        LaunchMode::Service
    }

    fn as_str(self) -> &'static str {
        match self {
            LaunchMode::UserOpen => "user-open",
            LaunchMode::Service => "service",
        }
    }
}

#[derive(Serialize)]
struct StartupMarker<'a> {
    version: &'static str,
    distribution: String,
    launch_mode: &'a str,
    stage: &'a str,
    timestamp_utc: String,
    pid: u32,
    exe: String,
    detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_approval_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_user_code: Option<String>,
}

#[allow(clippy::too_many_arguments)]
fn write_startup_marker(
    home: &Path,
    launch_mode: LaunchMode,
    stage: &str,
    detail: Option<String>,
    device_approval_url: Option<String>,
    device_user_code: Option<String>,
) {
    let services_dir = home.join("services");
    let _ = std::fs::create_dir_all(&services_dir);
    let marker = StartupMarker {
        version: env!("CARGO_PKG_VERSION"),
        distribution: crate::install::distribution::DistributionMode::current()
            .as_str()
            .to_string(),
        launch_mode: launch_mode.as_str(),
        stage,
        timestamp_utc: Utc::now().to_rfc3339(),
        pid: std::process::id(),
        exe: std::env::current_exe()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| "<unknown>".to_string()),
        detail,
        device_approval_url,
        device_user_code,
    };
    if let Ok(body) = serde_json::to_vec_pretty(&marker) {
        let _ = std::fs::write(services_dir.join("startup-marker.json"), body);
    }
}

/// `musu startup [open|--service]` — the packaged bridge runtime entry point.
pub async fn run_startup(mode: LaunchMode) -> Result<()> {
    if std::env::var_os("MUSU_DISTRIBUTION").is_none() {
        std::env::set_var("MUSU_DISTRIBUTION", "store-msix");
    }

    let musu_home = crate::install::resolve_musu_home_from_env()?;
    let _token = crate::install::token::ensure_bridge_token(&musu_home)?;
    write_startup_marker(&musu_home, mode, "launching", None, None, None);
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        launch_mode = mode.as_str(),
        "musu startup launching packaged bridge runtime"
    );

    // U-A: reconcile stale legacy runtime binaries left in ~/.musu/bin by a
    // prior direct-download install after this MSIX build supersedes them.
    // Fail-open: returns () and must never block reaching bridge::run().
    crate::install::reconcile::run_reconcile(&musu_home);

    // HARD-1: only the explicit user-open path drives device-flow. Service/logon
    // boot stays bridge-only — see module docs.
    if mode == LaunchMode::UserOpen {
        spawn_desktop_login_if_needed(&musu_home);
    }

    // MEDIUM-1: bridge::run() is the FOREGROUND future that keeps the process
    // alive. The login task above is detached, so the bridge comes up and stays
    // up regardless of whether login is ever approved.
    match crate::bridge::run().await {
        Ok(()) => {
            write_startup_marker(&musu_home, mode, "bridge-exited-cleanly", None, None, None);
            Ok(())
        }
        Err(err) => {
            write_startup_marker(
                &musu_home,
                mode,
                "bridge-run-failed",
                Some(format!("{err:#}")),
                None,
                None,
            );
            Err(err)
        }
    }
}

/// GUI re-login entry point (`musu login --desktop`): drive device-flow to
/// completion in the FOREGROUND, writing `startup-marker.json` at each stage so
/// the cockpit's existing connecting screen surfaces the code + approval link.
///
/// Unlike [`spawn_desktop_login_if_needed`], this is NOT gated on token-absence
/// and does NOT touch the bridge — the user explicitly clicked "Sign in", so we
/// run device-flow even if a (stale/expired) token exists, and the caller is a
/// short-lived `musu login --desktop` process, not the bridge host. The cockpit
/// spawns it detached and learns the outcome by polling the marker.
pub async fn run_login_desktop_flow() -> Result<()> {
    let musu_home = crate::install::resolve_musu_home_from_env()?;
    let marker_home = musu_home.clone();
    let on_pending = move |url: &str, code: &str| {
        write_startup_marker(
            &marker_home,
            LaunchMode::UserOpen,
            "awaiting-device-approval",
            None,
            Some(url.to_string()),
            Some(code.to_string()),
        );
    };

    match crate::install::cli_commands::run_desktop_login(on_pending).await {
        Ok(()) => {
            write_startup_marker(
                &musu_home,
                LaunchMode::UserOpen,
                "device-approved",
                None,
                None,
                None,
            );
            tracing::info!("desktop re-login completed; node connected");
            Ok(())
        }
        Err(err) => {
            write_startup_marker(
                &musu_home,
                LaunchMode::UserOpen,
                "device-flow-failed",
                Some(format!("{err:#}")),
                None,
                None,
            );
            tracing::warn!(error = %err, "desktop re-login did not complete");
            Err(err)
        }
    }
}

/// If this machine has no account token yet, spawn the device-flow login as a
/// detached background task. Fast path: already logged in → no-op (idempotent
/// re-launch). Login failure is intentionally NON-FATAL: the detached task records
/// the outcome into `startup-marker.json` and exits while `bridge::run()` keeps the
/// foreground — the bridge must never depend on the cloud round-trip succeeding.
fn spawn_desktop_login_if_needed(musu_home: &Path) {
    if crate::cloud::token::load_token(musu_home).is_some() {
        tracing::info!("desktop launch: account token present, skipping device-flow");
        write_startup_marker(
            musu_home,
            LaunchMode::UserOpen,
            "logged-in",
            None,
            None,
            None,
        );
        return;
    }

    let home = musu_home.to_path_buf();
    tokio::spawn(async move {
        let marker_home = home.clone();
        let on_pending = move |url: &str, code: &str| {
            write_startup_marker(
                &marker_home,
                LaunchMode::UserOpen,
                "awaiting-device-approval",
                None,
                Some(url.to_string()),
                Some(code.to_string()),
            );
        };

        match crate::install::cli_commands::run_desktop_login(on_pending).await {
            Ok(()) => {
                write_startup_marker(
                    &home,
                    LaunchMode::UserOpen,
                    "device-approved",
                    None,
                    None,
                    None,
                );
                tracing::info!("desktop device-flow completed; node connected");
            }
            Err(err) => {
                write_startup_marker(
                    &home,
                    LaunchMode::UserOpen,
                    "device-flow-failed",
                    Some(format!("{err:#}")),
                    None,
                    None,
                );
                tracing::warn!(error = %err, "desktop device-flow did not complete; bridge stays up");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mode_of(args: &[&str]) -> LaunchMode {
        LaunchMode::from_args(args.iter().map(|s| s.to_string()))
    }

    #[test]
    fn bare_invocation_is_service() {
        assert_eq!(mode_of(&[]), LaunchMode::Service);
    }

    #[test]
    fn open_arg_is_user_open() {
        assert_eq!(mode_of(&["open"]), LaunchMode::UserOpen);
    }

    #[test]
    fn service_flag_is_service() {
        assert_eq!(mode_of(&["--service"]), LaunchMode::Service);
    }

    #[test]
    fn unknown_arg_defaults_to_service() {
        assert_eq!(mode_of(&["--verbose"]), LaunchMode::Service);
        assert_eq!(mode_of(&["foo", "bar"]), LaunchMode::Service);
    }

    #[test]
    fn open_anywhere_in_args_is_user_open() {
        assert_eq!(mode_of(&["--verbose", "open"]), LaunchMode::UserOpen);
    }
}
