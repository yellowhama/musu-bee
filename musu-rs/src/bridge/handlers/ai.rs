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
