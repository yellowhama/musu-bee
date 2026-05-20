//! Windows subprocess hardening + graceful kill — wiki/495 §3 + R5-W1/R5-W2.
//!
//! Operator's primary machine is Windows 11 per wiki/495 §1; this code is
//! load-bearing for the cancel path.
//!
//! Strategy:
//!   1. Spawn with `CREATE_NEW_PROCESS_GROUP` so the child has its own
//!      console process group; `GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, pid)`
//!      then targets only the child, not the bridge.
//!   2. Assign the child to a fresh Job Object with
//!      `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` so all descendants die when
//!      the bridge exits (the Job Handle is owned by the bridge process —
//!      OS auto-closes on bridge exit).
//!   3. Graceful kill: send CTRL_BREAK_EVENT, wait up to 5s, then TerminateProcess.

#![cfg(target_os = "windows")]

use std::io;

use tokio::process::Command;

// windows-sys constants and FFI.
// CREATE_NEW_PROCESS_GROUP from Win32_System_Threading.
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// Configure `cmd` with `CREATE_NEW_PROCESS_GROUP` so we can send
/// CTRL_BREAK_EVENT to just the child group.
pub fn configure(cmd: &mut Command) {
    // `creation_flags` lives on the windows-only CommandExt trait; we
    // need the trait in scope for tokio's Command, which re-exports the
    // same method but only when the trait is imported.
    #[allow(unused_imports)]
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
}

/// Job Object holder. Created when the child spawns; dropping closes the
/// handle which (because `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` is set)
/// terminates the entire job tree.
pub struct JobObject {
    handle: windows_sys::Win32::Foundation::HANDLE,
}

// SAFETY: HANDLE is a Send/Sync raw pointer-equivalent on Windows; we own
// the handle exclusively via this wrapper and close it on Drop.
unsafe impl Send for JobObject {}
unsafe impl Sync for JobObject {}

impl JobObject {
    /// Create a new Job Object with KILL_ON_JOB_CLOSE and assign `pid`
    /// to it.
    pub fn assign(pid: u32) -> io::Result<Self> {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_ALL_ACCESS};

        // SAFETY: FFI to documented Win32 APIs.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(io::Error::last_os_error());
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let info_size = std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                info_size,
            ) == 0
            {
                let e = io::Error::last_os_error();
                CloseHandle(job);
                return Err(e);
            }

            let proc_h = OpenProcess(PROCESS_ALL_ACCESS, 0, pid);
            if proc_h.is_null() {
                let e = io::Error::last_os_error();
                CloseHandle(job);
                return Err(e);
            }
            let assigned = AssignProcessToJobObject(job, proc_h);
            CloseHandle(proc_h);
            if assigned == 0 {
                let e = io::Error::last_os_error();
                CloseHandle(job);
                return Err(e);
            }

            Ok(Self { handle: job })
        }
    }
}

impl Drop for JobObject {
    fn drop(&mut self) {
        // SAFETY: handle is owned by this struct exclusively.
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.handle);
        }
    }
}

/// Send CTRL_BREAK_EVENT to the child process group.
///
/// Returns Ok on successful signal delivery; the caller still has to wait
/// on the child and fall back to TerminateProcess on timeout.
pub fn send_ctrl_break(pid: u32) -> io::Result<()> {
    use windows_sys::Win32::System::Console::{GenerateConsoleCtrlEvent, CTRL_BREAK_EVENT};
    // SAFETY: documented Win32 API; pid is provided by caller.
    let r = unsafe { GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, pid) };
    if r == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}
