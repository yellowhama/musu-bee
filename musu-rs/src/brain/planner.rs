//! CEO Planner Loop
//!
//! Autonomous background worker that polls SSOT for state and spawns workflows.

use tokio::time::{sleep, Duration};
use crate::writer::runner::{TaskRunnerHandle, TaskSpec};
use std::process::Command;

pub async fn run_planner_loop(runner: TaskRunnerHandle) {
    let interval = std::env::var("MUSU_PLANNER_INTERVAL_SEC")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(300); // Default 5 minutes

    tracing::info!("Starting autonomous CEO planner loop (interval: {}s)", interval);

    loop {
        sleep(Duration::from_secs(interval)).await;

        if let Ok(musu_crawl_exe) = std::env::var("MUSU_CRAWL_BINARY") {
            tracing::info!("Planner awakening. Querying SSOT for company goals...");
            
            // Query SSOT for overarching goals or pending issues
            let out = Command::new(&musu_crawl_exe)
                .arg("search")
                .arg("company goals pending issues")
                .arg("--limit")
                .arg("5")
                .output();

            if let Ok(output) = out {
                if output.status.success() {
                    let results = String::from_utf8_lossy(&output.stdout);
                    if !results.trim().is_empty() {
                        tracing::info!("Planner found active context. Dispatching synthesis task.");
                        
                        let task_id = uuid::Uuid::new_v4().to_string();
                        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
                        
                        let prompt = format!(
                            "You are the CEO Planner of this Musu Virtual Company.\n\
                            Review the following SSOT state and determine if any new workflows need to be spawned.\n\
                            If action is required, output a concrete plan.\n\n\
                            <SSOT_STATE>\n{}\n</SSOT_STATE>",
                            results.trim()
                        );

                        let spec = TaskSpec {
                            task_id: task_id.clone(),
                            company_id: None, // Apply to global or default company
                            channel: "planner".into(),
                            sender_id: "system-planner".into(),
                            prompt,
                            expected_output: None,
                            cwd,
                            model: None,
                            timeout_sec: Some(3600),
                            adapter_type: "claude".into(),
                            callback_url: None,
                            source_task_id: None,
                        };

                        if let Err(e) = runner.spawn_task(spec).await {
                            tracing::error!("Planner failed to dispatch task: {}", e);
                        }
                    }
                } else {
                    tracing::warn!("Planner crawler failed with status: {}", output.status);
                }
            } else {
                tracing::warn!("Planner failed to spawn musu-crawl");
            }
        }
    }
}
