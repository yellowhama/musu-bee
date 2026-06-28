//! Runtime rendezvous lifecycle for MUSU-assisted P2P routes.
//!
//! This keeps `musu.pro` on the control-plane path only: route attempts may
//! create a short-lived session and publish endpoint candidates, while the
//! task payload still goes over the selected peer path.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, Result};

use crate::bridge::AppState;
use crate::peer::discovery::ResolvedPeer;

const DEFAULT_RENDEZVOUS_TIMEOUT_MS: u64 = 3_000;
const RELEASE_RELAY_TUNNEL_TRANSPORT_KIND: &str = "quic_relay_tunnel";
const RELEASE_RELAY_TUNNEL_TRANSPORT_ENCRYPTION: &str = "quic_tls_1_3";
const RELEASE_RELAY_TUNNEL_TRANSPORT_VERIFIER: &str = "musu_quic_tls_transport";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RendezvousStatus {
    Created,
    SkippedNoToken,
    Failed,
}

#[derive(Debug, Clone)]
pub struct RendezvousPreparation {
    pub status: RendezvousStatus,
    pub session_id: Option<String>,
    pub route_peer: Option<ResolvedPeer>,
    pub route_peers: Vec<ResolvedPeer>,
    pub target_candidate_count: usize,
    pub failure_class: Option<String>,
}

impl RendezvousPreparation {
    fn skipped_no_token() -> Self {
        Self {
            status: RendezvousStatus::SkippedNoToken,
            session_id: None,
            route_peer: None,
            route_peers: Vec::new(),
            target_candidate_count: 0,
            failure_class: Some("rendezvous_no_account_token".to_string()),
        }
    }

    fn failed(failure_class: impl Into<String>) -> Self {
        Self {
            status: RendezvousStatus::Failed,
            session_id: None,
            route_peer: None,
            route_peers: Vec::new(),
            target_candidate_count: 0,
            failure_class: Some(failure_class.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RelayLeaseFallbackStatus {
    SkippedNoToken,
    SkippedNoSession,
    Denied,
    Issued,
    Failed,
    TimedOut,
}

#[derive(Debug, Clone)]
pub struct RelayLeaseFallback {
    pub status: RelayLeaseFallbackStatus,
    pub lease_issued: bool,
    pub policy: Option<String>,
    pub blockers: Vec<String>,
    pub lease_id: Option<String>,
    pub failure_class: Option<String>,
}

impl RelayLeaseFallback {
    fn skipped_no_token() -> Self {
        Self {
            status: RelayLeaseFallbackStatus::SkippedNoToken,
            lease_issued: false,
            policy: None,
            blockers: vec!["relay_no_account_token".to_string()],
            lease_id: None,
            failure_class: Some("relay_no_account_token".to_string()),
        }
    }

    fn skipped_no_session() -> Self {
        Self {
            status: RelayLeaseFallbackStatus::SkippedNoSession,
            lease_issued: false,
            policy: None,
            blockers: vec!["relay_requires_rendezvous_session".to_string()],
            lease_id: None,
            failure_class: Some("relay_requires_rendezvous_session".to_string()),
        }
    }

    fn failed(failure_class: impl Into<String>) -> Self {
        let failure_class = failure_class.into();
        Self {
            status: RelayLeaseFallbackStatus::Failed,
            lease_issued: false,
            policy: None,
            blockers: vec![failure_class.clone()],
            lease_id: None,
            failure_class: Some(failure_class),
        }
    }

    fn timed_out() -> Self {
        Self {
            status: RelayLeaseFallbackStatus::TimedOut,
            lease_issued: false,
            policy: None,
            blockers: vec!["relay_lease_timeout".to_string()],
            lease_id: None,
            failure_class: Some("relay_lease_timeout".to_string()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RelayPayloadQueueOutcome {
    pub attempted: bool,
    pub proven: bool,
    /// W-2: the relay server confirmed the payload was stored in the KV queue
    /// (`response.ok && accepted && stored`). This is set directly from the
    /// server's `stored` flag — NOT inferred from `payload_id`, because a
    /// `stored=true` response may legitimately omit the record body, which
    /// would otherwise make a genuinely in-flight task look dropped and force a
    /// spurious 500 on the sender.
    pub stored: bool,
    pub failure_class: Option<String>,
    pub payload_id: Option<String>,
    pub payload_sha256: Option<String>,
    pub payload_bytes: Option<u64>,
}

impl RelayPayloadQueueOutcome {
    pub fn not_attempted() -> Self {
        Self {
            attempted: false,
            proven: false,
            stored: false,
            failure_class: None,
            payload_id: None,
            payload_sha256: None,
            payload_bytes: None,
        }
    }

    pub fn failed(failure_class: impl Into<String>) -> Self {
        Self {
            attempted: true,
            proven: false,
            stored: false,
            failure_class: Some(failure_class.into()),
            payload_id: None,
            payload_sha256: None,
            payload_bytes: None,
        }
    }

    fn queued(
        response: crate::cloud::P2pRelayPayloadResponse,
        request: &crate::cloud::P2pRelayPayloadRequest,
    ) -> Self {
        let payload = response.payload;
        Self {
            attempted: true,
            proven: false,
            // queued() is only constructed from a `response.ok && accepted &&
            // stored` arm, so reaching here means the server confirmed storage
            // regardless of whether it echoed the record body.
            stored: true,
            failure_class: Some(
                crate::bridge::route_evidence::RELAY_TARGET_POLLING_NOT_IMPLEMENTED.to_string(),
            ),
            payload_id: payload.as_ref().map(|record| record.payload_id.clone()),
            payload_sha256: payload
                .as_ref()
                .map(|record| record.payload_sha256.clone())
                .or_else(|| request.payload_sha256.clone()),
            payload_bytes: payload.as_ref().map(|record| record.payload_bytes),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseRelayTunnelSubmissionContract {
    pub transport_kind: &'static str,
    pub release_grade: bool,
    pub encryption: &'static str,
    pub transport_verified_by: &'static str,
}

pub fn release_relay_tunnel_submission_contract() -> ReleaseRelayTunnelSubmissionContract {
    ReleaseRelayTunnelSubmissionContract {
        transport_kind: RELEASE_RELAY_TUNNEL_TRANSPORT_KIND,
        release_grade: true,
        encryption: RELEASE_RELAY_TUNNEL_TRANSPORT_ENCRYPTION,
        transport_verified_by: RELEASE_RELAY_TUNNEL_TRANSPORT_VERIFIER,
    }
}

pub fn validate_release_relay_tunnel_submission(
    relay_url: &str,
    peer_public_key: &str,
    payload: &crate::cloud::P2pRelayPayloadRequest,
) -> std::result::Result<(), &'static str> {
    let _contract = release_relay_tunnel_submission_contract();
    if !relay_url.trim().starts_with("wss://") {
        return Err("release_relay_tunnel_relay_url_not_wss");
    }
    if !peer_public_key.trim().starts_with("sha256:") {
        return Err("release_relay_tunnel_peer_public_key_not_fingerprint");
    }
    if payload.source_node_id.trim().is_empty() {
        return Err("release_relay_tunnel_source_node_id_missing");
    }
    if payload.target_node_id.trim().is_empty() {
        return Err("release_relay_tunnel_target_node_id_missing");
    }
    if payload.tunnel_id.trim().is_empty() {
        return Err("release_relay_tunnel_id_missing");
    }
    if payload.payload_kind.trim() != "forwarded_task_envelope" {
        return Err("release_relay_tunnel_payload_kind_not_forwarded_task_envelope");
    }
    if !payload
        .payload_sha256
        .as_deref()
        .map(is_hex_sha256)
        .unwrap_or(false)
    {
        return Err("release_relay_tunnel_payload_sha256_invalid");
    }
    Ok(())
}

pub async fn submit_release_relay_tunnel_payload(
    relay_url: &str,
    peer_public_key: &str,
    payload: &crate::cloud::P2pRelayPayloadRequest,
) -> RelayPayloadQueueOutcome {
    if let Err(failure_class) =
        validate_release_relay_tunnel_submission(relay_url, peer_public_key, payload)
    {
        return RelayPayloadQueueOutcome::failed(failure_class);
    }

    RelayPayloadQueueOutcome::failed("release_relay_tunnel_runtime_not_implemented")
}

fn is_hex_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn rendezvous_timeout() -> Duration {
    let millis = std::env::var("MUSU_P2P_RENDEZVOUS_CLIENT_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_RENDEZVOUS_TIMEOUT_MS)
        .clamp(250, 10_000);
    Duration::from_millis(millis)
}

fn musu_home_from_state(state: &AppState) -> &Path {
    state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
}

fn account_cloud(musu_home: &Path) -> Option<crate::cloud::MusuCloud> {
    crate::cloud::token::load_token(musu_home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
        .map(|token| crate::cloud::MusuCloud::new(&crate::cloud::base_url_from_env(), Some(token)))
}

pub fn endpoint_addr_from_url(value: &str) -> String {
    let trimmed = value.trim().trim_end_matches('/');
    if let Ok(url) = reqwest::Url::parse(trimmed) {
        if let Some(host) = url.host_str() {
            let port = url
                .port_or_known_default()
                .unwrap_or(crate::bridge::services::DEFAULT_LOCAL_BRIDGE_PORT);
            if host.contains(':') && !host.starts_with('[') {
                return format!("[{host}]:{port}");
            }
            return format!("{host}:{port}");
        }
    }

    trimmed
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .to_string()
}

pub fn endpoint_url_with_host(value: &str, host: &str) -> Option<String> {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() || host.trim().is_empty() {
        return None;
    }
    let mut url = reqwest::Url::parse(trimmed).ok()?;
    url.set_host(Some(host.trim())).ok()?;
    Some(url.to_string().trim_end_matches('/').to_string())
}

fn endpoint_scheme_from_url(value: &str) -> Option<String> {
    reqwest::Url::parse(value.trim().trim_end_matches('/'))
        .ok()
        .and_then(|url| match url.scheme() {
            "http" | "https" => Some(url.scheme().to_string()),
            _ => None,
        })
}

fn cloud_route_kind_for_addr(addr: &str) -> crate::cloud::RouteKind {
    match crate::bridge::router::route_kind_for_addr(addr) {
        crate::bridge::router::RoutePathKind::Local | crate::bridge::router::RoutePathKind::Lan => {
            crate::cloud::RouteKind::Lan
        }
        crate::bridge::router::RoutePathKind::Tailscale => crate::cloud::RouteKind::Tailscale,
        crate::bridge::router::RoutePathKind::DirectQuic => crate::cloud::RouteKind::DirectQuic,
    }
}

pub fn candidate_endpoint_from_url(
    value: &str,
    observed_at: &str,
    nat_type: Option<crate::cloud::NatType>,
    nat_observed_by: Option<String>,
) -> Option<crate::cloud::CandidateEndpoint> {
    let addr = endpoint_addr_from_url(value);
    if addr.trim().is_empty() {
        return None;
    }
    let kind = cloud_route_kind_for_addr(&addr);
    let is_direct = matches!(kind, crate::cloud::RouteKind::DirectQuic);
    Some(crate::cloud::CandidateEndpoint {
        kind,
        addr: addr.clone(),
        observed_at: observed_at.to_string(),
        scheme: endpoint_scheme_from_url(value),
        public_addr: is_direct.then_some(addr),
        nat_type: if is_direct {
            Some(nat_type.unwrap_or(crate::cloud::NatType::Unknown))
        } else {
            None
        },
        nat_observed_by: if is_direct { nat_observed_by } else { None },
        relay_url: None,
        relay_protocol: None,
    })
}

fn push_candidate_endpoint_unique(
    candidates: &mut Vec<crate::cloud::CandidateEndpoint>,
    candidate: crate::cloud::CandidateEndpoint,
) {
    if candidates
        .iter()
        .any(|existing| existing.kind == candidate.kind && existing.addr == candidate.addr)
    {
        return;
    }
    candidates.push(candidate);
}

pub fn local_candidate_endpoints_for_advertised_url(
    advertised: &str,
    tailscale_ip: Option<&str>,
    observed_at: &str,
) -> Vec<crate::cloud::CandidateEndpoint> {
    local_candidate_endpoints_for_route_hosts(
        advertised,
        std::iter::empty::<&str>(),
        tailscale_ip,
        observed_at,
    )
}

pub fn local_candidate_endpoints_for_route_hosts<'a>(
    advertised: &str,
    lan_hosts: impl IntoIterator<Item = &'a str>,
    tailscale_ip: Option<&str>,
    observed_at: &str,
) -> Vec<crate::cloud::CandidateEndpoint> {
    let mut candidates = Vec::new();
    if let Some(candidate) = candidate_endpoint_from_url(advertised, observed_at, None, None) {
        push_candidate_endpoint_unique(&mut candidates, candidate);
    }
    for lan_host in lan_hosts {
        let trimmed = lan_host.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(lan_url) = endpoint_url_with_host(advertised, trimmed) {
            if let Some(candidate) = candidate_endpoint_from_url(&lan_url, observed_at, None, None)
            {
                push_candidate_endpoint_unique(&mut candidates, candidate);
            }
        }
    }
    if let Some(tailscale_ip) = tailscale_ip.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then_some(trimmed)
    }) {
        if let Some(tailscale_url) = endpoint_url_with_host(advertised, tailscale_ip) {
            if let Some(candidate) =
                candidate_endpoint_from_url(&tailscale_url, observed_at, None, None)
            {
                push_candidate_endpoint_unique(&mut candidates, candidate);
            }
        }
    }
    candidates
}

fn cloud_route_kind_label(kind: &crate::cloud::RouteKind) -> &'static str {
    match kind {
        crate::cloud::RouteKind::Lan => "lan",
        crate::cloud::RouteKind::Tailscale => "tailscale",
        crate::cloud::RouteKind::DirectQuic => "direct_quic",
        crate::cloud::RouteKind::Relay => "relay",
        crate::cloud::RouteKind::Failed => "failed",
    }
}

fn push_route_kind_label(kinds: &mut Vec<&'static str>, kind: &'static str) {
    if matches!(kind, "lan" | "tailscale" | "direct_quic" | "relay")
        && !kinds.iter().any(|existing| *existing == kind)
    {
        kinds.push(kind);
    }
}

fn target_candidate_route_kind_labels(
    target: &crate::cloud::NodeCandidateSet,
) -> Vec<&'static str> {
    let mut kinds = Vec::new();
    for candidate in &target.candidate_endpoints {
        push_route_kind_label(&mut kinds, cloud_route_kind_label(&candidate.kind));
    }
    kinds
}

fn relay_attempted_route_kinds(
    fallback_peer: &ResolvedPeer,
    attempted_peers: &[ResolvedPeer],
) -> Vec<crate::cloud::RouteKind> {
    let mut kinds = Vec::new();
    for peer in attempted_peers.iter().chain(std::iter::once(fallback_peer)) {
        let kind = cloud_route_kind_for_addr(&peer.addr);
        if !kinds.contains(&kind) {
            kinds.push(kind);
        }
    }
    kinds
}

fn relay_lease_request_for_direct_failure(
    cfg: &crate::bridge::config::BridgeConfig,
    fallback_peer: &ResolvedPeer,
    session_id: &str,
    attempted_peers: &[ResolvedPeer],
    failure_class: &str,
    requested_capability: Option<&str>,
) -> crate::cloud::P2pRelayLeaseRequest {
    crate::cloud::P2pRelayLeaseRequest {
        session_id: session_id.to_string(),
        source_node_id: cfg.node_name.clone(),
        target_node_id: crate::bridge::route_evidence::target_node_id(fallback_peer),
        requested_capability: requested_capability.map(str::to_string),
        attempted_route_kinds: relay_attempted_route_kinds(fallback_peer, attempted_peers),
        direct_path_failed: true,
        failure_class: Some(failure_class.to_string()),
    }
}

fn local_identity_public_key(cfg: &crate::bridge::config::BridgeConfig) -> Option<String> {
    let fingerprint = if let Some(cert_path) = cfg.tls_cert_path.as_ref() {
        crate::install::tls::cert_sha256_fingerprint(cert_path)
    } else {
        let musu_home = cfg
            .nodes_toml_path
            .parent()
            .unwrap_or_else(|| Path::new("."));
        crate::install::tls::default_cert_fingerprint(musu_home).and_then(|value| {
            value.ok_or_else(|| anyhow!("tls certificate fingerprint unavailable"))
        })
    };

    match fingerprint {
        Ok(value) => Some(value),
        Err(err) => {
            tracing::debug!(err = %err, "local TLS certificate fingerprint unavailable for rendezvous candidate");
            None
        }
    }
}

pub fn local_candidate_request(
    cfg: &crate::bridge::config::BridgeConfig,
) -> crate::cloud::P2pRendezvousCandidatesRequest {
    local_candidate_request_for_node_id(cfg, cfg.node_name.clone())
}

pub fn local_candidate_request_for_node_id(
    cfg: &crate::bridge::config::BridgeConfig,
    node_id: String,
) -> crate::cloud::P2pRendezvousCandidatesRequest {
    let advertised = crate::bridge::services::advertised_bridge_http_url(cfg);
    let observed_at = chrono::Utc::now().to_rfc3339();
    let tailscale_ip = crate::peer::tailscale::get_tailscale_ip();
    let public_key = local_identity_public_key(cfg);
    crate::cloud::P2pRendezvousCandidatesRequest {
        node_id,
        candidate_endpoints: local_candidate_endpoints_for_advertised_url(
            &advertised,
            tailscale_ip.as_deref(),
            &observed_at,
        ),
        relay_capable: false,
        node_name: Some(cfg.node_name.clone()),
        app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
        public_key,
        capabilities: Some(vec!["bridge_http_forward".to_string()]),
    }
}

#[cfg(test)]
fn route_peer_from_target_candidates(
    target_node_id: &str,
    target: &crate::cloud::NodeCandidateSet,
) -> Option<ResolvedPeer> {
    route_peers_from_target_candidates(target_node_id, target)
        .into_iter()
        .next()
}

fn route_peers_from_target_candidates(
    target_node_id: &str,
    target: &crate::cloud::NodeCandidateSet,
) -> Vec<ResolvedPeer> {
    let peer_public_key = target.public_key.trim();
    let candidate_route_kinds = target_candidate_route_kind_labels(target);
    let relay_candidates = target
        .candidate_endpoints
        .iter()
        .filter(|candidate| matches!(candidate.kind, crate::cloud::RouteKind::Relay))
        .filter_map(relay_candidate_meta)
        .collect::<Vec<_>>();
    let peers = target
        .candidate_endpoints
        .iter()
        .filter_map(|candidate| {
            if matches!(
                candidate.kind,
                crate::cloud::RouteKind::Relay | crate::cloud::RouteKind::Failed
            ) {
                return None;
            }
            let (selected_addr, selected_addr_source) = selected_candidate_addr(candidate)?;
            let mut meta = serde_json::json!({
                "source": "musu.pro_rendezvous",
                "candidate_kind": candidate.kind,
                "candidate_addr": candidate.addr,
                "candidate_route_kinds": candidate_route_kinds.clone(),
                "selected_addr_source": selected_addr_source,
                "observed_at": candidate.observed_at,
            });
            if !peer_public_key.is_empty() {
                meta["peer_public_key"] = serde_json::json!(peer_public_key);
                meta["peer_identity_method"] = serde_json::json!("advertised_tls_cert_fingerprint");
            }
            if let Some(scheme) = candidate.scheme.as_deref() {
                meta["transport_scheme"] = serde_json::json!(scheme);
            }
            if let Some(public_addr) = trimmed_opt(candidate.public_addr.as_deref()) {
                meta["public_addr"] = serde_json::json!(public_addr);
            }
            if let Some(nat_type) = candidate.nat_type.as_ref() {
                meta["nat_type"] = serde_json::json!(nat_type);
            }
            if let Some(nat_observed_by) = trimmed_opt(candidate.nat_observed_by.as_deref()) {
                meta["nat_observed_by"] = serde_json::json!(nat_observed_by);
            }
            if !relay_candidates.is_empty() {
                meta["relay_candidates"] = serde_json::json!(relay_candidates);
            }
            Some(ResolvedPeer {
                addr: selected_addr,
                name: Some(target_node_id.to_string()),
                source: crate::peer::discovery::PeerSource::Registry,
                meta: Some(meta),
            })
        })
        .collect::<Vec<_>>();

    crate::bridge::router::select_remote_candidates_in_order(&peers)
}

fn trimmed_opt(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn selected_candidate_addr(
    candidate: &crate::cloud::CandidateEndpoint,
) -> Option<(String, &'static str)> {
    if matches!(candidate.kind, crate::cloud::RouteKind::DirectQuic) {
        if let Some(public_addr) = trimmed_opt(candidate.public_addr.as_deref()) {
            return Some((public_addr.to_string(), "public_addr"));
        }
    }

    trimmed_opt(Some(candidate.addr.as_str())).map(|addr| (addr.to_string(), "addr"))
}

fn relay_candidate_meta(candidate: &crate::cloud::CandidateEndpoint) -> Option<serde_json::Value> {
    let relay_url = trimmed_opt(candidate.relay_url.as_deref())?;
    let mut meta = serde_json::json!({
        "addr": candidate.addr,
        "relay_url": relay_url,
        "observed_at": candidate.observed_at,
    });
    if let Some(protocol) = candidate.relay_protocol.as_ref() {
        meta["relay_protocol"] = serde_json::json!(protocol);
    }
    if let Some(scheme) = trimmed_opt(candidate.scheme.as_deref()) {
        meta["scheme"] = serde_json::json!(scheme);
    }
    Some(meta)
}

pub async fn prepare_forward_rendezvous(
    state: &AppState,
    peer: &ResolvedPeer,
    requested_capability: Option<&str>,
) -> RendezvousPreparation {
    let musu_home = musu_home_from_state(state);
    let Some(cloud) = account_cloud(musu_home) else {
        return RendezvousPreparation::skipped_no_token();
    };

    let source_node_id = state.config.node_name.clone();
    let target_node_id = crate::bridge::route_evidence::target_node_id(peer);
    let create_req = crate::cloud::P2pRendezvousRequest {
        source_node_id: source_node_id.clone(),
        target_node_id: target_node_id.clone(),
        requested_capability: requested_capability.map(str::to_string),
    };
    let candidates_req = local_candidate_request(&state.config);

    let fut = async {
        let created = cloud.create_rendezvous(&create_req).await?;
        let session = cloud
            .add_rendezvous_candidates(&created.session_id, &candidates_req)
            .await?;
        let refreshed = cloud
            .get_rendezvous(&session.session_id)
            .await
            .unwrap_or(session);
        Ok::<_, anyhow::Error>(refreshed)
    };

    match tokio::time::timeout(rendezvous_timeout(), fut).await {
        Ok(Ok(session)) => {
            let route_peers = route_peers_from_target_candidates(&target_node_id, &session.target);
            let route_peer = route_peers.first().cloned();
            tracing::info!(
                session_id = %session.session_id,
                source_node_id = %source_node_id,
                target_node_id = %target_node_id,
                target_candidates = session.target.candidate_endpoints.len(),
                selected_candidate = route_peer.as_ref().map(|peer| peer.addr.as_str()).unwrap_or(""),
                "created/refreshed musu.pro rendezvous session for route attempt"
            );
            RendezvousPreparation {
                status: RendezvousStatus::Created,
                session_id: Some(session.session_id),
                route_peer,
                route_peers,
                target_candidate_count: session.target.candidate_endpoints.len(),
                failure_class: None,
            }
        }
        Ok(Err(err)) => {
            tracing::warn!(
                source_node_id = %source_node_id,
                target_node_id = %target_node_id,
                err = %err,
                "failed to create/refresh musu.pro rendezvous session; falling back to selected peer path"
            );
            RendezvousPreparation::failed(format!("rendezvous_error:{err}"))
        }
        Err(_) => {
            tracing::warn!(
                source_node_id = %source_node_id,
                target_node_id = %target_node_id,
                timeout_ms = rendezvous_timeout().as_millis(),
                "timed out creating/refreshing musu.pro rendezvous session; falling back to selected peer path"
            );
            RendezvousPreparation::failed("rendezvous_timeout")
        }
    }
}

pub fn spawn_publish_target_candidates(
    state: AppState,
    session_id: String,
    source_task_id: String,
    target_node_id: Option<String>,
) {
    tokio::spawn(async move {
        let musu_home = musu_home_from_state(&state).to_path_buf();
        match publish_local_candidates(&state, &musu_home, &session_id, target_node_id).await {
            Ok(()) => tracing::info!(
                session_id = %session_id,
                source_task_id = %source_task_id,
                "published local candidates to received rendezvous session"
            ),
            Err(err) => tracing::warn!(
                session_id = %session_id,
                source_task_id = %source_task_id,
                err = %err,
                "failed to publish local candidates to received rendezvous session"
            ),
        }
    });
}

async fn publish_local_candidates(
    state: &AppState,
    musu_home: &Path,
    session_id: &str,
    target_node_id: Option<String>,
) -> Result<()> {
    let cloud = account_cloud(musu_home).ok_or_else(|| anyhow!("rendezvous_no_account_token"))?;
    let req = local_candidate_request_for_node_id(
        &state.config,
        target_node_id.unwrap_or_else(|| state.config.node_name.clone()),
    );
    tokio::time::timeout(
        rendezvous_timeout(),
        cloud.add_rendezvous_candidates(session_id, &req),
    )
    .await
    .map_err(|_| anyhow!("rendezvous_timeout"))??;
    Ok(())
}

pub fn spawn_close_rendezvous_session(
    musu_home: PathBuf,
    session_id: String,
    context: &'static str,
    task_id: String,
) {
    tokio::spawn(async move {
        let Some(cloud) = account_cloud(&musu_home) else {
            tracing::debug!(
                task_id = %task_id,
                session_id = %session_id,
                context,
                "rendezvous close skipped; no account token"
            );
            return;
        };

        let result =
            tokio::time::timeout(rendezvous_timeout(), cloud.close_rendezvous(&session_id)).await;
        match result {
            Ok(Ok(())) => tracing::info!(
                task_id = %task_id,
                session_id = %session_id,
                context,
                "closed musu.pro rendezvous session"
            ),
            Ok(Err(err)) => tracing::warn!(
                task_id = %task_id,
                session_id = %session_id,
                context,
                err = %err,
                "failed to close musu.pro rendezvous session"
            ),
            Err(_) => tracing::warn!(
                task_id = %task_id,
                session_id = %session_id,
                context,
                "timed out closing musu.pro rendezvous session"
            ),
        }
    });
}

pub async fn request_relay_lease_after_direct_failure(
    state: &AppState,
    fallback_peer: &ResolvedPeer,
    session_id: Option<&str>,
    attempted_peers: &[ResolvedPeer],
    failure_class: &str,
    requested_capability: Option<&str>,
) -> RelayLeaseFallback {
    let Some(session_id) = session_id.filter(|value| !value.trim().is_empty()) else {
        tracing::debug!(
            peer = %fallback_peer.addr,
            "relay lease request skipped; no rendezvous session for failed direct route"
        );
        return RelayLeaseFallback::skipped_no_session();
    };

    let musu_home = musu_home_from_state(state);
    let Some(cloud) = account_cloud(musu_home) else {
        tracing::debug!(
            peer = %fallback_peer.addr,
            session_id,
            "relay lease request skipped; no account token"
        );
        return RelayLeaseFallback::skipped_no_token();
    };

    let req = relay_lease_request_for_direct_failure(
        &state.config,
        fallback_peer,
        session_id,
        attempted_peers,
        failure_class,
        requested_capability,
    );

    let result = tokio::time::timeout(rendezvous_timeout(), cloud.request_relay_lease(&req)).await;
    match result {
        Ok(Ok(response)) => {
            let lease_id = response.lease.as_ref().map(|lease| lease.lease_id.clone());
            if response.lease_issued {
                tracing::info!(
                    peer = %fallback_peer.addr,
                    session_id,
                    lease_id = lease_id.as_deref().unwrap_or(""),
                    policy = %response.policy,
                    "relay fallback lease issued after failed direct route"
                );
                RelayLeaseFallback {
                    status: RelayLeaseFallbackStatus::Issued,
                    lease_issued: true,
                    policy: Some(response.policy),
                    blockers: response.blockers,
                    lease_id,
                    failure_class: None,
                }
            } else {
                tracing::warn!(
                    peer = %fallback_peer.addr,
                    session_id,
                    policy = %response.policy,
                    blockers = ?response.blockers,
                    "relay fallback lease denied after failed direct route"
                );
                RelayLeaseFallback {
                    status: RelayLeaseFallbackStatus::Denied,
                    lease_issued: false,
                    policy: Some(response.policy),
                    blockers: response.blockers,
                    lease_id,
                    failure_class: Some("relay_lease_denied".to_string()),
                }
            }
        }
        Ok(Err(err)) => {
            tracing::warn!(
                peer = %fallback_peer.addr,
                session_id,
                err = %err,
                "relay fallback lease request failed"
            );
            RelayLeaseFallback::failed(format!("relay_lease_error:{err}"))
        }
        Err(_) => {
            tracing::warn!(
                peer = %fallback_peer.addr,
                session_id,
                timeout_ms = rendezvous_timeout().as_millis(),
                "relay fallback lease request timed out"
            );
            RelayLeaseFallback::timed_out()
        }
    }
}

pub async fn submit_relay_payload_after_lease(
    state: &AppState,
    relay: &RelayLeaseFallback,
    payload: &crate::cloud::P2pRelayPayloadRequest,
) -> RelayPayloadQueueOutcome {
    if !relay.lease_issued || !matches!(relay.status, RelayLeaseFallbackStatus::Issued) {
        return RelayPayloadQueueOutcome::not_attempted();
    }

    let Some(lease_id) = relay.lease_id.as_deref().filter(|value| !value.is_empty()) else {
        tracing::warn!("relay payload queue skipped after issued lease without lease id");
        return RelayPayloadQueueOutcome::failed("relay_payload_queue_missing_lease_id");
    };

    if lease_id != payload.lease_id {
        tracing::warn!(
            lease_id,
            payload_lease_id = %payload.lease_id,
            "relay payload queue skipped; lease id mismatch"
        );
        return RelayPayloadQueueOutcome::failed("relay_payload_queue_lease_mismatch");
    }

    let musu_home = musu_home_from_state(state);
    let Some(cloud) = account_cloud(musu_home) else {
        tracing::warn!(
            session_id = %payload.session_id,
            lease_id,
            "relay payload queue failed; account token unavailable after lease issue"
        );
        return RelayPayloadQueueOutcome::failed("relay_payload_queue_no_account_token");
    };

    let result =
        tokio::time::timeout(rendezvous_timeout(), cloud.submit_relay_payload(payload)).await;

    match result {
        Ok(Ok(response)) if response.ok && response.accepted && response.stored => {
            let outcome = RelayPayloadQueueOutcome::queued(response, payload);
            tracing::info!(
                session_id = %payload.session_id,
                lease_id,
                payload_id = outcome.payload_id.as_deref().unwrap_or(""),
                payload_sha256 = outcome.payload_sha256.as_deref().unwrap_or(""),
                payload_bytes = outcome.payload_bytes.unwrap_or(0),
                "relay payload queued after failed direct route"
            );
            outcome
        }
        Ok(Ok(response)) => {
            tracing::warn!(
                session_id = %payload.session_id,
                lease_id,
                response_ok = response.ok,
                accepted = response.accepted,
                stored = response.stored,
                release_grade = response.release_grade,
                release_grade_blockers = ?response.release_grade_blockers,
                "relay payload queue endpoint did not store payload"
            );
            RelayPayloadQueueOutcome::failed("relay_payload_queue_not_stored")
        }
        Ok(Err(_err)) => {
            tracing::warn!(
                session_id = %payload.session_id,
                lease_id,
                "relay payload queue request failed"
            );
            RelayPayloadQueueOutcome::failed("relay_payload_queue_failed")
        }
        Err(_) => {
            tracing::warn!(
                session_id = %payload.session_id,
                lease_id,
                timeout_ms = rendezvous_timeout().as_millis(),
                "relay payload queue request timed out"
            );
            RelayPayloadQueueOutcome::failed("relay_payload_queue_timeout")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_addr_from_url_preserves_host_port() {
        assert_eq!(
            endpoint_addr_from_url("http://192.168.1.20:8070/"),
            "192.168.1.20:8070"
        );
        assert_eq!(
            endpoint_addr_from_url("https://peer.example.test:443"),
            "peer.example.test:443"
        );
        assert_eq!(
            endpoint_addr_from_url("http://[fd7a:115c:a1e0::99]:8070/"),
            "[fd7a:115c:a1e0::99]:8070"
        );
    }

    fn release_relay_tunnel_payload_request() -> crate::cloud::P2pRelayPayloadRequest {
        crate::cloud::P2pRelayPayloadRequest {
            schema: "musu.relay_payload_envelope.v1".to_string(),
            session_id: "session-1".to_string(),
            lease_id: "lease-1".to_string(),
            source_node_id: "source-node".to_string(),
            target_node_id: "target-node".to_string(),
            tunnel_id: "relay-session-1-lease-1".to_string(),
            payload_kind: "forwarded_task_envelope".to_string(),
            payload_base64: "e30=".to_string(),
            payload_sha256: Some("a".repeat(64)),
            candidate_route_kinds: vec![crate::cloud::RouteKind::Relay],
            attempted_route_kinds: vec![crate::cloud::RouteKind::Lan],
        }
    }

    #[test]
    fn release_relay_tunnel_submission_contract_is_release_grade_and_fail_closed() {
        let contract = release_relay_tunnel_submission_contract();
        assert_eq!(contract.transport_kind, "quic_relay_tunnel");
        assert!(contract.release_grade);
        assert_eq!(contract.encryption, "quic_tls_1_3");
        assert_eq!(contract.transport_verified_by, "musu_quic_tls_transport");

        let payload = release_relay_tunnel_payload_request();
        validate_release_relay_tunnel_submission(
            "wss://relay.musu.pro/api/v1/relay/connect",
            "sha256:release-peer",
            &payload,
        )
        .expect("release relay tunnel submission contract");

        let mut missing_source_payload = payload.clone();
        missing_source_payload.source_node_id.clear();
        assert_eq!(
            validate_release_relay_tunnel_submission(
                "wss://relay.musu.pro/api/v1/relay/connect",
                "sha256:release-peer",
                &missing_source_payload
            )
            .unwrap_err(),
            "release_relay_tunnel_source_node_id_missing"
        );

        let mut missing_target_payload = payload.clone();
        missing_target_payload.target_node_id.clear();
        assert_eq!(
            validate_release_relay_tunnel_submission(
                "wss://relay.musu.pro/api/v1/relay/connect",
                "sha256:release-peer",
                &missing_target_payload
            )
            .unwrap_err(),
            "release_relay_tunnel_target_node_id_missing"
        );

        let mut missing_tunnel_payload = payload.clone();
        missing_tunnel_payload.tunnel_id.clear();
        assert_eq!(
            validate_release_relay_tunnel_submission(
                "wss://relay.musu.pro/api/v1/relay/connect",
                "sha256:release-peer",
                &missing_tunnel_payload
            )
            .unwrap_err(),
            "release_relay_tunnel_id_missing"
        );

        let mut preview_payload = payload.clone();
        preview_payload.payload_kind = "task_callback_envelope".to_string();
        assert_eq!(
            validate_release_relay_tunnel_submission(
                "wss://relay.musu.pro/api/v1/relay/connect",
                "sha256:release-peer",
                &preview_payload
            )
            .unwrap_err(),
            "release_relay_tunnel_payload_kind_not_forwarded_task_envelope"
        );

        assert_eq!(
            validate_release_relay_tunnel_submission(
                "https://relay.musu.pro/api/v1/relay/connect",
                "sha256:release-peer",
                &payload
            )
            .unwrap_err(),
            "release_relay_tunnel_relay_url_not_wss"
        );
        assert_eq!(
            validate_release_relay_tunnel_submission(
                "wss://relay.musu.pro/api/v1/relay/connect",
                "release-peer",
                &payload
            )
            .unwrap_err(),
            "release_relay_tunnel_peer_public_key_not_fingerprint"
        );

        let mut bad_hash_payload = payload;
        bad_hash_payload.payload_sha256 = Some("not-a-sha".to_string());
        assert_eq!(
            validate_release_relay_tunnel_submission(
                "wss://relay.musu.pro/api/v1/relay/connect",
                "sha256:release-peer",
                &bad_hash_payload
            )
            .unwrap_err(),
            "release_relay_tunnel_payload_sha256_invalid"
        );
    }

    #[test]
    fn local_candidate_request_records_bridge_http_capability() {
        let cfg = crate::bridge::config::BridgeConfig {
            bridge_host: "127.0.0.1".to_string(),
            bridge_port: 8070,
            public_url: Some("http://100.64.1.5:8070".to_string()),
            node_name: "test-node".to_string(),
            db_path: ":memory:".into(),
            audit_db_path: ":memory:".into(),
            nodes_toml_path: ".musu/nodes.toml".into(),
            token: "x".repeat(32),
            peer_token: None,
            localhost_auth_required: true,
            env: crate::bridge::config::AuthMode::Development,
            rate_limit_disabled: true,
            rate_limit_per_min: 0,
            allow_plaintext_lan: false,
            file_serve_roots: vec![],
            file_serve_writable: false,
            tls_enabled: false,
            tls_cert_path: None,
            tls_key_path: None,
        };

        let req = local_candidate_request(&cfg);
        assert_eq!(req.node_id, "test-node");
        assert_eq!(req.node_name.as_deref(), Some("test-node"));
        assert_eq!(req.app_version.as_deref(), Some(env!("CARGO_PKG_VERSION")));
        assert!(req.public_key.is_none());
        assert_eq!(req.candidate_endpoints[0].addr, "100.64.1.5:8070");
        assert_eq!(req.candidate_endpoints[0].scheme.as_deref(), Some("http"));
        assert_eq!(
            req.candidate_endpoints[0].kind,
            crate::cloud::RouteKind::Tailscale
        );
        assert_eq!(
            req.capabilities.as_ref().unwrap(),
            &vec!["bridge_http_forward".to_string()]
        );

        let override_req = local_candidate_request_for_node_id(&cfg, "100.64.1.5:8070".into());
        assert_eq!(override_req.node_id, "100.64.1.5:8070");
        assert_eq!(override_req.node_name.as_deref(), Some("test-node"));
    }

    #[test]
    fn local_candidate_endpoints_add_tailscale_and_direct_quic_metadata() {
        let candidates = local_candidate_endpoints_for_advertised_url(
            "https://203.0.113.10:8949",
            Some("100.64.1.20"),
            "2026-06-08T00:00:00Z",
        );

        assert_eq!(candidates.len(), 2);
        assert!(matches!(
            candidates[0].kind,
            crate::cloud::RouteKind::DirectQuic
        ));
        assert_eq!(
            candidates[0].public_addr.as_deref(),
            Some("203.0.113.10:8949")
        );
        assert!(matches!(
            candidates[0].nat_type,
            Some(crate::cloud::NatType::Unknown)
        ));
        assert!(matches!(
            candidates[1].kind,
            crate::cloud::RouteKind::Tailscale
        ));
        assert_eq!(candidates[1].addr, "100.64.1.20:8949");
        assert!(candidates[1].public_addr.is_none());
    }

    #[test]
    fn local_candidate_endpoints_include_all_lan_hosts_without_duplicates() {
        let candidates = local_candidate_endpoints_for_route_hosts(
            "http://192.168.1.154:8070",
            ["192.168.1.154", "192.168.1.192", "10.0.0.7"],
            Some("100.64.1.20"),
            "2026-06-27T00:00:00Z",
        );

        let addrs: Vec<&str> = candidates
            .iter()
            .map(|candidate| candidate.addr.as_str())
            .collect();
        assert_eq!(
            addrs,
            vec![
                "192.168.1.154:8070",
                "192.168.1.192:8070",
                "10.0.0.7:8070",
                "100.64.1.20:8070"
            ]
        );
        assert!(matches!(candidates[0].kind, crate::cloud::RouteKind::Lan));
        assert!(matches!(candidates[1].kind, crate::cloud::RouteKind::Lan));
        assert!(matches!(candidates[2].kind, crate::cloud::RouteKind::Lan));
        assert!(matches!(
            candidates[3].kind,
            crate::cloud::RouteKind::Tailscale
        ));
    }

    #[test]
    fn local_candidate_request_includes_existing_tls_fingerprint() {
        let dir = std::env::temp_dir().join(format!("musu-rv-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let paths = crate::install::tls::ensure_tls_certs(&dir, "test-node").unwrap();
        let expected = crate::install::tls::cert_sha256_fingerprint(&paths.cert_path).unwrap();

        let cfg = crate::bridge::config::BridgeConfig {
            bridge_host: "127.0.0.1".to_string(),
            bridge_port: 8070,
            public_url: Some("http://127.0.0.1:8070".to_string()),
            node_name: "test-node".to_string(),
            db_path: ":memory:".into(),
            audit_db_path: ":memory:".into(),
            nodes_toml_path: dir.join("nodes.toml"),
            token: "x".repeat(32),
            peer_token: None,
            localhost_auth_required: true,
            env: crate::bridge::config::AuthMode::Development,
            rate_limit_disabled: true,
            rate_limit_per_min: 0,
            allow_plaintext_lan: false,
            file_serve_roots: vec![],
            file_serve_writable: false,
            tls_enabled: false,
            tls_cert_path: None,
            tls_key_path: None,
        };

        let req = local_candidate_request(&cfg);
        assert_eq!(req.public_key.as_deref(), Some(expected.as_str()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn route_peer_from_target_candidates_prefers_best_direct_path() {
        let now = chrono::Utc::now().to_rfc3339();
        let target = crate::cloud::NodeCandidateSet {
            node_id: "target-node".to_string(),
            node_name: "target-node".to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            public_key: "sha256:test".to_string(),
            relay_capable: true,
            capabilities: vec!["bridge_http_forward".to_string()],
            candidate_endpoints: vec![
                crate::cloud::CandidateEndpoint {
                    kind: crate::cloud::RouteKind::DirectQuic,
                    addr: "203.0.113.10:8070".to_string(),
                    observed_at: now.clone(),
                    scheme: Some("https".to_string()),
                    public_addr: Some("203.0.113.10:8070".to_string()),
                    nat_type: Some(crate::cloud::NatType::OpenInternet),
                    nat_observed_by: Some("stun:musu.pro".to_string()),
                    relay_url: None,
                    relay_protocol: None,
                },
                crate::cloud::CandidateEndpoint {
                    kind: crate::cloud::RouteKind::Tailscale,
                    addr: "100.64.1.10:8070".to_string(),
                    observed_at: now.clone(),
                    scheme: Some("https".to_string()),
                    public_addr: None,
                    nat_type: None,
                    nat_observed_by: None,
                    relay_url: None,
                    relay_protocol: None,
                },
                crate::cloud::CandidateEndpoint {
                    kind: crate::cloud::RouteKind::Lan,
                    addr: "192.168.1.10:8070".to_string(),
                    observed_at: now,
                    scheme: Some("https".to_string()),
                    public_addr: None,
                    nat_type: None,
                    nat_observed_by: None,
                    relay_url: None,
                    relay_protocol: None,
                },
                crate::cloud::CandidateEndpoint {
                    kind: crate::cloud::RouteKind::Relay,
                    addr: "relay.musu.pro:443".to_string(),
                    observed_at: chrono::Utc::now().to_rfc3339(),
                    scheme: Some("https".to_string()),
                    public_addr: None,
                    nat_type: None,
                    nat_observed_by: None,
                    relay_url: Some("wss://relay.musu.pro/api/v1/relay/connect".to_string()),
                    relay_protocol: Some(crate::cloud::RelayProtocol::QuicRelayTunnel),
                },
            ],
        };

        let peer = route_peer_from_target_candidates("target-node", &target).unwrap();
        assert_eq!(peer.name.as_deref(), Some("target-node"));
        assert_eq!(peer.addr, "192.168.1.10:8070");
        assert_eq!(
            peer.meta
                .as_ref()
                .and_then(|meta| meta.get("peer_public_key"))
                .and_then(|value| value.as_str()),
            Some("sha256:test")
        );
        assert_eq!(
            peer.meta
                .as_ref()
                .and_then(|meta| meta.get("transport_scheme"))
                .and_then(|value| value.as_str()),
            Some("https")
        );
        assert_eq!(
            peer.meta
                .as_ref()
                .and_then(|meta| meta.get("selected_addr_source"))
                .and_then(|value| value.as_str()),
            Some("addr")
        );
        assert_eq!(
            peer.meta
                .as_ref()
                .and_then(|meta| meta.get("relay_candidates"))
                .and_then(|value| value.as_array())
                .and_then(|values| values.first())
                .and_then(|value| value.get("relay_url"))
                .and_then(|value| value.as_str()),
            Some("wss://relay.musu.pro/api/v1/relay/connect")
        );
        assert_eq!(
            peer.meta
                .as_ref()
                .and_then(|meta| meta.get("candidate_route_kinds"))
                .and_then(|value| value.as_array())
                .map(|values| {
                    values
                        .iter()
                        .filter_map(|value| value.as_str())
                        .collect::<Vec<_>>()
                }),
            Some(vec!["direct_quic", "tailscale", "lan", "relay"])
        );
    }

    #[test]
    fn route_peer_from_target_candidates_uses_direct_public_addr_and_preserves_nat_metadata() {
        let now = chrono::Utc::now().to_rfc3339();
        let target = crate::cloud::NodeCandidateSet {
            node_id: "target-node".to_string(),
            node_name: "target-node".to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            public_key: "sha256:test".to_string(),
            relay_capable: true,
            capabilities: vec!["bridge_http_forward".to_string()],
            candidate_endpoints: vec![
                crate::cloud::CandidateEndpoint {
                    kind: crate::cloud::RouteKind::DirectQuic,
                    addr: "10.0.0.10:8070".to_string(),
                    observed_at: now.clone(),
                    scheme: Some("https".to_string()),
                    public_addr: Some("203.0.113.10:8949".to_string()),
                    nat_type: Some(crate::cloud::NatType::Symmetric),
                    nat_observed_by: Some("stun:musu.pro".to_string()),
                    relay_url: None,
                    relay_protocol: None,
                },
                crate::cloud::CandidateEndpoint {
                    kind: crate::cloud::RouteKind::Relay,
                    addr: "relay.musu.pro:443".to_string(),
                    observed_at: now,
                    scheme: Some("https".to_string()),
                    public_addr: None,
                    nat_type: None,
                    nat_observed_by: None,
                    relay_url: Some("wss://relay.musu.pro/api/v1/relay/connect".to_string()),
                    relay_protocol: Some(crate::cloud::RelayProtocol::QuicRelayTunnel),
                },
            ],
        };

        let peer = route_peer_from_target_candidates("target-node", &target).unwrap();
        assert_eq!(peer.addr, "203.0.113.10:8949");
        let meta = peer.meta.as_ref().unwrap();
        assert_eq!(
            meta.get("candidate_addr").and_then(|value| value.as_str()),
            Some("10.0.0.10:8070")
        );
        assert_eq!(
            meta.get("selected_addr_source")
                .and_then(|value| value.as_str()),
            Some("public_addr")
        );
        assert_eq!(
            meta.get("public_addr").and_then(|value| value.as_str()),
            Some("203.0.113.10:8949")
        );
        assert_eq!(
            meta.get("nat_type").and_then(|value| value.as_str()),
            Some("symmetric")
        );
        assert_eq!(
            meta.get("nat_observed_by").and_then(|value| value.as_str()),
            Some("stun:musu.pro")
        );
        assert_eq!(
            meta.get("relay_candidates")
                .and_then(|value| value.as_array())
                .and_then(|values| values.first())
                .and_then(|value| value.get("relay_protocol"))
                .and_then(|value| value.as_str()),
            Some("quic_relay_tunnel")
        );
    }

    #[test]
    fn relay_lease_request_records_failed_direct_paths_without_using_relay_as_default() {
        let cfg = crate::bridge::config::BridgeConfig {
            bridge_host: "127.0.0.1".to_string(),
            bridge_port: 8070,
            public_url: Some("http://127.0.0.1:8070".to_string()),
            node_name: "source-node".to_string(),
            db_path: ":memory:".into(),
            audit_db_path: ":memory:".into(),
            nodes_toml_path: ".musu/nodes.toml".into(),
            token: "x".repeat(32),
            peer_token: None,
            localhost_auth_required: true,
            env: crate::bridge::config::AuthMode::Development,
            rate_limit_disabled: true,
            rate_limit_per_min: 0,
            allow_plaintext_lan: false,
            file_serve_roots: vec![],
            file_serve_writable: false,
            tls_enabled: false,
            tls_cert_path: None,
            tls_key_path: None,
        };
        let fallback_peer = ResolvedPeer {
            addr: "203.0.113.10:8070".to_string(),
            name: Some("target-node".to_string()),
            source: crate::peer::discovery::PeerSource::Registry,
            meta: None,
        };
        let attempted = vec![
            ResolvedPeer {
                addr: "192.168.1.10:8070".to_string(),
                name: Some("target-node".to_string()),
                source: crate::peer::discovery::PeerSource::Registry,
                meta: None,
            },
            ResolvedPeer {
                addr: "100.64.1.10:8070".to_string(),
                name: Some("target-node".to_string()),
                source: crate::peer::discovery::PeerSource::Registry,
                meta: None,
            },
            fallback_peer.clone(),
        ];

        let req = relay_lease_request_for_direct_failure(
            &cfg,
            &fallback_peer,
            "rv_test",
            &attempted,
            "forward_failed_after_retries",
            Some("remote_command"),
        );

        assert_eq!(req.session_id, "rv_test");
        assert_eq!(req.source_node_id, "source-node");
        assert_eq!(req.target_node_id, "target-node");
        assert_eq!(req.requested_capability.as_deref(), Some("remote_command"));
        assert_eq!(
            req.attempted_route_kinds,
            vec![
                crate::cloud::RouteKind::Lan,
                crate::cloud::RouteKind::Tailscale,
                crate::cloud::RouteKind::DirectQuic,
            ]
        );
        assert!(req.direct_path_failed);
        assert_eq!(
            req.failure_class.as_deref(),
            Some("forward_failed_after_retries")
        );
    }
}
