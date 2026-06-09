//! musu-startup — the packaged-runtime bridge entry point.
//!
//! Two distinct launch modes, distinguished by an explicit argv signal
//! (NOT by `is_terminal()` — a GUI double-click has no TTY, so TTY detection
//! would misclassify a user launch as a service launch):
//!
//!   * `musu-startup open`  — the USER explicitly opened MUSU Desktop
//!     (Start-menu / tile / double-click, wired through the desktop shell).
//!     Runs the FULL onboarding sequence: ensure bridge token, start the
//!     bridge in the foreground, AND — if not yet signed in — drive the
//!     device-flow login in a background task that opens the browser to the
//!     approval page. The bridge stays up regardless of whether login is ever
//!     approved.
//!
//!   * `musu-startup` (bare) or `musu-startup --service` — the unattended
//!     logon `windows.startupTask` / service boot. Runs `bridge::run()` ONLY.
//!     NEVER triggers device-flow: a 900s blocking poll on every headless /
//!     remote-node logon would be a severe regression (the historical safety
//!     guard documented at cli_commands.rs `run_up`).
//!
//! Packaging contract (see HANDOFF / build-msix.ps1): the `windows.startupTask`
//! invokes `musu-startup.exe` with NO arguments (service mode). The user-facing
//! launch (the `musu-desktop.exe` Application shell) must invoke the bridge
//! with the `open` argument so it gets the full onboarding sequence.

use anyhow::Result;
use chrono::Utc;
use serde::Serialize;
use std::path::Path;

/// Launch intent derived from argv. See module docs for why this is an explicit
/// signal rather than `is_terminal()`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LaunchMode {
    /// Explicit user launch (Desktop). Full sequence incl. device-flow.
    UserOpen,
    /// Unattended logon/service boot. Bridge only, never device-flow.
    Service,
}

impl LaunchMode {
    fn from_args<I: Iterator<Item = String>>(mut args: I) -> Self {
        // Skip argv[0].
        let _ = args.next();
        for arg in args {
            match arg.as_str() {
                "open" => return LaunchMode::UserOpen,
                // Explicit service flag and any unknown arg both fall through to
                // the safe default (Service) below; bare invocation has no args.
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
    /// Device-flow approval URL, set once the `open` path issues a code so a
    /// status surface (browser /device page, dashboard) can read it.
    #[serde(skip_serializing_if = "Option::is_none")]
    device_approval_url: Option<String>,
    /// Device-flow user code, paired with `device_approval_url`.
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
        distribution: musu_rs::install::distribution::DistributionMode::current()
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

fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .try_init();
}

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();
    if std::env::var_os("MUSU_DISTRIBUTION").is_none() {
        std::env::set_var("MUSU_DISTRIBUTION", "store-msix");
    }

    let mode = LaunchMode::from_args(std::env::args());
    let musu_home = musu_rs::install::resolve_musu_home_from_env()?;
    let _token = musu_rs::install::token::ensure_bridge_token(&musu_home)?;
    write_startup_marker(&musu_home, mode, "launching", None, None, None);
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        launch_mode = mode.as_str(),
        "musu-startup launching packaged bridge runtime"
    );

    // HARD-1: only the explicit user-open path is allowed to drive device-flow.
    // Service/logon boot stays bridge-only — see module docs.
    if mode == LaunchMode::UserOpen {
        spawn_desktop_login_if_needed(&musu_home);
    }

    // MEDIUM-1: bridge::run() is the FOREGROUND future that keeps the process
    // alive. The login task above is a detached background task, so the bridge
    // comes up and stays up regardless of whether login is ever approved. We
    // never double-launch the bridge (no spawn_bridge_process here).
    match musu_rs::bridge::run().await {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn mode_of(args: &[&str]) -> LaunchMode {
        // Prepend a fake argv[0] like the real process would have.
        let mut v = vec!["musu-startup".to_string()];
        v.extend(args.iter().map(|s| s.to_string()));
        LaunchMode::from_args(v.into_iter())
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
        // Safety default: anything we don't recognize must NOT trigger
        // device-flow. Only an explicit `open` opts into the full sequence.
        assert_eq!(mode_of(&["--verbose"]), LaunchMode::Service);
        assert_eq!(mode_of(&["foo", "bar"]), LaunchMode::Service);
    }

    #[test]
    fn open_anywhere_in_args_is_user_open() {
        assert_eq!(mode_of(&["--verbose", "open"]), LaunchMode::UserOpen);
    }
}

/// If this machine has no account token yet, spawn the device-flow login as a
/// detached background task. Fast path: if already logged in, this is a no-op
/// (idempotent re-launch, per spec §4 / §6).
fn spawn_desktop_login_if_needed(musu_home: &Path) {
    if musu_rs::cloud::token::load_token(musu_home).is_some() {
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
        // The on_pending callback records the approval URL + code into the
        // startup marker so a status surface (browser /device, dashboard) can
        // present them without a terminal.
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

        match musu_rs::install::cli_commands::run_desktop_login(on_pending).await {
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
                // Login failing must NOT take down the bridge. Record and move on.
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
