//! CEO Planner Loop
//!
//! Autonomous background worker that polls SSOT for state and spawns workflows.

use crate::writer::runner::{TaskRunnerHandle, TaskSpec};
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{sleep, timeout, Duration};
use tokio_util::sync::CancellationToken;

pub(crate) const PLANNER_DEFAULT_INTERVAL_SEC: u64 = 300;
pub(crate) const PLANNER_MIN_INTERVAL_SEC: u64 = 60;
pub(crate) const PLANNER_DEFAULT_COMMAND_TIMEOUT_SEC: u64 = 20;
pub(crate) const PLANNER_MIN_COMMAND_TIMEOUT_SEC: u64 = 5;
pub(crate) const PLANNER_MAX_COMMAND_TIMEOUT_SEC: u64 = 120;

pub(crate) fn normalize_planner_interval_sec(raw: Option<&str>) -> u64 {
    raw.and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(PLANNER_DEFAULT_INTERVAL_SEC)
        .max(PLANNER_MIN_INTERVAL_SEC)
}

pub(crate) fn normalize_planner_command_timeout_sec(raw: Option<&str>) -> u64 {
    raw.and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(PLANNER_DEFAULT_COMMAND_TIMEOUT_SEC)
        .clamp(
            PLANNER_MIN_COMMAND_TIMEOUT_SEC,
            PLANNER_MAX_COMMAND_TIMEOUT_SEC,
        )
}

fn planner_interval_sec_from_env() -> u64 {
    normalize_planner_interval_sec(std::env::var("MUSU_PLANNER_INTERVAL_SEC").ok().as_deref())
}

fn planner_command_timeout_sec_from_env() -> u64 {
    normalize_planner_command_timeout_sec(
        std::env::var("MUSU_PLANNER_COMMAND_TIMEOUT_SEC")
            .ok()
            .as_deref(),
    )
}

pub async fn run_planner_loop(runner: TaskRunnerHandle, cancellation_token: CancellationToken) {
    let interval = planner_interval_sec_from_env();
    let command_timeout = planner_command_timeout_sec_from_env();

    tracing::info!(
        "Starting autonomous CEO planner loop (interval: {}s, command_timeout: {}s)",
        interval,
        command_timeout
    );

    loop {
        tokio::select! {
            _ = cancellation_token.cancelled() => break,
            _ = sleep(Duration::from_secs(interval)) => {}
        }

        if cancellation_token.is_cancelled() {
            break;
        }

        if let Ok(musu_crawl_exe) = std::env::var("MUSU_CRAWL_BINARY") {
            tracing::info!("Planner awakening. Querying SSOT for company goals...");

            // Query SSOT for overarching goals or pending issues
            let mut cmd = Command::new(&musu_crawl_exe);
            cmd.arg("search")
                .arg("company goals pending issues")
                .arg("--limit")
                .arg("5")
                .kill_on_drop(true)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            match timeout(Duration::from_secs(command_timeout), cmd.output()).await {
                Ok(Ok(output)) => {
                    if output.status.success() {
                        let results = String::from_utf8_lossy(&output.stdout);
                        if !results.trim().is_empty() {
                            tracing::info!(
                                "Planner found active context. Dispatching synthesis task."
                            );

                            let task_id = uuid::Uuid::new_v4().to_string();
                            let cwd = std::env::current_dir()
                                .unwrap_or_else(|_| std::path::PathBuf::from("."));

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
                }
                Ok(Err(err)) => {
                    tracing::warn!(error = %err, "Planner failed to spawn musu-crawl");
                }
                Err(_) => {
                    tracing::warn!(
                        timeout_sec = command_timeout,
                        "Planner crawler timed out; killed child process"
                    );
                }
            }
        }
    }

    tracing::info!("Autonomous CEO planner loop stopped");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planner_interval_has_idle_floor() {
        assert_eq!(
            normalize_planner_interval_sec(None),
            PLANNER_DEFAULT_INTERVAL_SEC
        );
        assert_eq!(
            normalize_planner_interval_sec(Some("0")),
            PLANNER_MIN_INTERVAL_SEC
        );
        assert_eq!(
            normalize_planner_interval_sec(Some("5")),
            PLANNER_MIN_INTERVAL_SEC
        );
        assert_eq!(normalize_planner_interval_sec(Some("600")), 600);
    }

    #[test]
    fn planner_command_timeout_is_bounded() {
        assert_eq!(
            normalize_planner_command_timeout_sec(None),
            PLANNER_DEFAULT_COMMAND_TIMEOUT_SEC
        );
        assert_eq!(
            normalize_planner_command_timeout_sec(Some("1")),
            PLANNER_MIN_COMMAND_TIMEOUT_SEC
        );
        assert_eq!(
            normalize_planner_command_timeout_sec(Some("9999")),
            PLANNER_MAX_COMMAND_TIMEOUT_SEC
        );
        assert_eq!(normalize_planner_command_timeout_sec(Some("45")), 45);
    }
}
