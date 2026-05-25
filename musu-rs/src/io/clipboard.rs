//! Universal Clipboard
//! 
//! Monitors local OS clipboard changes and broadcasts them to the fleet
//! via SSE, and applies incoming clipboard events to the local system.
//! 
//! Uses `arboard` for cross-platform clipboard access.

use arboard::Clipboard;
use axum::extract::{State, Json};
use axum::response::IntoResponse;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use crate::bridge::AppState;

static LAST_CLIPBOARD_TEXT: Mutex<String> = Mutex::new(String::new());

pub struct ClipboardSync {
    clipboard: Arc<Mutex<Clipboard>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClipboardPayload {
    pub text: String,
}

impl ClipboardSync {
    pub fn new() -> Result<Self, String> {
        let clipboard = Clipboard::new().map_err(|e| format!("Failed to init clipboard: {}", e))?;
        Ok(Self {
            clipboard: Arc::new(Mutex::new(clipboard)),
        })
    }

    pub fn read_local_text(&self) -> Result<String, String> {
        let mut cb = self.clipboard.lock().map_err(|_| "Mutex poisoned")?;
        cb.get_text().map_err(|e| e.to_string())
    }

    pub fn write_local_text(&self, text: &str) -> Result<(), String> {
        let mut cb = self.clipboard.lock().map_err(|_| "Mutex poisoned")?;
        cb.set_text(text.to_string()).map_err(|e| e.to_string())
    }
}

/// Start a background loop to monitor the OS clipboard and broadcast changes via SSE.
pub fn start_clipboard_monitor(state: AppState) {
    tokio::task::spawn_blocking(move || {
        let sync = match ClipboardSync::new() {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("Clipboard sync disabled: {}", e);
                return;
            }
        };

        loop {
            std::thread::sleep(Duration::from_secs(2));

            if let Ok(current) = sync.read_local_text() {
                let mut last = LAST_CLIPBOARD_TEXT.lock().unwrap();
                if current != *last && !current.is_empty() {
                    *last = current.clone();
                    drop(last); // release lock before broadcasting
                    
                    // Broadcast over existing SSE channel
                    state.sse_broadcaster.publish(crate::writer::sse::TaskEvent {
                        r#type: "clipboard_update".to_string(),
                        task_id: "clipboard".to_string(),
                        status: current.clone(),
                    });
                }
            }
        }
    });
}

/// Endpoint for external peers/UI to update this node's OS clipboard.
pub async fn write_clipboard(
    State(_state): State<AppState>,
    Json(payload): Json<ClipboardPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let sync = ClipboardSync::new().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    
    // Update global state FIRST to prevent ping-pong loop
    if let Ok(mut last) = LAST_CLIPBOARD_TEXT.lock() {
        *last = payload.text.clone();
    }

    sync.write_local_text(&payload.text)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(StatusCode::OK)
}
