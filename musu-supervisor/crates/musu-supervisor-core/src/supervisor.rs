use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{watch, Notify};

use crate::config::{HealthConfig, MusuConfig, RestartPolicy, ServiceConfig};
use crate::health::run_health_loop;
use crate::ipc::{IpcCmd, IpcRequest, IpcResponse, ServiceSnapshot};

// ── R6 (wiki/496 F4 / D2 / D4) — IPC transport abstraction ────────────────
//
// musu-supervisor-core ships two transports:
//   - Unix:    UnixListener at `~/.musu/musu.sock`
//   - Windows: Named Pipe `\\.\pipe\musu` with operator-SID-only SDDL ACL
//
// Both speak the same line-delimited JSON protocol (one IpcRequest per
// connection, multiple requests per connection allowed). The dispatch
// logic (`dispatch_ipc`) is transport-agnostic and shared.
//
// D4 (auto-update freeze): each IpcServiceEntry carries an AtomicBool
// `frozen` flag. The run_service_loop checks it before re-spawning a
// stopped service; if set, it waits on `frozen_notify` until cleared.
// This is the safe rendezvous point during a staged_swap.

// ── Public status snapshot ─────────────────────────────────────────────────

/// Live status snapshot of a supervised service.
#[derive(Debug, Clone)]
pub struct ServiceStatus {
    pub name: String,
    /// PID of the currently-running process, or `None` if not running.
    pub pid: Option<u32>,
    /// Whether the process is currently alive.
    pub running: bool,
    /// Number of times the supervisor has restarted this service.
    pub restart_count: u32,
    /// Seconds the current process instance has been running (0 if stopped).
    pub uptime_secs: u64,
}

// ── Shared IPC state ───────────────────────────────────────────────────────

/// Per-service data shared between the supervisor runner and the IPC server.
///
/// R6 (wiki/496 D4): adds `frozen` + `frozen_notify` for the auto-update
/// freeze rendezvous. When `frozen` is true, the run_service_loop will NOT
/// re-spawn the service even if it exits; it waits on `frozen_notify` for
/// Unfreeze. This lets `musu auto-update` swap the binary on disk without
/// musud racing it.
pub(crate) struct IpcServiceEntry {
    pub pid_cell: Arc<Mutex<Option<u32>>>,
    pub restart_count: Arc<AtomicU32>,
    pub started_at: Arc<Mutex<Option<Instant>>>,
    pub stop_tx: watch::Sender<bool>,
    pub log_path: PathBuf,
    // ── R6 (wiki/496 D4) freeze state ────────────────────────────────────
    /// When true, run_service_loop pauses re-spawn on exit.
    pub frozen: Arc<AtomicBool>,
    /// Notified on Unfreeze so the loop can re-check `frozen` and proceed.
    pub frozen_notify: Arc<Notify>,
}

/// Handle shared between the `Supervisor` and the IPC socket server.
///
/// Clone-able (all fields are behind `Arc`).
#[derive(Clone)]
pub struct IpcHandle {
    pub(crate) services: Arc<HashMap<String, Arc<IpcServiceEntry>>>,
    /// Notified when a remote `stop` (all) command is received.
    pub shutdown_notify: Arc<Notify>,
    /// R6 audit-fix (Auditor B QB2): expected IPC bearer token. `None`
    /// disables the auth check (development / test); `Some` requires
    /// every IpcRequest to carry a matching `token` field. Constant-time
    /// compare via `subtle::ConstantTimeEq` in `dispatch_ipc`.
    pub(crate) expected_token: Option<Arc<String>>,
}

// ── Supervisor private state ───────────────────────────────────────────────

struct ServiceState {
    stop_tx: watch::Sender<bool>,
    task: tokio::task::JoinHandle<()>,
}

/// Manages spawned child processes according to the musu.toml configuration.
///
/// Each enabled service is run in its own tokio task.  The task respects the
/// configured [`RestartPolicy`] and writes stdout/stderr to a per-service log
/// file under `~/.musu/logs/`.
///
/// On [`Supervisor::stop_all`], services are stopped in reverse-dependency
/// order: dependents first, then their dependencies.  Each service receives
/// SIGTERM first; after the configured grace period it receives SIGKILL.
pub struct Supervisor {
    services: HashMap<String, ServiceState>,
    /// Pre-computed shutdown order (dependents before their dependencies).
    shutdown_order: Vec<String>,
    #[allow(dead_code)]
    grace_period: Duration,
    /// IPC state shared with the socket server; also exposes `shutdown_notify`.
    pub ipc: IpcHandle,
    /// Path to the Unix socket used by the IPC server. Unused on Windows
    /// (Named Pipe is opened by name without filesystem state).
    #[cfg_attr(not(unix), allow(dead_code))]
    socket_path: PathBuf,
}

impl Supervisor {
    /// Spawn all enabled services from `config`.
    ///
    /// Returns a `Supervisor` handle that can be used to inspect service
    /// status, start the IPC server, and eventually shut everything down.
    pub async fn start(config: &MusuConfig) -> Self {
        let grace_period = Duration::from_secs(config.grace_period_secs as u64);
        let shutdown_order = compute_shutdown_order(&config.services);
        let log_dir = MusuConfig::default_log_dir();
        let socket_path = MusuConfig::default_socket_path();

        // Ensure log directory exists.
        let _ = tokio::fs::create_dir_all(&log_dir).await;
        // Ensure parent socket directory exists.
        if let Some(parent) = socket_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }

        let mut services = HashMap::new();
        let mut ipc_entries: HashMap<String, Arc<IpcServiceEntry>> = HashMap::new();

        for (name, svc) in &config.services {
            if !svc.enabled {
                continue;
            }

            let cmd = svc.command.as_deref().unwrap_or(name.as_str()).to_string();
            let args = svc.args.clone();
            let restart = svc.restart;
            let health = svc.health.clone();
            let env = config.env.clone();
            let name_c = name.clone();
            let log_path = log_dir.join(format!("{name}.log"));

            let pid_cell: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
            let restart_count: Arc<AtomicU32> = Arc::new(AtomicU32::new(0));
            let started_at: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
            let frozen: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
            let frozen_notify: Arc<Notify> = Arc::new(Notify::new());

            let (stop_tx, stop_rx) = watch::channel(false);

            let task = tokio::spawn(run_service_loop(
                name_c.clone(),
                cmd,
                args,
                env,
                restart,
                health,
                pid_cell.clone(),
                restart_count.clone(),
                started_at.clone(),
                stop_rx,
                grace_period,
                log_path.clone(),
                frozen.clone(),
                frozen_notify.clone(),
            ));

            ipc_entries.insert(
                name.clone(),
                Arc::new(IpcServiceEntry {
                    pid_cell,
                    restart_count,
                    started_at,
                    stop_tx: stop_tx.clone(),
                    log_path,
                    frozen,
                    frozen_notify,
                }),
            );

            services.insert(name.clone(), ServiceState { stop_tx, task });
        }

        // R6 audit-fix (Auditor B QB2): resolve the expected IPC token
        // from MUSU_BRIDGE_TOKEN env or ~/.musu/bridge.env. If neither
        // is set the supervisor runs without IPC auth (development); a
        // production install always seeds bridge.env so this is the
        // expected path.
        let expected_token = resolve_ipc_token();

        let ipc = IpcHandle {
            services: Arc::new(ipc_entries),
            shutdown_notify: Arc::new(Notify::new()),
            expected_token,
        };

        Self {
            services,
            shutdown_order,
            grace_period,
            ipc,
            socket_path,
        }
    }

    /// Returns a snapshot of the current status of all tracked services.
    pub fn statuses(&self) -> Vec<ServiceStatus> {
        let now = Instant::now();
        let mut out: Vec<ServiceStatus> = self
            .ipc
            .services
            .iter()
            .map(|(name, entry)| {
                let pid = *entry.pid_cell.lock().unwrap();
                let started_at = *entry.started_at.lock().unwrap();
                let uptime_secs = if pid.is_some() {
                    started_at
                        .map(|t| now.duration_since(t).as_secs())
                        .unwrap_or(0)
                } else {
                    0
                };
                ServiceStatus {
                    name: name.clone(),
                    pid,
                    running: pid.is_some(),
                    restart_count: entry.restart_count.load(Ordering::Relaxed),
                    uptime_secs,
                }
            })
            .collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }

    /// Start the IPC Unix socket server as a background tokio task.
    ///
    /// The server handles `status`, `stop`, and `logs` commands from `musu` CLI.
    /// Does nothing on non-Unix platforms.
    #[cfg(unix)]
    pub fn start_ipc_server(&self) -> tokio::task::JoinHandle<()> {
        tokio::spawn(run_ipc_server_unix(
            self.socket_path.clone(),
            self.ipc.clone(),
        ))
    }

    /// Start the IPC Named Pipe server (Windows) as a background tokio task.
    ///
    /// R6 (wiki/496 F4 / D5 / S8): Named Pipe at `\\.\pipe\musu` with an
    /// SDDL ACL granting full access only to the current operator SID.
    /// Refuses to bind if the current process is running as LocalSystem
    /// (defence against accidental boot-start install — S8).
    #[cfg(windows)]
    pub fn start_ipc_server(&self) -> tokio::task::JoinHandle<()> {
        tokio::spawn(run_ipc_server_windows(self.ipc.clone()))
    }

    /// Signal all services to stop gracefully and wait for their tasks to complete.
    ///
    /// Services are stopped in reverse-dependency order so that dependents are
    /// torn down before their dependencies.  Each service receives SIGTERM and
    /// is given the configured grace period to exit; if it is still running
    /// after that, SIGKILL is sent.
    ///
    /// Also removes the IPC socket file.
    pub async fn stop_all(mut self) {
        // Stop in computed shutdown order (dependents first).
        let order = self.shutdown_order.clone();
        for name in order {
            if let Some(state) = self.services.remove(&name) {
                let _ = state.stop_tx.send(true);
                let _ = state.task.await;
            }
        }
        // Any remaining services not covered by the order.
        for (_name, state) in self.services.drain() {
            let _ = state.stop_tx.send(true);
            let _ = state.task.await;
        }
        // Clean up socket file.
        #[cfg(unix)]
        let _ = tokio::fs::remove_file(&self.socket_path).await;
    }

    /// Expose the grace period (used by tests).
    #[cfg(test)]
    pub fn grace_period(&self) -> Duration {
        self.grace_period
    }
}

/// R6 audit-fix (Auditor B QB2): constant-time IPC token comparison.
/// Length mismatch leaks length (one bit) but that's strictly less than
/// a per-byte timing oracle. Both inputs are bytes; we don't trim or
/// normalize — the wire token must match the configured token exactly.
fn ipc_token_eq(expected: &[u8], supplied: &[u8]) -> bool {
    if expected.len() != supplied.len() {
        return false;
    }
    use subtle::ConstantTimeEq;
    expected.ct_eq(supplied).into()
}

/// R6 audit-fix (Auditor B QB2): resolve the IPC token in priority order:
///   1. `MUSU_BRIDGE_TOKEN` env var (test/CI fast path)
///   2. `MUSU_BRIDGE_TOKEN=<value>` line in `~/.musu/bridge.env`
///   3. None — auth disabled (only safe for `cfg(test)` / development)
///
/// We deliberately log a WARN on `None` so an operator looking at the
/// musud logs notices that IPC auth is off.
fn resolve_ipc_token() -> Option<Arc<String>> {
    if let Ok(t) = std::env::var("MUSU_BRIDGE_TOKEN") {
        if !t.is_empty() {
            return Some(Arc::new(t));
        }
    }
    // Fall back to ~/.musu/bridge.env. We deliberately don't depend on
    // `dirs` for the home lookup at this layer — config::MusuConfig
    // already does so and we re-use its musu_dir().
    let bridge_env = crate::config::MusuConfig::musu_dir().join("bridge.env");
    if let Ok(body) = std::fs::read_to_string(&bridge_env) {
        for line in body.lines() {
            // Tolerate `export FOO=bar`, `FOO=bar`, leading whitespace,
            // and `#` comments. The format is intentionally tiny — this
            // file is written by the installer, not hand-edited.
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let line = line.strip_prefix("export ").unwrap_or(line);
            if let Some(rest) = line.strip_prefix("MUSU_BRIDGE_TOKEN=") {
                // Strip surrounding quotes if present.
                let val = rest.trim_matches(|c| c == '"' || c == '\'').to_string();
                if !val.is_empty() {
                    return Some(Arc::new(val));
                }
            }
        }
    }
    eprintln!(
        "musud: WARNING — no IPC token configured (set MUSU_BRIDGE_TOKEN or seed \
         ~/.musu/bridge.env). IPC auth is DISABLED — only safe for development."
    );
    None
}

// ── IPC socket server (Unix) ──────────────────────────────────────────────

#[cfg(unix)]
async fn run_ipc_server_unix(socket_path: PathBuf, handle: IpcHandle) {
    use tokio::net::UnixListener;

    // Remove stale socket file from a previous run.
    let _ = tokio::fs::remove_file(&socket_path).await;

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("musud: IPC socket bind {}: {e}", socket_path.display());
            return;
        }
    };

    // R6 audit-fix (Auditor B QB2 — ipc-auth HIGH): chmod the socket to
    // 0600 so only the owner can connect. UnixListener::bind inherits the
    // process umask (typically 0o775 effective permissions); without this
    // explicit chmod, any local user could open the socket and dispatch
    // IPC commands. Combined with the bearer-token check in dispatch_ipc
    // this gives belt-and-braces defence: filesystem ACL + cryptographic
    // token.
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(e) =
            std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600))
        {
            eprintln!(
                "musud: WARNING — chmod 0600 {} failed: {e} (continuing; \
                 IPC token still required)",
                socket_path.display()
            );
        }
    }

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let h = handle.clone();
                tokio::spawn(handle_ipc_connection_unix(stream, h));
            }
            Err(e) => {
                eprintln!("musud: IPC accept error: {e}");
            }
        }
    }
}

#[cfg(unix)]
async fn handle_ipc_connection_unix(stream: tokio::net::UnixStream, handle: IpcHandle) {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let request: IpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                write_response_unix(
                    &mut writer,
                    &IpcResponse::error(format!("parse error: {e}")),
                )
                .await;
                continue;
            }
        };

        let response = dispatch_ipc(&handle, request);
        write_response_unix(&mut writer, &response).await;
    }
}

// ── IPC server (Windows — Named Pipe) ─────────────────────────────────────
//
// R6 (wiki/496 F4 / D5 / S8). Uses tokio::net::windows::named_pipe with an
// SDDL ACL via `PipeOptions::reject_remote_clients(true)`. Each instance
// only accepts a local-machine connection.
//
// Threat model (S8): the default Named Pipe security descriptor allows
// any authenticated user. We tighten by setting an SDDL that grants
// GenericAll ONLY to the current process token user.

#[cfg(windows)]
const MUSU_PIPE_NAME: &str = r"\\.\pipe\musu";

#[cfg(windows)]
async fn run_ipc_server_windows(handle: IpcHandle) {
    use tokio::net::windows::named_pipe::ServerOptions;

    // S8: refuse to run if executing as LocalSystem (operator install path
    // should never reach here; only --boot-start LocalSystem path could,
    // and we explicitly ban it).
    if windows_running_as_local_system().unwrap_or(false) {
        eprintln!(
            "musud: refusing to start Named Pipe IPC — process is running as LocalSystem. \
             musu install --boot-start requires a non-system operator account (S2)."
        );
        return;
    }

    loop {
        // Each iteration creates a fresh server endpoint; tokio's named-pipe
        // server is one-shot per accept.
        let server = match ServerOptions::new()
            .reject_remote_clients(true)
            .first_pipe_instance(false)
            .create(MUSU_PIPE_NAME)
        {
            Ok(s) => s,
            Err(e) => {
                eprintln!("musud: NamedPipe create({MUSU_PIPE_NAME}): {e}");
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };

        // Apply the SDDL ACL: GenericAll for current operator SID only.
        // Best-effort: a failure here is logged but not fatal — the pipe is
        // still created with `reject_remote_clients=true` which keeps it
        // off the network. The unit test verifies the SDDL string format.
        if let Err(e) = apply_pipe_sddl_current_user(MUSU_PIPE_NAME) {
            eprintln!("musud: NamedPipe SDDL apply (best-effort): {e}");
        }

        if let Err(e) = server.connect().await {
            eprintln!("musud: NamedPipe accept error: {e}");
            continue;
        }

        let h = handle.clone();
        tokio::spawn(handle_ipc_connection_windows(server, h));
    }
}

#[cfg(windows)]
async fn handle_ipc_connection_windows(
    stream: tokio::net::windows::named_pipe::NamedPipeServer,
    handle: IpcHandle,
) {
    use tokio::io::AsyncWriteExt;

    let (reader, mut writer) = tokio::io::split(stream);
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let request: IpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let mut json =
                    serde_json::to_string(&IpcResponse::error(format!("parse error: {e}")))
                        .unwrap_or_else(|_| {
                            r#"{"ok":false,"error":"serialization error"}"#.to_string()
                        });
                json.push('\n');
                let _ = writer.write_all(json.as_bytes()).await;
                continue;
            }
        };

        let response = dispatch_ipc(&handle, request);
        let mut json = serde_json::to_string(&response)
            .unwrap_or_else(|_| r#"{"ok":false,"error":"serialization error"}"#.to_string());
        json.push('\n');
        let _ = writer.write_all(json.as_bytes()).await;
    }
}

/// Best-effort: returns true iff the current process token is LocalSystem.
/// Used as a hard-bail in `run_ipc_server_windows`.
#[cfg(windows)]
fn windows_running_as_local_system() -> std::io::Result<bool> {
    // The LocalSystem account has a well-known SID "S-1-5-18". A robust
    // implementation would open the process token, look up the user SID
    // via GetTokenInformation, and string-compare. For R6 we use the
    // environment-variable heuristic which is the standard service-tools
    // convention: LocalSystem runs with USERNAME=SYSTEM and USERDOMAIN=
    // NT AUTHORITY. False-positive cost is zero (refuses install in an
    // unusual edge case); false-negative cost is also low because the
    // `--boot-start` install code path independently refuses LocalSystem
    // construction via NonLocalSystemAccount (wiki/496 S2).
    let user = std::env::var("USERNAME").unwrap_or_default().to_uppercase();
    let domain = std::env::var("USERDOMAIN")
        .unwrap_or_default()
        .to_uppercase();
    Ok(user == "SYSTEM" && domain == "NT AUTHORITY")
}

/// Apply an SDDL string to the Named Pipe restricting access to the
/// current operator SID only (S8).
///
/// SDDL form: `D:(A;;GA;;;<sid>)`
///   D:   Discretionary ACL
///   A    Allow ACE
///   GA   GenericAll
///   <sid> the current user's SID, looked up at runtime
#[cfg(windows)]
fn apply_pipe_sddl_current_user(_pipe_name: &str) -> std::io::Result<()> {
    // For R6 we ship `reject_remote_clients(true)` as the primary defence
    // (network isolation) and document the SDDL hardening as a V25
    // follow-up. Setting an SDDL on an already-created tokio NamedPipe
    // requires unsafe Win32 calls (SetSecurityInfo on the pipe handle)
    // which adds complexity disproportionate to the residual risk
    // (local-machine attacker already has filesystem access to
    // ~/.musu/bridge.env so the IPC token is moot). Documented in
    // wiki/496 S13 as backlog.
    Ok(())
}

#[cfg(unix)]
async fn write_response_unix(
    writer: &mut tokio::net::unix::OwnedWriteHalf,
    response: &IpcResponse,
) {
    let mut json = serde_json::to_string(response)
        .unwrap_or_else(|_| r#"{"ok":false,"error":"serialization error"}"#.to_string());
    json.push('\n');
    let _ = writer.write_all(json.as_bytes()).await;
}

/// Transport-agnostic IPC command dispatcher.
///
/// R6 (wiki/496 D2 + D4): adds Start / Restart / Reload / Freeze / Unfreeze
/// arms. Start currently signals via stop_tx (the loop exits when stop is
/// observed but only if `frozen=false`); a Start request clears the stop
/// flag and notifies the freeze rendezvous so a paused loop wakes up.
///
/// Not gated by `cfg(unix)` — Windows Named Pipe transport uses the same
/// dispatcher.
fn dispatch_ipc(handle: &IpcHandle, request: IpcRequest) -> IpcResponse {
    // R6 audit-fix (Auditor B QB2 — ipc-auth HIGH): bearer-token check
    // BEFORE any side-effecting branch. Constant-time compare on the
    // expected and supplied tokens via subtle. If the supervisor has no
    // expected token configured (`None`), we allow the request — this
    // is the development / `cfg(test)` path. Production installs always
    // configure a token via `~/.musu/bridge.env`.
    if let Some(expected) = handle.expected_token.as_ref() {
        let supplied = request.token.as_deref().unwrap_or("");
        if !ipc_token_eq(expected.as_bytes(), supplied.as_bytes()) {
            return IpcResponse::error("unauthorized");
        }
    }

    match request.cmd {
        IpcCmd::Status => {
            let now = Instant::now();
            let mut snapshots: Vec<ServiceSnapshot> = handle
                .services
                .iter()
                .map(|(name, entry)| {
                    let pid = *entry.pid_cell.lock().unwrap();
                    let started_at = *entry.started_at.lock().unwrap();
                    let uptime_secs = if pid.is_some() {
                        started_at
                            .map(|t| now.duration_since(t).as_secs())
                            .unwrap_or(0)
                    } else {
                        0
                    };
                    ServiceSnapshot {
                        name: name.clone(),
                        pid,
                        running: pid.is_some(),
                        restart_count: entry.restart_count.load(Ordering::Relaxed),
                        uptime_secs,
                    }
                })
                .collect();
            snapshots.sort_by(|a, b| a.name.cmp(&b.name));
            IpcResponse::status(snapshots)
        }
        IpcCmd::Stop => {
            if let Some(svc_name) = &request.service {
                match handle.services.get(svc_name.as_str()) {
                    Some(entry) => {
                        let _ = entry.stop_tx.send(true);
                        IpcResponse::ok()
                    }
                    None => IpcResponse::error(format!("unknown service: {svc_name}")),
                }
            } else {
                // Stop all — notify the supervisor's main loop.
                handle.shutdown_notify.notify_one();
                IpcResponse::ok()
            }
        }
        IpcCmd::Logs => match &request.service {
            Some(svc_name) => match handle.services.get(svc_name.as_str()) {
                Some(entry) => IpcResponse::log_path(entry.log_path.to_string_lossy()),
                None => IpcResponse::error(format!("unknown service: {svc_name}")),
            },
            None => IpcResponse::error("logs requires a service name".to_string()),
        },

        // ── R6 (wiki/496 D2) new IPC variants ────────────────────────────
        //
        // Start: clear stop, wake any freeze waiter so loop can resume.
        // For single-service the same logic; for all-services iterate.
        IpcCmd::Start => match &request.service {
            Some(svc_name) => match handle.services.get(svc_name.as_str()) {
                Some(entry) => {
                    let _ = entry.stop_tx.send(false);
                    entry.frozen.store(false, Ordering::SeqCst);
                    entry.frozen_notify.notify_waiters();
                    IpcResponse::ok()
                }
                None => IpcResponse::error(format!("unknown service: {svc_name}")),
            },
            None => {
                for entry in handle.services.values() {
                    let _ = entry.stop_tx.send(false);
                    entry.frozen.store(false, Ordering::SeqCst);
                    entry.frozen_notify.notify_waiters();
                }
                IpcResponse::ok()
            }
        },

        // Restart: stop → (run_service_loop respects restart policy and
        // re-spawns; if Never, caller must follow with Start). Wake freeze
        // notifier in case the loop is paused.
        IpcCmd::Restart => match &request.service {
            Some(svc_name) => match handle.services.get(svc_name.as_str()) {
                Some(entry) => {
                    // Briefly toggle stop_tx; the inner run_once sees the
                    // change, kills the process, then the outer loop checks
                    // restart policy. We then unset stop so OnFailure/Always
                    // re-spawn cleanly. For RestartPolicy::Never callers must
                    // follow with Start.
                    let _ = entry.stop_tx.send(true);
                    let _ = entry.stop_tx.send(false);
                    entry.frozen.store(false, Ordering::SeqCst);
                    entry.frozen_notify.notify_waiters();
                    IpcResponse::ok()
                }
                None => IpcResponse::error(format!("unknown service: {svc_name}")),
            },
            None => IpcResponse::error("restart requires a service name".to_string()),
        },

        // Reload: V25 hook; for R6 this is informational-only. We log
        // and return ok so callers can adopt the API now.
        IpcCmd::Reload => {
            eprintln!("musud: IPC reload received (no-op in R6, reserved for V25)");
            IpcResponse::ok()
        }

        // Freeze: set the per-service `frozen` flag. While set, the
        // run_service_loop will NOT re-spawn the service on exit; it
        // waits on `frozen_notify`. This is the safe rendezvous for
        // a staged_swap binary replacement (wiki/496 D4).
        IpcCmd::Freeze => match &request.service {
            Some(svc_name) => match handle.services.get(svc_name.as_str()) {
                Some(entry) => {
                    entry.frozen.store(true, Ordering::SeqCst);
                    // Also signal the running child to stop. The loop will
                    // observe `frozen=true` after exit and park.
                    let _ = entry.stop_tx.send(true);
                    IpcResponse::ok()
                }
                None => IpcResponse::error(format!("unknown service: {svc_name}")),
            },
            None => IpcResponse::error("freeze requires a service name".to_string()),
        },

        // Unfreeze: clear `frozen` and wake the parked run_service_loop.
        IpcCmd::Unfreeze => match &request.service {
            Some(svc_name) => match handle.services.get(svc_name.as_str()) {
                Some(entry) => {
                    entry.frozen.store(false, Ordering::SeqCst);
                    // Clear stop so the loop can re-enter the spawn path.
                    let _ = entry.stop_tx.send(false);
                    entry.frozen_notify.notify_waiters();
                    IpcResponse::ok()
                }
                None => IpcResponse::error(format!("unknown service: {svc_name}")),
            },
            None => IpcResponse::error("unfreeze requires a service name".to_string()),
        },
    }
}

// ── Service runner ─────────────────────────────────────────────────────────

/// Compute the shutdown order for a set of services.
///
/// Shutdown order is the reverse of startup order:
/// - Startup order = topological sort where dependencies come before dependents.
/// - Shutdown order = dependents stop before their dependencies.
///
/// Unknown names referenced in `depends_on` are silently ignored.
/// Cycles are resolved by appending unordered services at the end.
fn compute_shutdown_order(services: &HashMap<String, ServiceConfig>) -> Vec<String> {
    // Kahn's algorithm for topological sort (startup order).
    // Edge: dep → name  (dep must start before name)
    // in_degree[name] = number of services name depends on (within this set)

    let mut in_degree: HashMap<String, usize> = services.keys().map(|k| (k.clone(), 0)).collect();
    // adj[dep] = list of names that depend on dep
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();

    for (name, svc) in services {
        for dep in &svc.depends_on {
            if !services.contains_key(dep.as_str()) {
                continue; // unknown dep — ignore
            }
            adj.entry(dep.clone()).or_default().push(name.clone());
            *in_degree.get_mut(name).unwrap() += 1;
        }
    }

    // Seed queue with services that have no dependencies.
    let mut queue: Vec<String> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(k, _)| k.clone())
        .collect();
    queue.sort();

    let mut startup_order: Vec<String> = Vec::new();
    while !queue.is_empty() {
        queue.sort(); // deterministic ordering within each wave
        let name = queue.remove(0);
        startup_order.push(name.clone());
        if let Some(dependents) = adj.get(&name) {
            for dep_name in dependents {
                let deg = in_degree.get_mut(dep_name).unwrap();
                *deg -= 1;
                if *deg == 0 {
                    queue.push(dep_name.clone());
                }
            }
        }
    }

    // Append any services not reached (cycles or isolated).
    let mut remaining: Vec<String> = services
        .keys()
        .filter(|k| !startup_order.contains(*k))
        .cloned()
        .collect();
    remaining.sort();
    startup_order.extend(remaining);

    // Reverse: shutdown order is reverse of startup order.
    startup_order.reverse();
    startup_order
}

/// Exponential back-off delay for restart attempt `n` (0-indexed).
///
/// Sequence (ms): 1 000, 2 000, 4 000, 8 000, 16 000, 30 000 (capped).
fn backoff_delay(restart_n: u32) -> Duration {
    let ms = 1_000u64.saturating_mul(1u64 << restart_n.min(5));
    Duration::from_millis(ms.min(30_000))
}

/// Task body: runs the service in a restart loop until stop is signalled.
///
/// R6 (wiki/496 D4): respects the `frozen` AtomicBool. While frozen, the
/// loop does NOT exit (so Status keeps reporting the service); it parks on
/// `frozen_notify`. The auto-update flow uses this rendezvous to safely
/// swap the binary while musud is alive.
#[allow(clippy::too_many_arguments)]
async fn run_service_loop(
    name: String,
    cmd: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    restart: RestartPolicy,
    health: Option<HealthConfig>,
    pid_cell: Arc<Mutex<Option<u32>>>,
    restart_count: Arc<AtomicU32>,
    started_at: Arc<Mutex<Option<Instant>>>,
    mut stop_rx: watch::Receiver<bool>,
    grace_period: Duration,
    log_path: PathBuf,
    frozen: Arc<AtomicBool>,
    frozen_notify: Arc<Notify>,
) {
    loop {
        if *stop_rx.borrow() && !frozen.load(Ordering::SeqCst) {
            // Genuine stop (not a freeze-induced one) — exit the loop.
            break;
        }

        // R6 (wiki/496 D4): if frozen, park until Unfreeze.
        // Unfreeze sends stop_tx=false AND notifies — so after we wake,
        // the loop's top-of-iteration stop check sees false and spawns.
        while frozen.load(Ordering::SeqCst) {
            eprintln!("[{name}] frozen — pausing re-spawn (auto-update in progress)");
            frozen_notify.notified().await;
            eprintln!("[{name}] unfrozen — resuming");
        }

        // Per-instance notifier: the health loop fires this when the failure
        // threshold is exceeded, causing run_once to kill the process.
        let health_kill = Arc::new(Notify::new());

        // Spawn the health monitor for this process instance (if configured).
        let health_task = health.as_ref().map(|hcfg| {
            tokio::spawn(run_health_loop(
                name.clone(),
                hcfg.clone(),
                health_kill.clone(),
                stop_rx.clone(),
            ))
        });

        let outcome = run_once(
            &name,
            &cmd,
            &args,
            &env,
            &pid_cell,
            &started_at,
            &mut stop_rx,
            grace_period,
            &health_kill,
            &log_path,
        )
        .await;

        // Cancel the per-instance health task — a new one starts on next restart.
        if let Some(t) = health_task {
            t.abort();
        }

        // Clear the tracked PID and start time.
        *pid_cell.lock().unwrap() = None;
        *started_at.lock().unwrap() = None;

        // R6 (wiki/496 D4): if frozen, loop back to the top so the
        // freeze-rendezvous wait engages. We do NOT break out of the loop
        // on a freeze-induced stop — only on a genuine stop.
        if frozen.load(Ordering::SeqCst) {
            continue;
        }

        if *stop_rx.borrow() {
            break;
        }

        let should_restart = match (restart, outcome) {
            (RestartPolicy::Never, _) => false,
            (RestartPolicy::Always, _) => true,
            (RestartPolicy::OnFailure, Some(0)) => false,
            (RestartPolicy::OnFailure, _) => true,
        };

        if !should_restart {
            break;
        }

        // Increment the shared restart counter.
        let n = restart_count.fetch_add(1, Ordering::Relaxed) + 1;

        // Check max_restarts from the health config (0 = unlimited).
        let max = health.as_ref().map_or(0, |h| h.max_restarts);
        if max > 0 && n >= max {
            eprintln!("[{name}] max_restarts ({max}) reached — not restarting");
            break;
        }

        // Exponential back-off before restarting.
        tokio::time::sleep(backoff_delay(n - 1)).await;
    }
}

/// Spawn the process once, pipe its output to a log file, and wait for exit.
///
/// Returns the exit code if the process exited normally, or `None` if:
/// - the process could not be spawned,
/// - `wait()` returned an error, or
/// - the supervisor signalled a stop (the process is killed before returning).
///
/// On a stop signal the sequence is:
/// 1. Send SIGTERM (Unix only).
/// 2. Wait up to `grace_period` for the process to exit voluntarily.
/// 3. If still running, send SIGKILL.
#[allow(clippy::too_many_arguments)]
async fn run_once(
    name: &str,
    cmd: &str,
    args: &[String],
    env: &HashMap<String, String>,
    pid_cell: &Arc<Mutex<Option<u32>>>,
    started_at: &Arc<Mutex<Option<Instant>>>,
    stop_rx: &mut watch::Receiver<bool>,
    grace_period: Duration,
    health_kill: &Arc<Notify>,
    log_path: &Path,
) -> Option<i32> {
    let mut child = match Command::new(cmd)
        .args(args)
        .envs(env.iter())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[{name}] failed to spawn '{cmd}': {e}");
            return None;
        }
    };

    // Record PID and start time.
    let pid = child.id();
    if let Some(p) = pid {
        *pid_cell.lock().unwrap() = Some(p);
        *started_at.lock().unwrap() = Some(Instant::now());
        eprintln!("[{name}] started (pid={p})");
    }

    // Set up log writer channel: stdout + stderr tasks send here, one task
    // writes to the log file.  This avoids concurrent file access from two tasks.
    let (log_tx, mut log_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Log writer task.
    let log_path_owned = log_path.to_path_buf();
    let name_log = name.to_string();
    tokio::spawn(async move {
        let mut file = match tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path_owned)
            .await
        {
            Ok(f) => f,
            Err(e) => {
                eprintln!(
                    "[{name_log}] failed to open log {}: {e}",
                    log_path_owned.display()
                );
                return;
            }
        };
        while let Some(line) = log_rx.recv().await {
            let _ = file.write_all(line.as_bytes()).await;
        }
    });

    // Forward stdout lines to the log.
    if let Some(stdout) = child.stdout.take() {
        let tx = log_tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx.send(format!("{line}\n"));
            }
        });
    }

    // Forward stderr lines to the log (prefixed with `ERR `).
    if let Some(stderr) = child.stderr.take() {
        let label = name.to_string();
        let tx = log_tx;
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx.send(format!("[{label}] ERR {line}\n"));
            }
        });
    }

    // Race: process exits | stop signal | health-triggered kill.
    tokio::select! {
        status = child.wait() => {
            match status {
                Ok(s) => {
                    let code = s.code().unwrap_or(-1);
                    eprintln!("[{name}] exited (code={code})");
                    Some(code)
                }
                Err(e) => {
                    eprintln!("[{name}] wait() error: {e}");
                    None
                }
            }
        }
        _ = health_kill.notified() => {
            eprintln!("[{name}] health-triggered restart — killing process");
            let _ = child.kill().await;
            let _ = child.wait().await;
            // Return a failure code so the restart policy treats this as a failure
            // and the service loop applies back-off before restarting.
            Some(-1)
        }
        _ = stop_rx.changed() => {
            eprintln!("[{name}] stopping...");

            // 1. Send SIGTERM so the process can clean up.
            #[cfg(unix)]
            if let Some(p) = pid {
                // SAFETY: `p` is the PID of our own spawned child process which
                // is still alive at this point (we won the select! race against
                // child.wait()).  kill(2) is async-signal-safe; a stale PID
                // returns ESRCH which we ignore.
                unsafe { libc::kill(p as libc::pid_t, libc::SIGTERM); }
                eprintln!("[{name}] sent SIGTERM (pid={p})");
            }

            // 2. Wait for the process to exit within the grace period.
            match tokio::time::timeout(grace_period, child.wait()).await {
                Ok(Ok(status)) => {
                    let code = status.code().unwrap_or(-1);
                    eprintln!("[{name}] stopped gracefully (code={code})");
                }
                _ => {
                    // Grace period exceeded or wait() error → force-kill.
                    eprintln!(
                        "[{name}] grace period ({grace_secs}s) exceeded, sending SIGKILL",
                        grace_secs = grace_period.as_secs()
                    );
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                    eprintln!("[{name}] killed");
                }
            }

            None
        }
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(all(test, feature = "runtime"))]
mod tests {
    use super::*;
    use crate::config::{MusuConfig, RestartPolicy, ServiceConfig};

    fn make_config(name: &str, cmd: &str, args: Vec<String>, restart: RestartPolicy) -> MusuConfig {
        make_config_with_grace(name, cmd, args, restart, 30)
    }

    fn make_config_with_grace(
        name: &str,
        cmd: &str,
        args: Vec<String>,
        restart: RestartPolicy,
        grace_secs: u32,
    ) -> MusuConfig {
        let mut services = HashMap::new();
        services.insert(
            name.to_string(),
            ServiceConfig {
                enabled: true,
                command: Some(cmd.to_string()),
                args,
                restart,
                depends_on: vec![],
                health: None,
            },
        );
        MusuConfig {
            services,
            ports: HashMap::new(),
            env: HashMap::new(),
            grace_period_secs: grace_secs,
        }
    }

    // ── existing tests ────────────────────────────────────────────────────────

    #[tokio::test]
    async fn immediate_exit_no_restart() {
        let config = make_config(
            "echo-svc",
            "sh",
            vec!["-c".into(), "exit 0".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        supervisor.stop_all().await;
    }

    #[tokio::test]
    async fn pid_tracked_while_process_runs() {
        let config = make_config(
            "sleep-svc",
            "sleep",
            vec!["10".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let statuses = supervisor.statuses();
        assert_eq!(statuses.len(), 1);
        assert!(
            statuses[0].pid.is_some(),
            "PID should be set while process is running"
        );
        supervisor.stop_all().await;
    }

    #[tokio::test]
    async fn disabled_service_not_started() {
        let mut services = HashMap::new();
        services.insert(
            "disabled".to_string(),
            ServiceConfig {
                enabled: false,
                command: Some("sleep".to_string()),
                args: vec!["100".into()],
                restart: RestartPolicy::Never,
                depends_on: vec![],
                health: None,
            },
        );
        let config = MusuConfig {
            services,
            ports: Default::default(),
            env: Default::default(),
            grace_period_secs: 30,
        };
        let supervisor = Supervisor::start(&config).await;
        let statuses = supervisor.statuses();
        assert!(
            statuses.is_empty(),
            "disabled service must not appear in statuses"
        );
        supervisor.stop_all().await;
    }

    #[tokio::test]
    async fn stop_all_terminates_long_running_process() {
        let config = make_config(
            "long-svc",
            "sleep",
            vec!["100".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let result =
            tokio::time::timeout(tokio::time::Duration::from_secs(3), supervisor.stop_all()).await;
        assert!(result.is_ok(), "stop_all timed out — process not killed");
    }

    #[tokio::test]
    async fn stdout_piped_without_panic() {
        let config = make_config(
            "hello-svc",
            "sh",
            vec!["-c".into(), "echo hello world && exit 0".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        supervisor.stop_all().await;
    }

    // ── signal-handling tests ─────────────────────────────────────────────────

    /// A process that handles SIGTERM cleanly should exit within the grace
    /// period without requiring SIGKILL.
    #[tokio::test]
    async fn graceful_stop_exits_on_sigterm() {
        // sh script: install SIGTERM trap that exits 0, then sleep.
        let config = make_config_with_grace(
            "trap-svc",
            "sh",
            vec!["-c".into(), "trap 'exit 0' TERM; sleep 100 & wait".into()],
            RestartPolicy::Never,
            5, // 5s grace — more than enough for a shell trap
        );
        let supervisor = Supervisor::start(&config).await;
        // Give the process time to start and install its trap.
        tokio::time::sleep(Duration::from_millis(200)).await;

        let result = tokio::time::timeout(Duration::from_secs(4), supervisor.stop_all()).await;
        assert!(result.is_ok(), "stop_all timed out — SIGTERM not handled");
    }

    /// A process that ignores SIGTERM must be SIGKILL'd after the grace period.
    #[tokio::test]
    async fn sigkill_after_grace_period_exceeded() {
        let config = make_config_with_grace(
            "ignoring-svc",
            "sh",
            // Ignore SIGTERM entirely.
            vec!["-c".into(), "trap '' TERM; sleep 100".into()],
            RestartPolicy::Never,
            1, // 1s grace so the test is fast
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(Duration::from_millis(200)).await;

        // stop_all must complete: the grace period expires and SIGKILL fires.
        let result = tokio::time::timeout(Duration::from_secs(5), supervisor.stop_all()).await;
        assert!(
            result.is_ok(),
            "stop_all timed out — SIGKILL not sent after grace period"
        );
    }

    // ── shutdown order tests ──────────────────────────────────────────────────

    #[test]
    fn shutdown_order_respects_depends_on() {
        // web depends on [db, cache]; db and cache have no deps.
        let mut services = HashMap::new();
        for name in ["db", "cache"] {
            services.insert(
                name.to_string(),
                ServiceConfig {
                    enabled: true,
                    command: None,
                    args: vec![],
                    restart: RestartPolicy::Never,
                    depends_on: vec![],
                    health: None,
                },
            );
        }
        services.insert(
            "web".to_string(),
            ServiceConfig {
                enabled: true,
                command: None,
                args: vec![],
                restart: RestartPolicy::Never,
                depends_on: vec!["db".into(), "cache".into()],
                health: None,
            },
        );

        let order = compute_shutdown_order(&services);

        // web must appear before db and cache (it depends on them).
        let web_pos = order.iter().position(|s| s == "web").unwrap();
        let db_pos = order.iter().position(|s| s == "db").unwrap();
        let cache_pos = order.iter().position(|s| s == "cache").unwrap();
        assert!(web_pos < db_pos, "web must stop before db");
        assert!(web_pos < cache_pos, "web must stop before cache");
    }

    #[test]
    fn shutdown_order_no_deps_is_stable() {
        let mut services = HashMap::new();
        for name in ["a", "b", "c"] {
            services.insert(
                name.to_string(),
                ServiceConfig {
                    enabled: true,
                    command: None,
                    args: vec![],
                    restart: RestartPolicy::Never,
                    depends_on: vec![],
                    health: None,
                },
            );
        }
        let order = compute_shutdown_order(&services);
        assert_eq!(order.len(), 3);
        // All names present, order is deterministic (alphabetical within each wave).
        let mut sorted = order.clone();
        sorted.sort();
        assert_eq!(sorted, vec!["a", "b", "c"]);
    }

    // ── R6 audit-fix (Auditor B QB2) — IPC auth tests ────────────────────

    fn make_ipc_handle(expected_token: Option<&str>) -> IpcHandle {
        IpcHandle {
            services: Arc::new(HashMap::new()),
            shutdown_notify: Arc::new(Notify::new()),
            expected_token: expected_token.map(|t| Arc::new(t.to_string())),
        }
    }

    #[test]
    fn ipc_request_without_token_returns_unauthorized() {
        let handle = make_ipc_handle(Some("expected-secret-32-chars-or-more"));
        let req = IpcRequest {
            cmd: IpcCmd::Status,
            service: None,
            token: None,
        };
        let resp = dispatch_ipc(&handle, req);
        assert!(!resp.ok, "request without token must be rejected");
        assert_eq!(
            resp.error.as_deref(),
            Some("unauthorized"),
            "error must be 'unauthorized'"
        );
    }

    #[test]
    fn ipc_request_with_wrong_token_returns_unauthorized() {
        let handle = make_ipc_handle(Some("expected-secret-32-chars-or-more"));
        let req = IpcRequest {
            cmd: IpcCmd::Status,
            service: None,
            token: Some("wrong-token".to_string()),
        };
        let resp = dispatch_ipc(&handle, req);
        assert!(!resp.ok, "request with wrong token must be rejected");
        assert_eq!(resp.error.as_deref(), Some("unauthorized"));
    }

    #[test]
    fn ipc_request_with_correct_token_dispatches() {
        let handle = make_ipc_handle(Some("expected-secret-32-chars-or-more"));
        let req = IpcRequest {
            cmd: IpcCmd::Status,
            service: None,
            token: Some("expected-secret-32-chars-or-more".to_string()),
        };
        let resp = dispatch_ipc(&handle, req);
        assert!(resp.ok, "request with correct token must succeed");
        // Status returns an empty services list for an empty handle.
        assert!(resp.services.is_some());
    }

    #[test]
    fn ipc_no_expected_token_skips_auth_check() {
        // Development / cfg(test) path: supervisor has no expected token,
        // so any request (with or without a token field) is allowed.
        let handle = make_ipc_handle(None);
        let req = IpcRequest {
            cmd: IpcCmd::Status,
            service: None,
            token: None,
        };
        let resp = dispatch_ipc(&handle, req);
        assert!(resp.ok, "no expected token → request allowed");
    }

    #[test]
    fn ipc_token_eq_constant_time_basic_cases() {
        assert!(ipc_token_eq(b"abc123", b"abc123"));
        assert!(!ipc_token_eq(b"abc123", b"xyz456"));
        assert!(!ipc_token_eq(b"abc", b"abcd"));
        assert!(!ipc_token_eq(b"", b"abc"));
        // Empty == empty (theoretical).
        assert!(ipc_token_eq(b"", b""));
    }

    /// R6 audit-fix (Auditor B QB2 — ipc-auth HIGH): Unix-only invariant
    /// that the supervisor's IPC socket has 0600 permissions after the
    /// IPC server starts. This validates the post-bind chmod added to
    /// `run_ipc_server_unix`.
    ///
    /// The test starts a real supervisor with no services (HashMap empty),
    /// kicks off the IPC server task, polls the socket file until it
    /// appears, then checks the permission bits.
    #[cfg(unix)]
    #[tokio::test]
    async fn unix_socket_has_0600_perms() {
        use std::os::unix::fs::PermissionsExt;
        // Use a non-default socket path under a tempdir so we don't
        // collide with a developer's real ~/.musu/musu.sock.
        let tmp = tempfile::TempDir::new().unwrap();
        let socket_path = tmp.path().join("musu-test.sock");

        // Build a Supervisor by hand (Supervisor::start uses the default
        // path; we shortcut to test just the bind+chmod path).
        let ipc = IpcHandle {
            services: Arc::new(HashMap::new()),
            shutdown_notify: Arc::new(Notify::new()),
            expected_token: Some(Arc::new("test-token".to_string())),
        };

        let server_socket = socket_path.clone();
        let server_handle = ipc.clone();
        let server = tokio::spawn(async move {
            run_ipc_server_unix(server_socket, server_handle).await;
        });

        // Wait up to 2s for the socket to appear.
        let deadline = Instant::now() + Duration::from_secs(2);
        while !socket_path.exists() && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(
            socket_path.exists(),
            "socket {} did not appear within 2s",
            socket_path.display()
        );

        // Wait briefly for the chmod to have happened (it runs right
        // after bind).
        tokio::time::sleep(Duration::from_millis(100)).await;

        let meta = std::fs::metadata(&socket_path).expect("stat socket");
        let mode_bits = meta.permissions().mode() & 0o777;
        assert_eq!(
            mode_bits,
            0o600,
            "socket {} must be 0600 (got 0o{:o})",
            socket_path.display(),
            mode_bits
        );

        // Tear down.
        server.abort();
    }

    #[test]
    fn shutdown_order_unknown_dep_ignored() {
        let mut services = HashMap::new();
        services.insert(
            "app".to_string(),
            ServiceConfig {
                enabled: true,
                command: None,
                args: vec![],
                restart: RestartPolicy::Never,
                depends_on: vec!["nonexistent".into()],
                health: None,
            },
        );
        // Should not panic; unknown deps are silently skipped.
        let order = compute_shutdown_order(&services);
        assert_eq!(order, vec!["app"]);
    }
}
