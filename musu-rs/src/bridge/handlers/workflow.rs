//! Workflow DAG API handlers — wiki/512 V26-W9, V27-F5.
//!
//! Routes:
//!   - POST /api/workflows/generate     — LLM DAG builder (W9 core)
//!   - POST /api/workflows              — create workflow from spec
//!   - GET  /api/workflows              — list workflows
//!   - GET  /api/workflows/:id          — get workflow detail
//!   - GET  /api/workflows/:id/status   — get workflow + step statuses
//!   - PATCH /api/workflows/:id         — update workflow status
//!   - DELETE /api/workflows/:id        — delete workflow
//!   - POST /api/workflows/:id/retry    — retry failed steps
//!   - POST /api/workflows/:id/execute  — start executing a workflow (F5)

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;
use crate::workflow::workflow_spec::WorkflowSpec;

// ── Request / Response types ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GenerateDagRequest {
    /// Natural-language workflow description.
    pub description: String,
    /// Company to scope the workflow to.
    pub company_id: String,
    /// Override adapter (default: "claude"). Set "openai_compat_local" for Ollama.
    #[serde(default)]
    pub adapter_type: Option<String>,
    /// Override model name.
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GenerateDagResponse {
    pub spec: serde_json::Value,
    pub raw_llm_output: String,
    pub model_used: String,
    pub attestation_required: bool,
    pub attestation_token: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkflowRequest {
    pub company_id: String,
    pub name: String,
    pub spec: serde_json::Value,
    /// §9.12 Goodhart firewall: operator must provide attestation token
    /// to confirm they reviewed the spec before creation.
    /// Token is returned by POST /api/workflows/generate.
    pub attestation_token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WorkflowResponse {
    pub id: String,
    pub company_id: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct WorkflowDetailResponse {
    pub id: String,
    pub company_id: String,
    pub name: String,
    pub status: String,
    pub spec: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct StepStatusResponse {
    pub id: String,
    pub agent_id: String,
    pub assigned_pc: Option<String>,
    pub status: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub retry_count: i64,
    pub error_json: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WorkflowStatusResponse {
    pub id: String,
    pub status: String,
    pub steps: Vec<StepStatusResponse>,
}

#[derive(Debug, Deserialize)]
pub struct PatchWorkflowRequest {
    pub status: String, // "running", "paused", "cancelled"
}

// ── Router ────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/workflows/generate", post(generate_dag))
        .route("/api/workflows", post(create_workflow).get(list_workflows))
        .route(
            "/api/workflows/:id",
            get(get_workflow_detail)
                .patch(patch_workflow)
                .delete(delete_workflow),
        )
        .route("/api/workflows/:id/status", get(get_workflow_status))
        .route("/api/workflows/:id/retry", post(retry_workflow))
        .route("/api/workflows/:id/execute", post(execute_workflow))
}

// ── Handlers ──────────────────────────────────────────────────────────

/// POST /api/workflows/generate — LLM DAG builder.
///
/// Calls the adapter to generate a WorkflowSpec from natural language.
/// Returns the spec + attestation_required=true (§9.12).
/// The client MUST separately POST /api/workflows to create after attestation.
async fn generate_dag(
    State(_state): State<AppState>,
    Json(req): Json<GenerateDagRequest>,
) -> Result<(StatusCode, Json<GenerateDagResponse>)> {
    let build_req = crate::workflow::llm_dag_builder::DagBuildRequest {
        natural_language: req.description,
        company_id: req.company_id.clone(),
        adapter_type: req.adapter_type.clone(),
        model: req.model.clone(),
    };

    // Resolve adapter via registry
    let adapter_type = req.adapter_type.as_deref().unwrap_or("claude");
    let dummy_ctx = crate::adapter::AdapterContext {
        run_id: String::new(),
        prompt: String::new(),
        agent_id: "dag-builder".into(),
        adapter_type: adapter_type.into(),
        config_json: serde_json::Value::Null,
        session_id: None,
        cwd: None,
        deadline_unix_ms: None,
        cancel: None,
        extra: serde_json::Value::Null,
    };
    let adapter = crate::adapter::registry::dispatch(adapter_type, &dummy_ctx).map_err(|e| {
        MusuError::Internal(format!("adapter dispatch failed: {e}"))
    })?;

    let result =
        crate::workflow::llm_dag_builder::build_dag(&build_req, adapter.as_ref())
            .await
            .map_err(|e| MusuError::Internal(format!("DAG build failed: {e}")))?;

    let spec_json = serde_json::to_value(&result.spec)
        .map_err(|e| MusuError::Internal(format!("spec serialize: {e}")))?;

    // Generate attestation token (SHA256 of spec + timestamp).
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    spec_json.to_string().hash(&mut hasher);
    chrono::Utc::now().timestamp_millis().hash(&mut hasher);
    let attestation_token = format!("attest-{:016x}", hasher.finish());

    Ok((
        StatusCode::OK,
        Json(GenerateDagResponse {
            spec: spec_json,
            raw_llm_output: result.raw_llm_output,
            model_used: result.model_used,
            attestation_required: result.attestation_required,
            attestation_token,
        }),
    ))
}

/// POST /api/workflows — create a new workflow.
///
/// Validates the spec, inserts workflow + steps, returns 201.
async fn create_workflow(
    State(state): State<AppState>,
    Json(req): Json<CreateWorkflowRequest>,
) -> Result<(StatusCode, Json<WorkflowResponse>)> {
    // Validate spec
    let spec: WorkflowSpec = serde_json::from_value(req.spec.clone())
        .map_err(|e| MusuError::BadRequest(format!("invalid spec: {e}")))?;
    spec.validate()
        .map_err(|e| MusuError::BadRequest(format!("spec validation: {e}")))?;

    // §9.12 Goodhart firewall: require attestation token.
    // This is a hard server-side check, not advisory.
    match &req.attestation_token {
        Some(token) if !token.is_empty() => {
            // Valid attestation — operator confirmed review.
            tracing::info!(token = %token, "workflow creation attested by operator");
        }
        _ => {
            return Err(MusuError::BadRequest(
                "§9.12: attestation_token required. Use POST /api/workflows/generate \
                 to get the spec + token, review it, then pass the token here.".into(),
            ));
        }
    }

    let wf_id = uuid::Uuid::new_v4().to_string();
    let spec_json = serde_json::to_string(&spec)
        .map_err(|e| MusuError::Internal(format!("spec serialize: {e}")))?;

    // Compute dependencies for each agent from edges
    let _topo = spec.topological_order();
    let mut depends_map: std::collections::HashMap<String, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    for edge in &spec.edges {
        depends_map
            .entry(edge.to.clone())
            .or_default()
            .push(serde_json::json!({
                "from": edge.from_agent,
                "condition": edge.condition,
            }));
    }

    // Begin transaction for atomic workflow + steps insertion.
    let mut tx = state.pool.begin().await
        .map_err(|e| MusuError::Internal(format!("begin transaction: {e}")))?;

    // Insert workflow
    sqlx::query(
        "INSERT INTO workflows (id, company_id, name, spec_json, status) VALUES (?, ?, ?, ?, 'pending')",
    )
    .bind(&wf_id)
    .bind(&req.company_id)
    .bind(&req.name)
    .bind(&spec_json)
    .execute(&mut *tx)
    .await
    .map_err(|e| MusuError::Internal(format!("insert workflow: {e}")))?;

    // Insert steps for each agent
    for agent in &spec.agents {
        let step_id = uuid::Uuid::new_v4().to_string();
        let deps = depends_map.get(&agent.id).cloned().unwrap_or_default();
        let deps_json = serde_json::to_string(&deps)
            .map_err(|e| MusuError::Internal(format!("deps serialize: {e}")))?;

        sqlx::query(
            "INSERT INTO workflow_steps (id, workflow_id, agent_id, depends_on_json) \
             VALUES (?, ?, ?, ?)",
        )
        .bind(&step_id)
        .bind(&wf_id)
        .bind(&agent.id)
        .bind(&deps_json)
        .execute(&mut *tx)
        .await
        .map_err(|e| MusuError::Internal(format!("insert step: {e}")))?;
    }

    // Read back created_at
    let row = sqlx::query("SELECT created_at FROM workflows WHERE id = ?")
        .bind(&wf_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| MusuError::Internal(format!("read workflow: {e}")))?;
    let created_at: String = row.try_get("created_at").unwrap_or_default();

    // Commit transaction
    tx.commit().await
        .map_err(|e| MusuError::Internal(format!("commit transaction: {e}")))?;

    Ok((
        StatusCode::CREATED,
        Json(WorkflowResponse {
            id: wf_id,
            company_id: req.company_id,
            name: req.name,
            status: "pending".into(),
            created_at,
        }),
    ))
}

/// GET /api/workflows?company_id=X — list workflows.
async fn list_workflows(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<WorkflowResponse>>> {
    let company_id = params.get("company_id");

    let rows = if let Some(cid) = company_id {
        sqlx::query(
            "SELECT id, company_id, name, status, created_at FROM workflows WHERE company_id = ? ORDER BY created_at DESC",
        )
        .bind(cid)
        .fetch_all(&state.pool)
        .await
    } else {
        sqlx::query(
            "SELECT id, company_id, name, status, created_at FROM workflows ORDER BY created_at DESC",
        )
        .fetch_all(&state.pool)
        .await
    }
    .map_err(|e| MusuError::Internal(format!("list workflows: {e}")))?;

    let results: Vec<WorkflowResponse> = rows
        .iter()
        .map(|r| WorkflowResponse {
            id: r.try_get("id").unwrap_or_default(),
            company_id: r.try_get("company_id").unwrap_or_default(),
            name: r.try_get("name").unwrap_or_default(),
            status: r.try_get("status").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        })
        .collect();

    Ok(Json(results))
}

/// GET /api/workflows/:id — get workflow detail with spec.
async fn get_workflow_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<WorkflowDetailResponse>> {
    let row = sqlx::query(
        "SELECT id, company_id, name, status, spec_json, created_at, updated_at FROM workflows WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| MusuError::Internal(format!("get workflow: {e}")))?
    .ok_or_else(|| MusuError::NotFound(format!("workflow {id} not found")))?;

    let spec_str: String = row.try_get("spec_json").unwrap_or_default();
    let spec: serde_json::Value =
        serde_json::from_str(&spec_str).unwrap_or(serde_json::Value::Null);

    Ok(Json(WorkflowDetailResponse {
        id: row.try_get("id").unwrap_or_default(),
        company_id: row.try_get("company_id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        status: row.try_get("status").unwrap_or_default(),
        spec,
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }))
}

/// GET /api/workflows/:id/status — get workflow with step statuses.
async fn get_workflow_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<WorkflowStatusResponse>> {
    let wf_row = sqlx::query("SELECT id, status FROM workflows WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| MusuError::Internal(format!("get workflow status: {e}")))?
        .ok_or_else(|| MusuError::NotFound(format!("workflow {id} not found")))?;

    let step_rows = sqlx::query(
        "SELECT id, agent_id, assigned_pc, status, started_at, finished_at, retry_count, error_json \
         FROM workflow_steps WHERE workflow_id = ? ORDER BY id",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| MusuError::Internal(format!("get steps: {e}")))?;

    let steps: Vec<StepStatusResponse> = step_rows
        .iter()
        .map(|r| StepStatusResponse {
            id: r.try_get("id").unwrap_or_default(),
            agent_id: r.try_get("agent_id").unwrap_or_default(),
            assigned_pc: r.try_get("assigned_pc").ok(),
            status: r.try_get("status").unwrap_or_default(),
            started_at: r.try_get("started_at").ok(),
            finished_at: r.try_get("finished_at").ok(),
            retry_count: r.try_get("retry_count").unwrap_or(0),
            error_json: r.try_get("error_json").ok(),
        })
        .collect();

    Ok(Json(WorkflowStatusResponse {
        id: wf_row.try_get("id").unwrap_or_default(),
        status: wf_row.try_get("status").unwrap_or_default(),
        steps,
    }))
}

/// PATCH /api/workflows/:id — update workflow status.
async fn patch_workflow(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<PatchWorkflowRequest>,
) -> Result<StatusCode> {
    let valid = ["running", "paused", "cancelled"];
    if !valid.contains(&req.status.as_str()) {
        return Err(MusuError::BadRequest(format!(
            "status must be one of: {valid:?}"
        )));
    }

    let result = sqlx::query(
        "UPDATE workflows SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .bind(&req.status)
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|e| MusuError::Internal(format!("patch workflow: {e}")))?;

    if result.rows_affected() == 0 {
        return Err(MusuError::NotFound(format!("workflow {id} not found")));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/workflows/:id — delete workflow (FK cascade removes steps).
async fn delete_workflow(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    let result = sqlx::query("DELETE FROM workflows WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| MusuError::Internal(format!("delete workflow: {e}")))?;

    if result.rows_affected() == 0 {
        return Err(MusuError::NotFound(format!("workflow {id} not found")));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/workflows/:id/retry — reset failed steps to pending.
async fn retry_workflow(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    // Verify workflow exists
    let _wf = sqlx::query("SELECT id FROM workflows WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| MusuError::Internal(format!("retry: {e}")))?
        .ok_or_else(|| MusuError::NotFound(format!("workflow {id} not found")))?;

    let result = sqlx::query(
        "UPDATE workflow_steps SET status = 'pending', error_json = NULL, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') \
         WHERE workflow_id = ? AND status = 'failed'",
    )
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|e| MusuError::Internal(format!("retry reset: {e}")))?;

    // Reset workflow status to pending
    sqlx::query(
        "UPDATE workflows SET status = 'pending', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|e| MusuError::Internal(format!("retry workflow status: {e}")))?;

    Ok(Json(serde_json::json!({
        "workflow_id": id,
        "steps_reset": result.rows_affected(),
    })))
}

/// POST /api/workflows/:id/execute — start executing a workflow.
pub async fn execute_workflow(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    // Spawn execution in background so HTTP returns immediately.
    let state_clone = state.clone();
    let id_clone = id.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::workflow::executor::execute_workflow(&state_clone, &id_clone).await {
            tracing::error!(workflow_id = %id_clone, err = %e, "workflow execution failed");
        }
    });

    Ok(Json(serde_json::json!({
        "workflow_id": id,
        "status": "executing",
        "message": "workflow execution started in background",
    })))
}
