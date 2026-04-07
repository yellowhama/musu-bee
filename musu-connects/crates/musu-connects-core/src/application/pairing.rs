use serde_json::to_value;

use crate::domain::peers::{DiscoveryState, PeerRecord, TrustLevel};
use crate::domain::protocol::{
    ConnectsFrame, ConnectsOpCode, ErrorPayload, PairRequestPayload, PairSuccessPayload,
};
use crate::domain::transport::{
    HealthRecord, Reachability, ReconcileState, SessionRecord, SessionRegistry, TransportState,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairingError {
    BlockedPeer,
    InvalidToken,
}

pub struct PairingService {
    session_registry: SessionRegistry,
}

impl Default for PairingService {
    fn default() -> Self {
        Self {
            session_registry: SessionRegistry::default(),
        }
    }
}

impl PairingService {
    pub fn session_registry(&self) -> &SessionRegistry {
        &self.session_registry
    }

    pub fn pair_peer(
        &mut self,
        peer: &PeerRecord,
        request: &PairRequestPayload,
        session_id: &str,
        now: &str,
    ) -> Result<ConnectsFrame, PairingError> {
        if peer.trust_level == TrustLevel::Blocked
            || matches!(
                peer.discovery_state,
                DiscoveryState::Blocked | DiscoveryState::Forgotten
            )
        {
            return Err(PairingError::BlockedPeer);
        }

        if request.token.len() < 32 {
            return Err(PairingError::InvalidToken);
        }

        self.session_registry.upsert_session(SessionRecord {
            peer_id: peer.peer_id.clone(),
            session_id: session_id.to_owned(),
            transport_state: TransportState::Connected,
            connected_at: now.to_owned(),
            last_heartbeat_at: now.to_owned(),
        });

        self.session_registry.update_health(HealthRecord {
            peer_id: peer.peer_id.clone(),
            reachability: Reachability::Reachable,
            freshness_state: "fresh".into(),
            reconcile_state: ReconcileState::Clean,
            last_probe_at: now.to_owned(),
            retry_count: 0,
        });

        Ok(ConnectsFrame {
            op: ConnectsOpCode::PairSuccess,
            payload: to_value(PairSuccessPayload {
                peer_id: peer.peer_id.clone(),
                session_id: session_id.to_owned(),
                accepted_at: now.to_owned(),
                control_stream: "bi/0".into(),
            })
            .expect("pair success payload should serialize"),
        })
    }

    pub fn error_frame(&self, error: PairingError) -> ConnectsFrame {
        let payload = match error {
            PairingError::BlockedPeer => ErrorPayload {
                code: "peer_blocked".into(),
                message: "peer is not allowed to pair".into(),
            },
            PairingError::InvalidToken => ErrorPayload {
                code: "invalid_token".into(),
                message: "pair token is too short".into(),
            },
        };

        ConnectsFrame {
            op: ConnectsOpCode::Error,
            payload: to_value(payload).expect("error payload should serialize"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{PairingError, PairingService};
    use crate::domain::peers::{DeviceIdentity, DiscoveryState, PeerRecord, TrustLevel};
    use crate::domain::protocol::{
        ConnectsOpCode, ErrorPayload, PairRequestPayload, PairSuccessPayload,
    };

    fn peer_record(trust_level: TrustLevel, discovery_state: DiscoveryState) -> PeerRecord {
        PeerRecord {
            peer_id: "peer-a".into(),
            device: DeviceIdentity {
                device_id: "device-a".into(),
                device_label: "Workstation A".into(),
                host_platform: "windows".into(),
                runtime_profile: "desktop".into(),
            },
            trust_level,
            visibility_scope: "org".into(),
            discovery_state,
            last_seen_at: "2026-04-02T00:00:00Z".into(),
            discovered_via: "mdns".into(),
        }
    }

    #[test]
    fn trusted_peer_with_valid_token_produces_pair_success_and_session() {
        let mut service = PairingService::default();
        let request = PairRequestPayload {
            peer_id: "peer-a".into(),
            node_id: "node-a".into(),
            token: "a".repeat(64),
            requested_at: "2026-04-02T00:00:00Z".into(),
        };

        let frame = service
            .pair_peer(
                &peer_record(TrustLevel::Trusted, DiscoveryState::Verified),
                &request,
                "session-a",
                "2026-04-02T00:00:05Z",
            )
            .expect("trusted peer should pair");

        assert_eq!(frame.op, ConnectsOpCode::PairSuccess);
        let payload: PairSuccessPayload =
            serde_json::from_value(frame.payload).expect("pair success payload");
        assert_eq!(payload.session_id, "session-a");
        assert_eq!(service.session_registry().connected_peers(), vec!["peer-a"]);
    }

    #[test]
    fn blocked_peer_is_rejected() {
        let mut service = PairingService::default();
        let request = PairRequestPayload {
            peer_id: "peer-a".into(),
            node_id: "node-a".into(),
            token: "a".repeat(64),
            requested_at: "2026-04-02T00:00:00Z".into(),
        };

        let error = service
            .pair_peer(
                &peer_record(TrustLevel::Blocked, DiscoveryState::Blocked),
                &request,
                "session-a",
                "2026-04-02T00:00:05Z",
            )
            .expect_err("blocked peer should not pair");

        assert_eq!(error, PairingError::BlockedPeer);
        let frame = service.error_frame(error);
        let payload: ErrorPayload = serde_json::from_value(frame.payload).expect("error payload");
        assert_eq!(payload.code, "peer_blocked");
    }

    #[test]
    fn short_token_is_rejected() {
        let mut service = PairingService::default();
        let request = PairRequestPayload {
            peer_id: "peer-a".into(),
            node_id: "node-a".into(),
            token: "short".into(),
            requested_at: "2026-04-02T00:00:00Z".into(),
        };

        let error = service
            .pair_peer(
                &peer_record(TrustLevel::Trusted, DiscoveryState::Verified),
                &request,
                "session-a",
                "2026-04-02T00:00:05Z",
            )
            .expect_err("short token should fail");

        assert_eq!(error, PairingError::InvalidToken);
    }
}
