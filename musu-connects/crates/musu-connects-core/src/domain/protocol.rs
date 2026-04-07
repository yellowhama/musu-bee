use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectsOpCode {
    PairRequest,
    PairSuccess,
    Error,
    Heartbeat,
    RouteSyncRequest,
    RouteSyncSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConnectsFrame {
    pub op: ConnectsOpCode,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PairRequestPayload {
    pub peer_id: String,
    pub node_id: String,
    pub token: String,
    pub requested_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PairSuccessPayload {
    pub peer_id: String,
    pub session_id: String,
    pub accepted_at: String,
    pub control_stream: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct QuicTransportConfig {
    pub bind_addr: String,
    pub alpn: String,
    pub idle_timeout_ms: u64,
}

impl Default for QuicTransportConfig {
    fn default() -> Self {
        Self {
            bind_addr: "0.0.0.0:4433".into(),
            alpn: "musu-connects/1".into(),
            idle_timeout_ms: 30_000,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ConnectsFrame, ConnectsOpCode, PairRequestPayload, QuicTransportConfig};

    #[test]
    fn pair_request_payload_round_trips_through_frame_json() {
        let payload = PairRequestPayload {
            peer_id: "peer-a".into(),
            node_id: "node-a".into(),
            token: "a".repeat(64),
            requested_at: "2026-04-02T00:00:00Z".into(),
        };
        let frame = ConnectsFrame {
            op: ConnectsOpCode::PairRequest,
            payload: serde_json::to_value(&payload).expect("serialize payload"),
        };

        let decoded: PairRequestPayload =
            serde_json::from_value(frame.payload).expect("deserialize payload");
        assert_eq!(decoded.peer_id, "peer-a");
        assert_eq!(decoded.token.len(), 64);
    }

    #[test]
    fn quic_transport_config_has_expected_default_shape() {
        let config = QuicTransportConfig::default();
        assert_eq!(config.alpn, "musu-connects/1");
        assert_eq!(config.bind_addr, "0.0.0.0:4433");
    }
}
