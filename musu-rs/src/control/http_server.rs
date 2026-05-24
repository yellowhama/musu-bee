//! MCP HTTP+SSE server — wiki/513 V26-W13.
//!
//! Exposes the same 14 tools as `musu control` (stdio MCP) over HTTP+SSE.
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
        "tools/call" => handle_tools_call(&bridge, &req).await,
        "notifications/initialized" => {
            // JSON-RPC 2.0: notifications have no id and get no response.
            if req.id.is_none() {
                return (StatusCode::NO_CONTENT, Json(JsonRpcResponse {
                    jsonrpc: "2.0".into(),
                    result: None,
                    error: None,
                    id: None,
                }));
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
    let stream = tokio_stream::wrappers::IntervalStream::new(
        tokio::time::interval(std::time::Duration::from_secs(30)),
    )
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

    let result = dispatch_tool(bridge, tool_name, &arguments).await;

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
    bridge: &BridgeClient,
    name: &str,
    args: &serde_json::Value,
) -> Result<String, String> {
    use crate::control::tools::params::*;
    match name {
        "list_companies" => bridge.list_companies().await.map_err(|e| format!("{e}")),
        "get_company" => {
            let p: GetCompanyParams = serde_json::from_value(args.clone())
                .map_err(|e| format!("invalid params: {e}"))?;
            bridge.get_company(&p.id).await.map_err(|e| format!("{e}"))
        }
        "create_company" => bridge.create_company(args).await.map_err(|e| format!("{e}")),
        "activate_company" => {
            let p: GetCompanyParams = serde_json::from_value(args.clone())
                .map_err(|e| format!("invalid params: {e}"))?;
            bridge.activate_company(&p.id).await.map_err(|e| format!("{e}"))
        }
        "run_company" => {
            let p: RunCompanyParams = serde_json::from_value(args.clone())
                .map_err(|e| format!("invalid params: {e}"))?;
            bridge.run_company(&p.id, &p.body).await.map_err(|e| format!("{e}"))
        }
        "delegate_task" => bridge.delegate_task(args).await.map_err(|e| format!("{e}")),
        "cancel_task" => {
            let p: CancelTaskParams = serde_json::from_value(args.clone())
                .map_err(|e| format!("invalid params: {e}"))?;
            bridge.cancel_task(&p.task_id).await.map_err(|e| format!("{e}"))
        }
        "list_nodes" => bridge.list_nodes().await.map_err(|e| format!("{e}")),
        "search_company" => {
            let p: SearchCompanyParams = serde_json::from_value(args.clone())
                .map_err(|e| format!("invalid params: {e}"))?;
            bridge.search_company(&p.workspace, &p.q, p.scope.as_deref(), p.limit).await.map_err(|e| format!("{e}"))
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
        McpToolInfo { name: "delegate_task".into(), description: "Delegate a task to an agent via the local musu bridge writer.".into(), input_schema: serde_json::json!({"type":"object","properties":{"channel":{"type":"string"},"sender_id":{"type":"string"},"text":{"type":"string"}}}) },
        McpToolInfo { name: "cancel_task".into(), description: "Cancel a running task on the local musu bridge writer.".into(), input_schema: serde_json::json!({"type":"object","properties":{"task_id":{"type":"string"}},"required":["task_id"]}) },
        McpToolInfo { name: "list_nodes".into(), description: "List musu nodes (self + peers) known to the local bridge.".into(), input_schema: empty.clone() },
        McpToolInfo { name: "search_company".into(), description: "Full-text search a company's workspace index.".into(), input_schema: serde_json::json!({"type":"object","properties":{"workspace":{"type":"string"},"q":{"type":"string"},"scope":{"type":"string"},"limit":{"type":"integer"}},"required":["workspace","q"]}) },
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
