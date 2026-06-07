//! Installer + auto-update + supervisor-IPC-client subcommands.
//!
//! wiki/496 (V24-R6 INSTALLER-RS). Re-brings the operator-ergonomic
//! install + auto-update + cross-platform supervisor surface that V24-R8
//! deleted at the start of the Rust cleanup. Implemented as native Rust
//! subcommands of the single `musu` binary, with platform-service
//! registration and a hybrid (pre-built binary first, source fallback)
//! auto-update flow.
//!
//! Subcommand surface (all dispatched here from `main.rs`):
//!
//!   musu install [--dry-run] [--boot-start] [--with-musu-bee]
//!   musu uninstall [--purge]
//!   musu auto-update [--build-from-source]
//!   musu supervise          (thin wrapper — execs musud or in-process)
//!   musu schema-precheck    (Const III gate preservation; exits non-zero on delta)
//!   musu apply-schema       (operator-acknowledged migration apply)
//!
//! §1.1 locks: bin name = `musu` (D16). apps/musud already exists (D1).
//! IPC enum gained 5 new variants (D2). Freeze rendezvous protects swap (D4).

pub mod auto_update;
pub mod distribution;
pub mod dry_run;
pub mod package_status;
pub mod platform;
pub mod room_work_orders;
pub mod runner;
pub mod schema_gate;
pub mod staged_swap;
// V24-R3 wiki/493 Critic C4 (HIGH): shared MUSU_BRIDGE_TOKEN resolver.
// Replaces the duplicated `read_ipc_token` impls in auto_update.rs +
// uninstall.rs and is reused by control::bridge_client.
pub mod token;
pub mod uninstall;
pub mod update_lock;
// V27: CLI file-sharing + task-routing subcommands.
#[allow(unreachable_pub)]
pub mod cli_commands;
pub mod shares;
pub mod sync;
pub mod tls;

use anyhow::Result;
use clap::Args;

/// `musu install` — fresh-install on a clean machine.
#[derive(Args, Debug, Clone)]
pub struct InstallOpts {
    /// Validate planned writes without executing (writes unit files to a
    /// tempdir, runs `systemd-analyze verify` / `plutil -lint` / Test-Path).
    /// wiki/496 D13.
    #[arg(long)]
    pub dry_run: bool,

    /// Windows-only: register as a Windows Service (boot-start) instead of
    /// the default Scheduled Task (logon-start). Requires UAC and an
    /// explicit non-system operator account (S2).
    #[arg(long)]
    pub boot_start: bool,

    /// Also install the `musu-bee.service` unit (D14). Only takes effect if
    /// `musu-bee/package.json` is present at the repo root.
    #[arg(long)]
    pub with_musu_bee: bool,

    /// Override the install root (`~/.musu/`). Used by tests with a tempdir.
    #[arg(long, hide = true)]
    pub musu_home: Option<std::path::PathBuf>,
}

/// `musu uninstall` — inverse of install.
#[derive(Args, Debug, Clone)]
pub struct UninstallOpts {
    /// Delete `~/.musu/` data directory after operator-typed confirmation
    /// string `PURGE MY MUSU DATA` (S6). Refuses non-TTY unless paired with
    /// `--i-understand-this-deletes-data`.
    #[arg(long)]
    pub purge: bool,

    /// Non-TTY purge bypass — only honoured together with `--purge`.
    /// Even with this flag, the typed string check is enforced unless the
    /// caller is a true non-TTY (CI/automation).
    #[arg(long)]
    pub i_understand_this_deletes_data: bool,

    /// R6 audit-fix (Auditor B QB5 — operator-gate MED): explicit
    /// acknowledgement that the operator has a backup of `musu.db`. When
    /// `musu.db` was modified within the last 7 days, `--purge` refuses
    /// unless this flag is also passed. Prevents silent same-day deletion
    /// of load-bearing operator data via the prior WARNING-only path.
    #[arg(long)]
    pub i_have_a_backup: bool,

    /// Override the install root. Used by tests with a tempdir.
    #[arg(long, hide = true)]
    pub musu_home: Option<std::path::PathBuf>,
}

/// `musu auto-update` — hybrid (binary first, source fallback) updater.
#[derive(Args, Debug, Clone)]
pub struct AutoUpdateOpts {
    /// Skip the pre-built binary path and rebuild from source via
    /// `git pull && cargo build --release`. Required when no platform
    /// release artifact matches.
    #[arg(long)]
    pub build_from_source: bool,

    /// `supervise` mode — run an in-binary tokio interval that calls
    /// auto-update at the cadence from `update.toml`. Used by the
    /// systemd timer / launchd / Scheduled Task indirection (D8).
    #[arg(long)]
    pub supervise: bool,

    /// Override the install root. Used by tests with a tempdir.
    #[arg(long, hide = true)]
    pub musu_home: Option<std::path::PathBuf>,

    /// Test-only: override the GitHub API base URL (e.g., to a wiremock
    /// instance). Hidden from --help; not allowed in production code paths.
    #[arg(long, hide = true)]
    pub github_api_base: Option<String>,
}

/// `musu schema-precheck` + `musu apply-schema`.
#[derive(Args, Debug, Clone)]
pub struct SchemaGateOpts {
    /// Override the install root. Used by tests with a tempdir.
    #[arg(long, hide = true)]
    pub musu_home: Option<std::path::PathBuf>,
}

/// Resolve `~/.musu` against an optional override or the process home.
///
/// Single source of truth for the install layout root (wiki/496 §4).
pub fn resolve_musu_home(override_dir: Option<&std::path::Path>) -> Result<std::path::PathBuf> {
    if let Some(d) = override_dir {
        return Ok(d.to_path_buf());
    }
    let home = resolve_user_home()?;
    Ok(home.join(".musu"))
}

fn resolve_user_home() -> Result<std::path::PathBuf> {
    for var in ["HOME", "USERPROFILE"] {
        if let Ok(value) = std::env::var(var) {
            if !value.trim().is_empty() {
                return Ok(std::path::PathBuf::from(value));
            }
        }
    }
    dirs::home_dir().ok_or_else(|| {
        anyhow::anyhow!(
            "cannot resolve user home directory (HOME / USERPROFILE unset); \
             pass --musu-home for tests"
        )
    })
}

/// Resolve `~/.musu` using `MUSU_HOME` when present, otherwise the platform
/// home directory.
///
/// This is the shared non-CLI runtime helper for bridge/control/peer code
/// paths that do not receive an explicit `--musu-home` argument but still
/// need to honor the same install/runtime contract.
pub fn resolve_musu_home_from_env() -> Result<std::path::PathBuf> {
    if let Ok(s) = std::env::var("MUSU_HOME") {
        if !s.trim().is_empty() {
            return Ok(std::path::PathBuf::from(s));
        }
    }
    resolve_musu_home(None)
}

/// Entry points dispatched from `main.rs`. Thin wrappers so main.rs stays
/// readable; the real work lives in the sibling modules.
pub async fn run_install(opts: InstallOpts) -> Result<()> {
    runner::run(opts).await
}

pub async fn run_uninstall(opts: UninstallOpts) -> Result<()> {
    uninstall::run(opts).await
}

pub async fn run_auto_update(opts: AutoUpdateOpts) -> Result<()> {
    auto_update::run(opts).await
}

pub async fn run_schema_precheck(opts: SchemaGateOpts) -> Result<()> {
    schema_gate::precheck(opts).await
}

pub async fn run_apply_schema(opts: SchemaGateOpts) -> Result<()> {
    schema_gate::apply(opts).await
}

pub async fn run_package_status() -> Result<()> {
    package_status::run().await
}

/// `musu supervise` — execs `~/.musu/bin/musud` if present, otherwise
/// errors with operator-facing guidance. Per §1.1 Q3 we ship musud as a
/// separate binary (apps/musud/), so the embedded form is intentionally
/// absent — this subcommand is just a friendly indirection.
pub async fn run_supervise(musu_home: Option<std::path::PathBuf>) -> Result<()> {
    let home = resolve_musu_home(musu_home.as_deref())?;
    let musud = distribution::resolve_musud_path(&home)?;
    if !musud.exists() {
        anyhow::bail!(
            "musud binary not found at {}. Run `musu install` first, or package musud alongside the Store/MSIX app, or build apps/musud and copy it manually.",
            musud.display()
        );
    }
    // Replace this process image with musud (Unix exec) / spawn-and-wait
    // (Windows). On Unix we use libc::execv via std::os::unix::process::CommandExt.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let err = std::process::Command::new(&musud).exec();
        // exec only returns on failure.
        anyhow::bail!("exec({}): {}", musud.display(), err);
    }
    #[cfg(windows)]
    {
        let status = std::process::Command::new(&musud).status()?;
        if !status.success() {
            anyhow::bail!("musud exited with status {}", status);
        }
        Ok(())
    }
}

/// Platform-specific musud binary name.
pub fn musud_binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "musud.exe"
    }
    #[cfg(not(windows))]
    {
        "musud"
    }
}

/// Platform-specific musu (this binary) name.
pub fn musu_binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "musu.exe"
    }
    #[cfg(not(windows))]
    {
        "musu"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_musu_home_from_env_prefers_musu_home() {
        std::env::set_var("MUSU_HOME", r"C:\temp\musu-home-test");
        assert_eq!(
            resolve_musu_home_from_env().unwrap(),
            std::path::PathBuf::from(r"C:\temp\musu-home-test")
        );
        std::env::remove_var("MUSU_HOME");
    }

    #[test]
    fn resolve_musu_home_honors_process_home_env_for_runtime_tests() {
        std::env::remove_var("MUSU_HOME");
        let old_home = std::env::var("HOME").ok();
        let old_userprofile = std::env::var("USERPROFILE").ok();
        let temp_home =
            std::env::temp_dir().join(format!("musu-install-home-{}", uuid::Uuid::new_v4()));

        std::env::set_var("HOME", &temp_home);
        std::env::remove_var("USERPROFILE");

        let resolved = resolve_musu_home_from_env().unwrap();

        if let Some(value) = old_home {
            std::env::set_var("HOME", value);
        } else {
            std::env::remove_var("HOME");
        }
        if let Some(value) = old_userprofile {
            std::env::set_var("USERPROFILE", value);
        } else {
            std::env::remove_var("USERPROFILE");
        }

        assert_eq!(resolved, temp_home.join(".musu"));
    }
}
