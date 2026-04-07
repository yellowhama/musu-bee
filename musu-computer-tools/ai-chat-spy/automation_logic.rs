use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationSuggestion {
    pub id: String,
    pub pattern: String,
    pub frequency: u32,
    pub suggested_action: String,
    pub accepted: bool,
    pub created_at: String,
}

fn ensure_table(state: &AppState) -> Result<(), String> {
    let db = state.db.get().map_err(|_| "db lock")?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS automation_suggestions (
            id TEXT PRIMARY KEY,
            pattern TEXT NOT NULL,
            frequency INTEGER DEFAULT 1,
            suggested_action TEXT NOT NULL,
            accepted INTEGER DEFAULT 0,
            dismissed INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("create automation_suggestions table: {e}"))?;
    Ok(())
}

/// List all automation suggestions (not dismissed).
#[tauri::command]
pub async fn automation_list_suggestions(
    state: State<'_, AppState>,
) -> Result<Vec<AutomationSuggestion>, String> {
    ensure_table(&state)?;

    let db = state.db.get().map_err(|_| "db lock")?;
    let mut stmt = db
        .prepare(
            "SELECT id, pattern, frequency, suggested_action, accepted, created_at
             FROM automation_suggestions WHERE dismissed = 0 ORDER BY frequency DESC",
        )
        .map_err(|e| e.to_string())?;

    let suggestions: Vec<AutomationSuggestion> = stmt
        .query_map([], |row| {
            Ok(AutomationSuggestion {
                id: row.get(0)?,
                pattern: row.get(1)?,
                frequency: row.get(2)?,
                suggested_action: row.get(3)?,
                accepted: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(suggestions)
}

/// Detect patterns from the audit chain and create suggestions.
#[tauri::command]
pub async fn automation_detect_patterns(
    state: State<'_, AppState>,
) -> Result<Vec<AutomationSuggestion>, String> {
    ensure_table(&state)?;

    // Read audit entries to detect repeated patterns
    let warden = state.warden_mgr.lock().await;
    let chain = warden.audit_chain();
    let entries: Vec<_> = chain.query(None, None, None).into_iter().cloned().collect();
    drop(warden);

    // Group by event_type and count occurrences
    let mut counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for entry in &entries {
        let key = format!("{:?}", entry.event_type);
        *counts.entry(key).or_default() += 1;
    }

    // Create suggestions for patterns with frequency >= 3
    let now = Utc::now().to_rfc3339();
    let mut new_suggestions: Vec<AutomationSuggestion> = Vec::new();

    let db = state.db.get().map_err(|_| "db lock")?;
    for (pattern, freq) in &counts {
        if *freq < 3 {
            continue;
        }

        // Check if suggestion already exists for this pattern
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM automation_suggestions WHERE pattern = ?1)",
                params![pattern],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if exists {
            // Update frequency
            let _ = db.execute(
                "UPDATE automation_suggestions SET frequency = ?1, updated_at = ?2 WHERE pattern = ?3",
                params![freq, now, pattern],
            );
        } else {
            let suggestion = AutomationSuggestion {
                id: Uuid::new_v4().to_string(),
                pattern: pattern.clone(),
                frequency: *freq,
                suggested_action: format!("Automate repeated action: {pattern}"),
                accepted: false,
                created_at: now.clone(),
            };

            let _ = db.execute(
                "INSERT INTO automation_suggestions (id, pattern, frequency, suggested_action, accepted, dismissed, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?5)",
                params![
                    suggestion.id,
                    suggestion.pattern,
                    suggestion.frequency,
                    suggestion.suggested_action,
                    suggestion.created_at,
                ],
            );

            new_suggestions.push(suggestion);
        }
    }

    Ok(new_suggestions)
}

/// Accept an automation suggestion.
#[tauri::command]
pub async fn automation_accept(
    state: State<'_, AppState>,
    suggestion_id: String,
) -> Result<(), String> {
    ensure_table(&state)?;
    let now = Utc::now().to_rfc3339();
    let db = state.db.get().map_err(|_| "db lock")?;
    db.execute(
        "UPDATE automation_suggestions SET accepted = 1, updated_at = ?1 WHERE id = ?2",
        params![now, suggestion_id],
    )
    .map_err(|e| format!("accept suggestion: {e}"))?;
    Ok(())
}

/// Dismiss an automation suggestion.
#[tauri::command]
pub async fn automation_dismiss(
    state: State<'_, AppState>,
    suggestion_id: String,
) -> Result<(), String> {
    ensure_table(&state)?;
    let now = Utc::now().to_rfc3339();
    let db = state.db.get().map_err(|_| "db lock")?;
    db.execute(
        "UPDATE automation_suggestions SET dismissed = 1, updated_at = ?1 WHERE id = ?2",
        params![now, suggestion_id],
    )
    .map_err(|e| format!("dismiss suggestion: {e}"))?;
    Ok(())
}
