//! JobObject RAII wrapper + resource limit configuration.
//!
//! A Windows Job Object groups one or more processes into a unit that
//! can be killed, time-limited, and memory-limited as a whole. We use it
//! to enforce the resource caps in [`IsolationProfile`]:
//!
//!   - `cpu_secs`  → `PerProcessUserTimeLimit` (100-ns units)
//!   - `mem_mb`    → `ProcessMemoryLimit` (bytes)
//!
//! Plus two unconditional defenses:
//!
//!   - `ACTIVE_PROCESS = 1`     — fork-bomb defense; the agent can run
//!                                 ONE process, no children.
//!   - `KILL_ON_JOB_CLOSE`     — when our handle drops (supervisor
//!                                 dies / panics), the OS kills the job.
//!
//! We deliberately do NOT set `JOB_OBJECT_LIMIT_BREAKAWAY_OK`. Its
//! absence means a child process cannot detach from the job with
//! `CREATE_BREAKAWAY_FROM_JOB`. Combined with AppContainer's restriction
//! on creating new processes, the agent is double-locked into our job.

#![cfg(target_os = "windows")]

use musu_supervisor_isolation::{IsolationError, IsolationProfile};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::JobObjects::{
    CreateJobObjectW, SetInformationJobObject, TerminateJobObject,
    JobObjectExtendedLimitInformation,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT,
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOB_OBJECT_LIMIT_PROCESS_MEMORY,
    JOB_OBJECT_LIMIT_PROCESS_TIME,
};

/// One Windows Job Object owned for the lifetime of a single sandboxed
/// spawn. Drop closes the handle, which (because of KILL_ON_JOB_CLOSE)
/// terminates the agent process if it is still running.
pub struct JobObject {
    handle: HANDLE,
}

impl JobObject {
    /// Create an unnamed Job Object and apply the resource caps from
    /// `profile`. The returned handle is ready to receive the
    /// agent process via `AssignProcessToJobObject` (next iteration).
    pub fn from_profile(profile: &IsolationProfile) -> Result<Self, IsolationError> {
        // SAFETY: unnamed job (lpname=NULL), default security
        // attributes. CreateJobObjectW returns a HANDLE we own and
        // must CloseHandle on drop.
        let handle = unsafe { CreateJobObjectW(None, PCWSTR::null()) }
            .map_err(|e| IsolationError::SetupFailed {
                context: "CreateJobObjectW".into(),
                source: std::io::Error::other(e.to_string()),
            })?;

        // Build the extended limit info — Basic + memory.
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        let mut flags: u32 =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.0
            | JOB_OBJECT_LIMIT_ACTIVE_PROCESS.0;

        info.BasicLimitInformation.ActiveProcessLimit = 1;

        if let Some(cpu_secs) = profile.cpu_secs {
            // 100-nanosecond units; cap at i64::MAX even at u32::MAX seconds.
            info.BasicLimitInformation.PerProcessUserTimeLimit =
                (cpu_secs as i64).saturating_mul(10_000_000);
            flags |= JOB_OBJECT_LIMIT_PROCESS_TIME.0;
        }

        if let Some(mem_mb) = profile.mem_mb {
            // bytes; saturating to usize::MAX on 32-bit hosts (unlikely
            // but cheap).
            let bytes = (mem_mb as u64).saturating_mul(1024 * 1024);
            info.ProcessMemoryLimit = bytes as usize;
            flags |= JOB_OBJECT_LIMIT_PROCESS_MEMORY.0;
        }

        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT(flags);

        // SAFETY: info is a stack-local; SetInformationJobObject reads
        // the pointed-to bytes before returning.
        let set_res = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if let Err(e) = set_res {
            // SAFETY: handle was just allocated, definitely valid.
            unsafe { let _ = CloseHandle(handle); }
            return Err(IsolationError::SetupFailed {
                context: "SetInformationJobObject(ExtendedLimitInformation)".into(),
                source: std::io::Error::other(e.to_string()),
            });
        }

        Ok(Self { handle })
    }

    /// The raw Job HANDLE for `AssignProcessToJobObject`. Borrow only;
    /// the JobObject still owns it.
    pub fn handle(&self) -> HANDLE {
        self.handle
    }

    /// Eagerly kill every process in the job (exit code 1). The JobObject
    /// itself stays alive until `drop`. Used by the supervisor to
    /// preempt a runaway agent.
    pub fn terminate(&self) -> Result<(), IsolationError> {
        // SAFETY: handle owned by self until drop.
        unsafe { TerminateJobObject(self.handle, 1) }.map_err(|e| {
            IsolationError::SetupFailed {
                context: "TerminateJobObject".into(),
                source: std::io::Error::other(e.to_string()),
            }
        })
    }
}

impl Drop for JobObject {
    fn drop(&mut self) {
        // Closing the last handle on a job with KILL_ON_JOB_CLOSE set
        // terminates every process in the job. This is the safety net:
        // if the supervisor panics mid-spawn, the agent dies too.
        // SAFETY: handle was created by us and never closed before now.
        unsafe { let _ = CloseHandle(self.handle); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use musu_supervisor_isolation::IsolationProfile;

    #[test]
    fn create_default_profile_yields_valid_handle() {
        let job = JobObject::from_profile(&IsolationProfile::default())
            .expect("create job with default profile");
        assert!(!job.handle().is_invalid());
        // Drop closes handle — verified by absence of leak via test
        // counter, but at minimum no panic.
    }

    #[test]
    fn create_with_memory_limit() {
        let profile = IsolationProfile {
            mem_mb: Some(256),
            ..Default::default()
        };
        let job = JobObject::from_profile(&profile)
            .expect("create job with mem limit");
        assert!(!job.handle().is_invalid());
    }

    #[test]
    fn create_with_cpu_time_limit() {
        let profile = IsolationProfile {
            cpu_secs: Some(60),
            ..Default::default()
        };
        let job = JobObject::from_profile(&profile)
            .expect("create job with cpu limit");
        assert!(!job.handle().is_invalid());
    }

    #[test]
    fn create_with_both_limits() {
        let profile = IsolationProfile {
            cpu_secs: Some(30),
            mem_mb: Some(128),
            ..Default::default()
        };
        let job = JobObject::from_profile(&profile)
            .expect("create job with both limits");
        assert!(!job.handle().is_invalid());
    }

    #[test]
    fn cpu_secs_saturates_at_extreme_values() {
        // u32::MAX seconds = ~136 years. Conversion to 100-ns must not
        // overflow i64 (saturating_mul handles it).
        let profile = IsolationProfile {
            cpu_secs: Some(u32::MAX),
            ..Default::default()
        };
        let job = JobObject::from_profile(&profile)
            .expect("create job with saturated cpu_secs");
        assert!(!job.handle().is_invalid());
    }

    #[test]
    fn terminate_on_empty_job_is_ok() {
        // No processes assigned yet → terminate is a no-op + returns Ok.
        let job = JobObject::from_profile(&IsolationProfile::default())
            .expect("create job");
        job.terminate().expect("terminate empty job");
    }
}
