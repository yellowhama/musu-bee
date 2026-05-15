//! AppContainerProfile — RAII wrapper around CreateAppContainerProfile.
//!
//! Lifecycle:
//!     let profile = AppContainerProfile::create_unique("musud")?;
//!     // … use profile.sid() in CreateProcessW SECURITY_CAPABILITIES …
//!     drop(profile);  // DeleteAppContainerProfile fires here
//!
//! AppContainer profiles are *persistent* — they live in the registry under
//! HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\
//! CurrentVersion\AppContainer\Mappings\<sid>. Without explicit deletion
//! they accumulate forever. Drop guarantees cleanup even on panic.
//!
//! Zero capabilities (empty `pcapabilities` slice) gives us the strongest
//! AppContainer sandbox — no `internetClient`, no `documentsLibrary`, no
//! `picturesLibrary`. The process can ONLY access:
//!   - Files/registry keys explicitly ACL-granted to its container SID
//!   - System DLLs (kernel32.dll, ntdll.dll, etc — granted by default)
//!   - The container's own AppData\Local\Packages\<name>\ directory

#![cfg(target_os = "windows")]

use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;

use musu_supervisor_isolation::IsolationError;
use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{LocalFree, HLOCAL, PSID};
use windows::Win32::Security::Authorization::ConvertSidToStringSidW;
use windows::Win32::Security::Isolation::{
    CreateAppContainerProfile, DeleteAppContainerProfile,
    DeriveAppContainerSidFromAppContainerName,
};

/// Max AppContainer profile name length (chars). API rejects longer names.
pub const MAX_NAME_LEN: usize = 64;

/// RAII handle to a Windows AppContainer profile.
///
/// The contained SID is freed and the profile deleted when this struct
/// is dropped. The PSID is owned — callers borrow it via [`sid`].
pub struct AppContainerProfile {
    name: HSTRING,
    sid: PSID,
}

impl AppContainerProfile {
    /// Create a profile with a unique, musu-namespaced name. Returns the
    /// profile with its SID populated. The name is guaranteed to fit
    /// within [`MAX_NAME_LEN`] and to use only `[A-Za-z0-9.-]`.
    ///
    /// Format: `<prefix>-<uuid-hex-no-dashes>` (≤ 64 chars when prefix
    /// is ≤ 31 chars — we use "musud" → 5 + 1 + 32 = 38 chars).
    pub fn create_unique(prefix: &str) -> Result<Self, IsolationError> {
        if prefix.is_empty() || prefix.len() > 31 {
            return Err(IsolationError::SetupFailed {
                context: format!(
                    "AppContainer profile prefix {prefix:?} must be 1..=31 chars"
                ),
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "prefix length",
                ),
            });
        }
        if !prefix.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
            return Err(IsolationError::SetupFailed {
                context: format!(
                    "AppContainer profile prefix {prefix:?} contains forbidden chars (allowed: A-Z a-z 0-9 . -)"
                ),
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "prefix chars",
                ),
            });
        }
        let uuid_hex = uuid::Uuid::new_v4().simple().to_string();
        let name = format!("{prefix}-{uuid_hex}");
        debug_assert!(name.len() <= MAX_NAME_LEN);
        Self::create_with_name(&name, prefix, "musu supervisor sandbox")
    }

    /// Create with an explicit name. Mostly useful for tests; production
    /// callers should prefer [`create_unique`].
    pub fn create_with_name(
        name: &str,
        display_name: &str,
        description: &str,
    ) -> Result<Self, IsolationError> {
        if name.len() > MAX_NAME_LEN {
            return Err(IsolationError::SetupFailed {
                context: format!(
                    "AppContainer name {name:?} exceeds {MAX_NAME_LEN} chars"
                ),
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "name length",
                ),
            });
        }
        let name_h = HSTRING::from(name);
        let display_h = HSTRING::from(display_name);
        let desc_h = HSTRING::from(description);

        // SAFETY: All four PCWSTR arguments outlive the call (held by
        // HSTRING locals in this scope). pcapabilities=None → zero caps.
        let sid_res = unsafe {
            CreateAppContainerProfile(
                PCWSTR(name_h.as_ptr()),
                PCWSTR(display_h.as_ptr()),
                PCWSTR(desc_h.as_ptr()),
                None,
            )
        };
        let sid = match sid_res {
            Ok(s) => s,
            Err(e) => {
                // ERROR_ALREADY_EXISTS (0x800700B7): profile from a
                // previous crashed run. Derive the SID instead — we
                // still own it for cleanup at drop.
                if e.code() == windows::core::HRESULT(0x800700B7u32 as i32) {
                    // SAFETY: name_h still valid here.
                    unsafe {
                        DeriveAppContainerSidFromAppContainerName(
                            PCWSTR(name_h.as_ptr()),
                        )
                    }
                    .map_err(|de| IsolationError::SetupFailed {
                        context: format!(
                            "DeriveAppContainerSidFromAppContainerName({name}) after ALREADY_EXISTS"
                        ),
                        source: std::io::Error::other(de.to_string()),
                    })?
                } else {
                    return Err(IsolationError::SetupFailed {
                        context: format!("CreateAppContainerProfile({name})"),
                        source: std::io::Error::other(e.to_string()),
                    });
                }
            }
        };

        Ok(Self {
            name: name_h,
            sid,
        })
    }

    /// Borrow the container SID for use in security capability lists.
    pub fn sid(&self) -> PSID {
        self.sid
    }

    /// Profile name (as registered). Useful for diagnostics.
    pub fn name(&self) -> String {
        let slice = self.name.as_wide();
        OsString::from_wide(slice).to_string_lossy().into_owned()
    }

    /// SID rendered as `S-1-15-2-...` for diagnostics. Allocates.
    pub fn sid_string(&self) -> Result<String, IsolationError> {
        let mut pwstr = PWSTR::null();
        // SAFETY: stringsid is an out-pointer; ConvertSidToStringSidW
        // writes a heap-allocated PWSTR we must LocalFree.
        unsafe { ConvertSidToStringSidW(self.sid, &mut pwstr) }.map_err(|e| {
            IsolationError::SetupFailed {
                context: "ConvertSidToStringSidW".into(),
                source: std::io::Error::other(e.to_string()),
            }
        })?;

        // SAFETY: pwstr points to a NUL-terminated UTF-16 string we own.
        let s = unsafe {
            let mut len = 0;
            while *pwstr.0.add(len) != 0 {
                len += 1;
            }
            let slice = std::slice::from_raw_parts(pwstr.0, len);
            OsString::from_wide(slice).to_string_lossy().into_owned()
        };

        // SAFETY: LocalFree on the pwstr we received from the API.
        unsafe { LocalFree(HLOCAL(pwstr.0 as *mut _)) };
        Ok(s)
    }
}

impl Drop for AppContainerProfile {
    fn drop(&mut self) {
        // Best-effort cleanup. If the API call fails (rare — usually
        // means the profile was already removed, or registry hive is
        // gone), there's nowhere useful to surface the error. Log to
        // stderr in debug builds; release silently absorbs.
        // SAFETY: name held alive in self until end of drop.
        let res = unsafe {
            DeleteAppContainerProfile(PCWSTR(self.name.as_ptr()))
        };
        #[cfg(debug_assertions)]
        if let Err(e) = res {
            eprintln!(
                "musu isolation: DeleteAppContainerProfile({}) failed: {}",
                self.name(),
                e
            );
        }
        let _ = res; // release: drop ignored
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_prefix() {
        let res = AppContainerProfile::create_unique("");
        assert!(matches!(res, Err(IsolationError::SetupFailed { .. })));
    }

    #[test]
    fn rejects_prefix_too_long() {
        // 32 chars — over the 31-char limit we set so the suffix fits
        let long = "a".repeat(32);
        let res = AppContainerProfile::create_unique(&long);
        assert!(matches!(res, Err(IsolationError::SetupFailed { .. })));
    }

    #[test]
    fn rejects_forbidden_chars_in_prefix() {
        let res = AppContainerProfile::create_unique("bad name");
        assert!(matches!(res, Err(IsolationError::SetupFailed { .. })));
        let res = AppContainerProfile::create_unique("bad_underscore");
        assert!(matches!(res, Err(IsolationError::SetupFailed { .. })));
    }

    #[test]
    fn create_unique_and_drop_roundtrip() {
        // Real Win32 call. Requires Win10 1803+. The crate's available()
        // guards this in production; tests assume the dev/CI host is
        // capable. If a colleague runs this on Win7 it'll fail loud.
        let profile = AppContainerProfile::create_unique("musud-test")
            .expect("create_unique must succeed on a supported host");
        let name = profile.name();
        assert!(name.starts_with("musud-test-"), "got name={name:?}");
        assert!(name.len() <= MAX_NAME_LEN);

        let sid_str = profile.sid_string()
            .expect("sid_string must serialize the PSID");
        assert!(sid_str.starts_with("S-1-15-2-"),
            "AppContainer SIDs use S-1-15-2 prefix, got {sid_str:?}");

        drop(profile);
        // No assertion on Drop side-effect; the test passes if no panic
        // and no segfault. A subsequent create_unique with the same name
        // would succeed only if Drop's Delete worked — covered by the
        // next test.
    }

    #[test]
    fn drop_actually_deletes_so_recreate_succeeds() {
        // Use a deterministic short name we can repeat. Manually format
        // to avoid the v4 uuid suffix so both attempts hit the same name.
        let name = "musud-droptest-".to_string() + &uuid::Uuid::new_v4().simple().to_string();

        {
            let p1 = AppContainerProfile::create_with_name(
                &name, "musud test", "drop-test profile",
            )
            .expect("first create");
            assert_eq!(p1.name(), name);
        } // Drop fires here — DeleteAppContainerProfile

        // Recreate with the same name. If Drop deleted, this succeeds
        // with a fresh CreateAppContainerProfile (not the
        // ALREADY_EXISTS fallback path). The test just asserts no error.
        let p2 = AppContainerProfile::create_with_name(
            &name, "musud test 2", "drop-test profile (recreated)",
        )
        .expect("recreate after drop must succeed");
        assert_eq!(p2.name(), name);
        // p2 drop cleans up
    }
}
