//! MCP HTTP+SSE server — wiki/513 V26-W13.
//!
//! Exposes the 17 stdio `musu control` tools PLUS 3 HTTP-only mesh tools
//! (run_remote_command / read_remote_file / write_remote_file) = 20 total.
//! (V28 added get_task_result + get_fleet_status — keep the SHARED tools in
//! lock-step with `mod.rs`: both `dispatch()` and `tool_definitions()` mirror
//! the stdio set, plus the 3 mesh tools that are HTTP-only today.)
//! Mount point: `/mcp/v1/*` on the single musu port (8070 default).
//!
//! Architecture:
//!   - Reuses `BridgeClient` (same proxy as stdio MCP) for tool dispatch
//!   - JSON-RPC 2.0 request/response over HTTP POST
//!   - SSE endpoint for streaming notifications
//!   - Bearer auth shared with bridge (`bridge/auth.rs`)
//!   - Loopback-only default; `--mcp-bind-external` opt-in for remote
//!
//! Per §0 master plan: single-port multiplex via axum route mounting.
//! W13 does NOT introduce a new listener — it merges into the bridge router.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;

use crate::bridge::AppState;
use crate::control::bridge_client::BridgeClient;

// ── JSON-RPC 2.0 types ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default)]
    pub params: Option<serde_json::Value>,
    #[serde(default)]
    pub id: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

// ── MCP protocol types ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct McpServerInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
pub struct McpInitializeResult {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: String,
    #[serde(rename = "serverInfo")]
    pub server_info: McpServerInfo,
    pub capabilities: serde_json::Value,
}

// ── Router ────────────────────────────────────────────────────────────

/// Build the MCP HTTP router. Merged into the bridge native_router.
pub fn mcp_router() -> Router<AppState> {
    Router::new()
        .route("/mcp/v1/messages", post(handle_mcp_message))
        .route("/mcp/v1/sse", get(handle_sse))
        .route("/mcp/v1/health", get(handle_health))
}

// ── Handlers ──────────────────────────────────────────────────────────

async fn handle_mcp_message(
    State(state): State<AppState>,
    Json(req): Json<JsonRpcRequest>,
) -> impl IntoResponse {
    if req.jsonrpc != "2.0" {
        return (
            StatusCode::OK,
            Json(JsonRpcResponse {
                jsonrpc: "2.0".into(),
                result: None,
                error: Some(JsonRpcError {
                    code: -32600,
                    message: "Invalid Request: jsonrpc must be \"2.0\"".into(),
                    data: None,
                }),
                id: req.id.clone(),
            }),
        );
    }

    let bridge = match build_bridge_client(&state) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::OK,
                Json(JsonRpcResponse {
                    jsonrpc: "2.0".into(),
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32603,
                        message: format!("Internal error: {e}"),
                        data: None,
                    }),
                    id: req.id.clone(),
                }),
            );
        }
    };

    let result = match req.method.as_str() {
        "initialize" => handle_initialize(),
        "tools/list" => handle_tools_list(),
        "tools/call" => handle_tools_call(&state, &bridge, &req).await,
        "notifications/initialized" => {
            // JSON-RPC 2.0: notifications have no id and get no response.
            if req.id.is_none() {
                return (
                    StatusCode::NO_CONTENT,
                    Json(JsonRpcResponse {
                        jsonrpc: "2.0".into(),
                        result: None,
                        error: None,
                        id: None,
                    }),
                );
            }
            Ok(serde_json::json!({}))
        }
        _ => Err(JsonRpcError {
            code: -32601,
            message: format!("Method not found: {}", req.method),
            data: None,
        }),
    };

    match result {
        Ok(value) => (
            StatusCode::OK,
            Json(JsonRpcResponse {
                jsonrpc: "2.0".into(),
                result: Some(value),
                error: None,
                id: req.id.clone(),
            }),
        ),
        Err(error) => (
            StatusCode::OK,
            Json(JsonRpcResponse {
                jsonrpc: "2.0".into(),
                result: None,
                error: Some(error),
                id: req.id.clone(),
            }),
        ),
    }
}

async fn handle_sse(
    State(_state): State<AppState>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let stream = tokio_stream::wrappers::IntervalStream::new(tokio::time::interval(
        std::time::Duration::from_secs(30),
    ))
    .map(|_| {
        Ok(Event::default()
            .event("heartbeat")
            .data(serde_json::json!({"status": "ok"}).to_string()))
    });

    Sse::new(stream)
}

async fn handle_health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "transport": "http+sse",
        "tools_count": tool_definitions().len(),
    }))
}

// ── MCP method handlers ──────────────────────────────────────────────

fn handle_initialize() -> Result<serde_json::Value, JsonRpcError> {
    let result = McpInitializeResult {
        protocol_version: "2024-11-05".into(),
        server_info: McpServerInfo {
            name: "musu-control".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        },
        capabilities: serde_json::json!({"tools": {}}),
    };
    serde_json::to_value(&result).map_err(|e| JsonRpcError {
        code: -32603,
        message: format!("serialize error: {e}"),
        data: None,
    })
}

fn handle_tools_list() -> Result<serde_json::Value, JsonRpcError> {
    Ok(serde_json::json!({ "tools": tool_definitions() }))
}

async fn handle_tools_call(
    state: &AppState,
    bridge: &BridgeClient,
    req: &JsonRpcRequest,
) -> Result<serde_json::Value, JsonRpcError> {
    let params = req.params.as_ref().ok_or_else(|| JsonRpcError {
        code: -32602,
        message: "params required for tools/call".into(),
        data: None,
    })?;

    let tool_name = params
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| JsonRpcError {
            code: -32602,
            message: "params.name required".into(),
            data: None,
        })?;

    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    let result = dispatch_tool(state, bridge, tool_name, &arguments).await;

    match result {
        Ok(text) => Ok(serde_json::json!({
            "content": [{"type": "text", "text": text}],
            "isError": false,
        })),
        Err(err_msg) => Ok(serde_json::json!({
            "content": [{"type": "text", "text": err_msg}],
            "isError": true,
        })),
    }
}

// ── Tool dispatch ────────────────────────────────────────────────────

async fn dispatch_tool(
    state: &AppState,
    bridge: &BridgeClient,
    name: &str,
    args: &serde_json::Value,
) -> Result<String, String> {
    use crate::control::tools::params::*;
    match name {
        "list_companies" => bridge.list_companies().await.map_err(|e| format!("{e}")),
        "get_company" => {
            let p: GetCompanyParams =
                serde_json::from_value(args.clone()).map_err(|e| format!("invalid params: {e}"))?;
            bridge.get_company(&p.id).await.map_err(|e| format!("{e}"))
        }
        "create_company" => bridge
            .create_company(args)
            .await
            .map_err(|e| format!("{e}")),
        "activate_company" => {
            let p: GetCompanyParams =
                serde_json::from_value(args.clone()).map_err(|e| format!("invalid params: {e}"))?;
            bridge
                .activate_company(&p.id)
                .await
                .map_err(|e| format!("{e}"))
        }
        "run_company" => {
            let p: RunCompanyParams =
                serde_json::from_value(args.clone()).map_err(|e| format!("invalid params: {e}"))?;
            bridge
                .run_company(&p.id, &p.body)
                .await
                .map_err(|e| format!("{e}"))
        }
        "delegate_task" => bridge.delegate_task(args).await.map_err(|e| format!("{e}")),
        "get_task_result" => {
            let task_id = args
                .get("task_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "task_id required".to_string())?;
            bridge
                .get_task_result(task_id)
                .await
                .map_err(|e| format!("{e}"))
        }
        "cancel_task" => {
            let p: CancelTaskParams =
                serde_json::from_value(args.clone()).map_err(|e| format!("invalid params: {e}"))?;
            bridge
                .cancel_task(&p.task_id)
                .await
                .map_err(|e| format!("{e}"))
        }
        "list_nodes" => bridge.list_nodes().await.map_err(|e| format!("{e}")),
        "get_fleet_status" => bridge.get_fleet_status().await.map_err(|e| format!("{e}")),
        "get_setup_status" => bridge.get_setup_status().await.map_err(|e| format!("{e}")),
        "set_default_adapter" => {
            let adapter = args
                .get("adapter")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "adapter required".to_string())?;
            bridge
                .set_default_adapter(adapter)
                .await
                .map_err(|e| format!("{e}"))
        }
        "search_company" => {
            let p: SearchCompanyParams =
                serde_json::from_value(args.clone()).map_err(|e| format!("invalid params: {e}"))?;
            bridge
                .search_company(&p.workspace, &p.q, p.scope.as_deref(), p.limit)
                .await
                .map_err(|e| format!("{e}"))
        }
        "run_remote_command" => {
            let node_id = args
                .get("node_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "node_id required".to_string())?;
            let cmd = args
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "command required".to_string())?;
            let mut req_args = Vec::new();
            if let Some(arr) = args.get("args").and_then(|v| v.as_array()) {
                for a in arr {
                    if let Some(s) = a.as_str() {
                        req_args.push(s.to_string());
                    }
                }
            }
            let cwd = args
                .get("cwd")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Resolve node_id locally
            let musu_home = state
                .config
                .nodes_toml_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."));

            let peers = crate::peer::discovery::resolve_all_peers(musu_home);
            let peer = peers
                .into_iter()
                .find(|p| p.name.as_deref() == Some(node_id) || p.addr == node_id)
                .ok_or_else(|| format!("Node {} not found", node_id))?;

            // HTTP POST to remote RPC exec
            let target_url = format!("http://{}/api/v1/rpc/exec", peer.addr);
            let payload = serde_json::json!({
                "cmd": cmd,
                "args": req_args,
                "cwd": cwd,
            });

            let resp = state
                .http_client
                .post(&target_url)
                .bearer_auth(&state.config.token)
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Remote RPC failed: {}", e))?;

            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        "read_remote_file" => {
            let node_id = args
                .get("node_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "node_id required".to_string())?;
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "path required".to_string())?;

            let musu_home = state
                .config
                .nodes_toml_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."));
            let peers = crate::peer::discovery::resolve_all_peers(musu_home);
            let peer = peers
                .into_iter()
                .find(|p| p.name.as_deref() == Some(node_id) || p.addr == node_id)
                .ok_or_else(|| format!("Node {} not found", node_id))?;

            // Percent-encode the caller-supplied path via reqwest's query builder
            // instead of format!-interpolating it into the URL, so a path with
            // '&', '#', or other URL metacharacters cannot inject extra query
            // params / a fragment into the request to the peer node.
            let target_url = format!("http://{}/api/files/read", peer.addr);
            let resp = state
                .http_client
                .get(&target_url)
                .query(&[("path", path)])
                .bearer_auth(&state.config.token)
                .send()
                .await
                .map_err(|e| format!("Failed to read remote file: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if status.is_success() {
                Ok(text)
            } else {
                Err(format!("Error {}: {}", status, text))
            }
        }
        "write_remote_file" => {
            let node_id = args
                .get("node_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "node_id required".to_string())?;
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "path required".to_string())?;
            let content = args
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "content required".to_string())?;

            let musu_home = state
                .config
                .nodes_toml_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."));
            let peers = crate::peer::discovery::resolve_all_peers(musu_home);
            let peer = peers
                .into_iter()
                .find(|p| p.name.as_deref() == Some(node_id) || p.addr == node_id)
                .ok_or_else(|| format!("Node {} not found", node_id))?;

            let target_url = format!("http://{}/api/files/write", peer.addr);
            let payload = serde_json::json!({
                "path": path,
                "content": content
            });
            let resp = state
                .http_client
                .post(&target_url)
                .bearer_auth(&state.config.token)
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Failed to write remote file: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if status.is_success() {
                Ok("File written successfully".to_string())
            } else {
                Err(format!("Error {}: {}", status, text))
            }
        }
        "kvm_control" => {
            let p: KvmControlParams =
                serde_json::from_value(args.clone()).map_err(|e| format!("invalid params: {e}"))?;
            let msg = crate::io::kvm::KvmMessage {
                r#type: p.action_type,
                rx: p.rx,
                ry: p.ry,
                button: p.button,
                key: p.key,
            };
            crate::io::kvm::execute_kvm_command(&msg);
            Ok(serde_json::json!({"status": "success"}).to_string())
        }
        "list_agents" | "get_agent" | "get_dashboard" | "list_runs" | "get_activity" => {
            Ok(T2_BODY.to_string())
        }
        _ => Err(format!("unknown tool: {name}")),
    }
}

// ── Tool definitions ─────────────────────────────────────────────────

fn tool_definitions() -> Vec<McpToolInfo> {
    let empty = serde_json::json!({"type": "object", "properties": {}});
    vec![
        McpToolInfo { name: "list_companies".into(), description: "List all companies registered with the local musu bridge.".into(), input_schema: empty.clone() },
        McpToolInfo { name: "get_company".into(), description: "Fetch a single company by id from the local musu bridge.".into(), input_schema: serde_json::json!({"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}) },
        McpToolInfo { name: "create_company".into(), description: "Create a new company on the local musu bridge.".into(), input_schema: serde_json::json!({"type":"object","properties":{"name":{"type":"string"},"purpose":{"type":"string"},"work_dir":{"type":"string"}}}) },
        McpToolInfo { name: "activate_company".into(), description: "Activate (set status=active) a company on the local musu bridge.".into(), input_schema: serde_json::json!({"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}) },
        McpToolInfo { name: "run_company".into(), description: "Start a run for a company on the local musu bridge.".into(), input_schema: serde_json::json!({"type":"object","properties":{"id":{"type":"string"},"body":{"type":"object"}},"required":["id"]}) },
        McpToolInfo { name: "delegate_task".into(), description: "Send a task to a machine in your fleet. Set target_node to choose a specific machine, or needs_gpu/prefer_os to auto-route by capability. Returns a task_id; poll it with get_task_result.".into(), input_schema: serde_json::json!({"type":"object","properties":{"channel":{"type":"string"},"sender_id":{"type":"string"},"text":{"type":"string"},"target_node":{"type":"string"},"needs_gpu":{"type":"boolean"},"prefer_os":{"type":"string"},"adapter_type":{"type":"string"}},"required":["channel","sender_id","text"]}) },
        McpToolInfo { name: "get_task_result".into(), description: "Get a task's status and result (output/error) by task_id. Poll this after delegate_task to see when work on a machine finished and read what it produced.".into(), input_schema: serde_json::json!({"type":"object","properties":{"task_id":{"type":"string"}},"required":["task_id"]}) },
        McpToolInfo { name: "cancel_task".into(), description: "Cancel a running task on the local musu bridge writer.".into(), input_schema: serde_json::json!({"type":"object","properties":{"task_id":{"type":"string"}},"required":["task_id"]}) },
        McpToolInfo { name: "list_nodes".into(), description: "List musu nodes (self + peers) known to the local bridge.".into(), input_schema: empty.clone() },
        McpToolInfo { name: "get_fleet_status".into(), description: "Get every machine in your fleet with its capabilities (gpu_present, gpu_vram_gb, cpu_cores, os) and live status (online, active_tasks). Use this to pick which machine to send a task to before calling delegate_task.".into(), input_schema: empty.clone() },
        McpToolInfo { name: "get_setup_status".into(), description: "Diagnose THIS machine's MUSU setup (installed agent CLIs, local Ollama/ComfyUI, current+recommended default adapter, login). Call first when asked to set up the computer.".into(), input_schema: empty.clone() },
        McpToolInfo { name: "set_default_adapter".into(), description: "Set which agent a task uses by default (echo/codex/claude/gemini/openai_compat_local). Persists to bridge.env, applies now.".into(), input_schema: serde_json::json!({"type":"object","properties":{"adapter":{"type":"string"}},"required":["adapter"]}) },
        McpToolInfo { name: "search_company".into(), description: "Full-text search a company's workspace index.".into(), input_schema: serde_json::json!({"type":"object","properties":{"workspace":{"type":"string"},"q":{"type":"string"},"scope":{"type":"string"},"limit":{"type":"integer"}},"required":["workspace","q"]}) },
        McpToolInfo { name: "run_remote_command".into(), description: "Execute a command on a remote machine in the mesh.".into(), input_schema: serde_json::json!({"type":"object","properties":{"node_id":{"type":"string","description":"Target node ID"},"command":{"type":"string"},"args":{"type":"array","items":{"type":"string"}},"cwd":{"type":"string"}},"required":["node_id","command"]}) },
        McpToolInfo { name: "read_remote_file".into(), description: "Read a file from a remote machine in the mesh.".into(), input_schema: serde_json::json!({"type":"object","properties":{"node_id":{"type":"string","description":"Target node ID"},"path":{"type":"string","description":"Absolute file path on the remote machine"}},"required":["node_id","path"]}) },
        McpToolInfo { name: "write_remote_file".into(), description: "Write content to a file on a remote machine in the mesh.".into(), input_schema: serde_json::json!({"type":"object","properties":{"node_id":{"type":"string","description":"Target node ID"},"path":{"type":"string","description":"Absolute file path on the remote machine"},"content":{"type":"string"}},"required":["node_id","path","content"]}) },
        McpToolInfo { name: "kvm_control".into(), description: "Execute physical computer interactions (mouse moves, clicks, keyboard events) via the KVM.".into(), input_schema: serde_json::json!({"type":"object","properties":{"action_type":{"type":"string"},"rx":{"type":"number"},"ry":{"type":"number"},"button":{"type":"string"},"key":{"type":"string"}},"required":["action_type"]}) },
        McpToolInfo { name: "list_agents".into(), description: "list known agents (legacy) (deprecated)".into(), input_schema: empty.clone() },
        McpToolInfo { name: "get_agent".into(), description: "fetch a single agent's record (legacy) (deprecated)".into(), input_schema: serde_json::json!({"type":"object","properties":{"agent_id":{"type":"string"}}}) },
        McpToolInfo { name: "get_dashboard".into(), description: "fetch the dashboard payload (legacy) (deprecated)".into(), input_schema: empty.clone() },
        McpToolInfo { name: "list_runs".into(), description: "list run records (legacy) (deprecated)".into(), input_schema: empty.clone() },
        McpToolInfo { name: "get_activity".into(), description: "fetch agent activity stream (legacy) (deprecated)".into(), input_schema: empty },
    ]
}

fn build_bridge_client(_state: &AppState) -> anyhow::Result<BridgeClient> {
    BridgeClient::try_new()
}
