//! Minimal WebDAV server — V27-F10.
//!
//! Implements enough of WebDAV to allow Windows `net use` and macOS
//! Finder to mount remote musu shared directories.
//!
//! Methods supported:
//!   OPTIONS, PROPFIND, GET, PUT, MKCOL, DELETE, HEAD

use std::path::{Path, PathBuf};

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, Method, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::bridge::AppState;

/// Handle all WebDAV requests at `/webdav` and `/webdav/*path`.
pub async fn handle_webdav(
    State(state): State<AppState>,
    request: Request,
) -> Response {
    let method = request.method().clone();
    let uri_path = request.uri().path().to_string();

    // Strip /webdav prefix to get the file path.
    let file_path = uri_path
        .strip_prefix("/webdav")
        .unwrap_or(&uri_path)
        .to_string();

    // Decode URL-encoded path.
    let file_path = urlencoding::decode(&file_path)
        .unwrap_or_else(|_| file_path.clone().into())
        .to_string();

    // Map the relative WebDAV path to an absolute path on the server.
    let abs_path = resolve_webdav_path(&state, &file_path);

    tracing::debug!(
        method = %method,
        uri = %uri_path,
        resolved = %abs_path.display(),
        "webdav request"
    );

    match method {
        Method::OPTIONS => handle_options(),
        _ if method.as_str() == "PROPFIND" => {
            handle_propfind(&state, &abs_path, &file_path).await
        }
        Method::GET | Method::HEAD => {
            handle_get(&abs_path, method == Method::HEAD).await
        }
        Method::PUT => {
            let body =
                match axum::body::to_bytes(request.into_body(), 100_000_000).await {
                    Ok(b) => b,
                    Err(_) => {
                        return (StatusCode::PAYLOAD_TOO_LARGE, "body too large")
                            .into_response()
                    }
                };
            handle_put(&abs_path, &body).await
        }
        _ if method.as_str() == "MKCOL" => handle_mkcol(&abs_path).await,
        Method::DELETE => handle_delete(&abs_path).await,
        _ => {
            (StatusCode::METHOD_NOT_ALLOWED, "method not allowed").into_response()
        }
    }
}

/// Resolve a WebDAV-relative path to an absolute filesystem path.
///
/// Uses the first `file_serve_root` as the WebDAV root directory.
fn resolve_webdav_path(state: &AppState, rel_path: &str) -> PathBuf {
    let root = state
        .config
        .file_serve_roots
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("."));

    let cleaned = rel_path.trim_start_matches('/');
    if cleaned.is_empty() {
        root
    } else {
        root.join(cleaned)
    }
}

fn handle_options() -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header("Allow", "OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL")
        .header("DAV", "1")
        .header(header::CONTENT_LENGTH, "0")
        .body(Body::empty())
        .unwrap()
}

async fn handle_propfind(
    state: &AppState,
    path: &Path,
    rel_path: &str,
) -> Response {
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }

    let root = state
        .config
        .file_serve_roots
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("."));

    let mut entries = Vec::new();

    if path.is_dir() {
        // Add self.
        entries.push(propfind_entry(&root, path, true));
        // Add children.
        if let Ok(mut rd) = tokio::fs::read_dir(path).await {
            while let Ok(Some(entry)) = rd.next_entry().await {
                let meta = entry.metadata().await.ok();
                let is_dir =
                    meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                entries.push(propfind_entry(&root, &entry.path(), is_dir));
            }
        }
    } else {
        entries.push(propfind_entry(&root, path, false));
    }

    let xml = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n\
         <D:multistatus xmlns:D=\"DAV:\">\n{}\n</D:multistatus>",
        entries.join("\n")
    );

    tracing::debug!(
        path = %path.display(),
        rel_path,
        entries = entries.len(),
        "propfind response"
    );

    Response::builder()
        .status(StatusCode::MULTI_STATUS)
        .header(header::CONTENT_TYPE, "application/xml; charset=utf-8")
        .body(Body::from(xml))
        .unwrap()
}

/// Build a single `<D:response>` XML fragment for PROPFIND.
fn propfind_entry(root: &Path, path: &Path, is_dir: bool) -> String {
    // Compute the href relative to the root.
    let rel = path
        .strip_prefix(root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();

    let href = if rel.is_empty() {
        "/webdav/".to_string()
    } else if is_dir {
        format!("/webdav/{}/", encode_uri_path(&rel))
    } else {
        format!("/webdav/{}", encode_uri_path(&rel))
    };

    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();

    let size = if is_dir {
        0
    } else {
        std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
    };
    let modified = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .format("%a, %d %b %Y %H:%M:%S GMT")
                .to_string()
        })
        .unwrap_or_default();

    let resource_type = if is_dir {
        "<D:resourcetype><D:collection/></D:resourcetype>"
    } else {
        "<D:resourcetype/>"
    };

    format!(
        "  <D:response>\n\
         \t<D:href>{href}</D:href>\n\
         \t<D:propstat>\n\
         \t\t<D:prop>\n\
         \t\t\t<D:displayname>{name}</D:displayname>\n\
         \t\t\t{resource_type}\n\
         \t\t\t<D:getcontentlength>{size}</D:getcontentlength>\n\
         \t\t\t<D:getlastmodified>{modified}</D:getlastmodified>\n\
         \t\t</D:prop>\n\
         \t\t<D:status>HTTP/1.1 200 OK</D:status>\n\
         \t</D:propstat>\n\
         </D:response>"
    )
}

/// URL-encode each path segment individually, preserving `/` separators.
fn encode_uri_path(path: &str) -> String {
    path.split('/')
        .map(|seg| urlencoding::encode(seg).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

async fn handle_get(path: &Path, head_only: bool) -> Response {
    if !path.is_file() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }

    if head_only {
        let size = tokio::fs::metadata(path)
            .await
            .map(|m| m.len())
            .unwrap_or(0);
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_LENGTH, size.to_string())
            .body(Body::empty())
            .unwrap();
    }

    match tokio::fs::read(path).await {
        Ok(data) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CONTENT_LENGTH, data.len().to_string())
                .body(Body::from(data))
                .unwrap()
        }
        Err(e) => {
            tracing::error!(path = %path.display(), err = %e, "webdav GET read error");
            (StatusCode::INTERNAL_SERVER_ERROR, "read error").into_response()
        }
    }
}

async fn handle_put(path: &Path, body: &[u8]) -> Response {
    // Ensure parent exists.
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    match tokio::fs::write(path, body).await {
        Ok(()) => {
            tracing::info!(path = %path.display(), bytes = body.len(), "webdav PUT");
            (StatusCode::CREATED, "created").into_response()
        }
        Err(e) => {
            tracing::error!(path = %path.display(), err = %e, "webdav PUT error");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("write error: {e}"))
                .into_response()
        }
    }
}

async fn handle_mkcol(path: &Path) -> Response {
    match tokio::fs::create_dir_all(path).await {
        Ok(()) => {
            tracing::info!(path = %path.display(), "webdav MKCOL");
            (StatusCode::CREATED, "created").into_response()
        }
        Err(e) => {
            tracing::error!(path = %path.display(), err = %e, "webdav MKCOL error");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("mkdir error: {e}"))
                .into_response()
        }
    }
}

async fn handle_delete(path: &Path) -> Response {
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    let result = if path.is_dir() {
        tokio::fs::remove_dir_all(path).await
    } else {
        tokio::fs::remove_file(path).await
    };
    match result {
        Ok(()) => {
            tracing::info!(path = %path.display(), "webdav DELETE");
            (StatusCode::NO_CONTENT, "").into_response()
        }
        Err(e) => {
            tracing::error!(path = %path.display(), err = %e, "webdav DELETE error");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("delete error: {e}"))
                .into_response()
        }
    }
}
