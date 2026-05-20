use serde::{Deserialize, Serialize};

/// A command sent from the musu CLI to the running supervisor over the
/// transport (Unix socket on POSIX, Named Pipe on Windows).
///
/// Encoded as a single line of JSON followed by `\n`.
///
/// **R6 (wiki/496) D2 expansion**: 5 new variants added (Start, Restart,
/// Reload, Freeze, Unfreeze). The auto-update flow (§4) requires Freeze /
/// Unfreeze to pause musud's run_service_loop during the atomic binary
/// swap so musud doesn't try to re-spawn the half-replaced binary (D4).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcRequest {
    pub cmd: IpcCmd,
    /// For `stop` / `start` / `restart` / `logs` (single service) and
    /// `freeze` / `unfreeze` (mandatory), the service name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service: Option<String>,
    /// R6 audit-fix (Auditor B QB2 — ipc-auth HIGH): shared-secret
    /// bearer token. Required for EVERY dispatch when the supervisor
    /// is configured with an expected token (the default in production
    /// installs). Compared via `subtle::ConstantTimeEq` in
    /// `dispatch_ipc`. Optional in the wire format so callers from
    /// `cfg(test)` and the existing musu-bee TypeScript probe can omit
    /// it during transition, but the supervisor will reject any request
    /// whose token doesn't equal its configured value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IpcCmd {
    /// Return live status for every supervised service.
    Status,
    /// Stop one (request.service=Some) or all (request.service=None) services.
    /// "Stop all" notifies the supervisor's main loop via shutdown_notify.
    Stop,
    /// Path to a service's log file. `request.service` is required.
    Logs,
    // ── R6 (wiki/496 D2) — new variants ─────────────────────────────────
    /// Start a service that was previously stopped, or all services if
    /// `request.service` is None. Re-spawns the run_service_loop task.
    Start,
    /// Restart a service: stop → wait for exit → start fresh task.
    Restart,
    /// Re-read configuration without restarting services. Currently a
    /// no-op on Unix (logs only); reserved for V25 hot-config reloads.
    Reload,
    /// Pause supervisor re-spawn for a service. While frozen, if the
    /// service exits the run_service_loop will NOT re-spawn it; the loop
    /// waits on a notifier until Unfreeze fires. Used by `musu auto-update`
    /// to safely swap the binary on disk while musud is alive (D4).
    /// `request.service` is required.
    Freeze,
    /// Resume supervisor re-spawn for a service that was previously frozen.
    /// `request.service` is required.
    Unfreeze,
}

/// Response from the supervisor, encoded as a single line of JSON followed by `\n`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub services: Option<Vec<ServiceSnapshot>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
}

/// A point-in-time snapshot of one supervised service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceSnapshot {
    pub name: String,
    pub pid: Option<u32>,
    pub running: bool,
    pub restart_count: u32,
    pub uptime_secs: u64,
}

impl IpcResponse {
    pub fn ok() -> Self {
        Self {
            ok: true,
            error: None,
            services: None,
            log_path: None,
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(msg.into()),
            services: None,
            log_path: None,
        }
    }

    pub fn status(services: Vec<ServiceSnapshot>) -> Self {
        Self {
            ok: true,
            error: None,
            services: Some(services),
            log_path: None,
        }
    }

    pub fn log_path(path: impl Into<String>) -> Self {
        Self {
            ok: true,
            error: None,
            services: None,
            log_path: Some(path.into()),
        }
    }
}
