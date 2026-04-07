use std::collections::BTreeMap;

use crate::domain::peers::{DiscoveryState, PeerRecord};

pub trait DiscoveryProvider {
    fn discover(&self) -> Vec<PeerRecord>;
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct InMemoryDiscoveredPeerRegistry {
    peers: BTreeMap<String, PeerRecord>,
}

impl InMemoryDiscoveredPeerRegistry {
    pub fn upsert(&mut self, peer: PeerRecord) {
        self.peers.insert(peer.peer_id.clone(), peer);
    }

    pub fn peer(&self, peer_id: &str) -> Option<&PeerRecord> {
        self.peers.get(peer_id)
    }

    pub fn apply_provider<P: DiscoveryProvider>(&mut self, provider: &P) {
        for peer in provider.discover() {
            self.upsert(peer);
        }
    }

    pub fn mark_state(&mut self, peer_id: &str, state: DiscoveryState) -> bool {
        if let Some(peer) = self.peers.get_mut(peer_id) {
            peer.discovery_state = state;
            true
        } else {
            false
        }
    }

    pub fn peers(&self) -> Vec<&PeerRecord> {
        self.peers.values().collect()
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
                last_seen_at: "2026-04-02T00:00:00Z".into(),
                discovered_via: "mdns".into(),
            }]
        }
    }

    #[test]
    fn provider_results_are_loaded_into_registry() {
        let mut registry = InMemoryDiscoveredPeerRegistry::default();
        registry.apply_provider(&StaticDiscoveryProvider);

        assert_eq!(registry.peers().len(), 1);
        assert_eq!(
            registry
                .peer("peer-a")
                .map(|peer| peer.discovered_via.as_str()),
            Some("mdns")
        );
    }

    #[test]
    fn mark_state_updates_discovered_peer() {
        let mut registry = InMemoryDiscoveredPeerRegistry::default();
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
