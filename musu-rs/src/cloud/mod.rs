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
}
