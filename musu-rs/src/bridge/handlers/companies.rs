//! Companies endpoints: list, create, activate.
//!
//! wiki/491 §5.2 / §5.3 / §5.4. The /run handler lives in `run.rs`
//! (writer-stub path per A-1 resolution).

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Path, Query, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub workspace_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Company {
    pub id: String,
    pub name: String,
    pub workspace_id: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub meta: Value,
    pub purpose: Option<String>,
    pub work_dir: Option<String>,
    pub test_cmd: Option<String>,
}

fn row_to_company(row: &sqlx::sqlite::SqliteRow) -> Result<Company> {
    let meta_str: Option<String> = row.try_get("meta").ok();
    let meta = meta_str
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Object(serde_json::Map::new()));
    Ok(Company {
        id: row.try_get("id").map_err(MusuError::Sqlx)?,
        name: row.try_get("name").map_err(MusuError::Sqlx)?,
        workspace_id: row
            .try_get::<Option<String>, _>("workspace_id")
            .ok()
            .flatten()
            .unwrap_or_default(),
        status: row
            .try_get::<Option<String>, _>("status")
            .ok()
            .flatten()
            .unwrap_or_else(|| "draft".into()),
        created_at: row
            .try_get::<Option<i64>, _>("created_at")
            .ok()
            .flatten()
            .unwrap_or(0),
        updated_at: row
            .try_get::<Option<i64>, _>("updated_at")
            .ok()
            .flatten()
            .unwrap_or(0),
        meta,
        purpose: row.try_get::<Option<String>, _>("purpose").ok().flatten(),
        work_dir: row.try_get::<Option<String>, _>("work_dir").ok().flatten(),
        test_cmd: row.try_get::<Option<String>, _>("test_cmd").ok().flatten(),
    })
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<Company>>> {
    // Schema-not-applied tolerance: if companies table missing, return [].
    if !crate::bridge::db::schema_applied(&state.pool).await {
        return Err(MusuError::Internal(
            "schema not applied — apply R2 migrations first".into(),
        ));
    }

    let rows = match &q.workspace_id {
        Some(ws) => {
            sqlx::query("SELECT * FROM companies WHERE workspace_id = ? ORDER BY created_at DESC")
                .bind(ws)
                .fetch_all(&state.pool)
                .await
                .map_err(MusuError::Sqlx)?
        }
        None => sqlx::query("SELECT * FROM companies ORDER BY created_at DESC")
            .fetch_all(&state.pool)
            .await
            .map_err(MusuError::Sqlx)?,
    };

    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        out.push(row_to_company(row)?);
    }
    Ok(Json(out))
}

#[derive(Debug, Deserialize)]
pub struct CreateRequest {
    pub name: String,
    pub id: Option<String>,
    #[serde(default = "default_template")]
    pub template_key: String,
    #[serde(default)]
    pub workspace_id: String,
    #[serde(default)]
    pub meta: Value,
    #[serde(default)]
    pub purpose: String,
    #[serde(default)]
    pub work_dir: String,
    #[serde(default = "default_test_cmd")]
    pub test_cmd: String,
}

fn default_template() -> String {
    "default".into()
}

fn default_test_cmd() -> String {
    "python -m pytest -q".into()
}

#[derive(Debug, Serialize)]
pub struct CreateResponse {
    pub company: Company,
}

pub async fn create(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<CreateRequest>,
) -> Result<Json<CreateResponse>> {
    if req.name.trim().is_empty() {
        return Err(MusuError::BadRequest("name required".into()));
    }

    // wiki/491 §5.3: non-default template not implemented in R1 (deferred
    // to R2 companies.yaml loader). Facade handles the template path.
    if req.template_key != "default" {
        return Err(MusuError::NotImplemented(format!(
            "template_key={} requires R2 companies.yaml loader; use facade or wait for R2",
            req.template_key
        )));
    }

    if !crate::bridge::db::schema_applied(&state.pool).await {
        return Err(MusuError::Internal(
            "schema not applied — apply R2 migrations first".into(),
        ));
    }

    let id = req
        .id
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let now = chrono::Utc::now().timestamp();
    let meta_json = serde_json::to_string(&req.meta).unwrap_or_else(|_| "{}".into());

    sqlx::query(
        "INSERT INTO companies (id, name, workspace_id, status, created_at, updated_at, meta, purpose, work_dir, test_cmd) \
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&req.workspace_id)
    .bind(now)
    .bind(now)
    .bind(&meta_json)
    .bind(&req.purpose)
    .bind(&req.work_dir)
    .bind(&req.test_cmd)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    let row = sqlx::query("SELECT * FROM companies WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;
    let company = row_to_company(&row)?;

    // wiki/492 §7.6: write the YAML mirror of the new row. DB is canonical;
    // YAML files are derived state. Failure here is warn-only — the row is
    // already committed and the API contract is satisfied.
    let yaml_record = crate::core::record_from_create(
        &company.id,
        &company.name,
        &company.workspace_id,
        &company.status,
        company.created_at,
        company.updated_at,
        company.purpose.as_deref().unwrap_or(""),
        company.work_dir.as_deref().unwrap_or(""),
        company.test_cmd.as_deref().unwrap_or("python -m pytest -q"),
        company.meta.clone(),
    );
    if let Err(e) = crate::core::write_yaml(&yaml_record) {
        tracing::warn!(
            error = %e,
            id = %company.id,
            "companies.yaml write failed; row committed (DB is canonical)"
        );
    }

    // Audit best-effort. wiki/491 §9.5 / Auditor N-1: capture real client IP
    // from ConnectInfo so audit rows reflect the actual origin (loopback for
    // local installs, LAN IP for multi-PC) instead of 0.0.0.0.
    state
        .audit
        .write(crate::bridge::audit::AuditEntry {
            actor_ip: addr.ip(),
            method: "POST".into(),
            path: "/api/companies".into(),
            status_code: 200,
            agent_id: None,
            note: Some(format!("created company {}", id)),
            company_id: Some(id.clone()),
        })
        .await;

    Ok(Json(CreateResponse { company }))
}

#[derive(Debug, Serialize)]
pub struct ActivateResponse {
    pub company: Company,
}

pub async fn activate(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<String>,
) -> Result<Json<ActivateResponse>> {
    if !crate::bridge::db::schema_applied(&state.pool).await {
        return Err(MusuError::Internal(
            "schema not applied — apply R2 migrations first".into(),
        ));
    }

    let now = chrono::Utc::now().timestamp();
    let result = sqlx::query("UPDATE companies SET status = 'active', updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;

    if result.rows_affected() == 0 {
        return Err(MusuError::NotFound(format!("company {} not found", id)));
    }

    let row = sqlx::query("SELECT * FROM companies WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;
    let company = row_to_company(&row)?;

    // wiki/492 §7.6: refresh YAML mirror after UPDATE.
    let yaml_record = crate::core::record_from_create(
        &company.id,
        &company.name,
        &company.workspace_id,
        &company.status,
        company.created_at,
        company.updated_at,
        company.purpose.as_deref().unwrap_or(""),
        company.work_dir.as_deref().unwrap_or(""),
        company.test_cmd.as_deref().unwrap_or("python -m pytest -q"),
        company.meta.clone(),
    );
    if let Err(e) = crate::core::write_yaml(&yaml_record) {
        tracing::warn!(
            error = %e,
            id = %company.id,
            "companies.yaml refresh failed on activate; row committed (DB is canonical)"
        );
    }

    // Auditor N-1: real client IP from ConnectInfo.
    state
        .audit
        .write(crate::bridge::audit::AuditEntry {
            actor_ip: addr.ip(),
            method: "POST".into(),
            path: format!("/api/companies/{}/activate", id),
            status_code: 200,
            agent_id: None,
            note: Some("activated".into()),
            company_id: Some(id.clone()),
        })
        .await;

    Ok(Json(ActivateResponse { company }))
}
