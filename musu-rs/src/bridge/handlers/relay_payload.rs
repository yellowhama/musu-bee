//! Bounded target-side relay payload drain and opt-in low-duty poller.
//!
//! The HTTP drain remains request-driven. The poller is disabled by default and
//! must keep explicit sleep/backoff/cancellation evidence so Store-candidate
//! idle CPU runs can prove the default profile stays quiet.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::Path;
use std::time::Duration;

use axum::extract::{ConnectInfo, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::bridge::error::Result;
use crate::bridge::handlers::forward;
use crate::bridge::AppState;

const RELAY_PAYLOAD_DRAIN_SCHEMA: &str = "musu.relay_payload_drain.v1";
const RELAY_PAYLOAD_CLAIM_SCHEMA: &str = "musu.relay_payload_claim.v1";
const RELAY_PAYLOAD_DELIVERY_SCHEMA: &str = "musu.relay_payload_delivery.v1";
const RELEASE_RELAY_TUNNEL_TRANSPORT_KIND: &str = "quic_relay_tunnel";
const RELEASE_RELAY_TUNNEL_TRANSPORT_VERIFIER: &str = "musu_quic_tls_transport";
const DEFAULT_DRAIN_LIMIT: u32 = 1;
const MAX_DRAIN_LIMIT: u32 = 5;
const DEFAULT_DRAIN_TIMEOUT_MS: u64 = 3_000;
pub const RELAY_PAYLOAD_POLLER_DEFAULT_INTERVAL_SEC: u64 = 60;
pub const RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC: u64 = 30;
pub const RELAY_PAYLOAD_POLLER_DEFAULT_EMPTY_BACKOFF_MAX_SEC: u64 = 300;
pub const RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_CEILING_SEC: u64 = 3_600;

#[derive(Debug, Deserialize, Default)]
pub struct RelayPayloadDrainRequest {
    /// Maximum queued payloads to claim and hand to the local task runner.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Optional rendezvous session filter.
    #[serde(default)]
    pub session_id: Option<String>,
    /// Optional relay lease filter.
    #[serde(default)]
    pub lease_id: Option<String>,
    /// Optional source node filter.
    #[serde(default)]
    pub source_node_id: Option<String>,
    /// Optional tunnel id filter.
    #[serde(default)]
    pub tunnel_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RelayPayloadDrainItem {
    pub payload_id: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub payload_kind: String,
    pub payload_bytes: u64,
    pub payload_sha256: String,
    pub accepted: bool,
    pub delivered: bool,
    pub route_evidence_recorded: bool,
    pub route_evidence_submitted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_evidence_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery_proof: Option<crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_evidence_failure_class: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RelayPayloadDrainReport {
    pub schema: &'static str,
    pub ok: bool,
    pub logged_in: bool,
    pub owner_scoped: bool,
    pub target_node_id: String,
    pub limit: u32,
    pub claimed_count: usize,
    pub accepted_count: usize,
    pub delivered_count: usize,
    pub relay_default_data_path: bool,
    pub release_grade: bool,
    pub relay_payload_store_configured: bool,
    pub relay_payload_store_backend: Option<String>,
    pub relay_payload_store_release_grade: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub payloads: Vec<RelayPayloadDrainItem>,
    pub next_steps: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseRelayTunnelAcceptanceContract {
    pub transport_kind: &'static str,
    pub release_grade: bool,
    pub transport_verified_by: &'static str,
}

pub fn release_relay_tunnel_acceptance_contract() -> ReleaseRelayTunnelAcceptanceContract {
    ReleaseRelayTunnelAcceptanceContract {
        transport_kind: RELEASE_RELAY_TUNNEL_TRANSPORT_KIND,
        release_grade: true,
        transport_verified_by: RELEASE_RELAY_TUNNEL_TRANSPORT_VERIFIER,
    }
}

pub fn accept_release_relay_tunnel_payload(
    payload: &crate::cloud::P2pRelayPayloadStoredRecord,
    proof: &crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof,
) -> std::result::Result<crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof, &'static str>
{
    let contract = release_relay_tunnel_acceptance_contract();
    if payload.transport_kind != contract.transport_kind
        || proof.transport_kind != contract.transport_kind
    {
        return Err("release_relay_tunnel_payload_transport_kind_not_release_grade");
    }
    if !payload.release_grade || !proof.release_grade {
        return Err("release_relay_tunnel_payload_not_release_grade");
    }
    if payload.relay_default_data_path || proof.relay_default_data_path {
        return Err("release_relay_tunnel_payload_default_data_path");
    }
    if !payload.relay_url.trim().starts_with("wss://")
        || !proof.relay_url.trim().starts_with("wss://")
    {
        return Err("release_relay_tunnel_relay_url_not_wss");
    }
    if payload.payload_id != proof.payload_id
        || payload.session_id != proof.session_id
        || payload.lease_id != proof.lease_id
        || payload.source_node_id != proof.source_node_id
        || payload.target_node_id != proof.target_node_id
        || payload.tunnel_id != proof.tunnel_id
        || payload.payload_sha256 != proof.payload_sha256
        || payload.payload_bytes != proof.payload_bytes
    {
        return Err("release_relay_tunnel_payload_proof_mismatch");
    }
    Ok(proof.clone())
}

fn drain_limit(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_DRAIN_LIMIT).clamp(1, MAX_DRAIN_LIMIT)
}

fn drain_timeout() -> Duration {
    let millis = std::env::var("MUSU_P2P_RELAY_PAYLOAD_DRAIN_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_DRAIN_TIMEOUT_MS)
        .clamp(250, 10_000);
    Duration::from_millis(millis)
}

pub fn normalize_relay_payload_poller_interval_sec(raw: Option<&str>) -> u64 {
    raw.and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(RELAY_PAYLOAD_POLLER_DEFAULT_INTERVAL_SEC)
        .max(RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC)
}

pub fn normalize_relay_payload_poller_empty_backoff_max_sec(
    raw: Option<&str>,
    interval_sec: u64,
) -> u64 {
    raw.and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(RELAY_PAYLOAD_POLLER_DEFAULT_EMPTY_BACKOFF_MAX_SEC)
        .clamp(
            RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC,
            RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_CEILING_SEC,
        )
        .max(interval_sec)
}

pub fn normalize_relay_payload_poller_limit(raw: Option<&str>) -> u32 {
    drain_limit(raw.and_then(|value| value.parse::<u32>().ok()))
}

fn relay_payload_poller_sleep_duration(
    interval_sec: u64,
    max_backoff_sec: u64,
    consecutive_idle_or_failures: u32,
) -> Duration {
    let multiplier = 1_u64 << consecutive_idle_or_failures.min(4);
    Duration::from_secs(
        interval_sec
            .saturating_mul(multiplier)
            .min(max_backoff_sec.max(interval_sec)),
    )
}

fn relay_payload_poller_enabled() -> bool {
    // Default ON: relay is now the standard cross-machine fallback when direct/
    // tailnet reach fails, so a machine must receive relayed tasks without the
    // user setting any env (배관 숨김 — the user should never hand-edit a poller
    // flag to make their other PC reachable). Explicit opt-OUT only:
    // MUSU_ENABLE_RELAY_PAYLOAD_POLLER=0|false|no disables it.
    match std::env::var("MUSU_ENABLE_RELAY_PAYLOAD_POLLER").as_deref() {
        Ok("0") | Ok("false") | Ok("no") | Ok("off") => false,
        _ => true,
    }
}

#[derive(Debug, Clone, Copy)]
struct RelayPayloadPollerConfig {
    interval_sec: u64,
    empty_backoff_max_sec: u64,
    limit: u32,
}

impl RelayPayloadPollerConfig {
    fn from_env() -> Self {
        let interval_sec = normalize_relay_payload_poller_interval_sec(
            std::env::var("MUSU_RELAY_PAYLOAD_POLLER_INTERVAL_SEC")
                .ok()
                .as_deref(),
        );
        let empty_backoff_max_sec = normalize_relay_payload_poller_empty_backoff_max_sec(
            std::env::var("MUSU_RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_SEC")
                .ok()
                .as_deref(),
            interval_sec,
        );
        let limit = normalize_relay_payload_poller_limit(
            std::env::var("MUSU_RELAY_PAYLOAD_POLLER_LIMIT")
                .ok()
                .as_deref(),
        );
        Self {
            interval_sec,
            empty_backoff_max_sec,
            limit,
        }
    }
}

fn musu_home_from_state(state: &AppState) -> &Path {
    state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
}

fn account_cloud(state: &AppState) -> Option<crate::cloud::MusuCloud> {
    crate::cloud::token::load_token(musu_home_from_state(state))
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
        .map(|token| crate::cloud::MusuCloud::new(&crate::cloud::base_url_from_env(), Some(token)))
}

fn drain_item_from_payload(
    payload: &crate::cloud::P2pRelayPayloadStoredRecord,
) -> RelayPayloadDrainItem {
    RelayPayloadDrainItem {
        payload_id: payload.payload_id.clone(),
        session_id: payload.session_id.clone(),
        lease_id: payload.lease_id.clone(),
        source_node_id: payload.source_node_id.clone(),
        target_node_id: payload.target_node_id.clone(),
        payload_kind: payload.payload_kind.clone(),
        payload_bytes: payload.payload_bytes,
        payload_sha256: payload.payload_sha256.clone(),
        accepted: false,
        delivered: false,
        route_evidence_recorded: false,
        route_evidence_submitted: false,
        task_id: None,
        route_evidence_path: None,
        delivery_proof: None,
        failure_class: None,
        route_evidence_failure_class: None,
    }
}

fn delivery_proof_from_delivered_payload(
    payload: &crate::cloud::P2pRelayPayloadStoredRecord,
) -> Option<crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof> {
    let delivered_at = payload
        .delivered_at
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let claimed_by = payload
        .claimed_by
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let claimed_at = payload
        .claimed_at
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    if payload.status.trim() != "delivered" {
        return None;
    }

    Some(
        crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof {
            schema: "musu.relay_payload_delivery_proof.v1".to_string(),
            payload_id: payload.payload_id.clone(),
            session_id: payload.session_id.clone(),
            lease_id: payload.lease_id.clone(),
            source_node_id: payload.source_node_id.clone(),
            target_node_id: payload.target_node_id.clone(),
            relay_url: payload.relay_url.clone(),
            tunnel_id: payload.tunnel_id.clone(),
            payload_kind: payload.payload_kind.clone(),
            transport_kind: payload.transport_kind.clone(),
            relay_default_data_path: payload.relay_default_data_path,
            release_grade: payload.release_grade,
            payload_sha256: payload.payload_sha256.clone(),
            payload_bytes: payload.payload_bytes,
            claimed_by: claimed_by.to_string(),
            claimed_at: claimed_at.to_string(),
            created_at: payload.created_at.clone(),
            delivered_at: delivered_at.to_string(),
        },
    )
}

fn delivery_proof_from_cloud_proof(
    proof: &crate::cloud::RouteRelayPayloadDeliveryProof,
) -> crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof {
    crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof {
        schema: proof.schema.clone(),
        payload_id: proof.payload_id.clone(),
        session_id: proof.session_id.clone(),
        lease_id: proof.lease_id.clone(),
        source_node_id: proof.source_node_id.clone(),
        target_node_id: proof.target_node_id.clone(),
        relay_url: proof.relay_url.clone(),
        tunnel_id: proof.tunnel_id.clone(),
        payload_kind: proof.payload_kind.clone(),
        transport_kind: proof.transport_kind.clone(),
        relay_default_data_path: proof.relay_default_data_path,
        release_grade: proof.release_grade,
        payload_sha256: proof.payload_sha256.clone(),
        payload_bytes: proof.payload_bytes,
        claimed_by: proof.claimed_by.clone(),
        claimed_at: proof.claimed_at.clone(),
        created_at: proof.created_at.clone(),
        delivered_at: proof.delivered_at.clone(),
    }
}

fn relay_transport_proof_from_cloud_proof(
    proof: &crate::cloud::RouteRelayTransportProof,
) -> crate::bridge::route_evidence::RouteRelayTransportProof {
    crate::bridge::route_evidence::RouteRelayTransportProof {
        schema: proof.schema.clone(),
        session_id: proof.session_id.clone(),
        lease_id: proof.lease_id.clone(),
        source_node_id: proof.source_node_id.clone(),
        target_node_id: proof.target_node_id.clone(),
        transport_kind: proof.transport_kind.clone(),
        relay_url: proof.relay_url.clone(),
        tunnel_id: proof.tunnel_id.clone(),
        handshake_ms: proof.handshake_ms,
        payload_bytes_transited: proof.payload_bytes_transited,
        payload_transited_musu_infra: proof.payload_transited_musu_infra,
        peer_identity_verified: proof.peer_identity_verified,
        peer_identity_method: proof.peer_identity_method.clone(),
        peer_public_key: proof.peer_public_key.clone(),
        encryption: proof.encryption.clone(),
        transport_verified_by: proof.transport_verified_by.clone(),
        opened_at: proof.opened_at.clone(),
        closed_at: proof.closed_at.clone(),
    }
}

fn release_relay_transport_proof_required(
    payload: &crate::cloud::P2pRelayPayloadStoredRecord,
    proof: &crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof,
) -> bool {
    payload.release_grade
        || proof.release_grade
        || payload.transport_kind == RELEASE_RELAY_TUNNEL_TRANSPORT_KIND
        || proof.transport_kind == RELEASE_RELAY_TUNNEL_TRANSPORT_KIND
}

fn record_target_relay_payload_delivery_route_evidence(
    musu_home: &Path,
    payload: &crate::cloud::P2pRelayPayloadStoredRecord,
    delivery_proof: crate::bridge::route_evidence::RouteRelayPayloadDeliveryProof,
    relay_transport_proof: Option<&crate::cloud::RouteRelayTransportProof>,
    total_attempt_ms: u64,
) -> std::result::Result<crate::bridge::route_evidence::RouteEvidenceRecord, String> {
    if let Some(relay_transport_proof) = relay_transport_proof {
        let accepted_delivery_proof = accept_release_relay_tunnel_payload(payload, &delivery_proof)
            .map_err(str::to_string)?;
        let relay_transport_proof = relay_transport_proof_from_cloud_proof(relay_transport_proof);
        return crate::bridge::route_evidence::record_release_relay_payload_delivery_route_evidence(
            musu_home,
            payload,
            relay_transport_proof,
            accepted_delivery_proof,
            total_attempt_ms,
        )
        .map_err(|err| err.to_string());
    }

    if release_relay_transport_proof_required(payload, &delivery_proof) {
        return Err("release_relay_transport_proof_missing".to_string());
    }

    crate::bridge::route_evidence::record_relay_payload_delivery_route_evidence(
        musu_home,
        payload,
        delivery_proof,
        total_attempt_ms,
    )
    .map_err(|err| err.to_string())
}

pub fn start_relay_payload_poller_if_enabled(state: AppState) {
    if !relay_payload_poller_enabled() {
        tracing::info!(
            "relay payload poller disabled; set MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1 to enable target-side relay fallback polling"
        );
        return;
    }

    let config = RelayPayloadPollerConfig::from_env();
    let cancellation_token = CancellationToken::new();
    let ctrl_c_token = cancellation_token.clone();
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            ctrl_c_token.cancel();
        }
    });
    tokio::spawn(run_relay_payload_poller(state, config, cancellation_token));
    tracing::info!(
        interval_sec = config.interval_sec,
        empty_backoff_max_sec = config.empty_backoff_max_sec,
        limit = config.limit,
        "relay payload poller enabled with low-duty sleep/backoff"
    );
}

async fn run_relay_payload_poller(
    state: AppState,
    config: RelayPayloadPollerConfig,
    cancellation_token: CancellationToken,
) {
    let mut consecutive_idle_or_failures: u32 = 0;

    loop {
        let sleep_for = relay_payload_poller_sleep_duration(
            config.interval_sec,
            config.empty_backoff_max_sec,
            consecutive_idle_or_failures,
        );
        tokio::select! {
            _ = cancellation_token.cancelled() => break,
            _ = tokio::time::sleep(sleep_for) => {}
        }

        if cancellation_token.is_cancelled() {
            break;
        }

        let req = RelayPayloadDrainRequest {
            limit: Some(config.limit),
            ..Default::default()
        };
        match drain_relay_payloads_for_local_target(
            &state,
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            req,
            "/api/relay/payloads/poller",
        )
        .await
        {
            Ok(report) if report.delivered_count > 0 => {
                consecutive_idle_or_failures = 0;
                tracing::info!(
                    delivered_count = report.delivered_count,
                    accepted_count = report.accepted_count,
                    "relay payload poller delivered queued payloads"
                );
            }
            Ok(report) => {
                consecutive_idle_or_failures =
                    consecutive_idle_or_failures.saturating_add(1).min(8);
                tracing::debug!(
                    ok = report.ok,
                    claimed_count = report.claimed_count,
                    accepted_count = report.accepted_count,
                    delivered_count = report.delivered_count,
                    consecutive_idle_or_failures,
                    error = ?report.error,
                    "relay payload poller cycle completed without delivered payloads"
                );
            }
            Err(err) => {
                consecutive_idle_or_failures =
                    consecutive_idle_or_failures.saturating_add(1).min(8);
                tracing::warn!(
                    err = %err,
                    consecutive_idle_or_failures,
                    "relay payload poller drain cycle failed"
                );
            }
        }
    }

    tracing::info!("relay payload poller stopped");
}

pub async fn drain_relay_payloads(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    Json(req): Json<RelayPayloadDrainRequest>,
) -> Result<Json<RelayPayloadDrainReport>> {
    Ok(Json(
        drain_relay_payloads_for_local_target(&state, addr.ip(), req, "/api/relay/payloads/drain")
            .await?,
    ))
}

pub async fn drain_relay_payloads_for_local_target(
    state: &AppState,
    actor_ip: IpAddr,
    req: RelayPayloadDrainRequest,
    audit_path: &'static str,
) -> Result<RelayPayloadDrainReport> {
    let target_node_id = state.config.node_name.clone();
    let limit = drain_limit(req.limit);
    let mut report = RelayPayloadDrainReport {
        schema: RELAY_PAYLOAD_DRAIN_SCHEMA,
        ok: false,
        logged_in: false,
        owner_scoped: false,
        target_node_id: target_node_id.clone(),
        limit,
        claimed_count: 0,
        accepted_count: 0,
        delivered_count: 0,
        relay_default_data_path: false,
        release_grade: false,
        relay_payload_store_configured: false,
        relay_payload_store_backend: None,
        relay_payload_store_release_grade: false,
        error: None,
        payloads: Vec::new(),
        next_steps: vec![
            "keep the relay payload poller disabled by default for Store-candidate idle CPU evidence",
            "do not mark relay transport release-grade until QUIC/TLS payload transit proof exists",
            "rerun hosted P2P evidence after production KV/Upstash and relay proof are in place",
        ],
    };

    let Some(cloud) = account_cloud(state) else {
        report.error = Some("not_logged_in".to_string());
        return Ok(report);
    };
    report.logged_in = true;

    let claim = crate::cloud::P2pRelayPayloadClaimRequest {
        schema: RELAY_PAYLOAD_CLAIM_SCHEMA.to_string(),
        target_node_id: target_node_id.clone(),
        claimant_node_id: Some(target_node_id.clone()),
        limit: Some(limit),
        session_id: req.session_id,
        lease_id: req.lease_id,
        source_node_id: req.source_node_id,
        tunnel_id: req.tunnel_id,
        include_payload: true,
    };

    let claim_response =
        match tokio::time::timeout(drain_timeout(), cloud.claim_relay_payloads(&claim)).await {
            Ok(Ok(response)) => response,
            Ok(Err(err)) => {
                report.error = Some(format!("relay_payload_claim_failed:{err}"));
                return Ok(report);
            }
            Err(_) => {
                report.error = Some("relay_payload_claim_timeout".to_string());
                return Ok(report);
            }
        };

    report.owner_scoped = claim_response.owner_scoped;
    report.relay_default_data_path = claim_response.relay_default_data_path;
    report.release_grade = claim_response.release_grade;
    report.relay_payload_store_configured = claim_response.relay_payload_store_configured;
    report.relay_payload_store_backend = Some(claim_response.relay_payload_store_backend.clone());
    report.relay_payload_store_release_grade = claim_response.relay_payload_store_release_grade;
    report.claimed_count = claim_response.payloads.len();

    for payload in claim_response.payloads {
        let payload_started = std::time::Instant::now();
        let mut item = drain_item_from_payload(&payload);
        match forward::forwarded_task_from_relay_payload(&payload, &target_node_id) {
            Ok(task) => match forward::accept_forwarded_task(
                state, actor_ip, "POST", audit_path, task, None,
            )
            .await
            {
                Ok(response) => {
                    item.accepted = true;
                    item.task_id = Some(response.task_id);
                    report.accepted_count += 1;
                    let delivery = crate::cloud::P2pRelayPayloadDeliveryRequest {
                        schema: RELAY_PAYLOAD_DELIVERY_SCHEMA.to_string(),
                        payload_id: payload.payload_id.clone(),
                        target_node_id: target_node_id.clone(),
                    };
                    match tokio::time::timeout(
                        drain_timeout(),
                        cloud.mark_relay_payload_delivered(&delivery),
                    )
                    .await
                    {
                        Ok(Ok(delivery_response))
                            if delivery_response.ok && delivery_response.delivered =>
                        {
                            let proof = delivery_response
                                .delivery_proof
                                .as_ref()
                                .map(delivery_proof_from_cloud_proof)
                                .or_else(|| {
                                    delivery_response
                                        .payload
                                        .as_ref()
                                        .and_then(delivery_proof_from_delivered_payload)
                                });
                            if let Some(proof) = proof {
                                let route_record =
                                    record_target_relay_payload_delivery_route_evidence(
                                        musu_home_from_state(state),
                                        &payload,
                                        proof.clone(),
                                        delivery_response.relay_transport_proof.as_ref(),
                                        crate::bridge::route_evidence::elapsed_ms(
                                            payload_started.elapsed(),
                                        ),
                                    );
                                match route_record {
                                    Ok(record) => {
                                        item.route_evidence_recorded = true;
                                        item.route_evidence_path =
                                            Some(record.path.display().to_string());
                                        match tokio::time::timeout(
                                            drain_timeout(),
                                            crate::bridge::route_evidence::submit_recorded_route_evidence_if_configured(
                                                musu_home_from_state(state),
                                                &record,
                                            ),
                                        )
                                        .await
                                        {
                                            Ok(Ok(
                                                crate::bridge::route_evidence::RouteEvidenceSubmitOutcome::Submitted,
                                            )) => {
                                                item.route_evidence_submitted = true;
                                            }
                                            Ok(Ok(
                                                crate::bridge::route_evidence::RouteEvidenceSubmitOutcome::SkippedNoToken,
                                            )) => {
                                                item.route_evidence_failure_class =
                                                    Some("relay_route_evidence_submit_skipped_no_token".to_string());
                                            }
                                            Ok(Err(_)) => {
                                                item.route_evidence_failure_class =
                                                    Some("relay_route_evidence_submit_failed".to_string());
                                            }
                                            Err(_) => {
                                                item.route_evidence_failure_class =
                                                    Some("relay_route_evidence_submit_timeout".to_string());
                                            }
                                        }
                                    }
                                    Err(failure_class) => {
                                        item.route_evidence_failure_class = Some(failure_class);
                                    }
                                }
                                item.delivery_proof = Some(proof);
                                item.delivered = true;
                                report.delivered_count += 1;
                            } else {
                                item.failure_class =
                                    Some("relay_payload_delivery_proof_missing".to_string());
                            }
                        }
                        Ok(Ok(_)) => {
                            item.failure_class =
                                Some("relay_payload_delivery_not_confirmed".to_string());
                        }
                        Ok(Err(_)) => {
                            item.failure_class = Some("relay_payload_delivery_failed".to_string());
                        }
                        Err(_) => {
                            item.failure_class = Some("relay_payload_delivery_timeout".to_string());
                        }
                    }
                }
                Err(_) => {
                    item.failure_class = Some("relay_payload_forward_accept_failed".to_string());
                }
            },
            Err(failure_class) => {
                item.failure_class = Some(failure_class);
            }
        }
        report.payloads.push(item);
    }

    report.ok = claim_response.ok
        && claim_response.owner_scoped
        && report.claimed_count == report.delivered_count
        && report.payloads.iter().all(|item| {
            item.accepted
                && item.delivered
                && item.route_evidence_recorded
                && item.route_evidence_submitted
        });
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drain_limit_is_bounded_for_idle_safe_manual_drains() {
        assert_eq!(drain_limit(None), 1);
        assert_eq!(drain_limit(Some(0)), 1);
        assert_eq!(drain_limit(Some(3)), 3);
        assert_eq!(drain_limit(Some(99)), MAX_DRAIN_LIMIT);
    }

    #[test]
    fn relay_payload_poller_interval_defaults_and_floors() {
        assert_eq!(
            normalize_relay_payload_poller_interval_sec(None),
            RELAY_PAYLOAD_POLLER_DEFAULT_INTERVAL_SEC
        );
        assert_eq!(
            normalize_relay_payload_poller_interval_sec(Some("0")),
            RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC
        );
        assert_eq!(normalize_relay_payload_poller_interval_sec(Some("90")), 90);
    }

    #[test]
    fn relay_payload_poller_backoff_caps_and_never_shrinks_interval() {
        assert_eq!(
            normalize_relay_payload_poller_empty_backoff_max_sec(None, 60),
            RELAY_PAYLOAD_POLLER_DEFAULT_EMPTY_BACKOFF_MAX_SEC
        );
        assert_eq!(
            normalize_relay_payload_poller_empty_backoff_max_sec(Some("5"), 60),
            60
        );
        assert_eq!(
            normalize_relay_payload_poller_empty_backoff_max_sec(Some("99999"), 60),
            RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_CEILING_SEC
        );
    }

    #[test]
    fn relay_payload_poller_sleep_uses_capped_exponential_backoff() {
        assert_eq!(
            relay_payload_poller_sleep_duration(60, 300, 0),
            Duration::from_secs(60)
        );
        assert_eq!(
            relay_payload_poller_sleep_duration(60, 300, 2),
            Duration::from_secs(240)
        );
        assert_eq!(
            relay_payload_poller_sleep_duration(60, 300, 8),
            Duration::from_secs(300)
        );
    }

    #[test]
    fn relay_payload_poller_limit_matches_manual_drain_budget() {
        assert_eq!(normalize_relay_payload_poller_limit(None), 1);
        assert_eq!(normalize_relay_payload_poller_limit(Some("0")), 1);
        assert_eq!(normalize_relay_payload_poller_limit(Some("3")), 3);
        assert_eq!(
            normalize_relay_payload_poller_limit(Some("999")),
            MAX_DRAIN_LIMIT
        );
    }

    fn delivered_payload_record() -> crate::cloud::P2pRelayPayloadStoredRecord {
        crate::cloud::P2pRelayPayloadStoredRecord {
            payload_id: "payload-1".to_string(),
            session_id: "rv-test".to_string(),
            lease_id: "lease-1".to_string(),
            source_node_id: "source-node".to_string(),
            target_node_id: "target-node".to_string(),
            relay_url: "wss://relay.musu.pro/connect".to_string(),
            tunnel_id: "relay-tunnel-1".to_string(),
            payload_kind: "forwarded_task_envelope".to_string(),
            payload_bytes: 128,
            payload_sha256: "abc123".to_string(),
            status: "delivered".to_string(),
            relay_default_data_path: false,
            release_grade: false,
            transport_kind: "http_store_forward_preview".to_string(),
            created_at: "2026-06-04T00:00:00Z".to_string(),
            expires_at: "2026-06-04T00:05:00Z".to_string(),
            claimed_by: Some("target-node".to_string()),
            claimed_at: Some("2026-06-04T00:00:01Z".to_string()),
            delivered_at: Some("2026-06-04T00:00:02Z".to_string()),
            payload_base64: None,
            candidate_route_kinds: vec![
                crate::cloud::RouteKind::Lan,
                crate::cloud::RouteKind::Relay,
            ],
            attempted_route_kinds: vec![crate::cloud::RouteKind::Lan],
        }
    }

    fn release_relay_tunnel_payload_record() -> crate::cloud::P2pRelayPayloadStoredRecord {
        let mut payload = delivered_payload_record();
        payload.transport_kind = "quic_relay_tunnel".to_string();
        payload.release_grade = true;
        payload
    }

    fn release_relay_tunnel_transport_proof(
        payload: &crate::cloud::P2pRelayPayloadStoredRecord,
    ) -> crate::cloud::RouteRelayTransportProof {
        crate::cloud::RouteRelayTransportProof {
            schema: "musu.relay_transport_proof.v1".to_string(),
            session_id: payload.session_id.clone(),
            lease_id: payload.lease_id.clone(),
            source_node_id: payload.source_node_id.clone(),
            target_node_id: payload.target_node_id.clone(),
            transport_kind: "quic_relay_tunnel".to_string(),
            relay_url: payload.relay_url.clone(),
            tunnel_id: payload.tunnel_id.clone(),
            handshake_ms: 23,
            payload_bytes_transited: payload.payload_bytes,
            payload_transited_musu_infra: true,
            peer_identity_verified: true,
            peer_identity_method: "quic_tls_cert_fingerprint".to_string(),
            peer_public_key: "sha256:release-peer".to_string(),
            encryption: "quic_tls_1_3".to_string(),
            transport_verified_by: "musu_quic_tls_transport".to_string(),
            opened_at: "2026-06-04T00:00:01Z".to_string(),
            closed_at: Some("2026-06-04T00:00:02Z".to_string()),
        }
    }

    #[test]
    fn delivered_payload_record_builds_delivery_proof() {
        let proof =
            delivery_proof_from_delivered_payload(&delivered_payload_record()).expect("proof");

        assert_eq!(proof.schema, "musu.relay_payload_delivery_proof.v1");
        assert_eq!(proof.payload_id, "payload-1");
        assert_eq!(proof.session_id, "rv-test");
        assert_eq!(proof.lease_id, "lease-1");
        assert_eq!(proof.source_node_id, "source-node");
        assert_eq!(proof.target_node_id, "target-node");
        assert_eq!(proof.relay_url, "wss://relay.musu.pro/connect");
        assert_eq!(proof.tunnel_id, "relay-tunnel-1");
        assert_eq!(proof.transport_kind, "http_store_forward_preview");
        assert!(!proof.relay_default_data_path);
        assert!(!proof.release_grade);
        assert_eq!(proof.payload_sha256, "abc123");
        assert_eq!(proof.payload_bytes, 128);
        assert_eq!(proof.delivered_at, "2026-06-04T00:00:02Z");
    }

    #[test]
    fn release_relay_tunnel_acceptance_contract_requires_release_payload_proof() {
        let contract = release_relay_tunnel_acceptance_contract();
        assert_eq!(contract.transport_kind, "quic_relay_tunnel");
        assert!(contract.release_grade);
        assert_eq!(contract.transport_verified_by, "musu_quic_tls_transport");

        let payload = release_relay_tunnel_payload_record();
        let proof = delivery_proof_from_delivered_payload(&payload).expect("proof");
        let accepted = accept_release_relay_tunnel_payload(&payload, &proof).expect("accepted");
        assert_eq!(accepted.transport_kind, "quic_relay_tunnel");
        assert!(accepted.release_grade);
    }

    #[test]
    fn relay_transport_proof_from_cloud_proof_preserves_release_binding() {
        let payload = release_relay_tunnel_payload_record();
        let cloud_proof = release_relay_tunnel_transport_proof(&payload);
        let proof = relay_transport_proof_from_cloud_proof(&cloud_proof);

        assert_eq!(proof.schema, "musu.relay_transport_proof.v1");
        assert_eq!(proof.session_id, payload.session_id);
        assert_eq!(proof.lease_id, payload.lease_id);
        assert_eq!(proof.source_node_id, payload.source_node_id);
        assert_eq!(proof.target_node_id, payload.target_node_id);
        assert_eq!(proof.relay_url, payload.relay_url);
        assert_eq!(proof.tunnel_id, payload.tunnel_id);
        assert_eq!(proof.transport_kind, "quic_relay_tunnel");
        assert_eq!(proof.encryption, "quic_tls_1_3");
        assert_eq!(proof.transport_verified_by, "musu_quic_tls_transport");
        assert_eq!(proof.payload_bytes_transited, payload.payload_bytes);
        assert!(proof.peer_identity_verified);
    }

    #[test]
    fn target_delivery_records_release_route_evidence_when_transport_proof_attached() {
        let dir = std::env::temp_dir().join(format!(
            "musu-relay-payload-target-evidence-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let payload = release_relay_tunnel_payload_record();
        let delivery_proof = delivery_proof_from_delivered_payload(&payload).expect("proof");
        let transport_proof = release_relay_tunnel_transport_proof(&payload);

        let record = record_target_relay_payload_delivery_route_evidence(
            &dir,
            &payload,
            delivery_proof,
            Some(&transport_proof),
            31,
        )
        .expect("release route evidence");
        let value = serde_json::to_value(&record.evidence).unwrap();

        assert!(record
            .path
            .ends_with("route-evidence/release-relay-payload-payload-1.route-evidence.json"));
        assert_eq!(value["route_kind"], "relay");
        assert_eq!(value["handshake_ms"], 23);
        assert_eq!(value["encryption"], "quic_tls_1_3");
        assert_eq!(value["transport_verified_by"], "musu_quic_tls_transport");
        assert_eq!(
            value["relay_transport_proof"]["schema"],
            "musu.relay_transport_proof.v1"
        );
        assert_eq!(
            value["relay_payload_delivery_proof"]["schema"],
            "musu.relay_payload_delivery_proof.v1"
        );
        assert_eq!(
            value["relay_payload_delivery_proof"]["transport_kind"],
            "quic_relay_tunnel"
        );
        assert_eq!(value["relay_payload_delivery_proof"]["release_grade"], true);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn target_delivery_rejects_release_payload_without_transport_proof() {
        let dir = std::env::temp_dir().join(format!(
            "musu-relay-payload-target-evidence-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let payload = release_relay_tunnel_payload_record();
        let delivery_proof = delivery_proof_from_delivered_payload(&payload).expect("proof");

        let result = record_target_relay_payload_delivery_route_evidence(
            &dir,
            &payload,
            delivery_proof,
            None,
            31,
        );
        let error = match result {
            Ok(_) => panic!("expected missing transport proof failure"),
            Err(error) => error,
        };

        assert_eq!(error, "release_relay_transport_proof_missing");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn accept_release_relay_tunnel_payload_rejects_preview_queue_delivery() {
        let payload = delivered_payload_record();
        let proof = delivery_proof_from_delivered_payload(&payload).expect("proof");

        assert_eq!(
            accept_release_relay_tunnel_payload(&payload, &proof).unwrap_err(),
            "release_relay_tunnel_payload_transport_kind_not_release_grade"
        );
    }

    #[test]
    fn delivery_proof_requires_delivered_status_and_timestamp() {
        let mut payload = delivered_payload_record();
        payload.status = "claimed".to_string();
        assert!(delivery_proof_from_delivered_payload(&payload).is_none());

        payload.status = "delivered".to_string();
        payload.delivered_at = None;
        assert!(delivery_proof_from_delivered_payload(&payload).is_none());
    }
}
