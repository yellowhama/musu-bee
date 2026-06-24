//! Peer discovery — wiki/514 V26-W10.
//!
//! Three-source peer resolver:
//!   1. Cached registry snapshot (`~/.musu/nodes.cache.json`, TTL 7-day)
//!   2. Manual peers (`~/.musu/manual_peers.toml`)
//!   3. nodes.toml (existing W7 infrastructure)
//!
//! §10 invariant: mesh works in all 3 states:
//!   - Registry healthy → cache refreshed every heartbeat
//!   - Registry degraded → cached snapshot TTL 7-day
//!   - Registry absent → manual peers + nodes.toml only

use std::path::Path;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Cached Registry ──────────────────────────────────────────────────

const CACHE_FILENAME: &str = "nodes.cache.json";
const CACHE_TTL_DAYS: i64 = 7;

/// A cached snapshot of the registry's known nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedRegistry {
    pub nodes: Vec<CachedNode>,
    pub fetched_at: DateTime<Utc>,
    pub registry_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedNode {
    pub node_id: String,
    pub name: String,
    pub addr: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub last_heartbeat: Option<DateTime<Utc>>,
    #[serde(default)]
    pub meta: Option<serde_json::Value>,
}

impl CachedRegistry {
    /// Read cached registry from disk. Returns None if file missing or expired.
    pub fn load(musu_home: &Path) -> Option<Self> {
        let path = musu_home.join(CACHE_FILENAME);
        let data = std::fs::read_to_string(&path).ok()?;
        let cache: Self = match serde_json::from_str(&data) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(path = %path.display(), err = %e, "corrupt nodes.cache.json, ignoring");
                return None;
            }
        };

        // Check TTL
        let age = Utc::now() - cache.fetched_at;
        if age.num_days() > CACHE_TTL_DAYS {
            tracing::info!(
                age_days = age.num_days(),
                "cached registry expired (TTL={CACHE_TTL_DAYS}d)"
            );
            return None;
        }

        Some(cache)
    }

    /// Write cache to disk.
    #[allow(dead_code)] // Used by tests + future registry heartbeat
    pub fn save(&self, musu_home: &Path) -> Result<()> {
        let path = musu_home.join(CACHE_FILENAME);
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, json)?;
        Ok(())
    }

    /// Is the cache still valid?
    #[allow(dead_code)] // Used by tests + future heartbeat refresh
    pub fn is_valid(&self) -> bool {
        let age = Utc::now() - self.fetched_at;
        age.num_days() <= CACHE_TTL_DAYS
    }
}

// ── Manual Peers ─────────────────────────────────────────────────────

const MANUAL_PEERS_FILENAME: &str = "manual_peers.toml";

/// Manual peer list for `musu peer add <addr>` CLI fallback.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ManualPeerList {
    #[serde(default)]
    pub peers: Vec<ManualPeer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualPeer {
    pub addr: String,
    pub name: Option<String>,
    pub added_at: DateTime<Utc>,
}

impl ManualPeerList {
    pub fn load(musu_home: &Path) -> Self {
        let path = musu_home.join(MANUAL_PEERS_FILENAME);
        let data = match std::fs::read_to_string(&path) {
            Ok(d) => d,
            Err(_) => return Self::default(),
        };
        match toml::from_str(&data) {
            Ok(list) => list,
            Err(e) => {
                tracing::warn!(path = %path.display(), err = %e, "corrupt manual_peers.toml, using empty list");
                Self::default()
            }
        }
    }

    pub fn save(&self, musu_home: &Path) -> Result<()> {
        let path = musu_home.join(MANUAL_PEERS_FILENAME);
        let toml = toml::to_string_pretty(self)?;
        std::fs::write(&path, toml)?;
        Ok(())
    }

    pub fn add(&mut self, addr: String, name: Option<String>) {
        // Dedup by addr
        self.peers.retain(|p| p.addr != addr);
        self.peers.push(ManualPeer {
            addr,
            name,
            added_at: Utc::now(),
        });
    }

    pub fn remove(&mut self, addr: &str) -> bool {
        let before = self.peers.len();
        self.peers.retain(|p| p.addr != addr);
        self.peers.len() < before
    }
}

/// Basic validation: addr must be non-empty and contain a colon (host:port).
pub fn validate_peer_addr(addr: &str) -> Result<(), String> {
    if addr.is_empty() {
        return Err("addr cannot be empty".into());
    }
    if !addr.contains(':') {
        return Err(format!(
            "addr '{}' must contain host:port (e.g., 192.168.1.50:8070)",
            addr
        ));
    }
    Ok(())
}

// ── Resolved Peer ────────────────────────────────────────────────────

/// A unified peer record from any source.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedPeer {
    pub addr: String,
    pub name: Option<String>,
    pub source: PeerSource,
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)] // Registry reserved for future live-registry source
pub enum PeerSource {
    Registry,
    Cache,
    Manual,
    NodesToml,
}

// ── Peer Resolver ────────────────────────────────────────────────────

/// Resolve peers from all available sources, in priority order:
///   1. Live registry (if available)
///   2. Cached registry snapshot
///   3. Manual peers
///   4. nodes.toml
///
/// Deduplicates by addr (first source wins). NOTE: this intentionally keeps
/// multiple records that share a node NAME but differ by addr (e.g. a machine
/// re-registered on a new ephemeral port) — routing/failover in
/// `bridge::router::select_peer_for_route` relies on trying alternate addrs for
/// the same name. The fleet DISPLAY path collapses same-name ghosts separately
/// (see `bridge::handlers::fleet`); do not add a name-collapse here.
pub fn resolve_all_peers(musu_home: &Path) -> Vec<ResolvedPeer> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();

    // Source 1: cached registry
    if let Some(cache) = CachedRegistry::load(musu_home) {
        for node in &cache.nodes {
            if seen.insert(node.addr.clone()) {
                let mut meta = node.meta.clone().unwrap_or_else(|| serde_json::json!({}));
                if !meta.is_object() {
                    meta = serde_json::json!({});
                }
                if let (Some(obj), Some(last_seen)) = (meta.as_object_mut(), node.last_heartbeat) {
                    obj.insert(
                        "last_seen".to_string(),
                        serde_json::json!(last_seen.to_rfc3339()),
                    );
                }
                result.push(ResolvedPeer {
                    addr: node.addr.clone(),
                    name: Some(node.name.clone()),
                    source: PeerSource::Cache,
                    meta: Some(meta),
                });
            }
        }
    }

    // Source 2: manual peers
    let manual = ManualPeerList::load(musu_home);
    for peer in &manual.peers {
        if seen.insert(peer.addr.clone()) {
            result.push(ResolvedPeer {
                addr: peer.addr.clone(),
                name: peer.name.clone(),
                source: PeerSource::Manual,
                meta: None,
            });
        }
    }

    // Source 3: nodes.toml
    let nodes_toml_path = musu_home.join("nodes.toml");
    if let Ok(text) = std::fs::read_to_string(&nodes_toml_path) {
        #[derive(Deserialize)]
        struct NodesToml {
            #[serde(default)]
            nodes: std::collections::HashMap<String, NodesTomlEntry>,
        }
        #[derive(Deserialize)]
        struct NodesTomlEntry {
            url: String,
            #[serde(default)]
            last_health_at: Option<i64>,
        }
        if let Ok(file) = toml::from_str::<NodesToml>(&text) {
            for (name, entry) in &file.nodes {
                // Extract host:port from URL (e.g., "http://192.168.1.50:8070" -> "192.168.1.50:8070")
                let scheme =
                    reqwest::Url::parse(&entry.url)
                        .ok()
                        .and_then(|url| match url.scheme() {
                            "http" | "https" => Some(url.scheme().to_string()),
                            _ => None,
                        });
                let addr = entry
                    .url
                    .trim_start_matches("http://")
                    .trim_start_matches("https://")
                    .trim_end_matches('/')
                    .to_string();
                if seen.insert(addr.clone()) {
                    let mut meta = serde_json::Map::new();
                    meta.insert("public_url".to_string(), serde_json::json!(entry.url));
                    if let Some(scheme) = scheme {
                        meta.insert("transport_scheme".to_string(), serde_json::json!(scheme));
                    }
                    if let Some(last_health_at) = entry.last_health_at {
                        meta.insert(
                            "last_health_at".to_string(),
                            serde_json::json!(last_health_at),
                        );
                    }
                    result.push(ResolvedPeer {
                        addr,
                        name: Some(name.clone()),
                        source: PeerSource::NodesToml,
                        meta: Some(serde_json::Value::Object(meta)),
                    });
                }
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_peer_add_dedup() {
        let mut list = ManualPeerList::default();
        list.add("192.168.1.50:8070".into(), Some("pc-a".into()));
        list.add("192.168.1.50:8070".into(), Some("pc-a-updated".into()));
        assert_eq!(list.peers.len(), 1);
        assert_eq!(list.peers[0].name.as_deref(), Some("pc-a-updated"));
    }

    #[test]
    fn manual_peer_remove() {
        let mut list = ManualPeerList::default();
        list.add("192.168.1.50:8070".into(), None);
        assert!(list.remove("192.168.1.50:8070"));
        assert_eq!(list.peers.len(), 0);
        assert!(!list.remove("ghost"));
    }

    #[test]
    fn manual_peer_roundtrip() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let mut list = ManualPeerList::default();
        list.add("10.0.0.5:8070".into(), Some("remote".into()));
        list.save(&dir).unwrap();

        let loaded = ManualPeerList::load(&dir);
        assert_eq!(loaded.peers.len(), 1);
        assert_eq!(loaded.peers[0].addr, "10.0.0.5:8070");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cached_registry_ttl() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let cache = CachedRegistry {
            nodes: vec![CachedNode {
                node_id: "n1".into(),
                name: "test".into(),
                addr: "1.2.3.4:8070".into(),
                capabilities: vec![],
                last_heartbeat: None,
                meta: None,
            }],
            fetched_at: Utc::now(),
            registry_url: "https://musu.pro".into(),
        };
        cache.save(&dir).unwrap();

        let loaded = CachedRegistry::load(&dir);
        assert!(loaded.is_some());
        assert!(loaded.unwrap().is_valid());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_all_peers_dedup() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        // Add cache + manual with overlap
        let cache = CachedRegistry {
            nodes: vec![CachedNode {
                node_id: "n1".into(),
                name: "cached".into(),
                addr: "1.2.3.4:8070".into(),
                capabilities: vec![],
                last_heartbeat: None,
                meta: None,
            }],
            fetched_at: Utc::now(),
            registry_url: "https://musu.pro".into(),
        };
        cache.save(&dir).unwrap();

        let mut manual = ManualPeerList::default();
        manual.add("1.2.3.4:8070".into(), Some("manual".into())); // overlap
        manual.add("5.6.7.8:8070".into(), Some("unique".into()));
        manual.save(&dir).unwrap();

        let peers = resolve_all_peers(&dir);
        assert_eq!(peers.len(), 2); // deduped

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_all_peers_preserves_cached_last_heartbeat() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let heartbeat = Utc::now();

        let cache = CachedRegistry {
            nodes: vec![CachedNode {
                node_id: "n1".into(),
                name: "cached".into(),
                addr: "1.2.3.4:8070".into(),
                capabilities: vec![],
                last_heartbeat: Some(heartbeat),
                meta: None,
            }],
            fetched_at: Utc::now(),
            registry_url: "https://musu.pro".into(),
        };
        cache.save(&dir).unwrap();

        let peers = resolve_all_peers(&dir);
        let heartbeat_s = heartbeat.to_rfc3339();
        assert_eq!(
            peers[0]
                .meta
                .as_ref()
                .and_then(|m| m.get("last_seen"))
                .and_then(|v| v.as_str()),
            Some(heartbeat_s.as_str())
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_all_peers_preserves_nodes_toml_last_health_at() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("nodes.toml"),
            r#"[nodes.lab]
url = "http://10.0.0.8:8070"
last_health_at = 1781234523
"#,
        )
        .unwrap();

        let peers = resolve_all_peers(&dir);
        assert_eq!(peers.len(), 1);
        assert_eq!(
            peers[0]
                .meta
                .as_ref()
                .and_then(|m| m.get("last_health_at"))
                .and_then(|v| v.as_i64()),
            Some(1_781_234_523)
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
