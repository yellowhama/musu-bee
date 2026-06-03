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

#[derive(Debug, Deserialize)]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
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
    pub relay_payload_endpoint_wired: bool,
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
    pub transport_kind: String,
    pub relay_url: String,
    pub tunnel_id: String,
    pub handshake_ms: u64,
    pub payload_bytes_transited: u64,
    pub payload_transited_musu_infra: bool,
    pub encryption: String,
    pub transport_verified_by: String,
    pub opened_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
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
    pub recorded_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)] // Route evidence addendum; relay transport remains wired separately.
pub struct RouteRelayFallbackEvidence {
    pub direct_path_failed: bool,
    pub lease_requested: bool,
    pub status: String,
    pub lease_issued: bool,
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to initiate login: {err}"));
        }

        Ok(resp.json().await?)
    }

    /// GET /api/v1/auth/device?device_code=... to poll for completion.
    pub async fn poll_device_token(&self, device_code: &str) -> Result<Option<String>> {
        let url = format!(
            "{}/api/v1/auth/device?device_code={}",
            self.base_url, device_code
        );
        let resp = self.client.get(&url).send().await?;

        if resp.status() == reqwest::StatusCode::GONE {
            return Err(anyhow!("Code expired"));
        }

        if !resp.status().is_success() {
            return Ok(None); // e.g. 202 Accepted (pending)
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to register node: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to list nodes: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to create rendezvous: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get rendezvous: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to add rendezvous candidates: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to approve rendezvous: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to close rendezvous: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to request relay lease: {err}"));
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

        let resp = self.client.get(url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to query relay leases: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to query relay transport: {err}"));
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

        let resp = self.client.get(url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to query route evidence: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to submit route evidence: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to submit relay transport proof: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to submit relay payload: {err}"));
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

        let resp = self.client.get(url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to query relay payloads: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to claim relay payloads: {err}"));
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
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to mark relay payload delivered: {err}"));
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
            }
        }))
        .expect("relay payload delivery response");

        let payload = response.payload.expect("delivered payload");
        assert!(response.delivered);
        assert_eq!(payload.status, "delivered");
        assert_eq!(
            payload.delivered_at.as_deref(),
            Some("2026-06-04T01:00:02Z")
        );
        assert_eq!(payload.payload_base64, None);
    }
}
