use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            start_runtime,
            list_fleet,
            submit_order,
            read_startup_marker
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            spawn_runtime_autostart();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(serde::Serialize)]
struct DesktopStatus {
    version: String,
    musu_home: String,
    bridge_status: String,
    bridge_url: Option<String>,
    bridge_detail: String,
    dashboard_status: String,
    dashboard_url: Option<String>,
    dashboard_detail: String,
    package_status: String,
    package_detail: String,
    auth_status: String,
    auth_detail: String,
    runtime_profile_status: String,
    runtime_profile_detail: String,
    process_ownership_status: String,
    process_ownership_detail: String,
    runtime_process_count: usize,
    desktop_process_count: usize,
    machine_wide_node_process_count: usize,
    owned_node_process_count: usize,
    machine_wide_webview2_process_count: usize,
    owned_webview2_process_count: usize,
    active_runtime_loop_candidate_count: usize,
    active_runtime_loop_candidate_keys: Vec<String>,
    warnings: Vec<String>,
    can_start_runtime: bool,
}

#[derive(serde::Serialize)]
struct CommandResult {
    ok: bool,
    message: String,
    output: String,
}

const DOCTOR_STATUS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

#[derive(Default)]
struct RuntimeStartGate {
    in_progress: AtomicBool,
}

struct RuntimeStartGuard<'a> {
    gate: &'a RuntimeStartGate,
}

impl RuntimeStartGate {
    fn try_acquire(&self) -> Option<RuntimeStartGuard<'_>> {
        self.in_progress
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| RuntimeStartGuard { gate: self })
    }

    fn is_in_progress(&self) -> bool {
        self.in_progress.load(Ordering::Acquire)
    }
}

impl Drop for RuntimeStartGuard<'_> {
    fn drop(&mut self) {
        self.gate.in_progress.store(false, Ordering::Release);
    }
}

static RUNTIME_START_GATE: std::sync::OnceLock<RuntimeStartGate> = std::sync::OnceLock::new();

fn runtime_start_gate() -> &'static RuntimeStartGate {
    RUNTIME_START_GATE.get_or_init(RuntimeStartGate::default)
}

fn can_start_runtime(
    bridge_ok: bool,
    bridge_pid_running: bool,
    runtime_start_in_progress: bool,
) -> bool {
    !bridge_ok && !bridge_pid_running && !runtime_start_in_progress
}

fn bridge_status_label(
    bridge_ok: bool,
    bridge_pid_running: bool,
    runtime_start_in_progress: bool,
) -> &'static str {
    if bridge_ok {
        "ok"
    } else if bridge_pid_running || runtime_start_in_progress {
        "starting"
    } else {
        "offline"
    }
}

#[tauri::command]
fn desktop_status() -> DesktopStatus {
    let version = env!("CARGO_PKG_VERSION").to_string();
    let home = musu_home();
    let bridge_registry = bridge_registry_status(&home);
    let runtime_start_in_progress = runtime_start_gate().is_in_progress();
    let doctor_summary = doctor_status_summary(&musu_command_path(), bridge_registry.pid);
    let dashboard_probe = probe_dashboard();
    let bridge_probe = bridge_registry
        .url
        .as_deref()
        .map(|url| probe_http(url, "/health"))
        .unwrap_or_else(|| ProbeResult {
            ok: false,
            detail: bridge_registry.detail,
        });
    let bridge_ok = bridge_probe.ok;
    let can_start_runtime = can_start_runtime(
        bridge_ok,
        bridge_registry.pid_running,
        runtime_start_in_progress,
    );

    DesktopStatus {
        version,
        musu_home: home.display().to_string(),
        bridge_status: bridge_status_label(
            bridge_ok,
            bridge_registry.pid_running,
            runtime_start_in_progress,
        )
        .to_string(),
        bridge_url: bridge_registry.url,
        bridge_detail: bridge_probe.detail,
        dashboard_status: if dashboard_probe.ok { "ok" } else { "offline" }.to_string(),
        dashboard_url: dashboard_probe.url,
        dashboard_detail: dashboard_probe.detail,
        package_status: doctor_summary.package_status,
        package_detail: doctor_summary.package_detail,
        auth_status: doctor_summary.auth_status,
        auth_detail: doctor_summary.auth_detail,
        runtime_profile_status: doctor_summary.runtime_profile_status,
        runtime_profile_detail: doctor_summary.runtime_profile_detail,
        process_ownership_status: doctor_summary.process_ownership_status,
        process_ownership_detail: doctor_summary.process_ownership_detail,
        runtime_process_count: doctor_summary.runtime_process_count,
        desktop_process_count: doctor_summary.desktop_process_count,
        machine_wide_node_process_count: doctor_summary.machine_wide_node_process_count,
        owned_node_process_count: doctor_summary.owned_node_process_count,
        machine_wide_webview2_process_count: doctor_summary.machine_wide_webview2_process_count,
        owned_webview2_process_count: doctor_summary.owned_webview2_process_count,
        active_runtime_loop_candidate_count: doctor_summary.active_runtime_loop_candidate_count,
        active_runtime_loop_candidate_keys: doctor_summary.active_runtime_loop_candidate_keys,
        warnings: doctor_summary.warnings,
        can_start_runtime,
    }
}

#[tauri::command]
fn start_runtime() -> Result<CommandResult, String> {
    let home = musu_home();
    if bridge_is_healthy(&home) {
        return Ok(CommandResult {
            ok: true,
            message: "runtime already running".to_string(),
            output: "local bridge already reports healthy /health".to_string(),
        });
    }

    let bridge_registry = bridge_registry_status(&home);
    if bridge_registry.pid_running {
        return Ok(CommandResult {
            ok: true,
            message: "runtime start already pending".to_string(),
            output: bridge_registry.detail,
        });
    }

    let Some(_guard) = runtime_start_gate().try_acquire() else {
        return Ok(CommandResult {
            ok: true,
            message: "runtime start already in progress".to_string(),
            output: "a runtime start (`musu-startup open`) is already in flight".to_string(),
        });
    };

    // C1 (2b double-bridge race fix): route the manual start through the SAME
    // single entry point as autostart — `musu-startup.exe open` — instead of a
    // separate `musu up --json`. Previously the two paths could each spawn a
    // bridge in the window after autostart dropped the gate but before the bridge
    // registered; with BRIDGE_PORT defaulting to 0 (OS-dynamic) the AddrInUse
    // backstop never tripped, so two bridges could come up. Funnelling both
    // through musu-startup means its own token/bridge idempotency guards
    // (spawn_desktop_login_if_needed + bridge registry checks) prevent a second
    // bridge. Fire-and-forget: musu-startup holds the bridge in its own
    // foreground, so we must NOT await it (a 900s device-flow poll would block
    // the UI). The UI polls bridge health to learn when it's up.
    let outcome = spawn_musu_startup_open();
    // Drop the gate right after the handoff launches: holding it across
    // musu-startup's whole lifetime would permanently block a later retry. The
    // race the gate used to (fail to) guard is now closed by single-entry-point
    // + musu-startup idempotency, not by gate duration.
    drop(_guard);

    match outcome {
        Ok(()) => Ok(CommandResult {
            ok: true,
            message: "runtime starting".to_string(),
            output: "handed off to `musu-startup open`; the bridge will come up shortly"
                .to_string(),
        }),
        Err(err) => Err(err),
    }
}

/// Spawn `musu-startup.exe open` detached (no wait). The single entry point both
/// the manual `start_runtime` command and `spawn_runtime_autostart` use, so there
/// is exactly one way a bridge gets started from the desktop app. musu-startup
/// owns bridge lifetime + device-flow; we only launch it.
fn spawn_musu_startup_open() -> Result<(), String> {
    let startup = musu_startup_path();
    std::process::Command::new(&startup)
        .arg("open")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_child| ())
        .map_err(|err| format!("failed to spawn {} open: {err}", startup.display()))
}

/// One machine in the fleet, as the cockpit renders it. A flattened, GUI-facing
/// projection of `cloud::RegistryNode` — only the fields the fleet list needs,
/// plus `is_this_pc` computed against the local node name so the cockpit can
/// badge the current machine.
#[derive(serde::Serialize)]
struct FleetNode {
    node_name: String,
    last_seen: String,
    public_url: String,
    is_this_pc: bool,
}

/// `list_fleet` — the cockpit's fleet list. Spawns `musu.exe nodes --json` (the
/// same packaged-runtime-spawn pattern as `desktop_status`/`start_runtime`; this
/// crate deliberately does NOT depend on musu-rs as a library) and parses its
/// envelope. Returns an empty list (not an error) when not logged in yet, so the
/// cockpit can show its empty/connecting state instead of an error.
#[tauri::command]
fn list_fleet() -> Result<Vec<FleetNode>, String> {
    let command = musu_command_path();
    let result = run_command_with_timeout(&command, &["nodes", "--json"], DOCTOR_STATUS_TIMEOUT)
        .map_err(|err| format!("failed to run {} nodes --json: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!(
            "{} nodes --json timed out",
            command.display()
        ));
    }

    let envelope: serde_json::Value = serde_json::from_str(result.stdout.trim())
        .map_err(|err| format!("failed to parse `musu nodes --json` output: {err}"))?;

    // not_logged_in is an empty fleet, not an error (cockpit shows connecting state).
    if envelope.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return Ok(Vec::new());
    }

    let nodes = envelope
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(nodes
        .into_iter()
        .map(|n| FleetNode {
            node_name: n
                .get("node_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            last_seen: n
                .get("last_seen")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            public_url: n
                .get("public_url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            is_this_pc: n.get("is_this_pc").and_then(|v| v.as_bool()).unwrap_or(false),
        })
        .collect())
}

/// `submit_order` — give the fleet work (P0: the cockpit's input path). Spawns
/// `musu route "<text>" [--target <node>] --channel desktop`, reusing the same
/// task-delegate path the CLI already drives (`run_route` → POST
/// /api/tasks/delegate). No `--wait`: we only need the order accepted, not its
/// result, so the call returns as soon as delegation is acknowledged (the UI does
/// not block on task completion). `target` empty = auto-route.
///
/// This closes the capability gap the migration opened: the web console input
/// path is paused (bridge-surface 410) and this is the replacement, so the
/// product can take orders again.
#[tauri::command]
fn submit_order(text: String, target: String) -> Result<CommandResult, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("order text is empty".to_string());
    }

    let command = musu_command_path();
    let mut args: Vec<&str> = vec!["route", text];
    let target = target.trim();
    if !target.is_empty() {
        args.push("--target");
        args.push(target);
    }
    args.push("--channel");
    args.push("desktop");

    let result = run_command_with_timeout(&command, &args, DOCTOR_STATUS_TIMEOUT)
        .map_err(|err| format!("failed to run {} route: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!("{} route timed out accepting the order", command.display()));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    if result.status_success {
        Ok(CommandResult {
            ok: true,
            message: if target.is_empty() {
                "order sent (auto-routed)".to_string()
            } else {
                format!("order sent to {target}")
            },
            output: combined,
        })
    } else {
        Err(format!("order rejected: {}", combined.trim()))
    }
}

/// `read_startup_marker` — the desktop launch marker (`startup-marker.json`) that
/// `musu-startup open` writes: status (logged-in / awaiting-device-approval /
/// device-approved / device-flow-failed), and for the pending case the approval
/// URL + user code. The cockpit reads this to render the "connecting" screen
/// (show the code + an Approve button) and to surface a silently-failed login —
/// which `desktop_status` alone cannot see. Returns the raw JSON value (or null
/// when no marker exists yet).
#[tauri::command]
fn read_startup_marker() -> Result<serde_json::Value, String> {
    let path = musu_home().join("startup-marker.json");
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|err| format!("failed to parse startup-marker.json: {err}")),
        Err(_) => Ok(serde_json::Value::Null), // no marker yet
    }
}

fn doctor_status_summary(
    command: &std::path::Path,
    bridge_pid: Option<u32>,
) -> DoctorStatusSummary {
    let process_summary = summarize_process_ownership(list_process_entries(), bridge_pid);
    let result =
        match run_command_with_timeout(command, &["doctor", "--json"], DOCTOR_STATUS_TIMEOUT) {
            Ok(result) => result,
            Err(err) => {
                return DoctorStatusSummary::unavailable_with_process(
                    format!("failed to run {} doctor --json: {err}", command.display()),
                    process_summary,
                );
            }
        };

    let combined = combine_command_output(&result.stdout, &result.stderr);
    if result.timed_out {
        return DoctorStatusSummary::unavailable_with_process(
            format!(
                "{} doctor --json timed out after {}s",
                command.display(),
                DOCTOR_STATUS_TIMEOUT.as_secs()
            ),
            process_summary,
        );
    }

    if !result.status_success {
        return DoctorStatusSummary::unavailable_with_process(
            format!(
                "{} doctor --json exited with {}. {}",
                command.display(),
                result.status_detail,
                combined
            ),
            process_summary,
        );
    }

    parse_doctor_status_summary(&combined, bridge_pid).unwrap_or_else(|detail| {
        DoctorStatusSummary::unavailable_with_process(detail, process_summary.clone())
    })
}

fn parse_doctor_status_summary(
    text: &str,
    bridge_pid: Option<u32>,
) -> Result<DoctorStatusSummary, String> {
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|err| format!("doctor JSON parse failed: {err}"))?;

    let distribution =
        json_string(&value, &["distribution"]).unwrap_or_else(|| "unknown".to_string());
    let binary_note = json_string(&value, &["binary", "note"])
        .or_else(|| json_string(&value, &["package", "note"]))
        .unwrap_or_else(|| "Packaged runtime diagnostics are unavailable.".to_string());
    let current_exe = json_string(&value, &["binary", "current_exe"]);
    let alias_shadowed_by =
        json_string(&value, &["binary", "alias_shadowed_by"]).filter(|s| !s.is_empty());
    let logged_in = json_bool(&value, &["account", "logged_in"]).unwrap_or(false);
    let bridge_token_present =
        json_bool(&value, &["account", "bridge_token_present"]).unwrap_or(false);
    let account_note = json_string(&value, &["account", "note"])
        .unwrap_or_else(|| "Account diagnostics are unavailable.".to_string());
    let background_note = json_string(&value, &["background", "note"])
        .unwrap_or_else(|| "Background loop diagnostics are unavailable.".to_string());
    let active_runtime_loop_candidate_count = json_usize(
        &value,
        &["background", "active_runtime_loop_candidate_count"],
    )
    .unwrap_or(0);
    let active_runtime_loop_candidate_keys = json_string_array(
        &value,
        &["background", "active_runtime_loop_candidate_keys"],
    );
    let active_runtime_loop_labels =
        active_runtime_loop_candidate_labels(&value, &active_runtime_loop_candidate_keys);

    let process_summary = summarize_process_ownership(list_process_entries(), bridge_pid);
    let mut warnings = process_summary.warnings.clone();
    let (package_status, package_detail) = if let Some(shadowed_by) = alias_shadowed_by {
        warnings.push(format!(
            "PATH `musu.exe` resolves to {shadowed_by}; use the packaged WindowsApps alias for release evidence."
        ));
        (
            "Shadowed".to_string(),
            match current_exe {
                Some(current_exe) => format!(
                    "PATH resolves `musu.exe` to {shadowed_by}. Packaged desktop still uses {current_exe}. {binary_note}"
                ),
                None => format!("PATH resolves `musu.exe` to {shadowed_by}. {binary_note}"),
            },
        )
    } else {
        let detail = match current_exe {
            Some(current_exe) => format!("{distribution} runtime at {current_exe}. {binary_note}"),
            None => binary_note,
        };
        ("Packaged".to_string(), detail)
    };

    let (auth_status, auth_detail) = if logged_in {
        ("Connected".to_string(), account_note)
    } else if bridge_token_present {
        (
            "Local Only".to_string(),
            format!("Cloud login is absent, but the local bridge token is present. {account_note}"),
        )
    } else {
        ("Offline".to_string(), account_note)
    };

    let (runtime_profile_status, runtime_profile_detail) = if active_runtime_loop_candidate_count
        > 0
    {
        let active_summary = if active_runtime_loop_labels.is_empty() {
            active_runtime_loop_candidate_keys.join(", ")
        } else {
            active_runtime_loop_labels.join(", ")
        };
        warnings.push(format!(
                "{active_runtime_loop_candidate_count} runtime loop candidates are active: {active_summary}."
            ));
        (
            "Active".to_string(),
            format!("Active runtime loop candidates: {active_summary}."),
        )
    } else {
        ("Quiet".to_string(), background_note)
    };

    Ok(DoctorStatusSummary {
        package_status,
        package_detail,
        auth_status,
        auth_detail,
        runtime_profile_status,
        runtime_profile_detail,
        process_ownership_status: process_summary.status,
        process_ownership_detail: process_summary.detail,
        runtime_process_count: process_summary.runtime_process_count,
        desktop_process_count: process_summary.desktop_process_count,
        machine_wide_node_process_count: process_summary.machine_wide_node_process_count,
        owned_node_process_count: process_summary.owned_node_process_count,
        machine_wide_webview2_process_count: process_summary.machine_wide_webview2_process_count,
        owned_webview2_process_count: process_summary.owned_webview2_process_count,
        active_runtime_loop_candidate_count,
        active_runtime_loop_candidate_keys,
        warnings,
    })
}

fn active_runtime_loop_candidate_labels(
    value: &serde_json::Value,
    active_keys: &[String],
) -> Vec<String> {
    let Some(candidates) = json_get(value, &["background", "runtime_loop_candidates"])
        .and_then(|value| value.as_array())
    else {
        return active_keys.to_vec();
    };

    let mut labels = Vec::new();
    for candidate in candidates {
        let active = candidate
            .get("active")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        if !active {
            continue;
        }
        if let Some(label) = candidate
            .get("label")
            .and_then(|value| value.as_str())
            .filter(|value| !value.is_empty())
        {
            labels.push(label.to_string());
            continue;
        }
        if let Some(key) = candidate
            .get("key")
            .and_then(|value| value.as_str())
            .filter(|value| !value.is_empty())
        {
            labels.push(key.to_string());
        }
    }
    labels
}

fn summarize_process_ownership(
    entries: Vec<ProcessEntry>,
    bridge_pid: Option<u32>,
) -> ProcessOwnershipSummary {
    use std::collections::{HashMap, HashSet};

    let parent_by_pid: HashMap<u32, u32> = entries
        .iter()
        .map(|entry| (entry.pid, entry.parent_pid))
        .collect();
    let root_ids: HashSet<u32> = entries
        .iter()
        .filter(|entry| {
            is_musu_runtime_process_name(&entry.exe_name)
                || is_musu_desktop_process_name(&entry.exe_name)
        })
        .map(|entry| entry.pid)
        .collect();

    let runtime_process_count = entries
        .iter()
        .filter(|entry| is_musu_runtime_process_name(&entry.exe_name))
        .count();
    let desktop_process_count = entries
        .iter()
        .filter(|entry| is_musu_desktop_process_name(&entry.exe_name))
        .count();
    let machine_wide_node_process_count = entries
        .iter()
        .filter(|entry| is_node_process_name(&entry.exe_name))
        .count();
    let machine_wide_webview2_process_count = entries
        .iter()
        .filter(|entry| is_webview2_process_name(&entry.exe_name))
        .count();
    let owned_node_process_count = entries
        .iter()
        .filter(|entry| {
            is_node_process_name(&entry.exe_name)
                && is_descendant_of_roots(entry.pid, &root_ids, &parent_by_pid)
        })
        .count();
    let owned_webview2_process_count = entries
        .iter()
        .filter(|entry| {
            is_webview2_process_name(&entry.exe_name)
                && is_descendant_of_roots(entry.pid, &root_ids, &parent_by_pid)
        })
        .count();

    let mut warnings = Vec::new();
    if runtime_process_count > 1 {
        warnings.push(format!(
            "Detected {runtime_process_count} MUSU runtime processes; expected at most 1 packaged runtime root."
        ));
    }
    if desktop_process_count > 1 {
        warnings.push(format!(
            "Detected {desktop_process_count} MUSU desktop shell processes; expected at most 1 window instance."
        ));
    }
    if owned_node_process_count > 0 {
        warnings.push(format!(
            "Detected {owned_node_process_count} node.exe helper process(es) owned by the MUSU process tree."
        ));
    }
    if owned_webview2_process_count > 8 {
        warnings.push(format!(
            "Detected {owned_webview2_process_count} WebView2 helper process(es) owned by MUSU; expected at most 8."
        ));
    }
    if bridge_pid.is_some() && runtime_process_count == 0 {
        warnings.push(
            "Bridge registry advertises a runtime PID, but no live MUSU runtime process was found."
                .to_string(),
        );
    }

    let status = if warnings.is_empty() {
        "Stable"
    } else {
        "Review"
    };
    let detail = format!(
        "runtime={}, desktop={}, node owned/machine-wide={}/{}, webview2 owned/machine-wide={}/{}",
        runtime_process_count,
        desktop_process_count,
        owned_node_process_count,
        machine_wide_node_process_count,
        owned_webview2_process_count,
        machine_wide_webview2_process_count
    );

    ProcessOwnershipSummary {
        status: status.to_string(),
        detail,
        runtime_process_count,
        desktop_process_count,
        machine_wide_node_process_count,
        owned_node_process_count,
        machine_wide_webview2_process_count,
        owned_webview2_process_count,
        warnings,
    }
}

fn is_descendant_of_roots(
    pid: u32,
    root_ids: &std::collections::HashSet<u32>,
    parent_by_pid: &std::collections::HashMap<u32, u32>,
) -> bool {
    let mut current = pid;
    let mut seen = std::collections::HashSet::new();
    while let Some(parent_pid) = parent_by_pid.get(&current).copied() {
        if !seen.insert(current) || parent_pid == 0 {
            return false;
        }
        if root_ids.contains(&parent_pid) {
            return true;
        }
        current = parent_pid;
    }
    false
}

fn is_musu_runtime_process_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "musu.exe" | "musu" | "musud.exe" | "musud"
    )
}

fn is_musu_desktop_process_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "musu-desktop.exe" | "musu-desktop"
    )
}

fn is_node_process_name(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(), "node.exe" | "node")
}

fn is_webview2_process_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "msedgewebview2.exe" | "msedgewebview2"
    )
}

#[cfg(windows)]
fn list_process_entries() -> Vec<ProcessEntry> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let mut entries = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return entries;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|ch| *ch == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                entries.push(ProcessEntry {
                    pid: entry.th32ProcessID,
                    parent_pid: entry.th32ParentProcessID,
                    exe_name,
                });

                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }
    entries
}

#[cfg(not(windows))]
fn list_process_entries() -> Vec<ProcessEntry> {
    Vec::new()
}

fn combine_command_output(stdout: &str, stderr: &str) -> String {
    let stdout = stdout.trim();
    let stderr = stderr.trim();
    if stderr.is_empty() {
        stdout.to_string()
    } else if stdout.is_empty() {
        stderr.to_string()
    } else {
        format!("{stdout}\n{stderr}").trim().to_string()
    }
}

fn json_get<'a>(value: &'a serde_json::Value, path: &[&str]) -> Option<&'a serde_json::Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}

fn json_string(value: &serde_json::Value, path: &[&str]) -> Option<String> {
    json_get(value, path)
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

fn json_bool(value: &serde_json::Value, path: &[&str]) -> Option<bool> {
    json_get(value, path).and_then(|value| value.as_bool())
}

fn json_usize(value: &serde_json::Value, path: &[&str]) -> Option<usize> {
    json_get(value, path)
        .and_then(|value| value.as_u64())
        .and_then(|value| usize::try_from(value).ok())
}

fn json_string_array(value: &serde_json::Value, path: &[&str]) -> Vec<String> {
    json_get(value, path)
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

struct ProbeResult {
    ok: bool,
    detail: String,
}

struct DashboardProbe {
    ok: bool,
    url: Option<String>,
    detail: String,
}

struct BridgeRegistryStatus {
    url: Option<String>,
    detail: String,
    pid_running: bool,
    pid: Option<u32>,
}

struct DoctorStatusSummary {
    package_status: String,
    package_detail: String,
    auth_status: String,
    auth_detail: String,
    runtime_profile_status: String,
    runtime_profile_detail: String,
    process_ownership_status: String,
    process_ownership_detail: String,
    runtime_process_count: usize,
    desktop_process_count: usize,
    machine_wide_node_process_count: usize,
    owned_node_process_count: usize,
    machine_wide_webview2_process_count: usize,
    owned_webview2_process_count: usize,
    active_runtime_loop_candidate_count: usize,
    active_runtime_loop_candidate_keys: Vec<String>,
    warnings: Vec<String>,
}

impl DoctorStatusSummary {
    fn unavailable_with_process(detail: String, process_summary: ProcessOwnershipSummary) -> Self {
        Self {
            package_status: "Unknown".to_string(),
            package_detail: detail.clone(),
            auth_status: "Unknown".to_string(),
            auth_detail: detail.clone(),
            runtime_profile_status: "Unknown".to_string(),
            runtime_profile_detail: detail.clone(),
            process_ownership_status: process_summary.status,
            process_ownership_detail: process_summary.detail,
            runtime_process_count: process_summary.runtime_process_count,
            desktop_process_count: process_summary.desktop_process_count,
            machine_wide_node_process_count: process_summary.machine_wide_node_process_count,
            owned_node_process_count: process_summary.owned_node_process_count,
            machine_wide_webview2_process_count: process_summary
                .machine_wide_webview2_process_count,
            owned_webview2_process_count: process_summary.owned_webview2_process_count,
            active_runtime_loop_candidate_count: 0,
            active_runtime_loop_candidate_keys: Vec::new(),
            warnings: process_summary
                .warnings
                .into_iter()
                .chain(std::iter::once(format!(
                    "Doctor diagnostics unavailable: {detail}"
                )))
                .collect(),
        }
    }
}

#[derive(Clone)]
struct ProcessOwnershipSummary {
    status: String,
    detail: String,
    runtime_process_count: usize,
    desktop_process_count: usize,
    machine_wide_node_process_count: usize,
    owned_node_process_count: usize,
    machine_wide_webview2_process_count: usize,
    owned_webview2_process_count: usize,
    warnings: Vec<String>,
}

#[derive(Clone, Debug)]
struct ProcessEntry {
    pid: u32,
    parent_pid: u32,
    exe_name: String,
}

fn musu_home() -> std::path::PathBuf {
    if let Some(home) = std::env::var_os("MUSU_HOME") {
        return std::path::PathBuf::from(home);
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        return std::path::PathBuf::from(home).join(".musu");
    }
    if let Some(home) = std::env::var_os("HOME") {
        return std::path::PathBuf::from(home).join(".musu");
    }
    std::path::PathBuf::from(".musu")
}

fn bridge_registry_status(home: &std::path::Path) -> BridgeRegistryStatus {
    bridge_registry_status_with_pid_checker(home, is_pid_alive)
}

fn bridge_registry_status_with_pid_checker(
    home: &std::path::Path,
    is_pid_alive_fn: impl Fn(u32) -> bool,
) -> BridgeRegistryStatus {
    let path = home.join("services").join("bridge.json");
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return BridgeRegistryStatus {
                url: None,
                detail: "bridge registry not found".to_string(),
                pid_running: false,
                pid: None,
            };
        }
        Err(err) => {
            return BridgeRegistryStatus {
                url: None,
                detail: format!("bridge registry unreadable: {err}"),
                pid_running: false,
                pid: None,
            };
        }
    };

    let value: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(err) => {
            return BridgeRegistryStatus {
                url: None,
                detail: format!("bridge registry parse failed: {err}"),
                pid_running: false,
                pid: None,
            };
        }
    };

    let pid = value
        .get("pid")
        .and_then(|value| value.as_u64())
        .and_then(|value| u32::try_from(value).ok());
    if let Some(pid) = pid {
        if !is_pid_alive_fn(pid) {
            let cleanup_detail = match std::fs::remove_file(&path) {
                Ok(()) => format!("stale bridge registry removed: pid {pid} is not running"),
                Err(err) => {
                    format!("stale bridge registry detected: pid {pid} is not running; cleanup failed: {err}")
                }
            };
            return BridgeRegistryStatus {
                url: None,
                detail: cleanup_detail,
                pid_running: false,
                pid: Some(pid),
            };
        }
    }

    let Some(addr) = value.get("addr").and_then(|value| value.as_str()) else {
        return BridgeRegistryStatus {
            url: None,
            detail: "bridge registry missing addr".to_string(),
            pid_running: false,
            pid,
        };
    };

    BridgeRegistryStatus {
        url: Some(format!("http://{addr}")),
        detail: if let Some(pid) = pid {
            format!("bridge registry pid {pid} is running")
        } else {
            "bridge registry missing pid".to_string()
        },
        pid_running: pid.is_some(),
        pid,
    }
}

#[cfg(windows)]
fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }

    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        };

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let _ = CloseHandle(handle);
        true
    }
}

#[cfg(not(windows))]
fn is_pid_alive(_pid: u32) -> bool {
    true
}

fn probe_dashboard() -> DashboardProbe {
    if !developer_dashboard_surface_enabled() {
        return DashboardProbe {
            ok: false,
            url: None,
            detail: "developer dashboard is disabled in packaged MUSU Desktop; local work runs through the bridge and MUSU.PRO supplies remote input".to_string(),
        };
    }

    for base in ["http://127.0.0.1:3000", "http://127.0.0.1:3001"] {
        let result = probe_http(base, "/api/doctor");
        if result.ok {
            return DashboardProbe {
                ok: true,
                url: Some(format!("{base}/app")),
                detail: result.detail,
            };
        }
    }

    DashboardProbe {
        ok: false,
        url: None,
        detail: "optional developer dashboard is not running on 3000 or 3001; MUSU Desktop does not require it".to_string(),
    }
}

fn developer_dashboard_surface_enabled() -> bool {
    let env_value = std::env::var("MUSU_DESKTOP_ENABLE_DEV_DASHBOARD").ok();
    developer_dashboard_surface_enabled_for(env_value.as_deref(), cfg!(debug_assertions))
}

fn developer_dashboard_surface_enabled_for(
    env_value: Option<&str>,
    debug_assertions: bool,
) -> bool {
    if debug_assertions {
        return true;
    }

    env_value
        .map(|value| {
            let trimmed = value.trim();
            trimmed == "1"
                || trimmed.eq_ignore_ascii_case("true")
                || trimmed.eq_ignore_ascii_case("yes")
        })
        .unwrap_or(false)
}

fn probe_http(base: &str, path: &str) -> ProbeResult {
    match http_get(base, path) {
        Ok(response) => {
            let status = response.lines().next().unwrap_or_default().to_string();
            ProbeResult {
                ok: status.contains(" 200 "),
                detail: status,
            }
        }
        Err(err) => ProbeResult {
            ok: false,
            detail: err,
        },
    }
}

fn http_get(base: &str, path: &str) -> Result<String, String> {
    let without_scheme = base
        .strip_prefix("http://")
        .ok_or_else(|| format!("unsupported URL scheme in {base}"))?;
    let host_port = without_scheme
        .split('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("missing host in {base}"))?;

    let mut stream = std::net::TcpStream::connect_timeout(
        &host_port
            .parse()
            .map_err(|err| format!("bad address {host_port}: {err}"))?,
        std::time::Duration::from_millis(850),
    )
    .map_err(|err| format!("{host_port} unreachable: {err}"))?;

    let _ = stream.set_read_timeout(Some(std::time::Duration::from_millis(1200)));
    let request = format!("GET {path} HTTP/1.1\r\nHost: {host_port}\r\nConnection: close\r\n\r\n");
    std::io::Write::write_all(&mut stream, request.as_bytes())
        .map_err(|err| format!("request write failed: {err}"))?;

    let mut response = String::new();
    std::io::Read::read_to_string(&mut stream, &mut response)
        .map_err(|err| format!("response read failed: {err}"))?;
    Ok(response)
}

fn spawn_runtime_autostart() {
    let _ = std::thread::Builder::new()
        .name("musu-runtime-autostart".to_string())
        .spawn(|| {
            let home = musu_home();
            if bridge_is_healthy(&home) {
                return;
            }
            let bridge_registry = bridge_registry_status(&home);
            if bridge_registry.pid_running {
                eprintln!(
                    "MUSU runtime autostart skipped because bridge registry already points at a running PID: {}",
                    bridge_registry.detail
                );
                return;
            }
            let Some(_guard) = runtime_start_gate().try_acquire() else {
                eprintln!("MUSU runtime autostart skipped because another runtime start is already in progress.");
                return;
            };

            // User launch (the desktop app window opened) == the UserOpen path:
            // hand off to the single `musu-startup open` entry point (shared with
            // the manual start_runtime command — see spawn_musu_startup_open).
            // musu-startup (per DESKTOP_BRIDGE_ONBOARDING_SPEC §10) ensures the
            // bridge AND, if there is no account token, starts the device-flow
            // that opens the approval page. Fire-and-forget: musu-startup holds
            // the bridge in its OWN foreground, so we don't wait. The `_guard`
            // drops at end of closure, right after the launch.
            //
            // NOTE: bare/`--service` startup (the MSIX windows.startupTask) stays
            // bridge-only by design; only this desktop-window launch path uses
            // `open`, so service boot never triggers an interactive device-flow.
            match spawn_musu_startup_open() {
                Ok(()) => eprintln!("MUSU desktop launch: handed off to `musu-startup open`."),
                Err(err) => eprintln!(
                    "MUSU desktop launch: {err}. The bridge will not auto-start; run `musu up` manually (dev) or reinstall the package."
                ),
            }
        });
}

fn bridge_is_healthy(home: &std::path::Path) -> bool {
    let registry = bridge_registry_status(home);
    registry
        .url
        .as_deref()
        .map(|url| probe_http(url, "/health").ok)
        .unwrap_or(false)
}

fn musu_command_path() -> std::path::PathBuf {
    let runtime_name = musu_runtime_exe_name();
    match std::env::current_exe() {
        Ok(current_exe) => musu_command_path_for_current_exe(&current_exe, |path| path.exists()),
        Err(_) => std::path::PathBuf::from(runtime_name),
    }
}

fn musu_command_path_for_current_exe(
    current_exe: &std::path::Path,
    exists: impl Fn(&std::path::Path) -> bool,
) -> std::path::PathBuf {
    sibling_exe_for_current_exe(current_exe, musu_runtime_exe_name(), exists)
}

/// Resolve `musu-startup.exe` next to the running desktop binary, falling back to
/// the bare name (rely on PATH) when no packaged sibling exists. Mirrors
/// [`musu_command_path`] but for the device-flow startup binary the MSIX package
/// ships alongside `musu.exe` (see `scripts/windows/build-msix.ps1`
/// `StartupExecutable`).
fn musu_startup_path() -> std::path::PathBuf {
    let startup_name = musu_startup_exe_name();
    match std::env::current_exe() {
        Ok(current_exe) => {
            sibling_exe_for_current_exe(&current_exe, startup_name, |path| path.exists())
        }
        Err(_) => std::path::PathBuf::from(startup_name),
    }
}

/// Shared sibling-resolution: prefer `<dir of current exe>/<exe_name>`, else the
/// bare name. Used for both `musu.exe` and `musu-startup.exe`.
fn sibling_exe_for_current_exe(
    current_exe: &std::path::Path,
    exe_name: &str,
    exists: impl Fn(&std::path::Path) -> bool,
) -> std::path::PathBuf {
    if let Some(parent) = current_exe.parent() {
        let sibling = parent.join(exe_name);
        if exists(&sibling) {
            return sibling;
        }
    }
    std::path::PathBuf::from(exe_name)
}

fn musu_runtime_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "musu.exe"
    } else {
        "musu"
    }
}

fn musu_startup_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "musu-startup.exe"
    } else {
        "musu-startup"
    }
}

struct TimedCommandOutput {
    status_success: bool,
    status_detail: String,
    timed_out: bool,
    stdout: String,
    stderr: String,
}

fn run_command_with_timeout(
    command: &std::path::Path,
    args: &[&str],
    timeout: std::time::Duration,
) -> Result<TimedCommandOutput, String> {
    let temp_dir = std::env::temp_dir();
    let now_nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let nonce = format!("{}-{}", std::process::id(), now_nanos);
    let stdout_path = temp_dir.join(format!("musu-desktop-{nonce}.stdout.log"));
    let stderr_path = temp_dir.join(format!("musu-desktop-{nonce}.stderr.log"));
    let stdout_file = std::fs::File::create(&stdout_path)
        .map_err(|err| format!("failed to create stdout capture file: {err}"))?;
    let stderr_file = std::fs::File::create(&stderr_path)
        .map_err(|err| format!("failed to create stderr capture file: {err}"))?;

    let mut child = std::process::Command::new(command)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::from(stdout_file))
        .stderr(std::process::Stdio::from(stderr_file))
        .spawn()
        .map_err(|err| format!("spawn failed: {err}"))?;

    let deadline = std::time::Instant::now() + timeout;
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("failed while waiting for command: {err}"))?
        {
            break status;
        }

        if std::time::Instant::now() >= deadline {
            timed_out = true;
            let _ = child.kill();
            let _ = child.wait();
            break exit_status_after_timeout();
        }

        std::thread::sleep(std::time::Duration::from_millis(200));
    };

    let stdout = read_text_file_lossy(&stdout_path);
    let stderr = read_text_file_lossy(&stderr_path);
    let _ = std::fs::remove_file(&stdout_path);
    let _ = std::fs::remove_file(&stderr_path);

    Ok(TimedCommandOutput {
        status_success: status.success() && !timed_out,
        status_detail: status.to_string(),
        timed_out,
        stdout,
        stderr,
    })
}

fn read_text_file_lossy(path: &std::path::Path) -> String {
    std::fs::read(path)
        .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
        .unwrap_or_default()
}

#[cfg(unix)]
fn exit_status_after_timeout() -> std::process::ExitStatus {
    use std::os::unix::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(1 << 8)
}

#[cfg(windows)]
fn exit_status_after_timeout() -> std::process::ExitStatus {
    use std::os::windows::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(1)
}

#[cfg(test)]
mod tests {
    use super::{
        bridge_is_healthy, bridge_registry_status_with_pid_checker, bridge_status_label,
        can_start_runtime, developer_dashboard_surface_enabled_for,
        musu_command_path_for_current_exe, parse_doctor_status_summary, run_command_with_timeout,
        sibling_exe_for_current_exe, summarize_process_ownership, ProcessEntry, RuntimeStartGate,
    };

    const TEST_MARKER: &str = "musu-desktop-command-capture-ok";

    #[test]
    fn packaged_build_requires_dev_dashboard_opt_in() {
        assert!(!developer_dashboard_surface_enabled_for(None, false));
        assert!(!developer_dashboard_surface_enabled_for(Some("0"), false));
        assert!(developer_dashboard_surface_enabled_for(Some("1"), false));
        assert!(developer_dashboard_surface_enabled_for(Some("true"), false));
        assert!(developer_dashboard_surface_enabled_for(None, true));
    }

    #[test]
    fn timed_command_captures_stdout_without_output_pipes() {
        let (command, args) = shell_echo_command();
        let result = run_command_with_timeout(&command, &args, std::time::Duration::from_secs(5))
            .expect("command should run");

        assert!(result.status_success, "{:?}", result.status_detail);
        assert!(!result.timed_out);
        assert!(result.stdout.contains(TEST_MARKER), "{:?}", result.stdout);
    }

    #[cfg(windows)]
    fn shell_echo_command() -> (std::path::PathBuf, Vec<&'static str>) {
        (
            std::path::PathBuf::from("cmd"),
            vec!["/C", "echo", TEST_MARKER],
        )
    }

    #[cfg(unix)]
    fn shell_echo_command() -> (std::path::PathBuf, Vec<&'static str>) {
        (
            std::path::PathBuf::from("sh"),
            vec!["-c", "printf '%s\\n' \"$1\"", "sh", TEST_MARKER],
        )
    }

    #[test]
    fn runtime_command_prefers_packaged_sibling() {
        let desktop_exe = if cfg!(target_os = "windows") {
            std::path::PathBuf::from(
                r"C:\Program Files\WindowsApps\Yellowhama.MUSU\musu-desktop.exe",
            )
        } else {
            std::path::PathBuf::from("/opt/musu/musu-desktop")
        };
        let expected_runtime = desktop_exe
            .parent()
            .unwrap()
            .join(if cfg!(target_os = "windows") {
                "musu.exe"
            } else {
                "musu"
            });

        let resolved =
            musu_command_path_for_current_exe(&desktop_exe, |path| path == expected_runtime);

        assert_eq!(resolved, expected_runtime);
    }

    #[test]
    fn runtime_command_falls_back_to_path_name_when_sibling_missing() {
        let desktop_exe = if cfg!(target_os = "windows") {
            std::path::PathBuf::from(r"C:\Temp\musu-desktop.exe")
        } else {
            std::path::PathBuf::from("/tmp/musu-desktop")
        };

        let resolved = musu_command_path_for_current_exe(&desktop_exe, |_| false);

        assert_eq!(
            resolved,
            std::path::PathBuf::from(if cfg!(target_os = "windows") {
                "musu.exe"
            } else {
                "musu"
            })
        );
    }

    #[test]
    fn startup_command_prefers_packaged_sibling() {
        let desktop_exe = if cfg!(target_os = "windows") {
            std::path::PathBuf::from(
                r"C:\Program Files\WindowsApps\Yellowhama.MUSU\musu-desktop.exe",
            )
        } else {
            std::path::PathBuf::from("/opt/musu/musu-desktop")
        };
        let expected_startup = desktop_exe
            .parent()
            .unwrap()
            .join(if cfg!(target_os = "windows") {
                "musu-startup.exe"
            } else {
                "musu-startup"
            });

        let resolved = sibling_exe_for_current_exe(
            &desktop_exe,
            super::musu_startup_exe_name(),
            |path| path == expected_startup,
        );

        assert_eq!(resolved, expected_startup);
    }

    #[test]
    fn startup_command_falls_back_to_path_name_when_sibling_missing() {
        let desktop_exe = if cfg!(target_os = "windows") {
            std::path::PathBuf::from(r"C:\Temp\musu-desktop.exe")
        } else {
            std::path::PathBuf::from("/tmp/musu-desktop")
        };

        let resolved =
            sibling_exe_for_current_exe(&desktop_exe, super::musu_startup_exe_name(), |_| false);

        assert_eq!(
            resolved,
            std::path::PathBuf::from(if cfg!(target_os = "windows") {
                "musu-startup.exe"
            } else {
                "musu-startup"
            })
        );
    }

    #[test]
    fn stale_bridge_registry_is_removed_before_status_probe() {
        let home = make_temp_home("stale-bridge-registry");
        let services = home.join("services");
        std::fs::create_dir_all(&services).unwrap();
        let path = services.join("bridge.json");
        std::fs::write(
            &path,
            r#"{"name":"bridge","addr":"127.0.0.1:6677","pid":32192}"#,
        )
        .unwrap();

        let status = bridge_registry_status_with_pid_checker(&home, |_| false);

        assert!(status.url.is_none());
        assert!(status.detail.contains("stale bridge registry removed"));
        assert!(!bridge_is_healthy(&home));
        assert!(!path.exists());
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn live_bridge_registry_returns_loopback_url() {
        let home = make_temp_home("live-bridge-registry");
        let services = home.join("services");
        std::fs::create_dir_all(&services).unwrap();
        std::fs::write(
            services.join("bridge.json"),
            r#"{"name":"bridge","addr":"127.0.0.1:6677","pid":32192}"#,
        )
        .unwrap();

        let status = bridge_registry_status_with_pid_checker(&home, |_| true);

        assert_eq!(status.url.as_deref(), Some("http://127.0.0.1:6677"));
        assert!(status.detail.contains("pid 32192 is running"));
        assert!(status.pid_running);
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn runtime_start_gate_blocks_reentry_until_guard_drop() {
        let gate = RuntimeStartGate::default();
        let first = gate.try_acquire();
        assert!(first.is_some());
        assert!(gate.is_in_progress());
        assert!(gate.try_acquire().is_none());
        drop(first);
        assert!(!gate.is_in_progress());
        assert!(gate.try_acquire().is_some());
    }

    #[test]
    fn can_start_runtime_requires_offline_bridge_and_no_pending_start() {
        assert!(can_start_runtime(false, false, false));
        assert!(!can_start_runtime(true, false, false));
        assert!(!can_start_runtime(false, true, false));
        assert!(!can_start_runtime(false, false, true));
    }

    #[test]
    fn bridge_status_surfaces_starting_state_while_start_is_pending() {
        assert_eq!(bridge_status_label(true, false, false), "ok");
        assert_eq!(bridge_status_label(false, true, false), "starting");
        assert_eq!(bridge_status_label(false, false, true), "starting");
        assert_eq!(bridge_status_label(false, false, false), "offline");
    }

    #[test]
    fn doctor_status_summary_flags_alias_shadowing_and_local_only_mode() {
        let summary = parse_doctor_status_summary(
            r#"{
                "distribution": "store-msix",
                "binary": {
                    "current_exe": "C:\\Program Files\\WindowsApps\\Yellowhama.MUSU\\musu.exe",
                    "alias_shadowed_by": "C:\\Users\\empty\\.cargo\\bin\\musu.exe",
                    "note": "WindowsApps package alias is shadowed by another musu.exe earlier on PATH."
                },
                "account": {
                    "logged_in": false,
                    "bridge_token_present": true,
                    "note": "Partial auth state: either account login or local bridge token is missing."
                },
                "background": {
                    "active_runtime_loop_candidate_count": 0,
                    "active_runtime_loop_candidate_keys": [],
                    "runtime_loop_candidates": [],
                    "note": "Background work is in the low-duty default profile."
                }
            }"#,
            Some(32192),
        )
        .expect("doctor JSON should parse");

        assert_eq!(summary.package_status, "Shadowed");
        assert_eq!(summary.auth_status, "Local Only");
        assert_eq!(summary.runtime_profile_status, "Quiet");
        assert_eq!(summary.active_runtime_loop_candidate_count, 0);
        assert!(
            summary
                .warnings
                .iter()
                .any(|warning| warning.contains("packaged WindowsApps alias")),
            "{:?}",
            summary.warnings
        );
    }

    #[test]
    fn doctor_status_summary_surfaces_active_runtime_loop_candidates() {
        let summary = parse_doctor_status_summary(
            r#"{
                "distribution": "store-msix",
                "binary": {
                    "current_exe": "C:\\Program Files\\WindowsApps\\Yellowhama.MUSU\\musu.exe",
                    "note": "Packaged runtime is active."
                },
                "account": {
                    "logged_in": true,
                    "bridge_token_present": true,
                    "note": "Account token is present."
                },
                "background": {
                    "active_runtime_loop_candidate_count": 2,
                    "active_runtime_loop_candidate_keys": ["cloud_heartbeat", "relay_target_polling"],
                    "runtime_loop_candidates": [
                        { "key": "cloud_heartbeat", "label": "Cloud heartbeat", "active": true },
                        { "key": "relay_target_polling", "label": "Relay target polling", "active": true }
                    ],
                    "note": "Background work is active."
                }
            }"#,
            Some(32192),
        )
        .expect("doctor JSON should parse");

        assert_eq!(summary.package_status, "Packaged");
        assert_eq!(summary.auth_status, "Connected");
        assert_eq!(summary.runtime_profile_status, "Active");
        assert_eq!(summary.active_runtime_loop_candidate_count, 2);
        assert_eq!(
            summary.active_runtime_loop_candidate_keys,
            vec![
                "cloud_heartbeat".to_string(),
                "relay_target_polling".to_string()
            ]
        );
        assert!(
            summary
                .runtime_profile_detail
                .contains("Cloud heartbeat, Relay target polling"),
            "{}",
            summary.runtime_profile_detail
        );
    }

    #[test]
    fn process_ownership_summary_flags_duplicate_runtime_and_owned_node_helpers() {
        let summary = summarize_process_ownership(
            vec![
                ProcessEntry {
                    pid: 10,
                    parent_pid: 1,
                    exe_name: "musu.exe".to_string(),
                },
                ProcessEntry {
                    pid: 11,
                    parent_pid: 1,
                    exe_name: "musud.exe".to_string(),
                },
                ProcessEntry {
                    pid: 20,
                    parent_pid: 1,
                    exe_name: "musu-desktop.exe".to_string(),
                },
                ProcessEntry {
                    pid: 30,
                    parent_pid: 10,
                    exe_name: "node.exe".to_string(),
                },
                ProcessEntry {
                    pid: 31,
                    parent_pid: 20,
                    exe_name: "msedgewebview2.exe".to_string(),
                },
            ],
            Some(10),
        );

        assert_eq!(summary.status, "Review");
        assert_eq!(summary.runtime_process_count, 2);
        assert_eq!(summary.desktop_process_count, 1);
        assert_eq!(summary.owned_node_process_count, 1);
        assert_eq!(summary.owned_webview2_process_count, 1);
        assert!(
            summary
                .warnings
                .iter()
                .any(|warning| warning.contains("runtime processes")),
            "{:?}",
            summary.warnings
        );
        assert!(
            summary
                .warnings
                .iter()
                .any(|warning| warning.contains("node.exe helper")),
            "{:?}",
            summary.warnings
        );
    }

    fn make_temp_home(name: &str) -> std::path::PathBuf {
        let now_nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let path = std::env::temp_dir().join(format!(
            "musu-desktop-test-{name}-{}-{now_nanos}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        path
    }
}
