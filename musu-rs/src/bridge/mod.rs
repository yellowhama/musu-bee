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
pub mod route_evidence;
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

    // V27-F10: Autonomous CEO Planner Loop
    if std::env::var("MUSU_ENABLE_PLANNER").unwrap_or_else(|_| "0".into()) == "1" {
        let runner_clone = task_runner.clone();
        tokio::spawn(async move {
            crate::brain::planner::run_planner_loop(runner_clone).await;
        });
    }

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

    // W15: Universal Clipboard broadcast monitor.
    //
    // Keep this opt-in for the desktop/Store path. Clipboard polling is useful
    // for fleet sync, but it is privacy-sensitive and should not consume idle
    // background CPU before the operator explicitly enables it.
    let clipboard_sync_enabled = matches!(
        std::env::var("MUSU_ENABLE_CLIPBOARD_SYNC").as_deref(),
        Ok("1") | Ok("true") | Ok("yes")
    );
    if clipboard_sync_enabled {
        crate::io::clipboard::start_clipboard_monitor(state.clone());
    } else {
        tracing::info!(
            "clipboard sync disabled; set MUSU_ENABLE_CLIPBOARD_SYNC=1 to enable clipboard polling"
        );
    }

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
        .unwrap_or_else(
            |e| tracing::warn!(error = %e, "failed to register bridge in service registry"),
        );

    if cfg.bridge_port == 0 {
        tracing::info!(
            port = actual_port,
            "dynamic port assigned — registered in ~/.musu/services/bridge.json"
        );
    }

    tracing::info!(addr = %actual_addr, "musu-rs bridge listening");

    // V27 Account: Cloud registration & peer discovery (replaces mDNS)
    let musu_home = cfg
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf();

    if let Some(token) = crate::cloud::token::load_token(&musu_home) {
        let cloud = crate::cloud::MusuCloud::new("https://musu.pro", Some(token.clone()));
        let my_name = cfg.node_name.clone();
        let advertised_public_url = services::advertised_bridge_http_url(&cfg);
        let cloud_heartbeat_interval_secs = std::env::var("MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(300)
            .max(60);

        let mdns_enabled = matches!(
            std::env::var("MUSU_ENABLE_MDNS").as_deref(),
            Ok("1") | Ok("true") | Ok("yes")
        );

        // mDNS remains available, but it is opt-in for the Store-candidate
        // desktop path after Windows/Tailscale adapter failures were observed
        // to stall bridge health checks.
        let my_name_for_mdns = cfg.node_name.clone();
        let token_for_mdns = token.clone();
        let mdns_port = actual_port;
        let _mdns_daemon = if mdns_enabled {
            match crate::peer::mdns::start_advertiser(&my_name_for_mdns, mdns_port, &token_for_mdns)
            {
                Ok(d) => Some(d),
                Err(e) => {
                    tracing::warn!(err = %e, "failed to start mDNS advertiser");
                    None
                }
            }
        } else {
            tracing::info!(
                "mDNS discovery disabled; set MUSU_ENABLE_MDNS=1 to enable LAN auto-discovery"
            );
            None
        };

        let musu_home_clone = musu_home.clone();
        let token_clone = token.clone();
        let my_name_clone = cfg.node_name.clone();

        tokio::spawn(async move {
            let _daemon_handle = _mdns_daemon; // keep alive
            tracing::info!(
                mdns_enabled,
                cloud_heartbeat_interval_secs,
                "starting low-duty musu.pro cloud registration loop"
            );
            let mut consecutive_failures: u32 = 0;

            // 1. Heartbeat loop
            loop {
                let mut cycle_ok = true;

                if mdns_enabled {
                    // Discover LAN peers via mDNS first.
                    crate::peer::mdns::auto_register_peers(
                        &musu_home_clone,
                        &my_name_clone,
                        &token_clone,
                        std::time::Duration::from_secs(5),
                    )
                    .await;
                }

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
                    public_url: advertised_public_url.clone(),
                    meta,
                    ..Default::default()
                };

                if let Err(e) = cloud.register_node(req).await {
                    cycle_ok = false;
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
                                    let mut peer_addr = public_url_to_addr(&node.public_url);

                                    // Smart Fallback: If local machine has Tailscale AND remote peer has Tailscale IP,
                                    // prioritize routing over Tailscale.
                                    if let Some(meta) = &node.meta {
                                        if let Some(ip) =
                                            meta.get("tailscale_ip").and_then(|v| v.as_str())
                                        {
                                            if tailscale_ip.is_some() {
                                                peer_addr =
                                                    replace_public_url_host(&node.public_url, ip)
                                                        .unwrap_or_else(|| peer_addr.clone());
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
                            cycle_ok = false;
                            tracing::warn!(err = %e, "failed to list nodes from musu.pro");
                        }
                    }
                }

                if cycle_ok {
                    consecutive_failures = 0;
                } else {
                    consecutive_failures = consecutive_failures.saturating_add(1).min(8);
                }
                let backoff_multiplier = 1_u64 << consecutive_failures.min(4);
                let jitter_ms = chrono::Utc::now().timestamp_millis().rem_euclid(1_000) as u64;
                let sleep_for = Duration::from_secs(
                    cloud_heartbeat_interval_secs.saturating_mul(backoff_multiplier),
                ) + Duration::from_millis(jitter_ms);
                tracing::debug!(
                    cycle_ok,
                    consecutive_failures,
                    sleep_ms = sleep_for.as_millis(),
                    "musu.pro cloud registration loop sleeping"
                );
                tokio::time::sleep(sleep_for).await;
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

        let std_listener = listener
            .into_std()
            .map_err(|e| anyhow::anyhow!("convert TLS listener: {e}"))?;

        axum_server::from_tcp_rustls(std_listener, tls_config)
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

fn public_url_to_addr(public_url: &str) -> String {
    if let Ok(url) = reqwest::Url::parse(public_url) {
        if let Some(host) = url.host_str() {
            if let Some(port) = url.port_or_known_default() {
                return format_host_port(host, port);
            }
            return host.to_string();
        }
    }
    public_url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches('/')
        .to_string()
}

fn replace_public_url_host(public_url: &str, host: &str) -> Option<String> {
    let url = reqwest::Url::parse(public_url).ok()?;
    let port = url.port_or_known_default()?;
    Some(format_host_port(host, port))
}

fn format_host_port(host: &str, port: u16) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_url_helpers_preserve_remote_port() {
        assert_eq!(
            public_url_to_addr("https://peer.example.test:43123/"),
            "peer.example.test:43123"
        );
        assert_eq!(
            replace_public_url_host("https://peer.example.test:43123/", "100.64.0.5"),
            Some("100.64.0.5:43123".to_string())
        );
        assert_eq!(
            replace_public_url_host("http://[fd7a:115c:a1e0::1]:8070/", "fd7a:115c:a1e0::99"),
            Some("[fd7a:115c:a1e0::99]:8070".to_string())
        );
    }
}
