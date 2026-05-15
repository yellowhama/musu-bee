//! STARTUPINFOEXW + proc-thread attribute list builder.
//!
//! `STARTUPINFOEXW` extends `STARTUPINFOW` with a `lpAttributeList` that
//! `CreateProcessW` consults when the `EXTENDED_STARTUPINFO_PRESENT`
//! flag is set in `dwCreationFlags`. For AppContainer process creation,
//! the attribute list MUST carry `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES`
//! pointing at our `SECURITY_CAPABILITIES` struct.
//!
//! Lifetime rules (this is why we use a struct, not a function):
//!   1. The `SECURITY_CAPABILITIES` value must remain valid until
//!      `CreateProcessW` returns.
//!   2. The attribute list buffer must remain valid for the same span.
//!   3. The AppContainer SID (referenced by `SECURITY_CAPABILITIES.AppContainerSid`)
//!      must outlive both — the caller's `AppContainerProfile` owns it.
//!
//! We bundle all three into [`StartupInfoEx`]. The caller hands it to
//! `CreateProcessW`, holds it alive through the call, then drops it.

#![cfg(target_os = "windows")]

use musu_supervisor_isolation::IsolationError;
use windows::Win32::Foundation::PSID;
use windows::Win32::Security::SECURITY_CAPABILITIES;
use windows::Win32::System::Threading::{
    DeleteProcThreadAttributeList, InitializeProcThreadAttributeList,
    UpdateProcThreadAttribute,
    LPPROC_THREAD_ATTRIBUTE_LIST,
    PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
    STARTUPINFOEXW, STARTUPINFOW,
};

/// Owns a `STARTUPINFOEXW` whose attribute list is populated with the
/// AppContainer security capability. Drop tears the attribute list down.
pub struct StartupInfoEx {
    /// Backing buffer for the proc-thread attribute list. The
    /// attribute list itself points into this buffer; we must keep
    /// the Vec alive for the duration of CreateProcessW.
    attr_buffer: Vec<u8>,

    /// Pinned SECURITY_CAPABILITIES; the attribute list stores a raw
    /// pointer to it. Boxing pins it to a stable address even if
    /// `self` is moved.
    sec_caps: Box<SECURITY_CAPABILITIES>,

    /// The actual STARTUPINFOEXW handed to CreateProcessW. Its
    /// lpAttributeList points into `attr_buffer`.
    startup: STARTUPINFOEXW,
}

impl StartupInfoEx {
    /// Build with zero capabilities for `app_container_sid`. Zero caps
    /// = strongest AppContainer (no internetClient, no documentsLibrary,
    /// etc — the agent can only touch what we explicitly ACL-granted).
    pub fn with_app_container(app_container_sid: PSID) -> Result<Self, IsolationError> {
        let sec_caps = Box::new(SECURITY_CAPABILITIES {
            AppContainerSid: app_container_sid,
            Capabilities: std::ptr::null_mut(),
            CapabilityCount: 0,
            Reserved: 0,
        });

        // Step 1: ask how big the attribute list buffer must be for
        // 1 attribute. The first call always returns E_NOT_SUFFICIENT_BUFFER
        // (87 / 122) but writes the size we need.
        let mut needed: usize = 0;
        // SAFETY: lpattributelist=null is the documented "sizing call".
        let _ = unsafe {
            InitializeProcThreadAttributeList(
                LPPROC_THREAD_ATTRIBUTE_LIST(std::ptr::null_mut()),
                1, // dwAttributeCount
                0,
                &mut needed,
            )
        };
        if needed == 0 {
            return Err(IsolationError::SetupFailed {
                context: "InitializeProcThreadAttributeList sizing returned zero".into(),
                source: std::io::Error::other("zero size"),
            });
        }

        // Step 2: allocate + actually initialize.
        let mut attr_buffer = vec![0u8; needed];
        let list_ptr = LPPROC_THREAD_ATTRIBUTE_LIST(
            attr_buffer.as_mut_ptr() as *mut _,
        );
        // SAFETY: attr_buffer is `needed` bytes long; passing `&mut needed`
        // tells Init how big it is. Output buffer is owned by us.
        unsafe {
            InitializeProcThreadAttributeList(list_ptr, 1, 0, &mut needed)
        }
        .map_err(|e| IsolationError::SetupFailed {
            context: "InitializeProcThreadAttributeList init".into(),
            source: std::io::Error::other(e.to_string()),
        })?;

        // Step 3: attach the SECURITY_CAPABILITIES to the list.
        // SAFETY: sec_caps is Box-pinned so its address is stable for
        // the lifetime of `self`. UpdateProcThreadAttribute records the
        // raw pointer; CreateProcessW reads it later.
        let res = unsafe {
            UpdateProcThreadAttribute(
                list_ptr,
                0,
                PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,
                Some(&*sec_caps as *const _ as *const _),
                std::mem::size_of::<SECURITY_CAPABILITIES>(),
                None,
                None,
            )
        };
        if let Err(e) = res {
            // SAFETY: list was initialized → must be torn down before
            // freeing the buffer.
            unsafe { DeleteProcThreadAttributeList(list_ptr) };
            return Err(IsolationError::SetupFailed {
                context: "UpdateProcThreadAttribute(SECURITY_CAPABILITIES)".into(),
                source: std::io::Error::other(e.to_string()),
            });
        }

        // Step 4: build the STARTUPINFOEXW shell.
        let mut startup = STARTUPINFOEXW::default();
        startup.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as u32;
        startup.lpAttributeList = list_ptr;

        // Force-suppress sec_caps unused warning — it's used via the
        // raw pointer recorded in UpdateProcThreadAttribute.
        let _ = &*sec_caps;

        Ok(Self {
            attr_buffer,
            sec_caps,
            startup,
        })
    }

    /// Mutable reference to the STARTUPINFOW header (configure stdin/out
    /// handles, dwFlags, etc).
    pub fn startup_info_mut(&mut self) -> &mut STARTUPINFOW {
        &mut self.startup.StartupInfo
    }

    /// Borrow the STARTUPINFOEXW for CreateProcessW. Caller must keep
    /// `self` alive across the call.
    pub fn as_startup_info_ex(&self) -> &STARTUPINFOEXW {
        &self.startup
    }
}

impl Drop for StartupInfoEx {
    fn drop(&mut self) {
        // Delete the attribute list before the buffer that backs it goes
        // away. After this the buffer's bytes are meaningless.
        // SAFETY: we initialized this list in `with_app_container`.
        unsafe { DeleteProcThreadAttributeList(self.startup.lpAttributeList) };
        let _ = &self.attr_buffer; // keep alive until here
        let _ = &self.sec_caps; // keep alive until here
    }
}

// SECURITY_CAPABILITIES contains raw pointers but they reference data
// we own (the AppContainerProfile lives longer than us). Sending across
// threads is fine — the supervisor sets this up on one thread, hands
// it to CreateProcessW on the same thread. We add `unsafe impl Send`
// only to allow storage in Send-bound structs.
unsafe impl Send for StartupInfoEx {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::AppContainerProfile;

    #[test]
    fn build_with_real_appcontainer_sid_succeeds() {
        let profile = AppContainerProfile::create_unique("musud-attr")
            .expect("create profile");

        let info = StartupInfoEx::with_app_container(profile.sid())
            .expect("build STARTUPINFOEXW");

        assert!(!info.startup.lpAttributeList.0.is_null());
        assert_eq!(
            info.startup.StartupInfo.cb,
            std::mem::size_of::<STARTUPINFOEXW>() as u32
        );
        assert_eq!(info.sec_caps.AppContainerSid.0, profile.sid().0);
        assert_eq!(info.sec_caps.CapabilityCount, 0);
        // Drop here — DeleteProcThreadAttributeList must run cleanly.
    }

    #[test]
    fn many_builds_and_drops_dont_leak() {
        // Light stress: 16 iterations. If Drop is broken we'd see
        // an obvious leak in test runner memory but at minimum we
        // assert no panic / no error.
        let profile = AppContainerProfile::create_unique("musud-attr-stress")
            .expect("create profile");
        for _ in 0..16 {
            let info = StartupInfoEx::with_app_container(profile.sid())
                .expect("build STARTUPINFOEXW");
            drop(info);
        }
    }

    #[test]
    fn startup_info_mut_lets_caller_configure_flags() {
        let profile = AppContainerProfile::create_unique("musud-attr-mut")
            .expect("create profile");
        let mut info = StartupInfoEx::with_app_container(profile.sid())
            .expect("build");
        info.startup_info_mut().dwFlags = windows::Win32::System::Threading::STARTF_USESTDHANDLES;
        assert_eq!(
            info.as_startup_info_ex().StartupInfo.dwFlags,
            windows::Win32::System::Threading::STARTF_USESTDHANDLES
        );
    }
}
