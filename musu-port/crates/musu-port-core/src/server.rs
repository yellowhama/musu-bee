use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use axum::body::{to_bytes, Body};
use axum::extract::ws::{Message as AxumWsMessage, WebSocket, WebSocketUpgrade};
use axum::extract::{OriginalUri, Path, Query, State as AxumState};
use axum::http::header::HeaderName;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
use tracing::warn;

use crate::channel_hub::ChannelHub;
use crate::config::MusuPortConfig;
use crate::control::AuditPolicy;
use crate::discovery::selected_discovery_provider;
use crate::l4::L4Runtime;
use crate::metrics::{PortManagerMetrics, PortManagerMetricsSnapshot};
use crate::platform::{
    device_profile_validation_action, display_path_for_runtime, resolve_executable_contract,
    resolve_physical_host_id, summarize_device_profile,
};
use crate::mesh_routes::{service_route_to_advertised, AdvertisedRoute, ImportedPeerRoutes};
use crate::route::{new_extra_routes, SeedRouteSource, ServiceRoute};
use crate::state::{
    unix_now_ms, unix_now_secs, HandoffRoutingDecision, MusuPortState, PeerSnapshot,
};
use crate::storage::Persistence;
use crate::telemetry::read_runtime_telemetry;

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    router_base_url: String,
    route_count: usize,
    runtime_context: String,
    filesystem_context: String,
    binary_kind: String,
    device_id: String,
    boss_device_id: Option<String>,
    /// Physical host UUID shared by all musu-portd instances on the same machine
    /// (e.g., WSL + Windows-native on the same PC). Used for device grouping.
    physical_host_id: Option<String>,
    device_profile_path: String,
    device_profile_present: bool,
    device_profile_loaded: bool,
    device_profile_matches_device_id: bool,
    device_profile_service_templates: usize,
    device_profile_mcp_templates: usize,
    device_profile_guidance_hints: usize,
    device_profile_validation_action: String,
    device_profile_warning_count: usize,
    device_profile_error_count: usize,
    device_profile_valid: bool,
    discovery_provider: String,
    data_root: String,
    preferred_executable_kind: Option<String>,
    preferred_executable_path: Option<String>,
    executable_candidates: Vec<String>,
    windows_interop_launcher: Option<String>,
    cpu_pct: f32,
    ram_used: u64,
    ram_total: u64,
    gpu_util: Option<f32>,
    gpu_mem_used: Option<u64>,
    gpu_mem_total: Option<u64>,
    queue_depth: usize,
}

#[derive(Debug, Deserialize)]
struct PromoteRequest {
    signature: String,
    alias: Option<String>,
    protocol: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SignatureRequest {
    signature: String,
}

#[derive(Debug, Deserialize)]
struct AuditPresetRequest {
    preset: String,
}

#[derive(Debug, Deserialize)]
struct ConnectModeRequest {
    mode: String,
}

#[derive(Debug, Deserialize)]
struct ConnectStableProbeRequest {
    sample_count: Option<usize>,
    interval_ms: Option<u64>,
    persist_report: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct HandoffRouteRequest {
    ingress_host: String,
    resource_requirement: String,
    metrics_max_age_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
struct HandoffLatestResponse {
    available: bool,
    recorded_at_ms: Option<u64>,
    decision: Option<HandoffRoutingDecision>,
}

#[derive(Debug, Deserialize, Default)]
struct ConnectDeniedQuery {
    drain: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct MetadataExportRequest {
    format: String,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BossConnectRequest {
    device_id: String,
}

#[derive(Debug, Serialize)]
struct BossStatusResponse {
    boss_device_id: Option<String>,
    is_this_device: bool,
}

/// Minimal subset of a peer's `/health` response that we care about.
#[derive(Debug, Deserialize)]
struct PeerHealthResponse {
    device_id: Option<String>,
    route_count: Option<usize>,
}

pub async fn run_server(config: MusuPortConfig) -> Result<(), String> {
    let profile_summary =
        summarize_device_profile(config.device_profile.as_ref(), &config.device_id);
    if config.device_profile.is_some()
        && profile_summary.error_count > 0
        && device_profile_validation_action(config.device_profile.as_ref()) == "fail"
    {
        return Err(format!(
            "device profile '{}' is invalid: {} validation error(s), action=fail",
            config.device_profile_path.display(),
            profile_summary.error_count
        ));
    }

    let seed_routes = if let Some(path) = config.seed_services_path.as_ref() {
        Arc::new(SeedRouteSource::from_path(path)?)
    } else {
        Arc::new(SeedRouteSource::empty())
    };
    let persistence = Arc::new(Persistence::new(config.state_db_path.clone())?);
    let extra_routes = new_extra_routes();
    {
        let mut extra = extra_routes.write().await;
        *extra = persistence.load_promoted_routes()?;
    }
    let ignored_signatures = Arc::new(tokio::sync::RwLock::new(
        persistence.load_ignored_signatures()?,
    ));

    let listener = bind_listener(&config).await?;
    let local_addr = listener.local_addr().map_err(|err| err.to_string())?;
    let router_base_url = format!("http://{}:{}", local_addr.ip(), local_addr.port());
    std::env::set_var("MUSU_PORT_MANAGER_BASE_URL", &router_base_url);

    let state = MusuPortState {
        seed_routes,
        extra_routes,
        ignored_signatures,
        l4_runtime: Arc::new(tokio::sync::Mutex::new(L4Runtime::new())),
        persistence,
        metrics: Arc::new(PortManagerMetrics::default()),
        http_client: reqwest::Client::new(),
        router_base_url,
        runtime_context: config.runtime_context.clone(),
        device_id: config.device_id.clone(),
        device_profile_path: config.device_profile_path.clone(),
        device_profile: config.device_profile.clone(),
        data_root: config.data_root.clone(),
        channel_hub: Arc::new(ChannelHub::new()),
        current_boss: Arc::new(tokio::sync::RwLock::new(None)),
        peer_urls: config.peer_urls.clone(),
        peer_health_cache: Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
        last_handoff_snapshot: Arc::new(tokio::sync::RwLock::new(None)),
        bridge_url: std::env::var("MUSU_BRIDGE_URL")
            .unwrap_or_else(|_| "http://localhost:8070".to_string()),
        imported_routes: Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
        auth_token: config.auth_token.clone(),
    };
    state.initialize_connect_mode()?;
    state.auto_promote_mcp_candidates().await?;

    let reconcile_state = state.clone();
    tokio::spawn(async move {
        let mut iteration = 0u64;
        loop {
            if let Err(err) = reconcile_state.auto_promote_mcp_candidates().await {
                tracing::warn!(error = %err, "failed to auto-promote mcp candidates");
            }
            let routes = reconcile_state.collect_routes().await;
            let mut runtime = reconcile_state.l4_runtime.lock().await;
            runtime.reconcile_routes(&routes).await;
            runtime.health_check();
            drop(runtime);

            if iteration % 15 == 14 {
                if let Err(err) = reconcile_state.evict_dead_extra_routes().await {
                    tracing::warn!(error = %err, "failed to evict dead promoted routes");
                }
            }
            iteration = iteration.wrapping_add(1);
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });

    if !state.peer_urls.is_empty() {
        let probe_state = state.clone();
        tokio::spawn(async move {
            loop {
                for url in &probe_state.peer_urls {
                    let health_url = format!("{}/health", url.trim_end_matches('/'));
                    let result = probe_state
                        .http_client
                        .get(&health_url)
                        .timeout(Duration::from_secs(2))
                        .send()
                        .await;

                    let snapshot = match result {
                        Ok(resp) if resp.status().is_success() => {
                            let peer: Option<PeerHealthResponse> = resp.json().await.ok();
                            PeerSnapshot {
                                url: url.clone(),
                                device_id: peer.as_ref().and_then(|p| p.device_id.clone()),
                                status: "ok".to_string(),
                                route_count: peer.as_ref().and_then(|p| p.route_count),
                                last_ok_ms: Some(unix_now_ms()),
                                last_ok_secs: Some(unix_now_secs()),
                            }
                        }
                        Ok(_) => {
                            tracing::warn!(peer_url = %url, "peer returned non-success status");
                            let (prev_ok_ms, prev_ok_secs) = {
                                let cache = probe_state.peer_health_cache.read().await;
                                (
                                    cache.get(url).and_then(|s| s.last_ok_ms),
                                    cache.get(url).and_then(|s| s.last_ok_secs),
                                )
                            };
                            PeerSnapshot {
                                url: url.clone(),
                                device_id: None,
                                status: "error".to_string(),
                                route_count: None,
                                last_ok_ms: prev_ok_ms,
                                last_ok_secs: prev_ok_secs,
                            }
                        }
                        Err(_) => {
                            tracing::debug!(peer_url = %url, "peer unreachable");
                            let (prev_ok_ms, prev_ok_secs) = {
                                let cache = probe_state.peer_health_cache.read().await;
                                (
                                    cache.get(url).and_then(|s| s.last_ok_ms),
                                    cache.get(url).and_then(|s| s.last_ok_secs),
                                )
                            };
                            PeerSnapshot {
                                url: url.clone(),
                                device_id: None,
                                status: "unreachable".to_string(),
                                route_count: None,
                                last_ok_ms: prev_ok_ms,
                                last_ok_secs: prev_ok_secs,
                            }
                        }
                    };

                    let is_ok = snapshot.status == "ok";
                    let peer_device_id = snapshot.device_id.clone();
                    probe_state
                        .peer_health_cache
                        .write()
                        .await
                        .insert(url.clone(), snapshot);

                    // Also fetch advertised routes from healthy peers
                    if is_ok {
                        let routes_url = format!(
                            "{}/advertised-routes",
                            url.trim_end_matches('/')
                        );
                        if let Ok(resp) = probe_state
                            .http_client
                            .get(&routes_url)
                            .timeout(Duration::from_secs(3))
                            .send()
                            .await
                        {
                            if resp.status().is_success() {
                                if let Ok(routes) =
                                    resp.json::<Vec<AdvertisedRoute>>().await
                                {
                                    // DoS guard: ignore suspiciously large payloads
                                    if routes.len() <= 1000 {
                                        probe_state
                                            .imported_routes
                                            .write()
                                            .await
                                            .insert(
                                                url.clone(),
                                                ImportedPeerRoutes {
                                                    peer_url: url.clone(),
                                                    peer_device_id,
                                                    routes,
                                                    fetched_at: unix_now_secs(),
                                                },
                                            );
                                    } else {
                                        tracing::warn!(
                                            peer_url = %url,
                                            count = routes.len(),
                                            "advertised-routes response too large, ignoring"
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });
    }

    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/peers", get(handle_peers))
        .route("/routes", get(handle_routes))
        .route("/advertised-routes", get(handle_advertised_routes))
        .route("/mesh-routes", get(handle_mesh_routes))
        .route("/coverage", get(handle_coverage))
        .route("/discovery", get(handle_discovery))
        .route("/audit/events", get(handle_audit_events))
        .route("/audit/connect-denied", get(handle_connect_denied))
        .route(
            "/audit/policy",
            get(handle_get_audit_policy).post(handle_set_audit_policy),
        )
        .route(
            "/audit/policy/preset",
            post(handle_apply_audit_policy_preset),
        )
        .route("/audit/summary", get(handle_audit_summary))
        .route("/l4/runners", get(handle_l4_runners))
        .route(
            "/connect/mode",
            get(handle_get_connect_mode).post(handle_set_connect_mode),
        )
        .route("/connect/status", get(handle_connect_status))
        .route(
            "/connect/stable-probe",
            post(handle_run_connect_stable_probe),
        )
        .route(
            "/connect/stable-probe/history",
            get(handle_connect_probe_history),
        )
        .route("/connect/{service}", get(handle_connect_ingress))
        .route("/handoff/route", post(handle_handoff_route))
        .route("/handoff/latest", get(handle_handoff_latest))
        .route("/quic/probe/summary", get(handle_quic_probe_summary))
        .route("/metadata/report", get(handle_metadata_report))
        .route("/metadata/export", post(handle_metadata_export))
        .route(
            "/metadata/export/history",
            get(handle_metadata_export_history),
        )
        .route("/promote", post(handle_promote))
        .route("/ignore", post(handle_ignore))
        .route("/unignore", post(handle_unignore))
        .route("/status", get(handle_device_status))
        .route("/boss", get(handle_boss_status))
        .route("/boss/connect", post(handle_boss_connect))
        .route("/metrics", get(handle_metrics))
        .route("/metrics/json", get(handle_metrics_json))
        .route("/chat/ws/{channel}", get(handle_chat_ws))
        .route("/ws/{service}", get(handle_alias_ws))
        .route("/ws/{service}/{*rest}", get(handle_alias_with_path_ws))
        .route(
            "/channel/{name}",
            get(handle_channel_ws).post(handle_channel_broadcast),
        )
        .route("/chat", post(handle_chat))
        .route("/{service}", any(handle_alias_http))
        .route("/{service}/{*rest}", any(handle_alias_with_path_http))
        .with_state(state.clone());

    tracing::info!(router_base_url = %state.router_base_url, "musu-port server started");
    axum::serve(listener, app)
        .await
        .map_err(|err| format!("server exited with error: {err}"))
}

async fn handle_health(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    let route_count = state.collect_routes().await.len();
    let executable_contract = resolve_executable_contract(&state.runtime_context, "musu-portd");
    let device_profile = state.device_profile_summary();
    let boss_device_id = state.current_boss.read().await.clone();
    let physical_host_id = resolve_physical_host_id();
    let telemetry = read_runtime_telemetry();
    let queue_depth = state.channel_hub.queue_depth();
    Json(HealthResponse {
        status: "ok",
        router_base_url: state.router_base_url,
        route_count,
        runtime_context: state.runtime_context.label().to_string(),
        filesystem_context: state.runtime_context.filesystem_label().to_string(),
        binary_kind: state.runtime_context.binary_kind.label().to_string(),
        device_id: state.device_id.clone(),
        boss_device_id,
        physical_host_id,
        device_profile_path: display_path_for_runtime(
            &state.device_profile_path,
            &state.runtime_context,
        ),
        device_profile_present: state.device_profile_path.exists(),
        device_profile_loaded: device_profile.loaded,
        device_profile_matches_device_id: device_profile.matches_device_id,
        device_profile_service_templates: device_profile.service_template_count,
        device_profile_mcp_templates: device_profile.mcp_template_count,
        device_profile_guidance_hints: device_profile.guidance_hint_count,
        device_profile_validation_action: device_profile.validation_action,
        device_profile_warning_count: device_profile.warning_count,
        device_profile_error_count: device_profile.error_count,
        device_profile_valid: device_profile.valid,
        discovery_provider: selected_discovery_provider(&state.runtime_context)
            .label()
            .to_string(),
        data_root: display_path_for_runtime(&state.data_root, &state.runtime_context),
        preferred_executable_kind: executable_contract
            .preferred
            .as_ref()
            .map(|resolved| resolved.kind.label().to_string()),
        preferred_executable_path: executable_contract
            .preferred
            .as_ref()
            .map(|resolved| display_path_for_runtime(&resolved.path, &state.runtime_context)),
        executable_candidates: executable_contract
            .candidates
            .iter()
            .map(|candidate| {
                format!(
                    "{}:{}",
                    candidate.kind.label(),
                    display_path_for_runtime(&candidate.path, &state.runtime_context)
                )
            })
            .collect(),
        windows_interop_launcher: executable_contract
            .interop_launcher
            .as_ref()
            .map(|path| display_path_for_runtime(path, &state.runtime_context)),
        cpu_pct: telemetry.cpu_pct,
        ram_used: telemetry.ram_used,
        ram_total: telemetry.ram_total,
        gpu_util: telemetry.gpu_util,
        gpu_mem_used: telemetry.gpu_mem_used,
        gpu_mem_total: telemetry.gpu_mem_total,
        queue_depth,
    })
}

async fn handle_peers(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    let mut peers: Vec<PeerSnapshot> = state
        .peer_health_cache
        .read()
        .await
        .values()
        .cloned()
        .collect();
    peers.sort_by(|a, b| a.url.cmp(&b.url));
    Json(peers)
}

async fn handle_routes(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    Json(state.collect_routes().await)
}

/// GET /advertised-routes — local enabled services in AdvertisedRoute format for peers.
async fn handle_advertised_routes(
    AxumState(state): AxumState<MusuPortState>,
) -> impl IntoResponse {
    let routes = state.collect_routes().await;
    let advertised: Vec<AdvertisedRoute> = routes
        .iter()
        .filter(|r| r.enabled)
        .map(|r| service_route_to_advertised(r, &state.device_id))
        .collect();
    Json(advertised)
}

/// GET /mesh-routes — unified view: local routes + routes imported from all peers.
async fn handle_mesh_routes(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    let local = state.collect_routes().await;
    let imported: Vec<ImportedPeerRoutes> = state
        .imported_routes
        .read()
        .await
        .values()
        .cloned()
        .collect();
    Json(serde_json::json!({
        "local": local,
        "imported": imported,
    }))
}

async fn handle_coverage(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    match state.coverage_report().await {
        Ok(report) => Json(report).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_discovery(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    match state.discover_endpoints().await {
        Ok(result) => Json(result).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_l4_runners(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    Json(state.l4_status().await)
}

async fn handle_audit_events(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    match state.audit_events() {
        Ok(events) => Json(events).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_connect_denied(
    AxumState(state): AxumState<MusuPortState>,
    Query(query): Query<ConnectDeniedQuery>,
) -> Response<Body> {
    match state.connect_denied_events(query.drain.unwrap_or(false)) {
        Ok(events) => Json(events).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_get_audit_policy(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    match state.audit_policy() {
        Ok(policy) => Json(policy).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_set_audit_policy(
    AxumState(state): AxumState<MusuPortState>,
    Json(policy): Json<AuditPolicy>,
) -> Response<Body> {
    match state.set_audit_policy(policy) {
        Ok(saved) => Json(saved).into_response(),
        Err(err) => (StatusCode::BAD_REQUEST, err).into_response(),
    }
}

async fn handle_apply_audit_policy_preset(
    AxumState(state): AxumState<MusuPortState>,
    Json(request): Json<AuditPresetRequest>,
) -> Response<Body> {
    match state.apply_audit_policy_preset(&request.preset) {
        Ok(policy) => Json(policy).into_response(),
        Err(err) => (StatusCode::BAD_REQUEST, err).into_response(),
    }
}

async fn handle_audit_summary(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    match state.audit_summary() {
        Ok(summary) => Json(summary).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_promote(
    AxumState(state): AxumState<MusuPortState>,
    Json(request): Json<PromoteRequest>,
) -> Response<Body> {
    match state
        .promote_endpoint(request.signature, request.alias, request.protocol)
        .await
    {
        Ok(result) => Json(result).into_response(),
        Err(err) => (StatusCode::BAD_REQUEST, err).into_response(),
    }
}

async fn handle_get_connect_mode(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    match state.connect_mode() {
        Ok(mode) => Json(mode).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_set_connect_mode(
    AxumState(state): AxumState<MusuPortState>,
    Json(request): Json<ConnectModeRequest>,
) -> Response<Body> {
    match state.set_connect_mode(request.mode).await {
        Ok(status) => Json(status).into_response(),
        Err(err) => (StatusCode::BAD_REQUEST, err).into_response(),
    }
}

async fn handle_connect_status(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    match state.connect_status().await {
        Ok(status) => Json(status).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_run_connect_stable_probe(
    AxumState(state): AxumState<MusuPortState>,
    Json(request): Json<ConnectStableProbeRequest>,
) -> Response<Body> {
    match state
        .run_connect_stable_probe(
            request.sample_count,
            request.interval_ms,
            request.persist_report,
        )
        .await
    {
        Ok(report) => Json(report).into_response(),
        Err(err) => (StatusCode::BAD_REQUEST, err).into_response(),
    }
}

async fn handle_connect_probe_history(
    AxumState(state): AxumState<MusuPortState>,
) -> Response<Body> {
    match state.connect_probe_history() {
        Ok(history) => Json(history).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_connect_ingress(
    AxumState(state): AxumState<MusuPortState>,
    Path(service): Path<String>,
) -> Response<Body> {
    match state.connect_ingress(&service).await {
        Ok(decision) if decision.allowed => Json(decision).into_response(),
        Ok(decision) => (StatusCode::FORBIDDEN, Json(decision)).into_response(),
        Err(err) => (StatusCode::NOT_FOUND, err).into_response(),
    }
}

async fn handle_handoff_route(
    AxumState(state): AxumState<MusuPortState>,
    Json(request): Json<HandoffRouteRequest>,
) -> Response<Body> {
    let metrics_max_age_ms = request.metrics_max_age_ms.unwrap_or(10_000);
    match state
        .resolve_handoff_route(
            request.ingress_host,
            request.resource_requirement,
            metrics_max_age_ms,
        )
        .await
    {
        Ok(decision) => Json(decision).into_response(),
        Err(err) => (StatusCode::BAD_REQUEST, err).into_response(),
    }
}

async fn handle_handoff_latest(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    let snapshot = state.latest_handoff_snapshot().await;
    match snapshot {
        Some(snapshot) => Json(HandoffLatestResponse {
            available: true,
            recorded_at_ms: Some(snapshot.recorded_at_ms),
            decision: Some(snapshot.decision),
        })
        .into_response(),
        None => Json(HandoffLatestResponse {
            available: false,
            recorded_at_ms: None,
            decision: None,
        })
        .into_response(),
    }
}

async fn handle_quic_probe_summary(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    Json(state.quic_probe_summary()).into_response()
}

async fn handle_metadata_report(AxumState(state): AxumState<MusuPortState>) -> Response<Body> {
    match state.metadata_report().await {
        Ok(report) => Json(report).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_metadata_export(
    AxumState(state): AxumState<MusuPortState>,
    Json(request): Json<MetadataExportRequest>,
) -> Response<Body> {
    match state
        .export_metadata_report(request.format, request.path)
        .await
    {
        Ok(result) => Json(result).into_response(),
        Err(err) => (StatusCode::BAD_REQUEST, err).into_response(),
    }
}

async fn handle_metadata_export_history(
    AxumState(state): AxumState<MusuPortState>,
) -> Response<Body> {
    match state.metadata_export_history() {
        Ok(history) => Json(history).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_ignore(
    AxumState(state): AxumState<MusuPortState>,
    Json(request): Json<SignatureRequest>,
) -> Response<Body> {
    match state.ignore_signature(request.signature).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_unignore(
    AxumState(state): AxumState<MusuPortState>,
    Json(request): Json<SignatureRequest>,
) -> Response<Body> {
    match state.unignore_signature(&request.signature).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

async fn handle_metrics(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4",
        )],
        state.metrics.to_prometheus(),
    )
}

async fn handle_metrics_json(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    Json(state.metrics.snapshot())
}

/// `GET /channel/{name}` — WebSocket fan-out subscriber.
///
/// Each connected client receives every message broadcast to this channel,
/// whether from another WS client or from `POST /channel/{name}`.
async fn handle_channel_ws(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<MusuPortState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        let mut rx = state.channel_hub.subscribe(&name);
        let (mut tx, mut client_rx) = socket.split();

        // Forward channel broadcasts to the client; also drain client messages
        // (clients may send messages but we don't fan them out — they use POST
        // for that, keeping the flow unidirectional per subscriber).
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Ok(text) => {
                            if tx.send(AxumWsMessage::Text(text.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => break, // sender dropped / lagged
                    }
                }
                next = client_rx.next() => {
                    match next {
                        Some(Ok(AxumWsMessage::Close(_))) | None => break,
                        _ => {} // ignore other client messages
                    }
                }
            }
        }

        drop(rx);
        state.channel_hub.gc(&name);
    })
}

/// `POST /channel/{name}` — HTTP broadcast to all WS subscribers of `name`.
///
/// Body: plain text. Returns 200 with the subscriber count.
async fn handle_channel_broadcast(
    AxumState(state): AxumState<MusuPortState>,
    Path(name): Path<String>,
    body: Body,
) -> impl IntoResponse {
    let bytes = match to_bytes(body, 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, "failed to read body".to_string()).into_response()
        }
    };
    let text = match String::from_utf8(bytes.to_vec()) {
        Ok(s) => s,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                "body must be valid UTF-8".to_string(),
            )
                .into_response()
        }
    };

    let count = state.channel_hub.broadcast(&name, text);
    (StatusCode::OK, format!("{count}")).into_response()
}

// ── Chat ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ChatRequest {
    message: String,
}

#[derive(Serialize)]
struct ChatResponse {
    text: String,
}

/// POST /chat — forward user message to Claude (파트장 AI) and return the response.
///
/// Requires `ANTHROPIC_API_KEY` to be set in the environment.
async fn handle_chat(
    AxumState(state): AxumState<MusuPortState>,
    Json(body): Json<ChatRequest>,
) -> impl IntoResponse {
    let api_key = match std::env::var("ANTHROPIC_API_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "ANTHROPIC_API_KEY not set"})),
            )
                .into_response()
        }
    };

    let system_prompt = format!(
        "당신은 {}의 파트장 AI입니다. 이 컴퓨터를 관리하고 사용자를 돕습니다. 한국어로 간결하게 답변하세요.",
        state.device_id
    );

    let request_body = serde_json::json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": [{"role": "user", "content": body.message}]
    });

    let result = state
        .http_client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request_body)
        .timeout(Duration::from_secs(30))
        .send()
        .await;

    match result {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = resp.json().await.unwrap_or_default();
            let text = data["content"][0]["text"]
                .as_str()
                .unwrap_or("응답을 받지 못했습니다.")
                .to_string();
            Json(ChatResponse { text }).into_response()
        }
        Ok(resp) => {
            let status = resp.status().as_u16();
            let err_body = resp.text().await.unwrap_or_default();
            (
                StatusCode::BAD_GATEWAY,
                Json(
                    serde_json::json!({"error": format!("Anthropic API {}: {}", status, err_body)}),
                ),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// `GET /chat/ws/{channel}` — Bidirectional WebSocket chat endpoint.
///
/// Clients send JSON messages (`ChatWsMessage`), which are broadcast to all
/// channel subscribers and routed to the mapped agent via musu-bridge.
/// Agent responses are broadcast back to all subscribers.
async fn handle_chat_ws(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<MusuPortState>,
    Path(channel): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    // Bearer token auth (only enforced when MUSU_PORT_TOKEN is set)
    if let Some(expected) = &state.auth_token {
        let authed = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(|t| t == expected.as_str())
            .unwrap_or(false);
        if !authed {
            return (StatusCode::UNAUTHORIZED, "WS auth required").into_response();
        }
    }
    // Validate channel name: alphanumeric, dash, underscore only
    if !channel
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
    {
        return (StatusCode::BAD_REQUEST, "Invalid channel name").into_response();
    }
    let channel_name = format!("chat:{channel}");
    ws.on_upgrade(move |socket| handle_chat_ws_connection(socket, state, channel, channel_name))
        .into_response()
}

async fn handle_chat_ws_connection(
    socket: WebSocket,
    state: MusuPortState,
    channel: String,
    channel_name: String,
) {
    let mut rx = state.channel_hub.subscribe(&channel_name);
    let (mut ws_tx, mut ws_rx) = socket.split();

    loop {
        tokio::select! {
            // Forward channel broadcasts to this client
            msg = rx.recv() => {
                match msg {
                    Ok(text) => {
                        if ws_tx.send(AxumWsMessage::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            // Handle client messages
            next = ws_rx.next() => {
                match next {
                    Some(Ok(AxumWsMessage::Text(text))) => {
                        let text = text.to_string();
                        // Reject oversized messages (64KB limit)
                        if text.len() > 65_536 {
                            tracing::warn!("chat_ws: message too large ({} bytes), dropping", text.len());
                            continue;
                        }
                        // Parse incoming JSON
                        let msg: serde_json::Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };

                        let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if msg_type != "user_message" {
                            continue;
                        }

                        let user_text = msg.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let sender_id = msg.get("sender_id").and_then(|v| v.as_str()).unwrap_or("anon").to_string();
                        let sender_name = msg.get("sender_name").and_then(|v| v.as_str()).unwrap_or("User").to_string();

                        if user_text.is_empty() {
                            continue;
                        }

                        let now = unix_now_secs();

                        // 1. Echo user message to all channel subscribers
                        let user_msg = serde_json::json!({
                            "type": "user_message",
                            "channel": channel,
                            "sender_id": sender_id,
                            "sender_name": sender_name,
                            "text": user_text,
                            "timestamp": now,
                        });
                        state.channel_hub.broadcast(&channel_name, user_msg.to_string());

                        // 2. Send typing indicator
                        let typing_msg = serde_json::json!({
                            "type": "typing",
                            "channel": channel,
                            "sender_id": format!("agent-{}", channel),
                            "sender_name": "",
                            "text": "",
                            "timestamp": now,
                        });
                        state.channel_hub.broadcast(&channel_name, typing_msg.to_string());

                        // 3. Route to musu-bridge (async, in background)
                        let bridge_url = state.bridge_url.clone();
                        let hub = state.channel_hub.clone();
                        let ch = channel.clone();
                        let ch_name = channel_name.clone();
                        let http = state.http_client.clone();
                        let sid = sender_id.clone();
                        let utext = user_text.clone();

                        tokio::spawn(async move {
                            let route_body = serde_json::json!({
                                "channel": ch,
                                "sender_id": sid,
                                "text": utext,
                            });

                            let result = http
                                .post(format!("{}/api/route", bridge_url))
                                .json(&route_body)
                                .timeout(Duration::from_secs(60))
                                .send()
                                .await;

                            let response_text = match result {
                                Ok(resp) if resp.status().is_success() => {
                                    let data: serde_json::Value = resp.json().await.unwrap_or_default();
                                    data.get("response")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("No response from agent.")
                                        .to_string()
                                }
                                Ok(resp) => {
                                    let status = resp.status().as_u16();
                                    format!("Bridge error (HTTP {})", status)
                                }
                                Err(e) => {
                                    tracing::warn!(error = %e, "chat_ws: bridge request failed");
                                    format!("Bridge unavailable: {}", e)
                                }
                            };

                            let agent_msg = serde_json::json!({
                                "type": "agent_response",
                                "channel": ch,
                                "sender_id": format!("agent-{}", ch),
                                "sender_name": ch,
                                "text": response_text,
                                "timestamp": unix_now_secs(),
                            });
                            hub.broadcast(&ch_name, agent_msg.to_string());
                        });
                    }
                    Some(Ok(AxumWsMessage::Close(_))) | None => break,
                    _ => {} // ignore binary/ping/pong
                }
            }
        }
    }

    drop(rx);
    state.channel_hub.gc(&channel_name);
}

async fn handle_alias_http(
    AxumState(state): AxumState<MusuPortState>,
    Path(service): Path<String>,
    OriginalUri(uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Body,
) -> Response<Body> {
    proxy_alias_http_request(state, method, headers, service, None, uri, body).await
}

async fn handle_alias_with_path_http(
    AxumState(state): AxumState<MusuPortState>,
    Path((service, rest)): Path<(String, String)>,
    OriginalUri(uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Body,
) -> Response<Body> {
    proxy_alias_http_request(state, method, headers, service, Some(rest), uri, body).await
}

async fn handle_alias_ws(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<MusuPortState>,
    Path(service): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> impl IntoResponse {
    proxy_alias_ws_request(state, ws, service, None, uri).await
}

async fn handle_alias_with_path_ws(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<MusuPortState>,
    Path((service, rest)): Path<(String, String)>,
    OriginalUri(uri): OriginalUri,
) -> impl IntoResponse {
    proxy_alias_ws_request(state, ws, service, Some(rest), uri).await
}

async fn proxy_alias_http_request(
    state: MusuPortState,
    method: Method,
    headers: HeaderMap,
    service: String,
    rest_path: Option<String>,
    original_uri: axum::http::Uri,
    body: Body,
) -> Response<Body> {
    let route = match state.resolve_route(&service).await {
        Ok(route) => route,
        Err(resp) => return resp,
    };

    let protocol = route.protocol.to_ascii_lowercase();
    if protocol == "tcp" || protocol == "quic" {
        let endpoint = if route.entrypoint_url.is_empty() {
            "(unknown)".to_string()
        } else {
            route.entrypoint_url.clone()
        };
        return (
            StatusCode::BAD_REQUEST,
            format!("alias '{service}' uses {protocol} ingress; connect via {endpoint}"),
        )
            .into_response();
    }

    let target = match build_target_url(&route, rest_path.as_deref(), original_uri.query()) {
        Ok(target) => target,
        Err(resp) => return resp,
    };

    proxy_http(state, method, headers, body, target).await
}

async fn proxy_alias_ws_request(
    state: MusuPortState,
    ws: WebSocketUpgrade,
    service: String,
    rest_path: Option<String>,
    original_uri: axum::http::Uri,
) -> Response<Body> {
    state
        .metrics
        .ws_connections_total
        .fetch_add(1, Ordering::Relaxed);

    let route = match state.resolve_route(&service).await {
        Ok(route) => route,
        Err(resp) => return resp,
    };

    let target = match build_target_url(&route, rest_path.as_deref(), original_uri.query()) {
        Ok(target) => target,
        Err(resp) => return resp,
    };

    proxy_websocket(ws, target, Arc::clone(&state.metrics)).await
}

fn build_target_url(
    route: &ServiceRoute,
    rest_path: Option<&str>,
    query: Option<&str>,
) -> Result<String, Response<Body>> {
    let Some(mut target) = route.target_url.clone() else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            format!("service has no target url: {}", route.name),
        )
            .into_response());
    };

    if let Some(rest) = rest_path.filter(|path| !path.is_empty()) {
        target.push('/');
        target.push_str(rest);
    }

    if let Some(query) = query {
        target.push('?');
        target.push_str(query);
    }

    Ok(target)
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn should_retry_http_method(method: &Method) -> bool {
    matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

fn max_http_attempts(method: &Method) -> usize {
    if !should_retry_http_method(method) {
        return 1;
    }
    let retries = env_u64("MUSU_PORT_MANAGER_HTTP_RETRY_COUNT", 2).min(5);
    1usize.saturating_add(retries as usize)
}

fn should_retry_upstream_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::BAD_GATEWAY | StatusCode::SERVICE_UNAVAILABLE | StatusCode::GATEWAY_TIMEOUT
    )
}

fn retry_backoff_delay(retry_index: usize) -> Duration {
    let base_ms = env_u64("MUSU_PORT_MANAGER_HTTP_RETRY_BASE_MS", 80).min(5_000);
    let jitter_ms = env_u64("MUSU_PORT_MANAGER_HTTP_RETRY_JITTER_MS", 25).min(500);
    let exp = 1u64 << retry_index.saturating_sub(1).min(6);
    let mut delay_ms = base_ms.saturating_mul(exp).min(2_000);
    if jitter_ms > 0 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.subsec_nanos() as u64)
            .unwrap_or(0);
        delay_ms = delay_ms.saturating_add(nanos % (jitter_ms + 1));
    }
    Duration::from_millis(delay_ms)
}

async fn proxy_http(
    state: MusuPortState,
    method: Method,
    headers: HeaderMap,
    body: Body,
    target_url: String,
) -> Response<Body> {
    state
        .metrics
        .http_requests_total
        .fetch_add(1, Ordering::Relaxed);

    let body = match to_bytes(body, 10 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(err) => {
            state
                .metrics
                .http_errors_total
                .fetch_add(1, Ordering::Relaxed);
            return (
                StatusCode::BAD_REQUEST,
                format!("failed to read request body: {err}"),
            )
                .into_response();
        }
    };

    let forwarded_headers = headers
        .iter()
        .filter_map(|(name, value)| {
            if should_forward_request_header(name) {
                Some((name.clone(), value.clone()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    let max_attempts = max_http_attempts(&method);
    let mut last_error: Option<String> = None;

    for attempt in 1..=max_attempts {
        let mut request = state
            .http_client
            .request(method.clone(), &target_url)
            .body(body.clone());
        for (name, value) in &forwarded_headers {
            request = request.header(name, value);
        }

        match request.send().await {
            Ok(upstream) => {
                let status = upstream.status();
                if attempt < max_attempts
                    && should_retry_http_method(&method)
                    && should_retry_upstream_status(status)
                {
                    state
                        .metrics
                        .http_retry_total
                        .fetch_add(1, Ordering::Relaxed);
                    last_error = Some(format!("upstream responded with transient status {status}"));
                    tokio::time::sleep(retry_backoff_delay(attempt)).await;
                    continue;
                }

                if attempt > 1 && !should_retry_upstream_status(status) {
                    state
                        .metrics
                        .http_retry_success_total
                        .fetch_add(1, Ordering::Relaxed);
                }

                let upstream_headers = upstream.headers().clone();
                let upstream_body = match upstream.bytes().await {
                    Ok(bytes) => bytes,
                    Err(err) => {
                        state
                            .metrics
                            .http_errors_total
                            .fetch_add(1, Ordering::Relaxed);
                        return (
                            StatusCode::BAD_GATEWAY,
                            format!("proxy response read failed: {target_url} ({err})"),
                        )
                            .into_response();
                    }
                };

                state
                    .metrics
                    .http_bytes_sent
                    .fetch_add(upstream_body.len() as u64, Ordering::Relaxed);

                let mut builder = Response::builder().status(status);
                for (name, value) in &upstream_headers {
                    if should_forward_response_header(name) {
                        builder = builder.header(name, value);
                    }
                }

                return builder
                    .body(Body::from(upstream_body))
                    .unwrap_or_else(|err| {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            format!("failed to build proxy response: {err}"),
                        )
                            .into_response()
                    });
            }
            Err(err) => {
                last_error = Some(err.to_string());
                if attempt < max_attempts {
                    state
                        .metrics
                        .http_retry_total
                        .fetch_add(1, Ordering::Relaxed);
                    tokio::time::sleep(retry_backoff_delay(attempt)).await;
                    continue;
                }
            }
        }
    }

    state
        .metrics
        .http_errors_total
        .fetch_add(1, Ordering::Relaxed);
    (
        StatusCode::BAD_GATEWAY,
        format!(
            "proxy request failed: {target_url} ({})",
            last_error.unwrap_or_else(|| "unknown upstream error".to_string())
        ),
    )
        .into_response()
}

async fn proxy_websocket(
    ws: WebSocketUpgrade,
    target_url: String,
    metrics: Arc<PortManagerMetrics>,
) -> Response<Body> {
    let target_ws = target_url
        .strip_prefix("http://")
        .map(|rest| format!("ws://{rest}"))
        .or_else(|| {
            target_url
                .strip_prefix("https://")
                .map(|rest| format!("wss://{rest}"))
        })
        .unwrap_or_else(|| target_url.clone());

    ws.on_upgrade(move |socket| async move {
        if let Err(err) = bridge_websocket(socket, &target_ws, Arc::clone(&metrics)).await {
            warn!(error = %err, target = %target_ws, "websocket bridge failed");
        }
    })
    .into_response()
}

async fn bridge_websocket(
    client_socket: WebSocket,
    target_ws: &str,
    metrics: Arc<PortManagerMetrics>,
) -> Result<(), String> {
    let (upstream_socket, _) = tokio_tungstenite::connect_async(target_ws)
        .await
        .map_err(|err| format!("failed to connect upstream websocket: {err}"))?;

    let (mut client_tx, mut client_rx) = client_socket.split();
    let (mut upstream_tx, mut upstream_rx) = upstream_socket.split();

    let client_to_upstream = async {
        while let Some(next) = client_rx.next().await {
            let message = next.map_err(|err| format!("client websocket receive failed: {err}"))?;
            if let Some(proxy_msg) = map_client_to_upstream(message) {
                metrics
                    .ws_messages_forwarded
                    .fetch_add(1, Ordering::Relaxed);
                upstream_tx
                    .send(proxy_msg)
                    .await
                    .map_err(|err| format!("upstream websocket send failed: {err}"))?;
            }
        }
        upstream_tx
            .close()
            .await
            .map_err(|err| format!("upstream websocket close failed: {err}"))?;
        Ok::<(), String>(())
    };

    let upstream_to_client = async {
        while let Some(next) = upstream_rx.next().await {
            let message =
                next.map_err(|err| format!("upstream websocket receive failed: {err}"))?;
            if let Some(proxy_msg) = map_upstream_to_client(message) {
                metrics
                    .ws_messages_forwarded
                    .fetch_add(1, Ordering::Relaxed);
                client_tx
                    .send(proxy_msg)
                    .await
                    .map_err(|err| format!("client websocket send failed: {err}"))?;
            }
        }
        client_tx
            .close()
            .await
            .map_err(|err| format!("client websocket close failed: {err}"))?;
        Ok::<(), String>(())
    };

    tokio::select! {
        result = client_to_upstream => result?,
        result = upstream_to_client => result?,
    }

    Ok(())
}

fn map_client_to_upstream(message: AxumWsMessage) -> Option<TungsteniteMessage> {
    match message {
        AxumWsMessage::Text(text) => Some(TungsteniteMessage::Text(text.to_string().into())),
        AxumWsMessage::Binary(bytes) => Some(TungsteniteMessage::Binary(bytes)),
        AxumWsMessage::Ping(bytes) => Some(TungsteniteMessage::Ping(bytes)),
        AxumWsMessage::Pong(bytes) => Some(TungsteniteMessage::Pong(bytes)),
        AxumWsMessage::Close(_) => Some(TungsteniteMessage::Close(None)),
    }
}

fn map_upstream_to_client(message: TungsteniteMessage) -> Option<AxumWsMessage> {
    match message {
        TungsteniteMessage::Text(text) => Some(AxumWsMessage::Text(text.to_string().into())),
        TungsteniteMessage::Binary(bytes) => Some(AxumWsMessage::Binary(bytes)),
        TungsteniteMessage::Ping(bytes) => Some(AxumWsMessage::Ping(bytes)),
        TungsteniteMessage::Pong(bytes) => Some(AxumWsMessage::Pong(bytes)),
        TungsteniteMessage::Close(_) => Some(AxumWsMessage::Close(None)),
        TungsteniteMessage::Frame(_) => None,
    }
}

fn should_forward_request_header(name: &HeaderName) -> bool {
    let lower = name.as_str().to_ascii_lowercase();
    !matches!(
        lower.as_str(),
        "host"
            | "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

fn should_forward_response_header(name: &HeaderName) -> bool {
    should_forward_request_header(name)
}

async fn bind_listener(config: &MusuPortConfig) -> Result<tokio::net::TcpListener, String> {
    let preferred_addr = std::net::SocketAddr::new(config.host, config.preferred_port);
    match tokio::net::TcpListener::bind(preferred_addr).await {
        Ok(listener) => Ok(listener),
        Err(err) => {
            if !config.allow_port_fallback {
                return Err(format!(
                    "port manager bind failed on {preferred_addr}: {err} (fallback disabled)"
                ));
            }

            let fallback_addr = std::net::SocketAddr::new(config.host, 0);
            tokio::net::TcpListener::bind(fallback_addr)
                .await
                .map_err(|fallback_err| {
                    format!(
                        "port manager bind failed on {preferred_addr}: {err}; fallback bind failed: {fallback_err}"
                    )
                })
        }
    }
}

#[allow(dead_code)]
fn _metrics_snapshot(metrics: &PortManagerMetrics) -> PortManagerMetricsSnapshot {
    metrics.snapshot()
}

async fn handle_boss_status(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    let boss = state.current_boss.read().await.clone();
    let is_this_device = boss.as_deref() == Some(state.device_id.as_str());
    Json(BossStatusResponse {
        boss_device_id: boss,
        is_this_device,
    })
}

async fn handle_boss_connect(
    AxumState(state): AxumState<MusuPortState>,
    Json(req): Json<BossConnectRequest>,
) -> impl IntoResponse {
    let mut boss = state.current_boss.write().await;
    let changed = boss.as_deref() != Some(req.device_id.as_str());
    *boss = Some(req.device_id.clone());
    drop(boss);

    if changed {
        let msg = serde_json::json!({
            "event": "boss_changed",
            "boss_device_id": req.device_id,
        })
        .to_string();
        state.channel_hub.broadcast("boss", msg);
    }

    let is_this_device = req.device_id == state.device_id;
    Json(BossStatusResponse {
        boss_device_id: Some(req.device_id),
        is_this_device,
    })
}

#[derive(Debug, Serialize)]
struct DeviceStatusResponse {
    cpu: f32,
    gpu: Option<f32>,
    ram: f32,
    /// Logical device identifier for this node.
    device_id: String,
    /// Windows host UUID shared by all musu-portd instances on the same physical machine.
    /// Null on non-WSL systems. Used by the frontend to group Windows + WSL nodes.
    physical_host_id: Option<String>,
}

async fn handle_device_status(AxumState(state): AxumState<MusuPortState>) -> impl IntoResponse {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu = sys.global_cpu_usage();

    let total_mem = sys.total_memory();
    let used_mem = sys.used_memory();
    let ram = if total_mem > 0 {
        (used_mem as f32 / total_mem as f32) * 100.0
    } else {
        0.0
    };

    let physical_host_id = resolve_physical_host_id();

    Json(DeviceStatusResponse {
        cpu,
        gpu: None, // GPU requires platform-specific probing (NVML/ROCm); not in sysinfo
        ram,
        device_id: state.device_id.clone(),
        physical_host_id,
    })
}
