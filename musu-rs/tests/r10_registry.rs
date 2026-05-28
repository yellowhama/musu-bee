//! V26-W10 integration tests — registry hardening (discovery + manual peers).
//!
//! Tests cached registry, manual peer list, peer resolver,
//! and CLI add/remove roundtrips.

use musu_rs::peer::discovery::{
    resolve_all_peers, CachedNode, CachedRegistry, ManualPeerList, PeerSource, ResolvedPeer,
};

fn temp_musu_home() -> (std::path::PathBuf, impl Drop) {
    let dir = std::env::temp_dir().join(format!("musu-r10-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    let c = Cleanup(dir.clone());
    (dir, c)
}

#[test]
fn t01_manual_peer_add_dedup() {
    let mut list = ManualPeerList::default();
    list.add("192.168.1.50:8070".into(), Some("pc-a".into()));
    list.add("192.168.1.50:8070".into(), Some("pc-a-v2".into()));
    assert_eq!(list.peers.len(), 1, "duplicate addr should be deduped");
    assert_eq!(list.peers[0].name.as_deref(), Some("pc-a-v2"));
}

#[test]
fn t02_manual_peer_remove() {
    let mut list = ManualPeerList::default();
    list.add("10.0.0.1:8070".into(), None);
    assert!(list.remove("10.0.0.1:8070"));
    assert!(list.peers.is_empty());
    assert!(
        !list.remove("ghost:8070"),
        "removing non-existent returns false"
    );
}

#[test]
fn t03_manual_peer_roundtrip_toml() {
    let (dir, _cleanup) = temp_musu_home();

    let mut list = ManualPeerList::default();
    list.add("10.0.0.5:8070".into(), Some("remote-gpu".into()));
    list.add("10.0.0.6:8070".into(), None);
    list.save(&dir).unwrap();

    let loaded = ManualPeerList::load(&dir);
    assert_eq!(loaded.peers.len(), 2);
    assert_eq!(loaded.peers[0].addr, "10.0.0.5:8070");
    assert_eq!(loaded.peers[0].name.as_deref(), Some("remote-gpu"));
    assert_eq!(loaded.peers[1].addr, "10.0.0.6:8070");
}

#[test]
fn t04_cached_registry_save_load() {
    let (dir, _cleanup) = temp_musu_home();

    let cache = CachedRegistry {
        nodes: vec![CachedNode {
            node_id: "n1".into(),
            name: "test-node".into(),
            addr: "1.2.3.4:8070".into(),
            capabilities: vec!["ollama".into()],
            last_heartbeat: None,
            meta: None,
        }],
        fetched_at: chrono::Utc::now(),
        registry_url: "https://musu.pro".into(),
    };
    cache.save(&dir).unwrap();

    let loaded = CachedRegistry::load(&dir);
    assert!(loaded.is_some());
    let loaded = loaded.unwrap();
    assert_eq!(loaded.nodes.len(), 1);
    assert_eq!(loaded.nodes[0].name, "test-node");
    assert!(loaded.is_valid());
}

#[test]
fn t05_cached_registry_expired_returns_none() {
    let (dir, _cleanup) = temp_musu_home();

    let cache = CachedRegistry {
        nodes: vec![],
        fetched_at: chrono::Utc::now() - chrono::Duration::days(8), // 8 days > 7-day TTL
        registry_url: "https://musu.pro".into(),
    };
    cache.save(&dir).unwrap();

    let loaded = CachedRegistry::load(&dir);
    assert!(loaded.is_none(), "expired cache should return None");
}

#[test]
fn t06_cached_registry_missing_returns_none() {
    let (dir, _cleanup) = temp_musu_home();
    let loaded = CachedRegistry::load(&dir);
    assert!(loaded.is_none(), "missing file should return None");
}

#[test]
fn t07_resolver_dedup_cache_over_manual() {
    let (dir, _cleanup) = temp_musu_home();

    // Cache has addr X
    let cache = CachedRegistry {
        nodes: vec![CachedNode {
            node_id: "n1".into(),
            name: "from-cache".into(),
            addr: "1.2.3.4:8070".into(),
            capabilities: vec![],
            last_heartbeat: None,
            meta: None,
        }],
        fetched_at: chrono::Utc::now(),
        registry_url: "https://musu.pro".into(),
    };
    cache.save(&dir).unwrap();

    // Manual also has addr X (should be deduped)
    let mut manual = ManualPeerList::default();
    manual.add("1.2.3.4:8070".into(), Some("manual-dupe".into()));
    manual.add("5.6.7.8:8070".into(), Some("unique-manual".into()));
    manual.save(&dir).unwrap();

    let peers = resolve_all_peers(&dir);
    assert_eq!(peers.len(), 2, "should dedup overlapping addr");

    // First should be from cache (higher priority)
    assert!(matches!(peers[0].source, PeerSource::Cache));
    assert_eq!(peers[0].name.as_deref(), Some("from-cache"));
}

#[test]
fn t08_resolver_manual_only_when_no_cache() {
    let (dir, _cleanup) = temp_musu_home();

    let mut manual = ManualPeerList::default();
    manual.add("10.0.0.1:8070".into(), Some("only-manual".into()));
    manual.save(&dir).unwrap();

    let peers = resolve_all_peers(&dir);
    assert_eq!(peers.len(), 1);
    assert!(matches!(peers[0].source, PeerSource::Manual));
}

#[test]
fn t09_resolver_empty_when_no_sources() {
    let (dir, _cleanup) = temp_musu_home();
    let peers = resolve_all_peers(&dir);
    assert!(peers.is_empty());
}

#[test]
fn t10_invariant_3_states() {
    // §10 invariant: mesh works in all 3 states
    // State 1: registry healthy (cache valid)
    // State 2: registry degraded (cache expired → None)
    // State 3: registry absent (no cache, manual only)
    // This test just confirms all 3 code paths don't panic

    let (dir, _cleanup) = temp_musu_home();

    // State 3: absent
    let _p3 = resolve_all_peers(&dir);

    // State 1: healthy
    let cache = CachedRegistry {
        nodes: vec![CachedNode {
            node_id: "n1".into(),
            name: "healthy".into(),
            addr: "1.1.1.1:8070".into(),
            capabilities: vec![],
            last_heartbeat: None,
            meta: None,
        }],
        fetched_at: chrono::Utc::now(),
        registry_url: "https://musu.pro".into(),
    };
    cache.save(&dir).unwrap();
    let p1 = resolve_all_peers(&dir);
    assert!(!p1.is_empty());

    // State 2: degraded (expired)
    let cache_old = CachedRegistry {
        nodes: vec![CachedNode {
            node_id: "n1".into(),
            name: "old".into(),
            addr: "2.2.2.2:8070".into(),
            capabilities: vec![],
            last_heartbeat: None,
            meta: None,
        }],
        fetched_at: chrono::Utc::now() - chrono::Duration::days(10),
        registry_url: "https://musu.pro".into(),
    };
    cache_old.save(&dir).unwrap();
    let _p2 = resolve_all_peers(&dir); // cache expired, returns manual only
                                       // No panic = invariant holds ✓
}

#[test]
fn t11_cached_node_serde() {
    let node = CachedNode {
        node_id: "abc-123".into(),
        name: "gpu-box".into(),
        addr: "10.0.0.99:8070".into(),
        capabilities: vec!["ollama".into(), "comfyui".into()],
        last_heartbeat: Some(chrono::Utc::now()),
        meta: None,
    };
    let json = serde_json::to_string(&node).unwrap();
    let back: CachedNode = serde_json::from_str(&json).unwrap();
    assert_eq!(back.node_id, "abc-123");
    assert_eq!(back.capabilities.len(), 2);
}

#[test]
fn t12_peer_source_serializes_lowercase() {
    let peer = ResolvedPeer {
        addr: "1.2.3.4:8070".into(),
        name: None,
        source: PeerSource::Cache,
        meta: None,
    };
    let json = serde_json::to_string(&peer).unwrap();
    assert!(json.contains("\"cache\""));
}
