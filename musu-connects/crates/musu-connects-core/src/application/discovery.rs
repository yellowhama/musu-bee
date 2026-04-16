use std::sync::Arc;
use dashmap::DashMap;
use std::time::{Duration, Instant};

use crate::domain::peers::{DiscoveryState, PeerRecord, TrustLevel};
use crate::application::quic_provider::QuicProvider;

pub trait DiscoveryProvider {
    fn discover(&self) -> Vec<PeerRecord>;
}

#[derive(Debug, Clone, Default)]
pub struct InMemoryDiscoveredPeerRegistry {
    peers: Arc<DashMap<String, PeerRecord>>,
}

impl InMemoryDiscoveredPeerRegistry {
    pub fn upsert(&self, peer: PeerRecord) {
        self.peers.insert(peer.peer_id.clone(), peer);
    }

    pub fn peer(&self, peer_id: &str) -> Option<PeerRecord> {
        self.peers.get(peer_id).map(|r| r.value().clone())
    }

    pub fn apply_provider<P: DiscoveryProvider>(&self, provider: &P) {
        for peer in provider.discover() {
            self.upsert(peer);
        }
    }

    pub fn mark_state(&self, peer_id: &str, state: DiscoveryState) -> bool {
        if let Some(mut peer) = self.peers.get_mut(peer_id) {
            peer.discovery_state = state;
            true
        } else {
            false
        }
    }

    pub fn peers(&self) -> Vec<PeerRecord> {
        self.peers.iter().map(|r| r.value().clone()).collect()
    }
}

pub struct DiscoveryService {
    registry: Arc<InMemoryDiscoveredPeerRegistry>,
    quic_provider: Arc<QuicProvider>,
    trusted_fingerprints: Arc<DashMap<String, String>>, // peer_id -> sha256_fingerprint
    pending_dials: Arc<DashMap<String, Instant>>,      // peer_id -> dial_start_at
}

impl DiscoveryService {
    pub fn new(
        registry: Arc<InMemoryDiscoveredPeerRegistry>,
        quic_provider: Arc<QuicProvider>,
        trusted_fingerprints: Arc<DashMap<String, String>>,
    ) -> Self {
        Self {
            registry,
            quic_provider,
            trusted_fingerprints,
            pending_dials: Arc::new(DashMap::new()),
        }
    }

    pub async fn process_discoveries(&self, providers: &[Box<dyn DiscoveryProvider + Send + Sync>]) {
        for provider in providers {
            let peers = provider.discover();
            for peer in peers {
                self.process_peer_discovery(peer, None).await;
            }
        }
    }

    pub async fn process_peer_discovery(&self, mut peer: PeerRecord, observed_fingerprint: Option<String>) {
        let peer_id = peer.peer_id.clone();
        
        // Instant Verification if fingerprint matches
        if let Some(ref fp) = observed_fingerprint {
            if let Some(trusted_fp) = self.trusted_fingerprints.get(&peer_id) {
                if trusted_fp.value() == fp {
                    peer.discovery_state = DiscoveryState::Verified;
                    peer.trust_level = TrustLevel::Trusted;
                    eprintln!("[discovery] Peer {} instantly verified via fingerprint match", peer_id);
                }
            }
        }

        let observed_addr = peer.observed_addr.clone();
        let current_state = peer.discovery_state.clone();
        
        self.registry.upsert(peer);

        // Auto-dial if Verified or Trusted
        if current_state == DiscoveryState::Verified || current_state == DiscoveryState::Connected {
            if let Some(addr) = observed_addr {
                // Race Condition Defense: Check if a dial is already in progress for this peer
                if let Some(start_at) = self.pending_dials.get(&peer_id) {
                    if start_at.elapsed() < Duration::from_secs(30) {
                        return; // Already dialing, skip
                    }
                }

                self.pending_dials.insert(peer_id.clone(), Instant::now());

                let provider = self.quic_provider.clone();
                let now = chrono::Utc::now().to_rfc3339();
                let expected_fp = self.trusted_fingerprints.get(&peer_id).map(|r| r.value().clone());
                let pending_dials = self.pending_dials.clone();
                let peer_id_for_task = peer_id.clone();

                tokio::spawn(async move {
                    eprintln!("[discovery] Auto-dialing peer {} at {}", peer_id, addr);
                    
                    let result = provider.dial(
                        &peer_id, 
                        &format!("auto-{}", peer_id), 
                        &addr, 
                        expected_fp.as_deref(), 
                        &now
                    ).await;

                    if let Ok(_event) = result {
                        eprintln!("[discovery] Successfully connected to peer {}", peer_id);
                    }

                    pending_dials.remove(&peer_id_for_task);
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{DiscoveryProvider, InMemoryDiscoveredPeerRegistry};
    use crate::domain::peers::{DeviceIdentity, DiscoveryState, PeerRecord, TrustLevel};

    struct StaticDiscoveryProvider;

    impl DiscoveryProvider for StaticDiscoveryProvider {
        fn discover(&self) -> Vec<PeerRecord> {
            vec![PeerRecord {
                peer_id: "peer-a".into(),
                device: DeviceIdentity {
                    device_id: "device-a".into(),
                    device_label: "Node A".into(),
                    host_platform: "windows".into(),
                    runtime_profile: "desktop".into(),
                },
                trust_level: TrustLevel::Known,
                visibility_scope: "org".into(),
                discovery_state: DiscoveryState::Discovered,
                observed_addr: Some("127.0.0.1:4433".into()),
                last_seen_at: "2026-04-02T00:00:00Z".into(),
                discovered_via: "mdns".into(),
            }]
        }
    }

    #[test]
    fn provider_results_are_loaded_into_registry() {
        let registry = InMemoryDiscoveredPeerRegistry::default();
        registry.apply_provider(&StaticDiscoveryProvider);

        assert_eq!(registry.peers().len(), 1);
        assert_eq!(
            registry
                .peer("peer-a")
                .map(|peer| peer.discovered_via),
            Some("mdns".to_string())
        );
    }

    #[test]
    fn mark_state_updates_discovered_peer() {
        let registry = InMemoryDiscoveredPeerRegistry::default();
        registry.apply_provider(&StaticDiscoveryProvider);

        assert!(registry.mark_state("peer-a", DiscoveryState::Verified));
        assert_eq!(
            registry
                .peer("peer-a")
                .map(|peer| peer.discovery_state.clone()),
            Some(DiscoveryState::Verified)
        );
    }
}
