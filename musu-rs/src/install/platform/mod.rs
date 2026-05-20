//! Platform-service abstraction.
//!
//! wiki/496 §3 NEW `musu-rs/src/install/platform/`. Each OS implements the
//! `PlatformService` trait. `current()` returns the active impl based on
//! `cfg(target_os = ...)`.
//!
//! Service registration responsibilities (one per OS):
//!
//!   - Linux  (`linux.rs`)  : systemd user unit at `~/.config/systemd/user/musud.service`
//!   - macOS  (`macos.rs`)  : launchd LaunchAgent at `~/Library/LaunchAgents/com.musu.musud.plist`
//!   - Windows (`windows.rs`): Scheduled Task `Musu\musud` (default) OR Windows Service (--boot-start)
//!
//! Each impl produces a `TemplateSpec` for the dry-run validator (D13).

use anyhow::Result;
use std::path::Path;

use super::dry_run::TemplateSpec;

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

/// Live status of a registered platform service.
///
/// Returned by `PlatformService::status`. Not consumed by R6 callers
/// directly (install/uninstall don't branch on it); we surface it so
/// future R7+ status subcommands can use the same trait.
#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(dead_code)]
pub enum ServiceStatus {
    /// Service is registered with the platform service manager AND running.
    Running,
    /// Service is registered but not currently running.
    Registered,
    /// Service is not registered.
    NotInstalled,
}

/// Per-platform service install/uninstall/status contract.
pub trait PlatformService {
    /// Register the service with the platform service manager and start it.
    /// Idempotent: if already registered, only re-renders the unit file
    /// and reloads — does not error.
    fn register(&self, ctx: &RegisterContext) -> Result<()>;

    /// Unregister: stop the service if running, then remove the unit file
    /// / Scheduled Task. Idempotent: succeeds if not installed.
    fn unregister(&self) -> Result<()>;

    /// Query current status. Not called by R6's runner.rs / uninstall.rs
    /// but exposed on the trait so future status subcommands can use it.
    #[allow(dead_code)]
    fn status(&self) -> Result<ServiceStatus>;

    /// Produce the unit-file blob(s) the registration WOULD write, without
    /// touching the real filesystem or service manager. Used by --dry-run.
    fn dry_run_templates(&self, ctx: &RegisterContext) -> Result<Vec<TemplateSpec>>;
}

/// Inputs the registrar needs from the caller (install runner).
pub struct RegisterContext<'a> {
    /// Absolute path to `~/.musu/`.
    pub musu_home: &'a Path,
    /// Whether the Windows --boot-start opt-in path was selected.
    pub boot_start: bool,
}

/// Return the active platform service impl, boxed to keep the call sites
/// simple regardless of OS.
pub fn current() -> Box<dyn PlatformService> {
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::SystemdUserService)
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::LaunchAgentService)
    }
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsService)
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Box::new(NullService)
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
struct NullService;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
impl PlatformService for NullService {
    fn register(&self, _ctx: &RegisterContext) -> Result<()> {
        anyhow::bail!("unsupported platform — no service registrar")
    }
    fn unregister(&self) -> Result<()> {
        anyhow::bail!("unsupported platform — no service registrar")
    }
    fn status(&self) -> Result<ServiceStatus> {
        Ok(ServiceStatus::NotInstalled)
    }
    fn dry_run_templates(&self, _ctx: &RegisterContext) -> Result<Vec<TemplateSpec>> {
        Ok(Vec::new())
    }
}
