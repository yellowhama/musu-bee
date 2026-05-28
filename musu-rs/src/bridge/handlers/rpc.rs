//! POST /api/v1/rpc/exec
//! Remote Command Execution endpoint for Multi-device Binding.

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::bridge::AppState;

#[derive(Debug, Deserialize)]
pub struct RpcExecRequest {
    pub cmd: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RpcExecResponse {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

pub async fn exec_command(
    State(_state): State<AppState>,
    Json(req): Json<RpcExecRequest>,
) -> Result<Json<RpcExecResponse>, (StatusCode, String)> {
    use std::process::Stdio;
    use tokio::process::Command;

    let mut command = Command::new(&req.cmd);
    command.args(&req.args);

    if let Some(cwd) = req.cwd {
        command.current_dir(cwd);
    }

    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let output = command.output().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to spawn command: {}", e),
        )
    })?;

    Ok(Json(RpcExecResponse {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    }))
}
