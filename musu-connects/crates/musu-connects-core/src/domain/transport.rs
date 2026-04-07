use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionRegistry {
    sessions: BTreeMap<String, SessionRecord>,
    health: BTreeMap<String, HealthRecord>,
}

impl SessionRegistry {
    pub fn upsert_session(&mut self, session: SessionRecord) {
        self.sessions.insert(session.session_id.clone(), session);
    }

    pub fn remove_session(&mut self, session_id: &str) -> Option<SessionRecord> {
        self.sessions.remove(session_id)
    }

    pub fn sessions_for_peer(&self, peer_id: &str) -> Vec<&SessionRecord> {
        self.sessions
            .values()
            .filter(|session| session.peer_id == peer_id)
            .collect()
    }

    pub fn update_health(&mut self, record: HealthRecord) {
        self.health.insert(record.peer_id.clone(), record);
    }

    pub fn health_for_peer(&self, peer_id: &str) -> Option<&HealthRecord> {
        self.health.get(peer_id)
    }

    pub fn connected_peers(&self) -> Vec<&str> {
        let mut peers: Vec<&str> = self
            .sessions
            .values()
            .filter(|session| session.transport_state == TransportState::Connected)
            .map(|session| session.peer_id.as_str())
            .collect();
        peers.sort_unstable();
        peers.dedup();
        peers
    }
}

#[cfg(test)]
mod tests {
    use super::{
        HealthRecord, Reachability, ReconcileState, SessionRecord, SessionRegistry, TransportState,
    };

    #[test]
    fn session_registry_tracks_peer_sessions_and_health() {
        let mut registry = SessionRegistry::default();

        registry.upsert_session(SessionRecord {
            peer_id: "peer-a".into(),
            session_id: "session-a".into(),
            transport_state: TransportState::Connected,
            connected_at: "2026-04-02T00:00:00Z".into(),
            last_heartbeat_at: "2026-04-02T00:00:10Z".into(),
        });
        registry.upsert_session(SessionRecord {
            peer_id: "peer-a".into(),
            session_id: "session-b".into(),
            transport_state: TransportState::Degraded,
            connected_at: "2026-04-02T00:01:00Z".into(),
            last_heartbeat_at: "2026-04-02T00:01:10Z".into(),
        });
        registry.update_health(HealthRecord {
            peer_id: "peer-a".into(),
            reachability: Reachability::Intermittent,
            freshness_state: "degraded".into(),
            reconcile_state: ReconcileState::Refreshing,
            last_probe_at: "2026-04-02T00:02:00Z".into(),
            retry_count: 2,
        });

        assert_eq!(registry.sessions_for_peer("peer-a").len(), 2);
        assert_eq!(
            registry
                .health_for_peer("peer-a")
                .map(|record| record.retry_count),
            Some(2)
        );
        assert_eq!(registry.connected_peers(), vec!["peer-a"]);
    }

    #[test]
    fn session_registry_removes_session_by_id() {
        let mut registry = SessionRegistry::default();
        registry.upsert_session(SessionRecord {
            peer_id: "peer-a".into(),
            session_id: "session-a".into(),
            transport_state: TransportState::Connected,
            connected_at: "2026-04-02T00:00:00Z".into(),
            last_heartbeat_at: "2026-04-02T00:00:10Z".into(),
        });

        let removed = registry.remove_session("session-a");

        assert!(removed.is_some());
        assert!(registry.sessions_for_peer("peer-a").is_empty());
    }
}
