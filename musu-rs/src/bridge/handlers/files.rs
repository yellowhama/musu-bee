//! Remote filesystem API — V27.
//!
//! Provides HTTP endpoints for browsing, reading, writing, and managing
//! files on the local machine. Protected by bearer auth.
//!
//! Routes:
//!   - GET    /api/files          — list directory contents
//!   - GET    /api/files/read     — download a file (streaming)
//!   - POST   /api/files/write    — upload/create a file
//!   - POST   /api/files/mkdir    — create a directory
//!   - DELETE /api/files          — delete a file or directory
//!   - GET    /api/files/info     — get file/dir metadata

use std::path::PathBuf;

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

// ── Query params ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct FilePathParams {
    /// Absolute path on the remote machine.
    pub path: String,
}

// ── Response types ───────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DirListing {
    pub path: String,
    pub entries: Vec<DirEntry>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WriteResponse {
    pub path: String,
    pub bytes_written: u64,
}

// ── Path validation ──────────────────────────────────────────────────

/// Validate that the requested path is within an allowed serve root.
/// Returns the canonicalized path if valid.
fn validate_path(roots: &[PathBuf], user_path: &str) -> std::result::Result<PathBuf, MusuError> {
    if roots.is_empty() {
        return Err(MusuError::Forbidden(
            "file API disabled: MUSU_FILE_SERVE_ROOTS not configured".into(),
        ));
    }

    let requested = PathBuf::from(user_path);

    // Must be absolute
    if !requested.is_absolute() {
        return Err(MusuError::BadRequest(
            "path must be absolute (e.g., /workspace or C:\\workspace)".into(),
        ));
    }

    // Check for path traversal patterns
    let path_str = user_path.replace('\\', "/");
    if path_str.contains("/../") || path_str.ends_with("/..") || path_str.contains("/./") {
        return Err(MusuError::Forbidden("path traversal detected".into()));
    }

    // Check if the path is within any allowed root
    for root in roots {
        // Canonicalize root (it must exist)
        let canon_root = match root.canonicalize() {
            Ok(r) => r,
            Err(_) => continue,
        };

        // Try to canonicalize the requested path
        // For new files (write/mkdir), the parent must exist
        let check_path = if requested.exists() {
            match requested.canonicalize() {
                Ok(p) => p,
                Err(_) => continue,
            }
        } else {
            // For non-existent paths, check that parent is within root
            match requested.parent().and_then(|p| p.canonicalize().ok()) {
                Some(p) => p.join(requested.file_name().unwrap_or_default()),
                None => continue,
            }
        };

        if check_path.starts_with(&canon_root) {
            return Ok(requested);
        }
    }

    Err(MusuError::Forbidden(format!(
        "path '{}' is not within any configured serve root",
        user_path
    )))
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/files?path=/some/dir — list directory contents.
pub async fn list_dir(
    State(state): State<AppState>,
    Query(params): Query<FilePathParams>,
) -> Result<Json<DirListing>> {
    let path = validate_path(&state.config.file_serve_roots, &params.path)?;

    if !path.is_dir() {
        return Err(MusuError::BadRequest(format!(
            "'{}' is not a directory",
            params.path
        )));
    }

    let mut entries = Vec::new();
    let mut read_dir = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| MusuError::Internal(format!("read_dir: {e}")))?;

    while let Some(entry) = read_dir
        .next_entry()
        .await
        .map_err(|e| MusuError::Internal(format!("next_entry: {e}")))?
    {
        let metadata = entry.metadata().await.ok();
        let name = entry.file_name().to_string_lossy().to_string();
        let full_path = entry.path();

        entries.push(DirEntry {
            name,
            path: full_path.to_string_lossy().to_string(),
            is_dir: metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            size: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
            modified: metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| {
                chrono::DateTime::<chrono::Utc>::from(t)
                    .format("%Y-%m-%dT%H:%M:%SZ")
                    .to_string()
            }),
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));

    let total = entries.len();
    Ok(Json(DirListing {
        path: params.path,
        entries,
        total,
    }))
}

/// GET /api/files/read?path=/some/file — download a file.
pub async fn read_file(
    State(state): State<AppState>,
    Query(params): Query<FilePathParams>,
) -> Result<impl IntoResponse> {
    let path = validate_path(&state.config.file_serve_roots, &params.path)?;

    if !path.is_file() {
        return Err(MusuError::NotFound(format!(
            "'{}' is not a file or does not exist",
            params.path
        )));
    }

    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| MusuError::Internal(format!("metadata: {e}")))?;

    // Stream file using tokio
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| MusuError::Internal(format!("open file: {e}")))?;

    let stream = tokio_util::io::ReaderStream::new(file);
    let body = Body::from_stream(stream);

    // Guess MIME type
    let mime = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();

    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    Ok((
        [
            (header::CONTENT_TYPE, mime),
            (header::CONTENT_LENGTH, metadata.len().to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        body,
    ))
}

/// POST /api/files/write?path=/some/file — upload/create a file.
pub async fn write_file(
    State(state): State<AppState>,
    Query(params): Query<FilePathParams>,
    body: axum::body::Bytes,
) -> Result<Json<WriteResponse>> {
    if !state.config.file_serve_writable {
        return Err(MusuError::Forbidden(
            "file writes disabled: set MUSU_FILE_SERVE_WRITABLE=1".into(),
        ));
    }

    let path = validate_path(&state.config.file_serve_roots, &params.path)?;

    // Create parent directories if needed
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| MusuError::Internal(format!("create_dir_all: {e}")))?;
    }

    let bytes_written = body.len() as u64;
    tokio::fs::write(&path, &body)
        .await
        .map_err(|e| MusuError::Internal(format!("write file: {e}")))?;

    tracing::info!(
        path = %path.display(),
        bytes = bytes_written,
        "file written via API"
    );

    Ok(Json(WriteResponse {
        path: params.path,
        bytes_written,
    }))
}

/// POST /api/files/mkdir?path=/some/dir — create a directory.
pub async fn mkdir(
    State(state): State<AppState>,
    Query(params): Query<FilePathParams>,
) -> Result<StatusCode> {
    if !state.config.file_serve_writable {
        return Err(MusuError::Forbidden(
            "file writes disabled: set MUSU_FILE_SERVE_WRITABLE=1".into(),
        ));
    }

    let path = validate_path(&state.config.file_serve_roots, &params.path)?;

    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| MusuError::Internal(format!("mkdir: {e}")))?;

    tracing::info!(path = %path.display(), "directory created via API");

    Ok(StatusCode::CREATED)
}

/// DELETE /api/files?path=/some/file — delete a file or empty directory.
pub async fn delete_path(
    State(state): State<AppState>,
    Query(params): Query<FilePathParams>,
) -> Result<StatusCode> {
    if !state.config.file_serve_writable {
        return Err(MusuError::Forbidden(
            "file writes disabled: set MUSU_FILE_SERVE_WRITABLE=1".into(),
        ));
    }

    let path = validate_path(&state.config.file_serve_roots, &params.path)?;

    if !path.exists() {
        return Err(MusuError::NotFound(format!(
            "'{}' does not exist",
            params.path
        )));
    }

    if path.is_dir() {
        tokio::fs::remove_dir_all(&path)
            .await
            .map_err(|e| MusuError::Internal(format!("remove_dir_all: {e}")))?;
    } else {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| MusuError::Internal(format!("remove_file: {e}")))?;
    }

    tracing::info!(path = %path.display(), "deleted via API");

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/files/info?path=/some/path — get metadata for a file or directory.
pub async fn file_info(
    State(state): State<AppState>,
    Query(params): Query<FilePathParams>,
) -> Result<Json<FileInfo>> {
    let path = validate_path(&state.config.file_serve_roots, &params.path)?;

    if !path.exists() {
        return Ok(Json(FileInfo {
            path: params.path,
            exists: false,
            is_dir: false,
            size: 0,
            modified: None,
        }));
    }

    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| MusuError::Internal(format!("metadata: {e}")))?;

    Ok(Json(FileInfo {
        path: params.path,
        exists: true,
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified: metadata.modified().ok().map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string()
        }),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_path_rejects_empty_roots() {
        let result = validate_path(&[], "/some/path");
        assert!(result.is_err());
    }

    #[test]
    fn validate_path_rejects_relative() {
        let roots = vec![PathBuf::from("C:\\workspace")];
        let result = validate_path(&roots, "relative/path");
        assert!(result.is_err());
    }

    #[test]
    fn validate_path_rejects_traversal() {
        let roots = vec![PathBuf::from("C:\\workspace")];
        let result = validate_path(&roots, "C:\\workspace\\..\\..\\etc\\passwd");
        assert!(result.is_err());
    }
}
