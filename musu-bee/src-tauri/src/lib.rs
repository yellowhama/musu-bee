use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

const PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT: &str =
    "musu.private_mesh_release_bundle_contract.v20260614_toolchain_bound";
const PHYSICAL_PEER_EVIDENCE_MAX_AGE_SECONDS: i64 = 86_400;
const PHYSICAL_PEER_EVIDENCE_FUTURE_SKEW_SECONDS: i64 = 300;

/// Hosted .appinstaller — the update channel App Installer auto-update polls and
/// the same URL the cockpit's in-app probe reads to compare versions. Hoisted to
/// a module-level const (L-8) so `check_for_updates` (the apply action) and
/// `probe_update` (the version probe) provably target the SAME URL.
const APPINSTALLER_URL: &str =
    "https://github.com/yellowhama/musu-bee/releases/download/desktop-latest/musu.appinstaller";

/// Hosted .msix — the actual package the in-app update downloads and installs
/// directly. Same release base as APPINSTALLER_URL. We install this directly
/// (Add-AppxPackage) rather than via `ms-appinstaller:?source=` because Windows
/// disables the ms-appinstaller: protocol by default (2022 MSRC malware
/// hardening) → the protocol path dies with "ms-appinstaller protocol disabled".
/// Direct .msix install is protocol-free. Self-update lifecycle (cockpit can't
/// replace its own running files → 0x80073D02) is handled by a detached helper
/// that waits for cockpit exit before installing. See `check_for_updates`.
const DESKTOP_MSIX_URL: &str =
    "https://github.com/yellowhama/musu-bee/releases/download/desktop-latest/musu-desktop-x64.msix";

/// Installed package identity name (NOT the family name) — the stable key the
/// update helper passes to `Get-AppxPackage -Name` to resolve the freshly
/// installed package and derive its AUMID (`<PackageFamilyName>!<appId>`) for
/// relaunch. Resolving the family + appId at runtime (rather than hardcoding the
/// publisher-hash family) means a re-sign can't stale the relaunch. A packaged
/// app must be launched via the shell (explorer.exe shell:AppsFolder\<aumid>),
/// NOT by exe path, so it lands in the user (not elevated) session.
const PACKAGE_IDENTITY_NAME: &str = "blossompark.musu";

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
        // S-tier: OS notifications so an order finishing taps the user even when
        // the cockpit is backgrounded (the "walk away" keystone).
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            cockpit_state,
            start_runtime,
            open_dashboard,
            open_external_url,
            check_for_updates,
            probe_update,
            restart_app,
            start_login,
            account_logout,
            private_mesh_status,
            private_mesh_doctor,
            private_mesh_verify_target,
            private_mesh_bootstrap,
            private_mesh_start_control_host,
            private_mesh_create_join_key,
            private_mesh_join,
            private_mesh_join_account,
            private_mesh_leave,
            mesh_node_list,
            mesh_node_rename,
            mesh_node_remove,
            complete_uninstall,
            private_mesh_release_proof_target,
            latest_release_evidence,
            latest_physical_peer_evidence,
            validate_physical_peer_evidence_path,
            open_release_evidence_folder,
            list_fleet,
            this_pc_programs,
            submit_order,
            get_order_status,
            notify_task_result,
            cancel_order,
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
            // S-tier: system tray — makes MUSU a RESIDENT control center, not a
            // window you close. Left-click restores; the menu has Show + Quit.
            build_tray(app.handle())?;
            spawn_runtime_autostart();
            Ok(())
        })
        // Closing the window HIDES to tray (does not quit) — the app stays
        // resident watching the fleet. Quit is explicit via the tray menu.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// S-tier tray: a tray icon with a Show / Quit menu; left-click restores the
/// cockpit. Makes MUSU a resident product (the fleet stays watched while the
/// window is hidden).
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::{TrayIconBuilder, TrayIconEvent};

    // A resident control center's tray menu: open, check for updates, restart,
    // and an explicit Quit (the window's X only hides to tray, so Quit must be
    // reachable here — a background task runner that can't be quit is a footgun).
    let show = MenuItemBuilder::with_id("show", "Open MUSU").build(app)?;
    let updates = MenuItemBuilder::with_id("updates", "Check for updates").build(app)?;
    let restart = MenuItemBuilder::with_id("restart", "Restart MUSU").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit MUSU").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show])
        .separator()
        .items(&[&updates, &restart])
        .separator()
        .items(&[&quit])
        .build()?;

    let _tray = TrayIconBuilder::with_id("musu-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("MUSU — your computers")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => reveal_main_window(app),
            "updates" => {
                let _ = check_for_updates(app.clone());
            }
            "restart" => app.restart(),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                reveal_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn reveal_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// S-tier: fire an OS notification when an order reaches a terminal state, so the
/// user can leave the cockpit and still know the moment work finishes. Called
/// from the cockpit's poll loop on done/failed. Best-effort.
#[tauri::command]
fn notify_task_result(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("notify failed: {e}"))
}

/// Cancel an in-flight order (bound to Esc on the newest running card). Spawns
/// `musu task <id>` DELETE via the bridge — reuses the cancel path the CLI uses.
/// Best-effort: a bridge HTTP DELETE through the runtime binary.
#[tauri::command]
fn cancel_order(task_id: String) -> Result<CommandResult, String> {
    let task_id = task_id.trim();
    if task_id.is_empty() {
        return Err("task_id is empty".to_string());
    }
    let command = musu_command_path();
    // `musu route --target <self>`… no — cancel is DELETE /api/tasks/:id, exposed
    // via the runtime's task subcommand. We spawn `musu task <id> --cancel`-style
    // through the existing CLI surface: the bridge DELETE handler.
    let result = run_command_with_timeout(
        &command,
        &["task", task_id, "--cancel"],
        DOCTOR_STATUS_TIMEOUT,
    )
    .map_err(|err| format!("failed to run {} task --cancel: {err}", command.display()))?;
    let combined = combine_command_output(&result.stdout, &result.stderr);
    Ok(CommandResult {
        ok: result.status_success,
        message: if result.status_success {
            "cancel requested".to_string()
        } else {
            "cancel failed".to_string()
        },
        output: combined,
    })
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

#[derive(serde::Serialize)]
struct PrivateMeshDesktopStatus {
    ok: bool,
    mode: String,
    route_label: String,
    account_requirement: String,
    control_server_url: Option<String>,
    control_server_verified: bool,
    derp_policy: Option<String>,
    derp_readiness: String,
    derp_private_declared: bool,
    derp_probe_ran: bool,
    derp_probe_ok: bool,
    derp_probe_detail: Option<String>,
    local_tailnet_ip: Option<String>,
    verified_target_tailnet_ip: Option<String>,
    callback_tailnet_ip: Option<String>,
    target_callback_match: bool,
    compatible_client_found: bool,
    tailscale_ping_verified: bool,
    bridge_health_verified: bool,
    callback_verified: bool,
    release_grade: bool,
    warnings: Vec<String>,
    next_steps: Vec<String>,
    error: Option<String>,
}

#[derive(serde::Serialize)]
struct PrivateMeshVerifyDesktopResult {
    ok: bool,
    target_ip: String,
    ping_ok: bool,
    bridge_health_ok: bool,
    bridge_health_status: Option<u64>,
    callback_verified: bool,
    callback_tailnet_ip: Option<String>,
    target_callback_match: bool,
    release_grade: bool,
    next_steps: Vec<String>,
    error: Option<String>,
    output: String,
}

/// Result of `private_mesh_bootstrap` — the cockpit's "Generate mesh bundle"
/// action. Replaces the copy-the-`musu mesh bootstrap`-command UX: the cockpit
/// calls this directly and shows where the self-hosted Headscale + Caddy +
/// embedded-DERP bundle was written plus the next steps, so the user never has
/// to leave the app to run the bootstrap CLI by hand.
#[derive(serde::Serialize)]
struct PrivateMeshBootstrapDesktopResult {
    ok: bool,
    server_url: String,
    output_dir: String,
    tailnet_name: String,
    generated_files: Vec<String>,
    next_commands: Vec<String>,
    error: Option<String>,
    output: String,
}

/// Result of `private_mesh_create_join_key` — the cockpit's "Issue device-add
/// pass" action. Mints a one-use pass from the running control plane and tells
/// the user exactly which file to copy to the target PC, so adding a machine is
/// a button, not a copied `scripts/create-join-key` command.
#[derive(serde::Serialize)]
struct PrivateMeshCreateJoinKeyDesktopResult {
    ok: bool,
    pass_path: String,
    login_server: String,
    tailnet: String,
    expires_after_seconds: i64,
    join_command: String,
    error: Option<String>,
    output: String,
}

/// Result of `private_mesh_start_control_host` — the cockpit's "Start control
/// host" action. Brings the generated bundle online (docker compose up) and
/// reports whether Headscale came up healthy, so step 2 of Add PC is a button.
#[derive(serde::Serialize)]
struct PrivateMeshStartControlHostDesktopResult {
    ok: bool,
    stage: String,
    error: Option<String>,
    output: String,
}

/// Result of `private_mesh_join` — the cockpit's "Join this PC to a mesh"
/// action on a NEW machine. Takes the device-add pass file copied from the
/// control host and runs `mesh join`, so a fresh PC joins the fleet from a
/// button + paste instead of a typed `musu mesh join` command.
#[derive(serde::Serialize)]
struct PrivateMeshJoinDesktopResult {
    ok: bool,
    error: Option<String>,
    output: String,
}

#[derive(serde::Serialize)]
struct PrivateMeshReleaseProofDesktopResult {
    ok: bool,
    target_node: String,
    target_ip: String,
    completed_at: Option<String>,
    evidence_root: Option<String>,
    route_evidence_path: Option<String>,
    route_evidence_sha256_path: Option<String>,
    route_evidence_sha256: Option<String>,
    route_evidence_integrity_verified: bool,
    route_evidence_integrity_error: Option<String>,
    route_transport_verified: bool,
    route_transport_error: Option<String>,
    verification_path: Option<String>,
    verification_sha256_path: Option<String>,
    verification_sha256: Option<String>,
    integrity_verified: bool,
    integrity_error: Option<String>,
    peer_identity: Option<serde_json::Value>,
    release_identity_bound: bool,
    peer_identity_error: Option<String>,
    physical_peer_evidence_path: Option<String>,
    physical_peer_evidence_sha256_path: Option<String>,
    physical_peer_evidence_sha256: Option<String>,
    physical_peer_verified: bool,
    physical_peer_error: Option<String>,
    software_route_trusted: bool,
    release_evidence_trusted: bool,
    bundle_manifest_path: Option<String>,
    bundle_manifest_sha256_path: Option<String>,
    bundle_manifest_ok: bool,
    bundle_manifest_fail_count: Option<usize>,
    bundle_manifest_error: Option<String>,
    archive_dir: Option<String>,
    archive_manifest_path: Option<String>,
    archive_manifest_sha256_path: Option<String>,
    archive_artifact_count: Option<usize>,
    archive_verifier_ok: bool,
    archive_verifier_schema: Option<String>,
    archive_verifier_fail_count: Option<usize>,
    archive_verifier_kind: Option<String>,
    archive_verifier_error: Option<String>,
    archive_error: Option<String>,
    desktop_runtime_kind: Option<String>,
    desktop_runtime_packaged: bool,
    desktop_runtime_exe_path: Option<String>,
    desktop_runtime_exe_sha256: Option<String>,
    expected_control_server_url: Option<String>,
    error: Option<String>,
    output: String,
}

#[derive(serde::Serialize, Clone)]
struct PhysicalPeerEvidenceDesktopResult {
    ok: bool,
    path: String,
    schema: Option<String>,
    node_name: Option<String>,
    tailnet_ip: Option<String>,
    control_server_url: Option<String>,
    hostname: Option<String>,
    os: Option<String>,
    arch: Option<String>,
    source_hostname: Option<String>,
    physical_host_distinct: bool,
    control_server_verified: bool,
    physical_peer_verified: bool,
    generated_at: Option<String>,
    sha256_path: Option<String>,
    sha256: Option<String>,
    integrity_verified: bool,
    error: Option<String>,
}

/// V28 Phase 1 — what `submit_order` returns so the cockpit can TRACK the order
/// instead of fire-and-forget. `task_id` is parsed from `musu route`'s
/// `✓ Task queued: <id>` line; the cockpit then polls `get_order_status(task_id)`.
#[derive(serde::Serialize)]
struct OrderResult {
    ok: bool,
    message: String,
    /// None when the route output didn't carry a task id (e.g. rejected).
    task_id: Option<String>,
}

/// V28 Phase 1 — one task's live state for the cockpit's task feed. Mirrors the
/// bridge `GET /api/tasks/:id` envelope. `artifact_path` is a Phase-2 field
/// (always None until the schema carries it) so the JSON shape is stable now.
#[derive(serde::Serialize)]
struct TaskStatus {
    task_id: String,
    /// pending | running | done | failed | cancelled | not_found | unknown
    status: String,
    output: Option<String>,
    error: Option<String>,
    exit_code: Option<i64>,
    duration_sec: Option<f64>,
    artifact_path: Option<String>,
    route_proof: Option<serde_json::Value>,
}

const DOCTOR_STATUS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const PRIVATE_MESH_DOCTOR_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(25);
const RELEASE_PROOF_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(150);
const ADD_PC_BOOTSTRAP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(25);
const ADD_PC_CREATE_JOIN_KEY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const ADD_PC_START_CONTROL_HOST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(180);
// `mesh join` runs `tailscale up` + a control-server /health re-check; give the
// handshake the same headroom as create-join-key.
const ADD_PC_JOIN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
// U-B: complete uninstall runs `musu uninstall --deregister --purge` which does
// mesh-leave (`tailscale down`), token delete, supervisor stop, and a recursive
// directory removal. Give it real headroom — it should never time out under
// normal operation, but a stuck `tailscale down` must not wedge the cockpit.
const COMPLETE_UNINSTALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(180);
// U-B: the typed confirmation the cockpit UI requires before self-removal. The
// handler re-checks this server-side so a tampered/replayed IPC call without the
// exact string is refused regardless of what the UI did.
const COMPLETE_UNINSTALL_CONFIRM: &str = "REMOVE MUSU";
// U-B: filename of the LOCAL elevated self-removal helper shipped alongside the
// app. Run elevated to Remove-AppxPackage (the CLI can't remove its own
// package), untrust the cert, and clean %TEMP%. We launch the on-disk script —
// never download+execute remote code. STATIC constant. Windows-only (the
// package-removal path does not exist off Windows).
#[cfg(windows)]
const UNINSTALL_HELPER_SCRIPT: &str = "Uninstall-MUSU.ps1";
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
    version: String,
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
        version: env!("CARGO_PKG_VERSION").to_string(),
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
        .map_err(|err| {
            format!(
                "failed to spawn {} login --desktop: {err}",
                command.display()
            )
        })
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
    bridge_token(home).is_some()
}

fn bridge_token(home: &std::path::Path) -> Option<String> {
    if let Ok(token) = std::env::var("MUSU_BRIDGE_TOKEN") {
        let token = token.trim().to_string();
        if !token.is_empty() {
            return Some(token);
        }
    }
    let Ok(body) = std::fs::read_to_string(home.join("bridge.env")) else {
        return None;
    };
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        if let Some(rest) = line.strip_prefix("MUSU_BRIDGE_TOKEN=") {
            let token = rest.trim_matches(|c| c == '"' || c == '\'').to_string();
            if !token.is_empty() {
                return Some(token);
            }
        }
    }
    None
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
    status_error: Option<String>,
    public_url: String,
    is_this_pc: bool,
    /// Direct-probe health from the bridge `/api/fleet/status` shape (F-3).
    healthy: bool,
    /// `"direct"` | `"relay"` | `None` — how the node is reachable. A relay node
    /// has `healthy == false` but `reachable_via == Some("relay")`, which the
    /// cockpit renders as a distinct "relay" state (yellow) rather than offline.
    reachable_via: Option<String>,
    tailscale_ip: Option<String>,
    mesh_mode: Option<String>,
    route_label: Option<String>,
    control_server_url: Option<String>,
    control_server_verified: bool,
}

#[tauri::command]
fn private_mesh_status() -> Result<PrivateMeshDesktopStatus, String> {
    run_private_mesh_desktop_report("status", "Run `musu mesh doctor --json` for details.")
}

#[tauri::command]
fn private_mesh_doctor() -> Result<PrivateMeshDesktopStatus, String> {
    run_private_mesh_desktop_report(
        "doctor",
        "Check the command output below, then re-run the local mesh check.",
    )
}

#[tauri::command]
fn private_mesh_verify_target(target_ip: String) -> Result<PrivateMeshVerifyDesktopResult, String> {
    let target_ip = target_ip.trim().to_string();
    if !is_tailnet_ipv4(&target_ip) {
        return Err("target_ip must be an IPv4 address in 100.64.0.0/10".to_string());
    }

    let command = musu_command_path();
    let result = run_command_with_timeout(
        &command,
        &["mesh", "verify", "--target-ip", &target_ip, "--json"],
        DOCTOR_STATUS_TIMEOUT,
    )
    .map_err(|err| {
        format!(
            "failed to run {} mesh verify --target-ip {target_ip} --json: {err}",
            command.display()
        )
    })?;
    if result.timed_out {
        return Err(format!(
            "{} mesh verify --target-ip {target_ip} --json timed out",
            command.display()
        ));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    if !result.status_success {
        return Ok(PrivateMeshVerifyDesktopResult {
            ok: false,
            target_ip,
            ping_ok: false,
            bridge_health_ok: false,
            bridge_health_status: None,
            callback_verified: false,
            callback_tailnet_ip: None,
            target_callback_match: false,
            release_grade: false,
            next_steps: vec![
                "Check that the peer is online on MUSU Private Mesh, then run local check again."
                    .to_string(),
            ],
            error: Some(combined.clone()),
            output: combined,
        });
    }

    parse_private_mesh_verify_result(&target_ip, &combined)
}

/// `private_mesh_bootstrap` — generate the self-hosted Private Mesh control-plane
/// bundle (Headscale + Caddy HTTPS + embedded DERP) from the cockpit, so adding
/// a PC starts with a button instead of a copied CLI command. Proxies
/// `musu mesh bootstrap --server-url <url> --json` and projects its report into
/// a desktop-friendly result the Add PC panel renders.
#[tauri::command]
fn private_mesh_bootstrap(
    server_url: String,
) -> Result<PrivateMeshBootstrapDesktopResult, String> {
    let server_url = server_url.trim().to_string();
    // Minimal validation so the cockpit never shells out a malformed URL.
    if !(server_url.starts_with("https://") || server_url.starts_with("http://")) {
        return Err("server_url must start with https:// (or http:// for a local test mesh)".to_string());
    }
    if server_url.contains(char::is_whitespace) {
        return Err("server_url must not contain whitespace".to_string());
    }

    let command = musu_command_path();
    let result = run_command_with_timeout(
        &command,
        &["mesh", "bootstrap", "--server-url", &server_url, "--json"],
        ADD_PC_BOOTSTRAP_TIMEOUT,
    )
    .map_err(|err| {
        format!(
            "failed to run {} mesh bootstrap --server-url {server_url} --json: {err}",
            command.display()
        )
    })?;
    if result.timed_out {
        return Err(format!(
            "{} mesh bootstrap --server-url {server_url} --json timed out",
            command.display()
        ));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    if !result.status_success {
        return Ok(PrivateMeshBootstrapDesktopResult {
            ok: false,
            server_url,
            output_dir: String::new(),
            tailnet_name: String::new(),
            generated_files: vec![],
            next_commands: vec![],
            error: Some(combined.clone()),
            output: combined,
        });
    }

    // Parse the PrivateMeshBootstrapReport JSON the CLI emitted on stdout.
    let report: serde_json::Value = serde_json::from_str(result.stdout.trim())
        .map_err(|err| format!("failed to parse `musu mesh bootstrap --json` output: {err}"))?;
    let str_field = |key: &str| {
        report
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let str_list = |key: &str| {
        report
            .get(key)
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };

    Ok(PrivateMeshBootstrapDesktopResult {
        ok: true,
        server_url: str_field("server_url"),
        output_dir: str_field("output_dir"),
        tailnet_name: str_field("tailnet_name"),
        generated_files: str_list("generated_files"),
        next_commands: str_list("commands"),
        error: None,
        output: combined,
    })
}

/// `private_mesh_create_join_key` — mint a one-use device-add pass from the
/// cockpit. Proxies `musu mesh create-join-key --json`, which runs the bundle's
/// helper against the running Headscale control plane and returns the pass file
/// to copy to the new PC. Adding a machine is now a button, not a copied script.
#[tauri::command]
fn private_mesh_create_join_key() -> Result<PrivateMeshCreateJoinKeyDesktopResult, String> {
    let command = musu_command_path();
    // Minting a key talks to Headscale through a generated helper; the CLI has
    // its own 45s helper timeout, so the desktop parent gets a little headroom.
    let result = run_command_with_timeout(
        &command,
        &["mesh", "create-join-key", "--json"],
        ADD_PC_CREATE_JOIN_KEY_TIMEOUT,
    )
    .map_err(|err| {
        format!(
            "failed to run {} mesh create-join-key --json: {err}",
            command.display()
        )
    })?;
    if result.timed_out {
        return Err(format!(
            "{} mesh create-join-key --json timed out",
            command.display()
        ));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    if !result.status_success {
        return Ok(PrivateMeshCreateJoinKeyDesktopResult {
            ok: false,
            pass_path: String::new(),
            login_server: String::new(),
            tailnet: String::new(),
            expires_after_seconds: 0,
            join_command: String::new(),
            error: Some(combined.clone()),
            output: combined,
        });
    }

    let report: serde_json::Value = serde_json::from_str(result.stdout.trim())
        .map_err(|err| format!("failed to parse `musu mesh create-join-key --json` output: {err}"))?;
    let str_field = |key: &str| {
        report
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    Ok(PrivateMeshCreateJoinKeyDesktopResult {
        ok: true,
        pass_path: str_field("pass_path"),
        login_server: str_field("login_server"),
        tailnet: str_field("tailnet"),
        expires_after_seconds: report
            .get("expires_after_seconds")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        join_command: str_field("join_command"),
        error: None,
        output: combined,
    })
}

/// `private_mesh_start_control_host` — bring the control-plane bundle online from
/// the cockpit (docker compose up + Headscale health). Proxies
/// `musu mesh start-control-host --json` so step 2 of Add PC is a button, not a
/// copied docker command.
#[tauri::command]
fn private_mesh_start_control_host() -> Result<PrivateMeshStartControlHostDesktopResult, String> {
    let command = musu_command_path();
    // `docker compose up -d` plus image pulls and a health-retry loop can exceed
    // a minute on a cold host; keep the desktop wrapper above the CLI's bounded
    // docker steps so it can return the real stage/error.
    let result = run_command_with_timeout(
        &command,
        &["mesh", "start-control-host", "--json"],
        ADD_PC_START_CONTROL_HOST_TIMEOUT,
    )
    .map_err(|err| {
        format!(
            "failed to run {} mesh start-control-host --json: {err}",
            command.display()
        )
    })?;
    if result.timed_out {
        return Err(format!(
            "{} mesh start-control-host --json timed out (docker compose may still be pulling the image)",
            command.display()
        ));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    if !result.status_success {
        return Ok(PrivateMeshStartControlHostDesktopResult {
            ok: false,
            stage: "error".to_string(),
            error: Some(combined.clone()),
            output: combined,
        });
    }

    let report: serde_json::Value = serde_json::from_str(result.stdout.trim())
        .map_err(|err| format!("failed to parse `musu mesh start-control-host --json` output: {err}"))?;
    let ok = report.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
    Ok(PrivateMeshStartControlHostDesktopResult {
        ok,
        stage: report
            .get("stage")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        error: report
            .get("error")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        output: combined,
    })
}

/// `private_mesh_join` — join THIS machine to a MUSU Private Mesh from the
/// cockpit, using the device-add pass file copied from the control host.
/// Proxies `musu mesh join --device-add-pass <path> --json` so a new PC joins
/// the fleet from a button, not a typed command. The pass file path must be a
/// real, readable path (the pass carries the secret; we never inline it).
#[tauri::command]
fn private_mesh_join(pass_path: String) -> Result<PrivateMeshJoinDesktopResult, String> {
    let pass_path = pass_path.trim().to_string();
    if pass_path.is_empty() {
        return Err("Paste the path to the device-add pass file copied from the control host.".to_string());
    }
    if !std::path::Path::new(&pass_path).is_file() {
        return Ok(PrivateMeshJoinDesktopResult {
            ok: false,
            error: Some(format!(
                "No file at {pass_path}. Copy the musu.device_add.v1.json from the control host first."
            )),
            output: String::new(),
        });
    }

    let command = musu_command_path();
    // join runs `tailscale up` and re-checks the control server /health; allow
    // generous time for the handshake.
    let result = run_command_with_timeout(
        &command,
        &["mesh", "join", "--device-add-pass", &pass_path, "--json"],
        ADD_PC_JOIN_TIMEOUT,
    )
    .map_err(|err| {
        format!(
            "failed to run {} mesh join --device-add-pass: {err}",
            command.display()
        )
    })?;
    if result.timed_out {
        return Err(format!(
            "{} mesh join timed out (control server handshake)",
            command.display()
        ));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    Ok(PrivateMeshJoinDesktopResult {
        ok: result.status_success,
        error: if result.status_success { None } else { Some(combined.clone()) },
        output: combined,
    })
}

/// `private_mesh_join_account` — join THIS machine to its account's mesh with
/// no device-add pass. Proxies `musu mesh join-account --json`, which fetches a
/// one-time preauth key for the logged-in account from the cloud and runs the
/// join. This is the cockpit's "Reconnect to mesh" action and the retry target
/// when the machine is logged in (account token present) but not yet on the
/// mesh. Login itself already triggers this automatically; the button covers
/// retry/recovery.
#[tauri::command]
fn private_mesh_join_account() -> Result<PrivateMeshJoinDesktopResult, String> {
    let command = musu_command_path();
    // join-account fetches a key then runs `tailscale up` + control /health
    // re-check; allow the same headroom as the pass-based join.
    let result = run_command_with_timeout(
        &command,
        &["mesh", "join-account", "--json"],
        ADD_PC_JOIN_TIMEOUT,
    )
    .map_err(|err| {
        format!(
            "failed to run {} mesh join-account: {err}",
            command.display()
        )
    })?;
    if result.timed_out {
        return Err(format!(
            "{} mesh join-account timed out (control server handshake)",
            command.display()
        ));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    Ok(PrivateMeshJoinDesktopResult {
        ok: result.status_success,
        error: if result.status_success { None } else { Some(combined.clone()) },
        output: combined,
    })
}

/// `private_mesh_leave` — disconnect THIS machine from the mesh (`tailscale down`)
/// via `musu mesh leave --json`. Distinct from `account_logout` (cloud sign-out):
/// leave never touches the account token, and it only runs `down` when the active
/// tailnet is provably ours (a personal tailnet is preserved). The cockpit's
/// "Disconnect this machine" button lives separately from Sign out.
#[tauri::command]
fn private_mesh_leave() -> Result<PrivateMeshJoinDesktopResult, String> {
    let command = musu_command_path();
    let result = run_command_with_timeout(&command, &["mesh", "leave", "--json"], ADD_PC_JOIN_TIMEOUT)
        .map_err(|err| format!("failed to run {} mesh leave: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!("{} mesh leave timed out", command.display()));
    }
    let combined = combine_command_output(&result.stdout, &result.stderr);
    Ok(PrivateMeshJoinDesktopResult {
        ok: result.status_success,
        error: if result.status_success { None } else { Some(combined.clone()) },
        output: combined,
    })
}

/// `mesh_node_list` — the account's fleet nodes (id+name+ips+online) as JSON,
/// via `musu mesh node list --json`. The cockpit parses `output` to drive the
/// rename picker (resolve→confirm-by-id: the id here is what rename keys on).
#[tauri::command]
fn mesh_node_list() -> Result<PrivateMeshJoinDesktopResult, String> {
    let command = musu_command_path();
    let result = run_command_with_timeout(&command, &["mesh", "node", "list", "--json"], ADD_PC_JOIN_TIMEOUT)
        .map_err(|err| format!("failed to run {} mesh node list: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!("{} mesh node list timed out", command.display()));
    }
    let combined = combine_command_output(&result.stdout, &result.stderr);
    Ok(PrivateMeshJoinDesktopResult {
        ok: result.status_success,
        error: if result.status_success { None } else { Some(combined.clone()) },
        output: combined,
    })
}

/// `mesh_node_rename` — rename a fleet node BY ID via `musu mesh node rename`.
/// The server re-asserts the node still belongs to this account before renaming
/// (never re-resolves by name/IP — WS-2c Critic HIGH-1/HIGH-2).
#[tauri::command]
fn mesh_node_rename(node_id: String, new_name: String) -> Result<PrivateMeshJoinDesktopResult, String> {
    let command = musu_command_path();
    let result = run_command_with_timeout(
        &command,
        &["mesh", "node", "rename", "--node-id", &node_id, "--new-name", &new_name, "--json"],
        ADD_PC_JOIN_TIMEOUT,
    )
    .map_err(|err| format!("failed to run {} mesh node rename: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!("{} mesh node rename timed out", command.display()));
    }
    let combined = combine_command_output(&result.stdout, &result.stderr);
    Ok(PrivateMeshJoinDesktopResult {
        ok: result.status_success,
        error: if result.status_success { None } else { Some(combined.clone()) },
        output: combined,
    })
}

/// `mesh_node_remove` — ONE-WAY evict a fleet node via `musu mesh node remove`.
/// The server refuses to remove this machine itself (caller_ip) and requires the
/// confirmed name to still match (WS-2c Phase 2, Critic HIGH-3 + optimistic
/// concurrency). caller_ip is the cockpit's own tailnet IP when known.
#[tauri::command]
fn mesh_node_remove(
    node_id: String,
    expected_name: String,
    caller_ip: Option<String>,
) -> Result<PrivateMeshJoinDesktopResult, String> {
    let command = musu_command_path();
    let mut args: Vec<String> = vec![
        "mesh".into(),
        "node".into(),
        "remove".into(),
        "--node-id".into(),
        node_id,
        "--expected-name".into(),
        expected_name,
    ];
    if let Some(ip) = caller_ip.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        args.push("--caller-ip".into());
        args.push(ip.to_string());
    }
    args.push("--json".into());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let result = run_command_with_timeout(&command, &arg_refs, ADD_PC_JOIN_TIMEOUT)
        .map_err(|err| format!("failed to run {} mesh node remove: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!("{} mesh node remove timed out", command.display()));
    }
    let combined = combine_command_output(&result.stdout, &result.stderr);
    Ok(PrivateMeshJoinDesktopResult {
        ok: result.status_success,
        error: if result.status_success { None } else { Some(combined.clone()) },
        output: combined,
    })
}

/// `complete_uninstall` — U-B: the cockpit "완전 제거 (Uninstall MUSU)" button.
/// ONE-WAY, fully destructive removal of THIS machine's MUSU install:
///
///  1. Runs the local CLI uninstall (`musu uninstall --deregister --purge …`)
///     which detaches this machine from the account (mesh leave + logout) WHILE
///     the network/token still exist, stops the bridge, and deletes `~/.musu`.
///  2. Spawns a DETACHED + ELEVATED PowerShell helper to do the parts the CLI
///     can't do to itself — `Remove-AppxPackage` (a process cannot remove the
///     package it is running from), untrust the signing cert, clean `%TEMP%` —
///     and then close the app window.
///  3. Returns immediately; the window closes as the helper proceeds.
///
/// SECURITY (Critic): the elevated child is built from STATIC arguments plus the
/// resolved on-disk script PATH only. The user-supplied `confirm` is validated
/// here and then DISCARDED — it is never interpolated into any command line.
/// `--i-have-a-backup` is passed to the CLI deliberately: the UI's typed
/// confirmation IS the operator backup acknowledgement, so this is NOT a
/// regression of the QB5 same-day-data gate (the gate exists to stop
/// *un-acknowledged* auto-pilot deletes; here the human typed the exact
/// destructive phrase).
#[tauri::command]
fn complete_uninstall(
    app: tauri::AppHandle,
    confirm: String,
) -> Result<PrivateMeshJoinDesktopResult, String> {
    // 1. Server-side re-validation of the typed confirmation. The UI gates on
    //    this too, but never trust the renderer: a replayed/tampered IPC call
    //    without the exact phrase is refused.
    if confirm.trim() != COMPLETE_UNINSTALL_CONFIRM {
        return Err(format!(
            "complete_uninstall refused: confirmation must be exactly '{COMPLETE_UNINSTALL_CONFIRM}'."
        ));
    }

    // 2. Local CLI uninstall (deregister + purge). All args STATIC — the typed
    //    `confirm` is intentionally NOT forwarded. `--i-have-a-backup` is the
    //    UI typed-confirm standing in for the backup ack (see doc above).
    let command = musu_command_path();
    let cli_args = [
        "uninstall",
        "--deregister",
        "--purge",
        "--i-understand-this-deletes-data",
        "--i-have-a-backup",
        "--json",
    ];
    let result = run_command_with_timeout(&command, &cli_args, COMPLETE_UNINSTALL_TIMEOUT)
        .map_err(|err| format!("failed to run {} uninstall: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!("{} uninstall timed out", command.display()));
    }
    let combined = combine_command_output(&result.stdout, &result.stderr);
    if !result.status_success {
        // The CLI refused (e.g., the purge gate) — do NOT proceed to the
        // irreversible package removal. Surface the reason.
        return Err(format!("uninstall failed: {}", combined.trim()));
    }

    // 3. Hand the package-level removal to a detached, elevated helper, then
    //    close the app. If spawning the helper fails we still succeeded at the
    //    local data removal — report that the package must be removed by hand.
    let helper_spawned = spawn_elevated_uninstall_helper();

    // Schedule the app exit slightly after returning so the renderer gets the
    // result first and can show "removal in progress". Exit is unconditional —
    // the local runtime data is already gone; staying open would be confusing.
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1200));
        handle.exit(0);
    });

    let output = if let Err(e) = helper_spawned {
        format!(
            "{combined}\n\nLocal data removed. Could not auto-launch the elevated package-removal \
             helper ({e}). Finish by running Uninstall-MUSU.ps1 as Administrator, or remove the \
             'MUSU' app from Windows Settings → Apps."
        )
    } else {
        format!("{combined}\n\nRemoval in progress; this window will close.")
    };

    Ok(PrivateMeshJoinDesktopResult {
        ok: true,
        error: None,
        output,
    })
}

/// U-B: resolve the on-disk `Uninstall-MUSU.ps1` helper shipped with the app.
/// Looks next to the current executable (and a `scripts/windows` sibling for
/// dev/source layouts). Returns the first existing path. We only ever launch a
/// LOCAL script — never download+execute remote code.
#[cfg(windows)]
fn resolve_uninstall_helper_script() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    // Production resolution is restricted to dirs that sit beside the installed
    // exe (system-protected under MSIX WindowsApps). The helper runs ELEVATED, so
    // we must never resolve it from a user-writable location in a shipped build —
    // a planted Uninstall-MUSU.ps1 would otherwise execute with admin rights
    // (dual-audit security MEDIUM, 2026-06-23).
    let mut candidates = vec![
        dir.join(UNINSTALL_HELPER_SCRIPT),
        dir.join("scripts").join("windows").join(UNINSTALL_HELPER_SCRIPT),
    ];
    // dev/source tree only: musu-bee/src-tauri/target/<profile>/<exe> →
    // repo-root/scripts/windows. Gated to debug builds so the user-writable
    // target/ dir is never an elevated-script source in a release MSIX.
    #[cfg(debug_assertions)]
    candidates.push(
        dir.join("..").join("..").join("..").join("..").join("scripts").join("windows").join(UNINSTALL_HELPER_SCRIPT),
    );
    candidates.into_iter().find(|p| p.exists())
}

/// U-B: spawn the elevated, detached PowerShell helper that performs the
/// package-level removal the CLI cannot do to itself. Mirrors Install-MUSU.ps1's
/// `Start-Process powershell -Verb RunAs` self-elevation, but launches the LOCAL
/// on-disk `Uninstall-MUSU.ps1` (`-File`), never remote code.
///
/// CRITICAL (Critic, no-injection guarantee): every argument is either a STATIC
/// compile-time constant or the resolved on-disk script PATH. No user input —
/// not the typed `confirm`, not any fleet/account string — is ever placed on
/// this command line. The script path is passed as a discrete `-ArgumentList`
/// element (PowerShell array), not string-concatenated, so a path with spaces
/// cannot break argument boundaries.
#[cfg(windows)]
fn spawn_elevated_uninstall_helper() -> Result<(), String> {
    let script = resolve_uninstall_helper_script()
        .ok_or_else(|| format!("could not locate {UNINSTALL_HELPER_SCRIPT} next to the app"))?;
    let script_str = script.to_string_lossy().to_string();

    // Outer (current-rights) shell: Start-Process the elevated child detached.
    // The elevated child runs the LOCAL script via -File with -Force (the
    // cockpit already collected the typed confirmation). Build the -ArgumentList
    // as a PowerShell array; the script path is a single-quoted literal element.
    // single-quote escaping: PowerShell escapes a literal ' by doubling it.
    let script_lit = script_str.replace('\'', "''");
    let outer = format!(
        "Start-Process -FilePath 'powershell' -Verb RunAs -ArgumentList @('-ExecutionPolicy','Bypass','-NoProfile','-File','{script_lit}','-Force')"
    );

    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &outer])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    no_window(&mut cmd)
        .spawn()
        .map(|_child| ())
        .map_err(|err| format!("spawn elevated uninstall helper: {err}"))
}

/// Non-Windows: the MSIX/Store package-removal path does not apply. The CLI
/// `--purge` already removed the local data; there is no package to evict.
#[cfg(not(windows))]
fn spawn_elevated_uninstall_helper() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn private_mesh_release_proof_target(
    target_node: String,
    target_ip: String,
    expected_control_server_url: String,
    physical_peer_evidence_path: Option<String>,
) -> Result<PrivateMeshReleaseProofDesktopResult, String> {
    let target_node = target_node.trim().to_string();
    let target_ip = target_ip.trim().to_string();
    let expected_control_server_url = expected_control_server_url.trim().to_string();
    if target_node.is_empty() {
        return Err("target_node is empty".to_string());
    }
    if !is_tailnet_ipv4(&target_ip) {
        return Err("target_ip must be an IPv4 address in 100.64.0.0/10".to_string());
    }
    if expected_control_server_url.is_empty() {
        return Err("expected_control_server_url is empty".to_string());
    }
    let physical_peer_evidence_path = physical_peer_evidence_path
        .unwrap_or_default()
        .trim()
        .to_string();

    let command = musu_command_path();
    let args = release_proof_command_args(
        &target_node,
        &target_ip,
        &expected_control_server_url,
        physical_peer_evidence_path.as_str(),
    );
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let result = run_command_with_timeout(
        &command,
        &arg_refs,
        RELEASE_PROOF_TIMEOUT,
    )
    .map_err(|err| {
        format!(
            "failed to run {} mesh release-proof --target-node {target_node} --target-ip {target_ip} --json: {err}",
            command.display()
        )
    })?;
    if result.timed_out {
        return Err(format!(
            "{} mesh release-proof --target-node {target_node} --target-ip {target_ip} --json timed out",
            command.display()
        ));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    let parse_text = if result.stdout.trim().is_empty() {
        combined.as_str()
    } else {
        result.stdout.as_str()
    };
    let mut parsed = parse_private_mesh_release_proof_result(
        &target_node,
        &target_ip,
        &expected_control_server_url,
        parse_text,
    )?;
    if !physical_peer_evidence_path.is_empty() {
        parsed.physical_peer_evidence_path = Some(physical_peer_evidence_path.clone());
    }
    attach_release_evidence_integrity(&mut parsed, &musu_home());
    attach_route_evidence_integrity(&mut parsed, &musu_home());
    attach_release_peer_identity(&mut parsed, &musu_home());
    attach_desktop_runtime_identity(&mut parsed);
    parsed.output = combined.clone();
    if !result.status_success && parsed.ok {
        parsed.ok = false;
        parsed.error = Some(combined);
    }
    update_release_evidence_trust(&mut parsed);
    attach_or_create_release_bundle_manifest(
        &mut parsed,
        &musu_home(),
        Some(physical_peer_evidence_path.as_str()),
    );
    Ok(parsed)
}

fn release_proof_command_args(
    target_node: &str,
    target_ip: &str,
    expected_control_server_url: &str,
    physical_peer_evidence_path: &str,
) -> Vec<String> {
    let mut args = vec![
        "mesh".to_string(),
        "release-proof".to_string(),
        "--target-node".to_string(),
        target_node.to_string(),
        "--target-ip".to_string(),
        target_ip.to_string(),
        "--expected-control-server-url".to_string(),
        expected_control_server_url.to_string(),
    ];
    let physical_peer_evidence_path = physical_peer_evidence_path.trim();
    if !physical_peer_evidence_path.is_empty() {
        args.push("--physical-peer-evidence".to_string());
        args.push(physical_peer_evidence_path.to_string());
    }
    args.push("--json".to_string());
    args
}

#[tauri::command]
fn latest_release_evidence() -> Result<Option<PrivateMeshReleaseProofDesktopResult>, String> {
    latest_release_evidence_from_home(&musu_home())
}

#[tauri::command]
fn latest_physical_peer_evidence() -> Result<Option<PhysicalPeerEvidenceDesktopResult>, String> {
    latest_physical_peer_evidence_from_home(&musu_home())
}

#[tauri::command]
fn validate_physical_peer_evidence_path(
    path: String,
) -> Result<PhysicalPeerEvidenceDesktopResult, String> {
    Ok(read_physical_peer_evidence_summary(
        &std::path::PathBuf::from(path),
    ))
}

#[tauri::command]
fn open_dashboard() -> Result<CommandResult, String> {
    let probe = probe_dashboard();
    let Some(url) = probe.url else {
        return Ok(CommandResult {
            ok: false,
            message: "dashboard is not available".to_string(),
            output: probe.detail,
        });
    };

    let mut command = if cfg!(target_os = "windows") {
        let mut command = std::process::Command::new("cmd");
        command.arg("/C").arg("start").arg("").arg(&url);
        command
    } else if cfg!(target_os = "macos") {
        let mut command = std::process::Command::new("open");
        command.arg(&url);
        command
    } else {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(&url);
        command
    };

    no_window(&mut command)
        .spawn()
        .map_err(|err| format!("failed to open dashboard: {err}"))?;
    Ok(CommandResult {
        ok: true,
        message: "dashboard opened".to_string(),
        output: url,
    })
}

/// Open an external URL in the user's default browser (the cockpit's Help/docs
/// link). Same OS dispatch as `open_dashboard`, but the URL comes from the shell,
/// so it is validated strictly: only absolute https:// URLs are allowed. This
/// prevents shelling out a malformed or non-web URL (e.g. `file:`, `cmd`, args
/// with spaces/quotes) via the `start` shell built-in.
#[tauri::command]
fn open_external_url(url: String) -> Result<CommandResult, String> {
    let url = url.trim();
    // Strict allowlist: a plain https URL with no shell-meaningful chars. `%` is
    // blocked too because the Windows path routes through `cmd /C start`, which
    // expands `%VAR%` on its command line before launching (an info-leak / URL-
    // rewrite vector that Rust's arg-quoting can't escape). This also rejects
    // percent-encoded URLs (%20 etc.) — fine for a fixed docs/help link; if a
    // caller ever needs percent-encoding, switch the Windows path off `cmd`
    // (ShellExecuteW / opener crate) instead of relaxing this.
    let valid = url.starts_with("https://")
        && url.len() <= 2048
        && !url.contains(|c: char| c.is_control() || c == '"' || c == '\'' || c == ' ' || c == '&' || c == '|' || c == '^' || c == '<' || c == '>' || c == '%');
    if !valid {
        return Err("refusing to open a non-https or malformed URL".to_string());
    }
    let url = url.to_string();

    let mut command = if cfg!(target_os = "windows") {
        let mut command = std::process::Command::new("cmd");
        command.arg("/C").arg("start").arg("").arg(&url);
        command
    } else if cfg!(target_os = "macos") {
        let mut command = std::process::Command::new("open");
        command.arg(&url);
        command
    } else {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(&url);
        command
    };

    no_window(&mut command)
        .spawn()
        .map_err(|err| format!("failed to open url: {err}"))?;
    Ok(CommandResult {
        ok: true,
        message: "url opened".to_string(),
        output: url,
    })
}

/// `check_for_updates` — apply the hosted update now, protocol-free. Spawns a
/// detached PowerShell helper (download the hosted .msix, wait for every package
/// process to exit, Add-AppxPackage per-user, relaunch by AUMID), then exits the
/// cockpit so its files free up for the install. The cockpit's "Check for
/// updates" button (Settings → About) and tray menu call this. Returns once the
/// helper is spawned; the install + relaunch happen in that detached process.
/// (We do NOT use the ms-appinstaller: protocol — Windows disables it by default
/// — nor in-process Add-AppxPackage — 0x80073D02 on the running package.)
#[tauri::command]
fn check_for_updates(app: tauri::AppHandle) -> Result<CommandResult, String> {
    // Windows-only update channel (MSIX). On other OSes there's nothing to do.
    if !cfg!(target_os = "windows") {
        return Ok(CommandResult {
            ok: false,
            message: "updates are managed by the OS package manager on this platform".to_string(),
            output: String::new(),
        });
    }

    // Protocol-free self-update. Two dead ends ruled this design:
    //   1. `Add-AppxPackage` from THIS process → 0x80073D02 ("resource in use"):
    //      the cockpit is its own running package and can't replace its own files.
    //   2. `ms-appinstaller:?source=` protocol → Windows disables it by default
    //      (2022 MSRC malware hardening): "ms-appinstaller protocol disabled".
    // Both confirmed on a live install. The fix: spawn a DETACHED PowerShell
    // helper that outlives this process, then exit the cockpit so its files free
    // up. The helper waits for the cockpit PID to die, downloads the .msix,
    // installs it per-user (no elevation — the cert is already trusted from first
    // install), and relaunches via the shell AUMID (so the app lands in the user
    // session, not an elevated one). Mirrors spawn_musu_startup_open's detached
    // pattern + Install-MUSU.ps1's AUMID relaunch.
    let pid = std::process::id();
    let helper = update_helper_script(pid);

    let mut cmd = std::process::Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &helper,
    ])
    .stdin(std::process::Stdio::null())
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::null());
    no_window(&mut cmd)
        .spawn()
        .map_err(|err| format!("failed to spawn update helper: {err}"))?;

    // Release our package files so the detached helper's Add-AppxPackage can
    // replace them. The helper is already waiting on our PID. Give the spawn a
    // beat to register, then exit; the helper relaunches us at the new version.
    std::thread::sleep(std::time::Duration::from_millis(600));
    app.exit(0);

    Ok(CommandResult {
        ok: true,
        message: "downloading and applying the update; the app will restart".to_string(),
        output: DESKTOP_MSIX_URL.to_string(),
    })
}

/// Build the detached PowerShell self-update script. Steps, in order:
///   1. Transcript-log to %TEMP%\musu-update.log so a failed update leaves a
///      diagnosable breadcrumb (audit finding E: never fail silently).
///   2. Resolve the CURRENTLY-installed AUMID *before* touching anything, so the
///      `finally` block can ALWAYS relaunch MUSU — the new version on success,
///      the still-installed old version on any failure. The cockpit has already
///      exited; this guarantees the user is never left with the app vanished.
///   3. Wait for the cockpit (PID `cockpit_pid`) to exit — bounded 30s — THEN
///      poll/kill every remaining package process (musu-desktop + the musu
///      bridge). Waiting on the cockpit PID alone is insufficient: the bridge
///      also holds the packaged files, so Add-AppxPackage hits 0x80073D02 until
///      ALL of them are gone (found in live rc.15→rc.16 toast test — the helper
///      relaunched but the install silently failed on the still-running bridge).
///   4. Download the hosted .msix (bounded 120s) to a temp file.
///   5. `Add-AppxPackage` (per-user, unelevated — cert already trusted). NO
///      `-ForceUpdateFromAnyVersion` (audit finding B: that defeats Windows'
///      monotonic-version guard → downgrade vector); plain install still updates
///      forward and refuses downgrades.
///   6. Relaunch via `explorer.exe shell:AppsFolder\<aumid>` (user session, not
///      elevated). Runs in `finally` so it fires on success AND failure.
/// Kept as a pure string builder (no spawn) so it is unit-testable.
fn update_helper_script(cockpit_pid: u32) -> String {
    // Single-quoted PS literals for the consts (URLs/identity have no quotes, so
    // they cannot break out of the literal — no injection surface).
    format!(
        "$ErrorActionPreference='Stop'; \
         $log = Join-Path $env:TEMP 'musu-update.log'; \
         Start-Transcript -Path $log -Force -ErrorAction SilentlyContinue | Out-Null; \
         $aumid = $null; \
         try {{ $p = Get-AppxPackage -Name '{identity}'; \
           if ($p) {{ $aumid = $p.PackageFamilyName + '!' + (Get-AppxPackageManifest $p).Package.Applications.Application.Id }} }} catch {{}} \
         try {{ \
           try {{ Wait-Process -Id {pid} -Timeout 30 -ErrorAction SilentlyContinue }} catch {{}} \
           for ($i=0; $i -lt 20; $i++) {{ \
             $alive = Get-Process -Name 'musu-desktop','musu','musud' -ErrorAction SilentlyContinue; \
             if (-not $alive) {{ break }}; \
             $alive | Stop-Process -Force -ErrorAction SilentlyContinue; \
             Start-Sleep -Milliseconds 500; \
           }} \
           $msix = Join-Path $env:TEMP 'musu-update.msix'; \
           Invoke-WebRequest -Uri '{msix_url}' -OutFile $msix -UseBasicParsing -TimeoutSec 120; \
           Add-AppxPackage -Path $msix; \
           Remove-Item $msix -ErrorAction SilentlyContinue; \
           $np = Get-AppxPackage -Name '{identity}'; \
           if ($np) {{ $aumid = $np.PackageFamilyName + '!' + (Get-AppxPackageManifest $np).Package.Applications.Application.Id }} \
         }} catch {{ Write-Output ('update failed: ' + $_.Exception.Message) }} \
         finally {{ \
           if ($aumid) {{ Start-Process 'explorer.exe' -ArgumentList ('shell:AppsFolder\\' + $aumid) }} \
           Stop-Transcript -ErrorAction SilentlyContinue | Out-Null; \
         }}",
        pid = cockpit_pid,
        msix_url = DESKTOP_MSIX_URL,
        identity = PACKAGE_IDENTITY_NAME,
    )
}

/// The in-app update probe result the cockpit toast (U-2) and settings surface
/// (U-3) consume. Mirrors the CommandResult/CockpitState shape (`ok` + `message`
/// for graceful failure, plus the typed fields the UI renders). All failures are
/// graceful: `ok:false, update_available:false` — never an Err that throws in JS.
#[derive(serde::Serialize)]
struct UpdateProbe {
    update_available: bool,
    current: String,
    available: Option<String>,
    ok: bool,
    message: String,
}

/// Port of `Normalize-Version` (scripts/windows/build-msix.ps1:149-184) into a
/// numeric 4-tuple `[major, minor, build, revision]`. MUST match the build's
/// normalization so the probe compares like-for-like against the hosted MSIX
/// version. Rules (ps1:156-182):
///   - strip build metadata after the first `+`
///   - split into core/prerelease on the first `-`
///   - core: dot-split; if 4 numeric segments, use them as-is; if 3, the 4th
///     octet carries the prerelease counter (the FIRST run of digits in the
///     prerelease tag, e.g. `rc.11` → 11, `beta3` → 3); no prerelease → 0
///   - any non-numeric core segment is treated as 0 (defensive; the build throws,
///     but the probe must never panic on a malformed hosted/embedded string)
/// Comparison is numeric per-octet — NEVER string compare ("1.15.0.9" >
/// "1.15.0.11" lexically is the trap H-1 calls out).
fn version_to_tuple(v: &str) -> [u64; 4] {
    let trimmed = v.trim();
    let without_meta = trimmed.split('+').next().unwrap_or("");
    let mut core_pre = without_meta.splitn(2, '-');
    let core = core_pre.next().unwrap_or("");
    let pre = core_pre.next().unwrap_or("");

    let mut octets = [0u64; 4];
    let mut count = 0usize;
    for (i, seg) in core.split('.').enumerate() {
        if i >= 4 {
            break;
        }
        octets[i] = seg.trim().parse::<u64>().unwrap_or(0);
        count = i + 1;
    }

    // 4 explicit core segments → already fully specified (ps1:175-178); leave the
    // parsed 4th octet. With exactly 3 core segments, fold the prerelease counter
    // into the 4th octet (ps1:179-182): the FIRST contiguous run of digits.
    if count == 3 {
        octets[3] = first_digit_run(pre);
    }
    octets
}

/// First contiguous run of ASCII digits in `s` as a number (`rc.11` → 11,
/// `beta3` → 3, `` / no digits → 0). Mirrors the ps1 `$pre -match "(\d+)"`
/// (build-msix.ps1:171-173) without a regex dep (H-2: no new crates).
fn first_digit_run(s: &str) -> u64 {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() && !bytes[i].is_ascii_digit() {
        i += 1;
    }
    let start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if start == i {
        0
    } else {
        s[start..i].parse::<u64>().unwrap_or(0)
    }
}

/// Update decision (H-1 + H-1b): compare as a numeric tuple, hosted must be
/// strictly GREATER than current for an update to be offered. If the 3-part CORE
/// (major.minor.build) differs, the core ordering decides — this is the rc→GA
/// backstop so a higher GA core surfaces regardless of the 4th octet (OS 24h is
/// the ultimate backstop). When cores are equal, compare the 4th octet.
///
/// The direction guard matters: without it, an installed canary (e.g. 1.16.0)
/// against a single `desktop-latest` channel still on stable (1.15.0) would show
/// a spurious "update available" DOWNGRADE toast (App Installer would refuse it,
/// but the prompt is misleading). Found in WS-U code audit 2026-06-24.
fn update_is_available(current: &str, hosted: &str) -> bool {
    let cur = version_to_tuple(current);
    let host = version_to_tuple(hosted);
    if cur[..3] != host[..3] {
        // Cores differ: the higher core wins. Only offer when hosted core > current.
        return host[..3] > cur[..3];
    }
    // Cores equal: compare the 4th octet (rc number) numerically.
    host[3] > cur[3]
}

/// Extract the ROOT `<AppInstaller Version="...">` attribute value from the
/// .appinstaller XML (M-4: the canonical update-decision authority, NOT the first
/// bare `Version=`). Anchors on the `<AppInstaller` element, then reads the
/// `Version="` attribute that follows it — plain string ops, no regex/xml crate.
fn parse_appinstaller_version(xml: &str) -> Option<String> {
    let elem = xml.find("<AppInstaller")?;
    let rest = &xml[elem..];
    // Stay within the AppInstaller start-tag so we don't pick up a nested
    // element's Version (e.g. <MainPackage Version=...>). The start tag ends at
    // the first '>'.
    let tag_end = rest.find('>').unwrap_or(rest.len());
    let tag = &rest[..tag_end];
    let key = "Version=\"";
    let key_at = tag.find(key)?;
    let after = &tag[key_at + key.len()..];
    let close = after.find('"')?;
    let value = after[..close].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

/// `probe_update` — in-app version probe (U-1). Reads the hosted .appinstaller
/// over HTTP via PowerShell `Invoke-RestMethod` (mirrors the existing
/// `check_for_updates` PowerShell idiom, lib.rs apply path — NO new Cargo deps,
/// H-2), parses the root `<AppInstaller Version>` (M-4), normalizes both sides to
/// the MSIX 4-tuple (H-1), and decides via `update_is_available` (H-1b).
///
/// Graceful on every path (L-5): off-Windows → `ok:false`; under
/// `debug_assertions` (dev) → early-return `update_available:false` to silence the
/// toast; network/parse failure → `ok:false, update_available:false` with a
/// reason in `message`. NEVER returns Err / panics — the toast simply stays
/// hidden, and the OS 24h auto-update remains the backstop.
#[tauri::command]
fn probe_update() -> Result<UpdateProbe, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();

    // Dev builds: never nag (no real MSIX install to update). L-5.
    if cfg!(debug_assertions) {
        return Ok(UpdateProbe {
            update_available: false,
            current,
            available: None,
            ok: false,
            message: "update probe disabled in dev build".to_string(),
        });
    }

    // Windows-only update channel (MSIX). Mirror check_for_updates off-Windows.
    if !cfg!(target_os = "windows") {
        return Ok(UpdateProbe {
            update_available: false,
            current,
            available: None,
            ok: false,
            message: "updates are managed by the OS package manager on this platform".to_string(),
        });
    }

    let not_available = |message: String| -> Result<UpdateProbe, String> {
        Ok(UpdateProbe {
            update_available: false,
            current: current.clone(),
            available: None,
            ok: false,
            message,
        })
    };

    // HTTP GET the .appinstaller via PowerShell (same channel idiom as the apply
    // action). -UseBasicParsing for headless reliability. NOTE: `.Content` is a
    // Byte[] for GitHub release assets (Content-Type: application/octet-stream),
    // and PowerShell prints a Byte[] to stdout as one decimal-per-line ("60\n63\n
    // ...") — NOT the XML text. So Rust's from_utf8_lossy would see digits, never
    // "<AppInstaller", and the probe would always report up-to-date (toast never
    // shows). Decode the bytes to a UTF-8 string explicitly so stdout carries the
    // real XML. (Found in live rc.12→rc.13 toast test; unit tests passed because
    // they fed the parser real XML directly, bypassing this stdout path.)
    let ps = format!(
        "[System.Text.Encoding]::UTF8.GetString((Invoke-WebRequest -Uri '{APPINSTALLER_URL}' -UseBasicParsing -TimeoutSec 15).Content)"
    );
    let mut cmd = std::process::Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        &ps,
    ]);
    let output = match no_window(&mut cmd).output() {
        Ok(o) => o,
        Err(err) => return not_available(format!("update check failed: {err}")),
    };
    if !output.status.success() {
        return not_available("update check failed: hosted manifest unreachable".to_string());
    }
    let body = String::from_utf8_lossy(&output.stdout);
    let hosted = match parse_appinstaller_version(&body) {
        Some(v) => v,
        None => return not_available("update check failed: could not parse manifest".to_string()),
    };

    let available = update_is_available(&current, &hosted);
    Ok(UpdateProbe {
        update_available: available,
        current,
        available: Some(hosted),
        ok: true,
        message: if available {
            "update available".to_string()
        } else {
            "up to date".to_string()
        },
    })
}

/// Restart the cockpit (U-2 step-2 "지금 다시 시작"). The tray menu restarts via
/// `app.restart()` directly (lib.rs tray handler), but JS can only reach it
/// through a command — so expose the same call. Used after `check_for_updates`
/// has applied an update and the user opts to relaunch into the new version.
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
fn open_release_evidence_folder(path: String) -> Result<CommandResult, String> {
    let folder = release_evidence_folder_for_path(&path)?;
    let mut command = if cfg!(target_os = "windows") {
        let mut command = std::process::Command::new("explorer.exe");
        command.arg(&folder);
        command
    } else if cfg!(target_os = "macos") {
        let mut command = std::process::Command::new("open");
        command.arg(&folder);
        command
    } else {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(&folder);
        command
    };

    no_window(&mut command)
        .spawn()
        .map_err(|err| format!("failed to open release evidence folder: {err}"))?;
    Ok(CommandResult {
        ok: true,
        message: "release evidence folder opened".to_string(),
        output: folder.display().to_string(),
    })
}

fn run_private_mesh_desktop_report(
    action: &str,
    fallback_next_step: &str,
) -> Result<PrivateMeshDesktopStatus, String> {
    let command = musu_command_path();
    let timeout = if action == "doctor" {
        PRIVATE_MESH_DOCTOR_TIMEOUT
    } else {
        DOCTOR_STATUS_TIMEOUT
    };
    let result = run_command_with_timeout(&command, &["mesh", action, "--json"], timeout).map_err(
        |err| {
            format!(
                "failed to run {} mesh {action} --json: {err}",
                command.display()
            )
        },
    )?;
    if result.timed_out {
        return Err(format!(
            "{} mesh {action} --json timed out",
            command.display()
        ));
    }
    let combined = combine_command_output(&result.stdout, &result.stderr);
    if !result.status_success {
        return Ok(PrivateMeshDesktopStatus {
            ok: false,
            mode: "unknown".to_string(),
            route_label: "Mesh status unavailable".to_string(),
            account_requirement: "unknown".to_string(),
            control_server_url: None,
            control_server_verified: false,
            derp_policy: None,
            derp_readiness: "unknown".to_string(),
            derp_private_declared: false,
            derp_probe_ran: false,
            derp_probe_ok: false,
            derp_probe_detail: None,
            local_tailnet_ip: None,
            verified_target_tailnet_ip: None,
            callback_tailnet_ip: None,
            target_callback_match: false,
            compatible_client_found: false,
            tailscale_ping_verified: false,
            bridge_health_verified: false,
            callback_verified: false,
            release_grade: false,
            warnings: Vec::new(),
            next_steps: vec![fallback_next_step.to_string()],
            error: Some(combined),
        });
    }
    parse_private_mesh_desktop_status(&combined)
}

/// `list_fleet` — the cockpit's fleet list. Reads the local bridge's live
/// What this PC can run / is running, for the this-PC machine panel (redesign
/// C-plus step 2). Reuses the bridge's localhost `/api/setup/status` probe
/// (ollama:11434 / comfyui:8188 + the auto-detected default agent) — this is the
/// LOCAL machine only; per-remote-machine program status needs the deferred
/// cross-machine bridge change. Empty/false when the bridge isn't ready.
#[derive(serde::Serialize, Default)]
struct ThisPcPrograms {
    ollama_running: bool,
    comfyui_running: bool,
    default_adapter: String,
}

#[tauri::command]
fn this_pc_programs() -> Result<ThisPcPrograms, String> {
    let home = musu_home();
    let Some(base_url) = bridge_registry_status(&home).url else {
        return Ok(ThisPcPrograms::default());
    };
    let Some(token) = bridge_token(&home) else {
        return Ok(ThisPcPrograms::default());
    };
    let response = match http_get_with_bearer(&base_url, "/api/setup/status", &token) {
        Ok(r) => r,
        Err(_) => return Ok(ThisPcPrograms::default()),
    };
    if http_status_code(&response).unwrap_or(0) != 200 {
        return Ok(ThisPcPrograms::default());
    }
    let Some(body) = http_response_body(&response) else {
        return Ok(ThisPcPrograms::default());
    };
    let json: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return Ok(ThisPcPrograms::default()),
    };
    Ok(ThisPcPrograms {
        ollama_running: json.get("ollama_running").and_then(|v| v.as_bool()).unwrap_or(false),
        comfyui_running: json.get("comfyui_running").and_then(|v| v.as_bool()).unwrap_or(false),
        default_adapter: json
            .get("current_default_adapter")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

/// `/api/fleet/status` endpoint directly instead of spawning `musu.exe nodes`
/// on every refresh. This keeps fleet refresh cheap, removes a subprocess from
/// the 15s cockpit loop, and avoids Windows console flicker regressions.
/// Returns an empty list when the bridge/token is not ready yet so the cockpit
/// can show its empty/connecting state instead of an error.
#[tauri::command]
fn list_fleet() -> Result<Vec<FleetNode>, String> {
    let home = musu_home();
    let Some(base_url) = bridge_registry_status(&home).url else {
        return Ok(Vec::new());
    };
    let Some(token) = bridge_token(&home) else {
        return Ok(Vec::new());
    };

    let response = match http_get_with_bearer(&base_url, "/api/fleet/status", &token) {
        Ok(response) => response,
        Err(_) => return Ok(Vec::new()),
    };
    let status_code = http_status_code(&response).unwrap_or(0);
    if status_code == 401 || status_code == 403 {
        return Err("local_fleet_auth_failed".to_string());
    }
    if status_code != 200 {
        return Ok(Vec::new());
    }
    let body = http_response_body(&response)
        .ok_or_else(|| "local fleet response did not contain an HTTP body".to_string())?;
    let dashboard: serde_json::Value = serde_json::from_str(body)
        .map_err(|err| format!("failed to parse local fleet JSON: {err}"))?;

    Ok(fleet_nodes_from_bridge_dashboard(&dashboard))
}

fn fleet_nodes_from_bridge_dashboard(dashboard: &serde_json::Value) -> Vec<FleetNode> {
    let mut nodes = Vec::new();
    if let Some(this) = dashboard.get("this_node") {
        nodes.push(fleet_node_from_bridge_value(this, true));
    }
    if let Some(peers) = dashboard.get("peers").and_then(|value| value.as_array()) {
        nodes.extend(
            peers
                .iter()
                .map(|peer| fleet_node_from_bridge_value(peer, false)),
        );
    }
    nodes
}

fn fleet_node_from_bridge_value(value: &serde_json::Value, is_this_pc: bool) -> FleetNode {
    FleetNode {
        node_name: json_string(value, &["name"]).unwrap_or_default(),
        public_url: json_string(value, &["addr"]).unwrap_or_default(),
        last_seen: json_string(value, &["last_seen"]).unwrap_or_default(),
        status_error: json_string(value, &["status_error"]),
        is_this_pc,
        healthy: json_bool(value, &["healthy"]).unwrap_or(false),
        reachable_via: json_string(value, &["reachable_via"]),
        tailscale_ip: json_string(value, &["tailscale_ip"]),
        mesh_mode: json_string(value, &["mesh_mode"]),
        route_label: json_string(value, &["route_label"]),
        control_server_url: json_string(value, &["control_server_url"]),
        control_server_verified: json_bool(value, &["control_server_verified"]).unwrap_or(false),
    }
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
fn submit_order(text: String, target: String) -> Result<OrderResult, String> {
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
        return Err(format!(
            "{} route timed out accepting the order",
            command.display()
        ));
    }

    let combined = combine_command_output(&result.stdout, &result.stderr);
    if result.status_success {
        // V28 Phase 1: extract the task id so the cockpit can poll it. `musu
        // route` (no --wait) prints `✓ Task queued: <id>` on success — that id is
        // the handle for get_order_status. (route --json is explain-only, so we
        // parse the human line rather than ask for JSON.)
        let task_id = parse_queued_task_id(&result.stdout);
        Ok(OrderResult {
            ok: true,
            message: if target.is_empty() {
                "order sent (auto-routed)".to_string()
            } else {
                format!("order sent to {target}")
            },
            task_id,
        })
    } else {
        Err(format!("order rejected: {}", combined.trim()))
    }
}

/// Extract the task id from `musu route`'s `✓ Task queued: <id>` stdout line.
/// Returns None if the line is absent (older runtime, or a path that didn't
/// queue). Tolerant of surrounding whitespace and the leading check glyph.
fn parse_queued_task_id(stdout: &str) -> Option<String> {
    for line in stdout.lines() {
        if let Some(idx) = line.find("Task queued:") {
            let id = line[idx + "Task queued:".len()..].trim();
            if !id.is_empty() && id != "unknown" {
                return Some(id.to_string());
            }
        }
    }
    None
}

/// V28 Phase 1 — poll one order's live status for the cockpit task feed. Spawns
/// `musu task <id> --json` (which hits the local bridge `GET /api/tasks/:id`) and
/// maps the envelope. The cockpit calls this on an interval after submit_order
/// until status is terminal (done/failed/cancelled).
#[tauri::command]
fn get_order_status(task_id: String) -> Result<TaskStatus, String> {
    let task_id = task_id.trim().to_string();
    if task_id.is_empty() {
        return Err("task_id is empty".to_string());
    }
    let command = musu_command_path();
    let result = run_command_with_timeout(
        &command,
        &["task", &task_id, "--json"],
        DOCTOR_STATUS_TIMEOUT,
    )
    .map_err(|err| format!("failed to run {} task: {err}", command.display()))?;
    if result.timed_out {
        return Err(format!("{} task timed out", command.display()));
    }

    let value: serde_json::Value = serde_json::from_str(result.stdout.trim())
        .map_err(|err| format!("failed to parse `musu task --json` output: {err}"))?;

    let status = value
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    Ok(TaskStatus {
        task_id,
        status,
        output: value
            .get("output")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        error: value
            .get("error")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        exit_code: value.get("exit_code").and_then(|v| v.as_i64()),
        duration_sec: value.get("duration_sec").and_then(|v| v.as_f64()),
        // Phase 2: artifact path comes from a future schema column; None for now.
        artifact_path: value
            .get("artifact_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        route_proof: value.get("route_proof").cloned().filter(|v| !v.is_null()),
    })
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

fn parse_private_mesh_desktop_status(text: &str) -> Result<PrivateMeshDesktopStatus, String> {
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|err| format!("mesh status JSON parse failed: {err}"))?;
    let verification = value
        .get("verification")
        .unwrap_or(&serde_json::Value::Null);
    let derp_probe = value
        .get("derp_probe_command")
        .unwrap_or(&serde_json::Value::Null);
    let derp_probe_ran = !derp_probe.is_null();
    let derp_probe_detail = derp_probe
        .get("stderr")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            derp_probe
                .get("stdout")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
        })
        .map(str::to_string);
    Ok(PrivateMeshDesktopStatus {
        ok: true,
        mode: value
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        route_label: value
            .get("route_label")
            .and_then(|v| v.as_str())
            .unwrap_or("Mesh status unknown")
            .to_string(),
        account_requirement: value
            .get("account_requirement")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        control_server_url: value
            .get("control_server_url")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        control_server_verified: value
            .get("control_server_verified")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        derp_policy: value
            .get("derp_policy")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        derp_readiness: value
            .get("derp_readiness")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("unknown")
            .to_string(),
        derp_private_declared: verification
            .get("derp_private_declared")
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| {
                value
                    .get("derp_readiness")
                    .and_then(|v| v.as_str())
                    .map(|s| s == "declared_private")
                    .unwrap_or(false)
            }),
        derp_probe_ran,
        derp_probe_ok: value
            .get("derp_probe_ok")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        derp_probe_detail,
        local_tailnet_ip: value
            .get("local_tailnet_ip")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        verified_target_tailnet_ip: value
            .get("verified_target_tailnet_ip")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        callback_tailnet_ip: value
            .get("callback_tailnet_ip")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        target_callback_match: value
            .get("target_callback_match")
            .and_then(|v| v.as_bool())
            .or_else(|| {
                verification
                    .get("target_callback_match")
                    .and_then(|v| v.as_bool())
            })
            .unwrap_or(false),
        compatible_client_found: value
            .get("compatible_client_found")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        tailscale_ping_verified: verification
            .get("tailscale_ping_verified")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        bridge_health_verified: verification
            .get("bridge_health_verified")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        callback_verified: verification
            .get("callback_verified")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        release_grade: verification
            .get("release_grade")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        warnings: json_string_array(&value, &["warnings"]),
        next_steps: json_string_array(&value, &["next_steps"]),
        error: None,
    })
}

fn parse_private_mesh_verify_result(
    target_ip: &str,
    text: &str,
) -> Result<PrivateMeshVerifyDesktopResult, String> {
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|err| format!("mesh verify JSON parse failed: {err}"))?;
    Ok(PrivateMeshVerifyDesktopResult {
        ok: value
            .get("ping")
            .and_then(|v| v.get("exit_code"))
            .and_then(|v| v.as_i64())
            == Some(0)
            && value
                .get("bridge_health_ok")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        target_ip: value
            .get("target_ip")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or(target_ip)
            .to_string(),
        ping_ok: value
            .get("ping")
            .and_then(|v| v.get("exit_code"))
            .and_then(|v| v.as_i64())
            == Some(0),
        bridge_health_ok: value
            .get("bridge_health_ok")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        bridge_health_status: value.get("bridge_health_status").and_then(|v| v.as_u64()),
        callback_verified: value
            .get("callback_verified")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        callback_tailnet_ip: value
            .get("callback_tailnet_ip")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        target_callback_match: value
            .get("target_callback_match")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        release_grade: value
            .get("release_grade")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        next_steps: json_string_array(&value, &["next_steps"]),
        error: None,
        output: text.trim().to_string(),
    })
}

fn parse_private_mesh_release_proof_result(
    target_node: &str,
    target_ip: &str,
    expected_control_server_url: &str,
    text: &str,
) -> Result<PrivateMeshReleaseProofDesktopResult, String> {
    let value: serde_json::Value = serde_json::from_str(text.trim())
        .map_err(|err| format!("mesh release-proof JSON parse failed: {err}"))?;
    Ok(PrivateMeshReleaseProofDesktopResult {
        ok: value.get("ok").and_then(|v| v.as_bool()).unwrap_or(false),
        target_node: value
            .get("target_node")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or(target_node)
            .to_string(),
        target_ip: value
            .get("target_ip")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or(target_ip)
            .to_string(),
        completed_at: value
            .get("completed_at")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        evidence_root: value
            .get("evidence_root")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        route_evidence_path: value
            .get("route_evidence_path")
            .or_else(|| value.get("evidence_path"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        route_evidence_sha256_path: None,
        route_evidence_sha256: None,
        route_evidence_integrity_verified: false,
        route_evidence_integrity_error: None,
        route_transport_verified: false,
        route_transport_error: None,
        verification_path: value
            .get("verification_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        verification_sha256_path: value
            .get("verification_sha256_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        verification_sha256: None,
        integrity_verified: false,
        integrity_error: None,
        peer_identity: None,
        release_identity_bound: false,
        peer_identity_error: None,
        physical_peer_evidence_path: value
            .get("physical_peer_evidence_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        physical_peer_evidence_sha256_path: None,
        physical_peer_evidence_sha256: None,
        physical_peer_verified: false,
        physical_peer_error: None,
        software_route_trusted: false,
        release_evidence_trusted: false,
        bundle_manifest_path: value
            .get("bundle_manifest_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        bundle_manifest_sha256_path: value
            .get("bundle_manifest_sha256_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        bundle_manifest_ok: value
            .get("bundle_manifest_ok")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        bundle_manifest_fail_count: value
            .get("bundle_manifest_fail_count")
            .and_then(|v| v.as_u64())
            .and_then(|v| usize::try_from(v).ok()),
        bundle_manifest_error: value
            .get("bundle_manifest_error")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        archive_dir: value
            .get("archive_dir")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        archive_manifest_path: value
            .get("archive_manifest_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        archive_manifest_sha256_path: value
            .get("archive_manifest_sha256_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        archive_artifact_count: value
            .get("archive_artifact_count")
            .and_then(|v| v.as_u64())
            .and_then(|v| usize::try_from(v).ok()),
        archive_verifier_ok: value.get("archive_verifier_ok").and_then(|v| v.as_bool())
            == Some(true)
            && value
                .get("archive_verifier_schema")
                .and_then(|v| v.as_str())
                == Some("musu.private_mesh_release_proof_archive_verification.v1")
            && value
                .get("archive_verifier_fail_count")
                .and_then(|v| v.as_u64())
                == Some(0),
        archive_verifier_schema: value
            .get("archive_verifier_schema")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        archive_verifier_fail_count: value
            .get("archive_verifier_fail_count")
            .and_then(|v| v.as_u64())
            .and_then(|v| usize::try_from(v).ok()),
        archive_verifier_kind: value
            .get("archive_verifier_kind")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        archive_verifier_error: value
            .get("archive_verifier_error")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        archive_error: value
            .get("archive_error")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        desktop_runtime_kind: value
            .get("desktop_runtime_kind")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        desktop_runtime_packaged: value
            .get("desktop_runtime_packaged")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        desktop_runtime_exe_path: value
            .get("desktop_runtime_exe_path")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        desktop_runtime_exe_sha256: value
            .get("desktop_runtime_exe_sha256")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        expected_control_server_url: value
            .get("expected_control_server_url")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                if expected_control_server_url.is_empty() {
                    None
                } else {
                    Some(expected_control_server_url)
                }
            })
            .map(str::to_string),
        error: value
            .get("error")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        output: text.trim().to_string(),
    })
}

fn latest_release_evidence_from_home(
    home: &std::path::Path,
) -> Result<Option<PrivateMeshReleaseProofDesktopResult>, String> {
    let root = home.join("private-mesh-release-proof");
    if !root.exists() {
        return Ok(None);
    }
    let mut stack = vec![root];
    let mut latest: Option<((u8, i128), std::path::PathBuf)> = None;
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path_has_component(&path, "archive") {
                continue;
            }
            if path.file_name().and_then(|value| value.to_str())
                != Some("private-mesh-release-proof.verification.json")
            {
                continue;
            }
            let sort_key = release_proof_sort_key(&path, &entry);
            if latest
                .as_ref()
                .map(|(current, _)| sort_key > *current)
                .unwrap_or(true)
            {
                latest = Some((sort_key, path));
            }
        }
    }

    let Some((_, path)) = latest else {
        return Ok(None);
    };
    let text = std::fs::read_to_string(&path)
        .map_err(|err| format!("failed to read latest release evidence: {err}"))?;
    let mut result = parse_private_mesh_release_proof_result("", "", "", &text)?;
    if result.verification_path.is_none() {
        result.verification_path = Some(path.display().to_string());
    }
    if result.evidence_root.is_none() {
        result.evidence_root = path.parent().map(|parent| parent.display().to_string());
    }
    attach_release_evidence_integrity(&mut result, home);
    attach_route_evidence_integrity(&mut result, home);
    attach_release_peer_identity(&mut result, home);
    result.output = text.trim().to_string();
    update_release_evidence_trust(&mut result);
    attach_existing_release_bundle_manifest_status(&mut result, home);
    attach_existing_release_archive_status(&mut result, home);
    Ok(Some(result))
}

fn release_proof_sort_key(path: &std::path::Path, entry: &std::fs::DirEntry) -> (u8, i128) {
    if let Some(completed_at) = release_proof_completed_at_unix_ms(path) {
        return (2, completed_at);
    }
    if let Some(recorded_at) = evidence_sidecar_recorded_at_unix_ms(path) {
        return (1, recorded_at);
    }
    (
        0,
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i128)
            .unwrap_or(0),
    )
}

fn release_proof_completed_at_unix_ms(path: &std::path::Path) -> Option<i128> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    if value.get("schema").and_then(|value| value.as_str())
        != Some("musu.private_mesh_release_proof.v1")
    {
        return None;
    }
    let completed_at = value.get("completed_at").and_then(|value| value.as_str())?;
    let completed_at = chrono::DateTime::parse_from_rfc3339(completed_at).ok()?;
    Some(completed_at.timestamp_millis() as i128)
}

fn evidence_sidecar_recorded_at_unix_ms(path: &std::path::Path) -> Option<i128> {
    let sidecar_path = std::path::PathBuf::from(format!("{}.sha256", path.display()));
    let text = std::fs::read_to_string(sidecar_path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    if value.get("schema").and_then(|value| value.as_str())
        != Some("musu.evidence_integrity_sidecar.v1")
    {
        return None;
    }
    let recorded_at = value.get("recorded_at").and_then(|value| value.as_str())?;
    let recorded_at = chrono::DateTime::parse_from_rfc3339(recorded_at).ok()?;
    Some(recorded_at.timestamp_millis() as i128)
}

fn latest_physical_peer_evidence_from_home(
    home: &std::path::Path,
) -> Result<Option<PhysicalPeerEvidenceDesktopResult>, String> {
    let root = home.join("private-mesh-physical-peer-evidence");
    if !root.exists() {
        return Ok(None);
    }
    let mut stack = vec![root];
    let mut latest: Option<(
        chrono::DateTime<chrono::Utc>,
        PhysicalPeerEvidenceDesktopResult,
    )> = None;
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let summary = read_physical_peer_evidence_summary(&path);
            if !summary.ok {
                continue;
            }
            let Some(generated_at) = physical_peer_evidence_generated_at_utc(&summary) else {
                continue;
            };
            if latest
                .as_ref()
                .map(|(current, _)| generated_at > *current)
                .unwrap_or(true)
            {
                latest = Some((generated_at, summary));
            }
        }
    }
    Ok(latest.map(|(_, summary)| summary))
}

fn read_physical_peer_evidence_summary(
    path: &std::path::Path,
) -> PhysicalPeerEvidenceDesktopResult {
    read_physical_peer_evidence_summary_at(path, chrono::Utc::now())
}

fn read_physical_peer_evidence_summary_for_release(
    path: &std::path::Path,
    result: &PrivateMeshReleaseProofDesktopResult,
) -> Result<PhysicalPeerEvidenceDesktopResult, String> {
    let completed_at = release_completed_at_utc(result)?;
    Ok(read_physical_peer_evidence_summary_at(path, completed_at))
}

fn release_completed_at_utc(
    result: &PrivateMeshReleaseProofDesktopResult,
) -> Result<chrono::DateTime<chrono::Utc>, String> {
    let completed_at = result
        .completed_at
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "release proof completed_at is missing".to_string())?;
    chrono::DateTime::parse_from_rfc3339(completed_at)
        .map(|value| value.with_timezone(&chrono::Utc))
        .map_err(|err| format!("release proof completed_at is not valid RFC3339: {err}"))
}

fn read_physical_peer_evidence_summary_at(
    path: &std::path::Path,
    freshness_reference: chrono::DateTime<chrono::Utc>,
) -> PhysicalPeerEvidenceDesktopResult {
    let path_text = path.display().to_string();
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(err) => {
            return PhysicalPeerEvidenceDesktopResult {
                ok: false,
                path: path_text,
                schema: None,
                node_name: None,
                tailnet_ip: None,
                control_server_url: None,
                hostname: None,
                os: None,
                arch: None,
                source_hostname: local_os_hostname(),
                physical_host_distinct: false,
                control_server_verified: false,
                physical_peer_verified: false,
                generated_at: None,
                sha256_path: None,
                sha256: None,
                integrity_verified: false,
                error: Some(format!("physical peer evidence is not readable: {err}")),
            }
        }
    };
    let value: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(err) => {
            return PhysicalPeerEvidenceDesktopResult {
                ok: false,
                path: path_text,
                schema: None,
                node_name: None,
                tailnet_ip: None,
                control_server_url: None,
                hostname: None,
                os: None,
                arch: None,
                source_hostname: local_os_hostname(),
                physical_host_distinct: false,
                control_server_verified: false,
                physical_peer_verified: false,
                generated_at: None,
                sha256_path: None,
                sha256: None,
                integrity_verified: false,
                error: Some(format!("physical peer evidence JSON parse failed: {err}")),
            }
        }
    };
    let schema = value
        .get("schema")
        .and_then(|item| item.as_str())
        .map(str::to_string);
    let node_name = value
        .get("node_name")
        .and_then(|item| item.as_str())
        .filter(|item| !item.trim().is_empty())
        .map(str::to_string);
    let tailnet_ip = value
        .get("tailnet_ip")
        .and_then(|item| item.as_str())
        .filter(|item| !item.trim().is_empty())
        .map(str::to_string);
    let control_server_url = value
        .get("control_server_url")
        .and_then(|item| item.as_str())
        .filter(|item| !item.trim().is_empty())
        .map(str::to_string);
    let hostname = value
        .get("hostname")
        .and_then(|item| item.as_str())
        .filter(|item| !item.trim().is_empty())
        .map(str::to_string);
    let os = value
        .get("os")
        .and_then(|item| item.as_str())
        .filter(|item| !item.trim().is_empty())
        .map(str::to_string);
    let arch = value
        .get("arch")
        .and_then(|item| item.as_str())
        .filter(|item| !item.trim().is_empty())
        .map(str::to_string);
    let source_hostname = local_os_hostname();
    let physical_host_distinct = source_hostname
        .as_deref()
        .zip(hostname.as_deref())
        .map(|(source, target)| !source.trim().eq_ignore_ascii_case(target.trim()))
        .unwrap_or(false);
    let control_server_verified = value
        .get("control_server_verified")
        .and_then(|item| item.as_bool())
        .unwrap_or(false);
    let physical_peer_verified = value
        .get("physical_peer_verified")
        .and_then(|item| item.as_bool())
        .unwrap_or(false);
    let generated_at = value
        .get("generated_at")
        .and_then(|item| item.as_str())
        .filter(|item| !item.trim().is_empty())
        .map(str::to_string);
    let generated_at_error =
        physical_peer_evidence_generated_at_error_at(generated_at.as_deref(), freshness_reference);
    let integrity = verify_sidecar_for_file(path);
    let (sha256_path, sha256, integrity_verified, integrity_error) = match integrity {
        Ok((_, sidecar_path, sha256)) => (
            Some(sidecar_path.display().to_string()),
            Some(sha256),
            true,
            None,
        ),
        Err(err) => (None, None, false, Some(err)),
    };
    let base_content_ok = schema.as_deref() == Some("musu.private_mesh_physical_peer_evidence.v1")
        && node_name.is_some()
        && tailnet_ip.is_some()
        && control_server_url.is_some()
        && hostname.is_some()
        && control_server_verified
        && physical_peer_verified;
    let content_ok = base_content_ok && generated_at_error.is_none();
    let ok = content_ok && integrity_verified && physical_host_distinct;
    let error = if ok {
        None
    } else if base_content_ok && generated_at_error.is_some() {
        generated_at_error
    } else if content_ok && !physical_host_distinct {
        Some(
            "physical peer evidence hostname matches this source PC or source hostname is unavailable; generate evidence on a separate target physical PC".to_string(),
        )
    } else if content_ok {
        Some(format!(
            "physical peer evidence SHA256 sidecar is missing or invalid: {}",
            integrity_error.unwrap_or_else(|| "unknown integrity error".to_string())
        ))
    } else {
        Some(
            "not a valid MUSU physical peer evidence file; run `musu mesh physical-peer-evidence --json` on the target PC and copy both the JSON and .sha256 sidecar".to_string(),
        )
    };
    PhysicalPeerEvidenceDesktopResult {
        ok,
        path: path_text,
        schema,
        node_name,
        tailnet_ip,
        control_server_url,
        hostname,
        os,
        arch,
        source_hostname,
        physical_host_distinct,
        control_server_verified,
        physical_peer_verified,
        generated_at,
        sha256_path,
        sha256,
        integrity_verified,
        error,
    }
}

fn physical_peer_evidence_generated_at_error_at(
    generated_at: Option<&str>,
    freshness_reference: chrono::DateTime<chrono::Utc>,
) -> Option<String> {
    let Some(generated_at) = generated_at
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Some(
            "physical peer evidence generated_at is missing; regenerate it on the target PC"
                .to_string(),
        );
    };
    let generated_at_utc = match chrono::DateTime::parse_from_rfc3339(generated_at) {
        Ok(value) => value.with_timezone(&chrono::Utc),
        Err(err) => {
            return Some(format!(
                "physical peer evidence generated_at is not valid RFC3339: {err}"
            ));
        }
    };
    if generated_at_utc
        < freshness_reference - chrono::Duration::seconds(PHYSICAL_PEER_EVIDENCE_MAX_AGE_SECONDS)
    {
        return Some(
            "physical peer evidence is stale; regenerate it on the target PC within 24 hours of release proof"
                .to_string(),
        );
    }
    if generated_at_utc
        > freshness_reference
            + chrono::Duration::seconds(PHYSICAL_PEER_EVIDENCE_FUTURE_SKEW_SECONDS)
    {
        return Some(
            "physical peer evidence generated_at is too far in the future; check both PCs' clocks and regenerate it"
                .to_string(),
        );
    }
    None
}

fn physical_peer_evidence_generated_at_utc(
    summary: &PhysicalPeerEvidenceDesktopResult,
) -> Option<chrono::DateTime<chrono::Utc>> {
    let generated_at = summary.generated_at.as_deref()?.trim();
    chrono::DateTime::parse_from_rfc3339(generated_at)
        .ok()
        .map(|value| value.with_timezone(&chrono::Utc))
}

fn local_os_hostname() -> Option<String> {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn attach_release_evidence_integrity(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) {
    let Err(err) = verify_release_evidence_integrity(result, home) else {
        return;
    };
    result.integrity_verified = false;
    result.integrity_error = Some(err);
}

fn update_release_evidence_trust(result: &mut PrivateMeshReleaseProofDesktopResult) {
    result.software_route_trusted = result.ok
        && result.integrity_verified
        && result.route_evidence_integrity_verified
        && result.route_transport_verified
        && result.release_identity_bound;
    result.release_evidence_trusted =
        result.software_route_trusted && result.physical_peer_verified;
    if result.software_route_trusted
        && !result.physical_peer_verified
        && result.physical_peer_error.is_none()
    {
        result.physical_peer_error = Some(
            "physical peer evidence is missing; distinct node/IP can still be two bridge instances on one host".to_string(),
        );
    }
}

fn attach_or_create_release_bundle_manifest(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
    physical_peer_evidence_path: Option<&str>,
) {
    if let Err(err) =
        write_or_verify_release_bundle_manifest(result, home, physical_peer_evidence_path)
    {
        result.bundle_manifest_ok = false;
        result.bundle_manifest_error = Some(err.clone());
        if result.release_evidence_trusted {
            result.release_evidence_trusted = false;
            result.physical_peer_error = Some(format!("release proof bundle is incomplete: {err}"));
        }
        return;
    }

    if let Err(err) = write_release_evidence_archive(result, home) {
        result.archive_error = Some(err.clone());
        if result.release_evidence_trusted {
            result.release_evidence_trusted = false;
            result.physical_peer_error =
                Some(format!("release proof archive is incomplete: {err}"));
        }
    }
}

fn attach_existing_release_bundle_manifest_status(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) {
    let Err(err) = verify_existing_release_bundle_manifest_status(result, home) else {
        return;
    };
    result.bundle_manifest_ok = false;
    result.bundle_manifest_error = Some(err.clone());
    if result.release_evidence_trusted {
        result.release_evidence_trusted = false;
        result.physical_peer_error = Some(format!("release proof bundle is incomplete: {err}"));
    }
}

fn attach_existing_release_archive_status(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) {
    let Err(err) = verify_existing_release_archive_status(result, home) else {
        return;
    };
    result.archive_verifier_ok = false;
    result.archive_verifier_schema = None;
    result.archive_verifier_fail_count = None;
    result.archive_verifier_kind = None;
    result.archive_verifier_error = Some(err.clone());
    result.archive_error = Some(err);
}

fn attach_desktop_runtime_identity(result: &mut PrivateMeshReleaseProofDesktopResult) {
    let Ok(exe_path) = std::env::current_exe() else {
        result.desktop_runtime_kind = Some("runtime_unknown".to_string());
        result.desktop_runtime_packaged = false;
        result.desktop_runtime_exe_path = None;
        result.desktop_runtime_exe_sha256 = None;
        return;
    };
    let packaged = is_packaged_desktop_runtime_path(&exe_path);
    result.desktop_runtime_kind = Some(
        if packaged {
            "packaged_desktop"
        } else {
            "dev_or_unpackaged_desktop"
        }
        .to_string(),
    );
    result.desktop_runtime_packaged = packaged;
    result.desktop_runtime_exe_path = Some(exe_path.display().to_string());
    result.desktop_runtime_exe_sha256 = std::fs::read(&exe_path)
        .ok()
        .map(|bytes| sha256_hex(&bytes));
}

fn is_packaged_desktop_runtime_path(path: &std::path::Path) -> bool {
    let normalized = normalize_path_for_compare(path).to_ascii_lowercase();
    if normalized.contains("/src-tauri/")
        || normalized.contains("/target/debug/")
        || normalized.contains("/target/release/")
        || normalized.contains("/node_modules/")
    {
        return false;
    }
    let exe_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !exe_name.contains("musu") {
        return false;
    }
    normalized.contains("/program files/")
        || normalized.contains("/appdata/local/programs/")
        || normalized.contains("/appdata/local/musu/")
        || normalized.contains("/appdata/roaming/musu/")
        || normalized.contains("/windowsapps/")
        || normalized.contains("/applications/")
        || normalized.contains(".app/contents/macos/")
}

fn attach_desktop_runtime_identity_from_manifest(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    manifest: &serde_json::Value,
) {
    result.desktop_runtime_kind = manifest
        .get("desktop_runtime_kind")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| result.desktop_runtime_kind.clone());
    result.desktop_runtime_packaged = manifest
        .get("desktop_runtime_packaged")
        .and_then(|value| value.as_bool())
        .unwrap_or(result.desktop_runtime_packaged);
    result.desktop_runtime_exe_path = manifest
        .get("desktop_runtime_exe_path")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| result.desktop_runtime_exe_path.clone());
    result.desktop_runtime_exe_sha256 = manifest
        .get("desktop_runtime_exe_sha256")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| result.desktop_runtime_exe_sha256.clone());
}

fn verify_existing_release_archive_status(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) -> Result<(), String> {
    let verification_path = result
        .verification_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "verification_path is missing".to_string())?;
    let verification_path = std::path::PathBuf::from(verification_path);
    release_evidence_folder_for_path_in_home(&verification_path.display().to_string(), home)?;
    let evidence_root = verification_path
        .parent()
        .ok_or_else(|| "verification_path has no parent folder".to_string())?;
    let archive_root = evidence_root.join("archive");
    if !archive_root.exists() {
        return Err("release proof archive is missing".to_string());
    }

    let archive_manifest_path = latest_archive_manifest_path(&archive_root)
        .ok_or_else(|| "release proof archive manifest is missing".to_string())?;
    release_evidence_folder_for_path_in_home(&archive_manifest_path.display().to_string(), home)?;
    let (archive_manifest_path, archive_manifest_sidecar_path, _) =
        verify_sidecar_for_file(&archive_manifest_path)
            .map_err(|err| format!("archive manifest sidecar: {err}"))?;
    let archive_manifest_text = std::fs::read_to_string(&archive_manifest_path)
        .map_err(|err| format!("archive manifest is not readable: {err}"))?;
    let archive_dir = archive_manifest_path
        .parent()
        .ok_or_else(|| "archive manifest has no parent folder".to_string())?
        .to_path_buf();
    let archive_manifest: serde_json::Value = serde_json::from_str(&archive_manifest_text)
        .map_err(|err| format!("archive manifest JSON parse failed: {err}"))?;
    if archive_manifest
        .get("schema")
        .and_then(|value| value.as_str())
        != Some("musu.private_mesh_release_proof_archive.v1")
    {
        return Err("archive manifest schema is invalid".to_string());
    }
    if archive_manifest.get("ok").and_then(|value| value.as_bool()) != Some(true) {
        return Err("archive manifest ok is not true".to_string());
    }
    if archive_manifest
        .get("release_evidence_trusted")
        .and_then(|value| value.as_bool())
        != Some(true)
    {
        return Err("archive manifest release_evidence_trusted is not true".to_string());
    }
    if archive_manifest
        .get("bundle_manifest_ok")
        .and_then(|value| value.as_bool())
        != Some(true)
    {
        return Err("archive manifest bundle_manifest_ok is not true".to_string());
    }
    if archive_manifest
        .get("bundle_manifest_fail_count")
        .and_then(|value| value.as_u64())
        != Some(0)
    {
        return Err("archive manifest bundle_manifest_fail_count is not zero".to_string());
    }
    require_manifest_string_match(
        &archive_manifest,
        "release_bundle_contract",
        PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT,
    )?;
    require_manifest_string_match(&archive_manifest, "target_node", &result.target_node)?;
    require_manifest_string_match(&archive_manifest, "target_ip", &result.target_ip)?;
    if let Some(expected_control_server_url) = result.expected_control_server_url.as_deref() {
        require_manifest_string_match(
            &archive_manifest,
            "expected_control_server_url",
            expected_control_server_url,
        )?;
    }
    let artifacts = archive_manifest
        .get("artifacts")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "archive manifest artifacts are missing".to_string())?;
    let artifact_count = archive_manifest
        .get("artifact_count")
        .and_then(|value| value.as_u64())
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(0);
    if artifact_count != artifacts.len() || artifact_count < 4 {
        return Err("archive manifest artifact_count is invalid".to_string());
    }
    for role in [
        "verification",
        "bundle_manifest",
        "route_evidence",
        "physical_peer_evidence",
    ] {
        let aliases = archive_artifact_role_aliases(role);
        let artifact = find_archive_artifact_by_role(artifacts, aliases)
            .ok_or_else(|| format!("archive manifest is missing {role} artifact"))?;
        let evidence_path = artifact
            .get("evidence_path")
            .and_then(|value| value.as_str())
            .filter(|value| !value.trim().is_empty())
            .map(std::path::PathBuf::from)
            .ok_or_else(|| format!("archive {role} evidence_path is missing"))?;
        if !path_is_inside_dir(&evidence_path, &archive_dir) {
            return Err(format!(
                "archive {role} evidence_path is outside archive directory"
            ));
        }
        let (_, sidecar_path, sha256) = verify_sidecar_for_file(&evidence_path)
            .map_err(|err| format!("archive {role}: {err}"))?;
        if !path_is_inside_dir(&sidecar_path, &archive_dir) {
            return Err(format!(
                "archive {role} sidecar is outside archive directory"
            ));
        }
        if artifact
            .get("sha256_path")
            .and_then(|value| value.as_str())
            .map(std::path::PathBuf::from)
            .as_ref()
            .map(|expected| paths_match(expected, &sidecar_path))
            != Some(true)
        {
            return Err(format!("archive {role} sha256_path does not match sidecar"));
        }
        if artifact.get("sha256").and_then(|value| value.as_str()) != Some(sha256.as_str()) {
            return Err(format!("archive {role} sha256 does not match copied file"));
        }
    }
    verify_archived_bundle_manifest_binding(&archive_manifest, artifacts)?;

    result.archive_dir = archive_manifest_path
        .parent()
        .map(|parent| parent.display().to_string());
    result.archive_manifest_path = Some(archive_manifest_path.display().to_string());
    result.archive_manifest_sha256_path = Some(archive_manifest_sidecar_path.display().to_string());
    result.archive_artifact_count = Some(artifact_count);
    result.archive_verifier_ok = true;
    result.archive_verifier_schema =
        Some("musu.private_mesh_release_proof_archive_verification.v1".to_string());
    result.archive_verifier_fail_count = Some(0);
    result.archive_verifier_kind = Some("native_desktop_internal".to_string());
    result.archive_verifier_error = None;
    result.archive_error = None;
    attach_desktop_runtime_identity_from_manifest(result, &archive_manifest);
    Ok(())
}

fn verify_archived_bundle_manifest_binding(
    archive_manifest: &serde_json::Value,
    artifacts: &[serde_json::Value],
) -> Result<(), String> {
    let artifact = find_archive_artifact_by_role(artifacts, &["bundle_manifest"])
        .ok_or_else(|| "archive manifest is missing bundle_manifest artifact".to_string())?;
    let bundle_path = artifact
        .get("evidence_path")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "archive bundle_manifest evidence_path is missing".to_string())?;
    let text = std::fs::read_to_string(&bundle_path)
        .map_err(|err| format!("archived bundle manifest is not readable: {err}"))?;
    let bundle: serde_json::Value = serde_json::from_str(&text)
        .map_err(|err| format!("archived bundle manifest JSON parse failed: {err}"))?;
    if bundle.get("schema").and_then(|value| value.as_str())
        != Some("musu.private_mesh_release_proof_bundle.v1")
    {
        return Err("archived bundle manifest schema is invalid".to_string());
    }
    if bundle.get("ok").and_then(|value| value.as_bool()) != Some(true)
        || bundle.get("fail_count").and_then(|value| value.as_u64()) != Some(0)
    {
        return Err("archived bundle manifest is not ok with zero failed checks".to_string());
    }
    if bundle
        .get("release_evidence_trusted")
        .and_then(|value| value.as_bool())
        != Some(true)
    {
        return Err("archived bundle manifest release_evidence_trusted is not true".to_string());
    }
    require_archive_bundle_string_match(archive_manifest, &bundle, "release_bundle_contract")?;
    require_archive_bundle_string_match(archive_manifest, &bundle, "target_node")?;
    require_archive_bundle_string_match(archive_manifest, &bundle, "target_ip")?;
    require_archive_bundle_string_match(archive_manifest, &bundle, "expected_control_server_url")?;
    let checks = bundle
        .get("checks")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "archived bundle manifest checks are missing".to_string())?;
    require_archived_bundle_check_ok(checks, "physical peer evidence release time binding")?;
    verify_archived_verification_binding(archive_manifest, artifacts)?;
    verify_archived_route_transport_binding(archive_manifest, artifacts)?;
    verify_archived_peer_identity_binding(archive_manifest, artifacts)?;
    verify_archived_physical_peer_time_binding(archive_manifest, artifacts)?;
    Ok(())
}

fn verify_archived_verification_binding(
    archive_manifest: &serde_json::Value,
    artifacts: &[serde_json::Value],
) -> Result<(), String> {
    let verification = read_archived_verification(artifacts)?;
    let schema = verification
        .get("schema")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if schema != "musu.private_mesh_release_proof.v1"
        && schema != "musu.private_mesh_release_proof_runner.v1"
    {
        return Err(format!("archived verification schema is invalid: {schema}"));
    }
    if verification.get("ok").and_then(|value| value.as_bool()) != Some(true) {
        return Err("archived verification ok is not true".to_string());
    }
    require_archive_verification_string_match(archive_manifest, &verification, "target_node")?;
    require_archive_verification_string_match(archive_manifest, &verification, "target_ip")?;
    require_archive_verification_string_match(
        archive_manifest,
        &verification,
        "expected_control_server_url",
    )?;
    let completed_at = verification
        .get("completed_at")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "archived verification completed_at is missing".to_string())?;
    chrono::DateTime::parse_from_rfc3339(completed_at)
        .map_err(|err| format!("archived verification completed_at is not valid RFC3339: {err}"))?;
    Ok(())
}

fn read_archived_verification(
    artifacts: &[serde_json::Value],
) -> Result<serde_json::Value, String> {
    let verification_artifact =
        find_archive_artifact_by_role(artifacts, archive_artifact_role_aliases("verification"))
            .ok_or_else(|| "archive manifest is missing verification artifact".to_string())?;
    let verification_path = verification_artifact
        .get("evidence_path")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "archive verification evidence_path is missing".to_string())?;
    let verification_text = std::fs::read_to_string(&verification_path)
        .map_err(|err| format!("archived verification is not readable: {err}"))?;
    serde_json::from_str(&verification_text)
        .map_err(|err| format!("archived verification JSON parse failed: {err}"))
}

fn verify_archived_route_transport_binding(
    archive_manifest: &serde_json::Value,
    artifacts: &[serde_json::Value],
) -> Result<(), String> {
    let route_evidence = read_archived_route_evidence(artifacts)?;
    let target_ip = archive_manifest
        .get("target_ip")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let expected_control_server_url = archive_manifest
        .get("expected_control_server_url")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    verify_private_mesh_route_transport_contract(
        &route_evidence,
        target_ip,
        expected_control_server_url,
    )
    .map_err(|err| format!("archived route evidence transport binding failed: {err}"))
}

fn read_archived_route_evidence(
    artifacts: &[serde_json::Value],
) -> Result<serde_json::Value, String> {
    let artifact = find_archive_artifact_by_role(artifacts, &["route_evidence"])
        .ok_or_else(|| "archive manifest is missing route_evidence artifact".to_string())?;
    let route_path = artifact
        .get("evidence_path")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "archive route_evidence evidence_path is missing".to_string())?;
    let text = std::fs::read_to_string(&route_path)
        .map_err(|err| format!("archived route evidence is not readable: {err}"))?;
    serde_json::from_str(&text)
        .map_err(|err| format!("archived route evidence JSON parse failed: {err}"))
}

fn read_archived_physical_peer_evidence(
    artifacts: &[serde_json::Value],
) -> Result<serde_json::Value, String> {
    let physical_artifact = find_archive_artifact_by_role(
        artifacts,
        archive_artifact_role_aliases("physical_peer_evidence"),
    )
    .ok_or_else(|| "archive manifest is missing physical_peer_evidence artifact".to_string())?;
    let physical_path = physical_artifact
        .get("evidence_path")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "archive physical_peer_evidence evidence_path is missing".to_string())?;
    let text = std::fs::read_to_string(&physical_path)
        .map_err(|err| format!("archived physical peer evidence is not readable: {err}"))?;
    serde_json::from_str(&text)
        .map_err(|err| format!("archived physical peer evidence JSON parse failed: {err}"))
}

fn verify_archived_peer_identity_binding(
    archive_manifest: &serde_json::Value,
    artifacts: &[serde_json::Value],
) -> Result<(), String> {
    let route_evidence = read_archived_route_evidence(artifacts)?;
    let identity = route_evidence
        .get("peer_identity")
        .and_then(|value| value.as_object())
        .ok_or_else(|| "archived route evidence is missing peer_identity".to_string())?;
    let physical = read_archived_physical_peer_evidence(artifacts)?;

    let target_node = archive_manifest
        .get("target_node")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let target_ip = archive_manifest
        .get("target_ip")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let physical_hostname = physical
        .get("hostname")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "archived physical peer evidence hostname is missing".to_string())?;
    let identity_target_hostname = identity
        .get("target_hostname")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "archived peer_identity target_hostname is missing".to_string())?;
    let target_url_host = identity
        .get("target_url_host")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .unwrap_or("");
    let ok = identity.get("schema").and_then(|value| value.as_str())
        == Some("musu.private_mesh_peer_identity.v1")
        && identity
            .get("target_node")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().eq_ignore_ascii_case(target_node.trim()))
            == Some(true)
        && identity
            .get("target_ip")
            .and_then(|value| value.as_str())
            .map(str::trim)
            == Some(target_ip.trim())
        && identity
            .get("node_distinct")
            .and_then(|value| value.as_bool())
            == Some(true)
        && identity
            .get("tailnet_ip_distinct")
            .and_then(|value| value.as_bool())
            == Some(true)
        && identity
            .get("physical_host_distinct")
            .and_then(|value| value.as_bool())
            == Some(true)
        && identity
            .get("target_url_host_matches_target_ip")
            .and_then(|value| value.as_bool())
            == Some(true)
        && target_url_host == target_ip.trim()
        && identity
            .get("release_identity_bound")
            .and_then(|value| value.as_bool())
            == Some(true)
        && identity
            .get("physical_peer_verified")
            .and_then(|value| value.as_bool())
            == Some(true)
        && physical_hostname.eq_ignore_ascii_case(identity_target_hostname);
    if ok {
        Ok(())
    } else {
        Err(
            "archived peer_identity is not bound to archive target and physical evidence"
                .to_string(),
        )
    }
}

fn verify_archived_physical_peer_time_binding(
    archive_manifest: &serde_json::Value,
    artifacts: &[serde_json::Value],
) -> Result<(), String> {
    let verification = read_archived_verification(artifacts)?;
    let completed_at = verification
        .get("completed_at")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "archived verification completed_at is missing".to_string())?;
    let completed_at = chrono::DateTime::parse_from_rfc3339(completed_at)
        .map(|value| value.with_timezone(&chrono::Utc))
        .map_err(|err| format!("archived verification completed_at is not valid RFC3339: {err}"))?;

    let physical_artifact = find_archive_artifact_by_role(
        artifacts,
        archive_artifact_role_aliases("physical_peer_evidence"),
    )
    .ok_or_else(|| "archive manifest is missing physical_peer_evidence artifact".to_string())?;
    let physical_path = physical_artifact
        .get("evidence_path")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "archive physical_peer_evidence evidence_path is missing".to_string())?;
    let summary = read_physical_peer_evidence_summary_at(&physical_path, completed_at);
    if summary.schema.as_deref() != Some("musu.private_mesh_physical_peer_evidence.v1")
        || !summary.physical_peer_verified
        || !summary.control_server_verified
        || summary
            .hostname
            .as_deref()
            .map(str::trim)
            .unwrap_or("")
            .is_empty()
    {
        return Err("archived physical peer evidence content is not release-grade".to_string());
    }
    if let Some(err) =
        physical_peer_evidence_generated_at_error_at(summary.generated_at.as_deref(), completed_at)
    {
        return Err(format!(
            "archived physical peer evidence release time binding failed: {err}"
        ));
    }

    let target_node = archive_manifest
        .get("target_node")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let target_ip = archive_manifest
        .get("target_ip")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let expected_control_server_url = archive_manifest
        .get("expected_control_server_url")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if summary
        .node_name
        .as_deref()
        .map(|value| value.trim().eq_ignore_ascii_case(target_node.trim()))
        != Some(true)
    {
        return Err(
            "archived physical peer evidence node_name does not match archive target_node"
                .to_string(),
        );
    }
    if summary.tailnet_ip.as_deref().map(str::trim) != Some(target_ip.trim()) {
        return Err(
            "archived physical peer evidence tailnet_ip does not match archive target_ip"
                .to_string(),
        );
    }
    if summary.control_server_url.as_deref().map(|value| {
        value.trim_end_matches('/') == expected_control_server_url.trim_end_matches('/')
    }) != Some(true)
    {
        return Err(
            "archived physical peer evidence control_server_url does not match archive expected_control_server_url"
                .to_string(),
        );
    }
    Ok(())
}

fn require_archived_bundle_check_ok(
    checks: &[serde_json::Value],
    name: &str,
) -> Result<(), String> {
    let check = checks
        .iter()
        .find(|check| check.get("name").and_then(|value| value.as_str()) == Some(name))
        .ok_or_else(|| format!("archived bundle manifest is missing required check '{name}'"))?;
    if check.get("ok").and_then(|value| value.as_bool()) != Some(true) {
        return Err(format!(
            "archived bundle manifest required check '{name}' did not pass"
        ));
    }
    Ok(())
}

fn require_archive_bundle_string_match(
    archive_manifest: &serde_json::Value,
    bundle_manifest: &serde_json::Value,
    field: &str,
) -> Result<(), String> {
    let archive_value = archive_manifest
        .get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("archive manifest {field} is missing"))?;
    let bundle_value = bundle_manifest
        .get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("archived bundle manifest {field} is missing"))?;
    if archive_value.trim_end_matches('/') != bundle_value.trim_end_matches('/') {
        return Err(format!(
            "archived bundle manifest {field} does not match archive manifest"
        ));
    }
    Ok(())
}

fn require_archive_verification_string_match(
    archive_manifest: &serde_json::Value,
    verification: &serde_json::Value,
    field: &str,
) -> Result<(), String> {
    let archive_value = archive_manifest
        .get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("archive manifest {field} is missing"))?;
    let verification_value = verification
        .get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("archived verification {field} is missing"))?;
    if archive_value.trim_end_matches('/') != verification_value.trim_end_matches('/') {
        return Err(format!(
            "archived verification {field} does not match archive manifest"
        ));
    }
    Ok(())
}

fn archive_artifact_role_aliases(role: &str) -> &[&str] {
    match role {
        "verification" => &["verification", "runner_verification", "native_verification"],
        "bundle_manifest" => &["bundle_manifest"],
        "route_evidence" => &["route_evidence"],
        "physical_peer_evidence" => &["physical_peer_evidence"],
        _ => &[],
    }
}

fn find_archive_artifact_by_role<'a>(
    artifacts: &'a [serde_json::Value],
    roles: &[&str],
) -> Option<&'a serde_json::Value> {
    artifacts.iter().find(|artifact| {
        let Some(role) = artifact.get("role").and_then(|value| value.as_str()) else {
            return false;
        };
        roles.iter().any(|candidate| role == *candidate)
    })
}

fn path_is_inside_dir(path: &std::path::Path, dir: &std::path::Path) -> bool {
    match (path.canonicalize(), dir.canonicalize()) {
        (Ok(path), Ok(dir)) => path.starts_with(dir),
        _ => normalize_path_for_compare(path).starts_with(&normalize_path_for_compare(dir)),
    }
}

fn latest_archive_manifest_path(archive_root: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut stack = vec![archive_root.to_path_buf()];
    let mut latest: Option<(u64, std::path::PathBuf)> = None;
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.file_name().and_then(|value| value.to_str())
                != Some("private-mesh-release-proof.archive.json")
            {
                continue;
            }
            let Some(archived_at_unix_ms) = archive_manifest_timestamp_unix_ms(&path) else {
                continue;
            };
            if latest
                .as_ref()
                .map(|(current, _)| archived_at_unix_ms > *current)
                .unwrap_or(true)
            {
                latest = Some((archived_at_unix_ms, path));
            }
        }
    }
    latest.map(|(_, path)| path)
}

fn archive_manifest_timestamp_unix_ms(path: &std::path::Path) -> Option<u64> {
    verify_sidecar_for_file(path).ok()?;
    let text = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    if value.get("schema").and_then(|value| value.as_str())
        != Some("musu.private_mesh_release_proof_archive.v1")
    {
        return None;
    }
    if let Some(unix_ms) = value
        .get("archived_at_unix_ms")
        .and_then(|value| value.as_u64())
    {
        return Some(unix_ms);
    }
    let archived_at = value.get("archived_at").and_then(|value| value.as_str())?;
    let archived_at = chrono::DateTime::parse_from_rfc3339(archived_at).ok()?;
    u64::try_from(archived_at.timestamp_millis()).ok()
}

fn verify_existing_release_bundle_manifest_status(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) -> Result<(), String> {
    let verification_path = result
        .verification_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "verification_path is missing".to_string())?;
    let verification_path = std::path::PathBuf::from(verification_path);
    release_evidence_folder_for_path_in_home(&verification_path.display().to_string(), home)?;
    let manifest_path = verification_path
        .parent()
        .ok_or_else(|| "verification_path has no parent folder".to_string())?
        .join("private-mesh-release-proof.bundle-manifest.json");
    release_evidence_folder_for_path_in_home(&manifest_path.display().to_string(), home)?;
    let (manifest_path, manifest_sidecar_path, _) = verify_sidecar_for_file(&manifest_path)
        .map_err(|err| format!("bundle manifest sidecar: {err}"))?;
    let manifest_text = std::fs::read_to_string(&manifest_path)
        .map_err(|err| format!("bundle manifest is not readable: {err}"))?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_text)
        .map_err(|err| format!("bundle manifest JSON parse failed: {err}"))?;
    if manifest.get("schema").and_then(|value| value.as_str())
        != Some("musu.private_mesh_release_proof_bundle.v1")
    {
        return Err("bundle manifest schema is invalid".to_string());
    }
    let ok = manifest
        .get("ok")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let fail_count = manifest
        .get("fail_count")
        .and_then(|value| value.as_u64())
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(usize::MAX);
    if !result.release_evidence_trusted {
        return Err(
            "current release evidence is not trusted; bundle manifest cannot be accepted"
                .to_string(),
        );
    }
    if manifest
        .get("release_evidence_trusted")
        .and_then(|value| value.as_bool())
        != Some(true)
    {
        return Err("bundle manifest release_evidence_trusted is not true".to_string());
    }
    require_manifest_string_match(
        &manifest,
        "release_bundle_contract",
        PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT,
    )?;
    require_manifest_string_match(&manifest, "target_node", &result.target_node)?;
    require_manifest_string_match(&manifest, "target_ip", &result.target_ip)?;
    if let Some(expected_control_server_url) = result.expected_control_server_url.as_deref() {
        require_manifest_string_match(
            &manifest,
            "expected_control_server_url",
            expected_control_server_url,
        )?;
    }
    require_manifest_artifact_matches(
        &manifest,
        &[
            &["artifacts", "verification"],
            &["artifacts", "native_verification"],
        ],
        &verification_path,
        "verification",
    )?;
    let route_evidence_path = result
        .route_evidence_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "route evidence path is missing".to_string())?;
    release_evidence_folder_for_path_in_home(&route_evidence_path.display().to_string(), home)?;
    require_manifest_artifact_matches(
        &manifest,
        &[&["artifacts", "route_evidence"]],
        &route_evidence_path,
        "route evidence",
    )?;
    verify_sidecar_for_file(&route_evidence_path)
        .map_err(|err| format!("route evidence sidecar: {err}"))?;
    let physical_peer_evidence_path = result
        .physical_peer_evidence_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| {
            json_string(&manifest, &["artifacts", "physical_peer_evidence"])
                .map(std::path::PathBuf::from)
        })
        .ok_or_else(|| "physical peer evidence path is missing".to_string())?;
    require_manifest_artifact_matches(
        &manifest,
        &[&["artifacts", "physical_peer_evidence"]],
        &physical_peer_evidence_path,
        "physical peer evidence",
    )?;
    let (_, physical_peer_sidecar_path, physical_peer_sha256) =
        verify_sidecar_for_file(&physical_peer_evidence_path)
            .map_err(|err| format!("physical peer evidence sidecar: {err}"))?;
    result.physical_peer_evidence_path = Some(physical_peer_evidence_path.display().to_string());
    result.physical_peer_evidence_sha256_path =
        Some(physical_peer_sidecar_path.display().to_string());
    result.physical_peer_evidence_sha256 = Some(physical_peer_sha256);
    let physical_summary =
        read_physical_peer_evidence_summary_for_release(&physical_peer_evidence_path, result)?;
    if !physical_summary.ok {
        return Err("physical peer evidence artifact is not valid".to_string());
    }
    validate_physical_peer_evidence_binding(result, &physical_summary)?;
    let checks = manifest
        .get("checks")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "bundle manifest checks are missing".to_string())?;
    if checks.is_empty() {
        return Err("bundle manifest checks are empty".to_string());
    }
    require_manifest_check_ok(checks, "physical peer evidence release time binding")?;
    let actual_fail_count = checks
        .iter()
        .filter(|check| {
            !check
                .get("ok")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
        })
        .count();
    if actual_fail_count != fail_count {
        return Err("bundle manifest fail_count does not match checks".to_string());
    }
    result.bundle_manifest_path = Some(manifest_path.display().to_string());
    result.bundle_manifest_sha256_path = Some(manifest_sidecar_path.display().to_string());
    result.bundle_manifest_ok = ok && fail_count == 0;
    result.bundle_manifest_fail_count = Some(fail_count);
    result.bundle_manifest_error = if result.bundle_manifest_ok {
        None
    } else {
        Some("bundle manifest reports failed checks".to_string())
    };
    attach_desktop_runtime_identity_from_manifest(result, &manifest);
    if result.bundle_manifest_ok {
        Ok(())
    } else {
        Err("bundle manifest reports failed checks".to_string())
    }
}

fn require_manifest_string_match(
    manifest: &serde_json::Value,
    field: &str,
    expected: &str,
) -> Result<(), String> {
    let actual = manifest
        .get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("bundle manifest {field} is missing"))?;
    if actual.trim_end_matches('/') != expected.trim_end_matches('/') {
        return Err(format!(
            "bundle manifest {field} does not match current evidence"
        ));
    }
    Ok(())
}

fn require_manifest_artifact_matches(
    manifest: &serde_json::Value,
    paths: &[&[&str]],
    expected: &std::path::Path,
    label: &str,
) -> Result<(), String> {
    let actual = paths
        .iter()
        .find_map(|path| json_string(manifest, path))
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("bundle manifest {label} artifact is missing"))?;
    let actual_path = std::path::PathBuf::from(actual);
    if !paths_match(&actual_path, expected) {
        return Err(format!(
            "bundle manifest {label} artifact does not match current evidence"
        ));
    }
    Ok(())
}

fn require_manifest_check_ok(checks: &[serde_json::Value], name: &str) -> Result<(), String> {
    let check = checks
        .iter()
        .find(|check| check.get("name").and_then(|value| value.as_str()) == Some(name))
        .ok_or_else(|| format!("bundle manifest is missing required check '{name}'"))?;
    if check.get("ok").and_then(|value| value.as_bool()) != Some(true) {
        return Err(format!(
            "bundle manifest required check '{name}' did not pass"
        ));
    }
    Ok(())
}

fn paths_match(left: &std::path::Path, right: &std::path::Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => normalize_path_for_compare(left) == normalize_path_for_compare(right),
    }
}

fn normalize_path_for_compare(path: &std::path::Path) -> String {
    path.display()
        .to_string()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string()
}

fn path_has_component(path: &std::path::Path, needle: &str) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .map(|value| value.eq_ignore_ascii_case(needle))
            .unwrap_or(false)
    })
}

fn validate_physical_peer_evidence_binding(
    result: &PrivateMeshReleaseProofDesktopResult,
    evidence: &PhysicalPeerEvidenceDesktopResult,
) -> Result<(), String> {
    let node_name = evidence
        .node_name
        .as_deref()
        .ok_or_else(|| "physical peer evidence node_name is missing".to_string())?;
    if !node_name
        .trim()
        .eq_ignore_ascii_case(result.target_node.trim())
    {
        return Err("physical peer evidence node_name does not match target_node".to_string());
    }
    let tailnet_ip = evidence
        .tailnet_ip
        .as_deref()
        .ok_or_else(|| "physical peer evidence tailnet_ip is missing".to_string())?;
    if tailnet_ip.trim() != result.target_ip.trim() {
        return Err("physical peer evidence tailnet_ip does not match target_ip".to_string());
    }
    if let Some(expected_control_server_url) = result.expected_control_server_url.as_deref() {
        let control_server_url = evidence
            .control_server_url
            .as_deref()
            .ok_or_else(|| "physical peer evidence control_server_url is missing".to_string())?;
        if control_server_url.trim_end_matches('/')
            != expected_control_server_url.trim_end_matches('/')
        {
            return Err(
                "physical peer evidence control_server_url does not match expected_control_server_url"
                    .to_string(),
            );
        }
    }
    let physical_hostname = evidence
        .hostname
        .as_deref()
        .ok_or_else(|| "physical peer evidence hostname is missing".to_string())?;
    let identity_target_hostname = result
        .peer_identity
        .as_ref()
        .and_then(|identity| identity.get("target_hostname"))
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "native peer_identity target_hostname is missing".to_string())?;
    if !physical_hostname
        .trim()
        .eq_ignore_ascii_case(identity_target_hostname.trim())
    {
        return Err(
            "physical peer evidence hostname does not match native peer_identity target_hostname"
                .to_string(),
        );
    }
    Ok(())
}

fn write_or_verify_release_bundle_manifest(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
    physical_peer_evidence_path: Option<&str>,
) -> Result<(), String> {
    let verification_path = result
        .verification_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "verification_path is missing".to_string())?;
    let verification_path = std::path::PathBuf::from(verification_path);
    release_evidence_folder_for_path_in_home(&verification_path.display().to_string(), home)?;
    let evidence_root = verification_path
        .parent()
        .ok_or_else(|| "verification_path has no parent folder".to_string())?;
    let manifest_path = evidence_root.join("private-mesh-release-proof.bundle-manifest.json");
    let physical_path = physical_peer_evidence_path
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| {
            result
                .physical_peer_evidence_path
                .as_deref()
                .map(std::path::PathBuf::from)
        });

    let verification_sidecar = verify_sidecar_for_file(&verification_path)
        .map_err(|err| format!("verification sidecar: {err}"));
    let route_sidecar = result
        .route_evidence_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .map(|path| verify_sidecar_for_file(&path).map_err(|err| format!("route sidecar: {err}")))
        .unwrap_or_else(|| Err("route evidence path is missing".to_string()));
    let physical_sidecar = physical_path
        .as_ref()
        .map(|path| {
            verify_sidecar_for_file(path).map_err(|err| format!("physical peer sidecar: {err}"))
        })
        .unwrap_or_else(|| Err("physical peer evidence path is missing".to_string()));
    let physical_binding = physical_path
        .as_ref()
        .map(|path| {
            let summary = read_physical_peer_evidence_summary_for_release(path, result)?;
            if !summary.ok {
                return Err(summary.error.unwrap_or_else(|| {
                    "physical peer evidence artifact is not valid".to_string()
                }));
            }
            validate_physical_peer_evidence_binding(result, &summary)
        })
        .unwrap_or_else(|| Err("physical peer evidence path is missing".to_string()));
    let physical_time_binding = physical_path
        .as_ref()
        .map(|path| {
            let summary = read_physical_peer_evidence_summary_for_release(path, result)?;
            if summary.ok {
                Ok(())
            } else {
                Err(summary.error.unwrap_or_else(|| {
                    "physical peer evidence release time binding is invalid".to_string()
                }))
            }
        })
        .unwrap_or_else(|| Err("physical peer evidence path is missing".to_string()));

    if let Ok((path, sha256_path, sha256)) = &physical_sidecar {
        result.physical_peer_evidence_path = Some(path.display().to_string());
        result.physical_peer_evidence_sha256_path = Some(sha256_path.display().to_string());
        result.physical_peer_evidence_sha256 = Some(sha256.clone());
    }

    let pre_bundle_trusted = result.software_route_trusted && result.physical_peer_verified;
    let checks = vec![
        serde_json::json!({
            "name": "native release proof ok",
            "ok": result.ok,
            "status": if result.ok { "pass" } else { "fail" }
        }),
        serde_json::json!({
            "name": "verification sha256",
            "ok": verification_sidecar.is_ok(),
            "status": if verification_sidecar.is_ok() { "pass" } else { "fail" },
            "message": verification_sidecar.as_ref().err().cloned().unwrap_or_else(|| "verification sidecar verified".to_string())
        }),
        serde_json::json!({
            "name": "route evidence sha256",
            "ok": route_sidecar.is_ok(),
            "status": if route_sidecar.is_ok() { "pass" } else { "fail" },
            "message": route_sidecar.as_ref().err().cloned().unwrap_or_else(|| "route evidence sidecar verified".to_string())
        }),
        serde_json::json!({
            "name": "release identity bound",
            "ok": result.release_identity_bound,
            "status": if result.release_identity_bound { "pass" } else { "fail" }
        }),
        serde_json::json!({
            "name": "physical peer verified",
            "ok": result.physical_peer_verified,
            "status": if result.physical_peer_verified { "pass" } else { "fail" }
        }),
        serde_json::json!({
            "name": "physical peer evidence sha256",
            "ok": physical_sidecar.is_ok(),
            "status": if physical_sidecar.is_ok() { "pass" } else { "fail" },
            "message": physical_sidecar.as_ref().err().cloned().unwrap_or_else(|| "physical peer sidecar verified".to_string())
        }),
        serde_json::json!({
            "name": "physical peer evidence target binding",
            "ok": physical_binding.is_ok(),
            "status": if physical_binding.is_ok() { "pass" } else { "fail" },
            "message": physical_binding.as_ref().err().cloned().unwrap_or_else(|| "physical peer evidence matches target node/IP/control server".to_string())
        }),
        serde_json::json!({
            "name": "physical peer evidence release time binding",
            "ok": physical_time_binding.is_ok(),
            "status": if physical_time_binding.is_ok() { "pass" } else { "fail" },
            "message": physical_time_binding.as_ref().err().cloned().unwrap_or_else(|| "physical peer evidence generated_at is within 24 hours of release proof completed_at".to_string()),
            "release_completed_at": &result.completed_at
        }),
        serde_json::json!({
            "name": "pre-bundle release evidence trusted",
            "ok": pre_bundle_trusted,
            "status": if pre_bundle_trusted { "pass" } else { "fail" }
        }),
    ];
    let fail_count = checks
        .iter()
        .filter(|check| {
            !check
                .get("ok")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
        })
        .count();
    let manifest = serde_json::json!({
        "schema": "musu.private_mesh_release_proof_bundle.v1",
        "ok": fail_count == 0,
        "checked_at_unix_ms": unix_time_millis(),
        "source": "musu-tauri-native-release-proof",
        "release_bundle_contract": PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT,
        "evidence_root": evidence_root.display().to_string(),
        "target_node": &result.target_node,
        "target_ip": &result.target_ip,
        "expected_control_server_url": &result.expected_control_server_url,
        "desktop_runtime_kind": &result.desktop_runtime_kind,
        "desktop_runtime_packaged": result.desktop_runtime_packaged,
        "desktop_runtime_exe_path": &result.desktop_runtime_exe_path,
        "desktop_runtime_exe_sha256": &result.desktop_runtime_exe_sha256,
        "release_evidence_trusted": fail_count == 0,
        "fail_count": fail_count,
        "checks": checks,
        "artifacts": {
            "verification": verification_path.display().to_string(),
            "verification_sha256": &result.verification_sha256_path,
            "route_evidence": &result.route_evidence_path,
            "route_evidence_sha256": &result.route_evidence_sha256_path,
            "physical_peer_evidence": physical_path.as_ref().map(|path| path.display().to_string()),
            "physical_peer_evidence_sha256": &result.physical_peer_evidence_sha256_path,
        },
        "next_action": if fail_count == 0 {
            "Archive this manifest, every listed artifact, and every listed SHA256 sidecar with the release evidence."
        } else {
            "Do not claim final Private Mesh release proof. Fix failed checks and rerun proof."
        }
    });
    let manifest_text = serde_json::to_string_pretty(&manifest)
        .map_err(|err| format!("bundle manifest JSON serialize failed: {err}"))?;
    std::fs::write(&manifest_path, manifest_text.as_bytes())
        .map_err(|err| format!("bundle manifest write failed: {err}"))?;
    let manifest_sidecar_path = write_json_sidecar_for_file(&manifest_path)?;

    result.bundle_manifest_path = Some(manifest_path.display().to_string());
    result.bundle_manifest_sha256_path = Some(manifest_sidecar_path.display().to_string());
    result.bundle_manifest_ok = fail_count == 0;
    result.bundle_manifest_fail_count = Some(fail_count);
    result.bundle_manifest_error = if fail_count == 0 {
        None
    } else {
        Some("bundle manifest has failed checks".to_string())
    };
    if fail_count == 0 {
        result.release_evidence_trusted = true;
        Ok(())
    } else {
        result.release_evidence_trusted = false;
        Err("bundle manifest has failed checks".to_string())
    }
}

fn write_release_evidence_archive(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) -> Result<(), String> {
    if !result.release_evidence_trusted
        || !result.bundle_manifest_ok
        || result.bundle_manifest_fail_count != Some(0)
    {
        return Err("release proof is not trusted enough to archive".to_string());
    }
    let verification_path = result
        .verification_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "verification_path is missing".to_string())?;
    release_evidence_folder_for_path_in_home(&verification_path.display().to_string(), home)?;
    let evidence_root = verification_path
        .parent()
        .ok_or_else(|| "verification_path has no parent folder".to_string())?;
    let archive_root = evidence_root.join("archive");
    let safe_target =
        sanitize_archive_segment(&format!("{}-{}", result.target_node, result.target_ip));
    let archive_dir = archive_root.join(format!(
        "private-mesh-release-proof-{}-{}",
        safe_target,
        unix_time_millis()
    ));
    std::fs::create_dir_all(&archive_dir)
        .map_err(|err| format!("archive directory create failed: {err}"))?;

    let mut artifacts = Vec::new();
    copy_release_archive_artifact(
        &archive_dir,
        "verification",
        &verification_path,
        &mut artifacts,
    )?;
    copy_release_archive_artifact(
        &archive_dir,
        "bundle_manifest",
        &result
            .bundle_manifest_path
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .map(std::path::PathBuf::from)
            .ok_or_else(|| "bundle_manifest_path is missing".to_string())?,
        &mut artifacts,
    )?;
    copy_release_archive_artifact(
        &archive_dir,
        "route_evidence",
        &result
            .route_evidence_path
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .map(std::path::PathBuf::from)
            .ok_or_else(|| "route_evidence_path is missing".to_string())?,
        &mut artifacts,
    )?;
    copy_release_archive_artifact(
        &archive_dir,
        "physical_peer_evidence",
        &result
            .physical_peer_evidence_path
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .map(std::path::PathBuf::from)
            .ok_or_else(|| "physical_peer_evidence_path is missing".to_string())?,
        &mut artifacts,
    )?;

    let artifact_count = artifacts.len();
    let archive_manifest_path = archive_dir.join("private-mesh-release-proof.archive.json");
    let archive_manifest = serde_json::json!({
        "schema": "musu.private_mesh_release_proof_archive.v1",
        "ok": true,
        "archived_at_unix_ms": unix_time_millis(),
        "source": "musu-tauri-native-release-proof",
        "release_bundle_contract": PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT,
        "target_node": &result.target_node,
        "target_ip": &result.target_ip,
        "expected_control_server_url": &result.expected_control_server_url,
        "desktop_runtime_kind": &result.desktop_runtime_kind,
        "desktop_runtime_packaged": result.desktop_runtime_packaged,
        "desktop_runtime_exe_path": &result.desktop_runtime_exe_path,
        "desktop_runtime_exe_sha256": &result.desktop_runtime_exe_sha256,
        "release_evidence_trusted": true,
        "bundle_manifest_ok": true,
        "bundle_manifest_fail_count": 0,
        "artifact_count": artifact_count,
        "artifacts": artifacts,
    });
    let archive_manifest_text = serde_json::to_string_pretty(&archive_manifest)
        .map_err(|err| format!("archive manifest JSON serialize failed: {err}"))?;
    std::fs::write(&archive_manifest_path, archive_manifest_text.as_bytes())
        .map_err(|err| format!("archive manifest write failed: {err}"))?;
    let archive_manifest_sidecar = write_json_sidecar_for_file(&archive_manifest_path)?;

    result.archive_dir = Some(archive_dir.display().to_string());
    result.archive_manifest_path = Some(archive_manifest_path.display().to_string());
    result.archive_manifest_sha256_path = Some(archive_manifest_sidecar.display().to_string());
    result.archive_artifact_count = Some(artifact_count);
    result.archive_error = None;
    verify_existing_release_archive_status(result, home)
}

fn copy_release_archive_artifact(
    archive_dir: &std::path::Path,
    role: &str,
    source_path: &std::path::Path,
    artifacts: &mut Vec<serde_json::Value>,
) -> Result<(), String> {
    let (_, source_sidecar_path, source_sha256) =
        verify_sidecar_for_file(source_path).map_err(|err| format!("{role} sidecar: {err}"))?;
    let role_dir = archive_dir.join(role);
    std::fs::create_dir_all(&role_dir)
        .map_err(|err| format!("{role} archive directory create failed: {err}"))?;
    let file_name = source_path
        .file_name()
        .ok_or_else(|| format!("{role} source file has no filename"))?;
    let sidecar_name = source_sidecar_path
        .file_name()
        .ok_or_else(|| format!("{role} sidecar file has no filename"))?;
    let target_path = role_dir.join(file_name);
    let target_sidecar_path = role_dir.join(sidecar_name);
    std::fs::copy(source_path, &target_path)
        .map_err(|err| format!("{role} archive copy failed: {err}"))?;
    std::fs::copy(&source_sidecar_path, &target_sidecar_path)
        .map_err(|err| format!("{role} sidecar archive copy failed: {err}"))?;
    let (_, copied_sidecar_path, copied_sha256) = verify_sidecar_for_file(&target_path)
        .map_err(|err| format!("{role} copied artifact integrity failed: {err}"))?;
    if copied_sha256 != source_sha256 {
        return Err(format!("{role} copied artifact SHA256 changed"));
    }
    artifacts.push(serde_json::json!({
        "role": role,
        "evidence_path": target_path.display().to_string(),
        "sha256_path": copied_sidecar_path.display().to_string(),
        "sha256": copied_sha256,
    }));
    Ok(())
}

fn sanitize_archive_segment(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let sanitized = sanitized.trim_matches('_').to_string();
    if sanitized.is_empty() {
        "private-mesh".to_string()
    } else {
        sanitized
    }
}

fn verify_sidecar_for_file(
    path: &std::path::Path,
) -> Result<(std::path::PathBuf, std::path::PathBuf, String), String> {
    let bytes =
        std::fs::read(path).map_err(|err| format!("evidence file is not readable: {err}"))?;
    let sidecar_path = std::path::PathBuf::from(format!("{}.sha256", path.display()));
    let sidecar_text = std::fs::read_to_string(&sidecar_path)
        .map_err(|err| format!("SHA256 sidecar is not readable: {err}"))?;
    let sidecar: serde_json::Value = serde_json::from_str(&sidecar_text)
        .map_err(|err| format!("SHA256 sidecar JSON parse failed: {err}"))?;
    if sidecar.get("schema").and_then(|value| value.as_str())
        != Some("musu.evidence_integrity_sidecar.v1")
    {
        return Err("SHA256 sidecar schema is invalid".to_string());
    }
    if sidecar.get("algorithm").and_then(|value| value.as_str()) != Some("sha256") {
        return Err("SHA256 sidecar algorithm is invalid".to_string());
    }
    if sidecar
        .get("evidence_file")
        .and_then(|value| value.as_str())
        != path.file_name().and_then(|value| value.to_str())
    {
        return Err("SHA256 sidecar evidence_file is invalid".to_string());
    }
    let expected = sidecar
        .get("sha256")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "SHA256 sidecar is missing sha256".to_string())?;
    let actual = sha256_hex(&bytes);
    if !expected.eq_ignore_ascii_case(&actual) {
        return Err("SHA256 sidecar does not match evidence file".to_string());
    }
    Ok((path.to_path_buf(), sidecar_path, actual))
}

fn write_json_sidecar_for_file(path: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let bytes =
        std::fs::read(path).map_err(|err| format!("sidecar source file is not readable: {err}"))?;
    let sidecar_path = std::path::PathBuf::from(format!("{}.sha256", path.display()));
    let evidence_file = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("evidence.json");
    let sidecar = serde_json::json!({
        "schema": "musu.evidence_integrity_sidecar.v1",
        "algorithm": "sha256",
        "evidence_file": evidence_file,
        "sha256": sha256_hex(&bytes),
        "recorded_at_unix_ms": unix_time_millis(),
    });
    let sidecar_text = serde_json::to_string_pretty(&sidecar)
        .map_err(|err| format!("sidecar JSON serialize failed: {err}"))?;
    std::fs::write(&sidecar_path, sidecar_text.as_bytes())
        .map_err(|err| format!("sidecar write failed: {err}"))?;
    Ok(sidecar_path)
}

fn unix_time_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn attach_release_peer_identity(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) {
    let Err(err) = load_release_peer_identity(result, home) else {
        return;
    };
    if result.route_transport_error.is_some() && result.peer_identity.is_some() {
        return;
    }
    result.release_identity_bound = false;
    result.peer_identity_error = Some(err);
}

fn attach_route_evidence_integrity(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) {
    let Err(err) = verify_route_evidence_integrity(result, home) else {
        return;
    };
    result.route_evidence_integrity_verified = false;
    result.route_evidence_integrity_error = Some(err);
}

fn verify_route_evidence_integrity(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) -> Result<(), String> {
    let route_evidence_path = result
        .route_evidence_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "route_evidence_path is missing".to_string())?;
    let route_evidence_path = std::path::PathBuf::from(route_evidence_path);
    release_evidence_folder_for_path_in_home(&route_evidence_path.display().to_string(), home)?;
    let route_bytes = std::fs::read(&route_evidence_path)
        .map_err(|err| format!("route evidence file is not readable: {err}"))?;
    let sidecar_path =
        std::path::PathBuf::from(format!("{}.sha256", route_evidence_path.display()));
    release_evidence_folder_for_path_in_home(&sidecar_path.display().to_string(), home)?;
    let sidecar_text = std::fs::read_to_string(&sidecar_path)
        .map_err(|err| format!("route evidence SHA256 sidecar is not readable: {err}"))?;
    let sidecar: serde_json::Value = serde_json::from_str(&sidecar_text)
        .map_err(|err| format!("route evidence SHA256 sidecar JSON parse failed: {err}"))?;
    if sidecar.get("schema").and_then(|value| value.as_str())
        != Some("musu.evidence_integrity_sidecar.v1")
    {
        return Err("route evidence SHA256 sidecar schema is invalid".to_string());
    }
    if sidecar.get("algorithm").and_then(|value| value.as_str()) != Some("sha256") {
        return Err("route evidence SHA256 sidecar algorithm is invalid".to_string());
    }
    if sidecar
        .get("evidence_file")
        .and_then(|value| value.as_str())
        != route_evidence_path
            .file_name()
            .and_then(|value| value.to_str())
    {
        return Err("route evidence SHA256 sidecar evidence_file is invalid".to_string());
    }
    let expected = sidecar
        .get("sha256")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "route evidence SHA256 sidecar is missing sha256".to_string())?;
    let actual = sha256_hex(&route_bytes);
    if !expected.eq_ignore_ascii_case(&actual) {
        return Err("route evidence SHA256 sidecar does not match evidence file".to_string());
    }
    result.route_evidence_sha256_path = Some(sidecar_path.display().to_string());
    result.route_evidence_sha256 = Some(actual);
    result.route_evidence_integrity_verified = true;
    result.route_evidence_integrity_error = None;
    Ok(())
}

fn load_release_peer_identity(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) -> Result<(), String> {
    if !result.route_evidence_integrity_verified {
        return Err(result
            .route_evidence_integrity_error
            .clone()
            .unwrap_or_else(|| "route evidence hash is not verified".to_string()));
    }
    let route_evidence_path = result
        .route_evidence_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "route_evidence_path is missing".to_string())?;
    let route_evidence_path = std::path::PathBuf::from(route_evidence_path);
    release_evidence_folder_for_path_in_home(&route_evidence_path.display().to_string(), home)?;
    let text = std::fs::read_to_string(&route_evidence_path)
        .map_err(|err| format!("route evidence file is not readable: {err}"))?;
    let route_evidence: serde_json::Value = serde_json::from_str(&text)
        .map_err(|err| format!("route evidence JSON parse failed: {err}"))?;
    let identity = route_evidence
        .get("peer_identity")
        .cloned()
        .ok_or_else(|| "route evidence is missing peer_identity".to_string())?;
    if identity.get("schema").and_then(|value| value.as_str())
        != Some("musu.private_mesh_peer_identity.v1")
    {
        result.peer_identity = Some(identity);
        return Err("peer_identity schema is invalid".to_string());
    }
    let release_identity_bound = identity
        .get("release_identity_bound")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let physical_peer_verified = identity
        .get("physical_peer_verified")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    result.peer_identity = Some(identity);
    result.release_identity_bound = release_identity_bound;
    result.physical_peer_verified = physical_peer_verified;
    result.peer_identity_error = if release_identity_bound {
        None
    } else {
        Some("peer identity tuple is not release-bound".to_string())
    };
    result.physical_peer_error = if physical_peer_verified {
        None
    } else {
        Some("physical peer evidence is missing".to_string())
    };
    verify_private_mesh_route_transport(result, &route_evidence)?;
    Ok(())
}

fn verify_private_mesh_route_transport(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    route_evidence: &serde_json::Value,
) -> Result<(), String> {
    let verification = verify_private_mesh_route_transport_contract(
        route_evidence,
        &result.target_ip,
        result.expected_control_server_url.as_deref().unwrap_or(""),
    );
    let ok = verification.is_ok();
    result.route_transport_verified = ok;
    result.route_transport_error = verification.err();

    if ok {
        Ok(())
    } else {
        Err(result
            .route_transport_error
            .clone()
            .unwrap_or_else(|| "private mesh route transport is not release-grade".to_string()))
    }
}

fn verify_private_mesh_route_transport_contract(
    route_evidence: &serde_json::Value,
    target_ip: &str,
    expected_control_server_url: &str,
) -> Result<(), String> {
    let schema = route_evidence
        .get("schema")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let route_kind = route_evidence
        .get("route_kind")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let route_result = route_evidence
        .get("result")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let candidate_addr = route_evidence
        .get("candidate_addr")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let candidate_host = candidate_addr.split(':').next().unwrap_or("").trim();
    let encryption = route_evidence
        .get("encryption")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let transport_verified_by = route_evidence
        .get("transport_verified_by")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let private_mesh_mode = route_evidence
        .get("private_mesh_mode")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let private_mesh_control_server_url = route_evidence
        .get("private_mesh_control_server_url")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let private_mesh_control_server_verified = route_evidence
        .get("private_mesh_control_server_verified")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let payload_transited_musu_infra = route_evidence
        .get("payload_transited_musu_infra")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    let expected_control_server_url = expected_control_server_url.trim_end_matches('/');
    let actual_control_server_url = private_mesh_control_server_url.trim_end_matches('/');

    let ok = schema == "musu.route_evidence.v1"
        && route_kind == "tailscale"
        && route_result == "success"
        && candidate_host == target_ip
        && is_tailnet_ipv4(candidate_host)
        && encryption == "tailscale_wireguard_overlay"
        && transport_verified_by == "musu_private_mesh_tailnet_route"
        && private_mesh_mode == "musu_headscale"
        && private_mesh_control_server_verified
        && !expected_control_server_url.is_empty()
        && !actual_control_server_url.is_empty()
        && actual_control_server_url == expected_control_server_url
        && !payload_transited_musu_infra;

    if ok {
        Ok(())
    } else {
        Err(format!(
            "private mesh route transport is not release-grade: schema={schema}, route_kind={route_kind}, result={route_result}, candidate_host={candidate_host}, encryption={encryption}, transport_verified_by={transport_verified_by}, private_mesh_mode={private_mesh_mode}, private_mesh_control_server_url={private_mesh_control_server_url}, private_mesh_control_server_verified={private_mesh_control_server_verified}, payload_transited_musu_infra={payload_transited_musu_infra}"
        ))
    }
}

fn verify_release_evidence_integrity(
    result: &mut PrivateMeshReleaseProofDesktopResult,
    home: &std::path::Path,
) -> Result<(), String> {
    let verification_path = result
        .verification_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "verification_path is missing".to_string())?;
    let verification_path = std::path::PathBuf::from(verification_path);
    release_evidence_folder_for_path_in_home(&verification_path.display().to_string(), home)?;
    let verification_bytes = std::fs::read(&verification_path)
        .map_err(|err| format!("verification file is not readable: {err}"))?;
    let sidecar_path = result
        .verification_sha256_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::path::PathBuf::from(format!("{}.sha256", verification_path.display()))
        });
    release_evidence_folder_for_path_in_home(&sidecar_path.display().to_string(), home)?;
    let sidecar_text = std::fs::read_to_string(&sidecar_path)
        .map_err(|err| format!("verification SHA256 sidecar is not readable: {err}"))?;
    let sidecar: serde_json::Value = serde_json::from_str(&sidecar_text)
        .map_err(|err| format!("verification SHA256 sidecar JSON parse failed: {err}"))?;
    if sidecar.get("schema").and_then(|value| value.as_str())
        != Some("musu.evidence_integrity_sidecar.v1")
    {
        return Err("verification SHA256 sidecar schema is invalid".to_string());
    }
    if sidecar.get("algorithm").and_then(|value| value.as_str()) != Some("sha256") {
        return Err("verification SHA256 sidecar algorithm is invalid".to_string());
    }
    if sidecar
        .get("evidence_file")
        .and_then(|value| value.as_str())
        != verification_path
            .file_name()
            .and_then(|value| value.to_str())
    {
        return Err("verification SHA256 sidecar evidence_file is invalid".to_string());
    }
    let expected = sidecar
        .get("sha256")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "verification SHA256 sidecar is missing sha256".to_string())?;
    let actual = sha256_hex(&verification_bytes);
    if !expected.eq_ignore_ascii_case(&actual) {
        return Err("verification SHA256 sidecar does not match evidence file".to_string());
    }
    result.verification_sha256_path = Some(sidecar_path.display().to_string());
    result.verification_sha256 = Some(actual);
    result.integrity_verified = true;
    result.integrity_error = None;
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;

    let digest = sha2::Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write as _;
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}

fn is_tailnet_ipv4(value: &str) -> bool {
    let octets: Vec<u8> = value
        .split('.')
        .map(str::parse::<u8>)
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default();
    octets.len() == 4 && octets[0] == 100 && (64..=127).contains(&octets[1])
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

fn release_evidence_folder_for_path(path: &str) -> Result<std::path::PathBuf, String> {
    release_evidence_folder_for_path_in_home(path, &musu_home())
}

fn release_evidence_folder_for_path_in_home(
    path: &str,
    home: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    let raw_path = path.trim();
    if raw_path.is_empty() {
        return Err("release evidence path is empty".to_string());
    }
    let requested = std::path::PathBuf::from(raw_path);
    let canonical_requested = requested
        .canonicalize()
        .map_err(|err| format!("release evidence path is not readable: {err}"))?;
    let evidence_root = home.join("private-mesh-release-proof");
    let canonical_root = evidence_root.canonicalize().map_err(|err| {
        format!(
            "release evidence root is not readable: {} ({err})",
            evidence_root.display()
        )
    })?;
    if !canonical_requested.starts_with(&canonical_root) {
        return Err("release evidence path is outside MUSU private proof evidence".to_string());
    }
    let folder = if canonical_requested.is_file() {
        canonical_requested
            .parent()
            .map(std::path::Path::to_path_buf)
            .ok_or_else(|| "release evidence file has no parent folder".to_string())?
    } else {
        canonical_requested
    };
    if !folder.starts_with(&canonical_root) {
        return Err("release evidence folder is outside MUSU private proof evidence".to_string());
    }
    Ok(folder)
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
    http_get_with_headers(base, path, &[])
}

fn http_get_with_bearer(base: &str, path: &str, token: &str) -> Result<String, String> {
    let authorization = bearer_authorization_header(token)?;
    http_get_with_headers(base, path, &[authorization.as_str()])
}

fn bearer_authorization_header(token: &str) -> Result<String, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("bridge token is empty".to_string());
    }
    if token.bytes().any(|byte| byte <= 0x1f || byte == 0x7f) {
        return Err("bridge token contains control characters".to_string());
    }
    Ok(format!("Authorization: Bearer {token}"))
}

fn http_get_with_headers(base: &str, path: &str, headers: &[&str]) -> Result<String, String> {
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
    let mut request = format!("GET {path} HTTP/1.1\r\nHost: {host_port}\r\n");
    for header in headers {
        request.push_str(header);
        request.push_str("\r\n");
    }
    request.push_str("Connection: close\r\n\r\n");
    std::io::Write::write_all(&mut stream, request.as_bytes())
        .map_err(|err| format!("request write failed: {err}"))?;

    let mut response = String::new();
    std::io::Read::read_to_string(&mut stream, &mut response)
        .map_err(|err| format!("response read failed: {err}"))?;
    Ok(response)
}

fn http_response_body(response: &str) -> Option<&str> {
    response
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .or_else(|| response.split_once("\n\n").map(|(_, body)| body))
}

fn http_status_code(response: &str) -> Option<u16> {
    response
        .lines()
        .next()?
        .split_whitespace()
        .nth(1)?
        .parse::<u16>()
        .ok()
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
    if let Some(path) = sibling_exe_for_current_exe(current_exe, musu_runtime_exe_name(), &exists) {
        return path;
    }
    std::path::PathBuf::from(musu_runtime_exe_name())
}

/// Shared sibling-resolution: prefer `<dir of current exe>/<exe_name>`.
/// Single-binary integration: there's now one runtime exe, `musu`; if the
/// installer does not lay it next to the desktop exe, fall back to PATH.
fn sibling_exe_for_current_exe(
    current_exe: &std::path::Path,
    exe_name: &str,
    exists: impl Fn(&std::path::Path) -> bool,
) -> Option<std::path::PathBuf> {
    if let Some(parent) = current_exe.parent() {
        let sibling = parent.join(exe_name);
        if exists(&sibling) {
            return Some(sibling);
        }
    }
    None
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
        archive_manifest_timestamp_unix_ms, attach_or_create_release_bundle_manifest,
        attach_release_evidence_integrity, attach_release_peer_identity,
        attach_route_evidence_integrity, bridge_is_healthy,
        bridge_registry_status_with_pid_checker, bridge_status_label, can_start_runtime,
        developer_dashboard_surface_enabled_for, fleet_nodes_from_bridge_dashboard,
        is_packaged_desktop_runtime_path, is_tailnet_ipv4, latest_physical_peer_evidence_from_home,
        latest_release_evidence_from_home, local_os_hostname, musu_command_path_for_current_exe,
        parse_doctor_status_summary, parse_private_mesh_desktop_status,
        parse_private_mesh_release_proof_result, parse_private_mesh_verify_result,
        parse_queued_task_id, read_physical_peer_evidence_summary,
        release_evidence_folder_for_path, release_proof_command_args, run_command_with_timeout,
        parse_appinstaller_version, sha256_hex, startup_marker_path, summarize_process_ownership,
        update_helper_script, update_is_available, update_release_evidence_trust,
        verify_sidecar_for_file, version_to_tuple, write_json_sidecar_for_file,
        DESKTOP_MSIX_URL, PACKAGE_IDENTITY_NAME,
        PrivateMeshReleaseProofDesktopResult, ProcessEntry, RuntimeStartGate,
        PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT,
    };

    // WS-U version-compare tests. The normalization rules these assert are the
    // exact port of `Normalize-Version` (scripts/windows/build-msix.ps1:149-184):
    // strip +meta, split core/pre on first '-', 3-part core folds the prerelease
    // counter into the 4th octet, comparison is numeric per-octet (never lexical).
    #[test]
    fn version_to_tuple_folds_rc_into_fourth_octet() {
        // build-msix.ps1:179-182 — 3-part core + "rc.11" → 4th octet 11.
        assert_eq!(version_to_tuple("1.15.0-rc.11"), [1, 15, 0, 11]);
        // build-msix.ps1:160 — no prerelease → 4th octet 0.
        assert_eq!(version_to_tuple("1.15.0"), [1, 15, 0, 0]);
        // build-msix.ps1:157 — build metadata after '+' is dropped.
        assert_eq!(version_to_tuple("1.15.0-rc.3+build.99"), [1, 15, 0, 3]);
        // build-msix.ps1:175-178 — explicit 4-part core kept as-is.
        assert_eq!(version_to_tuple("1.15.0.7"), [1, 15, 0, 7]);
        // build-msix.ps1:171-173 — first digit run only ("beta3" → 3).
        assert_eq!(version_to_tuple("2.0.0-beta3"), [2, 0, 0, 3]);
    }

    #[test]
    fn update_helper_script_has_protocol_free_self_update_invariants() {
        let script = update_helper_script(4242);
        // 1. Waits for THIS cockpit PID to exit before installing (else 0x80073D02).
        assert!(
            script.contains("Wait-Process -Id 4242"),
            "must wait on the passed cockpit PID: {script}"
        );
        // 2. Downloads the hosted .msix (protocol-free — no ms-appinstaller:).
        assert!(script.contains(DESKTOP_MSIX_URL), "must fetch the hosted .msix");
        assert!(
            !script.contains("ms-appinstaller:"),
            "must NOT use the OS-disabled ms-appinstaller protocol"
        );
        // 3. Installs directly via Add-AppxPackage (per-user, unelevated) and does
        //    NOT use -ForceUpdateFromAnyVersion (audit B: that allows downgrade).
        assert!(script.contains("Add-AppxPackage"), "must install the .msix directly");
        assert!(
            !script.contains("ForceUpdateFromAnyVersion"),
            "must NOT defeat the OS monotonic-version guard (downgrade vector)"
        );
        // 4. Resolves the package by its stable identity name and relaunches via
        //    the shell AUMID (user session), not by exe path / elevated.
        assert!(
            script.contains(&format!("Get-AppxPackage -Name '{PACKAGE_IDENTITY_NAME}'")),
            "must resolve the installed package by identity name"
        );
        assert!(
            script.contains("shell:AppsFolder\\"),
            "must relaunch via shell AUMID so the app lands in the user session"
        );
        // 5. Audit E: never vanish silently. Relaunch is in a `finally` (fires on
        //    success AND failure), AUMID is captured BEFORE install (so a failed
        //    install still relaunches the old version), and a transcript log is
        //    left as a breadcrumb. Download is bounded so it can't hang forever.
        assert!(script.contains("finally"), "relaunch must be in finally (always fires)");
        assert!(script.contains("Start-Transcript"), "must log for post-failure diagnosis");
        assert!(script.contains("-TimeoutSec 120"), "download must be bounded");
        // 6. Live-install fix: waiting on the cockpit PID alone is insufficient —
        //    the bridge (musu.exe) also holds the package files, so Add-AppxPackage
        //    hits 0x80073D02 unless EVERY package process is gone. Must poll/kill
        //    both musu-desktop and musu before installing.
        assert!(
            script.contains("Get-Process -Name 'musu-desktop','musu','musud'"),
            "must wait for ALL package processes (cockpit + bridge + supervisor), not just the cockpit PID"
        );
    }

    #[test]
    fn update_available_same_core_compares_fourth_octet() {
        // Spec case: rc.11 vs rc.12 → true (newer 4th octet).
        assert!(update_is_available("1.15.0-rc.11", "1.15.0-rc.12"));
        // Spec case: rc.11 vs rc.11 → false (identical).
        assert!(!update_is_available("1.15.0-rc.11", "1.15.0-rc.11"));
        // Hosted older 4th octet → false (no downgrade prompt).
        assert!(!update_is_available("1.15.0-rc.12", "1.15.0-rc.11"));
    }

    #[test]
    fn update_available_lexical_trap_uses_numeric_compare() {
        // Spec case (H-1 lexical trap): "1.15.0.9" > "1.15.0.11" as STRINGS, but
        // 11 > 9 numerically → update IS available.
        assert!(update_is_available("1.15.0-rc.9", "1.15.0-rc.11"));
        // And the reverse must NOT trigger (9 < 11).
        assert!(!update_is_available("1.15.0-rc.11", "1.15.0-rc.9"));
    }

    #[test]
    fn update_available_core_differs_overrides_fourth_octet() {
        // Spec case: 1.15.0 vs 1.16.0 → true (core differs).
        assert!(update_is_available("1.15.0", "1.16.0"));
        // H-1b backstop: GA 1.15.0 (=1.15.0.0) installed, hosted rc 1.15.0.11 has
        // a LOWER... no — same core, so 4th-octet rule: 11 > 0 → true.
        assert!(update_is_available("1.15.0", "1.15.0-rc.11"));
        // H-1b the harder direction: installed rc 1.15.0.11, hosted GA 1.16.0 —
        // core differs → true regardless of 4th octet (0 < 11 would be false
        // under naive octet compare, but core-differs wins).
        assert!(update_is_available("1.15.0-rc.11", "1.16.0"));
    }

    #[test]
    fn update_available_never_offers_a_downgrade() {
        // WS-U code audit 2026-06-24: a canary install (higher core) against a
        // desktop-latest channel still on stable (lower core) must NOT show a
        // "update available" toast — that would be a misleading downgrade prompt.
        assert!(!update_is_available("1.16.0", "1.15.0"));
        // Same major.minor, lower build core hosted → no downgrade.
        assert!(!update_is_available("1.15.1", "1.15.0"));
        // Sanity: the legitimate upgrade direction still fires.
        assert!(update_is_available("1.15.0", "1.16.0"));
    }

    #[test]
    fn parse_appinstaller_version_reads_root_attribute() {
        // M-4: anchor on root <AppInstaller Version=...>, not a nested element's.
        let xml = r#"<?xml version="1.0"?>
<AppInstaller xmlns="http://schemas.microsoft.com/appx/appinstaller/2018"
    Uri="https://example/musu.appinstaller" Version="1.15.0.12">
  <MainPackage Name="musu" Version="9.9.9.9" Publisher="CN=x" />
</AppInstaller>"#;
        assert_eq!(parse_appinstaller_version(xml).as_deref(), Some("1.15.0.12"));
    }

    #[test]
    fn parse_appinstaller_version_graceful_on_garbage() {
        assert_eq!(parse_appinstaller_version("not xml at all"), None);
        assert_eq!(parse_appinstaller_version("<AppInstaller Uri=\"x\">"), None);
    }

    const TEST_MARKER: &str = "musu-desktop-command-capture-ok";

    /// V28 P1: submit_order parses the task id from `musu route`'s queued line so
    /// the cockpit can poll it. Guard the parse against glyph/whitespace variance
    /// and the absent / "unknown" cases.
    #[test]
    fn parse_queued_task_id_extracts_id_or_none() {
        assert_eq!(
            parse_queued_task_id("✓ Task queued: abc-123\n"),
            Some("abc-123".to_string())
        );
        assert_eq!(
            parse_queued_task_id("noise\n  Task queued:   def-456  \nmore"),
            Some("def-456".to_string())
        );
        assert_eq!(parse_queued_task_id("✓ Task queued: unknown\n"), None);
        assert_eq!(parse_queued_task_id("order rejected: peer not found"), None);
        assert_eq!(parse_queued_task_id(""), None);
    }

    #[test]
    fn bridge_dashboard_projects_to_fleet_nodes_without_cli_envelope() {
        let dashboard = serde_json::json!({
            "this_node": {
                "name": "this-laptop",
                "addr": "http://127.0.0.1:8070",
                "last_seen": "2026-06-14T01:02:03Z",
                "mesh_mode": "musu_headscale",
                "route_label": "Private Mesh",
                "tailscale_ip": "100.64.0.10",
                "control_server_url": "https://mesh.example",
                "control_server_verified": true
            },
            "peers": [
                {
                    "name": "studio-pc",
                    "addr": "http://100.64.0.11:8070",
                    "last_seen": "2026-06-14T01:02:04Z",
                    "mesh_mode": "musu_headscale",
                    "route_label": "Private Mesh",
                    "tailscale_ip": "100.64.0.11",
                    "control_server_url": "https://mesh.example",
                    "control_server_verified": true
                },
                {
                    "name": "offline-pc",
                    "addr": "http://100.64.0.12:8070",
                    "last_seen": "",
                    "status_error": "node status unreadable"
                }
            ]
        });

        let nodes = fleet_nodes_from_bridge_dashboard(&dashboard);

        assert_eq!(nodes.len(), 3);
        assert_eq!(nodes[0].node_name, "this-laptop");
        assert!(nodes[0].is_this_pc);
        assert_eq!(nodes[1].node_name, "studio-pc");
        assert_eq!(nodes[1].mesh_mode.as_deref(), Some("musu_headscale"));
        assert_eq!(nodes[1].tailscale_ip.as_deref(), Some("100.64.0.11"));
        assert!(nodes[1].control_server_verified);
        assert_eq!(nodes[2].node_name, "offline-pc");
        assert_eq!(nodes[2].last_seen, "");
        assert_eq!(
            nodes[2].status_error.as_deref(),
            Some("node status unreadable")
        );
    }

    #[test]
    fn bearer_authorization_header_trims_valid_token() {
        assert_eq!(
            super::bearer_authorization_header("  abc123  ").unwrap(),
            "Authorization: Bearer abc123"
        );
    }

    #[test]
    fn bearer_authorization_header_rejects_control_characters() {
        assert!(super::bearer_authorization_header("abc\r\nX-Injected: true").is_err());
        assert!(super::bearer_authorization_header("abc\u{7f}").is_err());
        assert!(super::bearer_authorization_header("   ").is_err());
    }

    #[test]
    fn http_status_code_parses_local_bridge_auth_failures() {
        assert_eq!(
            super::http_status_code("HTTP/1.1 200 OK\r\n\r\n{}"),
            Some(200)
        );
        assert_eq!(
            super::http_status_code("HTTP/1.1 401 Unauthorized\r\n\r\n{}"),
            Some(401)
        );
        assert_eq!(
            super::http_status_code("HTTP/1.1 403 Forbidden\r\n\r\n{}"),
            Some(403)
        );
        assert_eq!(super::http_status_code("not-http"), None);
    }

    #[test]
    fn private_mesh_status_parser_preserves_release_gate_fields() {
        let status = parse_private_mesh_desktop_status(
            r#"{
              "mode": "musu_headscale",
              "route_label": "Private Mesh",
              "account_requirement": "no Tailscale.com account",
              "control_server_url": "https://mesh.example",
              "control_server_verified": true,
              "derp_policy": "musu_or_operator_managed",
              "derp_readiness": "declared_private",
              "derp_probe_ok": true,
              "derp_probe_command": {
                "found": true,
                "exit_code": 0,
                "stdout": "headscale ok",
                "stderr": null
              },
              "local_tailnet_ip": "100.64.0.10",
              "verified_target_tailnet_ip": "100.64.0.11",
              "callback_tailnet_ip": "100.64.0.11",
              "target_callback_match": true,
              "compatible_client_found": true,
              "verification": {
                "tailscale_ping_verified": true,
                "bridge_health_verified": true,
                "callback_verified": false,
                "release_grade": false
              },
              "warnings": ["callback proof missing"],
              "next_steps": ["Run delegated task proof."]
            }"#,
        )
        .expect("mesh status JSON should parse");

        assert!(status.ok);
        assert_eq!(status.mode, "musu_headscale");
        assert_eq!(status.route_label, "Private Mesh");
        assert_eq!(
            status.control_server_url.as_deref(),
            Some("https://mesh.example")
        );
        assert_eq!(
            status.verified_target_tailnet_ip.as_deref(),
            Some("100.64.0.11")
        );
        assert_eq!(status.callback_tailnet_ip.as_deref(), Some("100.64.0.11"));
        assert!(status.target_callback_match);
        assert!(status.control_server_verified);
        assert_eq!(
            status.derp_policy.as_deref(),
            Some("musu_or_operator_managed")
        );
        assert_eq!(status.derp_readiness, "declared_private");
        assert!(status.derp_probe_ran);
        assert!(status.derp_probe_ok);
        assert_eq!(status.derp_probe_detail.as_deref(), Some("headscale ok"));
        assert!(status.tailscale_ping_verified);
        assert!(status.bridge_health_verified);
        assert!(!status.callback_verified);
        assert!(!status.release_grade);
        assert_eq!(
            status.next_steps,
            vec!["Run delegated task proof.".to_string()]
        );
    }

    #[test]
    fn private_mesh_verify_parser_preserves_peer_proof_fields() {
        let result = parse_private_mesh_verify_result(
            "100.64.0.11",
            r#"{
              "schema": "musu.private_mesh_verify.v1",
              "product_name": "MUSU Private Mesh",
              "target_ip": "100.64.0.11",
              "target_bridge_health_url": "http://100.64.0.11:8070/health",
              "ping": {
                "found": true,
                "exit_code": 0,
                "stdout": "pong",
                "stderr": ""
              },
              "bridge_health_ok": true,
              "bridge_health_status": 200,
              "callback_verified": false,
              "callback_tailnet_ip": "100.64.0.11",
              "target_callback_match": false,
              "release_grade": false,
              "next_steps": ["Run delegated task proof and callback reconciliation."]
            }"#,
        )
        .expect("mesh verify JSON should parse");

        assert!(result.ok);
        assert_eq!(result.target_ip, "100.64.0.11");
        assert!(result.ping_ok);
        assert!(result.bridge_health_ok);
        assert_eq!(result.bridge_health_status, Some(200));
        assert!(!result.callback_verified);
        assert_eq!(result.callback_tailnet_ip.as_deref(), Some("100.64.0.11"));
        assert!(!result.target_callback_match);
        assert!(!result.release_grade);
        assert_eq!(
            result.next_steps,
            vec!["Run delegated task proof and callback reconciliation.".to_string()]
        );
    }

    #[test]
    fn private_mesh_release_proof_parser_preserves_evidence_paths() {
        let result = parse_private_mesh_release_proof_result(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            r#"{
              "schema": "musu.private_mesh_release_proof.v1",
              "ok": true,
              "target_node": "studio-pc",
              "target_ip": "100.64.0.11",
              "evidence_root": "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613",
              "route_evidence_path": "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-route-proof.evidence.json",
              "verification_path": "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-release-proof.verification.json",
              "verification_sha256_path": "C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613\\private-mesh-release-proof.verification.json.sha256",
              "expected_control_server_url": "https://mesh.example",
              "error": null
            }"#,
        )
        .expect("mesh release-proof JSON should parse");

        assert!(result.ok);
        assert_eq!(result.target_node, "studio-pc");
        assert_eq!(result.target_ip, "100.64.0.11");
        assert_eq!(
            result.expected_control_server_url.as_deref(),
            Some("https://mesh.example")
        );
        assert_eq!(
            result.evidence_root.as_deref(),
            Some("C:\\Users\\empty\\.musu\\private-mesh-release-proof\\20260613")
        );
        assert!(result
            .verification_sha256_path
            .as_deref()
            .unwrap_or_default()
            .ends_with("private-mesh-release-proof.verification.json.sha256"));
        assert!(!result.route_evidence_integrity_verified);
        assert!(result.route_evidence_sha256.is_none());
        assert!(!result.integrity_verified);
        assert!(!result.release_identity_bound);
        assert!(!result.physical_peer_verified);
        assert!(!result.software_route_trusted);
        assert!(!result.release_evidence_trusted);
        assert!(result.peer_identity.is_none());
    }

    #[test]
    fn release_proof_parser_requires_archive_verifier_ok_schema_and_fail_count() {
        let forged = parse_private_mesh_release_proof_result(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            r#"{
              "schema": "musu.private_mesh_release_proof.v1",
              "ok": true,
              "target_node": "studio-pc",
              "target_ip": "100.64.0.11",
              "archive_verifier_ok": true
            }"#,
        )
        .expect("forged archive verifier flag should still parse");
        assert!(!forged.archive_verifier_ok);
        assert!(forged.archive_verifier_schema.is_none());
        assert!(forged.archive_verifier_fail_count.is_none());

        let forged_false_ok = parse_private_mesh_release_proof_result(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            r#"{
              "schema": "musu.private_mesh_release_proof.v1",
              "ok": true,
              "target_node": "studio-pc",
              "target_ip": "100.64.0.11",
              "archive_verifier_ok": false,
              "archive_verifier_schema": "musu.private_mesh_release_proof_archive_verification.v1",
              "archive_verifier_fail_count": 0
            }"#,
        )
        .expect("forged archive verifier false-ok result should still parse");
        assert!(!forged_false_ok.archive_verifier_ok);
        assert_eq!(
            forged_false_ok.archive_verifier_schema.as_deref(),
            Some("musu.private_mesh_release_proof_archive_verification.v1")
        );
        assert_eq!(forged_false_ok.archive_verifier_fail_count, Some(0));

        let verified = parse_private_mesh_release_proof_result(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            r#"{
              "schema": "musu.private_mesh_release_proof.v1",
              "ok": true,
              "target_node": "studio-pc",
              "target_ip": "100.64.0.11",
              "archive_verifier_ok": true,
              "archive_verifier_schema": "musu.private_mesh_release_proof_archive_verification.v1",
              "archive_verifier_fail_count": 0
            }"#,
        )
        .expect("archive verifier schema result should parse");
        assert!(verified.archive_verifier_ok);
    }

    #[test]
    fn latest_release_evidence_reads_native_report_schema() {
        let home = make_temp_home("latest-release-evidence");
        let old_dir = home.join("private-mesh-release-proof").join("old");
        let new_dir = home.join("private-mesh-release-proof").join("new");
        std::fs::create_dir_all(&old_dir).expect("old evidence dir should be created");
        std::fs::create_dir_all(&new_dir).expect("new evidence dir should be created");
        let old_body = r#"{
              "schema": "musu.private_mesh_release_proof.v1",
              "ok": false,
              "target_node": "old-pc",
              "target_ip": "100.64.0.10",
              "evidence_root": "old",
              "evidence_path": "old/private-mesh-route-proof.evidence.json",
              "verification_path": "old/private-mesh-release-proof.verification.json",
              "verification_sha256_path": "old/private-mesh-release-proof.verification.json.sha256",
              "error": "old"
            }"#;
        std::fs::write(
            old_dir.join("private-mesh-release-proof.verification.json"),
            old_body,
        )
        .expect("old evidence should be written");
        std::thread::sleep(std::time::Duration::from_millis(20));
        let new_verification_path = new_dir.join("private-mesh-release-proof.verification.json");
        let new_route_path = new_dir.join("private-mesh-route-proof.evidence.json");
        let new_route_sidecar_path = new_dir.join("private-mesh-route-proof.evidence.json.sha256");
        let new_sidecar_path = new_dir.join("private-mesh-release-proof.verification.json.sha256");
        let new_body = serde_json::to_string_pretty(&serde_json::json!({
            "schema": "musu.private_mesh_release_proof.v1",
            "ok": true,
            "target_node": "studio-pc",
            "target_ip": "100.64.0.11",
            "expected_control_server_url": "https://mesh.example",
            "evidence_root": new_dir.display().to_string(),
            "evidence_path": new_route_path.display().to_string(),
            "verification_path": new_verification_path.display().to_string(),
            "verification_sha256_path": new_sidecar_path.display().to_string(),
            "completed_at": "2026-06-13T00:10:00Z",
            "error": null
        }))
        .expect("new evidence JSON should serialize");
        let new_route_body = serde_json::json!({
            "schema": "musu.route_evidence.v1",
            "route_kind": "tailscale",
            "candidate_addr": "100.64.0.11:8070",
            "result": "success",
            "encryption": "tailscale_wireguard_overlay",
            "transport_verified_by": "musu_private_mesh_tailnet_route",
            "private_mesh_mode": "musu_headscale",
            "private_mesh_control_server_url": "https://mesh.example",
            "private_mesh_control_server_verified": true,
            "payload_transited_musu_infra": false,
            "peer_identity": {
                "schema": "musu.private_mesh_peer_identity.v1",
                "source_node_name": "this-laptop",
                "source_tailnet_ip": "100.64.0.10",
                "target_node": "studio-pc",
                "target_ip": "100.64.0.11",
                "target_url": "http://100.64.0.11:8070",
                "target_url_host": "100.64.0.11",
                "node_distinct": true,
                "tailnet_ip_distinct": true,
                "target_url_host_matches_target_ip": true,
                "release_identity_bound": true
            }
        })
        .to_string();
        std::fs::write(&new_route_path, new_route_body.as_bytes())
            .expect("route evidence should be written");
        std::fs::write(
            &new_route_sidecar_path,
            serde_json::json!({
                "schema": "musu.evidence_integrity_sidecar.v1",
                "algorithm": "sha256",
                "evidence_file": "private-mesh-route-proof.evidence.json",
                "sha256": sha256_hex(new_route_body.as_bytes()),
                "recorded_at": "2026-06-13T00:00:00Z"
            })
            .to_string(),
        )
        .expect("route evidence sidecar should be written");
        std::fs::write(&new_verification_path, new_body.as_bytes())
            .expect("new evidence should be written");
        std::fs::write(
            &new_sidecar_path,
            serde_json::json!({
                "schema": "musu.evidence_integrity_sidecar.v1",
                "algorithm": "sha256",
                "evidence_file": "wrong-file.json",
                "sha256": sha256_hex(new_body.as_bytes()),
                "recorded_at": "2026-06-13T00:00:00Z"
            })
            .to_string(),
        )
        .expect("mismatched evidence sidecar should be written");

        let mismatched = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup should not fail")
            .expect("latest evidence should exist");
        assert!(!mismatched.integrity_verified);
        assert!(mismatched
            .integrity_error
            .as_deref()
            .unwrap_or_default()
            .contains("evidence_file"));

        std::fs::write(
            &new_sidecar_path,
            serde_json::json!({
                "schema": "musu.evidence_integrity_sidecar.v1",
                "algorithm": "sha256",
                "evidence_file": "private-mesh-release-proof.verification.json",
                "sha256": sha256_hex(new_body.as_bytes()),
                "recorded_at": "2026-06-13T00:00:00Z"
            })
            .to_string(),
        )
        .expect("new evidence sidecar should be written");

        let result = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup should not fail")
            .expect("latest evidence should exist");

        assert!(result.ok);
        assert_eq!(result.target_node, "studio-pc");
        assert_eq!(result.target_ip, "100.64.0.11");
        let expected_route_path = new_dir
            .join("private-mesh-route-proof.evidence.json")
            .display()
            .to_string();
        let expected_sha256 = sha256_hex(new_body.as_bytes());
        assert_eq!(
            result.route_evidence_path.as_deref(),
            Some(expected_route_path.as_str())
        );
        assert!(result.route_evidence_integrity_verified);
        assert_eq!(
            result.route_evidence_sha256.as_deref(),
            Some(sha256_hex(new_route_body.as_bytes()).as_str())
        );
        assert!(result.integrity_verified);
        assert_eq!(
            result.verification_sha256.as_deref(),
            Some(expected_sha256.as_str())
        );
        assert!(result.release_identity_bound);
        assert!(result.software_route_trusted);
        assert!(!result.physical_peer_verified);
        assert!(!result.release_evidence_trusted);
        assert_eq!(
            result.physical_peer_error.as_deref(),
            Some("physical peer evidence is missing")
        );
        assert_eq!(
            result
                .peer_identity
                .as_ref()
                .and_then(|value| value.get("target_node"))
                .and_then(|value| value.as_str()),
            Some("studio-pc")
        );

        let copied_later_old_dir = home
            .join("private-mesh-release-proof")
            .join("copied-later-old-release");
        std::fs::create_dir_all(&copied_later_old_dir)
            .expect("copied-later old release dir should be created");
        let copied_later_old_path =
            copied_later_old_dir.join("private-mesh-release-proof.verification.json");
        let copied_later_old_body = serde_json::to_string_pretty(&serde_json::json!({
            "schema": "musu.private_mesh_release_proof.v1",
            "ok": true,
            "target_node": "copied-old-pc",
            "target_ip": "100.64.0.99",
            "evidence_root": copied_later_old_dir.display().to_string(),
            "verification_path": copied_later_old_path.display().to_string(),
            "verification_sha256_path": format!("{}.sha256", copied_later_old_path.display()),
            "completed_at": "2026-06-13T00:01:00Z",
            "error": null
        }))
        .expect("copied-later old release JSON should serialize");
        std::fs::write(&copied_later_old_path, copied_later_old_body.as_bytes())
            .expect("copied-later old release should be written after newer proof");
        std::fs::write(
            std::path::PathBuf::from(format!("{}.sha256", copied_later_old_path.display())),
            serde_json::json!({
                "schema": "musu.evidence_integrity_sidecar.v1",
                "algorithm": "sha256",
                "evidence_file": "private-mesh-release-proof.verification.json",
                "sha256": sha256_hex(copied_later_old_body.as_bytes()),
                "recorded_at": "2026-06-13T00:20:00Z"
            })
            .to_string(),
        )
        .expect("copied-later old release sidecar should be written");

        let latest_after_copied_old = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup after copied old proof should not fail")
            .expect("latest evidence should still exist");
        assert_eq!(latest_after_copied_old.target_node, "studio-pc");
        assert_eq!(
            latest_after_copied_old.completed_at.as_deref(),
            Some("2026-06-13T00:10:00Z")
        );
    }

    #[test]
    fn native_release_proof_writes_bundle_manifest_when_physical_sidecar_is_present() {
        let home = make_temp_home("native-release-bundle-manifest");
        let evidence_dir = home.join("private-mesh-release-proof").join("bundle");
        std::fs::create_dir_all(&evidence_dir).expect("evidence dir should be created");
        let verification_path = evidence_dir.join("private-mesh-release-proof.verification.json");
        let route_path = evidence_dir.join("private-mesh-route-proof.evidence.json");
        let physical_path = evidence_dir.join("studio-pc.physical-peer-evidence.json");
        let proof_completed_at = chrono::Utc::now();

        let route_body = serde_json::json!({
            "schema": "musu.route_evidence.v1",
            "route_kind": "tailscale",
            "candidate_addr": "100.64.0.11:8070",
            "result": "success",
            "encryption": "tailscale_wireguard_overlay",
            "transport_verified_by": "musu_private_mesh_tailnet_route",
            "private_mesh_mode": "musu_headscale",
            "private_mesh_control_server_url": "https://mesh.example",
            "private_mesh_control_server_verified": true,
            "payload_transited_musu_infra": false,
            "ok": true,
            "peer_identity": {
                "schema": "musu.private_mesh_peer_identity.v1",
                "source_node_name": "this-laptop",
                "source_tailnet_ip": "100.64.0.10",
                "source_hostname": "this-laptop",
                "target_node": "studio-pc",
                "target_ip": "100.64.0.11",
                "target_hostname": "__musu_target_host__",
                "target_url": "http://100.64.0.11:8070",
                "target_url_host": "100.64.0.11",
                "node_distinct": true,
                "tailnet_ip_distinct": true,
                "physical_host_distinct": true,
                "target_url_host_matches_target_ip": true,
                "physical_peer_verified": true,
                "release_identity_bound": true
            }
        })
        .to_string();
        std::fs::write(&route_path, route_body.as_bytes())
            .expect("route evidence should be written");
        write_json_sidecar_for_file(&route_path).expect("route sidecar should be written");

        let physical_body = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "physical_peer_verified": true,
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "__musu_target_host__",
            "os": "windows",
            "arch": "x86_64",
            "generated_at": (proof_completed_at - chrono::Duration::minutes(5)).to_rfc3339()
        })
        .to_string();
        std::fs::write(&physical_path, physical_body.as_bytes())
            .expect("physical evidence should be written");
        write_json_sidecar_for_file(&physical_path).expect("physical sidecar should be written");

        let verification_body = serde_json::json!({
            "schema": "musu.private_mesh_release_proof.v1",
            "ok": true,
            "target_node": "studio-pc",
            "target_ip": "100.64.0.11",
            "expected_control_server_url": "https://mesh.example",
            "evidence_root": evidence_dir.display().to_string(),
            "evidence_path": route_path.display().to_string(),
            "verification_path": verification_path.display().to_string(),
            "verification_sha256_path": format!("{}.sha256", verification_path.display()),
            "completed_at": proof_completed_at.to_rfc3339(),
            "error": null
        })
        .to_string();
        std::fs::write(&verification_path, verification_body.as_bytes())
            .expect("verification should be written");
        write_json_sidecar_for_file(&verification_path)
            .expect("verification sidecar should be written");

        let mut result = parse_private_mesh_release_proof_result(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            &verification_body,
        )
        .expect("release proof should parse");
        result.physical_peer_evidence_path = Some(physical_path.display().to_string());
        attach_release_evidence_integrity(&mut result, &home);
        attach_route_evidence_integrity(&mut result, &home);
        attach_release_peer_identity(&mut result, &home);
        update_release_evidence_trust(&mut result);
        attach_or_create_release_bundle_manifest(
            &mut result,
            &home,
            Some(physical_path.display().to_string().as_str()),
        );

        assert!(result.bundle_manifest_ok);
        assert_eq!(result.bundle_manifest_fail_count, Some(0));
        assert!(result.release_evidence_trusted);
        assert!(result.archive_error.is_none());
        assert_eq!(result.archive_artifact_count, Some(4));
        assert!(result.archive_verifier_ok);
        assert_eq!(
            result.archive_verifier_schema.as_deref(),
            Some("musu.private_mesh_release_proof_archive_verification.v1")
        );
        assert_eq!(result.archive_verifier_fail_count, Some(0));
        assert_eq!(
            result.archive_verifier_kind.as_deref(),
            Some("native_desktop_internal")
        );
        assert!(result.archive_verifier_error.is_none());
        let archive_manifest_path = result
            .archive_manifest_path
            .as_ref()
            .map(std::path::PathBuf::from)
            .expect("archive manifest path should be recorded");
        assert!(archive_manifest_path.exists());
        assert!(
            std::path::PathBuf::from(format!("{}.sha256", archive_manifest_path.display()))
                .exists()
        );
        let archive_manifest_text = std::fs::read_to_string(&archive_manifest_path)
            .expect("archive manifest should be readable");
        let archive_manifest: serde_json::Value = serde_json::from_str(&archive_manifest_text)
            .expect("archive manifest JSON should parse");
        assert_eq!(
            archive_manifest
                .get("schema")
                .and_then(|value| value.as_str()),
            Some("musu.private_mesh_release_proof_archive.v1")
        );
        assert_eq!(
            archive_manifest
                .get("artifact_count")
                .and_then(|value| value.as_u64()),
            Some(4)
        );
        assert_eq!(
            archive_manifest
                .get("release_bundle_contract")
                .and_then(|value| value.as_str()),
            Some(PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT)
        );
        let manifest_path = result
            .bundle_manifest_path
            .as_ref()
            .map(std::path::PathBuf::from)
            .expect("manifest path should be recorded");
        assert!(manifest_path.exists());
        assert!(std::path::PathBuf::from(format!("{}.sha256", manifest_path.display())).exists());
        let manifest_text =
            std::fs::read_to_string(manifest_path).expect("manifest should be readable");
        let manifest: serde_json::Value =
            serde_json::from_str(&manifest_text).expect("manifest JSON should parse");
        assert_eq!(
            manifest.get("schema").and_then(|value| value.as_str()),
            Some("musu.private_mesh_release_proof_bundle.v1")
        );
        assert_eq!(
            manifest.get("ok").and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            manifest.get("fail_count").and_then(|value| value.as_u64()),
            Some(0)
        );
        assert_eq!(
            manifest
                .get("release_bundle_contract")
                .and_then(|value| value.as_str()),
            Some(PRIVATE_MESH_RELEASE_BUNDLE_CONTRACT)
        );

        let latest = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup should not fail")
            .expect("latest evidence should exist after archive");
        assert_eq!(
            latest.verification_path.as_deref(),
            Some(verification_path.display().to_string().as_str())
        );
        assert_eq!(latest.archive_artifact_count, Some(4));
        assert!(latest.archive_manifest_path.is_some());
        assert!(latest.archive_manifest_sha256_path.is_some());
        assert!(latest.archive_error.is_none());
        assert!(latest.release_evidence_trusted);
        assert!(latest.bundle_manifest_ok);

        let mut legacy_role_archive_manifest = archive_manifest.clone();
        let legacy_verification_artifact = legacy_role_archive_manifest
            .get_mut("artifacts")
            .and_then(|value| value.as_array_mut())
            .and_then(|artifacts| {
                artifacts.iter_mut().find(|artifact| {
                    artifact.get("role").and_then(|value| value.as_str()) == Some("verification")
                })
            })
            .expect("archive manifest should include verification artifact");
        legacy_verification_artifact["role"] =
            serde_json::Value::String("runner_verification".to_string());
        std::fs::write(
            &archive_manifest_path,
            serde_json::to_string_pretty(&legacy_role_archive_manifest)
                .expect("legacy role archive manifest should serialize"),
        )
        .expect("legacy role archive manifest should be written");
        write_json_sidecar_for_file(&archive_manifest_path)
            .expect("legacy role archive manifest sidecar should be written");
        let latest_after_legacy_role = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup after legacy role should not fail")
            .expect("latest evidence should still exist after legacy role");
        assert!(latest_after_legacy_role.archive_verifier_ok);
        assert_eq!(
            latest_after_legacy_role.archive_manifest_path.as_deref(),
            Some(archive_manifest_path.display().to_string().as_str())
        );

        let bundle_artifact_path = legacy_role_archive_manifest
            .get("artifacts")
            .and_then(|value| value.as_array())
            .and_then(|artifacts| {
                artifacts.iter().find_map(|artifact| {
                    if artifact.get("role").and_then(|value| value.as_str())
                        == Some("bundle_manifest")
                    {
                        artifact
                            .get("evidence_path")
                            .and_then(|value| value.as_str())
                    } else {
                        None
                    }
                })
            })
            .map(std::path::PathBuf::from)
            .expect("archive manifest should include archived bundle manifest");
        let original_archived_bundle_manifest_text = std::fs::read_to_string(&bundle_artifact_path)
            .expect("archived bundle manifest should be readable");
        let mut archived_bundle_manifest: serde_json::Value =
            serde_json::from_str(&original_archived_bundle_manifest_text)
                .expect("archived bundle manifest should parse");
        archived_bundle_manifest["target_ip"] =
            serde_json::Value::String("100.64.0.99".to_string());
        std::fs::write(
            &bundle_artifact_path,
            serde_json::to_string_pretty(&archived_bundle_manifest)
                .expect("tampered archived bundle manifest should serialize"),
        )
        .expect("tampered archived bundle manifest should be written");
        write_json_sidecar_for_file(&bundle_artifact_path)
            .expect("tampered archived bundle manifest sidecar should be written");
        let latest_after_tampered_bundle = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup after tampered bundle should not fail")
            .expect("latest evidence should still exist after tampered bundle");
        assert!(!latest_after_tampered_bundle.archive_verifier_ok);
        assert!(latest_after_tampered_bundle
            .archive_verifier_error
            .as_deref()
            .unwrap_or_default()
            .contains("archive bundle_manifest sha256 does not match copied file"));
        std::fs::write(
            &bundle_artifact_path,
            original_archived_bundle_manifest_text,
        )
        .expect("archived bundle manifest should be restored");
        write_json_sidecar_for_file(&bundle_artifact_path)
            .expect("restored archived bundle manifest sidecar should be written");

        let stale_archive_dir = archive_manifest_path
            .parent()
            .and_then(|parent| parent.parent())
            .expect("archive manifest should be nested under archive root")
            .join("copied-later-old-archive");
        std::fs::create_dir_all(&stale_archive_dir).expect("stale archive dir should be created");
        let stale_archive_manifest_path =
            stale_archive_dir.join("private-mesh-release-proof.archive.json");
        let mut stale_archive_manifest = archive_manifest.clone();
        let current_archived_at = archive_manifest
            .get("archived_at_unix_ms")
            .and_then(|value| value.as_u64())
            .expect("archive should record archived_at_unix_ms");
        stale_archive_manifest["archived_at_unix_ms"] =
            serde_json::Value::Number(serde_json::Number::from(current_archived_at - 1));
        std::fs::write(
            &stale_archive_manifest_path,
            serde_json::to_string_pretty(&stale_archive_manifest)
                .expect("stale archive manifest should serialize"),
        )
        .expect("stale archive manifest should be written after current archive");
        write_json_sidecar_for_file(&stale_archive_manifest_path)
            .expect("stale archive manifest sidecar should be written");

        let latest_after_stale_copy = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup after stale archive copy should not fail")
            .expect("latest evidence should still exist after stale archive copy");
        assert_eq!(
            latest_after_stale_copy.archive_manifest_path.as_deref(),
            Some(archive_manifest_path.display().to_string().as_str())
        );

        let legacy_archive_dir = archive_manifest_path
            .parent()
            .and_then(|parent| parent.parent())
            .expect("archive manifest should be nested under archive root")
            .join("copied-later-legacy-archive");
        std::fs::create_dir_all(&legacy_archive_dir).expect("legacy archive dir should be created");
        let legacy_archive_manifest_path =
            legacy_archive_dir.join("private-mesh-release-proof.archive.json");
        let mut legacy_archive_manifest = archive_manifest.clone();
        legacy_archive_manifest
            .as_object_mut()
            .expect("archive manifest should be an object")
            .remove("archived_at_unix_ms");
        legacy_archive_manifest["archived_at"] =
            serde_json::Value::String("2026-06-13T00:00:00Z".to_string());
        std::fs::write(
            &legacy_archive_manifest_path,
            serde_json::to_string_pretty(&legacy_archive_manifest)
                .expect("legacy archive manifest should serialize"),
        )
        .expect("legacy archive manifest should be written after current archive");
        write_json_sidecar_for_file(&legacy_archive_manifest_path)
            .expect("legacy archive manifest sidecar should be written");
        assert!(archive_manifest_timestamp_unix_ms(&legacy_archive_manifest_path).is_some());
        let latest_after_legacy_copy = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup after legacy archive copy should not fail")
            .expect("latest evidence should still exist after legacy archive copy");
        assert_eq!(
            latest_after_legacy_copy.archive_manifest_path.as_deref(),
            Some(archive_manifest_path.display().to_string().as_str())
        );

        let mut tampered_archive_manifest = archive_manifest;
        let (_, verification_sidecar_path, verification_sha256) =
            verify_sidecar_for_file(&verification_path)
                .expect("source verification sidecar should still verify");
        let verification_artifact = tampered_archive_manifest
            .get_mut("artifacts")
            .and_then(|value| value.as_array_mut())
            .and_then(|artifacts| {
                artifacts.iter_mut().find(|artifact| {
                    artifact.get("role").and_then(|value| value.as_str()) == Some("verification")
                })
            })
            .expect("archive manifest should include verification artifact");
        verification_artifact["evidence_path"] =
            serde_json::Value::String(verification_path.display().to_string());
        verification_artifact["sha256_path"] =
            serde_json::Value::String(verification_sidecar_path.display().to_string());
        verification_artifact["sha256"] = serde_json::Value::String(verification_sha256);
        std::fs::write(
            &archive_manifest_path,
            serde_json::to_string_pretty(&tampered_archive_manifest)
                .expect("tampered archive manifest should serialize"),
        )
        .expect("tampered archive manifest should be written");
        write_json_sidecar_for_file(&archive_manifest_path)
            .expect("tampered archive manifest sidecar should be written");

        let tampered_latest = latest_release_evidence_from_home(&home)
            .expect("tampered latest evidence lookup should not fail")
            .expect("tampered latest evidence should still parse");
        assert!(!tampered_latest.archive_verifier_ok);
        assert!(tampered_latest
            .archive_error
            .as_deref()
            .unwrap_or_default()
            .contains("outside archive directory"));
    }

    #[test]
    fn release_trust_rejects_route_without_control_plane_binding() {
        let home = make_temp_home("native-release-route-control-plane-binding");
        let evidence_dir = home
            .join("private-mesh-release-proof")
            .join("route-control-plane-binding");
        std::fs::create_dir_all(&evidence_dir).expect("evidence dir should be created");
        let verification_path = evidence_dir.join("private-mesh-release-proof.verification.json");
        let route_path = evidence_dir.join("private-mesh-route-proof.evidence.json");

        let route_body = serde_json::json!({
            "schema": "musu.route_evidence.v1",
            "route_kind": "tailscale",
            "candidate_addr": "100.64.0.11:8070",
            "result": "success",
            "encryption": "tailscale_wireguard_overlay",
            "transport_verified_by": "musu_private_mesh_tailnet_route",
            "payload_transited_musu_infra": false,
            "ok": true,
            "peer_identity": {
                "schema": "musu.private_mesh_peer_identity.v1",
                "source_node_name": "this-laptop",
                "source_tailnet_ip": "100.64.0.10",
                "target_node": "studio-pc",
                "target_ip": "100.64.0.11",
                "target_url": "http://100.64.0.11:8070",
                "target_url_host": "100.64.0.11",
                "node_distinct": true,
                "tailnet_ip_distinct": true,
                "target_url_host_matches_target_ip": true,
                "release_identity_bound": true
            }
        })
        .to_string();
        std::fs::write(&route_path, route_body.as_bytes())
            .expect("route evidence should be written");
        write_json_sidecar_for_file(&route_path).expect("route sidecar should be written");

        let verification_body = serde_json::json!({
            "schema": "musu.private_mesh_release_proof.v1",
            "ok": true,
            "target_node": "studio-pc",
            "target_ip": "100.64.0.11",
            "expected_control_server_url": "https://mesh.example",
            "evidence_root": evidence_dir.display().to_string(),
            "evidence_path": route_path.display().to_string(),
            "verification_path": verification_path.display().to_string(),
            "verification_sha256_path": format!("{}.sha256", verification_path.display()),
            "error": null
        })
        .to_string();
        std::fs::write(&verification_path, verification_body.as_bytes())
            .expect("verification should be written");
        write_json_sidecar_for_file(&verification_path)
            .expect("verification sidecar should be written");

        let mut result = parse_private_mesh_release_proof_result(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            &verification_body,
        )
        .expect("release proof should parse");
        attach_release_evidence_integrity(&mut result, &home);
        attach_route_evidence_integrity(&mut result, &home);
        attach_release_peer_identity(&mut result, &home);
        update_release_evidence_trust(&mut result);

        assert!(result.integrity_verified);
        assert!(result.route_evidence_integrity_verified);
        assert!(result.release_identity_bound);
        assert!(!result.route_transport_verified);
        assert!(!result.software_route_trusted);
        assert!(result
            .route_transport_error
            .as_deref()
            .unwrap_or_default()
            .contains("private mesh route transport is not release-grade"));
    }

    #[test]
    fn bundle_manifest_requires_physical_evidence_to_match_claimed_target() {
        let home = make_temp_home("native-release-bundle-manifest-target-binding");
        let evidence_dir = home
            .join("private-mesh-release-proof")
            .join("target-binding");
        std::fs::create_dir_all(&evidence_dir).expect("evidence dir should be created");
        let verification_path = evidence_dir.join("private-mesh-release-proof.verification.json");
        let route_path = evidence_dir.join("private-mesh-route-proof.evidence.json");
        let physical_path = evidence_dir.join("wrong-pc.physical-peer-evidence.json");

        let route_body = serde_json::json!({
            "schema": "musu.route_evidence.v1",
            "route_kind": "tailscale",
            "candidate_addr": "100.64.0.11:8070",
            "result": "success",
            "encryption": "tailscale_wireguard_overlay",
            "transport_verified_by": "musu_private_mesh_tailnet_route",
            "private_mesh_mode": "musu_headscale",
            "private_mesh_control_server_url": "https://mesh.example",
            "private_mesh_control_server_verified": true,
            "payload_transited_musu_infra": false,
            "ok": true,
            "peer_identity": {
                "schema": "musu.private_mesh_peer_identity.v1",
                "source_node_name": "this-laptop",
                "source_tailnet_ip": "100.64.0.10",
                "source_hostname": "this-laptop",
                "target_node": "studio-pc",
                "target_ip": "100.64.0.11",
                "target_hostname": "studio-pc",
                "target_url": "http://100.64.0.11:8070",
                "target_url_host": "100.64.0.11",
                "node_distinct": true,
                "tailnet_ip_distinct": true,
                "physical_host_distinct": true,
                "target_url_host_matches_target_ip": true,
                "physical_peer_verified": true,
                "release_identity_bound": true
            }
        })
        .to_string();
        std::fs::write(&route_path, route_body.as_bytes())
            .expect("route evidence should be written");
        write_json_sidecar_for_file(&route_path).expect("route sidecar should be written");

        let physical_body = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "physical_peer_verified": true,
            "node_name": "wrong-pc",
            "tailnet_ip": "100.64.0.99",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "__musu_wrong_host__",
            "generated_at": chrono::Utc::now().to_rfc3339()
        })
        .to_string();
        std::fs::write(&physical_path, physical_body.as_bytes())
            .expect("physical evidence should be written");
        write_json_sidecar_for_file(&physical_path).expect("physical sidecar should be written");

        let verification_body = serde_json::json!({
            "schema": "musu.private_mesh_release_proof.v1",
            "ok": true,
            "target_node": "studio-pc",
            "target_ip": "100.64.0.11",
            "expected_control_server_url": "https://mesh.example",
            "evidence_root": evidence_dir.display().to_string(),
            "evidence_path": route_path.display().to_string(),
            "verification_path": verification_path.display().to_string(),
            "verification_sha256_path": format!("{}.sha256", verification_path.display()),
            "error": null
        })
        .to_string();
        std::fs::write(&verification_path, verification_body.as_bytes())
            .expect("verification should be written");
        write_json_sidecar_for_file(&verification_path)
            .expect("verification sidecar should be written");

        let mut result = parse_private_mesh_release_proof_result(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            &verification_body,
        )
        .expect("release proof should parse");
        result.physical_peer_evidence_path = Some(physical_path.display().to_string());
        attach_release_evidence_integrity(&mut result, &home);
        attach_route_evidence_integrity(&mut result, &home);
        attach_release_peer_identity(&mut result, &home);
        update_release_evidence_trust(&mut result);
        assert!(result.release_evidence_trusted);

        attach_or_create_release_bundle_manifest(
            &mut result,
            &home,
            Some(physical_path.display().to_string().as_str()),
        );

        assert!(!result.bundle_manifest_ok);
        assert!(!result.release_evidence_trusted);
        assert!(result
            .bundle_manifest_error
            .as_deref()
            .unwrap_or_default()
            .contains("bundle manifest has failed checks"));
    }

    #[test]
    fn bundle_manifest_requires_physical_hostname_to_match_native_identity() {
        let home = make_temp_home("native-release-bundle-manifest-host-binding");
        let evidence_dir = home.join("private-mesh-release-proof").join("host-binding");
        std::fs::create_dir_all(&evidence_dir).expect("evidence dir should be created");
        let verification_path = evidence_dir.join("private-mesh-release-proof.verification.json");
        let route_path = evidence_dir.join("private-mesh-route-proof.evidence.json");
        let physical_path = evidence_dir.join("studio-pc.physical-peer-evidence.json");

        let route_body = serde_json::json!({
            "schema": "musu.route_evidence.v1",
            "route_kind": "tailscale",
            "candidate_addr": "100.64.0.11:8070",
            "result": "success",
            "encryption": "tailscale_wireguard_overlay",
            "transport_verified_by": "musu_private_mesh_tailnet_route",
            "private_mesh_mode": "musu_headscale",
            "private_mesh_control_server_url": "https://mesh.example",
            "private_mesh_control_server_verified": true,
            "payload_transited_musu_infra": false,
            "ok": true,
            "peer_identity": {
                "schema": "musu.private_mesh_peer_identity.v1",
                "source_node_name": "this-laptop",
                "source_tailnet_ip": "100.64.0.10",
                "source_hostname": "this-laptop",
                "target_node": "studio-pc",
                "target_ip": "100.64.0.11",
                "target_hostname": "studio-pc-native",
                "target_url": "http://100.64.0.11:8070",
                "target_url_host": "100.64.0.11",
                "node_distinct": true,
                "tailnet_ip_distinct": true,
                "physical_host_distinct": true,
                "target_url_host_matches_target_ip": true,
                "physical_peer_verified": true,
                "release_identity_bound": true
            }
        })
        .to_string();
        std::fs::write(&route_path, route_body.as_bytes())
            .expect("route evidence should be written");
        write_json_sidecar_for_file(&route_path).expect("route sidecar should be written");

        let physical_body = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "physical_peer_verified": true,
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "studio-pc-physical",
            "generated_at": chrono::Utc::now().to_rfc3339()
        })
        .to_string();
        std::fs::write(&physical_path, physical_body.as_bytes())
            .expect("physical evidence should be written");
        write_json_sidecar_for_file(&physical_path).expect("physical sidecar should be written");

        let verification_body = serde_json::json!({
            "schema": "musu.private_mesh_release_proof.v1",
            "ok": true,
            "target_node": "studio-pc",
            "target_ip": "100.64.0.11",
            "expected_control_server_url": "https://mesh.example",
            "evidence_root": evidence_dir.display().to_string(),
            "evidence_path": route_path.display().to_string(),
            "verification_path": verification_path.display().to_string(),
            "verification_sha256_path": format!("{}.sha256", verification_path.display()),
            "error": null
        })
        .to_string();
        std::fs::write(&verification_path, verification_body.as_bytes())
            .expect("verification should be written");
        write_json_sidecar_for_file(&verification_path)
            .expect("verification sidecar should be written");

        let mut result = parse_private_mesh_release_proof_result(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            &verification_body,
        )
        .expect("release proof should parse");
        result.physical_peer_evidence_path = Some(physical_path.display().to_string());
        attach_release_evidence_integrity(&mut result, &home);
        attach_route_evidence_integrity(&mut result, &home);
        attach_release_peer_identity(&mut result, &home);
        update_release_evidence_trust(&mut result);
        assert!(result.release_evidence_trusted);

        attach_or_create_release_bundle_manifest(
            &mut result,
            &home,
            Some(physical_path.display().to_string().as_str()),
        );

        assert!(!result.bundle_manifest_ok);
        assert!(!result.release_evidence_trusted);
        assert!(result
            .bundle_manifest_error
            .as_deref()
            .unwrap_or_default()
            .contains("bundle manifest has failed checks"));
    }

    #[test]
    fn existing_bundle_manifest_cannot_make_untrusted_release_evidence_ok() {
        let home = make_temp_home("existing-bundle-manifest-current-trust");
        let evidence_dir = home.join("private-mesh-release-proof").join("forged");
        std::fs::create_dir_all(&evidence_dir).expect("evidence dir should be created");
        let verification_path = evidence_dir.join("private-mesh-release-proof.verification.json");
        let route_path = evidence_dir.join("private-mesh-route-proof.evidence.json");
        let manifest_path = evidence_dir.join("private-mesh-release-proof.bundle-manifest.json");

        let route_body = serde_json::json!({
            "schema": "musu.route_evidence.v1",
            "route_kind": "tailscale",
            "candidate_addr": "100.64.0.11:8070",
            "result": "success",
            "encryption": "tailscale_wireguard_overlay",
            "transport_verified_by": "musu_private_mesh_tailnet_route",
            "private_mesh_mode": "musu_headscale",
            "private_mesh_control_server_url": "https://mesh.example",
            "private_mesh_control_server_verified": true,
            "payload_transited_musu_infra": false,
            "ok": true,
            "peer_identity": {
                "schema": "musu.private_mesh_peer_identity.v1",
                "source_node_name": "this-laptop",
                "source_tailnet_ip": "100.64.0.10",
                "target_node": "studio-pc",
                "target_ip": "100.64.0.11",
                "target_url": "http://100.64.0.11:8070",
                "target_url_host": "100.64.0.11",
                "node_distinct": true,
                "tailnet_ip_distinct": true,
                "target_url_host_matches_target_ip": true,
                "physical_peer_verified": false,
                "release_identity_bound": true
            }
        })
        .to_string();
        std::fs::write(&route_path, route_body.as_bytes())
            .expect("route evidence should be written");
        write_json_sidecar_for_file(&route_path).expect("route sidecar should be written");

        let verification_body = serde_json::json!({
            "schema": "musu.private_mesh_release_proof.v1",
            "ok": true,
            "target_node": "studio-pc",
            "target_ip": "100.64.0.11",
            "expected_control_server_url": "https://mesh.example",
            "evidence_root": evidence_dir.display().to_string(),
            "evidence_path": route_path.display().to_string(),
            "verification_path": verification_path.display().to_string(),
            "verification_sha256_path": format!("{}.sha256", verification_path.display()),
            "error": null
        })
        .to_string();
        std::fs::write(&verification_path, verification_body.as_bytes())
            .expect("verification should be written");
        write_json_sidecar_for_file(&verification_path)
            .expect("verification sidecar should be written");

        let forged_manifest = serde_json::json!({
            "schema": "musu.private_mesh_release_proof_bundle.v1",
            "ok": true,
            "target_node": "studio-pc",
            "target_ip": "100.64.0.11",
            "expected_control_server_url": "https://mesh.example",
            "release_evidence_trusted": true,
            "fail_count": 0,
            "checks": [{
                "name": "forged pass",
                "ok": true,
                "status": "pass"
            }],
            "artifacts": {
                "verification": verification_path.display().to_string(),
                "route_evidence": route_path.display().to_string(),
                "physical_peer_evidence": evidence_dir
                    .join("studio-pc.physical-peer-evidence.json")
                    .display()
                    .to_string()
            }
        })
        .to_string();
        std::fs::write(&manifest_path, forged_manifest.as_bytes())
            .expect("forged manifest should be written");
        write_json_sidecar_for_file(&manifest_path).expect("manifest sidecar should be written");

        let result = latest_release_evidence_from_home(&home)
            .expect("latest evidence lookup should not fail")
            .expect("latest evidence should exist");

        assert!(result.ok);
        assert!(result.software_route_trusted);
        assert!(!result.release_evidence_trusted);
        assert!(!result.bundle_manifest_ok);
        assert!(result
            .bundle_manifest_error
            .as_deref()
            .unwrap_or_default()
            .contains("current release evidence is not trusted"));
    }

    #[test]
    fn final_release_trust_requires_physical_peer_evidence() {
        let mut result = PrivateMeshReleaseProofDesktopResult {
            ok: true,
            target_node: "studio-pc".to_string(),
            target_ip: "100.64.0.11".to_string(),
            completed_at: None,
            evidence_root: None,
            route_evidence_path: None,
            route_evidence_sha256_path: None,
            route_evidence_sha256: None,
            route_evidence_integrity_verified: true,
            route_evidence_integrity_error: None,
            route_transport_verified: true,
            route_transport_error: None,
            verification_path: None,
            verification_sha256_path: None,
            verification_sha256: None,
            integrity_verified: true,
            integrity_error: None,
            peer_identity: None,
            release_identity_bound: true,
            peer_identity_error: None,
            physical_peer_evidence_path: None,
            physical_peer_evidence_sha256_path: None,
            physical_peer_evidence_sha256: None,
            physical_peer_verified: false,
            physical_peer_error: None,
            software_route_trusted: false,
            release_evidence_trusted: false,
            bundle_manifest_path: None,
            bundle_manifest_sha256_path: None,
            bundle_manifest_ok: false,
            bundle_manifest_fail_count: None,
            bundle_manifest_error: None,
            archive_dir: None,
            archive_manifest_path: None,
            archive_manifest_sha256_path: None,
            archive_artifact_count: None,
            archive_verifier_ok: false,
            archive_verifier_schema: None,
            archive_verifier_fail_count: None,
            archive_verifier_kind: None,
            archive_verifier_error: None,
            archive_error: None,
            desktop_runtime_kind: None,
            desktop_runtime_packaged: false,
            desktop_runtime_exe_path: None,
            desktop_runtime_exe_sha256: None,
            expected_control_server_url: None,
            error: None,
            output: String::new(),
        };

        update_release_evidence_trust(&mut result);
        assert!(result.software_route_trusted);
        assert!(!result.release_evidence_trusted);
        assert!(result
            .physical_peer_error
            .as_deref()
            .unwrap_or_default()
            .contains("physical peer evidence is missing"));

        result.physical_peer_verified = true;
        result.physical_peer_error = None;
        update_release_evidence_trust(&mut result);
        assert!(result.release_evidence_trusted);
        assert!(result.physical_peer_error.is_none());
    }

    #[test]
    fn release_proof_command_args_include_physical_peer_evidence_when_present() {
        let args = release_proof_command_args(
            "studio-pc",
            "100.64.0.11",
            "https://mesh.example",
            "C:\\proofs\\studio-pc.physical-peer-evidence.json",
        );

        let evidence_arg = args
            .iter()
            .position(|arg| arg == "--physical-peer-evidence")
            .expect("physical peer evidence arg should be present");
        assert_eq!(
            args.get(evidence_arg + 1).map(String::as_str),
            Some("C:\\proofs\\studio-pc.physical-peer-evidence.json")
        );
        assert_eq!(args.last().map(String::as_str), Some("--json"));

        let without =
            release_proof_command_args("studio-pc", "100.64.0.11", "https://mesh.example", "  ");
        assert!(!without.iter().any(|arg| arg == "--physical-peer-evidence"));
    }

    #[test]
    fn physical_peer_evidence_summary_reads_only_target_generated_schema() {
        let home = make_temp_home("physical-peer-evidence-summary");
        let dir = home.join("private-mesh-physical-peer-evidence");
        std::fs::create_dir_all(&dir).expect("physical evidence dir should be created");
        let invalid = dir.join("invalid.json");
        std::fs::write(&invalid, "{}").expect("invalid evidence should be written");
        let valid = dir.join("studio-pc.physical-peer-evidence.json");
        let valid_body = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "product_name": "MUSU Private Mesh",
            "physical_peer_verified": true,
            "method": "target_pc_generated_local_mesh_state",
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "__musu_target_host__",
            "os": "windows",
            "arch": "x86_64",
            "generated_at": chrono::Utc::now().to_rfc3339()
        })
        .to_string();
        std::fs::write(&valid, valid_body.as_bytes()).expect("valid evidence should be written");

        let invalid_summary = read_physical_peer_evidence_summary(&invalid);
        assert!(!invalid_summary.ok);

        let missing_sidecar_summary = read_physical_peer_evidence_summary(&valid);
        assert!(!missing_sidecar_summary.ok);
        assert!(missing_sidecar_summary
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("SHA256 sidecar"));

        std::fs::write(
            std::path::PathBuf::from(format!("{}.sha256", valid.display())),
            serde_json::json!({
                "schema": "musu.evidence_integrity_sidecar.v1",
                "algorithm": "sha256",
                "evidence_file": "wrong-file.json",
                "sha256": sha256_hex(valid_body.as_bytes()),
                "recorded_at": "2026-06-13T00:00:00Z"
            })
            .to_string(),
        )
        .expect("mismatched evidence sidecar should be written");
        let mismatched_summary = read_physical_peer_evidence_summary(&valid);
        assert!(!mismatched_summary.ok);
        assert!(mismatched_summary
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("evidence_file"));

        write_json_sidecar_for_file(&valid).expect("valid evidence sidecar should be written");
        let valid_summary = read_physical_peer_evidence_summary(&valid);
        assert!(valid_summary.ok);
        assert!(valid_summary.integrity_verified);
        assert!(valid_summary.sha256_path.is_some());
        assert!(valid_summary.sha256.is_some());
        assert_eq!(valid_summary.node_name.as_deref(), Some("studio-pc"));
        assert_eq!(valid_summary.tailnet_ip.as_deref(), Some("100.64.0.11"));
        assert_eq!(
            valid_summary.hostname.as_deref(),
            Some("__musu_target_host__")
        );
        assert_eq!(valid_summary.os.as_deref(), Some("windows"));
        assert_eq!(valid_summary.arch.as_deref(), Some("x86_64"));
        assert!(valid_summary.physical_host_distinct);

        if let Some(source_hostname) = local_os_hostname() {
            let same_host = dir.join("same-host.physical-peer-evidence.json");
            let same_host_body = serde_json::json!({
                "schema": "musu.private_mesh_physical_peer_evidence.v1",
                "product_name": "MUSU Private Mesh",
                "physical_peer_verified": true,
                "method": "target_pc_generated_local_mesh_state",
                "node_name": "studio-pc",
                "tailnet_ip": "100.64.0.11",
                "control_server_url": "https://mesh.example",
                "control_server_verified": true,
                "hostname": source_hostname,
                "generated_at": chrono::Utc::now().to_rfc3339()
            })
            .to_string();
            std::fs::write(&same_host, same_host_body.as_bytes())
                .expect("same-host evidence should be written");
            write_json_sidecar_for_file(&same_host)
                .expect("same-host evidence sidecar should be written");
            let same_host_summary = read_physical_peer_evidence_summary(&same_host);
            assert!(!same_host_summary.ok);
            assert!(!same_host_summary.physical_host_distinct);
            assert!(same_host_summary
                .error
                .as_deref()
                .unwrap_or_default()
                .contains("separate target physical PC"));
        }

        let stale = dir.join("stale.physical-peer-evidence.json");
        let stale_body = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "product_name": "MUSU Private Mesh",
            "physical_peer_verified": true,
            "method": "target_pc_generated_local_mesh_state",
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "__musu_target_host__",
            "generated_at": (chrono::Utc::now() - chrono::Duration::hours(25)).to_rfc3339()
        })
        .to_string();
        std::fs::write(&stale, stale_body.as_bytes()).expect("stale evidence should be written");
        write_json_sidecar_for_file(&stale).expect("stale evidence sidecar should be written");
        let stale_summary = read_physical_peer_evidence_summary(&stale);
        assert!(!stale_summary.ok);
        assert!(stale_summary
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("is stale"));

        let future = dir.join("future.physical-peer-evidence.json");
        let future_body = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "product_name": "MUSU Private Mesh",
            "physical_peer_verified": true,
            "method": "target_pc_generated_local_mesh_state",
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "__musu_target_host__",
            "generated_at": (chrono::Utc::now() + chrono::Duration::minutes(10)).to_rfc3339()
        })
        .to_string();
        std::fs::write(&future, future_body.as_bytes()).expect("future evidence should be written");
        write_json_sidecar_for_file(&future).expect("future evidence sidecar should be written");
        let future_summary = read_physical_peer_evidence_summary(&future);
        assert!(!future_summary.ok);
        assert!(future_summary
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("too far in the future"));

        let latest = latest_physical_peer_evidence_from_home(&home)
            .expect("latest physical evidence lookup should not fail")
            .expect("valid latest physical evidence should exist");
        assert_eq!(latest.path, valid.display().to_string());

        let newer = dir.join("newer-generated-at.physical-peer-evidence.json");
        let newer_body = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "product_name": "MUSU Private Mesh",
            "physical_peer_verified": true,
            "method": "target_pc_generated_local_mesh_state",
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "__musu_target_host__",
            "generated_at": (chrono::Utc::now() + chrono::Duration::seconds(30)).to_rfc3339()
        })
        .to_string();
        std::fs::write(&newer, newer_body.as_bytes())
            .expect("newer generated_at evidence should be written");
        write_json_sidecar_for_file(&newer).expect("newer evidence sidecar should be written");

        let copied_later_but_older = dir.join("copied-later-older.physical-peer-evidence.json");
        let copied_later_but_older_body = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "product_name": "MUSU Private Mesh",
            "physical_peer_verified": true,
            "method": "target_pc_generated_local_mesh_state",
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "__musu_target_host__",
            "generated_at": (chrono::Utc::now() - chrono::Duration::hours(1)).to_rfc3339()
        })
        .to_string();
        std::fs::write(
            &copied_later_but_older,
            copied_later_but_older_body.as_bytes(),
        )
        .expect("older generated_at evidence should be written later");
        write_json_sidecar_for_file(&copied_later_but_older)
            .expect("older generated_at evidence sidecar should be written");

        let latest_by_generated_at = latest_physical_peer_evidence_from_home(&home)
            .expect("latest physical evidence lookup should not fail")
            .expect("valid generated_at evidence should exist");
        assert_eq!(latest_by_generated_at.path, newer.display().to_string());
    }

    #[test]
    fn release_evidence_open_path_accepts_only_private_mesh_evidence_root() {
        let home = make_temp_home("release-evidence-open");
        let evidence_dir = home
            .join("private-mesh-release-proof")
            .join("20260613-proof");
        std::fs::create_dir_all(&evidence_dir).expect("evidence dir should be created");
        let evidence_file = evidence_dir.join("private-mesh-release-proof.verification.json");
        std::fs::write(&evidence_file, "{}").expect("evidence file should be written");
        let outside_dir = home.join("outside");
        std::fs::create_dir_all(&outside_dir).expect("outside dir should be created");
        let outside_file = outside_dir.join("not-evidence.json");
        std::fs::write(&outside_file, "{}").expect("outside file should be written");

        std::env::set_var("MUSU_HOME", &home);
        let accepted = release_evidence_folder_for_path(&evidence_file.display().to_string())
            .expect("private evidence file should be accepted");
        let rejected = release_evidence_folder_for_path(&outside_file.display().to_string());
        std::env::remove_var("MUSU_HOME");

        assert_eq!(accepted, evidence_dir.canonicalize().unwrap());
        assert!(rejected.is_err());
    }

    #[test]
    fn packaged_desktop_runtime_path_rejects_dev_targets() {
        assert!(!is_packaged_desktop_runtime_path(
            &std::path::PathBuf::from(
                "F:\\workspace\\musu-bee\\musu-bee\\src-tauri\\target\\release\\MUSU.exe"
            )
        ));
        assert!(!is_packaged_desktop_runtime_path(
            &std::path::PathBuf::from(
                "F:\\workspace\\musu-bee\\musu-bee\\src-tauri\\target\\debug\\MUSU.exe"
            )
        ));
        assert!(is_packaged_desktop_runtime_path(&std::path::PathBuf::from(
            "C:\\Program Files\\MUSU\\MUSU.exe"
        )));
        assert!(is_packaged_desktop_runtime_path(&std::path::PathBuf::from(
            "C:\\Users\\empty\\AppData\\Local\\MUSU\\MUSU.exe"
        )));
        assert!(is_packaged_desktop_runtime_path(&std::path::PathBuf::from(
            "C:\\Users\\empty\\AppData\\Local\\Programs\\MUSU\\MUSU.exe"
        )));
    }

    #[test]
    fn private_mesh_verify_target_accepts_only_tailnet_ipv4() {
        assert!(is_tailnet_ipv4("100.64.0.1"));
        assert!(is_tailnet_ipv4("100.127.255.254"));
        assert!(!is_tailnet_ipv4("100.63.255.255"));
        assert!(!is_tailnet_ipv4("100.128.0.1"));
        assert!(!is_tailnet_ipv4("127.0.0.1"));
        assert!(!is_tailnet_ipv4("not-an-ip"));
    }

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
    fn tauri_bundle_config_includes_runtime_sidecar() {
        let config_path =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
        let text = std::fs::read_to_string(config_path).expect("tauri config should be readable");
        let value: serde_json::Value =
            serde_json::from_str(&text).expect("tauri config should be valid JSON");
        let external_bin = value
            .get("bundle")
            .and_then(|bundle| bundle.get("externalBin"))
            .and_then(|external_bin| external_bin.as_array())
            .expect("bundle.externalBin should be an array");

        assert!(
            external_bin
                .iter()
                .any(|entry| entry.as_str() == Some("binaries/musu")),
            "Tauri package must include the MUSU runtime sidecar"
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
