//! Core module error type — wiki/492 §3.
//!
//! `CoreError` is thrown by load/write/validate paths in companies.rs +
//! templates.rs. Apply/migration errors propagate as `anyhow::Error` via
//! the `apply` orchestrator (they're admin-level, not request-bound).
//!
//! `IntoResponse` lets handlers return `CoreError` directly without
//! wrapping (matches `MusuError`'s shape: `{error, code}` JSON).

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)] // Some variants are reserved for R3+ consumers.
pub enum CoreError {
    #[error("invalid company id: {0}")]
    InvalidId(String),

    #[error("invalid company yaml: {0}")]
    InvalidYaml(String),

    #[error("unsupported schema_version: {0} (expected 1)")]
    UnsupportedSchemaVersion(u32),

    #[error("companies dir not available: {0}")]
    NoCompaniesDir(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("yaml error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("template not found: {0}")]
    TemplateNotFound(String),
}

impl CoreError {
    pub fn status(&self) -> StatusCode {
        match self {
            CoreError::InvalidId(_)
            | CoreError::InvalidYaml(_)
            | CoreError::UnsupportedSchemaVersion(_) => StatusCode::BAD_REQUEST,
            CoreError::TemplateNotFound(_) => StatusCode::NOT_FOUND,
            CoreError::NoCompaniesDir(_) | CoreError::Io(_) | CoreError::Yaml(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            CoreError::InvalidId(_) => "invalid_id",
            CoreError::InvalidYaml(_) => "invalid_yaml",
            CoreError::UnsupportedSchemaVersion(_) => "unsupported_schema_version",
            CoreError::NoCompaniesDir(_) => "no_companies_dir",
            CoreError::Io(_) => "io_error",
            CoreError::Yaml(_) => "yaml_error",
            CoreError::TemplateNotFound(_) => "template_not_found",
        }
    }
}

impl IntoResponse for CoreError {
    fn into_response(self) -> Response {
        match &self {
            CoreError::Io(_) | CoreError::Yaml(_) | CoreError::NoCompaniesDir(_) => {
                tracing::error!(error = %self, code = self.code(), "core error");
            }
            _ => {
                tracing::debug!(error = %self, code = self.code(), "core rejected");
            }
        }
        let status = self.status();
        let body = Json(json!({ "error": self.to_string(), "code": self.code() }));
        (status, body).into_response()
    }
}
