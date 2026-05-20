//! V24-R4 wiki/494 §3 — `GET /api/index-search` native handler.
//!
//! Replaces Python `musu-bridge/server.py:2711-2743` byte-compatibly:
//!   * Same response shape: `[{path, snippet, type}]`.
//!   * Same FTS5 snippet bytes (col=2, `'<b>'`/`'</b>'`, `'…'` U+2026,
//!     maxchars=20). See plan §4 C1 / Critic C-R4-1.
//!   * Same empty-query short-circuit (`q.is_empty() → []`).
//!   * NO audit.write (C5 — read endpoint, matches R1 `list`/`get`).
//!
//! Workspace resolution: `?workspace=` can be either a company id OR a
//! company name. We try both — `SELECT ... WHERE id = ? OR name = ?` —
//! and take the first hit. If neither matches, return 404.

use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;
use sqlx::Row;
use std::path::PathBuf;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;
use crate::indexer::search::{search, SearchHit};

#[derive(Debug, Deserialize)]
pub struct IndexSearchQuery {
    /// FTS5 query string. Empty → empty result (Python parity).
    #[serde(default)]
    pub q: String,
    /// Workspace selector: company id OR company name. Required.
    #[serde(default)]
    pub workspace: String,
    /// `all` | `code` | `doc`. Advisory in R4 — passed through to
    /// `indexer::search` which currently ignores it (matches Python; FTS5
    /// itself matches all row types and the SearchPanel filters in JS).
    #[serde(default = "default_scope")]
    pub scope: String,
    /// Result cap. Defaults to 20 (Python parity).
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_scope() -> String {
    "all".into()
}

fn default_limit() -> u32 {
    20
}

/// `GET /api/index-search`. Reads the company row to discover its
/// `work_dir`, then delegates to `indexer::search`.
///
/// Read-only — does NOT call `state.audit.write` (C5).
pub async fn get(
    State(state): State<AppState>,
    Query(params): Query<IndexSearchQuery>,
) -> Result<Json<Vec<SearchHit>>> {
    // Auditor QA1 (HIGH): SearchPanel.tsx + handleWikiCommand.ts call this
    // endpoint with `?q=` only (no `workspace`), matching the Python parity
    // where Python had no workspace concept and returned [] on no-data.
    // Return Ok([]) on missing workspace to preserve frontend behavior.
    // Same rule as empty q in search.rs:60 — "missing input → empty result".
    if params.workspace.trim().is_empty() {
        return Ok(Json(Vec::new()));
    }

    if !crate::bridge::db::schema_applied(&state.pool).await {
        return Err(MusuError::Internal(
            "schema not applied — apply R2 migrations first".into(),
        ));
    }

    // Resolve workspace → work_dir. Accept either id or name.
    let row = sqlx::query("SELECT work_dir FROM companies WHERE id = ? OR name = ? LIMIT 1")
        .bind(&params.workspace)
        .bind(&params.workspace)
        .fetch_optional(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?
        .ok_or_else(|| MusuError::NotFound(format!("workspace {} not found", params.workspace)))?;

    let work_dir_str: Option<String> = row.try_get("work_dir").ok();
    let work_dir = match work_dir_str.as_deref() {
        Some(s) if !s.trim().is_empty() => PathBuf::from(s),
        // C-R4-5 mirror: a company with empty work_dir produces an empty
        // index, so the search is just `[]`. Avoid 404-ing here so the
        // frontend treats it the same as "no hits".
        _ => return Ok(Json(Vec::new())),
    };

    let hits = search(&work_dir, &params.q, &params.scope, params.limit)
        .await
        .map_err(|e| MusuError::Internal(format!("index search failed: {e}")))?;

    Ok(Json(hits))
}
