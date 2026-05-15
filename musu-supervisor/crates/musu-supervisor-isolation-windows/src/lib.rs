//! Windows isolation impl using AppContainer + Job Object + restricted
//! token. Full design in `docs/V21D_DETAIL_PLAN_2026_05_15.md`.
//!
//! Implementation iterations (driven by /loop):
//!   1. `available()` — OS version check via RtlGetVersion (Win10 17134+). [done]
//!   2. AppContainerProfile RAII wrapper + SID derivation.                   [done]
//!   3. ACL grant/revoke for allow_read / allow_write paths.                 [done]
//!   4. CreateJobObject + memory/time/process-count limits.                  [done]
//!   5a. STARTUPINFOEXW + proc-thread attribute list + SECURITY_CAPABILITIES. [done]
//!   5b. CreateProcessW + AssignProcessToJobObject + ResumeThread.           [done]
//!   6. spawn_sandboxed entry point + cmd.exe /c echo smoke test.            [done]
//!
//! See `process::spawn_sandboxed` for the integrated entry point.
//! `Isolation::spawn` (trait) returns `Unsupported` because the trait's
//! return type is `std::process::Child`, which can't be constructed from
//! a raw HANDLE on stable Rust. Supervisor code calls `spawn_sandboxed`
//! directly and works with the richer `SandboxedProcess`.
//!
//! Why AppContainer over Job Object alone: AppContainer enforces FS/registry
//! access via a per-profile SID + capability allowlist (zero caps = no
//! internetClient, no documentsLibrary, etc). Job Object adds resource
//! caps and kill-on-close. Combined gives both confinement and resource bounds.

use musu_supervisor_isolation::{Isolation, IsolationError, IsolationProfile};
use std::process::{Child, Command};

#[cfg(target_os = "windows")]
pub mod acl;
#[cfg(target_os = "windows")]
pub mod attr_list;
#[cfg(target_os = "windows")]
pub mod job_object;
#[cfg(target_os = "windows")]
pub mod process;
#[cfg(target_os = "windows")]
pub mod profile;

#[cfg(target_os = "windows")]
pub use process::{spawn_sandboxed, SandboxedProcess};

#[cfg(target_os = "windows")]
mod os_version {
    use super::*;
    use windows::Wdk::System::SystemServices::RtlGetVersion;
    use windows::Win32::System::SystemInformation::OSVERSIONINFOW;

    /// Minimum Windows 10 build with the AppContainer hardening we rely on.
    /// Build 17134 = "1803" / RS4. Earlier builds had AppContainer but
    /// `CreateAppContainerProfile` capability-list semantics shifted in 1803.
    pub const MIN_BUILD: u32 = 17134;

    pub fn check() -> Result<u32, IsolationError> {
        let mut info = OSVERSIONINFOW {
            dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
            ..Default::default()
        };
        // SAFETY: RtlGetVersion writes into the OSVERSIONINFOW we own; we
        // pre-set dwOSVersionInfoSize as required by the API contract.
        let status = unsafe { RtlGetVersion(&mut info) };
        if status.is_err() {
            return Err(IsolationError::Unsupported(format!(
                "RtlGetVersion failed: NTSTATUS 0x{:x}",
                status.0,
            )));
        }
        if info.dwMajorVersion < 10 {
            return Err(IsolationError::Unsupported(format!(
                "Windows {}.{} build {} — need Windows 10 build {} or newer",
                info.dwMajorVersion,
                info.dwMinorVersion,
                info.dwBuildNumber,
                MIN_BUILD,
            )));
        }
        if info.dwBuildNumber < MIN_BUILD {
            return Err(IsolationError::Unsupported(format!(
                "Windows build {} predates AppContainer hardening — need {}+",
                info.dwBuildNumber, MIN_BUILD,
            )));
        }
        Ok(info.dwBuildNumber)
    }
}

pub struct WindowsIsolation;

impl WindowsIsolation {
    pub const fn new() -> Self {
        Self
    }
}

impl Default for WindowsIsolation {
    fn default() -> Self {
        Self::new()
    }
}

impl Isolation for WindowsIsolation {
    fn spawn(
        &self,
        _cmd: &mut Command,
        _profile: &IsolationProfile,
    ) -> Result<Child, IsolationError> {
        // spawn pipeline is being implemented in /loop iterations.
        // available() is functional; profile module works; remaining:
        // ACL grant, Job Object, CreateProcessW with SECURITY_CAPABILITIES.
        Err(IsolationError::Unsupported(
            "WindowsIsolation::spawn pipeline pending — \
             ACL + Job Object + CreateProcessW wiring (task #297)"
                .into(),
        ))
    }

    fn available(&self) -> Result<(), IsolationError> {
        #[cfg(target_os = "windows")]
        {
            os_version::check().map(|_| ())
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err(IsolationError::Unsupported(
                "WindowsIsolation only available on target_os=\"windows\""
                    .into(),
            ))
        }
    }

    fn name(&self) -> &'static str {
        "windows-appcontainer"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_is_stable() {
        assert_eq!(WindowsIsolation::new().name(), "windows-appcontainer");
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn available_on_modern_windows_returns_ok() {
        let iso = WindowsIsolation::new();
        match iso.available() {
            Ok(()) => {}
            Err(IsolationError::Unsupported(msg)) => panic!(
                "available() returned Unsupported on a supported host: {msg}"
            ),
            Err(e) => panic!("unexpected error: {e:?}"),
        }
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn available_off_windows_reports_unsupported() {
        let iso = WindowsIsolation::new();
        assert!(matches!(iso.available(), Err(IsolationError::Unsupported(_))));
    }

    #[test]
    fn spawn_returns_unsupported_until_pipeline_wired() {
        let iso = WindowsIsolation::new();
        let mut cmd = Command::new("cmd");
        let res = iso.spawn(&mut cmd, &IsolationProfile::default());
        assert!(matches!(res, Err(IsolationError::Unsupported(_))));
    }
}
