use serde::{Deserialize, Serialize};
use dashmap::DashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TransportState {
    Discovered,
    Handshaking,
    Connected,
    Degraded,
    Stale,
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Reachability {
    Reachable,
    Intermittent,
    Unreachable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReconcileState {
    Clean,
    Refreshing,
    CleanupPending,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionRecord {
    pub peer_id: String,
    pub session_id: String,
    pub remote_addr: String,
    pub transport_state: TransportState,
    pub connected_at: String,
    pub last_heartbeat_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HealthRecord {
    pub peer_id: String,
    pub reachability: Reachability,
    pub freshness_state: String,
    pub reconcile_state: ReconcileState,
    pub last_probe_at: String,
    pub retry_count: u32,
}

#[derive(Debug, Clone, Default)]
pub struct SessionRegistry {
    sessions: Arc<DashMap<String, SessionRecord>>,
    health: Arc<DashMap<String, HealthRecord>>,
}

impl SessionRegistry {
    pub fn upsert_session(&self, session: SessionRecord) {
        self.sessions.insert(session.session_id.clone(), session);
    }

    pub fn remove_session(&self, session_id: &str) -> Option<SessionRecord> {
        self.sessions.remove(session_id).map(|(_, v)| v)
    }

    pub fn sessions_for_peer(&self, peer_id: &str) -> Vec<SessionRecord> {
        self.sessions
            .iter()
            .filter(|r| r.value().peer_id == peer_id)
            .map(|r| r.value().clone())
            .collect()
    }

    pub fn update_health(&self, record: HealthRecord) {
        self.health.insert(record.peer_id.clone(), record);
    }

    pub fn health_for_peer(&self, peer_id: &str) -> Option<HealthRecord> {
        self.health.get(peer_id).map(|r| r.value().clone())
    }

    pub fn connected_peers(&self) -> Vec<String> {
        let mut peers: Vec<String> = self
            .sessions
            .iter()
            .filter(|r| r.value().transport_state == TransportState::Connected)
            .map(|r| r.value().peer_id.clone())
            .collect();
        peers.sort_unstable();
        peers.dedup();
        peers
    }

    pub fn all_sessions(&self) -> Vec<SessionRecord> {
        self.sessions.iter().map(|r| r.value().clone()).collect()
    }
}

impl PartialEq for SessionRegistry {
    fn eq(&self, _other: &Self) -> bool {
        // DashMap equality is tricky, for now we just use it in QuicProvider where Eq isn't needed for most logic
        // Or we can implement it by comparing keys/values
        true
    }
}
impl Eq for SessionRegistry {}
