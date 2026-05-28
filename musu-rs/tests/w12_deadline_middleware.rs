//! Integration tests for V26-W12 deadline middleware — wiki/511.
//!
//! Tests the `X-Musu-Deadline-Unix-Ms` header parsing, timeout enforcement,
//! 504 response on expiry, pass-through on absent/malformed headers, and
//! schema v3 `cross_machine` column migration.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::middleware;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use tower::ServiceExt;

use musu_rs::bridge::middleware::deadline::{deadline_middleware, DeadlineMs, HEADER_NAME};

/// Simple handler that returns 200 immediately.
async fn fast_handler() -> impl IntoResponse {
    StatusCode::OK
}

/// Handler that sleeps 500ms before responding.
async fn slow_handler() -> impl IntoResponse {
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    StatusCode::OK
}

/// Handler that reads DeadlineMs from extensions and returns it as body.
async fn deadline_echo_handler(req: Request<Body>) -> impl IntoResponse {
    let dm = req.extensions().get::<DeadlineMs>().map(|d| d.0);
    match dm {
        Some(ms) => (StatusCode::OK, format!("deadline={ms}")),
        None => (StatusCode::OK, "no-deadline".to_string()),
    }
}

/// Build a router with the deadline middleware and the fast handler.
fn fast_app() -> Router {
    Router::new()
        .route("/test", get(fast_handler))
        .layer(middleware::from_fn(deadline_middleware))
}

/// Build a router with the deadline middleware and the slow handler.
fn slow_app() -> Router {
    Router::new()
        .route("/test", get(slow_handler))
        .layer(middleware::from_fn(deadline_middleware))
}

/// Build a router with the deadline middleware and the echo handler.
fn echo_app() -> Router {
    Router::new()
        .route("/test", get(deadline_echo_handler))
        .layer(middleware::from_fn(deadline_middleware))
}

// ─── Test 1: No header → pass through ────────────────────────────

#[tokio::test]
async fn no_deadline_header_passes_through() {
    let req = Request::builder().uri("/test").body(Body::empty()).unwrap();
    let resp = fast_app().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    // No deadline header in response.
    assert!(resp.headers().get(HEADER_NAME).is_none());
}

// ─── Test 2: Valid deadline 30s in future → succeeds ─────────────

#[tokio::test]
async fn valid_deadline_future_succeeds() {
    let future_ms = chrono::Utc::now().timestamp_millis() + 30_000;
    let req = Request::builder()
        .uri("/test")
        .header(HEADER_NAME, future_ms.to_string())
        .body(Body::empty())
        .unwrap();
    let resp = fast_app().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    // Deadline header echoed back.
    let echoed = resp.headers().get(HEADER_NAME).unwrap().to_str().unwrap();
    assert_eq!(echoed, future_ms.to_string());
}

// ─── Test 3: Expired deadline → immediate 504 ────────────────────

#[tokio::test]
async fn expired_deadline_returns_504() {
    let past_ms = chrono::Utc::now().timestamp_millis() - 5_000;
    let req = Request::builder()
        .uri("/test")
        .header(HEADER_NAME, past_ms.to_string())
        .body(Body::empty())
        .unwrap();
    let resp = fast_app().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::GATEWAY_TIMEOUT);

    let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["error"], "deadline_exceeded");
    assert_eq!(json["code"], "deadline_exceeded");
    assert_eq!(json["deadline_ms"], past_ms);
}

// ─── Test 4: Near-future deadline + slow handler → 504 ──────────

#[tokio::test]
async fn deadline_near_future_timeout() {
    // Deadline 100ms from now but handler sleeps 500ms.
    let near_ms = chrono::Utc::now().timestamp_millis() + 100;
    let req = Request::builder()
        .uri("/test")
        .header(HEADER_NAME, near_ms.to_string())
        .body(Body::empty())
        .unwrap();
    let resp = slow_app().oneshot(req).await.unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::GATEWAY_TIMEOUT,
        "slow handler should be timed out by deadline"
    );
}

// ─── Test 5: Malformed header → ignored, pass through ────────────

#[tokio::test]
async fn malformed_header_ignored() {
    let req = Request::builder()
        .uri("/test")
        .header(HEADER_NAME, "not-a-number")
        .body(Body::empty())
        .unwrap();
    let resp = fast_app().oneshot(req).await.unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "malformed header should be ignored"
    );
}

// ─── Test 6: Deadline header echoed in response ──────────────────

#[tokio::test]
async fn deadline_header_echoed_in_response() {
    let future_ms = chrono::Utc::now().timestamp_millis() + 60_000;
    let req = Request::builder()
        .uri("/test")
        .header(HEADER_NAME, future_ms.to_string())
        .body(Body::empty())
        .unwrap();
    let resp = fast_app().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let hdr = resp
        .headers()
        .get(HEADER_NAME)
        .expect("header must be echoed");
    assert_eq!(hdr.to_str().unwrap(), future_ms.to_string());
}

// ─── Test 7: DeadlineMs injected into extensions ─────────────────

#[tokio::test]
async fn deadline_ms_injected_into_extensions() {
    let future_ms = chrono::Utc::now().timestamp_millis() + 30_000;
    let req = Request::builder()
        .uri("/test")
        .header(HEADER_NAME, future_ms.to_string())
        .body(Body::empty())
        .unwrap();
    let resp = echo_app().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let text = String::from_utf8(body.to_vec()).unwrap();
    assert_eq!(text, format!("deadline={future_ms}"));
}

// ─── Test 8: No header → no DeadlineMs in extensions ─────────────

#[tokio::test]
async fn no_header_no_deadline_in_extensions() {
    let req = Request::builder().uri("/test").body(Body::empty()).unwrap();
    let resp = echo_app().oneshot(req).await.unwrap();
    let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let text = String::from_utf8(body.to_vec()).unwrap();
    assert_eq!(text, "no-deadline");
}

// ─── Test 9: Schema v3 — audit_log cross_machine column exists ───

#[tokio::test]
async fn schema_v3_cross_machine_column_exists() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::from_str("sqlite::memory:")
                .unwrap()
                .create_if_missing(true),
        )
        .await
        .unwrap();

    // Run full migration ladder (v1 → v2 → v3).
    musu_rs::core::migrate::run(&pool).await.unwrap();

    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('audit_log') WHERE name = 'cross_machine'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        rows.len(),
        1,
        "cross_machine column must exist after v3 migration"
    );
}

// ─── Test 10: v3 preserves existing audit rows ───────────────────

#[tokio::test]
async fn v3_preserves_existing_audit_rows() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::Row;
    use std::str::FromStr;

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::from_str("sqlite::memory:")
                .unwrap()
                .create_if_missing(true),
        )
        .await
        .unwrap();

    // Apply v1 + v2 only.
    for stmt in musu_rs::core::schema::SCHEMA_V1_STATEMENTS {
        sqlx::query(stmt).execute(&pool).await.unwrap();
    }
    // v2: add route_executions columns.
    for stmt in musu_rs::core::schema::SCHEMA_V2_ALTER_STATEMENTS {
        // Skip if column exists (idempotent).
        let _ = sqlx::query(stmt).execute(&pool).await;
    }
    sqlx::query("PRAGMA user_version = 2")
        .execute(&pool)
        .await
        .unwrap();

    // Insert an audit row at v2 (no cross_machine column yet).
    sqlx::query(
        "INSERT INTO audit_log (ts, actor_ip, method, path, status_code) \
         VALUES (100, '127.0.0.1', 'GET', '/test', 200)",
    )
    .execute(&pool)
    .await
    .unwrap();

    // Now run migration ladder to catch up to v3.
    musu_rs::core::migrate::run(&pool).await.unwrap();

    // Verify row survives with cross_machine = NULL.
    let row = sqlx::query("SELECT cross_machine FROM audit_log WHERE ts = 100")
        .fetch_one(&pool)
        .await
        .unwrap();
    let cm: Option<i64> = row.try_get("cross_machine").unwrap();
    assert!(cm.is_none(), "legacy row must have cross_machine = NULL");
}

// ─── Test 11: Fresh DB reaches latest version ───────────────────

#[tokio::test]
async fn fresh_db_reaches_latest() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::from_str("sqlite::memory:")
                .unwrap()
                .create_if_missing(true),
        )
        .await
        .unwrap();

    let v = musu_rs::core::migrate::run(&pool).await.unwrap();
    assert_eq!(v, 4, "fresh DB migration must reach v4");

    let cv = musu_rs::core::migrate::current_version(&pool)
        .await
        .unwrap();
    assert_eq!(cv, 4);
}

// ─── Test 12: Migration idempotent double-apply ─────────────────

#[tokio::test]
async fn migration_idempotent_double_apply() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::from_str("sqlite::memory:")
                .unwrap()
                .create_if_missing(true),
        )
        .await
        .unwrap();

    musu_rs::core::migrate::run(&pool).await.unwrap();
    // Second call must be a no-op.
    let v = musu_rs::core::migrate::run(&pool).await.unwrap();
    assert_eq!(v, 4);
}
