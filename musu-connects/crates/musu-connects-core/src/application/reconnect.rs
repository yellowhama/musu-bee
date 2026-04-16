use crate::application::quic_provider::QuicProvider;
use crate::domain::transport::TransportState;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

pub struct ReconnectionService {
    quic_provider: Arc<QuicProvider>,
    base_delay: Duration,
    max_delay: Duration,
}

impl ReconnectionService {
    pub fn new(quic_provider: Arc<QuicProvider>, base_delay: Duration, max_delay: Duration) -> Self {
        Self {
            quic_provider,
            base_delay,
            max_delay,
        }
    }

    pub async fn start_loop(&self) {
        loop {
            sleep(Duration::from_secs(5)).await;
            self.tick().await;
        }
    }

    pub async fn tick(&self) {
        let sessions = self.quic_provider.session_registry().all_sessions();
        let now = chrono::Utc::now().to_rfc3339();

        for session in sessions {
            if session.transport_state != TransportState::Stale && session.transport_state != TransportState::Degraded {
                continue;
            }

            let peer_id = session.peer_id.clone();
            let session_id = session.session_id.clone();
            let remote_addr = session.remote_addr.clone();
            
            let health = self.quic_provider.session_registry().health_for_peer(&peer_id);
            if let Some(health) = health {
                if health.retry_count == 0 {
                    continue;
                }

                let provider = self.quic_provider.clone();
                let now_clone = now.clone();
                tokio::spawn(async move {
                    eprintln!("[reconnect] Attempting reconnect for peer {} at {}", peer_id, remote_addr);
                    match provider.dial(&peer_id, &session_id, &remote_addr, None, &now_clone).await {
                        Ok(_) => {
                            eprintln!("[reconnect] Successfully reconnected to peer {}", peer_id);
                        }
                        Err(e) => {
                            eprintln!("[reconnect] Reconnection failed for peer {}: {:?}", peer_id, e);
                        }
                    }
                });
            }
        }
    }

    pub fn calculate_backoff(&self, retry_count: u32) -> Duration {
        let delay = self.base_delay.as_millis() * (2u128.pow(retry_count.saturating_sub(1)));
        Duration::from_millis(delay.min(self.max_delay.as_millis()) as u64)
    }
}
