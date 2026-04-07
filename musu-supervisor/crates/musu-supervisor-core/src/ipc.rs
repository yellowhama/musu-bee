use serde::{Deserialize, Serialize};

/// A command sent from the musu CLI to the running supervisor over the Unix socket.
///
/// Encoded as a single line of JSON followed by `\n`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcRequest {
    pub cmd: IpcCmd,
    /// For `stop` (single service) and `logs`, the service name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum IpcCmd {
    Status,
    Stop,
    Logs,
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
        Self { ok: true, error: None, services: None, log_path: None }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self { ok: false, error: Some(msg.into()), services: None, log_path: None }
    }

    pub fn status(services: Vec<ServiceSnapshot>) -> Self {
        Self { ok: true, error: None, services: Some(services), log_path: None }
    }

    pub fn log_path(path: impl Into<String>) -> Self {
        Self { ok: true, error: None, services: None, log_path: Some(path.into()) }
    }
}
