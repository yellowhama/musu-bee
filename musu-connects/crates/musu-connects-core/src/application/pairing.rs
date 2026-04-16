use crate::domain::peers::{DiscoveryState, PeerRecord};
use crate::domain::protocol::{ConnectsFrame, ConnectsOpCode, PairRequestPayload, PairSuccessPayload};
use crate::domain::transport::{SessionRecord, SessionRegistry, TransportState};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairingError {
    BlockedPeer,
    InvalidToken,
}

#[derive(Debug, Clone, Default)]
pub struct PairingService;

impl PairingService {
    pub fn pair_peer(
        &self,
        peer: &PeerRecord,
        request: &PairRequestPayload,
        session_id: &str,
        now: &str,
    ) -> Result<ConnectsFrame, PairingError> {
        if peer.discovery_state == DiscoveryState::Blocked {
            return Err(PairingError::BlockedPeer);
        }

        if request.token.is_empty() {
            return Err(PairingError::InvalidToken);
        }

        let payload = PairSuccessPayload {
            peer_id: peer.peer_id.clone(),
            session_id: session_id.to_owned(),
            accepted_at: now.to_owned(),
            control_stream: "bi/0/control".into(),
        };

        Ok(ConnectsFrame {
            op: ConnectsOpCode::PairSuccess,
            payload: serde_json::to_value(&payload).expect("serialize payload"),
        })
    }

    pub fn apply_pairing_success(
        &self,
        registry: &SessionRegistry,
        peer: &PeerRecord,
        session_id: &str,
        now: &str,
    ) {
        registry.upsert_session(SessionRecord {
            peer_id: peer.peer_id.clone(),
            session_id: session_id.to_string(),
            remote_addr: peer.observed_addr.clone().unwrap_or_else(|| "0.0.0.0:0".to_string()),
            transport_state: TransportState::Connected,
            connected_at: now.to_string(),
            last_heartbeat_at: now.to_string(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::{PairingError, PairingService};
    use crate::domain::peers::{DeviceIdentity, DiscoveryState, PeerRecord, TrustLevel};
    use crate::domain::protocol::{ConnectsOpCode, PairRequestPayload, PairSuccessPayload};
    use crate::domain::transport::{SessionRegistry, TransportState};

    fn peer_record(trust_level: TrustLevel, discovery_state: DiscoveryState) -> PeerRecord {
        PeerRecord {
            peer_id: "peer-a".into(),
            device: DeviceIdentity {
                device_id: "device-a".into(),
                device_label: "Workstation A".into(),
                host_platform: "linux".into(),
                runtime_profile: "desktop".into(),
            },
            trust_level,
            visibility_scope: "org".into(),
            discovery_state,
            observed_addr: Some("127.0.0.1:4433".into()),
            last_seen_at: "2026-04-03T00:00:00Z".into(),
            discovered_via: "quic".into(),
        }
    }

    #[test]
    fn pairing_success_produces_pair_success_frame() {
        let service = PairingService::default();
        let peer = peer_record(TrustLevel::Known, DiscoveryState::Discovered);
        let request = PairRequestPayload {
            peer_id: "peer-a".into(),
            node_id: "node-a".into(),
            token: "valid-token".into(),
            requested_at: "2026-04-03T00:00:00Z".into(),
        };

        let result = service
            .pair_peer(&peer, &request, "session-a", "2026-04-03T00:00:01Z")
            .expect("pairing should succeed");

        assert_eq!(result.op, ConnectsOpCode::PairSuccess);
        let payload: PairSuccessPayload =
            serde_json::from_value(result.payload).expect("decode payload");
        assert_eq!(payload.session_id, "session-a");
    }

    #[test]
    fn blocked_peer_pairing_fails() {
        let service = PairingService::default();
        let peer = peer_record(TrustLevel::Blocked, DiscoveryState::Blocked);
        let request = PairRequestPayload {
            peer_id: "peer-a".into(),
            node_id: "node-a".into(),
            token: "valid-token".into(),
            requested_at: "2026-04-03T00:00:00Z".into(),
        };

        let result = service.pair_peer(&peer, &request, "session-a", "2026-04-03T00:00:01Z");

        assert_eq!(result, Err(PairingError::BlockedPeer));
    }

    #[test]
    fn apply_pairing_success_updates_registry() {
        let service = PairingService::default();
        let registry = SessionRegistry::default();
        let peer = peer_record(TrustLevel::Known, DiscoveryState::Discovered);

        service.apply_pairing_success(&registry, &peer, "session-a", "2026-04-03T00:00:01Z");

        let sessions = registry.sessions_for_peer("peer-a");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].transport_state, TransportState::Connected);
        assert_eq!(sessions[0].remote_addr, "127.0.0.1:4433");
    }
}
