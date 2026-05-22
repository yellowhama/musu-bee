use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::timeout;

/// Per-peer capability snapshot. Stored in node.toml and (optionally)
/// posted to the local bridge + musu.pro registry. Enum-tagged so W5
/// (V27 deferred) can extend each variant with structured fields
/// without breaking on-disk format.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Capability {
    Ollama {
        /// Models reported by `GET /api/tags`. Empty Vec if Ollama
        /// reachable but no models pulled yet.
        models: Vec<String>,
        /// Base URL probed. Recorded for operator forensics.
        base_url: String,
    },
    Comfyui {
        /// Port the ComfyUI server is listening on. Default 8188.
        port: u16,
        /// Base URL probed.
        base_url: String,
    },
    Script {
        /// Verbatim start command for opaque worker. No autodetect.
        cmd: String,
    },
}

pub async fn probe_ollama(base_url: &str) -> Capability {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("reqwest client build");
    let models = match timeout(Duration::from_secs(5), client.get(&url).send()).await {
        Ok(Ok(resp)) if resp.status().is_success() => {
            match resp.json::<serde_json::Value>().await {
                Ok(j) => j.get("models")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter()
                        .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from))
                        .collect())
                    .unwrap_or_default(),
                Err(_) => Vec::new(),
            }
        }
        _ => {
            tracing::warn!(url, "Ollama probe failed; capability will be empty");
            Vec::new()
        }
    };
    Capability::Ollama { models, base_url: base_url.into() }
}

pub async fn probe_comfyui(base_url: &str) -> Capability {
    let stats_url = format!("{}/system_stats", base_url.trim_end_matches('/'));
    let port = parse_port(base_url).unwrap_or(8188);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("reqwest client build");
    let reachable = matches!(
        timeout(Duration::from_secs(5), client.get(&stats_url).send()).await,
        Ok(Ok(r)) if r.status().is_success() || r.status() == 404
    );
    if !reachable {
        tracing::warn!(url = stats_url, "ComfyUI probe failed; recording port-only capability");
    }
    Capability::Comfyui { port, base_url: base_url.into() }
}

pub fn probe_script(start_cmd: &str) -> Capability {
    Capability::Script { cmd: start_cmd.into() }
}

fn parse_port(base_url: &str) -> Option<u16> {
    let trimmed = base_url.trim_end_matches('/');
    if let Some(pos) = trimmed.rfind(':') {
        let port_part = &trimmed[pos + 1..];
        if let Ok(port) = port_part.parse::<u16>() {
            return Some(port);
        }
    }
    None
}
