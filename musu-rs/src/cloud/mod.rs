//! musu.pro Cloud API Client — V27 Account-based auto-connection.
//!
//! Handles device authentication, heartbeat registration, and
//! discovering other nodes belonging to the same account.

pub mod token;

use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// The main cloud client.
#[derive(Clone)]
pub struct MusuCloud {
    base_url: String,
    token: Option<String>,
    client: Client,
}

pub fn base_url_from_env() -> String {
    std::env::var("MUSU_CLOUD_BASE_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "https://musu.pro".to_string())
}

fn summarize_cloud_error_body(content_type: Option<&str>, body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return "empty response body".to_string();
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(message) = value
            .get("error")
            .and_then(serde_json::Value::as_str)
            .or_else(|| value.get("message").and_then(serde_json::Value::as_str))
        {
            return message.trim().to_string();
        }
    }

    let looks_like_html = content_type
        .map(|value| value.contains("text/html"))
        .unwrap_or(false)
        || trimmed.starts_with("<!DOCTYPE html")
        || trimmed.starts_with("<html")
        || trimmed.contains("<html");
    if looks_like_html {
        return "returned HTML instead of API JSON; the MUSU.PRO endpoint may be missing or routed to the landing site".to_string();
    }

    let first_line = trimmed.lines().next().unwrap_or(trimmed).trim();
    const MAX_CHARS: usize = 200;
    if first_line.chars().count() <= MAX_CHARS {
        return first_line.to_string();
    }

    let truncated: String = first_line.chars().take(MAX_CHARS).collect();
    format!("{truncated}...")
}

async fn cloud_api_error(label: &str, url: &str, resp: reqwest::Response) -> anyhow::Error {
    let status = resp.status();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let body = resp.text().await.unwrap_or_default();
    let detail = summarize_cloud_error_body(content_type.as_deref(), &body);
    anyhow!("{label} at {url} failed with HTTP {status}: {detail}")
}

#[derive(Debug, Deserialize)]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    #[serde(default, alias = "interval_seconds", alias = "poll_interval_sec")]
    pub interval: Option<u32>,
}

impl DeviceCodeResponse {
    pub fn poll_interval_secs(&self) -> u32 {
        self.interval.unwrap_or(5).max(5)
    }

    pub fn poll_interval(&self) -> std::time::Duration {
        std::time::Duration::from_secs(self.poll_interval_secs() as u64)
    }
}

#[derive(Debug, Deserialize)]
pub struct DevicePollResponse {
    pub token: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Serialize, Default)]
pub struct RegisterNodeRequest {
    pub node_name: String,
    pub public_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cert_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub machine_group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mac_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broadcast_ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)] // Full cloud DTO; some fields are retained for diagnostics/API parity.
pub struct RegistryNode {
    pub id: String,
    pub user_id: String,
    pub node_name: String,
    pub public_url: String,
    #[serde(default)]
    pub cert_fingerprint: Option<String>,
    pub last_seen: String,
    pub meta: Option<serde_json::Value>,
}

/// Response of `POST /api/account/mesh-join-key`: a one-time Headscale preauth
/// key bound to the caller's account, plus the login server to join. The cloud
/// derives the account from the bearer token; the client never supplies it.
#[derive(Debug, Deserialize, Clone)]
pub struct MeshJoinKey {
    pub login_server: String,
    pub authkey: String,
    pub tailnet: String,
}

/// One node in the owner's fleet, as returned by `POST /api/account/mesh-node-action`
/// {action:"list"}. `id` is the authoritative Headscale node id — rename keys on it
/// (resolve→confirm-by-id; never re-resolve by name/IP, WS-2c Critic HIGH-1).
#[derive(Debug, Deserialize, Clone)]
pub struct MeshNode {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub ips: Vec<String>,
    #[serde(default)]
    pub online: bool,
    #[serde(default)]
    pub last_seen: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MeshNodeList {
    #[serde(default)]
    pub nodes: Vec<MeshNode>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MeshNodeRenamed {
    pub node: MeshNodeRenamedInner,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MeshNodeRenamedInner {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MeshNodeRemoved {
    #[serde(default)]
    pub removed: bool,
    #[serde(default)]
    pub already_gone: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
#[serde(rename_all = "snake_case")]
pub enum RouteKind {
    Lan,
    Tailscale,
    DirectQuic,
    Relay,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
#[serde(rename_all = "snake_case")]
pub enum NatType {
    Unknown,
    OpenInternet,
    FullCone,
    RestrictedCone,
    PortRestrictedCone,
    Symmetric,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
#[serde(rename_all = "snake_case")]
pub enum RelayProtocol {
    QuicRelayTunnel,
    #[serde(rename = "quic_tls_1_3")]
    QuicTls13,
    WebsocketTunnel,
    StoreForwardQueue,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
#[serde(rename_all = "snake_case")]
pub enum RouteAttemptResult {
    Success,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
pub struct CandidateEndpoint {
    pub kind: RouteKind,
    pub addr: String,
    pub observed_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_addr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nat_type: Option<NatType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nat_observed_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_protocol: Option<RelayProtocol>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
pub struct NodeCandidateSet {
    pub node_id: String,
    pub node_name: String,
    pub app_version: String,
    pub candidate_endpoints: Vec<CandidateEndpoint>,
    pub relay_capable: bool,
    pub public_key: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[allow(dead_code)] // Room presence DTO; used by CLI and future bridge heartbeat wiring.
#[serde(rename_all = "snake_case")]
pub enum RoomPresenceStatus {
    Online,
    Idle,
    Busy,
    Offline,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Room presence publish DTO.
pub struct RoomPresenceRequest {
    pub node_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<RoomPresenceStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub active_work_order_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub candidate_endpoints: Vec<CandidateEndpoint>,
    #[serde(default)]
    pub relay_capable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub capabilities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Room presence stored record DTO.
pub struct RoomPresenceRecord {
    pub schema: String,
    pub owner_key: String,
    pub room_id: String,
    pub node_id: String,
    pub node_name: String,
    pub app_version: String,
    pub status: RoomPresenceStatus,
    #[serde(default)]
    pub company_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub source_agent_id: Option<String>,
    #[serde(default)]
    pub active_work_order_ids: Vec<String>,
    #[serde(default)]
    pub candidate_endpoints: Vec<CandidateEndpoint>,
    pub relay_capable: bool,
    pub public_key: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub origin: String,
    pub last_seen_at: String,
    pub expires_at: String,
    pub heartbeat_ttl_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Room presence publish API response DTO.
pub struct RoomPresencePublishResponse {
    pub ok: bool,
    pub room_id: String,
    pub presence: RoomPresenceRecord,
    #[serde(default)]
    pub candidate_cache_seeded: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[allow(dead_code)] // Room presence query DTO.
pub struct RoomPresenceQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<RoomPresenceStatus>,
    #[serde(default)]
    pub include_expired: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Room presence query API response DTO.
pub struct RoomPresenceQueryResponse {
    pub ok: bool,
    pub room_id: String,
    pub presence_order: String,
    pub count: usize,
    #[serde(default)]
    pub presence: Vec<RoomPresenceRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Room work-order inbox record DTO.
pub struct RoomWorkOrderRecord {
    pub schema: String,
    pub work_order_id: String,
    pub room_id: String,
    #[serde(default)]
    pub company_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub target_node: Option<String>,
    #[serde(default)]
    pub source_agent_id: Option<String>,
    pub sender_id: String,
    pub channel: String,
    #[serde(default)]
    pub adapter_type: Option<String>,
    #[serde(default)]
    pub workspace_uri: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    pub instruction: String,
    #[serde(default)]
    pub permission_envelope: Option<serde_json::Value>,
    #[serde(default)]
    pub trace_id: Option<String>,
    pub origin: String,
    pub delivery_mode: String,
    pub status: String,
    pub created_at: String,
    pub expires_at: String,
    #[serde(default)]
    pub claimed_by: Option<String>,
    #[serde(default)]
    pub claimed_at: Option<String>,
    #[serde(default)]
    pub bridge_task_id: Option<String>,
    #[serde(default)]
    pub bridge_status: Option<String>,
    #[serde(default)]
    pub terminal_at: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for local Desktop claiming owner-scoped room work orders.
pub struct RoomWorkOrderClaimRequest {
    pub schema: String,
    pub target_node_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claimant_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub work_order_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for room work-order claim responses.
pub struct RoomWorkOrderClaimResponse {
    pub schema: String,
    pub ok: bool,
    pub room_id: String,
    pub owner_scoped: bool,
    pub claimed: bool,
    pub count: usize,
    pub target_node: String,
    #[serde(default)]
    pub work_orders: Vec<RoomWorkOrderRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for local Desktop reporting room work-order handoff state.
pub struct RoomWorkOrderDeliveryRequest {
    pub schema: String,
    pub work_order_id: String,
    pub target_node_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bridge_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bridge_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for room work-order delivery acknowledgements.
pub struct RoomWorkOrderDeliveryResponse {
    pub schema: String,
    pub ok: bool,
    pub room_id: String,
    pub owner_scoped: bool,
    pub accepted: bool,
    pub requeued: bool,
    pub failed: bool,
    pub work_order: RoomWorkOrderRecord,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
pub struct P2pRendezvousRequest {
    pub source_node_id: String,
    pub target_node_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_capability: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
pub struct P2pRendezvousSession {
    pub session_id: String,
    pub source: NodeCandidateSet,
    pub target: NodeCandidateSet,
    pub expires_at: String,
    #[serde(default)]
    pub approval_required: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
pub struct P2pRendezvousCandidatesRequest {
    pub node_id: String,
    pub candidate_endpoints: Vec<CandidateEndpoint>,
    pub relay_capable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Relay control-plane DTO; transport is wired separately.
pub struct P2pRelayLeaseRequest {
    pub session_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_capability: Option<String>,
    pub attempted_route_kinds: Vec<RouteKind>,
    pub direct_path_failed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_class: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Relay lease API response DTO; tunnel transport remains a release blocker.
pub struct P2pRelayLease {
    pub lease_id: String,
    pub session_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relay_url: String,
    pub route_kind: RouteKind,
    pub payload_transited_musu_infra: bool,
    pub default_data_path: bool,
    pub policy: String,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Relay lease API response DTO; used by diagnostics/runtime after transport lands.
pub struct P2pRelayLeaseResponse {
    pub ok: bool,
    pub lease_issued: bool,
    pub owner_scoped: bool,
    pub relay_control_plane_wired: bool,
    pub relay_transport_wired: bool,
    pub relay_default_data_path: bool,
    pub policy: String,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub lease: Option<P2pRelayLease>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[allow(dead_code)] // Relay lease query DTO; used by CLI diagnostics and operator evidence.
pub struct P2pRelayLeaseQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_node_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Relay lease query API response DTO.
pub struct P2pRelayLeaseQueryResponse {
    pub ok: bool,
    pub owner_scoped: bool,
    pub relay_control_plane_wired: bool,
    pub relay_transport_wired: bool,
    #[serde(default)]
    pub relay_default_data_path: bool,
    #[serde(default)]
    pub relay_lease_store_configured: bool,
    #[serde(default)]
    pub relay_lease_store_backend: Option<String>,
    #[serde(default)]
    pub relay_lease_store_release_grade: bool,
    pub count: usize,
    #[serde(default)]
    pub leases: Vec<P2pRelayLease>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Relay transport preflight DTO; used by CLI diagnostics and release evidence.
pub struct P2pRelayTransportResponse {
    pub schema: String,
    pub ok: bool,
    pub owner_scoped: bool,
    pub relay_control_plane_wired: bool,
    pub relay_transport_descriptor_wired: bool,
    pub relay_transport_wired: bool,
    #[serde(default)]
    pub relay_connect_endpoint_wired: bool,
    #[serde(default)]
    pub relay_payload_endpoint_wired: bool,
    #[serde(default)]
    pub relay_payload_queue_endpoint_wired: bool,
    #[serde(default)]
    pub relay_default_data_path: bool,
    #[serde(default)]
    pub relay_url: String,
    #[serde(default)]
    pub relay_connect_path: String,
    #[serde(default)]
    pub relay_transport_kind: String,
    #[serde(default)]
    pub release_grade_transport_required: String,
    #[serde(default)]
    pub payload_transit_requires_lease: bool,
    #[serde(default)]
    pub policy: String,
    #[serde(default)]
    pub relay_lease_store_configured: bool,
    #[serde(default)]
    pub relay_lease_store_backend: Option<String>,
    #[serde(default)]
    pub relay_lease_store_release_grade: bool,
    #[serde(default)]
    pub blockers: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[allow(dead_code)] // Route evidence query DTO; used by relay diagnostics and release evidence.
pub struct RouteEvidenceQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_kind: Option<RouteKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<RouteAttemptResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_grade: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Route evidence query API record DTO.
pub struct RouteEvidenceRecord {
    pub id: String,
    pub received_at: String,
    pub release_grade: bool,
    #[serde(default)]
    pub blockers: Vec<String>,
    pub evidence: RouteEvidence,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Route evidence query API response DTO.
pub struct RouteEvidenceQueryResponse {
    pub ok: bool,
    pub owner_scoped: bool,
    pub count: usize,
    #[serde(default)]
    pub records: Vec<RouteEvidenceRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
pub struct RouteRelayTransportProof {
    pub schema: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub transport_kind: String,
    pub relay_url: String,
    pub tunnel_id: String,
    pub handshake_ms: u64,
    pub payload_bytes_transited: u64,
    pub payload_transited_musu_infra: bool,
    pub peer_identity_verified: bool,
    pub peer_identity_method: String,
    pub peer_public_key: String,
    pub encryption: String,
    pub transport_verified_by: String,
    pub opened_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // P2P route evidence DTO; used when relay payload delivery proof is attached.
pub struct RouteRelayPayloadDeliveryProof {
    pub schema: String,
    pub payload_id: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relay_url: String,
    pub tunnel_id: String,
    pub payload_kind: String,
    pub transport_kind: String,
    pub relay_default_data_path: bool,
    pub release_grade: bool,
    pub payload_sha256: String,
    pub payload_bytes: u64,
    pub claimed_by: String,
    pub claimed_at: String,
    pub created_at: String,
    pub delivered_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Runtime relay/tunnel code records this after actual payload transit lands.
pub struct P2pRelayTransportProofRequest {
    pub schema: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub transport_kind: String,
    pub relay_url: String,
    pub tunnel_id: String,
    pub handshake_ms: u64,
    pub payload_bytes_transited: u64,
    pub payload_transited_musu_infra: bool,
    pub peer_identity_verified: bool,
    pub peer_identity_method: String,
    pub peer_public_key: String,
    pub encryption: String,
    pub transport_verified_by: String,
    pub opened_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for relay transport proof recording API.
pub struct P2pRelayTransportProofStoredRecord {
    pub proof_id: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relay_url: String,
    pub tunnel_id: String,
    pub transport_kind: String,
    pub handshake_ms: u64,
    pub payload_bytes_transited: u64,
    pub payload_transited_musu_infra: bool,
    pub peer_identity_verified: bool,
    pub peer_identity_method: String,
    pub peer_public_key: String,
    pub encryption: String,
    pub transport_verified_by: String,
    pub release_grade: bool,
    pub opened_at: String,
    #[serde(default)]
    pub closed_at: Option<String>,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for relay transport proof recording API.
pub struct P2pRelayTransportProofResponse {
    pub ok: bool,
    pub accepted: bool,
    pub stored: bool,
    pub owner_scoped: bool,
    pub release_grade: bool,
    pub relay_transport_proof_store_configured: bool,
    pub relay_transport_proof_store_backend: String,
    pub relay_transport_proof_store_release_grade: bool,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub proof: Option<P2pRelayTransportProofStoredRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2pRelayPayloadRequest {
    pub schema: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub tunnel_id: String,
    pub payload_kind: String,
    pub payload_base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub candidate_route_kinds: Vec<RouteKind>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attempted_route_kinds: Vec<RouteKind>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for the lease-bound relay payload queue preview API.
pub struct P2pRelayPayloadStoredRecord {
    pub payload_id: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relay_url: String,
    pub tunnel_id: String,
    pub payload_kind: String,
    pub payload_bytes: u64,
    pub payload_sha256: String,
    pub status: String,
    pub relay_default_data_path: bool,
    pub release_grade: bool,
    pub transport_kind: String,
    pub created_at: String,
    pub expires_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claimed_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claimed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivered_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_base64: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub candidate_route_kinds: Vec<RouteKind>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attempted_route_kinds: Vec<RouteKind>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for the lease-bound relay payload queue preview API.
pub struct P2pRelayPayloadResponse {
    pub ok: bool,
    pub accepted: bool,
    pub stored: bool,
    pub owner_scoped: bool,
    pub relay_payload_queue_endpoint_wired: bool,
    pub relay_default_data_path: bool,
    pub payload_transit_requires_lease: bool,
    pub release_grade: bool,
    #[serde(default)]
    pub release_grade_blockers: Vec<String>,
    pub relay_payload_store_configured: bool,
    pub relay_payload_store_backend: String,
    pub relay_payload_store_release_grade: bool,
    #[serde(default)]
    pub payload: Option<P2pRelayPayloadStoredRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[allow(dead_code)] // Relay payload query DTO; used by relay diagnostics and target polling.
pub struct P2pRelayPayloadQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tunnel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default)]
    pub include_payload: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for querying the lease-bound relay payload queue preview API.
pub struct P2pRelayPayloadQueryResponse {
    pub schema: String,
    pub ok: bool,
    pub owner_scoped: bool,
    pub relay_payload_queue_endpoint_wired: bool,
    pub relay_default_data_path: bool,
    pub release_grade: bool,
    pub relay_payload_store_configured: bool,
    pub relay_payload_store_backend: String,
    pub relay_payload_store_release_grade: bool,
    pub count: usize,
    #[serde(default)]
    pub payloads: Vec<P2pRelayPayloadStoredRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for target-side relay payload claiming.
pub struct P2pRelayPayloadClaimRequest {
    pub schema: String,
    pub target_node_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claimant_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tunnel_id: Option<String>,
    #[serde(default)]
    pub include_payload: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for target-side relay payload claim responses.
pub struct P2pRelayPayloadClaimResponse {
    pub schema: String,
    pub ok: bool,
    pub owner_scoped: bool,
    pub accepted: bool,
    pub claimed: bool,
    pub relay_payload_queue_endpoint_wired: bool,
    pub relay_default_data_path: bool,
    pub release_grade: bool,
    pub relay_payload_store_configured: bool,
    pub relay_payload_store_backend: String,
    pub relay_payload_store_release_grade: bool,
    pub count: usize,
    #[serde(default)]
    pub payloads: Vec<P2pRelayPayloadStoredRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for target-side relay payload delivery acknowledgement.
pub struct P2pRelayPayloadDeliveryRequest {
    pub schema: String,
    pub payload_id: String,
    pub target_node_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // DTO for target-side relay payload delivery responses.
pub struct P2pRelayPayloadDeliveryResponse {
    pub schema: String,
    pub ok: bool,
    pub owner_scoped: bool,
    pub accepted: bool,
    pub delivered: bool,
    pub relay_default_data_path: bool,
    pub release_grade: bool,
    pub relay_payload_store_configured: bool,
    pub relay_payload_store_backend: String,
    pub relay_payload_store_release_grade: bool,
    #[serde(default)]
    pub payload: Option<P2pRelayPayloadStoredRecord>,
    #[serde(default)]
    pub relay_transport_proof: Option<RouteRelayTransportProof>,
    #[serde(default)]
    pub delivery_proof: Option<RouteRelayPayloadDeliveryProof>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // P2P control-plane DTO; wired after the route selector lands.
pub struct RouteEvidence {
    pub schema: String,
    pub version: String,
    pub source_node_id: String,
    pub target_node_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub route_kind: RouteKind,
    pub candidate_addr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handshake_ms: Option<u64>,
    pub total_attempt_ms: u64,
    pub peer_identity_verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_identity_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_public_key: Option<String>,
    pub encryption: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_verified_by: Option<String>,
    pub payload_transited_musu_infra: bool,
    pub result: RouteAttemptResult,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_fallback: Option<RouteRelayFallbackEvidence>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_transport_proof: Option<RouteRelayTransportProof>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_payload_delivery_proof: Option<RouteRelayPayloadDeliveryProof>,
    pub recorded_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Route evidence addendum; relay transport remains wired separately.
pub struct RouteRelayFallbackEvidence {
    pub direct_path_failed: bool,
    pub lease_requested: bool,
    pub status: String,
    pub lease_issued: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub candidate_route_kinds: Vec<RouteKind>,
    pub attempted_route_kinds: Vec<RouteKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_capability: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policy: Option<String>,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_class: Option<String>,
    #[serde(default)]
    pub payload_transport_attempted: bool,
    #[serde(default)]
    pub payload_transport_proven: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_transport_failure_class: Option<String>,
}

impl MusuCloud {
    /// Creates a new cloud client.
    pub fn new(base_url: &str, token: Option<String>) -> Self {
        Self {
            base_url: base_url.to_string(),
            token,
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
        }
    }

    /// POST /api/v1/auth/device to start the device code login flow.
    pub async fn initiate_device_login(&self, node_name: &str) -> Result<DeviceCodeResponse> {
        let url = format!("{}/api/v1/auth/device", self.base_url);
        let resp = self
            .client
            .post(&url)
            .json(&serde_json::json!({ "node_name": node_name }))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to initiate login", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// POST /api/v1/auth/device with `{device_code}` in the body to poll for
    /// completion. H-2: the device_code is the poll secret and the response
    /// carries the real control token, so it must NOT travel in the query string
    /// (query strings leak to CDN/proxy/access logs). Send it in the JSON body.
    pub async fn poll_device_token(&self, device_code: &str) -> Result<Option<String>> {
        let url = format!("{}/api/v1/auth/device", self.base_url);
        let resp = self
            .client
            .post(&url)
            .json(&serde_json::json!({ "device_code": device_code }))
            .send()
            .await?;

        let status = resp.status();

        if status == reqwest::StatusCode::GONE {
            return Err(anyhow!("Code expired"));
        }

        // Distinguish retryable from terminal non-success. The server returns 202
        // while the device is unapproved (the common poll case), 410 when the code
        // is expired/consumed (handled above), and 400 when the device_code is
        // malformed — which retrying can never fix. Previously EVERY non-success
        // collapsed to Ok(None) "pending", so a 400 (or a misrouted request) would
        // silently spin for the whole 900s expiry before failing with a generic
        // timeout. Treat 202 + transient 408/429/5xx as retryable; treat other 4xx
        // (esp. 400) as terminal so login fails fast and actionably.
        if !status.is_success() {
            if status == reqwest::StatusCode::ACCEPTED
                || status == reqwest::StatusCode::REQUEST_TIMEOUT
                || status == reqwest::StatusCode::TOO_MANY_REQUESTS
                || status.is_server_error()
            {
                return Ok(None); // still pending / transient — keep polling
            }
            return Err(anyhow!("Login poll rejected with HTTP {}", status.as_u16()));
        }

        let body: DevicePollResponse = resp.json().await?;
        if let Some(token) = body.token {
            return Ok(Some(token));
        }
        if let Some(status) = body.status.as_deref() {
            tracing::debug!(status, "device login still pending");
        }

        Ok(None)
    }

    /// POST /api/v1/nodes/register to register this node.
    pub async fn register_node(&self, req: RegisterNodeRequest) -> Result<RegistryNode> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/nodes/register", self.base_url);

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&req)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to register node", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// POST /api/account/mesh-join-key to mint a one-time mesh preauth key for
    /// the logged-in account. Used by "account login = automatic mesh join":
    /// after login the desktop calls this, then runs `tailscale up` with the
    /// returned login_server + authkey. The account is derived server-side from
    /// the bearer token, so nothing about identity is sent in the body.
    pub async fn request_mesh_join_key(&self) -> Result<MeshJoinKey> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/account/mesh-join-key", self.base_url);

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&serde_json::json!({}))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to request mesh join key", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// POST /api/account/mesh-node-action {action:"list"} — the owner's fleet
    /// nodes (id+name+ips+online), scoped server-side to the account. The id is
    /// the Headscale node id rename must use (resolve→confirm-by-id, WS-2c).
    pub async fn list_mesh_nodes(&self) -> Result<MeshNodeList> {
        let token = self.token.as_ref().ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/account/mesh-node-action", self.base_url);
        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&serde_json::json!({ "action": "list" }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to list mesh nodes", &url, resp).await);
        }
        Ok(resp.json().await?)
    }

    /// POST /api/account/mesh-node-action {action:"rename"} — rename a node BY ID.
    /// The server re-asserts the node still belongs to the account before renaming
    /// (never re-resolves by name/IP — WS-2c Critic HIGH-1/HIGH-2).
    pub async fn rename_mesh_node(&self, node_id: &str, new_name: &str) -> Result<MeshNodeRenamed> {
        let token = self.token.as_ref().ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/account/mesh-node-action", self.base_url);
        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&serde_json::json!({
                "action": "rename",
                "node_id": node_id,
                "new_name": new_name,
            }))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to rename mesh node", &url, resp).await);
        }
        Ok(resp.json().await?)
    }

    /// POST /api/account/mesh-node-action {action:"remove"} — ONE-WAY evict a node
    /// BY ID. `expected_name` is the name the user confirmed (optimistic
    /// concurrency); `caller_ip` lets the server refuse evicting this machine
    /// itself (WS-2c HIGH-3). Server enforces owner-scope + idempotent 404.
    pub async fn remove_mesh_node(
        &self,
        node_id: &str,
        expected_name: &str,
        caller_ip: Option<&str>,
    ) -> Result<MeshNodeRemoved> {
        let token = self.token.as_ref().ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/account/mesh-node-action", self.base_url);
        let mut body = serde_json::json!({
            "action": "remove",
            "node_id": node_id,
            "expected_name": expected_name,
        });
        if let Some(ip) = caller_ip {
            body["caller_ip"] = serde_json::Value::String(ip.to_string());
        }
        let resp = self.client.post(&url).bearer_auth(token).json(&body).send().await?;
        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to remove mesh node", &url, resp).await);
        }
        Ok(resp.json().await?)
    }

    /// GET /api/v1/nodes to list sibling nodes.
    pub async fn list_nodes(&self) -> Result<Vec<RegistryNode>> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/nodes", self.base_url);

        let resp = self.client.get(&url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to list nodes", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    fn room_presence_url(&self, room_id: &str) -> Result<reqwest::Url> {
        let mut url = reqwest::Url::parse(&self.base_url)?;
        url.path_segments_mut()
            .map_err(|_| anyhow!("invalid cloud base URL"))?
            .extend(["api", "rooms", room_id, "presence"]);
        Ok(url)
    }

    fn room_work_orders_url(&self, room_id: &str) -> Result<reqwest::Url> {
        let mut url = reqwest::Url::parse(&self.base_url)?;
        url.path_segments_mut()
            .map_err(|_| anyhow!("invalid cloud base URL"))?
            .extend(["api", "rooms", room_id, "work-orders"]);
        Ok(url)
    }

    /// POST /api/rooms/:roomId/presence to publish current local executor presence.
    pub async fn publish_room_presence(
        &self,
        room_id: &str,
        req: &RoomPresenceRequest,
    ) -> Result<RoomPresencePublishResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = self.room_presence_url(room_id)?;

        let resp = self
            .client
            .post(url.clone())
            .bearer_auth(token)
            .json(req)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(
                cloud_api_error("Failed to publish room presence", url.as_ref(), resp).await,
            );
        }

        Ok(resp.json().await?)
    }

    /// GET /api/rooms/:roomId/presence to inspect owner-scoped current room presence.
    pub async fn query_room_presence(
        &self,
        room_id: &str,
        query: &RoomPresenceQuery,
    ) -> Result<RoomPresenceQueryResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let mut url = self.room_presence_url(room_id)?;
        {
            let mut pairs = url.query_pairs_mut();
            if let Some(limit) = query.limit {
                pairs.append_pair("limit", &limit.to_string());
            }
            if let Some(company_id) = query.company_id.as_deref() {
                pairs.append_pair("company_id", company_id);
            }
            if let Some(project_id) = query.project_id.as_deref() {
                pairs.append_pair("project_id", project_id);
            }
            if let Some(node_id) = query.node_id.as_deref() {
                pairs.append_pair("node_id", node_id);
            }
            if let Some(source_agent_id) = query.source_agent_id.as_deref() {
                pairs.append_pair("source_agent_id", source_agent_id);
            }
            if let Some(status) = query.status.as_ref() {
                pairs.append_pair("status", room_presence_status_query_value(status));
            }
            if query.include_expired {
                pairs.append_pair("include_expired", "true");
            }
        }

        let resp = self
            .client
            .get(url.clone())
            .bearer_auth(token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to query room presence", url.as_ref(), resp).await);
        }

        Ok(resp.json().await?)
    }

    /// PATCH /api/rooms/:roomId/work-orders to claim queued owner-scoped work.
    pub async fn claim_room_work_orders(
        &self,
        room_id: &str,
        claim: &RoomWorkOrderClaimRequest,
    ) -> Result<RoomWorkOrderClaimResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = self.room_work_orders_url(room_id)?;

        let resp = self
            .client
            .patch(url.clone())
            .bearer_auth(token)
            .json(claim)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(
                cloud_api_error("Failed to claim room work orders", url.as_ref(), resp).await,
            );
        }

        Ok(resp.json().await?)
    }

    /// PATCH /api/rooms/:roomId/work-orders to ack or requeue claimed work.
    pub async fn submit_room_work_order_delivery(
        &self,
        room_id: &str,
        delivery: &RoomWorkOrderDeliveryRequest,
    ) -> Result<RoomWorkOrderDeliveryResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = self.room_work_orders_url(room_id)?;

        let resp = self
            .client
            .patch(url.clone())
            .bearer_auth(token)
            .json(delivery)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error(
                "Failed to submit room work-order delivery",
                url.as_ref(),
                resp,
            )
            .await);
        }

        Ok(resp.json().await?)
    }

    /// POST /api/v1/p2p/rendezvous to start assisted endpoint exchange.
    #[allow(dead_code)] // Wired after bridge path selection starts using rendezvous.
    pub async fn create_rendezvous(
        &self,
        req: &P2pRendezvousRequest,
    ) -> Result<P2pRendezvousSession> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/rendezvous", self.base_url);

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(req)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to create rendezvous", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// GET /api/v1/p2p/rendezvous/:id to refresh session state.
    #[allow(dead_code)] // Wired after bridge path selection starts using rendezvous.
    pub async fn get_rendezvous(&self, session_id: &str) -> Result<P2pRendezvousSession> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/rendezvous/{}", self.base_url, session_id);

        let resp = self.client.get(&url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to get rendezvous", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// POST /api/v1/p2p/rendezvous/:id/candidates to update endpoint candidates.
    #[allow(dead_code)] // Wired after bridge path selection starts using rendezvous.
    pub async fn add_rendezvous_candidates(
        &self,
        session_id: &str,
        req: &P2pRendezvousCandidatesRequest,
    ) -> Result<P2pRendezvousSession> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!(
            "{}/api/v1/p2p/rendezvous/{}/candidates",
            self.base_url, session_id
        );

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(req)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to add rendezvous candidates", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// POST /api/v1/p2p/rendezvous/:id/approve for explicit target approval.
    #[allow(dead_code)] // Wired after bridge path selection starts using rendezvous.
    pub async fn approve_rendezvous(&self, session_id: &str) -> Result<()> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!(
            "{}/api/v1/p2p/rendezvous/{}/approve",
            self.base_url, session_id
        );

        let resp = self.client.post(&url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to approve rendezvous", &url, resp).await);
        }

        Ok(())
    }

    /// POST /api/v1/p2p/rendezvous/:id/close after success or terminal failure.
    #[allow(dead_code)] // Wired after bridge path selection starts using rendezvous.
    pub async fn close_rendezvous(&self, session_id: &str) -> Result<()> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!(
            "{}/api/v1/p2p/rendezvous/{}/close",
            self.base_url, session_id
        );

        let resp = self.client.post(&url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to close rendezvous", &url, resp).await);
        }

        Ok(())
    }

    /// POST /api/v1/p2p/relay/lease to request a Connect/Pro fallback relay lease.
    #[allow(dead_code)] // Runtime calls this only after direct route failure and relay transport land.
    pub async fn request_relay_lease(
        &self,
        req: &P2pRelayLeaseRequest,
    ) -> Result<P2pRelayLeaseResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/relay/lease", self.base_url);

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(req)
            .send()
            .await?;

        if !resp.status().is_success() && resp.status() != reqwest::StatusCode::CONFLICT {
            return Err(cloud_api_error("Failed to request relay lease", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// GET /api/v1/p2p/relay/lease to inspect owner-scoped relay lease audits.
    #[allow(dead_code)] // Used by `musu relay leases`; also useful for operator evidence capture.
    pub async fn query_relay_leases(
        &self,
        query: &P2pRelayLeaseQuery,
    ) -> Result<P2pRelayLeaseQueryResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let mut url = reqwest::Url::parse(&format!("{}/api/v1/p2p/relay/lease", self.base_url))?;
        {
            let mut pairs = url.query_pairs_mut();
            if let Some(limit) = query.limit {
                pairs.append_pair("limit", &limit.to_string());
            }
            if let Some(session_id) = query.session_id.as_deref() {
                pairs.append_pair("session_id", session_id);
            }
            if let Some(source_node_id) = query.source_node_id.as_deref() {
                pairs.append_pair("source_node_id", source_node_id);
            }
            if let Some(target_node_id) = query.target_node_id.as_deref() {
                pairs.append_pair("target_node_id", target_node_id);
            }
        }

        let resp = self
            .client
            .get(url.clone())
            .bearer_auth(token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to query relay leases", url.as_ref(), resp).await);
        }

        Ok(resp.json().await?)
    }

    /// GET /api/v1/p2p/relay/transport to inspect release relay transport preflight state.
    #[allow(dead_code)] // Used by `musu relay transport` for operator evidence capture.
    pub async fn query_relay_transport(&self) -> Result<P2pRelayTransportResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/relay/transport", self.base_url);

        let resp = self.client.get(&url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to query relay transport", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// GET /api/v1/p2p/route-evidence to inspect owner-scoped route evidence.
    #[allow(dead_code)] // Used by relay diagnostics and release evidence capture.
    pub async fn query_route_evidence(
        &self,
        query: &RouteEvidenceQuery,
    ) -> Result<RouteEvidenceQueryResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let mut url = reqwest::Url::parse(&format!("{}/api/v1/p2p/route-evidence", self.base_url))?;
        {
            let mut pairs = url.query_pairs_mut();
            if let Some(limit) = query.limit {
                pairs.append_pair("limit", &limit.to_string());
            }
            if let Some(source_node_id) = query.source_node_id.as_deref() {
                pairs.append_pair("source_node_id", source_node_id);
            }
            if let Some(target_node_id) = query.target_node_id.as_deref() {
                pairs.append_pair("target_node_id", target_node_id);
            }
            if let Some(route_kind) = query.route_kind.as_ref() {
                pairs.append_pair("route_kind", route_kind_query_value(route_kind));
            }
            if let Some(result) = query.result.as_ref() {
                pairs.append_pair("result", route_attempt_result_query_value(result));
            }
            if let Some(release_grade) = query.release_grade {
                pairs.append_pair(
                    "release_grade",
                    if release_grade { "true" } else { "false" },
                );
            }
        }

        let resp = self
            .client
            .get(url.clone())
            .bearer_auth(token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(
                cloud_api_error("Failed to query route evidence", url.as_ref(), resp).await,
            );
        }

        Ok(resp.json().await?)
    }

    /// POST /api/v1/p2p/route-evidence to record the route that carried work.
    #[allow(dead_code)] // Wired after route execution can produce hardened evidence.
    pub async fn submit_route_evidence(&self, evidence: &RouteEvidence) -> Result<()> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/route-evidence", self.base_url);

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(evidence)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to submit route evidence", &url, resp).await);
        }

        Ok(())
    }

    /// POST /api/v1/p2p/relay/transport-proof after real relay payload transit.
    #[allow(dead_code)] // Called by relay/tunnel runtime once payload transport is implemented.
    pub async fn submit_relay_transport_proof(
        &self,
        proof: &P2pRelayTransportProofRequest,
    ) -> Result<P2pRelayTransportProofResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/relay/transport-proof", self.base_url);

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(proof)
            .send()
            .await?;

        if !resp.status().is_success() && resp.status() != reqwest::StatusCode::CONFLICT {
            return Err(
                cloud_api_error("Failed to submit relay transport proof", &url, resp).await,
            );
        }

        Ok(resp.json().await?)
    }

    /// POST /api/v1/p2p/relay/payload to enqueue a lease-bound relay payload envelope.
    pub async fn submit_relay_payload(
        &self,
        payload: &P2pRelayPayloadRequest,
    ) -> Result<P2pRelayPayloadResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/relay/payload", self.base_url);

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(payload)
            .send()
            .await?;

        if !resp.status().is_success() && resp.status() != reqwest::StatusCode::CONFLICT {
            return Err(cloud_api_error("Failed to submit relay payload", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// GET /api/v1/p2p/relay/payload to inspect lease-bound relay payload queue records.
    #[allow(dead_code)] // Used by relay diagnostics and future target-side polling.
    pub async fn query_relay_payloads(
        &self,
        query: &P2pRelayPayloadQuery,
    ) -> Result<P2pRelayPayloadQueryResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let mut url = reqwest::Url::parse(&format!("{}/api/v1/p2p/relay/payload", self.base_url))?;
        {
            let mut pairs = url.query_pairs_mut();
            if let Some(limit) = query.limit {
                pairs.append_pair("limit", &limit.to_string());
            }
            if let Some(session_id) = query.session_id.as_deref() {
                pairs.append_pair("session_id", session_id);
            }
            if let Some(lease_id) = query.lease_id.as_deref() {
                pairs.append_pair("lease_id", lease_id);
            }
            if let Some(source_node_id) = query.source_node_id.as_deref() {
                pairs.append_pair("source_node_id", source_node_id);
            }
            if let Some(target_node_id) = query.target_node_id.as_deref() {
                pairs.append_pair("target_node_id", target_node_id);
            }
            if let Some(tunnel_id) = query.tunnel_id.as_deref() {
                pairs.append_pair("tunnel_id", tunnel_id);
            }
            if let Some(status) = query.status.as_deref() {
                pairs.append_pair("status", status);
            }
            if query.include_payload {
                pairs.append_pair("include_payload", "1");
            }
        }

        let resp = self
            .client
            .get(url.clone())
            .bearer_auth(token)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(
                cloud_api_error("Failed to query relay payloads", url.as_ref(), resp).await,
            );
        }

        Ok(resp.json().await?)
    }

    /// PATCH /api/v1/p2p/relay/payload to claim queued relay payloads for this target.
    #[allow(dead_code)] // Used by manual diagnostics and the future bounded target poller.
    pub async fn claim_relay_payloads(
        &self,
        claim: &P2pRelayPayloadClaimRequest,
    ) -> Result<P2pRelayPayloadClaimResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/relay/payload", self.base_url);

        let resp = self
            .client
            .patch(&url)
            .bearer_auth(token)
            .json(claim)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(cloud_api_error("Failed to claim relay payloads", &url, resp).await);
        }

        Ok(resp.json().await?)
    }

    /// PATCH /api/v1/p2p/relay/payload to mark one claimed payload delivered.
    #[allow(dead_code)] // Used by manual diagnostics and the future bounded target poller.
    pub async fn mark_relay_payload_delivered(
        &self,
        delivery: &P2pRelayPayloadDeliveryRequest,
    ) -> Result<P2pRelayPayloadDeliveryResponse> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/p2p/relay/payload", self.base_url);

        let resp = self
            .client
            .patch(&url)
            .bearer_auth(token)
            .json(delivery)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(
                cloud_api_error("Failed to mark relay payload delivered", &url, resp).await,
            );
        }

        Ok(resp.json().await?)
    }
}

fn route_kind_query_value(kind: &RouteKind) -> &'static str {
    match kind {
        RouteKind::Lan => "lan",
        RouteKind::Tailscale => "tailscale",
        RouteKind::DirectQuic => "direct_quic",
        RouteKind::Relay => "relay",
        RouteKind::Failed => "failed",
    }
}

fn room_presence_status_query_value(status: &RoomPresenceStatus) -> &'static str {
    match status {
        RoomPresenceStatus::Online => "online",
        RoomPresenceStatus::Idle => "idle",
        RoomPresenceStatus::Busy => "busy",
        RoomPresenceStatus::Offline => "offline",
    }
}

fn route_attempt_result_query_value(result: &RouteAttemptResult) -> &'static str {
    match result {
        RouteAttemptResult::Success => "success",
        RouteAttemptResult::Failed => "failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_kind_serializes_to_contract_values() {
        assert_eq!(
            serde_json::to_value(RouteKind::DirectQuic).unwrap(),
            serde_json::json!("direct_quic")
        );
        assert_eq!(
            serde_json::to_value(RouteKind::Tailscale).unwrap(),
            serde_json::json!("tailscale")
        );
    }

    #[test]
    fn room_presence_request_serializes_current_executor_context() {
        let req = RoomPresenceRequest {
            node_id: "pc-a".into(),
            node_name: Some("HUGH_SECOND".into()),
            app_version: Some("1.15.0-rc.1".into()),
            status: Some(RoomPresenceStatus::Busy),
            company_id: Some("company-a".into()),
            project_id: Some("project-a".into()),
            source_agent_id: Some("agent-a".into()),
            active_work_order_ids: vec!["wo-1".into()],
            candidate_endpoints: vec![CandidateEndpoint {
                kind: RouteKind::DirectQuic,
                addr: "203.0.113.20:8949".into(),
                observed_at: "2026-06-04T10:00:00Z".into(),
                scheme: Some("https".into()),
                public_addr: Some("203.0.113.20:8949".into()),
                nat_type: Some(NatType::Symmetric),
                nat_observed_by: Some("stun:musu.pro".into()),
                relay_url: Some("wss://relay.musu.pro/api/v1/relay/connect".into()),
                relay_protocol: Some(RelayProtocol::QuicRelayTunnel),
            }],
            relay_capable: false,
            public_key: Some("sha256:cert".into()),
            capabilities: vec!["bridge_http_forward".into()],
            origin: Some("musu.local-program".into()),
        };

        let value = serde_json::to_value(req).unwrap();

        assert_eq!(value["node_id"], "pc-a");
        assert_eq!(value["node_name"], "HUGH_SECOND");
        assert_eq!(value["status"], "busy");
        assert_eq!(value["company_id"], "company-a");
        assert_eq!(value["candidate_endpoints"][0]["kind"], "direct_quic");
        assert_eq!(value["candidate_endpoints"][0]["addr"], "203.0.113.20:8949");
        assert_eq!(
            value["candidate_endpoints"][0]["public_addr"],
            "203.0.113.20:8949"
        );
        assert_eq!(value["candidate_endpoints"][0]["nat_type"], "symmetric");
        assert_eq!(
            value["candidate_endpoints"][0]["nat_observed_by"],
            "stun:musu.pro"
        );
        assert_eq!(
            value["candidate_endpoints"][0]["relay_url"],
            "wss://relay.musu.pro/api/v1/relay/connect"
        );
        assert_eq!(
            value["candidate_endpoints"][0]["relay_protocol"],
            "quic_relay_tunnel"
        );
        assert_eq!(value["relay_capable"], false);
        assert_eq!(value["capabilities"][0], "bridge_http_forward");
        assert_eq!(value["origin"], "musu.local-program");
    }

    #[test]
    fn room_presence_query_response_parses_owner_scoped_records() {
        let response: RoomPresenceQueryResponse = serde_json::from_value(serde_json::json!({
            "ok": true,
            "room_id": "project-room",
            "presence_order": "last_seen_desc",
            "count": 1,
            "presence": [{
                "schema": "musu.room_presence.v1",
                "owner_key": "token-sha256:abc",
                "room_id": "project-room",
                "node_id": "pc-a",
                "node_name": "HUGH_SECOND",
                "app_version": "1.15.0-rc.1",
                "status": "online",
                "company_id": "company-a",
                "project_id": "project-a",
                "source_agent_id": null,
                "active_work_order_ids": [],
                "candidate_endpoints": [{
                    "kind": "lan",
                    "addr": "192.168.1.20:8949",
                    "observed_at": "2026-06-04T10:00:00Z",
                    "scheme": "http"
                }],
                "relay_capable": false,
                "public_key": "sha256:cert",
                "capabilities": ["bridge_http_forward"],
                "origin": "musu.local-program",
                "last_seen_at": "2026-06-04T10:00:00Z",
                "expires_at": "2026-06-04T10:02:00Z",
                "heartbeat_ttl_seconds": 120
            }]
        }))
        .unwrap();

        assert!(response.ok);
        assert_eq!(response.room_id, "project-room");
        assert_eq!(response.count, 1);
        assert_eq!(response.presence[0].node_id, "pc-a");
        assert!(matches!(
            response.presence[0].status,
            RoomPresenceStatus::Online
        ));
        assert_eq!(
            response.presence[0].candidate_endpoints[0].kind,
            RouteKind::Lan
        );
    }

    #[test]
    fn device_code_response_defaults_poll_interval_to_five_seconds() {
        let response: DeviceCodeResponse = serde_json::from_value(serde_json::json!({
            "user_code": "ABCD-EFGH",
            "device_code": "device-123",
            "verification_uri": "https://musu.pro/device",
            "expires_in": 900
        }))
        .unwrap();

        assert_eq!(response.interval, None);
        assert_eq!(response.poll_interval_secs(), 5);
        assert_eq!(response.poll_interval(), std::time::Duration::from_secs(5));
    }

    #[test]
    fn device_code_response_honors_interval_field_with_five_second_floor() {
        let response: DeviceCodeResponse = serde_json::from_value(serde_json::json!({
            "user_code": "ABCD-EFGH",
            "device_code": "device-123",
            "verification_uri": "https://musu.pro/device",
            "expires_in": 900,
            "interval": 2
        }))
        .unwrap();

        assert_eq!(response.interval, Some(2));
        assert_eq!(response.poll_interval_secs(), 5);

        let alias_response: DeviceCodeResponse = serde_json::from_value(serde_json::json!({
            "user_code": "ABCD-EFGH",
            "device_code": "device-456",
            "verification_uri": "https://musu.pro/device",
            "expires_in": 900,
            "poll_interval_sec": 9
        }))
        .unwrap();

        assert_eq!(alias_response.interval, Some(9));
        assert_eq!(alias_response.poll_interval_secs(), 9);
        assert_eq!(
            alias_response.poll_interval(),
            std::time::Duration::from_secs(9)
        );
    }

    #[test]
    fn room_work_order_claim_request_serializes_target_claim_fields() {
        let claim = RoomWorkOrderClaimRequest {
            schema: "musu.room_work_order_claim.v1".into(),
            target_node_id: "pc-a".into(),
            claimant_node_id: Some("pc-a".into()),
            company_id: Some("company-a".into()),
            project_id: Some("project-a".into()),
            source_agent_id: Some("agent-a".into()),
            work_order_id: Some("wo-1".into()),
            limit: Some(1),
        };

        let value = serde_json::to_value(claim).unwrap();

        assert_eq!(value["schema"], "musu.room_work_order_claim.v1");
        assert_eq!(value["target_node_id"], "pc-a");
        assert_eq!(value["claimant_node_id"], "pc-a");
        assert_eq!(value["company_id"], "company-a");
        assert_eq!(value["project_id"], "project-a");
        assert_eq!(value["source_agent_id"], "agent-a");
        assert_eq!(value["work_order_id"], "wo-1");
        assert_eq!(value["limit"], 1);
    }

    #[test]
    fn room_work_order_delivery_request_serializes_handoff_ack_fields() {
        let delivery = RoomWorkOrderDeliveryRequest {
            schema: "musu.room_work_order_delivery.v1".into(),
            work_order_id: "wo-1".into(),
            target_node_id: "pc-a".into(),
            status: "accepted".into(),
            bridge_task_id: Some("task-1".into()),
            bridge_status: Some("202".into()),
            error: None,
        };

        let value = serde_json::to_value(delivery).unwrap();

        assert_eq!(value["schema"], "musu.room_work_order_delivery.v1");
        assert_eq!(value["work_order_id"], "wo-1");
        assert_eq!(value["target_node_id"], "pc-a");
        assert_eq!(value["status"], "accepted");
        assert_eq!(value["bridge_task_id"], "task-1");
        assert_eq!(value["bridge_status"], "202");
        assert_eq!(value.get("error"), None);
    }

    #[test]
    fn room_work_order_claim_response_parses_public_work_orders() {
        let response: RoomWorkOrderClaimResponse = serde_json::from_value(serde_json::json!({
            "schema": "musu.room_work_order_claim.v1",
            "ok": true,
            "room_id": "project-room",
            "owner_scoped": true,
            "claimed": true,
            "count": 1,
            "target_node": "pc-a",
            "work_orders": [{
                "schema": "musu.room_work_order.v1",
                "work_order_id": "wo-1",
                "room_id": "project-room",
                "company_id": "company-a",
                "project_id": "project-a",
                "target_node": "pc-a",
                "source_agent_id": "agent-a",
                "sender_id": "musu.pro-room",
                "channel": "company-room",
                "adapter_type": "claude",
                "workspace_uri": "file:///F:/workspace/musu-bee",
                "cwd": "F:\\workspace\\musu-bee",
                "instruction": "Summarize status",
                "permission_envelope": {"allow": ["read"]},
                "trace_id": "trace-1",
                "origin": "musu.pro",
                "delivery_mode": "desktop_outbound_pickup",
                "status": "claimed",
                "created_at": "2026-06-07T10:00:00Z",
                "expires_at": "2026-06-07T10:15:00Z",
                "claimed_by": "pc-a",
                "claimed_at": "2026-06-07T10:01:00Z"
            }]
        }))
        .unwrap();

        assert!(response.ok);
        assert!(response.owner_scoped);
        assert!(response.claimed);
        assert_eq!(response.target_node, "pc-a");
        assert_eq!(response.work_orders[0].work_order_id, "wo-1");
        assert_eq!(response.work_orders[0].instruction, "Summarize status");
        assert_eq!(response.work_orders[0].status, "claimed");
        assert_eq!(response.work_orders[0].claimed_by.as_deref(), Some("pc-a"));
    }

    #[test]
    fn route_evidence_serializes_required_contract_fields() {
        let evidence = RouteEvidence {
            schema: "musu.route_evidence.v1".into(),
            version: "1.15.0-rc.1".into(),
            source_node_id: "node_src".into(),
            target_node_id: "node_dst".into(),
            session_id: Some("rv_123".into()),
            route_kind: RouteKind::Lan,
            candidate_addr: "192.168.1.192:8949".into(),
            handshake_ms: Some(42),
            total_attempt_ms: 611,
            peer_identity_verified: true,
            peer_identity_method: Some("quic_tls_cert_fingerprint".into()),
            peer_public_key: Some("sha256:test".into()),
            encryption: "quic_tls_1_3".into(),
            transport_verified_by: Some("musu_quic_tls_transport".into()),
            payload_transited_musu_infra: false,
            result: RouteAttemptResult::Success,
            failure_class: None,
            relay_fallback: None,
            relay_transport_proof: None,
            relay_payload_delivery_proof: None,
            recorded_at: "2026-05-31T09:01:00Z".into(),
        };

        let value = serde_json::to_value(evidence).unwrap();
        assert_eq!(value["schema"], "musu.route_evidence.v1");
        assert_eq!(value["route_kind"], "lan");
        assert_eq!(value["peer_identity_verified"], true);
        assert_eq!(value["encryption"], "quic_tls_1_3");
        assert_eq!(value["transport_verified_by"], "musu_quic_tls_transport");
        assert_eq!(value["payload_transited_musu_infra"], false);
        assert_eq!(value["result"], "success");
    }

    #[test]
    fn route_evidence_serializes_relay_payload_delivery_proof() {
        let evidence = RouteEvidence {
            schema: "musu.route_evidence.v1".into(),
            version: "1.15.0-rc.1".into(),
            source_node_id: "node_src".into(),
            target_node_id: "node_dst".into(),
            session_id: Some("rv_123".into()),
            route_kind: RouteKind::Relay,
            candidate_addr: "relay.musu.pro:443".into(),
            handshake_ms: Some(42),
            total_attempt_ms: 611,
            peer_identity_verified: true,
            peer_identity_method: Some("quic_tls_cert_fingerprint".into()),
            peer_public_key: Some("sha256:test".into()),
            encryption: "quic_tls_1_3".into(),
            transport_verified_by: Some("musu_quic_tls_transport".into()),
            payload_transited_musu_infra: true,
            result: RouteAttemptResult::Success,
            failure_class: None,
            relay_fallback: None,
            relay_transport_proof: None,
            relay_payload_delivery_proof: Some(RouteRelayPayloadDeliveryProof {
                schema: "musu.relay_payload_delivery_proof.v1".into(),
                payload_id: "payload-1".into(),
                session_id: "rv_123".into(),
                lease_id: "lease-1".into(),
                source_node_id: "node_src".into(),
                target_node_id: "node_dst".into(),
                relay_url: "wss://relay.musu.pro/connect".into(),
                tunnel_id: "relay-tunnel-1".into(),
                payload_kind: "forwarded_task_envelope".into(),
                transport_kind: "quic_relay_tunnel".into(),
                relay_default_data_path: false,
                release_grade: true,
                payload_sha256: "abc123".into(),
                payload_bytes: 128,
                claimed_by: "node_dst".into(),
                claimed_at: "2026-06-04T00:00:01Z".into(),
                created_at: "2026-06-04T00:00:00Z".into(),
                delivered_at: "2026-06-04T00:00:02Z".into(),
            }),
            recorded_at: "2026-06-04T00:00:03Z".into(),
        };

        let value = serde_json::to_value(evidence).unwrap();
        assert_eq!(
            value["relay_payload_delivery_proof"]["schema"],
            "musu.relay_payload_delivery_proof.v1"
        );
        assert_eq!(
            value["relay_payload_delivery_proof"]["payload_id"],
            "payload-1"
        );
        assert_eq!(value["relay_payload_delivery_proof"]["payload_bytes"], 128);
        assert_eq!(
            value["relay_payload_delivery_proof"]["transport_kind"],
            "quic_relay_tunnel"
        );
        assert_eq!(value["relay_payload_delivery_proof"]["release_grade"], true);
        assert_eq!(
            value["relay_payload_delivery_proof"]["delivered_at"],
            "2026-06-04T00:00:02Z"
        );
        assert_eq!(
            value["relay_payload_delivery_proof"]["payload_kind"],
            "forwarded_task_envelope"
        );
        assert_eq!(
            value["relay_payload_delivery_proof"]["claimed_by"],
            "node_dst"
        );
    }

    #[test]
    fn route_evidence_serializes_relay_transport_proof_peer_binding_fields() {
        let evidence = RouteEvidence {
            schema: "musu.route_evidence.v1".into(),
            version: "1.15.0-rc.1".into(),
            source_node_id: "node_src".into(),
            target_node_id: "node_dst".into(),
            session_id: Some("rv_123".into()),
            route_kind: RouteKind::Relay,
            candidate_addr: "relay.musu.pro:443".into(),
            handshake_ms: Some(42),
            total_attempt_ms: 611,
            peer_identity_verified: true,
            peer_identity_method: Some("quic_tls_cert_fingerprint".into()),
            peer_public_key: Some("sha256:test".into()),
            encryption: "quic_tls_1_3".into(),
            transport_verified_by: Some("musu_quic_tls_transport".into()),
            payload_transited_musu_infra: true,
            result: RouteAttemptResult::Success,
            failure_class: None,
            relay_fallback: None,
            relay_transport_proof: Some(RouteRelayTransportProof {
                schema: "musu.relay_transport_proof.v1".into(),
                session_id: "rv_123".into(),
                lease_id: "lease-1".into(),
                source_node_id: "node_src".into(),
                target_node_id: "node_dst".into(),
                transport_kind: "quic_relay_tunnel".into(),
                relay_url: "wss://relay.musu.pro/connect".into(),
                tunnel_id: "relay-tunnel-1".into(),
                handshake_ms: 23,
                payload_bytes_transited: 128,
                payload_transited_musu_infra: true,
                peer_identity_verified: true,
                peer_identity_method: "quic_tls_cert_fingerprint".into(),
                peer_public_key: "sha256:test".into(),
                encryption: "quic_tls_1_3".into(),
                transport_verified_by: "musu_quic_tls_transport".into(),
                opened_at: "2026-06-04T00:00:01Z".into(),
                closed_at: Some("2026-06-04T00:00:02Z".into()),
            }),
            relay_payload_delivery_proof: None,
            recorded_at: "2026-06-04T00:00:03Z".into(),
        };

        let value = serde_json::to_value(evidence).unwrap();
        assert_eq!(
            value["relay_transport_proof"]["schema"],
            "musu.relay_transport_proof.v1"
        );
        assert_eq!(value["relay_transport_proof"]["source_node_id"], "node_src");
        assert_eq!(value["relay_transport_proof"]["target_node_id"], "node_dst");
        assert_eq!(
            value["relay_transport_proof"]["transport_kind"],
            "quic_relay_tunnel"
        );
        assert_eq!(
            value["relay_transport_proof"]["transport_verified_by"],
            "musu_quic_tls_transport"
        );
        assert_eq!(
            value["relay_transport_proof"]["peer_identity_method"],
            "quic_tls_cert_fingerprint"
        );
        assert_eq!(
            value["relay_transport_proof"]["peer_public_key"],
            "sha256:test"
        );
    }

    #[test]
    fn relay_lease_request_serializes_fallback_policy_fields() {
        let req = P2pRelayLeaseRequest {
            session_id: "rv_123".into(),
            source_node_id: "pc-a".into(),
            target_node_id: "pc-b".into(),
            requested_capability: Some("remote_command".into()),
            attempted_route_kinds: vec![
                RouteKind::Lan,
                RouteKind::Tailscale,
                RouteKind::DirectQuic,
            ],
            direct_path_failed: true,
            failure_class: Some("connect_timeout".into()),
        };

        let value = serde_json::to_value(req).unwrap();
        assert_eq!(value["session_id"], "rv_123");
        assert_eq!(value["attempted_route_kinds"][0], "lan");
        assert_eq!(value["attempted_route_kinds"][2], "direct_quic");
        assert_eq!(value["direct_path_failed"], true);
        assert_eq!(value["failure_class"], "connect_timeout");
    }

    #[test]
    fn relay_transport_proof_request_serializes_release_contract_fields() {
        let proof = P2pRelayTransportProofRequest {
            schema: "musu.relay_transport_proof.v1".into(),
            session_id: "rv_123".into(),
            lease_id: "relay-lease-123".into(),
            source_node_id: "pc-a".into(),
            target_node_id: "pc-b".into(),
            transport_kind: "quic_relay_tunnel".into(),
            relay_url: "wss://relay.musu.pro/connect".into(),
            tunnel_id: "relay-tunnel-123".into(),
            handshake_ms: 23,
            payload_bytes_transited: 128,
            payload_transited_musu_infra: true,
            peer_identity_verified: true,
            peer_identity_method: "quic_tls_cert_fingerprint".into(),
            peer_public_key: "sha256:test".into(),
            encryption: "quic_tls_1_3".into(),
            transport_verified_by: "musu_quic_tls_transport".into(),
            opened_at: "2026-06-01T01:00:01Z".into(),
            closed_at: Some("2026-06-01T01:00:02Z".into()),
        };

        let value = serde_json::to_value(proof).unwrap();
        assert_eq!(value["schema"], "musu.relay_transport_proof.v1");
        assert_eq!(value["source_node_id"], "pc-a");
        assert_eq!(value["target_node_id"], "pc-b");
        assert_eq!(value["transport_kind"], "quic_relay_tunnel");
        assert_eq!(value["payload_bytes_transited"], 128);
        assert_eq!(value["payload_transited_musu_infra"], true);
        assert_eq!(value["peer_identity_verified"], true);
        assert_eq!(value["peer_identity_method"], "quic_tls_cert_fingerprint");
        assert_eq!(value["peer_public_key"], "sha256:test");
        assert_eq!(value["encryption"], "quic_tls_1_3");
        assert_eq!(value["transport_verified_by"], "musu_quic_tls_transport");
    }

    #[test]
    fn relay_payload_request_serializes_lease_bound_envelope_fields() {
        let payload = P2pRelayPayloadRequest {
            schema: "musu.relay_payload_envelope.v1".into(),
            session_id: "rv_123".into(),
            lease_id: "relay-lease-123".into(),
            source_node_id: "pc-a".into(),
            target_node_id: "pc-b".into(),
            tunnel_id: "relay-tunnel-123".into(),
            payload_kind: "forwarded_task_envelope".into(),
            payload_base64: "e30=".into(),
            payload_sha256: Some("sha256".into()),
            candidate_route_kinds: vec![RouteKind::Lan, RouteKind::Relay],
            attempted_route_kinds: vec![RouteKind::Lan],
        };

        let value = serde_json::to_value(payload).unwrap();

        assert_eq!(value["schema"], "musu.relay_payload_envelope.v1");
        assert_eq!(value["session_id"], "rv_123");
        assert_eq!(value["lease_id"], "relay-lease-123");
        assert_eq!(value["source_node_id"], "pc-a");
        assert_eq!(value["target_node_id"], "pc-b");
        assert_eq!(value["tunnel_id"], "relay-tunnel-123");
        assert_eq!(value["payload_kind"], "forwarded_task_envelope");
        assert_eq!(value["payload_base64"], "e30=");
        assert_eq!(value["payload_sha256"], "sha256");
        assert_eq!(value["candidate_route_kinds"][0], "lan");
        assert_eq!(value["candidate_route_kinds"][1], "relay");
        assert_eq!(value["attempted_route_kinds"][0], "lan");
    }

    #[test]
    fn relay_payload_query_response_accepts_optional_payload_bytes() {
        let response: P2pRelayPayloadQueryResponse = serde_json::from_value(serde_json::json!({
            "schema": "musu.p2p_relay_payloads.v1",
            "ok": true,
            "owner_scoped": true,
            "relay_payload_queue_endpoint_wired": true,
            "relay_default_data_path": false,
            "release_grade": false,
            "relay_payload_store_configured": true,
            "relay_payload_store_backend": "development_file",
            "relay_payload_store_release_grade": false,
            "count": 1,
            "payloads": [{
                "payload_id": "payload-1",
                "session_id": "rv_123",
                "lease_id": "relay-lease-123",
                "source_node_id": "pc-a",
                "target_node_id": "pc-b",
                "relay_url": "wss://relay.musu.pro/connect",
                "tunnel_id": "relay-tunnel-123",
                "payload_kind": "forwarded_task_envelope",
                "payload_bytes": 2,
                "payload_sha256": "abc123",
                "status": "queued",
                "relay_default_data_path": false,
                "release_grade": false,
                "transport_kind": "http_store_forward_preview",
                "created_at": "2026-06-04T01:00:00Z",
                "expires_at": "2026-06-04T01:05:00Z",
                "payload_base64": "e30="
            }]
        }))
        .expect("relay payload query response");

        assert!(response.ok);
        assert_eq!(response.count, 1);
        assert_eq!(response.payloads[0].payload_id, "payload-1");
        assert_eq!(response.payloads[0].payload_base64.as_deref(), Some("e30="));
        assert!(!response.release_grade);
        assert!(!response.payloads[0].relay_default_data_path);
    }

    #[test]
    fn relay_payload_claim_request_serializes_target_claim_fields() {
        let claim = P2pRelayPayloadClaimRequest {
            schema: "musu.relay_payload_claim.v1".into(),
            target_node_id: "pc-b".into(),
            claimant_node_id: Some("pc-b".into()),
            limit: Some(2),
            session_id: Some("rv_123".into()),
            lease_id: Some("relay-lease-123".into()),
            source_node_id: Some("pc-a".into()),
            tunnel_id: Some("relay-tunnel-123".into()),
            include_payload: true,
        };

        let value = serde_json::to_value(claim).unwrap();

        assert_eq!(value["schema"], "musu.relay_payload_claim.v1");
        assert_eq!(value["target_node_id"], "pc-b");
        assert_eq!(value["claimant_node_id"], "pc-b");
        assert_eq!(value["limit"], 2);
        assert_eq!(value["session_id"], "rv_123");
        assert_eq!(value["lease_id"], "relay-lease-123");
        assert_eq!(value["source_node_id"], "pc-a");
        assert_eq!(value["tunnel_id"], "relay-tunnel-123");
        assert_eq!(value["include_payload"], true);
    }

    #[test]
    fn relay_payload_claim_response_accepts_claim_metadata() {
        let response: P2pRelayPayloadClaimResponse = serde_json::from_value(serde_json::json!({
            "schema": "musu.p2p_relay_payload_claim.v1",
            "ok": true,
            "owner_scoped": true,
            "accepted": true,
            "claimed": true,
            "relay_payload_queue_endpoint_wired": true,
            "relay_default_data_path": false,
            "release_grade": false,
            "relay_payload_store_configured": true,
            "relay_payload_store_backend": "development_file",
            "relay_payload_store_release_grade": false,
            "count": 1,
            "payloads": [{
                "payload_id": "payload-1",
                "session_id": "rv_123",
                "lease_id": "relay-lease-123",
                "source_node_id": "pc-a",
                "target_node_id": "pc-b",
                "relay_url": "wss://relay.musu.pro/connect",
                "tunnel_id": "relay-tunnel-123",
                "payload_kind": "forwarded_task_envelope",
                "payload_bytes": 2,
                "payload_sha256": "abc123",
                "status": "claimed",
                "relay_default_data_path": false,
                "release_grade": false,
                "transport_kind": "http_store_forward_preview",
                "created_at": "2026-06-04T01:00:00Z",
                "expires_at": "2026-06-04T01:05:00Z",
                "claimed_by": "pc-b",
                "claimed_at": "2026-06-04T01:00:01Z",
                "payload_base64": "e30="
            }]
        }))
        .expect("relay payload claim response");

        assert!(response.ok);
        assert!(response.claimed);
        assert_eq!(response.count, 1);
        assert_eq!(response.payloads[0].status, "claimed");
        assert_eq!(response.payloads[0].claimed_by.as_deref(), Some("pc-b"));
        assert_eq!(
            response.payloads[0].claimed_at.as_deref(),
            Some("2026-06-04T01:00:01Z")
        );
        assert_eq!(response.payloads[0].payload_base64.as_deref(), Some("e30="));
    }

    #[test]
    fn relay_payload_delivery_request_serializes_payload_ack_fields() {
        let delivery = P2pRelayPayloadDeliveryRequest {
            schema: "musu.relay_payload_delivery.v1".into(),
            payload_id: "payload-1".into(),
            target_node_id: "pc-b".into(),
        };

        let value = serde_json::to_value(delivery).unwrap();

        assert_eq!(value["schema"], "musu.relay_payload_delivery.v1");
        assert_eq!(value["payload_id"], "payload-1");
        assert_eq!(value["target_node_id"], "pc-b");
    }

    #[test]
    fn relay_payload_delivery_response_accepts_delivered_metadata_without_payload_bytes() {
        let response: P2pRelayPayloadDeliveryResponse = serde_json::from_value(serde_json::json!({
            "schema": "musu.p2p_relay_payload_delivery.v1",
            "ok": true,
            "owner_scoped": true,
            "accepted": true,
            "delivered": true,
            "relay_default_data_path": false,
            "release_grade": false,
            "relay_payload_store_configured": true,
            "relay_payload_store_backend": "development_file",
            "relay_payload_store_release_grade": false,
            "payload": {
                "payload_id": "payload-1",
                "session_id": "rv_123",
                "lease_id": "relay-lease-123",
                "source_node_id": "pc-a",
                "target_node_id": "pc-b",
                "relay_url": "wss://relay.musu.pro/connect",
                "tunnel_id": "relay-tunnel-123",
                "payload_kind": "forwarded_task_envelope",
                "payload_bytes": 2,
                "payload_sha256": "abc123",
                "status": "delivered",
                "relay_default_data_path": false,
                "release_grade": false,
                "transport_kind": "http_store_forward_preview",
                "created_at": "2026-06-04T01:00:00Z",
                "expires_at": "2026-06-04T01:05:00Z",
                "claimed_by": "pc-b",
                "claimed_at": "2026-06-04T01:00:01Z",
                "delivered_at": "2026-06-04T01:00:02Z"
            },
            "delivery_proof": {
                "schema": "musu.relay_payload_delivery_proof.v1",
                "payload_id": "payload-1",
                "session_id": "rv_123",
                "lease_id": "relay-lease-123",
                "source_node_id": "pc-a",
                "target_node_id": "pc-b",
                "relay_url": "wss://relay.musu.pro/connect",
                "tunnel_id": "relay-tunnel-123",
                "payload_kind": "forwarded_task_envelope",
                "transport_kind": "http_store_forward_preview",
                "relay_default_data_path": false,
                "release_grade": false,
                "payload_sha256": "abc123",
                "payload_bytes": 2,
                "claimed_by": "pc-b",
                "claimed_at": "2026-06-04T01:00:01Z",
                "created_at": "2026-06-04T01:00:00Z",
                "delivered_at": "2026-06-04T01:00:02Z"
            }
        }))
        .expect("relay payload delivery response");

        let proof = response.delivery_proof.expect("delivery proof");
        let payload = response.payload.expect("delivered payload");
        assert!(response.delivered);
        assert_eq!(proof.schema, "musu.relay_payload_delivery_proof.v1");
        assert_eq!(proof.payload_id, payload.payload_id);
        assert_eq!(proof.session_id, payload.session_id);
        assert_eq!(proof.lease_id, payload.lease_id);
        assert_eq!(proof.source_node_id, payload.source_node_id);
        assert_eq!(proof.target_node_id, payload.target_node_id);
        assert_eq!(proof.relay_url, payload.relay_url);
        assert_eq!(proof.tunnel_id, payload.tunnel_id);
        assert_eq!(proof.payload_kind, payload.payload_kind);
        assert_eq!(proof.transport_kind, payload.transport_kind);
        assert_eq!(
            proof.relay_default_data_path,
            payload.relay_default_data_path
        );
        assert_eq!(proof.release_grade, payload.release_grade);
        assert_eq!(proof.payload_sha256, payload.payload_sha256);
        assert_eq!(proof.payload_bytes, payload.payload_bytes);
        assert_eq!(proof.claimed_by, payload.claimed_by.clone().unwrap());
        assert_eq!(proof.claimed_at, payload.claimed_at.clone().unwrap());
        assert_eq!(proof.created_at, payload.created_at);
        assert_eq!(proof.delivered_at, payload.delivered_at.clone().unwrap());
        assert_eq!(payload.status, "delivered");
        assert_eq!(
            payload.delivered_at.as_deref(),
            Some("2026-06-04T01:00:02Z")
        );
        assert_eq!(payload.payload_base64, None);
    }

    #[test]
    fn relay_payload_delivery_response_accepts_bound_transport_proof() {
        let response: P2pRelayPayloadDeliveryResponse = serde_json::from_value(serde_json::json!({
            "schema": "musu.p2p_relay_payload_delivery.v1",
            "ok": true,
            "owner_scoped": true,
            "accepted": true,
            "delivered": true,
            "relay_default_data_path": false,
            "release_grade": true,
            "relay_payload_store_configured": true,
            "relay_payload_store_backend": "upstash_redis",
            "relay_payload_store_release_grade": true,
            "payload": {
                "payload_id": "payload-release-1",
                "session_id": "rv_123",
                "lease_id": "relay-lease-123",
                "source_node_id": "pc-a",
                "target_node_id": "pc-b",
                "relay_url": "wss://relay.musu.pro/connect",
                "tunnel_id": "relay-tunnel-123",
                "payload_kind": "forwarded_task_envelope",
                "payload_bytes": 256,
                "payload_sha256": "def456",
                "status": "delivered",
                "relay_default_data_path": false,
                "release_grade": true,
                "transport_kind": "quic_relay_tunnel",
                "created_at": "2026-06-04T01:00:00Z",
                "expires_at": "2026-06-04T01:05:00Z",
                "claimed_by": "pc-b",
                "claimed_at": "2026-06-04T01:00:01Z",
                "delivered_at": "2026-06-04T01:00:03Z"
            },
            "relay_transport_proof": {
                "schema": "musu.relay_transport_proof.v1",
                "session_id": "rv_123",
                "lease_id": "relay-lease-123",
                "source_node_id": "pc-a",
                "target_node_id": "pc-b",
                "transport_kind": "quic_relay_tunnel",
                "relay_url": "wss://relay.musu.pro/connect",
                "tunnel_id": "relay-tunnel-123",
                "handshake_ms": 23,
                "payload_bytes_transited": 256,
                "payload_transited_musu_infra": true,
                "peer_identity_verified": true,
                "peer_identity_method": "quic_tls_cert_fingerprint",
                "peer_public_key": "sha256:release-peer",
                "encryption": "quic_tls_1_3",
                "transport_verified_by": "musu_quic_tls_transport",
                "opened_at": "2026-06-04T01:00:01Z",
                "closed_at": "2026-06-04T01:00:03Z"
            },
            "delivery_proof": {
                "schema": "musu.relay_payload_delivery_proof.v1",
                "payload_id": "payload-release-1",
                "session_id": "rv_123",
                "lease_id": "relay-lease-123",
                "source_node_id": "pc-a",
                "target_node_id": "pc-b",
                "relay_url": "wss://relay.musu.pro/connect",
                "tunnel_id": "relay-tunnel-123",
                "payload_kind": "forwarded_task_envelope",
                "transport_kind": "quic_relay_tunnel",
                "relay_default_data_path": false,
                "release_grade": true,
                "payload_sha256": "def456",
                "payload_bytes": 256,
                "claimed_by": "pc-b",
                "claimed_at": "2026-06-04T01:00:01Z",
                "created_at": "2026-06-04T01:00:00Z",
                "delivered_at": "2026-06-04T01:00:03Z"
            }
        }))
        .expect("release relay payload delivery response");

        let payload = response.payload.expect("payload");
        let transport = response.relay_transport_proof.expect("transport proof");
        let delivery = response.delivery_proof.expect("delivery proof");
        assert!(response.release_grade);
        assert_eq!(payload.transport_kind, "quic_relay_tunnel");
        assert_eq!(transport.schema, "musu.relay_transport_proof.v1");
        assert_eq!(transport.session_id, payload.session_id);
        assert_eq!(transport.lease_id, payload.lease_id);
        assert_eq!(transport.source_node_id, payload.source_node_id);
        assert_eq!(transport.target_node_id, payload.target_node_id);
        assert_eq!(transport.tunnel_id, payload.tunnel_id);
        assert_eq!(transport.relay_url, payload.relay_url);
        assert_eq!(transport.transport_kind, payload.transport_kind);
        assert_eq!(transport.encryption, "quic_tls_1_3");
        assert_eq!(transport.transport_verified_by, "musu_quic_tls_transport");
        assert_eq!(transport.payload_bytes_transited, payload.payload_bytes);
        assert_eq!(delivery.payload_id, payload.payload_id);
        assert_eq!(delivery.payload_kind, payload.payload_kind);
        assert_eq!(delivery.transport_kind, payload.transport_kind);
        assert_eq!(delivery.claimed_by, payload.claimed_by.unwrap());
        assert!(delivery.release_grade);
    }

    #[test]
    fn summarize_cloud_error_body_extracts_json_error_message() {
        let detail = summarize_cloud_error_body(
            Some("application/json"),
            r#"{"error":"Invalid or expired token"}"#,
        );

        assert_eq!(detail, "Invalid or expired token");
    }

    #[test]
    fn summarize_cloud_error_body_collapses_html_landing_page_response() {
        let detail = summarize_cloud_error_body(
            Some("text/html; charset=utf-8"),
            "<!DOCTYPE html><html><body>404</body></html>",
        );

        assert!(detail.contains("returned HTML instead of API JSON"));
        assert!(detail.contains("landing site"));
    }
}
