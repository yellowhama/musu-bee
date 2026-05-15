//! CreateProcessW pipeline + SandboxedProcess RAII handle.
//!
//! `spawn_sandboxed(cmd, profile)` is the integration point that wires
//! together the other modules:
//!
//!   1. AppContainerProfile::create_unique(...)            (profile.rs)
//!   2. AclGrant::new(profile.sid()) + grant each path      (acl.rs)
//!   3. JobObject::from_profile(profile)                    (job_object.rs)
//!   4. StartupInfoEx::with_app_container(profile.sid())    (attr_list.rs)
//!   5. CreateProcessW(CREATE_SUSPENDED|EXTENDED_STARTUPINFO_PRESENT)
//!   6. AssignProcessToJobObject(job, hProcess)
//!   7. ResumeThread(hThread)
//!
//! The returned `SandboxedProcess` owns all of the above; dropping it
//! kills the agent (KILL_ON_JOB_CLOSE) and cleans up the profile + ACLs.
//!
//! ## Why not return `std::process::Child`?
//!
//! `Child::from_raw_handle` is unstable. Building a real `Child` from a
//! Win32 HANDLE without nightly requires either re-implementing it or
//! going through `std::process::Command::spawn`, neither of which can
//! attach a `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` attribute
//! list. We expose `SandboxedProcess` instead — it offers the same
//! surface (`wait`, `try_wait`, `kill`, `id`) but on top of our raw
//! HANDLE + the owned sandbox resources.
//!
//! The `Isolation::spawn` trait method on `WindowsIsolation` still
//! returns `Unsupported` because the trait signature is fixed to
//! `Child`. Supervisor code calls `WindowsIsolation::spawn_sandboxed`
//! directly when it needs the real sandbox.

#![cfg(target_os = "windows")]

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::process::Command;

use musu_supervisor_isolation::{IsolationError, IsolationProfile};
use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{
    CloseHandle, GetLastError, HANDLE, STILL_ACTIVE, WAIT_FAILED,
    WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows::Win32::System::JobObjects::AssignProcessToJobObject;
use windows::Win32::System::Threading::{
    CreateProcessW, GetExitCodeProcess, ResumeThread, TerminateProcess,
    WaitForSingleObject, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT,
    EXTENDED_STARTUPINFO_PRESENT, INFINITE, PROCESS_CREATION_FLAGS,
    PROCESS_INFORMATION, STARTUPINFOW,
};

use crate::acl::{AccessMode, AclGrant};
use crate::attr_list::StartupInfoEx;
use crate::job_object::JobObject;
use crate::profile::AppContainerProfile;

/// One sandboxed child process owned for its whole lifetime.
///
/// Dropping this struct:
///   1. Closes hThread (Drop on `thread_handle` field below).
///   2. Closes hProcess (Drop on `process_handle`).
///   3. JobObject drop → CloseHandle → KILL_ON_JOB_CLOSE fires → agent
///      process killed if still running.
///   4. AclGrant drop → revoke ACEs from granted paths.
///   5. AppContainerProfile drop → DeleteAppContainerProfile.
///
/// Field order matters: Rust drops in declaration order, so we put the
/// process/thread handles first (kills the child), then the job
/// (redundant kill safety net), then the ACLs, then the profile last
/// (the profile SID must outlive the ACL revoke calls).
pub struct SandboxedProcess {
    /// Closed on drop. Closing while the process is alive does NOT kill
    /// it (handles are reference counts); KILL_ON_JOB_CLOSE does the
    /// killing via the JobObject drop below.
    process_handle: OwnedHandle,
    /// Kept solely to CloseHandle on drop. After ResumeThread we never
    /// touch it again; the agent runs to completion or is killed via the
    /// process handle or job object.
    #[allow(dead_code)]
    thread_handle: OwnedHandle,
    process_id: u32,
    _job: JobObject,
    _acls: AclGrant,
    _profile: AppContainerProfile,
}

/// Tiny RAII wrapper so we close Win32 HANDLEs cleanly.
struct OwnedHandle(HANDLE);

impl OwnedHandle {
    fn new(h: HANDLE) -> Self {
        Self(h)
    }
    fn raw(&self) -> HANDLE {
        self.0
    }
}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            // SAFETY: we own this handle.
            unsafe { let _ = CloseHandle(self.0); }
        }
    }
}

impl SandboxedProcess {
    /// Process ID. Stable for the lifetime of the child.
    pub fn id(&self) -> u32 {
        self.process_id
    }

    /// Block until the child exits, return its exit code.
    pub fn wait(&self) -> Result<u32, IsolationError> {
        // SAFETY: process_handle is valid for self's lifetime.
        let wait_result = unsafe {
            WaitForSingleObject(self.process_handle.raw(), INFINITE)
        };
        if wait_result == WAIT_FAILED {
            let err = unsafe { GetLastError() };
            return Err(IsolationError::SetupFailed {
                context: format!("WaitForSingleObject returned WAIT_FAILED (LastError={:?})", err),
                source: std::io::Error::other("WAIT_FAILED"),
            });
        }
        if wait_result != WAIT_OBJECT_0 {
            return Err(IsolationError::SetupFailed {
                context: format!("WaitForSingleObject unexpected return: {:?}", wait_result),
                source: std::io::Error::other("non-signaled"),
            });
        }
        self.exit_code()
    }

    /// Non-blocking check. Returns Some(code) if exited, None if running.
    pub fn try_wait(&self) -> Result<Option<u32>, IsolationError> {
        // SAFETY: handle owned.
        let wait_result = unsafe {
            WaitForSingleObject(self.process_handle.raw(), 0)
        };
        if wait_result == WAIT_TIMEOUT {
            return Ok(None);
        }
        if wait_result != WAIT_OBJECT_0 {
            return Err(IsolationError::SetupFailed {
                context: format!("try_wait WaitForSingleObject return: {:?}", wait_result),
                source: std::io::Error::other("non-signaled"),
            });
        }
        Ok(Some(self.exit_code()?))
    }

    /// Force-terminate. Exit code is set to 1.
    pub fn kill(&self) -> Result<(), IsolationError> {
        // SAFETY: handle owned.
        unsafe { TerminateProcess(self.process_handle.raw(), 1) }
            .map_err(|e| IsolationError::SetupFailed {
                context: "TerminateProcess".into(),
                source: std::io::Error::other(e.to_string()),
            })
    }

    fn exit_code(&self) -> Result<u32, IsolationError> {
        let mut code: u32 = 0;
        // SAFETY: handle owned, output u32 owned.
        unsafe {
            GetExitCodeProcess(self.process_handle.raw(), &mut code)
        }
        .map_err(|e| IsolationError::SetupFailed {
            context: "GetExitCodeProcess".into(),
            source: std::io::Error::other(e.to_string()),
        })?;
        if code == STILL_ACTIVE.0 as u32 {
            // Race: object signaled but exit code says STILL_ACTIVE.
            // Treat as exit 0 — fully signaled processes can briefly
            // expose STILL_ACTIVE in this window per MS docs.
            return Ok(0);
        }
        Ok(code)
    }
}

/// Spawn `cmd` inside the AppContainer + Job Object sandbox configured
/// by `profile`. Returns once the child is suspended-then-resumed inside
/// the job (it may already be running when this returns).
pub fn spawn_sandboxed(
    cmd: &Command,
    profile: &IsolationProfile,
) -> Result<SandboxedProcess, IsolationError> {
    // 1. Per-spawn AppContainer profile (unique name → ALREADY_EXISTS-safe).
    let app_profile = AppContainerProfile::create_unique("musud")?;

    // 2. Grant ACLs.
    let mut acls = AclGrant::new(app_profile.sid());
    for p in &profile.allow_read {
        acls.grant(p, AccessMode::Read)?;
    }
    for p in &profile.allow_write {
        acls.grant(p, AccessMode::ReadWrite)?;
    }

    // 3. Job Object with resource caps.
    let job = JobObject::from_profile(profile)?;

    // 4. Attribute list with SECURITY_CAPABILITIES (zero caps).
    let startup_ex = StartupInfoEx::with_app_container(app_profile.sid())?;

    // 5. Build lpCommandLine and lpEnvironment.
    let mut cmd_line_utf16 = build_command_line(cmd);
    cmd_line_utf16.push(0); // NUL-terminate
    let env_block = build_env_block(cmd, &profile.strip_env);
    let cwd_h: Option<HSTRING> = cmd.get_current_dir().map(HSTRING::from);

    // 6. CreateProcessW. CREATE_SUSPENDED so we can attach to job
    //    before the first instruction runs.
    let mut proc_info = PROCESS_INFORMATION::default();
    let creation_flags = PROCESS_CREATION_FLAGS(
        CREATE_SUSPENDED.0
            | EXTENDED_STARTUPINFO_PRESENT.0
            | CREATE_UNICODE_ENVIRONMENT.0,
    );

    // SAFETY: All pointers and HSTRINGs are held alive across the call:
    //   - cmd_line_utf16 owned local Vec<u16> (PWSTR points into it; API
    //     may write into the buffer per docs — we made it mutable).
    //   - env_block: optional Vec<u16> owned local.
    //   - startup_ex held by local, lpAttributeList valid.
    //   - cwd_h owned local Option<HSTRING>.
    let env_ptr: Option<*const core::ffi::c_void> = env_block
        .as_ref()
        .map(|v| v.as_ptr() as *const core::ffi::c_void);
    let cwd_pcwstr = cwd_h
        .as_ref()
        .map(|h| PCWSTR(h.as_ptr()))
        .unwrap_or(PCWSTR::null());

    let startup_ptr: *const STARTUPINFOW =
        &startup_ex.as_startup_info_ex().StartupInfo as *const STARTUPINFOW;

    let create_res = unsafe {
        CreateProcessW(
            PCWSTR::null(),
            PWSTR(cmd_line_utf16.as_mut_ptr()),
            None,
            None,
            false,
            creation_flags,
            env_ptr,
            cwd_pcwstr,
            startup_ptr,
            &mut proc_info,
        )
    };
    if let Err(e) = create_res {
        return Err(IsolationError::SetupFailed {
            context: "CreateProcessW".into(),
            source: std::io::Error::other(e.to_string()),
        });
    }

    // From here on, on any error we MUST CloseHandle the process & thread
    // and kill the suspended child. Wrap into OwnedHandle immediately so
    // a `?` later will trigger cleanup.
    let proc_handle = OwnedHandle::new(proc_info.hProcess);
    let thread_handle = OwnedHandle::new(proc_info.hThread);

    // 7. Attach the suspended process to our Job Object.
    let assign_res = unsafe {
        AssignProcessToJobObject(job.handle(), proc_handle.raw())
    };
    if let Err(e) = assign_res {
        // Kill the suspended child — it never ran a single instruction.
        unsafe { let _ = TerminateProcess(proc_handle.raw(), 1); }
        return Err(IsolationError::SetupFailed {
            context: "AssignProcessToJobObject".into(),
            source: std::io::Error::other(e.to_string()),
        });
    }

    // 8. ResumeThread → the agent starts executing inside the sandbox.
    // SAFETY: thread_handle owned.
    let prev_suspend = unsafe { ResumeThread(thread_handle.raw()) };
    if prev_suspend == u32::MAX {
        let last = unsafe { GetLastError() };
        unsafe { let _ = TerminateProcess(proc_handle.raw(), 1); }
        return Err(IsolationError::SetupFailed {
            context: format!("ResumeThread (LastError={:?})", last),
            source: std::io::Error::other("ResumeThread failed"),
        });
    }

    Ok(SandboxedProcess {
        process_handle: proc_handle,
        thread_handle,
        process_id: proc_info.dwProcessId,
        _job: job,
        _acls: acls,
        _profile: app_profile,
    })
}

/// Build a CreateProcessW-style command line from a `Command`.
/// Quoting follows the standard MSVCRT parse rules.
fn build_command_line(cmd: &Command) -> Vec<u16> {
    let mut out: Vec<u16> = Vec::new();
    append_arg(&mut out, cmd.get_program(), true);
    for arg in cmd.get_args() {
        out.push(b' ' as u16);
        append_arg(&mut out, arg, false);
    }
    out
}

fn append_arg(out: &mut Vec<u16>, arg: &OsStr, is_program: bool) {
    let needs_quotes = is_program
        || arg.is_empty()
        || arg.encode_wide().any(|c| c == b' ' as u16 || c == b'\t' as u16 || c == b'"' as u16);

    if !needs_quotes {
        out.extend(arg.encode_wide());
        return;
    }

    out.push(b'"' as u16);
    let mut backslashes = 0usize;
    for c in arg.encode_wide() {
        if c == b'\\' as u16 {
            backslashes += 1;
            out.push(c);
        } else if c == b'"' as u16 {
            // Double the backslashes preceding the quote, then escape it.
            for _ in 0..backslashes {
                out.push(b'\\' as u16);
            }
            out.push(b'\\' as u16);
            out.push(c);
            backslashes = 0;
        } else {
            out.push(c);
            backslashes = 0;
        }
    }
    // Double trailing backslashes so the closing quote isn't escaped.
    for _ in 0..backslashes {
        out.push(b'\\' as u16);
    }
    out.push(b'"' as u16);
}

/// Build a UTF-16 Unicode environment block.
/// Returns None when the caller didn't customize env AND strip_env is
/// empty (CreateProcessW with lpEnvironment=NULL inherits parent's env).
fn build_env_block(cmd: &Command, strip_env: &[String]) -> Option<Vec<u16>> {
    use std::collections::BTreeMap;

    // Start from the parent's env unless `cmd.env_clear()` was set.
    // std::process::Command::get_envs() returns the *delta* against the
    // parent; combining with std::env::vars_os() for the base.
    let mut env: BTreeMap<std::ffi::OsString, std::ffi::OsString> =
        std::env::vars_os().collect();

    // env_clear semantics: there's no public API to check, so we treat
    // any (key, None) as "remove this key" and (key, Some(v)) as "set".
    let mut explicit: Vec<(std::ffi::OsString, Option<std::ffi::OsString>)> =
        Vec::new();
    for (k, v) in cmd.get_envs() {
        explicit.push((k.to_os_string(), v.map(|s| s.to_os_string())));
    }

    let no_inherit_check = !explicit.is_empty() || !strip_env.is_empty();
    if !no_inherit_check {
        return None; // inherit parent fully
    }

    for (k, v) in explicit {
        match v {
            Some(val) => {
                env.insert(k, val);
            }
            None => {
                env.remove(&k);
            }
        }
    }
    for s in strip_env {
        env.remove(std::ffi::OsStr::new(s));
    }

    let mut block: Vec<u16> = Vec::new();
    for (k, v) in env {
        block.extend(k.encode_wide());
        block.push(b'=' as u16);
        block.extend(v.encode_wide());
        block.push(0);
    }
    block.push(0); // double-NUL terminator
    Some(block)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn windir_cmd_exe() -> std::path::PathBuf {
        let windir = std::env::var_os("WINDIR")
            .or_else(|| std::env::var_os("SystemRoot"))
            .unwrap_or_else(|| "C:\\Windows".into());
        Path::new(&windir).join("System32").join("cmd.exe")
    }

    #[test]
    fn build_cmd_line_quotes_program_path() {
        let cmd = Command::new("C:\\Windows\\System32\\cmd.exe");
        let line = build_command_line(&cmd);
        let s = String::from_utf16_lossy(&line);
        assert!(s.starts_with("\""), "program path must be quoted: {s:?}");
        assert!(s.contains("cmd.exe"));
    }

    #[test]
    fn build_cmd_line_handles_arg_with_spaces() {
        let mut cmd = Command::new("a.exe");
        cmd.arg("hello world");
        let s = String::from_utf16_lossy(&build_command_line(&cmd));
        assert!(s.contains("\"hello world\""), "got {s:?}");
    }

    #[test]
    fn build_cmd_line_escapes_internal_quote() {
        let mut cmd = Command::new("a.exe");
        cmd.arg("say \"hi\"");
        let s = String::from_utf16_lossy(&build_command_line(&cmd));
        // The literal " becomes \"
        assert!(s.contains("\\\""), "got {s:?}");
    }

    #[test]
    fn smoke_test_cmd_echo_in_appcontainer() {
        // The acceptance test for the entire sandbox pipeline.
        let mut cmd = Command::new(windir_cmd_exe());
        cmd.args(["/c", "echo musu-sandbox-ok"]);

        let profile = IsolationProfile::default();
        let child = spawn_sandboxed(&cmd, &profile)
            .expect("spawn_sandboxed must succeed for cmd.exe /c echo");

        assert_ne!(child.id(), 0, "valid PID expected");

        let exit = child.wait().expect("wait must succeed");
        assert_eq!(exit, 0, "cmd.exe /c echo expected to exit 0, got {exit}");
        // child dropped here → JobObject drop → ACL revoke → profile delete
    }

    #[test]
    fn smoke_test_kill_interrupts_long_running() {
        // cmd.exe /c "timeout /t 60" — long-running, we kill it.
        let mut cmd = Command::new(windir_cmd_exe());
        cmd.args(["/c", "timeout /t 60 /nobreak"]);

        let profile = IsolationProfile::default();
        let child = spawn_sandboxed(&cmd, &profile)
            .expect("spawn long-running");

        // It must still be running shortly after spawn.
        let immediate = child.try_wait().expect("try_wait");
        assert!(
            immediate.is_none(),
            "expected child to still be running, got exit={immediate:?}"
        );

        child.kill().expect("kill");

        let exit = child.wait().expect("wait after kill");
        // TerminateProcess sets exit code to 1.
        assert_eq!(exit, 1, "killed process expected exit code 1, got {exit}");
    }
}
