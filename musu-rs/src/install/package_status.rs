use anyhow::Result;
use serde::Serialize;

#[derive(Serialize)]
struct PackageStatusReport {
    distribution: String,
    has_package_identity: bool,
    resolved_musu_home: Option<String>,
    package_full_name: Option<String>,
    startup_task_id: Option<String>,
    startup_task_state: Option<String>,
    startup_task_state_value: Option<i32>,
    startup_task_error: Option<String>,
    startup_task_prime_attempted: bool,
    startup_task_prime_result: Option<String>,
    startup_task_prime_error: Option<String>,
}

pub async fn run() -> Result<()> {
    let distribution = super::distribution::DistributionMode::current();
    let mut report = PackageStatusReport {
        distribution: distribution.as_str().to_string(),
        has_package_identity: false,
        resolved_musu_home: super::resolve_musu_home_from_env()
            .ok()
            .map(|p| p.display().to_string()),
        package_full_name: None,
        startup_task_id: None,
        startup_task_state: None,
        startup_task_state_value: None,
        startup_task_error: None,
        startup_task_prime_attempted: false,
        startup_task_prime_result: None,
        startup_task_prime_error: None,
    };

    #[cfg(windows)]
    {
        if let Some(full_name) = current_package_full_name() {
            report.has_package_identity = true;
            report.package_full_name = Some(full_name);
            report.startup_task_id = Some("MusuBridgeStartup".to_string());

            match request_enable_if_applicable("MusuBridgeStartup") {
                Ok(prime) => {
                    report.startup_task_prime_attempted = prime.attempted;
                    report.startup_task_prime_result = Some(prime.describe());
                }
                Err(err) => {
                    report.startup_task_prime_error = Some(err.to_string());
                }
            }

            match query_startup_task("MusuBridgeStartup") {
                Ok((state_name, state_value)) => {
                    report.startup_task_state = Some(state_name);
                    report.startup_task_state_value = Some(state_value);
                }
                Err(err) => {
                    report.startup_task_error = Some(err.to_string());
                }
            }
        }
    }

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

pub fn best_effort_prime_packaged_startup_task() {
    #[cfg(windows)]
    {
        if !super::distribution::DistributionMode::current().is_store_msix() {
            return;
        }
        if current_package_full_name().is_none() {
            return;
        }
        let _ = request_enable_if_applicable("MusuBridgeStartup");
    }
}

#[cfg(windows)]
struct PrimeStartupTaskReport {
    attempted: bool,
    before: String,
    after: String,
}

#[cfg(windows)]
impl PrimeStartupTaskReport {
    fn describe(&self) -> String {
        if self.attempted {
            format!("{} -> {}", self.before, self.after)
        } else {
            self.before.clone()
        }
    }
}

#[cfg(windows)]
fn current_package_full_name() -> Option<String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    let mut len = 0u32;
    let probe = unsafe { GetCurrentPackageFullName(&mut len, null_mut()) };
    if probe != ERROR_INSUFFICIENT_BUFFER && probe != ERROR_SUCCESS {
        return None;
    }
    if len == 0 {
        return None;
    }

    let mut buf = vec![0u16; len as usize];
    let rc = unsafe { GetCurrentPackageFullName(&mut len, buf.as_mut_ptr()) };
    if rc != ERROR_SUCCESS {
        return None;
    }
    let usable = len.saturating_sub(1) as usize;
    Some(String::from_utf16_lossy(&buf[..usable]))
}

#[cfg(windows)]
fn query_startup_task(task_id: &str) -> Result<(String, i32)> {
    use windows::core::HSTRING;
    use windows::ApplicationModel::StartupTask;

    let task = StartupTask::GetAsync(&HSTRING::from(task_id))?.get()?;
    let state = task.State()?;
    Ok((startup_task_state_name(state).to_string(), state.0))
}

#[cfg(windows)]
fn request_enable_if_applicable(task_id: &str) -> Result<PrimeStartupTaskReport> {
    use windows::core::HSTRING;
    use windows::ApplicationModel::StartupTask;

    let task = StartupTask::GetAsync(&HSTRING::from(task_id))?.get()?;
    let state = task.State()?;
    let before = startup_task_state_name(state).to_string();
    if should_request_enable(state) {
        let after = task.RequestEnableAsync()?.get()?;
        return Ok(PrimeStartupTaskReport {
            attempted: true,
            before,
            after: startup_task_state_name(after).to_string(),
        });
    }
    Ok(PrimeStartupTaskReport {
        attempted: false,
        before: before.clone(),
        after: before,
    })
}

#[cfg(windows)]
fn should_request_enable(state: windows::ApplicationModel::StartupTaskState) -> bool {
    use windows::ApplicationModel::StartupTaskState;

    matches!(
        state,
        StartupTaskState::Enabled | StartupTaskState::Disabled
    )
}

#[cfg(windows)]
fn startup_task_state_name(state: windows::ApplicationModel::StartupTaskState) -> &'static str {
    use windows::ApplicationModel::StartupTaskState;

    match state {
        StartupTaskState::Disabled => "disabled",
        StartupTaskState::DisabledByUser => "disabled-by-user",
        StartupTaskState::Enabled => "enabled",
        StartupTaskState::DisabledByPolicy => "disabled-by-policy",
        StartupTaskState::EnabledByPolicy => "enabled-by-policy",
        _ => "unknown",
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::should_request_enable;
    use windows::ApplicationModel::StartupTaskState;

    #[test]
    fn priming_requests_enable_for_manifest_enabled_state() {
        assert!(should_request_enable(StartupTaskState::Enabled));
        assert!(should_request_enable(StartupTaskState::Disabled));
        assert!(!should_request_enable(StartupTaskState::DisabledByUser));
        assert!(!should_request_enable(StartupTaskState::DisabledByPolicy));
        assert!(!should_request_enable(StartupTaskState::EnabledByPolicy));
    }
}
