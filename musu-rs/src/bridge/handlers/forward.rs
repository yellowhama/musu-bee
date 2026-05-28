//! Task forwarding — V27.
//!
//! Handles receiving forwarded tasks from peer nodes and
//! sending tasks to remote peers.
//!
//! V27-F1: result callback — when a forwarded task completes, the
//! executing node POSTs a `TaskCallback` to the originating node's
//! `/api/tasks/callback` endpoint so it can update its local row.

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;
use crate::peer::discovery::ResolvedPeer;

/// A task forwarded from a peer node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardedTask {
    /// Name of the node that originally received the task.
    pub source_node: String,
    /// Original task ID on the source node (for tracking).
    pub source_task_id: String,
    /// Channel for the task.
    pub channel: String,
    /// Sender ID.
    pub sender_id: String,
    /// The prompt/instruction text.
    pub text: String,
    /// Adapter type override.
    #[serde(default)]
    pub adapter_type: Option<String>,
    /// Model override.
    #[serde(default)]
    pub model: Option<String>,
    /// Working directory on the target machine.
    #[serde(default)]
    pub cwd: Option<String>,
    /// Deadline propagation.
    #[serde(default)]
    pub deadline_unix_ms: Option<i64>,
    /// Company ID.
    #[serde(default)]
    pub company_id: Option<String>,
    /// Timeout in seconds.
    #[serde(default)]
    pub timeout_sec: Option<u32>,
    /// V27-F1: URL to POST result back to when task completes.
    #[serde(default)]
    pub callback_url: Option<String>,
}

/// Response after receiving a forwarded task.
#[derive(Debug, Serialize, Deserialize)]
pub struct ForwardResponse {
    pub task_id: String,
    pub status: String,
    pub node: String,
}

/// POST /api/tasks/forward — receive a forwarded task from a peer.
///
/// Handles receiving forwarded tasks, with an optional workspace ZIP context.
pub async fn receive_forwarded(
    State(state): State<AppState>,
    mut multipart: axum::extract::Multipart,
) -> Result<(StatusCode, Json<ForwardResponse>)> {
    let mut task_req: Option<ForwardedTask> = None;
    let mut zip_data: Option<axum::body::Bytes> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| MusuError::BadRequest(e.to_string()))?
    {
        if let Some(name) = field.name() {
            if name == "task" {
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| MusuError::BadRequest(e.to_string()))?;
                task_req = serde_json::from_slice(&bytes).ok();
            } else if name == "workspace" {
                zip_data = field.bytes().await.ok();
            }
        }
    }

    let req = task_req.ok_or_else(|| MusuError::BadRequest("missing task metadata".into()))?;

    // Validate
    if req.text.is_empty() || req.text.len() > 10_000 {
        return Err(MusuError::BadRequest("text must be 1..10000 chars".into()));
    }
    if req.channel.is_empty() {
        return Err(MusuError::BadRequest("channel required".into()));
    }

    let task_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    // Setup working directory and unpack zip if present
    let cwd = if let Some(zip_bytes) = zip_data {
        let dest_dir = std::env::temp_dir().join("musu_workspaces").join(&task_id);
        std::fs::create_dir_all(&dest_dir).map_err(|e| MusuError::Internal(e.to_string()))?;

        let zip_path = dest_dir.join("workspace.zip");
        std::fs::write(&zip_path, zip_bytes).map_err(|e| MusuError::Internal(e.to_string()))?;

        crate::peer::context_sync::unpack_workspace(&zip_path, &dest_dir)
            .map_err(|e| MusuError::Internal(format!("failed to unpack workspace: {}", e)))?;

        std::fs::remove_file(&zip_path).ok();
        dest_dir
    } else {
        req.cwd
            .clone()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| {
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            })
    };

    // Insert pending row
    sqlx::query(
        "INSERT INTO route_executions (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
         VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    )
    .bind(&task_id)
    .bind(&req.company_id)
    .bind(&req.channel)
    .bind(&req.sender_id)
    .bind(format!("fwd:{}", req.source_task_id))
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    crate::writer::runner::TaskUpdate {
        task_id: &task_id,
        company_id: req.company_id.as_deref(),
        channel: Some(&req.channel),
        sender_id: Some(&req.sender_id),
        prompt: Some(&req.text),
        status: "pending",
        created_at: Some(now),
        ..Default::default()
    }
    .save();

    // Spawn task locally
    state
        .task_runner
        .spawn_task(crate::writer::TaskSpec {
            task_id: task_id.clone(),
            company_id: req.company_id.clone(),
            channel: req.channel.clone(),
            sender_id: req.sender_id.clone(),
            prompt: req.text.clone(),
            expected_output: None,
            cwd,
            model: req.model.clone(),
            timeout_sec: req.timeout_sec,
            adapter_type: req.adapter_type.clone().unwrap_or_else(|| "claude".into()),
            callback_url: req.callback_url.clone(),
            source_task_id: Some(req.source_task_id.clone()),
        })
        .await
        .map_err(|e| MusuError::Internal(format!("spawn forwarded task: {e}")))?;

    tracing::info!(
        task_id = %task_id,
        source_node = %req.source_node,
        source_task_id = %req.source_task_id,
        "accepted forwarded task from peer"
    );

    Ok((
        StatusCode::ACCEPTED,
        Json(ForwardResponse {
            task_id,
            status: "queued".into(),
            node: state.config.node_name.clone(),
        }),
    ))
}

/// Forward a task to a remote peer node via HTTP POST.
pub async fn forward_to_peer(
    client: &reqwest::Client,
    peer: &ResolvedPeer,
    task: ForwardedTask,
    token: &str,
) -> std::result::Result<ForwardResponse, String> {
    let url = format!("http://{}/api/tasks/forward", peer.addr);

    tracing::info!(
        url = %url,
        source_task_id = %task.source_task_id,
        "forwarding task to peer"
    );

    let task_json = serde_json::to_string(&task).map_err(|e| format!("serialize task: {e}"))?;
    let part = reqwest::multipart::Part::text(task_json)
        .mime_str("application/json")
        .unwrap();
    let form = reqwest::multipart::Form::new().part("task", part);

    let resp = client
        .post(&url)
        .bearer_auth(token)
        .multipart(form)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("forward HTTP error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("peer returned {status}: {body}"));
    }

    resp.json::<ForwardResponse>()
        .await
        .map_err(|e| format!("forward response parse: {e}"))
}

/// Forward a task with automatic retry on failure.
///
/// Retries up to `max_retries` times with exponential backoff (1s, 2s, 4s).
pub async fn forward_to_peer_with_retry(
    client: &reqwest::Client,
    peer: &ResolvedPeer,
    task: ForwardedTask,
    token: &str,
    max_retries: u32,
) -> std::result::Result<ForwardResponse, String> {
    let mut last_err = String::new();
    for attempt in 0..=max_retries {
        match forward_to_peer(client, peer, task.clone(), token).await {
            Ok(resp) => return Ok(resp),
            Err(e) => {
                last_err = e;
                if attempt < max_retries {
                    let delay = std::time::Duration::from_secs(1 << attempt);
                    tracing::warn!(
                        peer = %peer.addr,
                        attempt = attempt + 1,
                        max = max_retries,
                        delay_sec = delay.as_secs(),
                        err = %last_err,
                        "forward failed, retrying"
                    );
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }
    Err(format!(
        "forward failed after {} attempts: {}",
        max_retries + 1,
        last_err
    ))
}

/// V27-F1: Result callback payload from a remote peer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCallback {
    /// Original task_id on the requesting node.
    pub source_task_id: String,
    /// Task ID on the executing node.
    pub remote_task_id: String,
    /// Final status: done, failed, cancelled.
    pub status: String,
    /// Task output (stdout).
    pub output: Option<String>,
    /// Error message if failed.
    pub error: Option<String>,
    /// Process exit code.
    pub exit_code: Option<i32>,
    /// Execution duration in seconds.
    pub duration_sec: Option<f64>,
    /// Name of the node that executed the task.
    pub node: String,
}

/// POST /api/tasks/callback — receive task result from a peer.
pub async fn receive_callback(
    State(state): State<AppState>,
    Json(cb): Json<TaskCallback>,
) -> Result<StatusCode> {
    tracing::info!(
        source_task_id = %cb.source_task_id,
        remote_task_id = %cb.remote_task_id,
        status = %cb.status,
        node = %cb.node,
        "received task result callback from peer"
    );

    // Update the original route_execution row with remote result.
    sqlx::query(
        "UPDATE route_executions SET status = ?, output = ?, error = ?, \
         exit_code = ?, duration_sec = ?, updated_at = ? WHERE task_id = ?",
    )
    .bind(&cb.status)
    .bind(&cb.output)
    .bind(&cb.error)
    .bind(cb.exit_code)
    .bind(cb.duration_sec)
    .bind(chrono::Utc::now().timestamp())
    .bind(&cb.source_task_id)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    crate::writer::runner::TaskUpdate {
        task_id: &cb.source_task_id,
        status: &cb.status,
        output: cb.output.as_deref(),
        error: cb.error.as_deref(),
        assigned_pc: Some(&cb.node),
        exit_code: cb.exit_code,
        duration_sec: cb.duration_sec,
        ..Default::default()
    }
    .save();

    // Broadcast SSE event so any listeners (including `musu route --wait`)
    // get notified.
    state
        .sse_broadcaster
        .publish(crate::writer::sse::TaskEvent::update(
            &cb.source_task_id,
            &cb.status,
        )
        .with_result(
            cb.output.as_deref(),
            cb.error.as_deref(),
            cb.exit_code,
            cb.duration_sec,
        )
        .with_assigned_pc(Some(&cb.node)));

    Ok(StatusCode::OK)
}
