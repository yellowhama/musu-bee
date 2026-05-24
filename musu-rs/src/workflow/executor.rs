//! Workflow execution engine — V27-F5.
//!
//! Executes workflow steps in dependency order (topological sort).
//! Supports cross-machine routing via assigned_pc and retry policies.

use std::collections::HashMap;

use sqlx::SqlitePool;

use crate::bridge::error::MusuError;
use crate::bridge::AppState;

/// Execute a workflow by running its steps in topological order.
pub async fn execute_workflow(state: &AppState, workflow_id: &str) -> Result<(), MusuError> {
    // 1. Load workflow and verify it's in valid state.
    let wf_row = sqlx::query("SELECT id, status, spec_json FROM workflows WHERE id = ?")
        .bind(workflow_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;

    let wf_row = wf_row
        .ok_or_else(|| MusuError::NotFound(format!("workflow {} not found", workflow_id)))?;

    use sqlx::Row;
    let status: String = wf_row.try_get("status").unwrap_or_default();
    if status != "pending" && status != "running" {
        return Err(MusuError::BadRequest(format!(
            "workflow is '{}', must be 'pending' or 'running' to execute",
            status
        )));
    }

    // 2. Set workflow to running.
    sqlx::query(
        "UPDATE workflows SET status = 'running', updated_at = datetime('now') WHERE id = ?",
    )
    .bind(workflow_id)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    tracing::info!(workflow_id = %workflow_id, "starting workflow execution");

    // 3. Load all steps.
    let steps = sqlx::query(
        "SELECT id, agent_id, assigned_pc, status, depends_on_json, retry_count \
         FROM workflow_steps WHERE workflow_id = ? ORDER BY rowid",
    )
    .bind(workflow_id)
    .fetch_all(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    // Build dependency graph.
    let mut step_map: HashMap<String, StepInfo> = HashMap::new();
    for row in &steps {
        let step_id: String = row.try_get("id").unwrap_or_default();
        let agent_id: String = row.try_get("agent_id").unwrap_or_default();
        let assigned_pc: Option<String> = row.try_get("assigned_pc").unwrap_or(None);
        let step_status: String = row.try_get("status").unwrap_or_default();
        let depends_json: String = row
            .try_get("depends_on_json")
            .unwrap_or_else(|_| "[]".to_string());
        let retry_count: i32 = row.try_get("retry_count").unwrap_or(0);
        let depends: Vec<String> = serde_json::from_str(&depends_json).unwrap_or_default();

        step_map.insert(
            step_id.clone(),
            StepInfo {
                id: step_id,
                agent_id,
                assigned_pc,
                status: step_status,
                depends_on: depends,
                _retry_count: retry_count,
            },
        );
    }

    // 4. Execute in topological order.
    let topo_order = topological_sort(&step_map)?;
    let mut completed: HashMap<String, String> = HashMap::new(); // step_id -> status
    let mut workflow_failed = false;

    for step_id in &topo_order {
        let step = step_map.get(step_id).unwrap();

        // Skip already done steps (e.g., retry scenario).
        if step.status == "done" {
            completed.insert(step_id.clone(), "done".to_string());
            continue;
        }

        // Check all dependencies are done.
        let deps_met = step
            .depends_on
            .iter()
            .all(|dep| completed.get(dep).map(|s| s == "done").unwrap_or(false));

        if !deps_met {
            tracing::warn!(step_id = %step_id, "dependencies not met, marking failed");
            update_step_status(&state.pool, step_id, "failed", Some("dependencies not met"))
                .await?;
            workflow_failed = true;
            continue;
        }

        // Mark step as running.
        sqlx::query(
            "UPDATE workflow_steps SET status = 'running', started_at = datetime('now'), \
             updated_at = datetime('now') WHERE id = ?",
        )
        .bind(step_id)
        .execute(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;

        // Execute the step as a task.
        tracing::info!(step_id = %step_id, agent_id = %step.agent_id, "executing workflow step");

        let task_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();

        // Insert route_execution row.
        sqlx::query(
            "INSERT INTO route_executions (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
             VALUES (?, (SELECT company_id FROM workflows WHERE id = ?), 'workflow', 'executor', ?, 'pending', ?)",
        )
        .bind(&task_id)
        .bind(workflow_id)
        .bind(format!("wf:{}:{}", workflow_id, step_id))
        .bind(now)
        .execute(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;

        // Route based on assigned_pc.
        let route_hints = crate::bridge::router::RouteHints::default();
        let decision =
            crate::bridge::router::route_task(state, step.assigned_pc.as_deref(), &route_hints);

        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

        match decision {
            crate::bridge::router::RouteDecision::Local => {
                if let Err(e) = state
                    .task_runner
                    .spawn_task(crate::writer::TaskSpec {
                        task_id: task_id.clone(),
                        company_id: None,
                        channel: "workflow".into(),
                        sender_id: "executor".into(),
                        prompt: format!("Execute workflow step: {}", step.agent_id),
                        expected_output: None,
                        cwd,
                        model: None,
                        timeout_sec: Some(3600),
                        adapter_type: "claude".into(),
                        callback_url: None,
                        source_task_id: None,
                    })
                    .await
                {
                    tracing::error!(step_id = %step_id, err = %e, "step spawn failed");
                    update_step_status(
                        &state.pool,
                        step_id,
                        "failed",
                        Some(&e.to_string()),
                    )
                    .await?;
                    workflow_failed = true;
                    continue;
                }
            }
            crate::bridge::router::RouteDecision::Remote { ref peer } => {
                let forwarded = crate::bridge::handlers::forward::ForwardedTask {
                    source_node: state.config.node_name.clone(),
                    source_task_id: task_id.clone(),
                    channel: "workflow".into(),
                    sender_id: "executor".into(),
                    text: format!("Execute workflow step: {}", step.agent_id),
                    adapter_type: Some("claude".into()),
                    model: None,
                    cwd: None,
                    deadline_unix_ms: None,
                    company_id: None,
                    timeout_sec: Some(3600),
                    callback_url: Some(format!(
                        "http://{}:{}/api/tasks/callback",
                        state.config.bridge_host, state.config.bridge_port,
                    )),
                };
                if let Err(e) = crate::bridge::handlers::forward::forward_to_peer(
                    &state.http_client,
                    peer,
                    forwarded,
                    &state.config.token,
                )
                .await
                {
                    tracing::error!(step_id = %step_id, err = %e, "step forward failed");
                    update_step_status(&state.pool, step_id, "failed", Some(&e)).await?;
                    workflow_failed = true;
                    continue;
                }
            }
        }

        // Poll for task completion (check every 2s, max 1 hour).
        let max_wait = std::time::Duration::from_secs(3600);
        let start = std::time::Instant::now();
        let final_status = loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let row = sqlx::query("SELECT status FROM route_executions WHERE task_id = ?")
                .bind(&task_id)
                .fetch_optional(&state.pool)
                .await
                .map_err(MusuError::Sqlx)?;

            if let Some(row) = row {
                let s: String = row.try_get("status").unwrap_or_default();
                match s.as_str() {
                    "done" | "failed" | "cancelled" => break s,
                    _ => {}
                }
            }
            if start.elapsed() > max_wait {
                break "failed".to_string();
            }
        };

        // Update step status.
        if final_status == "done" {
            update_step_status(&state.pool, step_id, "done", None).await?;
            completed.insert(step_id.clone(), "done".to_string());
            tracing::info!(step_id = %step_id, "step completed successfully");
        } else {
            update_step_status(
                &state.pool,
                step_id,
                "failed",
                Some(&format!("task {}", final_status)),
            )
            .await?;
            workflow_failed = true;
            tracing::warn!(step_id = %step_id, status = %final_status, "step failed");
            // Don't continue with downstream steps.
        }
    }

    // 5. Update workflow final status.
    let final_wf_status = if workflow_failed { "failed" } else { "done" };
    sqlx::query("UPDATE workflows SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(final_wf_status)
        .bind(workflow_id)
        .execute(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;

    tracing::info!(workflow_id = %workflow_id, status = %final_wf_status, "workflow execution complete");
    Ok(())
}

#[allow(dead_code)]
struct StepInfo {
    id: String,
    agent_id: String,
    assigned_pc: Option<String>,
    status: String,
    depends_on: Vec<String>,
    _retry_count: i32,
}

/// Topological sort using Kahn's algorithm.
fn topological_sort(steps: &HashMap<String, StepInfo>) -> Result<Vec<String>, MusuError> {
    let mut in_degree: HashMap<String, usize> = HashMap::new();
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();

    for (id, step) in steps {
        in_degree.entry(id.clone()).or_insert(0);
        adj.entry(id.clone()).or_default();
        for dep in &step.depends_on {
            adj.entry(dep.clone()).or_default().push(id.clone());
            *in_degree.entry(id.clone()).or_insert(0) += 1;
        }
    }

    let mut queue: Vec<String> = in_degree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(id, _)| id.clone())
        .collect();
    queue.sort(); // deterministic order

    let mut order = Vec::new();
    while let Some(id) = queue.pop() {
        order.push(id.clone());
        if let Some(dependents) = adj.get(&id) {
            for dep in dependents {
                if let Some(d) = in_degree.get_mut(dep) {
                    *d -= 1;
                    if *d == 0 {
                        queue.push(dep.clone());
                    }
                }
            }
        }
    }

    if order.len() != steps.len() {
        return Err(MusuError::BadRequest(
            "workflow has circular dependencies".into(),
        ));
    }

    Ok(order)
}

async fn update_step_status(
    pool: &SqlitePool,
    step_id: &str,
    status: &str,
    error: Option<&str>,
) -> Result<(), MusuError> {
    let finished = if status == "done" || status == "failed" || status == "cancelled" {
        Some(chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string())
    } else {
        None
    };

    sqlx::query(
        "UPDATE workflow_steps SET status = ?, error_json = ?, finished_at = ?, \
         updated_at = datetime('now') WHERE id = ?",
    )
    .bind(status)
    .bind(error.map(|e| serde_json::json!({"error": e}).to_string()))
    .bind(finished)
    .bind(step_id)
    .execute(pool)
    .await
    .map_err(MusuError::Sqlx)?;

    Ok(())
}
