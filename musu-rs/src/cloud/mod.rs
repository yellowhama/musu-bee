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
    pub payload_transited_musu_infra: bool,
    pub result: RouteAttemptResult,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_class: Option<String>,
    pub recorded_at: String,
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
            payload_transited_musu_infra: false,
            result: RouteAttemptResult::Success,
            failure_class: None,
            recorded_at: "2026-05-31T09:01:00Z".into(),
        };

        let value = serde_json::to_value(evidence).unwrap();
        assert_eq!(value["schema"], "musu.route_evidence.v1");
        assert_eq!(value["route_kind"], "lan");
        assert_eq!(value["peer_identity_verified"], true);
        assert_eq!(value["encryption"], "quic_tls_1_3");
        assert_eq!(value["payload_transited_musu_infra"], false);
        assert_eq!(value["result"], "success");
    }
}
