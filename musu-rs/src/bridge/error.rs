//! Error type for the bridge module.
//!
//! Mirrors Python `MusuError` from `musu-bridge/errors.py`.
//! JSON response shape: `{error, code, request_id}` per wiki/491.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)] // Variants pre-declared for handlers added in later R-phases.
pub enum MusuError {
    #[error("unauthorized: {0}")]
    Unauthorized(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("rate limited: {0}")]
    RateLimited(String),

    #[error("upstream error: {0}")]
    Upstream(String),

    #[error("not implemented: {0}")]
    NotImplemented(String),

    #[error("internal: {0}")]
    Internal(String),

    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl MusuError {
    pub fn status(&self) -> StatusCode {
        match self {
            MusuError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            MusuError::Forbidden(_) => StatusCode::FORBIDDEN,
            MusuError::BadRequest(_) => StatusCode::BAD_REQUEST,
            MusuError::NotFound(_) => StatusCode::NOT_FOUND,
            MusuError::Conflict(_) => StatusCode::CONFLICT,
            MusuError::RateLimited(_) => StatusCode::TOO_MANY_REQUESTS,
            MusuError::Upstream(_) => StatusCode::BAD_GATEWAY,
            MusuError::NotImplemented(_) => StatusCode::NOT_IMPLEMENTED,
            MusuError::Internal(_)
            | MusuError::Sqlx(_)
            | MusuError::Io(_)
            | MusuError::Anyhow(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            MusuError::Unauthorized(_) => "unauthorized",
            MusuError::Forbidden(_) => "forbidden",
            MusuError::BadRequest(_) => "bad_request",
            MusuError::NotFound(_) => "not_found",
            MusuError::Conflict(_) => "conflict",
            MusuError::RateLimited(_) => "rate_limited",
            MusuError::Upstream(_) => "upstream_error",
            MusuError::NotImplemented(_) => "not_implemented",
            MusuError::Internal(_) => "internal",
            MusuError::Sqlx(_) => "db_error",
            MusuError::Io(_) => "io_error",
            MusuError::Anyhow(_) => "internal",
        }
    }
}

impl IntoResponse for MusuError {
    fn into_response(self) -> Response {
        // Log internal errors with stack context; 401/403/404 are client-side info.
        match &self {
            MusuError::Internal(_) | MusuError::Sqlx(_) | MusuError::Io(_) | MusuError::Anyhow(_) => {
                tracing::error!(error = %self, code = self.code(), "request failed");
            }
            MusuError::Upstream(_) => {
                tracing::warn!(error = %self, code = self.code(), "facade upstream error");
            }
            _ => {
                tracing::debug!(error = %self, code = self.code(), "request rejected");
            }
        }
        let status = self.status();
        let body = Json(json!({
            "error": self.to_string(),
            "code": self.code(),
        }));
        (status, body).into_response()
    }
}

pub type Result<T> = std::result::Result<T, MusuError>;
