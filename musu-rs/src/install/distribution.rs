//! Distribution/runtime context detection.
//!
//! The same `musu` binary can run in two materially different deployment
//! models:
//!
//! 1. Direct-download install (`install.ps1` / GitHub release asset).
//! 2. Packaged Microsoft Store / MSIX install with package identity.
//!
//! Store/MSIX builds must not follow the same self-install / self-update /
//! Task Scheduler path as the direct-download build. This module centralizes
//! detection and the handful of path decisions needed by the installer layer.

use anyhow::Result;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DistributionMode {
    DirectDownload,
    StoreMsix,
}

impl DistributionMode {
    pub fn current() -> Self {
        match std::env::var("MUSU_DISTRIBUTION").ok().as_deref() {
            Some("direct") | Some("direct-download") | Some("direct_download") => {
                Self::DirectDownload
            }
            Some("store") | Some("msix") | Some("store-msix") | Some("store_msix") => {
                Self::StoreMsix
            }
            Some("auto") | None | Some("") => detect_runtime_mode(),
            Some(other) => {
                tracing::warn!(
                    value = %other,
                    "unknown MUSU_DISTRIBUTION override; falling back to runtime detection"
                );
                detect_runtime_mode()
            }
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::DirectDownload => "direct-download",
            Self::StoreMsix => "store-msix",
        }
    }

    pub fn is_store_msix(self) -> bool {
        matches!(self, Self::StoreMsix)
    }

    pub fn supports_self_update(self) -> bool {
        matches!(self, Self::DirectDownload)
    }

    pub fn supports_platform_service_install(self) -> bool {
        matches!(self, Self::DirectDownload)
    }

    pub fn uses_packaged_binaries(self) -> bool {
        matches!(self, Self::StoreMsix)
    }
}

pub fn resolve_musud_path(musu_home: &Path) -> Result<PathBuf> {
    let mode = DistributionMode::current();
    if mode.uses_packaged_binaries() {
        let current = std::env::current_exe()?;
        if let Some(parent) = current.parent() {
            let packaged = parent.join(super::musud_binary_name());
            if packaged.exists() {
                return Ok(packaged);
            }
        }
    }
    Ok(musu_home.join("bin").join(super::musud_binary_name()))
}

fn detect_runtime_mode() -> DistributionMode {
    #[cfg(windows)]
    {
        if has_package_identity() {
            return DistributionMode::StoreMsix;
        }
    }
    DistributionMode::DirectDownload
}

#[cfg(windows)]
fn has_package_identity() -> bool {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    let mut len = 0u32;
    // SAFETY: Passing a valid pointer to `len` and a null output buffer is
    // the documented probe pattern for package identity detection.
    let rc = unsafe { GetCurrentPackageFullName(&mut len, null_mut()) };
    rc == ERROR_SUCCESS || rc == ERROR_INSUFFICIENT_BUFFER
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_env_override_wins() {
        std::env::set_var("MUSU_DISTRIBUTION", "store-msix");
        assert_eq!(DistributionMode::current(), DistributionMode::StoreMsix);
        std::env::set_var("MUSU_DISTRIBUTION", "direct-download");
        assert_eq!(
            DistributionMode::current(),
            DistributionMode::DirectDownload
        );
        std::env::remove_var("MUSU_DISTRIBUTION");
    }

    #[test]
    fn mode_capabilities_match_distribution() {
        assert!(DistributionMode::DirectDownload.supports_self_update());
        assert!(DistributionMode::DirectDownload.supports_platform_service_install());
        assert!(!DistributionMode::DirectDownload.uses_packaged_binaries());

        assert!(!DistributionMode::StoreMsix.supports_self_update());
        assert!(!DistributionMode::StoreMsix.supports_platform_service_install());
        assert!(DistributionMode::StoreMsix.uses_packaged_binaries());
    }
}
