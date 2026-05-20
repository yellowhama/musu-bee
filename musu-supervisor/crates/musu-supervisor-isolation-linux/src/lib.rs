//! Linux isolation impl using unprivileged user namespaces, bind mounts,
//! and seccomp. Full design in `docs/V21D_DETAIL_PLAN_2026_05_15.md`.
//!
//! Status (2026-05-15): scaffold. `available()` and `spawn()` return
//! `Unsupported` while the unshare/setns pipeline is being wired
//! against the three target distros (Ubuntu 22.04 / Fedora 39 /
//! Alpine 3.19). See task #296 + #303.

use musu_supervisor_isolation::{Isolation, IsolationError, IsolationProfile};
use std::process::{Child, Command};

pub struct LinuxIsolation;

impl LinuxIsolation {
    pub const fn new() -> Self {
        Self
    }
}

impl Default for LinuxIsolation {
    fn default() -> Self {
        Self::new()
    }
}

impl Isolation for LinuxIsolation {
    fn spawn(
        &self,
        _cmd: &mut Command,
        _profile: &IsolationProfile,
    ) -> Result<Child, IsolationError> {
        Err(IsolationError::Unsupported(
            "LinuxIsolation::spawn not yet wired — task #296 in progress".into(),
        ))
    }

    fn available(&self) -> Result<(), IsolationError> {
        #[cfg(target_os = "linux")]
        {
            // TODO #296: check /proc/sys/kernel/unprivileged_userns_clone == 1
            // (or absence of the sysctl on newer kernels).
            Err(IsolationError::Unsupported(
                "LinuxIsolation runtime check pending implementation".into(),
            ))
        }
        #[cfg(not(target_os = "linux"))]
        {
            Err(IsolationError::Unsupported(
                "LinuxIsolation only available on target_os=\"linux\"".into(),
            ))
        }
    }

    fn name(&self) -> &'static str {
        "linux-userns"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_is_stable() {
        assert_eq!(LinuxIsolation::new().name(), "linux-userns");
    }

    #[test]
    fn available_reports_unsupported_until_wired() {
        let iso = LinuxIsolation::new();
        let res = iso.available();
        assert!(matches!(res, Err(IsolationError::Unsupported(_))));
    }
}
