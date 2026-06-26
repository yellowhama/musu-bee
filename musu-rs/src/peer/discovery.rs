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
use std::net::IpAddr;

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

fn is_remote_usable_addr(addr: &str) -> bool {
    let addr = addr.trim();
    if addr.is_empty() {
        return false;
    }
    let host = if let Some(rest) = addr.strip_prefix('[') {
        rest.find(']').map(|idx| &rest[..idx]).unwrap_or(rest)
    } else {
        addr.rsplit_once(':').map(|(host, _)| host).unwrap_or(addr)
    };
    let normalized = host
        .trim()
        .trim_matches(&['[', ']'][..])
        .trim_end_matches('.');
    if normalized.is_empty() || normalized.eq_ignore_ascii_case("localhost") {
        return false;
    }
    match normalized.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => !ip.is_loopback() && !ip.is_unspecified(),
        Ok(IpAddr::V6(ip)) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                !mapped.is_loopback() && !mapped.is_unspecified()
            } else {
                !ip.is_loopback() && !ip.is_unspecified()
            }
        }
        Err(_) => true,
    }
}

fn cache_node_route_addrs(node: &CachedNode) -> Vec<String> {
    let mut addrs = Vec::new();
    if is_remote_usable_addr(&node.addr) {
        addrs.push(node.addr.clone());
    }

    let Some(candidates) = node
        .meta
        .as_ref()
        .and_then(|meta| meta.get("candidate_endpoints"))
        .and_then(|value| value.as_array())
    else {
        return addrs;
    };

    for candidate in candidates {
        let kind = candidate
            .get("kind")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        if matches!(kind, "relay" | "failed") {
            continue;
        }

        let addr = if kind == "direct_quic" {
            candidate
                .get("public_addr")
                .and_then(|value| value.as_str())
                .or_else(|| candidate.get("addr").and_then(|value| value.as_str()))
        } else {
            candidate.get("addr").and_then(|value| value.as_str())
        };
        let Some(addr) = addr.map(str::trim).filter(|addr| !addr.is_empty()) else {
            continue;
        };
        if !is_remote_usable_addr(addr) || addrs.iter().any(|existing| existing.as_str() == addr) {
            continue;
        }
        addrs.push(addr.to_string());
    }

    addrs
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
/// V30 WS-A (Critic H-2 / Auditor MEDIUM): reconcile a manual peer list against
/// the live registry (node_name → current addr). Drops only TRUE reinstall
/// ghosts — a manual record whose name the registry knows but at a DIFFERENT
/// address. Records the registry doesn't know (LAN-only manual peers) and
/// nameless ad-hoc records are always kept. The caller MUST guard with a
/// non-empty registry: an empty registry snapshot means "no info", never "all
/// peers gone", so this fn is a no-op when `registry` is empty (every name maps
/// to nothing → `None => true` keeps everything). Returns (reconciled, pruned).
pub fn reconcile_manual_against_registry(
    mut manual: ManualPeerList,
    registry: &std::collections::HashMap<String, String>,
) -> (ManualPeerList, usize) {
    let before = manual.peers.len();
    manual.peers.retain(|p| match &p.name {
        Some(name) => match registry.get(name) {
            // same name, different addr in registry → stale reinstall ghost, drop
            Some(reg_addr) => reg_addr == &p.addr,
            // name not in registry → LAN-only manual peer, keep
            None => true,
        },
        None => true, // nameless ad-hoc peer, keep
    });
    let pruned = before - manual.peers.len();
    (manual, pruned)
}

pub fn resolve_all_peers(musu_home: &Path) -> Vec<ResolvedPeer> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();

    // V30 WS-A (Critic H-1, option a): the cached musu.pro registry is the
    // SOURCE OF TRUTH for any node it knows. We collect the set of registered
    // node names from the cache (Source 1), then DROP any manual / nodes.toml
    // record whose name is already registered — those are stale addresses left
    // over from a reinstall that changed the node's ephemeral port. The registry
    // holds the node's CURRENT address; identity is the (server-unique) node
    // NAME, not host:port. A manual/nodes.toml record survives ONLY when its
    // name is NOT in the registry (a genuine LAN-only peer) or has no name.
    let mut registry_names: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Source 1: cached registry (authoritative)
    if let Some(cache) = CachedRegistry::load(musu_home) {
        for node in &cache.nodes {
            let route_addrs = cache_node_route_addrs(node);
            if route_addrs.is_empty() {
                tracing::warn!(
                    node = %node.name,
                    addr = %node.addr,
                    "ignoring cached registry node with no routable candidate addr"
                );
                continue;
            }
            registry_names.insert(node.name.clone());
            for addr in route_addrs {
                if !seen.insert(addr.clone()) {
                    continue;
                }
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
                    addr,
                    name: Some(node.name.clone()),
                    source: PeerSource::Cache,
                    meta: Some(meta),
                });
            }
        }
    }

    // Source 2: manual peers — skip any whose name the registry already owns
    // (stale reinstall ghost). Keep name=None ad-hoc peers and names the
    // registry doesn't know (true LAN-only manual peers).
    let manual = ManualPeerList::load(musu_home);
    for peer in &manual.peers {
        if let Some(name) = &peer.name {
            if registry_names.contains(name) {
                continue; // registry is authoritative for this node's address
            }
        }
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
                // V30 WS-A: registry is authoritative — skip nodes.toml entries
                // whose name the registry already owns (same reinstall-ghost rule
                // as manual peers above).
                if registry_names.contains(name) {
                    continue;
                }
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
    fn remote_usable_addr_rejects_loopback_and_wildcard_cache_addrs() {
        assert!(!is_remote_usable_addr("127.0.0.1:8070"));
        assert!(!is_remote_usable_addr("localhost:8070"));
        assert!(!is_remote_usable_addr("0.0.0.0:8070"));
        assert!(!is_remote_usable_addr("[::1]:8070"));
        assert!(!is_remote_usable_addr("[::ffff:127.0.0.1]:8070"));
        assert!(!is_remote_usable_addr("[::ffff:0.0.0.0]:8070"));
        assert!(is_remote_usable_addr("192.168.1.50:8070"));
        assert!(is_remote_usable_addr("[fd7a:115c:a1e0::1]:8070"));
        assert!(is_remote_usable_addr("peer.example.test:443"));
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

    /// V30 WS-A: the registry is authoritative. A reinstall ghost — the SAME
    /// node name in the registry (new port) and in manual_peers (old dead port,
    /// `meta:None`) — must resolve to ONLY the registry address. The stale manual
    /// port is dropped, so status/routing never probe the dead port.
    #[test]
    fn resolve_drops_manual_when_name_in_registry() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        // Registry knows hugh-main at the CURRENT port (with a real heartbeat).
        let cache = CachedRegistry {
            nodes: vec![CachedNode {
                node_id: "hugh-main".into(),
                name: "hugh-main".into(),
                addr: "192.168.1.192:8001".into(),
                capabilities: vec![],
                last_heartbeat: Some(Utc::now()),
                meta: None,
            }],
            fetched_at: Utc::now(),
            registry_url: "https://musu.pro".into(),
        };
        cache.save(&dir).unwrap();

        // manual_peers still has the dead pre-reinstall port (nameless-of-last-
        // resort would be meta:None; here it carries the same name).
        let mut manual = ManualPeerList::default();
        manual.add("192.168.1.192:2957".into(), Some("hugh-main".into())); // stale ghost
        manual.save(&dir).unwrap();

        let peers = resolve_all_peers(&dir);
        let hugh: Vec<_> = peers
            .iter()
            .filter(|p| p.name.as_deref() == Some("hugh-main"))
            .collect();
        assert_eq!(hugh.len(), 1, "exactly one hugh-main addr survives");
        assert_eq!(hugh[0].addr, "192.168.1.192:8001", "registry addr wins");
        assert!(
            !peers.iter().any(|p| p.addr == "192.168.1.192:2957"),
            "stale reinstall-ghost port must be excluded"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// V33 audit: old cache files written before the public_url fix may contain
    /// `127.0.0.1:{port}` for a remote node. Such a row must not become a route
    /// candidate and must not suppress a valid same-name manual LAN peer.
    #[test]
    fn resolve_ignores_unroutable_cached_registry_rows() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let cache = CachedRegistry {
            nodes: vec![CachedNode {
                node_id: "hugh-main".into(),
                name: "hugh-main".into(),
                addr: "127.0.0.1:13397".into(),
                capabilities: vec![],
                last_heartbeat: Some(Utc::now()),
                meta: Some(serde_json::json!({
                    "public_url": "http://127.0.0.1:13397",
                    "last_seen": "2026-06-26T03:30:39Z"
                })),
            }],
            fetched_at: Utc::now(),
            registry_url: "https://musu.pro".into(),
        };
        cache.save(&dir).unwrap();

        let mut manual = ManualPeerList::default();
        manual.add("192.168.1.192:9497".into(), Some("hugh-main".into()));
        manual.save(&dir).unwrap();

        let peers = resolve_all_peers(&dir);
        assert!(
            !peers.iter().any(|p| p.addr == "127.0.0.1:13397"),
            "stale loopback cache row must not survive"
        );
        assert!(
            peers
                .iter()
                .any(|p| p.addr == "192.168.1.192:9497" && p.name.as_deref() == Some("hugh-main")),
            "valid manual peer must survive when the same-name cache row is unusable"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// V34 additive candidate-set: a registry row may carry more than one
    /// usable address for the same stable node_name. The resolver must expose
    /// all direct candidates so the route selector can race/order LAN vs
    /// tailnet, while still rejecting loopback and relay-display-only entries.
    #[test]
    fn resolve_expands_cached_registry_candidate_endpoints() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let cache = CachedRegistry {
            nodes: vec![CachedNode {
                node_id: "studio-pc".into(),
                name: "studio-pc".into(),
                addr: "192.168.1.20:8070".into(),
                capabilities: vec![],
                last_heartbeat: Some(Utc::now()),
                meta: Some(serde_json::json!({
                    "candidate_endpoints": [
                        {
                            "kind": "lan",
                            "addr": "192.168.1.20:8070",
                            "observed_at": "2026-06-27T00:00:00Z",
                            "scheme": "http"
                        },
                        {
                            "kind": "tailscale",
                            "addr": "100.64.1.20:8070",
                            "observed_at": "2026-06-27T00:00:01Z",
                            "scheme": "http"
                        },
                        {
                            "kind": "lan",
                            "addr": "127.0.0.1:8070",
                            "observed_at": "2026-06-27T00:00:02Z"
                        },
                        {
                            "kind": "relay",
                            "addr": "relay.musu.pro:443",
                            "observed_at": "2026-06-27T00:00:03Z",
                            "relay_url": "wss://relay.musu.pro/api/v1/relay/connect"
                        }
                    ]
                })),
            }],
            fetched_at: Utc::now(),
            registry_url: "https://musu.pro".into(),
        };
        cache.save(&dir).unwrap();

        let peers = resolve_all_peers(&dir);
        let addrs: Vec<&str> = peers.iter().map(|peer| peer.addr.as_str()).collect();

        assert!(addrs.contains(&"192.168.1.20:8070"));
        assert!(addrs.contains(&"100.64.1.20:8070"));
        assert!(!addrs.contains(&"127.0.0.1:8070"));
        assert!(!addrs.contains(&"relay.musu.pro:443"));
        assert_eq!(
            peers
                .iter()
                .filter(|peer| peer.name.as_deref() == Some("studio-pc"))
                .count(),
            2
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// V30 WS-A: a genuine LAN-only manual peer (name NOT in the registry) must
    /// survive — the registry-authority rule only drops names the registry owns.
    #[test]
    fn resolve_keeps_manual_when_name_absent_from_registry() {
        let dir = std::env::temp_dir().join(format!("musu-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let cache = CachedRegistry {
            nodes: vec![CachedNode {
                node_id: "hugh-main".into(),
                name: "hugh-main".into(),
                addr: "192.168.1.192:8001".into(),
                capabilities: vec![],
                last_heartbeat: Some(Utc::now()),
                meta: None,
            }],
            fetched_at: Utc::now(),
            registry_url: "https://musu.pro".into(),
        };
        cache.save(&dir).unwrap();

        let mut manual = ManualPeerList::default();
        manual.add("10.0.0.42:9999".into(), Some("lan-only-box".into())); // not in registry
        manual.add("10.0.0.43:9999".into(), None); // nameless ad-hoc
        manual.save(&dir).unwrap();

        let peers = resolve_all_peers(&dir);
        assert!(
            peers.iter().any(|p| p.addr == "10.0.0.42:9999"),
            "LAN-only manual peer (name not in registry) must survive"
        );
        assert!(
            peers.iter().any(|p| p.addr == "10.0.0.43:9999"),
            "nameless ad-hoc manual peer must survive"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// V30 WS-A (Auditor MEDIUM): an EMPTY registry must be a no-op — a registry
    /// fetch that returns zero nodes means "no info", never "delete everything".
    #[test]
    fn prune_noop_on_empty_registry() {
        let mut manual = ManualPeerList::default();
        manual.add("192.168.1.192:2957".into(), Some("hugh-main".into()));
        manual.add("10.0.0.42:9999".into(), Some("lan-box".into()));
        manual.add("10.0.0.43:1".into(), None);
        let empty: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        let (out, pruned) = reconcile_manual_against_registry(manual, &empty);
        assert_eq!(pruned, 0, "empty registry must prune nothing");
        assert_eq!(out.peers.len(), 3, "all manual peers preserved");
    }

    /// V30 WS-A (Auditor MEDIUM): the core data-loss guard. A reinstall ghost
    /// (same name, different addr than the registry) is dropped; a LAN-only peer
    /// (name absent from registry), a nameless peer, and the node's CURRENT addr
    /// (same name + same addr) are all kept.
    #[test]
    fn prune_removes_stale_same_name_keeps_lan_only() {
        let mut manual = ManualPeerList::default();
        manual.add("192.168.1.192:2957".into(), Some("hugh-main".into())); // ghost (old port)
        manual.add("192.168.1.192:8001".into(), Some("hugh-main".into())); // current (matches registry)
        manual.add("10.0.0.42:9999".into(), Some("lan-box".into())); // not in registry
        manual.add("10.0.0.43:1".into(), None); // nameless ad-hoc

        let mut registry = std::collections::HashMap::new();
        registry.insert("hugh-main".to_string(), "192.168.1.192:8001".to_string());

        let (out, pruned) = reconcile_manual_against_registry(manual, &registry);
        assert_eq!(pruned, 1, "exactly the stale ghost is removed");
        let addrs: Vec<&str> = out.peers.iter().map(|p| p.addr.as_str()).collect();
        assert!(
            !addrs.contains(&"192.168.1.192:2957"),
            "stale ghost dropped"
        );
        assert!(addrs.contains(&"192.168.1.192:8001"), "current addr kept");
        assert!(addrs.contains(&"10.0.0.42:9999"), "LAN-only peer kept");
        assert!(addrs.contains(&"10.0.0.43:1"), "nameless peer kept");
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
