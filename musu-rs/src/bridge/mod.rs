//! Bridge module entry. Wires config → state → axum router → listener.
//!
//! wiki/491 §3 module layout, §4 auth, §6 facade, §8.5 rate-limit.
//!
//! Middleware order (wiki/491 §8.5):
//!   request_id → rate_limit → auth → audit_setup → handler
//! Rate-limit BEFORE auth so DoS attacks don't consume auth budget.
//! Facade is the Router fallback — auth runs unconditionally before it
//! (C-SEC-3 invariant).

pub mod audit;
pub mod auth;
pub mod config;
pub mod db;
pub mod dedup;
pub mod error;
pub mod facade;
pub mod handlers;
pub mod rate_limit;

use std::io::ErrorKind;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use self::audit::AuditState;
use self::auth::AuthState;
use self::config::BridgeConfig;
use self::dedup::DedupCache;
use self::rate_limit::RateLimitState;

/// Application state. Cheap to clone (everything inside is Arc/Pool).
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<BridgeConfig>,
    pub pool: sqlx::SqlitePool,
    pub http_client: reqwest::Client,
    pub audit: AuditState,
    pub dedup: DedupCache,
}

/// Entry point invoked from `main.rs` for `musu bridge`.
pub async fn run() -> Result<()> {
    let cfg = BridgeConfig::from_env()?;
    let cfg = Arc::new(cfg);

    tracing::info!(
        bridge_host = %cfg.bridge_host,
        bridge_port = cfg.bridge_port,
        python_facade_port = cfg.python_facade_port,
        auth_mode = cfg.env.as_str(),
        localhost_auth_required = cfg.localhost_auth_required,
        version = env!("CARGO_PKG_VERSION"),
        "musu-rs bridge starting"
    );

    let pool = db::init_pool(&cfg.db_path).await?;
    let audit = AuditState::new(pool.clone());

    // Boot probe per C-SEC-10. In production this is fatal; in dev/test
    // it's just a warning so devs can boot without applying R2 schema.
    if let Err(e) = audit.boot_check().await {
        match cfg.env {
            config::AuthMode::Production => {
                tracing::warn!(error = %e, "audit_log schema missing — audit writes will degrade");
                // wiki/491 §9: R1 does NOT block on R2 schema being applied.
                // We log but proceed.
            }
            config::AuthMode::Development => {
                tracing::info!(error = %e, "audit_log schema missing (dev mode, proceeding)");
            }
        }
    }

    let dedup = DedupCache::new();
    dedup.warmup(&pool).await;

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        // Don't allow upstream redirects to land outside loopback.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| anyhow::anyhow!("reqwest client build: {}", e))?;

    let state = AppState {
        config: cfg.clone(),
        pool,
        http_client,
        audit,
        dedup,
    };

    let auth_state = AuthState::from_config(&cfg);
    let rate_limit_state = RateLimitState::new(cfg.rate_limit_per_min, cfg.rate_limit_disabled);

    // Build the native router (matched endpoints) + facade fallback.
    let native = handlers::native_router();

    let app = native
        .fallback(facade::proxy)
        // Middleware applied bottom-up (outermost listed last).
        .layer(axum::middleware::from_fn_with_state(
            auth_state.clone(),
            auth::require_bearer,
        ))
        .layer(axum::middleware::from_fn_with_state(
            rate_limit_state.clone(),
            rate_limit::rate_limit_middleware,
        ))
        .layer(axum::middleware::from_fn(request_id_middleware))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", cfg.bridge_host, cfg.bridge_port)
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid bind address: {}", e))?;

    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) if e.kind() == ErrorKind::AddrInUse => {
            anyhow::bail!(
                "Port {} in use. Did you mean to run scripts/v24-rfast-dual-start.sh? \
                 If Python musu-bridge is already on :{}, stop it and use the dual-start \
                 wrapper so Python moves to :{}.",
                addr.port(),
                addr.port(),
                cfg.python_facade_port
            );
        }
        Err(e) => return Err(e.into()),
    };

    tracing::info!(addr = %addr, "musu-rs bridge listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .map_err(|e| anyhow::anyhow!("axum serve: {}", e))?;

    Ok(())
}

/// Generate or echo X-Request-ID for every request. Mirrors Python's
/// `RequestIDMiddleware`.
async fn request_id_middleware(mut req: Request, next: Next) -> Response {
    let rid = req
        .headers()
        .get("x-request-id")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if let Ok(val) = HeaderValue::from_str(&rid) {
        req.headers_mut().insert("x-request-id", val.clone());
    }

    let mut resp = next.run(req).await;
    if let Ok(val) = HeaderValue::from_str(&rid) {
        resp.headers_mut().insert("x-request-id", val);
    }
    resp
}
