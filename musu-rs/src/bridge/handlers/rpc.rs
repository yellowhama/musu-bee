//! POST /api/v1/rpc/exec
//! Remote Command Execution endpoint for Multi-device Binding.

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr};
use std::time::Duration;
use tokio::time::timeout;

use crate::bridge::AppState;

const RPC_EXEC_ALLOWLIST_ENV: &str = "MUSU_RPC_EXEC_ALLOWLIST";
const RPC_EXEC_TIMEOUT_ENV: &str = "MUSU_RPC_EXEC_TIMEOUT_SECS";
const RPC_EXEC_DEFAULT_TIMEOUT_SECS: u64 = 10;
const RPC_EXEC_MAX_TIMEOUT_SECS: u64 = 60;
const RPC_EXEC_MAX_COMMAND_LEN: usize = 128;
const RPC_EXEC_MAX_ARG_COUNT: usize = 32;
const RPC_EXEC_MAX_ARG_LEN: usize = 512;
const RPC_EXEC_MAX_OUTPUT_BYTES: usize = 64 * 1024;

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

fn normalize_command_name(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn command_has_path_separator(value: &str) -> bool {
    value.contains('/') || value.contains('\\') || value.contains(':')
}

fn parse_command_allowlist(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or("")
        .split(|ch: char| ch == ',' || ch == ';' || ch.is_whitespace())
        .map(normalize_command_name)
        .filter(|entry| !entry.is_empty())
        .collect()
}

fn command_allowed(command: &str, allowlist: &[String]) -> bool {
    let normalized = normalize_command_name(command);
    let without_exe = normalized.strip_suffix(".exe").unwrap_or(&normalized);
    allowlist.iter().any(|entry| {
        entry == &normalized || entry.strip_suffix(".exe").unwrap_or(entry) == without_exe
    })
}

fn contains_control(value: &str) -> bool {
    value.chars().any(char::is_control)
}

fn rpc_exec_timeout() -> Duration {
    let secs = std::env::var(RPC_EXEC_TIMEOUT_ENV)
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(RPC_EXEC_DEFAULT_TIMEOUT_SECS)
        .clamp(1, RPC_EXEC_MAX_TIMEOUT_SECS);
    Duration::from_secs(secs)
}

fn validate_request(
    req: &RpcExecRequest,
    allowlist: &[String],
) -> Result<(), (StatusCode, String)> {
    let command = req.cmd.trim();
    if command.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "cmd is required".to_string()));
    }
    if command.len() > RPC_EXEC_MAX_COMMAND_LEN || contains_control(command) {
        return Err((
            StatusCode::BAD_REQUEST,
            "cmd is too long or contains control characters".to_string(),
        ));
    }
    if command_has_path_separator(command) {
        return Err((
            StatusCode::BAD_REQUEST,
            "cmd must be a bare allowlisted command name".to_string(),
        ));
    }
    if allowlist.is_empty() || !command_allowed(command, allowlist) {
        return Err((
            StatusCode::FORBIDDEN,
            format!("{RPC_EXEC_ALLOWLIST_ENV} does not allow command '{command}'"),
        ));
    }
    if req.args.len() > RPC_EXEC_MAX_ARG_COUNT {
        return Err((StatusCode::BAD_REQUEST, "too many args".to_string()));
    }
    for arg in &req.args {
        if arg.len() > RPC_EXEC_MAX_ARG_LEN || contains_control(arg) {
            return Err((
                StatusCode::BAD_REQUEST,
                "arg is too long or contains control characters".to_string(),
            ));
        }
    }
    if req.cwd.is_some() {
        return Err((
            StatusCode::BAD_REQUEST,
            "cwd is not supported for rpc exec".to_string(),
        ));
    }
    Ok(())
}

fn bounded_output(bytes: &[u8]) -> String {
    if bytes.len() <= RPC_EXEC_MAX_OUTPUT_BYTES {
        return String::from_utf8_lossy(bytes).to_string();
    }
    let prefix = String::from_utf8_lossy(&bytes[..RPC_EXEC_MAX_OUTPUT_BYTES]);
    format!(
        "{prefix}\n[truncated {} bytes]",
        bytes.len() - RPC_EXEC_MAX_OUTPUT_BYTES
    )
}

fn audit_value(value: &str) -> String {
    let mut rendered = String::new();
    let mut truncated = false;
    for (idx, ch) in value.trim().chars().enumerate() {
        if idx >= 80 {
            truncated = true;
            break;
        }
        rendered.push(if ch.is_control() { '?' } else { ch });
    }
    if truncated {
        rendered.push_str("...");
    }
    rendered
}

async fn audit_rpc_exec(state: &AppState, status_code: u16, note: String) {
    state
        .audit
        .write(crate::bridge::audit::AuditEntry {
            actor_ip: IpAddr::V4(Ipv4Addr::UNSPECIFIED),
            method: "POST".to_string(),
            path: "/api/v1/rpc/exec".to_string(),
            status_code,
            agent_id: None,
            note: Some(note),
            company_id: None,
            cross_machine: true,
        })
        .await;
}

pub async fn exec_command(
    State(state): State<AppState>,
    Json(req): Json<RpcExecRequest>,
) -> Result<Json<RpcExecResponse>, (StatusCode, String)> {
    use std::process::Stdio;
    use tokio::process::Command;

    let allowlist = parse_command_allowlist(std::env::var(RPC_EXEC_ALLOWLIST_ENV).ok().as_deref());
    if let Err((status, message)) = validate_request(&req, &allowlist) {
        let command_for_audit = audit_value(&req.cmd);
        audit_rpc_exec(
            &state,
            status.as_u16(),
            format!(
                "rpc exec rejected: cmd={} arg_count={} reason={}",
                command_for_audit,
                req.args.len(),
                message
            ),
        )
        .await;
        return Err((status, message));
    }

    let mut command = Command::new(&req.cmd);
    command.args(&req.args);

    command
        .kill_on_drop(true)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let timeout_dur = rpc_exec_timeout();
    let command_for_audit = audit_value(&req.cmd);
    let output = match timeout(timeout_dur, command.output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            audit_rpc_exec(
                &state,
                StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
                format!(
                    "rpc exec spawn failed: cmd={} error={}",
                    command_for_audit, e
                ),
            )
            .await;
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to spawn command: {}", e),
            ));
        }
        Err(_) => {
            audit_rpc_exec(
                &state,
                StatusCode::GATEWAY_TIMEOUT.as_u16(),
                format!(
                    "rpc exec timed out: cmd={} timeout_secs={}",
                    command_for_audit,
                    timeout_dur.as_secs()
                ),
            )
            .await;
            return Err((
                StatusCode::GATEWAY_TIMEOUT,
                format!("command timed out after {}s", timeout_dur.as_secs()),
            ));
        }
    };

    audit_rpc_exec(
        &state,
        if output.status.success() { 200 } else { 500 },
        format!(
            "rpc exec completed: cmd={} arg_count={} exit_code={:?}",
            command_for_audit,
            req.args.len(),
            output.status.code()
        ),
    )
    .await;

    Ok(Json(RpcExecResponse {
        stdout: bounded_output(&output.stdout),
        stderr: bounded_output(&output.stderr),
        exit_code: output.status.code(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rpc_exec_allowlist_is_empty_by_default() {
        assert!(parse_command_allowlist(None).is_empty());
        assert!(parse_command_allowlist(Some("  \t ; , ")).is_empty());
    }

    #[test]
    fn rpc_exec_allowlist_normalizes_exe_suffix() {
        let allowlist = parse_command_allowlist(Some("echo, hostname; whoami.exe"));
        assert!(command_allowed("echo", &allowlist));
        assert!(command_allowed("hostname.exe", &allowlist));
        assert!(command_allowed("whoami", &allowlist));
        assert!(!command_allowed("powershell", &allowlist));
    }

    #[test]
    fn rpc_exec_rejects_paths_even_when_basename_is_allowed() {
        let allowlist = parse_command_allowlist(Some("whoami"));
        let req = RpcExecRequest {
            cmd: r"C:\temp\whoami.exe".to_string(),
            args: Vec::new(),
            cwd: None,
        };
        let err = validate_request(&req, &allowlist).expect_err("path command must fail");
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn rpc_exec_rejects_control_characters_in_args() {
        let allowlist = parse_command_allowlist(Some("echo"));
        let req = RpcExecRequest {
            cmd: "echo".to_string(),
            args: vec!["hello\nworld".to_string()],
            cwd: None,
        };
        let err = validate_request(&req, &allowlist).expect_err("control arg must fail");
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn rpc_exec_rejects_cwd_to_avoid_path_resolution_ambiguity() {
        let allowlist = parse_command_allowlist(Some("echo"));
        let req = RpcExecRequest {
            cmd: "echo".to_string(),
            args: Vec::new(),
            cwd: Some("C:\\temp".to_string()),
        };
        let err = validate_request(&req, &allowlist).expect_err("cwd must fail");
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn rpc_exec_audit_value_removes_control_characters_and_truncates() {
        let value = format!("abc\n{}", "x".repeat(100));
        let rendered = audit_value(&value);
        assert!(rendered.starts_with("abc?"));
        assert!(rendered.ends_with("..."));
        assert!(!rendered.contains('\n'));
    }
}
