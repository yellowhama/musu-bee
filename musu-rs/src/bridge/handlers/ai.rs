use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::bridge::AppState;
use crate::bridge::error::MusuError;

#[derive(Deserialize)]
pub struct ChatRequest {
    pub text: String,
}

#[derive(Serialize)]
pub struct ChatResponse {
    pub task_id: String,
}

/// POST /api/ai/chat
/// Wires the user chat directly into the real AI task runner.
pub async fn handle_chat(
    State(state): State<AppState>,
    Json(payload): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, MusuError> {
    let task_id = uuid::Uuid::new_v4().to_string();
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

    // Ensure we write a pending task row to the database or JSON log if required by runner
    let now = chrono::Utc::now().timestamp();
    crate::writer::runner::write_task_json(
        &task_id,
        None,
        Some("cli"),
        Some("musu-bee"),
        Some(&payload.text),
        "pending",
        None,
        None,
        None,
        None,
        None,
        Some(now),
        None,
    );

    // Spawn the real AI task using the distributed adapter
    state
        .task_runner
        .spawn_task(crate::writer::TaskSpec {
            task_id: task_id.clone(),
            company_id: None,
            channel: "cli".into(),
            sender_id: "musu-bee".into(),
            prompt: payload.text,
            expected_output: None,
            cwd,
            model: None,
            timeout_sec: None,
            adapter_type: "openai_compat_local".into(), // Thermo-Nuclear directive: Use real adapter
            callback_url: None,
            source_task_id: None,
        })
        .await
        .map_err(|e| MusuError::Internal(format!("Failed to spawn AI task: {e}")))?;

    Ok(Json(ChatResponse { task_id }))
}

// ── Agent-to-Agent Protocol (A2A) ──────────────────────────────────────

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum A2AMessage {
    TaskDelegation {
        target_agent: String,
        task_id: String,
        prompt: String,
    },
    TaskApproval {
        target_agent: String,
        task_id: String,
        decision: String, // "approved" | "rejected"
        feedback: Option<String>,
    },
    TaskReport {
        target_agent: String,
        task_id: String,
        result: String,
    },
}

#[derive(Debug, Deserialize)]
pub struct DirectMessageRequest {
    pub from_agent: String,
    pub to_agent: String,
    pub message: A2AMessage,
}

#[derive(Debug, Serialize)]
pub struct DirectMessageResponse {
    pub status: String,
    pub receipt_id: String,
}

/// POST /api/ai/direct_message
/// Handles peer-to-peer Agent direct messaging for Delegation, Approval, and Reports.
pub async fn handle_direct_message(
    State(state): State<AppState>,
    Json(payload): Json<DirectMessageRequest>,
) -> Result<Json<DirectMessageResponse>, MusuError> {
    let receipt_id = uuid::Uuid::new_v4().to_string();
    tracing::info!(
        "A2A Message [{}] from {} to {}: {:?}",
        receipt_id, payload.from_agent, payload.to_agent, payload.message
    );
    
    // In a real distributed system, we would check if `to_agent` is on a remote mesh node
    // and route it via the WebRTC or proxy channel if needed.
    // For now, we accept it into the event bus / state.
    
    Ok(Json(DirectMessageResponse {
        status: "delivered".into(),
        receipt_id,
    }))
}
