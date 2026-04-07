use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

pub const SERVICE_CLASS_GENERIC_HTTP: &str = "generic_http";
pub const SERVICE_CLASS_TCP_INGRESS: &str = "tcp_ingress";
pub const SERVICE_CLASS_QUIC_INGRESS: &str = "quic_ingress";
pub const SERVICE_CLASS_MCP_SERVER: &str = "mcp_server";
pub const SERVICE_CLASS_AGENT_FACING: &str = "agent_facing";
pub const SERVICE_CLASS_GENERIC_SERVICE: &str = "generic_service";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceRoute {
    pub name: String,
    pub alias: String,
    pub protocol: String,
    #[serde(default = "default_service_class")]
    pub service_class: String,
    #[serde(default)]
    pub agent_facing: bool,
    pub enabled: bool,
    pub running: bool,
    pub port: Option<u16>,
    pub target_url: Option<String>,
    pub entrypoint_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedService {
    pub name: String,
    #[serde(default)]
    pub alias: Option<String>,
    #[serde(default)]
    pub service_class: Option<String>,
    #[serde(default)]
    pub agent_facing: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub running: bool,
    #[serde(default)]
    pub port: Option<u16>,
}

fn default_true() -> bool {
    true
}

fn default_service_class() -> String {
    SERVICE_CLASS_GENERIC_HTTP.to_string()
}

#[derive(Debug, Clone, Default)]
pub struct SeedRouteSource {
    services: Vec<SeedService>,
}

impl SeedRouteSource {
    pub fn empty() -> Self {
        Self::default()
    }

    pub fn from_services(services: Vec<SeedService>) -> Self {
        Self { services }
    }

    pub fn from_path(path: &Path) -> Result<Self, String> {
        let raw = std::fs::read_to_string(path)
            .map_err(|err| format!("failed to read seed services '{}': {err}", path.display()))?;
        let services = serde_json::from_str::<Vec<SeedService>>(&raw)
            .map_err(|err| format!("failed to parse seed services '{}': {err}", path.display()))?;
        Ok(Self { services })
    }

    pub fn routes(&self, router_base_url: &str) -> Vec<ServiceRoute> {
        let base = router_base_url.trim_end_matches('/');
        let mut routes = self
            .services
            .iter()
            .map(|service| {
                let alias = service
                    .alias
                    .clone()
                    .unwrap_or_else(|| service.name.clone());
                let service_class = normalize_service_class(
                    service.service_class.as_deref(),
                    "http",
                    service.agent_facing,
                );
                ServiceRoute {
                    name: service.name.clone(),
                    alias: alias.clone(),
                    protocol: "http".to_string(),
                    service_class: service_class.clone(),
                    agent_facing: service.agent_facing
                        || service_class == SERVICE_CLASS_MCP_SERVER
                        || service_class == SERVICE_CLASS_AGENT_FACING,
                    enabled: service.enabled,
                    running: service.running,
                    port: service.port,
                    target_url: service.port.map(|port| format!("http://127.0.0.1:{port}")),
                    entrypoint_url: format!("{base}/{alias}"),
                }
            })
            .collect::<Vec<_>>();
        routes.sort_by(|a, b| a.alias.cmp(&b.alias));
        routes
    }
}

pub type ExtraRoutes = Arc<RwLock<HashMap<String, ServiceRoute>>>;

pub fn new_extra_routes() -> ExtraRoutes {
    Arc::new(RwLock::new(HashMap::new()))
}

pub fn default_service_class_for_protocol(protocol: &str) -> &'static str {
    match protocol.trim().to_ascii_lowercase().as_str() {
        "tcp" => SERVICE_CLASS_TCP_INGRESS,
        "quic" => SERVICE_CLASS_QUIC_INGRESS,
        "http" | "ws" => SERVICE_CLASS_GENERIC_HTTP,
        _ => SERVICE_CLASS_GENERIC_SERVICE,
    }
}

pub fn normalize_service_class(raw: Option<&str>, protocol: &str, agent_facing: bool) -> String {
    let normalized = raw
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .map(|value| match value.as_str() {
            "http" | "generic_http" => SERVICE_CLASS_GENERIC_HTTP.to_string(),
            "tcp" | "tcp_ingress" => SERVICE_CLASS_TCP_INGRESS.to_string(),
            "quic" | "quic_ingress" => SERVICE_CLASS_QUIC_INGRESS.to_string(),
            "mcp" | "mcp_server" => SERVICE_CLASS_MCP_SERVER.to_string(),
            "agent" | "agent_facing" => SERVICE_CLASS_AGENT_FACING.to_string(),
            other => other.to_string(),
        })
        .unwrap_or_else(|| default_service_class_for_protocol(protocol).to_string());

    if agent_facing && normalized == SERVICE_CLASS_GENERIC_HTTP {
        SERVICE_CLASS_AGENT_FACING.to_string()
    } else {
        normalized
    }
}

pub fn is_agent_facing_service(service_class: &str, agent_facing: bool) -> bool {
    agent_facing
        || matches!(
            service_class.trim(),
            SERVICE_CLASS_MCP_SERVER | SERVICE_CLASS_AGENT_FACING
        )
}
