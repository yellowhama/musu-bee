//! Bridge module entry. Wires config → state → axum router → listener.
//!
//! wiki/491 §3 module layout, §4 auth, §8.5 rate-limit.
//!
//! Middleware order (wiki/491 §8.5, updated wiki/511 W12):
//!   request_id → deadline → rate_limit → auth → audit_setup → handler
//! Rate-limit BEFORE auth so DoS attacks don't consume auth budget.
//! Unmatched routes return 404 (the legacy Python sidecar reverse-proxy
//! facade fallback was removed; all served endpoints are native Rust routes).

pub mod audit;
pub mod auth;
pub mod config;
pub mod db;
pub mod dedup;
pub mod error;
pub mod handlers;
pub mod middleware;
pub mod rate_limit;
pub mod rendezvous;
pub mod route_evidence;
pub mod router;
pub mod services;
pub mod tls_pin;

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
use tokio_util::sync::CancellationToken;
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

const CLOUD_HEARTBEAT_DEFAULT_INTERVAL_SEC: u64 = 300;
const CLOUD_HEARTBEAT_MIN_INTERVAL_SEC: u64 = 60;
const CLOUD_HEARTBEAT_BACKOFF_MAX_EXPONENT: u32 = 4;

fn normalize_cloud_heartbeat_interval_sec(raw: Option<&str>) -> u64 {
    raw.and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(CLOUD_HEARTBEAT_DEFAULT_INTERVAL_SEC)
        .max(CLOUD_HEARTBEAT_MIN_INTERVAL_SEC)
}

fn cloud_heartbeat_interval_secs_from_env() -> u64 {
    normalize_cloud_heartbeat_interval_sec(
        std::env::var("MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC")
            .ok()
            .as_deref(),
    )
}

fn cloud_registration_sleep_duration(
    heartbeat_interval_secs: u64,
    consecutive_failures: u32,
    jitter_ms: u64,
) -> Duration {
    let backoff_multiplier =
        1_u64 << consecutive_failures.min(CLOUD_HEARTBEAT_BACKOFF_MAX_EXPONENT);
    Duration::from_secs(heartbeat_interval_secs.saturating_mul(backoff_multiplier))
        + Duration::from_millis(jitter_ms)
}

/// Spawn the background task that hot-reloads `~/.musu/mesh.env` into the
/// running bridge's [`AuthState`] without a restart.
///
/// Two channels feed `AuthState::swap_peer_token` (which itself rejects
/// empty/None candidates — Critic A3):
///   1. A `notify` watcher on the PARENT DIR (musu_home), NonRecursive,
///      filtered to `mesh.env` events, debounced ~300ms. This is the fast
///      path — picks up `musu mesh join-account` within a few hundred ms.
///   2. A 45s `tokio::time::interval` that unconditionally re-reads. This is
///      the correctness backstop: if the watcher backend dies (or never
///      initializes), the bearer is still eventually picked up.
///
/// Watcher init failure is logged via `tracing::error!` and does NOT abort:
/// the periodic re-read alone is sufficient for correctness, and local-token
/// auth is unaffected either way.
fn spawn_mesh_bearer_watcher(auth_state: AuthState) {
    use notify::{RecommendedWatcher, RecursiveMode, Watcher};

    let home = match crate::install::resolve_musu_home_from_env() {
        Ok(h) => h,
        Err(e) => {
            // musu_home is unresolvable (no HOME/USERPROFILE/MUSU_HOME). The
            // bridge can still serve local-token auth; we simply cannot watch a
            // mesh.env we can't locate. Log and skip — do NOT abort boot.
            tracing::error!(error = %e,
                "mesh-bearer watcher: musu_home unresolved; mesh.env hot-reload disabled");
            return;
        }
    };

    tokio::spawn(async move {
        let notify = Arc::new(tokio::sync::Notify::new());
        let dirty = Arc::new(std::sync::Mutex::new(false));

        // Keep the watcher alive for the lifetime of this task by moving it
        // into the loop scope below. If init fails we proceed with the
        // periodic path only.
        let watcher: Option<RecommendedWatcher> = {
            let notify_cb = notify.clone();
            let dirty_cb = dirty.clone();
            match RecommendedWatcher::new(
                move |event_result: notify::Result<notify::Event>| {
                    let event = match event_result {
                        Ok(e) => e,
                        Err(e) => {
                            tracing::warn!(error = %e, "mesh-bearer watcher event error");
                            return;
                        }
                    };
                    // Only react to events touching `mesh.env` itself (the dir
                    // also holds bridge.env, nodes.toml, the db dir, etc.).
                    let touches_mesh_env = event.paths.iter().any(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n == "mesh.env")
                            .unwrap_or(false)
                    });
                    if !touches_mesh_env {
                        return;
                    }
                    *dirty_cb.lock().unwrap() = true;
                    notify_cb.notify_one();
                },
                notify::Config::default(),
            ) {
                Ok(mut w) => match w.watch(&home, RecursiveMode::NonRecursive) {
                    Ok(()) => {
                        tracing::info!(dir = %home.display(), "mesh-bearer watcher active");
                        Some(w)
                    }
                    Err(e) => {
                        tracing::error!(error = %e, dir = %home.display(),
                            "mesh-bearer watcher: watch() failed; relying on periodic re-read");
                        None
                    }
                },
                Err(e) => {
                    tracing::error!(error = %e,
                        "mesh-bearer watcher: init failed; relying on periodic re-read");
                    None
                }
            }
        };
        // Bind so the watcher (if any) is not dropped early.
        let _watcher = watcher;

        let mut interval = tokio::time::interval(Duration::from_secs(45));
        // First tick fires immediately — that performs the initial pickup for a
        // bridge that booted just after a join wrote mesh.env.
        loop {
            tokio::select! {
                _ = notify.notified() => {
                    // Debounce: coalesce a burst (write -> rename -> attrib)
                    // into a single re-read. 300ms is plenty for the atomic
                    // temp+rename publish.
                    tokio::time::sleep(Duration::from_millis(300)).await;
                    let do_read = {
                        let mut d = dirty.lock().unwrap();
                        let v = *d;
                        *d = false;
                        v
                    };
                    if do_read {
                        // Critic H-3 (WS-2): read_mesh_bearer now decrypts via
                        // DPAPI on Windows — an OS crypto syscall that can touch
                        // the user profile / master key. Run it off the async
                        // worker so a slow unlock can't stall this select! loop.
                        let home_r = home.clone();
                        let bearer = tokio::task::spawn_blocking(move || {
                            crate::install::token::read_mesh_bearer(&home_r)
                        })
                        .await
                        .ok()
                        .flatten();
                        auth_state.swap_peer_token(bearer);
                    }
                }
                _ = interval.tick() => {
                    // Unconditional backstop re-read. swap_peer_token no-ops on
                    // None/empty, so a missing mesh.env never clears a good
                    // bearer. spawn_blocking for the same DPAPI reason as above.
                    let home_r = home.clone();
                    let bearer = tokio::task::spawn_blocking(move || {
                        crate::install::token::read_mesh_bearer(&home_r)
                    })
                    .await
                    .ok()
                    .flatten();
                    auth_state.swap_peer_token(bearer);
                }
            }
        }
    });
}

/// Entry point invoked from `main.rs` for `musu bridge`.
pub async fn run() -> Result<()> {
    let cfg = BridgeConfig::from_env()?;
    let cfg = Arc::new(cfg);

    tracing::info!(
        bridge_host = %cfg.bridge_host,
        bridge_port = cfg.bridge_port,
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
        let planner_cancel = CancellationToken::new();
        let planner_ctrl_c = planner_cancel.clone();
        tokio::spawn(async move {
            if tokio::signal::ctrl_c().await.is_ok() {
                planner_ctrl_c.cancel();
            }
        });
        tokio::spawn(async move {
            crate::brain::planner::run_planner_loop(runner_clone, planner_cancel).await;
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

    // Hot-reload of the account-wide mesh bearer (~/.musu/mesh.env).
    //
    // A bridge started BEFORE `musu mesh join-account` writes mesh.env holds
    // peer_token = None and 401s every cross-machine sibling until manually
    // restarted (peer_token was read once at config load). join-account is a
    // separate process and cannot signal the running bridge, so a file watch is
    // the only channel. We mirror indexer::watch's notify pattern and ALSO run
    // a periodic re-read as the correctness backstop if the watcher backend
    // dies. Watcher init failure is logged and swallowed — local-token auth
    // still works, so it must never abort bridge boot.
    spawn_mesh_bearer_watcher(auth_state.clone());

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

    // Relay payload fallback target polling is ON by default (relay is the
    // standard cross-machine fallback); it is opt-OUT only via
    // MUSU_ENABLE_RELAY_PAYLOAD_POLLER. The poller's own capped idle backoff
    // keeps idle CPU low so the default desktop profile stays quiet.
    handlers::relay_payload::start_relay_payload_poller_if_enabled(state.clone());

    // Build the native router. All served endpoints are native Rust routes;
    // unmatched /api/* paths return 404 (the legacy Python sidecar reverse-proxy
    // facade was removed — it forwarded to 127.0.0.1:8071, a hidden Python
    // runtime dependency that violated the self-contained-product posture and
    // which the desktop cockpit never called).
    let native = handlers::native_router();

    let app = native
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

    // Bind to all interfaces when the host is the loopback default, so other
    // machines on the same LAN can reach this bridge directly (the address we
    // advertise to the cloud registry is the LAN IP — see
    // services::advertised_bridge_http_url). 0.0.0.0 still accepts loopback,
    // so single-machine use is unaffected. Every request is bearer-gated
    // (require_bearer), so opening the LAN interface does not weaken auth.
    // An explicit non-loopback BRIDGE_HOST is honored as-is.
    let bind_host = if cfg.bridge_host == "127.0.0.1" || cfg.bridge_host == "::1" {
        "0.0.0.0"
    } else {
        cfg.bridge_host.as_str()
    };
    let addr: SocketAddr = format!("{}:{}", bind_host, cfg.bridge_port)
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
        let cloud_base_url = crate::cloud::base_url_from_env();
        let cloud = crate::cloud::MusuCloud::new(&cloud_base_url, Some(token.clone()));
        let my_name = cfg.node_name.clone();
        let advertised_public_url = services::advertised_bridge_http_url(&cfg);
        let advertised_transport_scheme = reqwest::Url::parse(&advertised_public_url)
            .ok()
            .and_then(|url| match url.scheme() {
                "http" | "https" => Some(url.scheme().to_string()),
                _ => None,
            });
        let tls_cert_fingerprint =
            match crate::install::tls::ensure_tls_certs(&musu_home, &cfg.node_name)
                .and_then(|paths| crate::install::tls::cert_sha256_fingerprint(&paths.cert_path))
            {
                Ok(fingerprint) => Some(fingerprint),
                Err(err) => {
                    tracing::warn!(
                        err = %err,
                        "TLS identity fingerprint unavailable for cloud registration"
                    );
                    None
                }
            };
        let cloud_heartbeat_interval_secs = cloud_heartbeat_interval_secs_from_env();

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
        let registry_url = cloud_base_url.clone();
        let tls_cert_fingerprint_clone = tls_cert_fingerprint.clone();
        let advertised_transport_scheme_clone = advertised_transport_scheme.clone();
        let cloud_registration_cancel = CancellationToken::new();
        let cloud_registration_ctrl_c = cloud_registration_cancel.clone();
        tokio::spawn(async move {
            if tokio::signal::ctrl_c().await.is_ok() {
                cloud_registration_ctrl_c.cancel();
            }
        });

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
                if cloud_registration_cancel.is_cancelled() {
                    break;
                }

                let mut cycle_ok = true;

                if mdns_enabled {
                    // Discover LAN peers via mDNS first.
                    crate::peer::mdns::auto_register_peers_with_cancellation(
                        &musu_home_clone,
                        &my_name_clone,
                        &token_clone,
                        std::time::Duration::from_secs(5),
                        cloud_registration_cancel.clone(),
                    )
                    .await;
                    if cloud_registration_cancel.is_cancelled() {
                        break;
                    }
                }

                let tailscale_ip = crate::peer::tailscale::get_tailscale_ip();
                let mesh_status =
                    crate::install::private_mesh::build_status_report(&musu_home_clone);
                let hardware = crate::peer::hardware::gather_hardware_info_cached();
                let mut meta_obj = serde_json::json!({
                    "hardware": hardware,
                    "public_url": advertised_public_url,
                    "mesh_mode": mesh_status.mode.clone(),
                    "route_label": mesh_status.route_label.clone(),
                    "control_server_url": mesh_status.control_server_url.clone(),
                    "control_server_verified": mesh_status.control_server_verified,
                });
                if let Some(scheme) = advertised_transport_scheme_clone.as_ref() {
                    meta_obj["transport_scheme"] = serde_json::json!(scheme);
                }
                if let Some(ip) = tailscale_ip
                    .as_ref()
                    .or(mesh_status.local_tailnet_ip.as_ref())
                {
                    meta_obj["tailscale_ip"] = serde_json::json!(ip);
                }
                if let Some(fingerprint) = tls_cert_fingerprint_clone.as_ref() {
                    meta_obj["cert_fingerprint"] = serde_json::json!(fingerprint);
                    meta_obj["peer_public_key"] = serde_json::json!(fingerprint);
                }
                let meta = Some(meta_obj);

                let req = crate::cloud::RegisterNodeRequest {
                    node_name: my_name.clone(),
                    public_url: advertised_public_url.clone(),
                    cert_fingerprint: tls_cert_fingerprint_clone.clone(),
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
                                    let mut node_meta =
                                        node.meta.clone().unwrap_or_else(|| serde_json::json!({}));
                                    node_meta["public_url"] = serde_json::json!(node.public_url);
                                    if let Ok(url) = reqwest::Url::parse(&node.public_url) {
                                        if matches!(url.scheme(), "http" | "https") {
                                            node_meta["transport_scheme"] =
                                                serde_json::json!(url.scheme());
                                        }
                                    }
                                    if let Some(fingerprint) = node.cert_fingerprint.as_ref() {
                                        node_meta["cert_fingerprint"] =
                                            serde_json::json!(fingerprint);
                                        node_meta["peer_public_key"] =
                                            serde_json::json!(fingerprint);
                                    }

                                    // Smart Fallback: If local machine has Tailscale AND remote peer has Tailscale IP,
                                    // prioritize routing over Tailscale.
                                    if let Some(ip) =
                                        node_meta.get("tailscale_ip").and_then(|v| v.as_str())
                                    {
                                        if tailscale_ip.is_some() {
                                            peer_addr =
                                                replace_public_url_host(&node.public_url, ip)
                                                    .unwrap_or_else(|| peer_addr.clone());
                                            tracing::debug!(peer = %node.node_name, ip = %ip, "Upgrading peer routing to Tailscale IP");
                                        }
                                    }

                                    cached_nodes.push(crate::peer::discovery::CachedNode {
                                        node_id: node.node_name.clone(), // using name as id
                                        name: node.node_name.clone(),
                                        addr: peer_addr.clone(),
                                        capabilities: vec![],
                                        last_heartbeat: Some(chrono::Utc::now()),
                                        meta: Some(node_meta),
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
                                registry_url: registry_url.clone(),
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
                let jitter_ms = chrono::Utc::now().timestamp_millis().rem_euclid(1_000) as u64;
                let sleep_for = cloud_registration_sleep_duration(
                    cloud_heartbeat_interval_secs,
                    consecutive_failures,
                    jitter_ms,
                );
                tracing::debug!(
                    cycle_ok,
                    consecutive_failures,
                    sleep_ms = sleep_for.as_millis(),
                    "musu.pro cloud registration loop sleeping"
                );
                tokio::select! {
                    _ = cloud_registration_cancel.cancelled() => break,
                    _ = tokio::time::sleep(sleep_for) => {}
                }
            }

            tracing::info!("musu.pro cloud registration loop stopped");
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

    #[test]
    fn cloud_heartbeat_interval_defaults_and_floors() {
        assert_eq!(
            normalize_cloud_heartbeat_interval_sec(None),
            CLOUD_HEARTBEAT_DEFAULT_INTERVAL_SEC
        );
        assert_eq!(
            normalize_cloud_heartbeat_interval_sec(Some("0")),
            CLOUD_HEARTBEAT_MIN_INTERVAL_SEC
        );
        assert_eq!(
            normalize_cloud_heartbeat_interval_sec(Some("59")),
            CLOUD_HEARTBEAT_MIN_INTERVAL_SEC
        );
        assert_eq!(normalize_cloud_heartbeat_interval_sec(Some("90")), 90);
    }

    #[test]
    fn cloud_registration_sleep_uses_capped_backoff_and_jitter() {
        assert_eq!(
            cloud_registration_sleep_duration(60, 0, 250),
            Duration::from_millis(60_250)
        );
        assert_eq!(
            cloud_registration_sleep_duration(60, 2, 0),
            Duration::from_secs(240)
        );
        assert_eq!(
            cloud_registration_sleep_duration(60, 8, 999),
            Duration::from_millis(960_999)
        );
    }
}
