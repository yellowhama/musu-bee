//! Bridge module entry. Wires config → state → axum router → listener.
//!
//! wiki/491 §3 module layout, §4 auth, §6 facade, §8.5 rate-limit.
//!
//! Middleware order (wiki/491 §8.5, updated wiki/511 W12):
//!   request_id → deadline → rate_limit → auth → audit_setup → handler
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
pub mod middleware;
pub mod rate_limit;
pub mod router;
pub mod services;

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
    // R5 (wiki/495 §3.1): native writer wiring.
    pub task_runner: crate::writer::TaskRunnerHandle,
    pub sse_broadcaster: crate::writer::SseBroadcaster,
    // V27-F7: easy token pairing store.
    pub pairing: crate::bridge::handlers::pair::PairingStore,
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

    // R2 wiki/492 §3 boot-order invariant (Critic H-2): apply schema BEFORE
    // AuditState::new so audit.boot_check sees the table on a fresh install.
    // Idempotent on subsequent boots (PRAGMA user_version short-circuits).
    crate::core::apply(&pool).await?;

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

    // R5 (wiki/495 §3.1): instantiate broadcaster + runner BEFORE state.
    // Runner ctor performs boot-orphan recovery (Critic C4).
    let sse_broadcaster = crate::writer::SseBroadcaster::from_env();
    let task_runner =
        crate::writer::TaskRunnerHandle::new(pool.clone(), sse_broadcaster.clone()).await;

    let state = AppState {
        config: cfg.clone(),
        pool,
        http_client,
        audit,
        dedup,
        task_runner,
        sse_broadcaster,
        pairing: crate::bridge::handlers::pair::PairingStore::new(),
    };

    let auth_state = AuthState::from_config(&cfg);
    let rate_limit_state = RateLimitState::new(cfg.rate_limit_per_min, cfg.rate_limit_disabled);

    // W15: Universal Clipboard broadcast monitor
    crate::io::clipboard::start_clipboard_monitor(state.clone());

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
        .layer(axum::middleware::from_fn(
            middleware::deadline::deadline_middleware,
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
                "Port {} in use. Set BRIDGE_PORT=0 for dynamic allocation, \
                 or stop the conflicting process.",
                addr.port(),
            );
        }
        Err(e) => return Err(e.into()),
    };

    // Read the actual port assigned by the OS (crucial when BRIDGE_PORT=0).
    let actual_addr = listener.local_addr()?;
    let actual_port = actual_addr.port();

    // Register ourselves in the service registry so other components can
    // discover which port we landed on.
    let svc_registry = services::ServiceRegistry::new();
    svc_registry.cleanup_stale(); // remove dead entries from previous crashes
    svc_registry
        .register(&services::ServiceRecord {
            name: "bridge".to_string(),
            addr: format!("{}:{}", cfg.bridge_host, actual_port),
            pid: Some(std::process::id()),
            started_at: chrono::Utc::now().timestamp(),
            transport: services::Transport::Tcp,
        })
        .unwrap_or_else(|e| tracing::warn!(error = %e, "failed to register bridge in service registry"));

    if cfg.bridge_port == 0 {
        tracing::info!(
            port = actual_port,
            "dynamic port assigned — registered in ~/.musu/services/bridge.json"
        );
    }

    tracing::info!(addr = %actual_addr, "musu-rs bridge listening");

    // V27 Account: Cloud registration & peer discovery (replaces mDNS)
    let musu_home = cfg.nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf();

    if let Some(token) = crate::cloud::token::load_token(&musu_home) {
        let cloud = crate::cloud::MusuCloud::new("https://musu.pro", Some(token.clone()));
        let my_name = cfg.node_name.clone();
        let port = cfg.bridge_port;
        // In a real scenario we'd determine the local LAN IP, but we'll use bridge_host for now, or "0.0.0.0"
        let host = if cfg.bridge_host == "0.0.0.0" {
            hostname::get().unwrap_or_default().to_string_lossy().to_string()
        } else {
            cfg.bridge_host.clone()
        };

        // Start mDNS advertiser
        let my_name_for_mdns = cfg.node_name.clone();
        let token_for_mdns = token.clone();
        let mdns_port = if cfg.bridge_port == 0 { actual_port } else { cfg.bridge_port };
        let _mdns_daemon = match crate::peer::mdns::start_advertiser(&my_name_for_mdns, mdns_port, &token_for_mdns) {
            Ok(d) => Some(d),
            Err(e) => {
                tracing::warn!(err = %e, "failed to start mDNS advertiser");
                None
            }
        };

        let musu_home_clone = musu_home.clone();
        let token_clone = token.clone();
        let my_name_clone = cfg.node_name.clone();

        tokio::spawn(async move {
            let _daemon_handle = _mdns_daemon; // keep alive
            tracing::info!("attempting musu.pro cloud registration & mDNS discovery...");
            
            // 1. Heartbeat loop
            loop {
                // Discover LAN peers via mDNS first
                crate::peer::mdns::auto_register_peers(
                    &musu_home_clone,
                    &my_name_clone,
                    &token_clone,
                    std::time::Duration::from_secs(5)
                ).await;

                let tailscale_ip = crate::peer::tailscale::get_tailscale_ip();
                let hardware = crate::peer::hardware::gather_hardware_info();
                let mut meta_obj = serde_json::json!({
                    "hardware": hardware,
                });
                if let Some(ip) = tailscale_ip.as_ref() {
                    meta_obj["tailscale_ip"] = serde_json::json!(ip);
                }
                let meta = Some(meta_obj);

                let req = crate::cloud::RegisterNodeRequest {
                    node_name: my_name.clone(),
                    public_url: format!("http://{}:{}", host, port),
                    meta,
                    ..Default::default()
                };

                if let Err(e) = cloud.register_node(req).await {
                    tracing::warn!(err = %e, "musu.pro registration failed");
                } else {
                    // 2. Discover peers
                    match cloud.list_nodes().await {
                        Ok(siblings) => {
                            let mut list = crate::peer::discovery::ManualPeerList::load(&musu_home);
                            let mut added = 0;
                            
                            // Also save a CachedRegistry so we have rich metadata for routing
                            let mut cached_nodes = Vec::new();
                            
                            for node in siblings {
                                if node.node_name != my_name {
                                    let mut peer_addr = node.public_url
                                        .trim_start_matches("http://")
                                        .trim_start_matches("https://")
                                        .trim_end_matches('/')
                                        .to_string();
                                    
                                    // Smart Fallback: If local machine has Tailscale AND remote peer has Tailscale IP,
                                    // prioritize routing over Tailscale.
                                    if let Some(meta) = &node.meta {
                                        if let Some(ip) = meta.get("tailscale_ip").and_then(|v| v.as_str()) {
                                            if tailscale_ip.is_some() {
                                                peer_addr = format!("{}:{}", ip, port);
                                                tracing::debug!(peer = %node.node_name, ip = %ip, "Upgrading peer routing to Tailscale IP");
                                            }
                                        }
                                    }
                                    
                                    cached_nodes.push(crate::peer::discovery::CachedNode {
                                        node_id: node.node_name.clone(), // using name as id
                                        name: node.node_name.clone(),
                                        addr: peer_addr.clone(),
                                        capabilities: vec![],
                                        last_heartbeat: Some(chrono::Utc::now()),
                                        meta: node.meta.clone(),
                                    });

                                    if !list.peers.iter().any(|p| p.addr == peer_addr) {
                                        list.add(peer_addr.clone(), Some(node.node_name.clone()));
                                        added += 1;
                                        tracing::info!(name = %node.node_name, addr = %peer_addr, "auto-registered sibling peer");
                                    }
                                }
                            }
                            
                            // Persist CachedRegistry
                            let cache = crate::peer::discovery::CachedRegistry {
                                nodes: cached_nodes,
                                fetched_at: chrono::Utc::now(),
                                registry_url: "https://musu.pro".into(),
                            };
                            if let Err(e) = cache.save(&musu_home) {
                                tracing::error!(err = %e, "failed to save cached registry");
                            }

                            if added > 0 {
                                if let Err(e) = list.save(&musu_home) {
                                    tracing::error!(err = %e, "failed to save discovered peers");
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!(err = %e, "failed to list nodes from musu.pro");
                        }
                    }
                }
                
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        });
    } else {
        tracing::info!("no musu.pro token found. Run `musu login` to enable auto-discovery.");
    }

    // V27-F9: Start file sync if shared dirs are configured.
    if !cfg.file_serve_roots.is_empty() {
        let sync_paths = cfg.file_serve_roots.clone();
        let musu_home = cfg
            .nodes_toml_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .to_path_buf();
        let token = cfg.token.clone();

        match crate::install::sync::start_watcher(&sync_paths) {
            Ok((rx, watcher)) => {
                // Get peer addrs from all sources.
                let peers = crate::peer::discovery::resolve_all_peers(&musu_home)
                    .into_iter()
                    .map(|p| p.addr)
                    .collect();
                // Watcher handle is moved into the sync loop so it stays alive.
                tokio::spawn(crate::install::sync::run_sync_loop(
                    rx, watcher, peers, token,
                ));
                tracing::info!("file sync started for {} directories", sync_paths.len());
            }
            Err(e) => {
                tracing::warn!(err = %e, "file sync disabled");
            }
        }
    }

    // V27-F6: TLS mode vs. plaintext mode.
    if cfg.tls_enabled {
        let musu_home = cfg
            .nodes_toml_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."));
        let tls_paths =
            crate::install::tls::ensure_tls_certs(musu_home, &cfg.node_name).map_err(|e| {
                tracing::error!(err = %e, "TLS cert generation failed");
                e
            })?;

        let cert_path = cfg.tls_cert_path.clone().unwrap_or(tls_paths.cert_path);
        let key_path = cfg.tls_key_path.clone().unwrap_or(tls_paths.key_path);

        tracing::info!(cert = %cert_path.display(), "starting bridge with TLS");

        let tls_config =
            axum_server::tls_rustls::RustlsConfig::from_pem_file(&cert_path, &key_path)
                .await
                .map_err(|e| anyhow::anyhow!("TLS config error: {e}"))?;

        axum_server::bind_rustls(addr, tls_config)
            .serve(app.into_make_service_with_connect_info::<SocketAddr>())
            .await
            .map_err(|e| anyhow::anyhow!("axum-server TLS serve: {e}"))?;
    } else {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .map_err(|e| anyhow::anyhow!("axum serve: {}", e))?;
    }

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
