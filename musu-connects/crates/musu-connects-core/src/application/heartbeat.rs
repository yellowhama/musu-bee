use crate::application::quic_provider::QuicProvider;
use crate::domain::protocol::{ConnectsFrame, ConnectsOpCode, HeartbeatPayload};
use crate::domain::transport::{HealthRecord, Reachability, ReconcileState, TransportState};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

pub struct HeartbeatService {
    quic_provider: Arc<QuicProvider>,
    interval: Duration,
    failure_threshold: u32,
}

impl HeartbeatService {
    pub fn new(quic_provider: Arc<QuicProvider>, interval: Duration, failure_threshold: u32) -> Self {
        Self {
            quic_provider,
            interval,
            failure_threshold,
        }
    }

    pub async fn start_loop(&self) {
        loop {
            sleep(self.interval).await;
            self.tick().await;
        }
    }

    pub async fn tick(&self) {
        let sessions = self.quic_provider.session_registry().all_sessions();
        let now = chrono::Utc::now().to_rfc3339();

        for session in sessions {
            if session.transport_state == TransportState::Closed || session.transport_state == TransportState::Stale {
                continue;
            }

            let peer_id = session.peer_id.clone();
            let session_id = session.session_id.clone();

            if let Some(conn) = self.quic_provider.connections.get(&session_id) {
                match self.send_heartbeat(conn.value(), &now).await {
                    Ok(_) => {
                        self.handle_success(&peer_id, &session_id, &now);
                    }
                    Err(_) => {
                        self.handle_failure(&peer_id, &session_id, &now);
                    }
                }
            } else {
                // Connection object missing but session exists in registry
                self.handle_failure(&peer_id, &session_id, &now);
            }
        }
    }

    async fn send_heartbeat(&self, conn: &quinn::Connection, now: &str) -> Result<(), Box<dyn std::error::Error>> {
        let (mut send, mut recv) = conn.open_bi().await?;
        
        let payload = HeartbeatPayload {
            sent_at: now.to_string(),
            sequence: 0, // Could be tracked
        };
        let frame = ConnectsFrame {
            op: ConnectsOpCode::Heartbeat,
            payload: serde_json::to_value(&payload)?,
        };
        
        let data = serde_json::to_vec(&frame)?;
        send.write_all(&data).await?;
        send.finish()?;
        
        // Wait for a small response or just the fact that it succeeded
        let mut buf = [0u8; 1024];
        let _ = recv.read(&mut buf).await?;
        
        Ok(())
    }

    fn handle_success(&self, peer_id: &str, session_id: &str, now: &str) {
        if let Some(mut session) = self.quic_provider.session_registry().sessions_for_peer(peer_id).into_iter().find(|s| s.session_id == session_id) {
            session.last_heartbeat_at = now.to_string();
            session.transport_state = TransportState::Connected;
            self.quic_provider.session_registry().upsert_session(session);
        }

        self.quic_provider.session_registry().update_health(HealthRecord {
            peer_id: peer_id.to_string(),
            reachability: Reachability::Reachable,
            freshness_state: "fresh".into(),
            reconcile_state: ReconcileState::Clean,
            last_probe_at: now.to_string(),
            retry_count: 0,
        });
    }

    fn handle_failure(&self, peer_id: &str, session_id: &str, now: &str) {
        let health = self.quic_provider.session_registry().health_for_peer(peer_id).unwrap_or(HealthRecord {
            peer_id: peer_id.to_string(),
            reachability: Reachability::Unreachable,
            freshness_state: "stale".into(),
            reconcile_state: ReconcileState::CleanupPending,
            last_probe_at: now.to_string(),
            retry_count: 0,
        });

        let new_retry_count = health.retry_count + 1;
        let (new_reachability, new_transport_state, new_freshness) = if new_retry_count >= self.failure_threshold {
            (Reachability::Unreachable, TransportState::Stale, "stale")
        } else {
            (Reachability::Intermittent, TransportState::Degraded, "degraded")
        };

        if let Some(mut session) = self.quic_provider.session_registry().sessions_for_peer(peer_id).into_iter().find(|s| s.session_id == session_id) {
            session.transport_state = new_transport_state;
            self.quic_provider.session_registry().upsert_session(session);
        }

        self.quic_provider.session_registry().update_health(HealthRecord {
            peer_id: peer_id.to_string(),
            reachability: new_reachability,
            freshness_state: new_freshness.into(),
            reconcile_state: ReconcileState::Refreshing,
            last_probe_at: now.to_string(),
            retry_count: new_retry_count,
        });

        if new_retry_count >= self.failure_threshold {
            self.quic_provider.connections.remove(session_id);
        }
    }
}
