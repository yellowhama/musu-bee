//! Windows isolation impl using AppContainer + Job Object + restricted
//! token. Full design in `docs/V21D_DETAIL_PLAN_2026_05_15.md`.
//!
//! Status (2026-05-15): scaffold. `available()` and `spawn()` return
//! `Unsupported` while the CreateAppContainerProfile + Job Object
//! pipeline is being wired. See task #297.

use musu_supervisor_isolation::{Isolation, IsolationError, IsolationProfile};
use std::process::{Child, Command};

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
        Err(IsolationError::Unsupported(
            "WindowsIsolation::spawn not yet wired — task #297 in progress".into(),
        ))
    }

    fn available(&self) -> Result<(), IsolationError> {
        #[cfg(target_os = "windows")]
        {
            // TODO #297: check Win10 build ≥ 17134 (AppContainer hardening)
            // and that the user has sufficient rights to call
            // CreateAppContainerProfile.
            Err(IsolationError::Unsupported(
                "WindowsIsolation runtime check pending implementation".into(),
            ))
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err(IsolationError::Unsupported(
                "WindowsIsolation only available on target_os=\"windows\"".into(),
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
    fn available_reports_unsupported_until_wired() {
        let iso = WindowsIsolation::new();
        let res = iso.available();
        assert!(matches!(res, Err(IsolationError::Unsupported(_))));
    }
}
