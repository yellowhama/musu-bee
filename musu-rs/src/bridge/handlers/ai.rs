use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::bridge::error::MusuError;
use crate::bridge::AppState;

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
    crate::writer::runner::TaskUpdate {
        task_id: &task_id,
        status: "pending",
        channel: Some("cli"),
        sender_id: Some("musu-bee"),
        prompt: Some(&payload.text),
        created_at: Some(now),
        ..Default::default()
    }
    .save();

    // Spawn the real AI task through the runner hot path.
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
            adapter_type: "claude".into(),
            callback_url: None,
            source_task_id: None,
            callback_token: None,
            callback_target_node_id: None,
            callback_session_id: None,
        })
        .await
        .map_err(|e| MusuError::Internal(format!("Failed to spawn AI task: {e}")))?;

    Ok(Json(ChatResponse { task_id }))
}

// ── Agent-to-Agent Protocol (A2A) ──────────────────────────────────────

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum A2AMessage {
    #[serde(rename = "TaskDelegation")]
    Delegation {
        target_agent: String,
        task_id: String,
        prompt: String,
    },
    #[serde(rename = "TaskApproval")]
    Approval {
        target_agent: String,
        task_id: String,
        decision: String, // "approved" | "rejected"
        feedback: Option<String>,
    },
    #[serde(rename = "TaskReport")]
    Report {
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
    State(_state): State<AppState>,
    Json(payload): Json<DirectMessageRequest>,
) -> Result<Json<DirectMessageResponse>, MusuError> {
    let receipt_id = uuid::Uuid::new_v4().to_string();
    tracing::info!(
        "A2A Message [{}] from {} to {}: {:?}",
        receipt_id,
        payload.from_agent,
        payload.to_agent,
        payload.message
    );

    // In a real distributed system, we would check if `to_agent` is on a remote mesh node
    // and route it via the WebRTC or proxy channel if needed.
    // For now, we accept it into the event bus / state.

    // Update musu-brainai SSOT
    let brain_client = crate::brain::client::BrainClient::new();
    let now = chrono::Utc::now().timestamp();

    match &payload.message {
        A2AMessage::Delegation {
            target_agent,
            task_id,
            prompt,
        } => {
            let task = crate::brain::client::TaskState {
                task_id: task_id.clone(),
                company_id: "default".into(), // Or extract from context
                channel: "a2a".into(),
                sender_id: payload.from_agent.clone(),
                parent_task_id: Some("unknown".into()), // Needs tracking in state ideally
                assigned_agent: Some(target_agent.clone()),
                approver_agent: Some(payload.from_agent.clone()),
                prompt: prompt.clone(),
                status: "pending".into(),
                output: None,
                error: None,
                assigned_pc: None,
                created_at: now,
            };
            let _ = brain_client.create_task(&task).await;
        }
        A2AMessage::Approval {
            target_agent: _,
            task_id,
            decision,
            feedback,
        } => {
            let status = if decision == "approved" {
                "completed"
            } else {
                "failed"
            };
            let update = crate::brain::client::TaskStateUpdate {
                status: Some(status.into()),
                output: feedback.clone(),
                error: None,
                assigned_pc: None,
                assigned_agent: None,
                approver_agent: None,
                parent_task_id: None,
                started_at: None,
                updated_at: Some(now),
            };
            let _ = brain_client.update_task(task_id, &update).await;
        }
        A2AMessage::Report {
            target_agent,
            task_id,
            result,
        } => {
            let update = crate::brain::client::TaskStateUpdate {
                status: Some("waiting_for_approval".into()),
                output: Some(result.clone()),
                error: None,
                assigned_pc: None,
                assigned_agent: None,
                approver_agent: Some(target_agent.clone()),
                parent_task_id: None,
                started_at: None,
                updated_at: Some(now),
            };
            let _ = brain_client.update_task(task_id, &update).await;
        }
    }

    Ok(Json(DirectMessageResponse {
        status: "delivered".into(),
        receipt_id,
    }))
}
