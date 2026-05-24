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
pub struct RegistryNode {
    pub id: String,
    pub user_id: String,
    pub node_name: String,
    pub public_url: String,
    pub last_seen: String,
    pub meta: Option<serde_json::Value>,
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

        Ok(None)
    }

    /// POST /api/v1/nodes/register to register this node.
    pub async fn register_node(&self, req: RegisterNodeRequest) -> Result<RegistryNode> {
        let token = self.token.as_ref().ok_or_else(|| anyhow!("Not logged in"))?;
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
        let token = self.token.as_ref().ok_or_else(|| anyhow!("Not logged in"))?;
        let url = format!("{}/api/v1/nodes", self.base_url);

        let resp = self
            .client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to list nodes: {err}"));
        }

        Ok(resp.json().await?)
    }
}
