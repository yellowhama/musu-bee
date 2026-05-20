//! macOS isolation impl wrapping `/usr/bin/sandbox-exec` with a
//! per-spawn rendered Seatbelt profile (sbpl). Full design in
//! `docs/V21D_DETAIL_PLAN_2026_05_15.md`.
//!
//! Status (2026-05-15): scaffold. `available()` and `spawn()` return
//! `Unsupported` while the sbpl renderer + sandbox-exec wrapping is
//! being wired. See task #298.

use musu_supervisor_isolation::{Isolation, IsolationError, IsolationProfile};
use std::process::{Child, Command};

pub struct MacOsIsolation;

impl MacOsIsolation {
    pub const fn new() -> Self {
        Self
    }
}

impl Default for MacOsIsolation {
    fn default() -> Self {
        Self::new()
    }
}

impl Isolation for MacOsIsolation {
    fn spawn(
        &self,
        _cmd: &mut Command,
        _profile: &IsolationProfile,
    ) -> Result<Child, IsolationError> {
        Err(IsolationError::Unsupported(
            "MacOsIsolation::spawn not yet wired — task #298 in progress".into(),
        ))
    }

    fn available(&self) -> Result<(), IsolationError> {
        #[cfg(target_os = "macos")]
        {
            // TODO #298: stat /usr/bin/sandbox-exec, gate on macOS ≤ 17.
            // (Apple deprecated sbpl; long-term migrate to Endpoint
            // Security framework with a signed system extension.)
            Err(IsolationError::Unsupported(
                "MacOsIsolation runtime check pending implementation".into(),
            ))
        }
        #[cfg(not(target_os = "macos"))]
        {
            Err(IsolationError::Unsupported(
                "MacOsIsolation only available on target_os=\"macos\"".into(),
            ))
        }
    }

    fn name(&self) -> &'static str {
        "macos-seatbelt"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_is_stable() {
        assert_eq!(MacOsIsolation::new().name(), "macos-seatbelt");
    }

    #[test]
    fn available_reports_unsupported_until_wired() {
        let iso = MacOsIsolation::new();
        let res = iso.available();
        assert!(matches!(res, Err(IsolationError::Unsupported(_))));
    }
}
