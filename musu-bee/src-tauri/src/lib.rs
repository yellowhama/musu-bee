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
            cockpit_state,
            start_runtime,
            start_login,
            account_logout,
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
// submit_order's outer timeout MUST exceed `musu route`'s internal HTTP submit
// timeout (10s, cli_commands.rs). If they were equal, an order the bridge queued
// at ~9.9s could be killed at 10.0s before run_route finished — reporting failure
// for an order that actually went through (a false "not sent"). Give the inner
// path room to return its real success/failure.
const SUBMIT_ORDER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

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

/// The cheap, poll-friendly cockpit state. `desktop_status` shells out to
/// `musu doctor --json` (≤10s) AND enumerates the entire process table every
/// call — far too heavy to run on the 15s fleet-refresh tick, which only needs
/// "is the bridge up?" and "what auth state am I in?". Both signals are cheap:
/// a bridge `/health` TCP probe (already sub-second) and two direct token-file
/// reads (no shell-out). The expensive `desktop_status` is now called only when
/// the diagnostics drawer opens / Refresh is pressed — not 4×/min forever.
#[derive(serde::Serialize)]
struct CockpitState {
    bridge_status: String,
    bridge_url: Option<String>,
    auth_status: String,
}

#[tauri::command]
fn cockpit_state() -> CockpitState {
    let home = musu_home();
    let bridge_registry = bridge_registry_status(&home);
    let runtime_start_in_progress = runtime_start_gate().is_in_progress();
    let bridge_probe = bridge_registry
        .url
        .as_deref()
        .map(|url| probe_http(url, "/health"))
        .unwrap_or(ProbeResult {
            ok: false,
            detail: String::new(),
        });
    let bridge_ok = bridge_probe.ok;

    // auth_status WITHOUT doctor: the Connected / Local Only / Offline rule is a
    // pure function of two on-disk tokens (account token + bridge token). This
    // replicates parse_doctor_status_summary's auth branch exactly, minus the
    // shell-out. (lib.rs deliberately does NOT depend on musu-rs as a library,
    // so the two cheap file reads are inlined here.)
    let logged_in = account_token_present(&home);
    let bridge_token_present = bridge_token_present(&home);
    let auth_status = if logged_in {
        "Connected"
    } else if bridge_token_present {
        "Local Only"
    } else {
        "Offline"
    }
    .to_string();

    CockpitState {
        bridge_status: bridge_status_label(
            bridge_ok,
            bridge_registry.pid_running,
            runtime_start_in_progress,
        )
        .to_string(),
        bridge_url: bridge_registry.url,
        auth_status,
    }
}

/// `start_login` — the cockpit's "Sign in" button. Spawns `musu login --desktop`
/// detached: it drives device-flow and writes `startup-marker.json`, which the
/// cockpit's existing connecting screen already reads (via read_startup_marker)
/// to surface the pairing code + approval link. Fire-and-forget — the cockpit
/// polls the marker for progress, so we don't wait on the 900s device-flow.
/// CREATE_NO_WINDOW keeps the console-subsystem child from flashing a window.
#[tauri::command]
fn start_login() -> Result<CommandResult, String> {
    // Double-device-flow guard (audit 2026-06-11, MEDIUM): autostart's
    // `musu startup open` already drives device-flow when logged out, writing an
    // `awaiting-device-approval` marker. If the user then clicks Sign in, spawning
    // a SECOND `musu login --desktop` starts an independent flow with a DIFFERENT
    // user code; both write the same marker (last-writer-wins), so the cockpit may
    // show a code whose sibling process owns a different device_code. If a flow is
    // already pending, no-op and let the existing one surface its code.
    if login_flow_pending() {
        return Ok(CommandResult {
            ok: true,
            message: "Sign-in already in progress — approve in your browser.".to_string(),
            output: "a device-flow login is already awaiting approval".to_string(),
        });
    }

    let command = musu_command_path();
    let mut cmd = std::process::Command::new(&command);
    cmd.args(["login", "--desktop"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    no_window(&mut cmd)
        .spawn()
        .map(|_child| CommandResult {
            ok: true,
            message: "Opening sign-in…".to_string(),
            output: "spawned `musu login --desktop`; approve in your browser".to_string(),
        })
        .map_err(|err| format!("failed to spawn {} login --desktop: {err}", command.display()))
}

/// True when a device-flow login is currently awaiting browser approval, per the
/// startup marker. Used to suppress a second concurrent login spawn. Reads the
/// SAME path as `read_startup_marker` (`~/.musu/services/startup-marker.json`).
fn login_flow_pending() -> bool {
    let Ok(text) = std::fs::read_to_string(startup_marker_path()) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return false;
    };
    value.get("stage").and_then(|v| v.as_str()) == Some("awaiting-device-approval")
}

/// `account_logout` — the cockpit's "Sign out" button. Spawns `musu logout`,
/// which deletes the account token (`~/.musu/token`). Waits for completion (it's
/// a fast local file delete) so the cockpit can refresh into the logged-out state
/// immediately. The local bridge is untouched — logout drops the cloud identity,
/// not the machine-local runtime.
#[tauri::command]
fn account_logout() -> Result<CommandResult, String> {
    let command = musu_command_path();
    let result = run_command_with_timeout(&command, &["logout"], DOCTOR_STATUS_TIMEOUT)
        .map_err(|err| format!("failed to run {} logout: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!("{} logout timed out", command.display()));
    }
    let combined = combine_command_output(&result.stdout, &result.stderr);
    if result.status_success {
        Ok(CommandResult {
            ok: true,
            message: "Signed out.".to_string(),
            output: combined,
        })
    } else {
        Err(format!("logout failed: {}", combined.trim()))
    }
}

/// Account (cloud) login present == `~/.musu/token` exists and is non-empty.
/// Mirrors `musu-rs cloud::token::load_token(...).is_some()` without the lib dep.
///
/// KNOWN LIMITATION (audit 2026-06-11, LOW): `load_token` also honors the
/// `MUSU_P2P_CONTROL_TOKEN` / `MUSU_ROUTE_EVIDENCE_TOKEN` / `MUSU_TOKEN` env vars
/// before the file. This file-only check therefore reports "Offline" for a
/// machine logged in purely via those env vars. That's a CI/automation auth
/// pattern, not the desktop-user path (the desktop always logs in via device-flow
/// which writes the file), so the divergence is acceptable here. The expensive
/// `desktop_status` path (real `musu doctor`) reports such a machine correctly.
fn account_token_present(home: &std::path::Path) -> bool {
    std::fs::read_to_string(home.join("token"))
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false)
}

/// Bridge token present == `MUSU_BRIDGE_TOKEN` env (non-empty) OR a non-empty
/// `MUSU_BRIDGE_TOKEN=` line in `~/.musu/bridge.env`. Mirrors
/// `musu-rs install::token::read_bridge_token(...).is_some()`.
fn bridge_token_present(home: &std::path::Path) -> bool {
    if std::env::var("MUSU_BRIDGE_TOKEN")
        .map(|t| !t.is_empty())
        .unwrap_or(false)
    {
        return true;
    }
    let Ok(body) = std::fs::read_to_string(home.join("bridge.env")) else {
        return false;
    };
    body.lines().any(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            return false;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        line.strip_prefix("MUSU_BRIDGE_TOKEN=")
            .map(|rest| !rest.trim_matches(|c| c == '"' || c == '\'').is_empty())
            .unwrap_or(false)
    })
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

    // C1 (2b double-bridge race): route the manual start through the SAME single
    // entry point as autostart — `musu-startup.exe open` — instead of a separate
    // `musu up --json`. Fire-and-forget: musu-startup holds the bridge in its own
    // foreground, so we must NOT await it (a 900s device-flow poll would block the
    // UI). The UI polls bridge health to learn when it's up.
    //
    // HONEST NOTE on what actually prevents a double-bridge (audit 2026-06-11):
    // it is the pre-checks ABOVE in this fn — `bridge_is_healthy` + registry
    // `pid_running` — plus the fact that `start_runtime` has NO caller in the
    // shipped UI today, so the autostart-vs-manual race is not reachable. It is
    // NOT musu-startup idempotency: `spawn_desktop_login_if_needed` guards only
    // the device-flow login (then `bridge::run()` runs unconditionally), and with
    // BRIDGE_PORT defaulting to 0 (OS-dynamic) two racing binds get different
    // ports so AddrInUse never trips. ⚠️ Before wiring a manual-start BUTTON into
    // the cockpit, add a real registry/health guard inside the bridge-start path —
    // the pre-checks here do NOT serialize across the bridge-registration window.
    let outcome = spawn_musu_startup_open();
    // Drop the gate right after the handoff launches; holding it across
    // musu-startup's whole lifetime would permanently block a later retry.
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

/// Apply CREATE_NO_WINDOW (0x08000000) on Windows so spawning the console-subsystem
/// `musu`/`musu-startup` runtime does NOT pop a console window. The GUI app
/// spawning a CLI child was the source of the launch flicker; this suppresses it.
/// No-op on non-Windows.
fn no_window(cmd: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Spawn `musu startup open` detached (no wait). The single entry point both
/// the manual `start_runtime` command and `spawn_runtime_autostart` use, so there
/// is exactly one way a bridge gets started from the desktop app. Single-binary
/// integration (2026-06-11): this is now `musu.exe startup open` — the former
/// musu-startup.exe was absorbed into `musu`, so there is ONE runtime binary and
/// no version skew between what the cockpit calls and what runs. CREATE_NO_WINDOW
/// keeps the console-subsystem child from flashing a window.
fn spawn_musu_startup_open() -> Result<(), String> {
    let command = musu_command_path();
    let mut cmd = std::process::Command::new(&command);
    cmd.args(["startup", "open"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    no_window(&mut cmd)
        .spawn()
        .map(|_child| ())
        .map_err(|err| format!("failed to spawn {} startup open: {err}", command.display()))
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

    // P3: distinguish "empty fleet" from failure. not_logged_in → empty Vec (the
    // cockpit shows the connecting/device-flow screen). token_expired /
    // cloud_unreachable → Err so the cockpit can say "sign in again" / "couldn't
    // reach musu.pro" instead of silently showing zero machines.
    if envelope.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        let kind = envelope.get("error").and_then(|v| v.as_str()).unwrap_or("");
        return match kind {
            "not_logged_in" | "" => Ok(Vec::new()),
            "token_expired" => Err("token_expired".to_string()),
            other => Err(format!("cloud_unreachable: {other}")),
        };
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
    // Flags FIRST, then a `--` end-of-options separator, then the order text as
    // the trailing positional. Without `--`, an order starting with `-`/`--`
    // (e.g. "--fix the build") would be misparsed by clap as an unknown flag and
    // the spawn would fail. `--` makes everything after it positional.
    let mut args: Vec<&str> = vec!["route"];
    let target = target.trim();
    if !target.is_empty() {
        args.push("--target");
        args.push(target);
    }
    args.push("--channel");
    args.push("desktop");
    args.push("--");
    args.push(text);

    let result = run_command_with_timeout(&command, &args, SUBMIT_ORDER_TIMEOUT)
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
/// Path to the desktop startup marker. CRITICAL (audit 2026-06-11): the writer
/// (`install::startup::write_startup_marker`) writes to
/// `~/.musu/services/startup-marker.json` — the `services/` subdir, same place
/// bridge.json lives. The reader previously read `~/.musu/startup-marker.json`
/// (no `services/`), so EVERY read returned null and the cockpit's connecting
/// screen never showed the approval code/link or a failed-login state. Both the
/// reader and the login-pending guard go through this ONE helper so they can
/// never drift apart again.
fn startup_marker_path() -> std::path::PathBuf {
    musu_home().join("services").join("startup-marker.json")
}

#[tauri::command]
fn read_startup_marker() -> Result<serde_json::Value, String> {
    match std::fs::read_to_string(startup_marker_path()) {
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

/// Shared sibling-resolution: prefer `<dir of current exe>/<exe_name>`, else the
/// bare name. (Single-binary integration: there's now one runtime exe, `musu`,
/// so this is only used for `musu_command_path` — `musu startup` replaced the
/// separate musu-startup.exe.)
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

    let mut cmd = std::process::Command::new(command);
    cmd.args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::from(stdout_file))
        .stderr(std::process::Stdio::from(stderr_file));
    let mut child = no_window(&mut cmd)
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
        sibling_exe_for_current_exe, startup_marker_path, summarize_process_ownership, ProcessEntry,
        RuntimeStartGate,
    };

    const TEST_MARKER: &str = "musu-desktop-command-capture-ok";

    /// Regression guard (audit 2026-06-11 HIGH): the cockpit's marker reader MUST
    /// point at `<home>/services/startup-marker.json` — the exact path the runtime
    /// writer (`install::startup::write_startup_marker`) uses. A mismatch makes
    /// every read return null and silently breaks the connecting/sign-in screen.
    #[test]
    fn startup_marker_path_is_under_services_dir() {
        let home = make_temp_home("marker-path");
        std::env::set_var("MUSU_HOME", &home);
        let path = startup_marker_path();
        std::env::remove_var("MUSU_HOME");

        assert_eq!(path, home.join("services").join("startup-marker.json"));
        assert!(
            path.ends_with("services/startup-marker.json")
                || path.ends_with("services\\startup-marker.json"),
            "marker path must be under services/: {}",
            path.display()
        );
    }

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
