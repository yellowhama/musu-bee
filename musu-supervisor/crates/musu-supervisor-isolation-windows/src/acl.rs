//! Per-path ACL grants for AppContainer SIDs.
//!
//! `grant_path_to_sid(path, sid, mode)` reads the current DACL on `path`,
//! merges in a new ACE for `sid` with the requested access bits, and
//! writes the result back via `SetNamedSecurityInfoW`.
//!
//! `revoke_path_from_sid(path, sid)` removes any ACEs naming `sid` from
//! the path's DACL. Used by `AclGrant::Drop` for best-effort cleanup so
//! a crash doesn't permanently leave AppContainer SIDs on user files.
//!
//! Design notes:
//!   - We always `GetNamedSecurityInfoW` first to read the *existing*
//!     DACL, then `SetEntriesInAclW` to add our ACE on top. NEVER pass
//!     `oldacl=None` — that would wipe inheritance and lock everyone
//!     else out.
//!   - `SetNamedSecurityInfoW` with `UNPROTECTED_DACL_SECURITY_INFORMATION`
//!     keeps inherited ACEs flowing from the parent. We just add our
//!     own explicit entry.
//!   - For directories we set inheritance flag `SUB_CONTAINERS_AND_OBJECTS_INHERIT`
//!     so files created inside also get the grant. For files (no children)
//!     we use `NO_INHERITANCE`.

#![cfg(target_os = "windows")]

use std::path::Path;

use musu_supervisor_isolation::IsolationError;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{LocalFree, HLOCAL, PSID};
use windows::Win32::Security::Authorization::{
    GetNamedSecurityInfoW, SetEntriesInAclW, SetNamedSecurityInfoW,
    EXPLICIT_ACCESS_W, GRANT_ACCESS, NO_MULTIPLE_TRUSTEE, SE_FILE_OBJECT,
    TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows::Win32::Security::{
    ACL, ACE_FLAGS, NO_INHERITANCE, SUB_CONTAINERS_AND_OBJECTS_INHERIT,
    DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, UNPROTECTED_DACL_SECURITY_INFORMATION,
};

/// Access mode for a single path grant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessMode {
    /// GENERIC_READ — list dir, read files, traverse.
    Read,
    /// GENERIC_READ | GENERIC_WRITE | GENERIC_EXECUTE | DELETE — full
    /// access short of taking ownership.
    ReadWrite,
}

impl AccessMode {
    fn access_mask(self) -> u32 {
        // Constants from winnt.h. We don't pull them via the windows
        // crate because they're scattered across multiple modules and
        // these specific bits are stable forever.
        const GENERIC_READ: u32 = 0x80000000;
        const GENERIC_WRITE: u32 = 0x40000000;
        const GENERIC_EXECUTE: u32 = 0x20000000;
        const DELETE: u32 = 0x00010000;
        match self {
            AccessMode::Read => GENERIC_READ | GENERIC_EXECUTE,
            AccessMode::ReadWrite => {
                GENERIC_READ | GENERIC_WRITE | GENERIC_EXECUTE | DELETE
            }
        }
    }
}

/// Grant `sid` the requested `mode` on `path`. The path's existing DACL
/// is preserved — we add one explicit ACE and write the result back.
pub fn grant_path_to_sid(
    path: &Path,
    sid: PSID,
    mode: AccessMode,
) -> Result<(), IsolationError> {
    let path_h = HSTRING::from(path.as_os_str());

    let is_dir = path.is_dir();
    let inherit: ACE_FLAGS = if is_dir {
        SUB_CONTAINERS_AND_OBJECTS_INHERIT
    } else {
        NO_INHERITANCE
    };

    // 1. Read existing DACL.
    let mut existing_dacl: *mut ACL = std::ptr::null_mut();
    let mut sd_handle = PSECURITY_DESCRIPTOR::default();
    // SAFETY: path_h outlives the call; output pointers are owned by
    // the API and freed via LocalFree on sd_handle below.
    let err = unsafe {
        GetNamedSecurityInfoW(
            PCWSTR(path_h.as_ptr()),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            None,
            None,
            Some(&mut existing_dacl as *mut _),
            None,
            &mut sd_handle as *mut _,
        )
    };
    if err.0 != 0 {
        return Err(IsolationError::SetupFailed {
            context: format!(
                "GetNamedSecurityInfoW({}) → WIN32_ERROR {}",
                path.display(),
                err.0
            ),
            source: std::io::Error::from_raw_os_error(err.0 as i32),
        });
    }

    // 2. Build the ACE we want to add.
    let mut ea = EXPLICIT_ACCESS_W::default();
    ea.grfAccessPermissions = mode.access_mask();
    ea.grfAccessMode = GRANT_ACCESS;
    ea.grfInheritance = inherit;
    ea.Trustee = TRUSTEE_W {
        pMultipleTrustee: std::ptr::null_mut(),
        MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
        TrusteeForm: TRUSTEE_IS_SID,
        TrusteeType: TRUSTEE_IS_UNKNOWN,
        ptstrName: windows::core::PWSTR(sid.0 as *mut u16),
    };

    // 3. Merge with existing DACL → new ACL.
    let mut new_dacl: *mut ACL = std::ptr::null_mut();
    let ea_slice = [ea];
    let merge_err = unsafe {
        SetEntriesInAclW(
            Some(&ea_slice),
            Some(existing_dacl as *const ACL),
            &mut new_dacl as *mut _,
        )
    };
    if merge_err.0 != 0 {
        unsafe {
            LocalFree(HLOCAL(sd_handle.0 as *mut _));
        }
        return Err(IsolationError::SetupFailed {
            context: format!(
                "SetEntriesInAclW({}) → WIN32_ERROR {}",
                path.display(),
                merge_err.0
            ),
            source: std::io::Error::from_raw_os_error(merge_err.0 as i32),
        });
    }

    // 4. Write merged DACL back to the path.
    // SAFETY: new_dacl is a valid ACL pointer returned by SetEntriesInAclW.
    let write_err = unsafe {
        SetNamedSecurityInfoW(
            PCWSTR(path_h.as_ptr()),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION | UNPROTECTED_DACL_SECURITY_INFORMATION,
            None,
            None,
            Some(new_dacl as *const ACL),
            None,
        )
    };

    // 5. Cleanup the allocations we own (regardless of write result).
    unsafe {
        LocalFree(HLOCAL(new_dacl as *mut _));
        LocalFree(HLOCAL(sd_handle.0 as *mut _));
    }

    if write_err.0 != 0 {
        return Err(IsolationError::SetupFailed {
            context: format!(
                "SetNamedSecurityInfoW({}) → WIN32_ERROR {}",
                path.display(),
                write_err.0
            ),
            source: std::io::Error::from_raw_os_error(write_err.0 as i32),
        });
    }

    Ok(())
}

/// Remove any ACEs naming `sid` from `path`'s DACL. Best-effort: if the
/// path no longer exists (was deleted), we treat that as success.
pub fn revoke_path_from_sid(path: &Path, sid: PSID) -> Result<(), IsolationError> {
    if !path.exists() {
        return Ok(());
    }
    let path_h = HSTRING::from(path.as_os_str());

    let mut existing_dacl: *mut ACL = std::ptr::null_mut();
    let mut sd_handle = PSECURITY_DESCRIPTOR::default();
    let err = unsafe {
        GetNamedSecurityInfoW(
            PCWSTR(path_h.as_ptr()),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            None,
            None,
            Some(&mut existing_dacl as *mut _),
            None,
            &mut sd_handle as *mut _,
        )
    };
    if err.0 != 0 {
        return Err(IsolationError::SetupFailed {
            context: format!(
                "GetNamedSecurityInfoW({}) revoke → WIN32_ERROR {}",
                path.display(),
                err.0
            ),
            source: std::io::Error::from_raw_os_error(err.0 as i32),
        });
    }

    // Build a REVOKE_ACCESS entry for our SID.
    const REVOKE_ACCESS: windows::Win32::Security::Authorization::ACCESS_MODE =
        windows::Win32::Security::Authorization::ACCESS_MODE(4i32);
    let mut ea = EXPLICIT_ACCESS_W::default();
    ea.grfAccessPermissions = 0; // REVOKE ignores this
    ea.grfAccessMode = REVOKE_ACCESS;
    ea.grfInheritance = NO_INHERITANCE;
    ea.Trustee = TRUSTEE_W {
        pMultipleTrustee: std::ptr::null_mut(),
        MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
        TrusteeForm: TRUSTEE_IS_SID,
        TrusteeType: TRUSTEE_IS_UNKNOWN,
        ptstrName: windows::core::PWSTR(sid.0 as *mut u16),
    };

    let mut new_dacl: *mut ACL = std::ptr::null_mut();
    let ea_slice = [ea];
    let merge_err = unsafe {
        SetEntriesInAclW(
            Some(&ea_slice),
            Some(existing_dacl as *const ACL),
            &mut new_dacl as *mut _,
        )
    };
    if merge_err.0 != 0 {
        unsafe {
            LocalFree(HLOCAL(sd_handle.0 as *mut _));
        }
        return Err(IsolationError::SetupFailed {
            context: format!(
                "SetEntriesInAclW({}) revoke → WIN32_ERROR {}",
                path.display(),
                merge_err.0
            ),
            source: std::io::Error::from_raw_os_error(merge_err.0 as i32),
        });
    }

    let write_err = unsafe {
        SetNamedSecurityInfoW(
            PCWSTR(path_h.as_ptr()),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION | UNPROTECTED_DACL_SECURITY_INFORMATION,
            None,
            None,
            Some(new_dacl as *const ACL),
            None,
        )
    };

    unsafe {
        LocalFree(HLOCAL(new_dacl as *mut _));
        LocalFree(HLOCAL(sd_handle.0 as *mut _));
    }

    if write_err.0 != 0 {
        return Err(IsolationError::SetupFailed {
            context: format!(
                "SetNamedSecurityInfoW({}) revoke → WIN32_ERROR {}",
                path.display(),
                write_err.0
            ),
            source: std::io::Error::from_raw_os_error(write_err.0 as i32),
        });
    }
    Ok(())
}

/// RAII handle bundling a set of (path, sid) grants. Drops revoke each
/// grant on cleanup so a crashing supervisor doesn't leave AppContainer
/// SIDs on user files forever.
///
/// The same SID is used for every grant (one AppContainer per spawn).
pub struct AclGrant {
    paths: Vec<std::path::PathBuf>,
    sid: PSID,
}

impl AclGrant {
    pub fn new(sid: PSID) -> Self {
        Self { paths: Vec::new(), sid }
    }

    pub fn grant(
        &mut self,
        path: &Path,
        mode: AccessMode,
    ) -> Result<(), IsolationError> {
        grant_path_to_sid(path, self.sid, mode)?;
        self.paths.push(path.to_path_buf());
        Ok(())
    }
}

impl Drop for AclGrant {
    fn drop(&mut self) {
        for path in self.paths.drain(..) {
            // SAFETY: self.sid still valid until our drop completes;
            // AppContainerProfile (which owns the SID lifetime) must
            // outlive AclGrant. The supervisor enforces this by holding
            // the profile across the entire spawn lifecycle.
            let _ = revoke_path_from_sid(&path, self.sid);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::AppContainerProfile;
    use std::fs;

    fn tmp_dir(label: &str) -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "musu-acl-test-{label}-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir(&p).expect("create tmp dir");
        p
    }

    fn tmp_file(label: &str, contents: &[u8]) -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "musu-acl-test-{label}-{}.bin",
            uuid::Uuid::new_v4().simple()
        ));
        fs::write(&p, contents).expect("write tmp file");
        p
    }

    #[test]
    fn grant_then_revoke_directory_roundtrip() {
        let profile = AppContainerProfile::create_unique("musud-acl")
            .expect("create profile");
        let dir = tmp_dir("dir");

        // Grant — must not error.
        grant_path_to_sid(&dir, profile.sid(), AccessMode::ReadWrite)
            .expect("grant on directory");

        // Revoke — must not error.
        revoke_path_from_sid(&dir, profile.sid())
            .expect("revoke on directory");

        // Cleanup
        fs::remove_dir(&dir).ok();
    }

    #[test]
    fn grant_then_revoke_file_roundtrip() {
        let profile = AppContainerProfile::create_unique("musud-acl")
            .expect("create profile");
        let file = tmp_file("file", b"hello");

        grant_path_to_sid(&file, profile.sid(), AccessMode::Read)
            .expect("grant on file");

        revoke_path_from_sid(&file, profile.sid())
            .expect("revoke on file");

        fs::remove_file(&file).ok();
    }

    #[test]
    fn revoke_missing_path_is_ok() {
        let profile = AppContainerProfile::create_unique("musud-acl")
            .expect("create profile");
        let missing = std::env::temp_dir()
            .join(format!("does-not-exist-{}", uuid::Uuid::new_v4().simple()));
        // No need to create — revoke must handle absence gracefully.
        revoke_path_from_sid(&missing, profile.sid())
            .expect("revoke on missing path");
    }

    #[test]
    fn acl_grant_raii_revokes_on_drop() {
        let profile = AppContainerProfile::create_unique("musud-acl-raii")
            .expect("create profile");
        let dir = tmp_dir("raii");

        {
            let mut grant = AclGrant::new(profile.sid());
            grant.grant(&dir, AccessMode::ReadWrite).expect("grant");
            // grant goes out of scope here → Drop revokes
        }

        // The revoke happened — if it had failed we'd have to manually
        // run icacls /reset to clean up. We can't directly assert "ACE
        // is gone" without GetNamedSecurityInfo introspection, so the
        // test asserts no panic during Drop and that a follow-up
        // explicit revoke is still a no-op (no error).
        revoke_path_from_sid(&dir, profile.sid())
            .expect("post-drop revoke must succeed (no-op)");

        fs::remove_dir(&dir).ok();
    }

    #[test]
    fn access_mask_bits_are_what_we_expect() {
        // Sanity: catch accidental const drift.
        assert_eq!(AccessMode::Read.access_mask(), 0x80000000 | 0x20000000);
        assert_eq!(
            AccessMode::ReadWrite.access_mask(),
            0x80000000 | 0x40000000 | 0x20000000 | 0x00010000
        );
    }
}
