//! GET /api/nodes + POST /api/nodes/add.
//!
//! wiki/491 §5.7 + §5.8 + §7.2 (nodes.toml frozen format).

use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use tokio::time::timeout;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

// ---- nodes.toml schema (frozen per §7.2) ----

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NodesFile {
    #[serde(default, rename = "self")]
    pub self_: Option<SelfNode>,
    #[serde(default)]
    pub nodes: HashMap<String, NodeEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelfNode {
    pub name: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tailscale_ip: Option<String>,
    #[serde(default)]
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeEntry {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tailscale_ip: Option<String>,
    #[serde(default)]
    pub agents: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub machine: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub os: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gpu: Option<String>,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_health_at: Option<i64>,
}

fn read_nodes_toml(path: &Path) -> NodesFile {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(_) => return NodesFile::default(),
    };
    toml::from_str(&text).unwrap_or_default()
}

fn write_nodes_toml(path: &Path, file: &NodesFile) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let text = toml::to_string_pretty(file).map_err(|e| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
    })?;
    // Atomic write: tmp file + rename.
    let tmp = path.with_extension("toml.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

// ---- /api/nodes ----

#[derive(Debug, Serialize)]
pub struct NodeInfo {
    pub name: String,
    pub url: String,
    pub roles: Vec<String>,
    pub agents: Vec<String>,
    pub is_self: bool,
    pub healthy: Option<bool>,
    pub last_health_at: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct NodesListResponse {
    pub nodes: Vec<NodeInfo>,
    pub total: usize,
}

pub async fn list(State(state): State<AppState>) -> Result<Json<NodesListResponse>> {
    let file = read_nodes_toml(&state.config.nodes_toml_path);

    let mut out: Vec<NodeInfo> = Vec::new();

    if let Some(self_) = &file.self_ {
        out.push(NodeInfo {
            name: self_.name.clone(),
            url: self_.url.clone(),
            roles: self_.roles.clone(),
            agents: Vec::new(),
            is_self: true,
            healthy: Some(true),
            last_health_at: None,
        });
    }

    // For each peer node, health-check with 3s timeout.
    let client = state.http_client.clone();
    let peer_entries: Vec<(String, NodeEntry)> =
        file.nodes.into_iter().collect();
    let mut tasks = Vec::with_capacity(peer_entries.len());
    for (name, entry) in peer_entries {
        let client = client.clone();
        let task = tokio::spawn(async move {
            let url = format!("{}/health", entry.url.trim_end_matches('/'));
            let healthy = match timeout(Duration::from_secs(3), client.get(&url).send()).await {
                Ok(Ok(r)) => r.status().is_success(),
                _ => false,
            };
            (name, entry, healthy)
        });
        tasks.push(task);
    }

    for t in tasks {
        if let Ok((name, entry, healthy)) = t.await {
            out.push(NodeInfo {
                name,
                url: entry.url,
                roles: entry.roles,
                agents: entry.agents,
                is_self: false,
                healthy: Some(healthy),
                last_health_at: entry.last_health_at,
            });
        }
    }

    Ok(Json(NodesListResponse {
        total: out.len(),
        nodes: out,
    }))
}

// ---- /api/nodes/add ----

#[derive(Debug, Deserialize)]
pub struct NodeAddRequest {
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub tailscale_ip: Option<String>,
    #[serde(default)]
    pub agents: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct NodeAddResponse {
    pub name: String,
    pub url: String,
    pub healthy: bool,
    pub peer_acceptance: Option<bool>,
    pub note: Option<String>,
}

pub async fn add(
    State(state): State<AppState>,
    Json(req): Json<NodeAddRequest>,
) -> Result<Json<NodeAddResponse>> {
    if req.name.is_empty() || req.name.len() > 64 {
        return Err(MusuError::BadRequest("name must be 1..64 chars".into()));
    }

    let url = match (&req.url, &req.tailscale_ip) {
        (Some(u), _) if !u.trim().is_empty() => u.trim().trim_end_matches('/').to_string(),
        (_, Some(ip)) if !ip.trim().is_empty() => format!("http://{}:8070", ip.trim()),
        _ => {
            return Err(MusuError::BadRequest(
                "url or tailscale_ip required".into(),
            ));
        }
    };

    let client = state.http_client.clone();

    // Health check (3s).
    let health_url = format!("{}/health", url);
    let healthy = matches!(
        timeout(Duration::from_secs(3), client.get(&health_url).send()).await,
        Ok(Ok(r)) if r.status().is_success()
    );

    // Peer accept-peer call (10s). Best-effort.
    let accept_url = format!("{}/api/nodes/accept-peer", url);
    let accept_body = serde_json::json!({
        "peer": {
            "name": state.config.node_name,
            "url": state
                .config
                .public_url
                .clone()
                .unwrap_or_else(|| format!("http://127.0.0.1:{}", state.config.bridge_port)),
        }
    });
    let mut req_b = client.post(&accept_url);
    if !state.config.token.is_empty() {
        req_b = req_b.bearer_auth(&state.config.token);
    }
    let peer_acceptance = match timeout(
        Duration::from_secs(10),
        req_b.json(&accept_body).send(),
    )
    .await
    {
        Ok(Ok(r)) => Some(r.status().is_success()),
        _ => Some(false),
    };

    // Persist to nodes.toml.
    let mut file = read_nodes_toml(&state.config.nodes_toml_path);
    file.nodes.insert(
        req.name.clone(),
        NodeEntry {
            url: url.clone(),
            tailscale_ip: req.tailscale_ip.clone(),
            agents: req.agents.clone(),
            machine: None,
            os: None,
            gpu: None,
            roles: vec!["bridge".into()],
            last_health_at: if healthy {
                Some(chrono::Utc::now().timestamp())
            } else {
                None
            },
        },
    );

    if let Err(e) = write_nodes_toml(&state.config.nodes_toml_path, &file) {
        return Err(MusuError::Internal(format!("nodes.toml write: {}", e)));
    }

    Ok(Json(NodeAddResponse {
        name: req.name,
        url,
        healthy,
        peer_acceptance,
        note: if healthy {
            None
        } else {
            Some("peer unreachable; persisted but marked unhealthy".into())
        },
    }))
}
