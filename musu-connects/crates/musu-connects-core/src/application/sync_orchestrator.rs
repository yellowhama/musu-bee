/// SyncOrchestrator — ties together heartbeat, reconnection, and route sync
/// into a single periodic coordination loop.
///
/// Usage:
/// ```text
/// let orchestrator = SyncOrchestrator::new(quic_provider.clone(), config);
/// tokio::spawn(async move { orchestrator.run().await });
/// ```
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio::time::{sleep, Instant};

use crate::application::heartbeat::HeartbeatService;
use crate::application::quic_provider::QuicProvider;
use crate::application::reconnect::ReconnectionService;
use crate::application::route_sync::RouteSyncService;
use crate::domain::registries::{AdvertisedRouteRegistry, ImportedRouteRegistry};
use crate::domain::routes::LocalManagedRoute;
use crate::domain::transport::TransportState;

/// Configuration for the sync orchestrator.
#[derive(Debug, Clone)]
pub struct SyncOrchestratorConfig {
    /// How often to run heartbeat ticks (default: 15s).
    pub heartbeat_interval: Duration,
    /// How often to run route sync reconciliation (default: 30s).
    pub route_sync_interval: Duration,
    /// How often to check for stale sessions needing reconnection (default: 10s).
    pub reconnect_check_interval: Duration,
    /// Failure threshold before a session is marked stale (default: 3).
    pub heartbeat_failure_threshold: u32,
    /// Backoff base delay for reconnection (default: 2s).
    pub reconnect_base_delay: Duration,
    /// Backoff max delay for reconnection (default: 60s).
    pub reconnect_max_delay: Duration,
}

impl Default for SyncOrchestratorConfig {
    fn default() -> Self {
        Self {
            heartbeat_interval: Duration::from_secs(15),
            route_sync_interval: Duration::from_secs(30),
            reconnect_check_interval: Duration::from_secs(10),
            heartbeat_failure_threshold: 3,
            reconnect_base_delay: Duration::from_secs(2),
            reconnect_max_delay: Duration::from_secs(60),
        }
    }
}

/// Per-peer route state tracked by the orchestrator.
pub struct PeerRouteState {
    pub advertised: AdvertisedRouteRegistry,
    pub imported: ImportedRouteRegistry,
    /// Last time we successfully synced routes with this peer.
    pub last_synced_at: Option<Instant>,
}

impl PeerRouteState {
    pub fn new(source_device_id: String, source_peer_id: String, peer_id: String) -> Self {
        Self {
            advertised: AdvertisedRouteRegistry::new(source_device_id, source_peer_id),
            imported: ImportedRouteRegistry::new(peer_id),
            last_synced_at: None,
        }
    }
}

/// Orchestrates heartbeat, reconnection, and route synchronization across
/// all connected peers.
pub struct SyncOrchestrator {
    quic_provider: Arc<QuicProvider>,
    heartbeat: HeartbeatService,
    reconnect: ReconnectionService,
    config: SyncOrchestratorConfig,
    /// peer_id → per-peer route state
    peer_states: Arc<Mutex<HashMap<String, PeerRouteState>>>,
    /// Local routes published to all peers on connect.
    local_routes: Arc<Mutex<Vec<LocalManagedRoute>>>,
}

impl SyncOrchestrator {
    pub fn new(quic_provider: Arc<QuicProvider>, config: SyncOrchestratorConfig) -> Self {
        let heartbeat = HeartbeatService::new(
            quic_provider.clone(),
            config.heartbeat_interval,
            config.heartbeat_failure_threshold,
        );
        let reconnect = ReconnectionService::new(
            quic_provider.clone(),
            config.reconnect_base_delay,
            config.reconnect_max_delay,
        );
        Self {
            quic_provider,
            heartbeat,
            reconnect,
            config,
            peer_states: Arc::new(Mutex::new(HashMap::new())),
            local_routes: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Register a local route to be advertised to all connected peers.
    pub async fn register_local_route(&self, route: LocalManagedRoute) {
        let mut routes = self.local_routes.lock().await;
        // Replace if same service_id already registered.
        if let Some(pos) = routes.iter().position(|r| r.route_id == route.route_id) {
            routes[pos] = route;
        } else {
            routes.push(route);
        }
    }

    /// Register a peer and initialize its route registries.
    pub async fn register_peer(
        &self,
        peer_id: String,
        device_id: String,
        my_peer_id: String,
    ) {
        let mut states = self.peer_states.lock().await;
        states.entry(peer_id.clone()).or_insert_with(|| {
            PeerRouteState::new(device_id, my_peer_id, peer_id.clone())
        });
    }

    /// Remove a peer (e.g. on disconnect). Marks its imported routes as withdrawn.
    pub async fn deregister_peer(&self, peer_id: &str) {
        let mut states = self.peer_states.lock().await;
        if let Some(state) = states.get_mut(peer_id) {
            for route in state.imported.all_imports_mut() {
                route.import_state = crate::domain::routes::ImportState::Withdrawn;
            }
        }
        states.remove(peer_id);
    }

    /// Run the orchestration loop. This runs forever — spawn in a task.
    pub async fn run(&self) {
        let heartbeat_interval = self.config.heartbeat_interval;
        let route_sync_interval = self.config.route_sync_interval;
        let reconnect_interval = self.config.reconnect_check_interval;

        let mut last_route_sync = Instant::now()
            .checked_sub(route_sync_interval)
            .unwrap_or_else(Instant::now);
        let mut last_reconnect = Instant::now()
            .checked_sub(reconnect_interval)
            .unwrap_or_else(Instant::now);

        loop {
            let tick_start = Instant::now();

            // ── Heartbeat ──────────────────────────────────────────────────
            self.heartbeat.tick().await;

            // ── Reconnection check ─────────────────────────────────────────
            if tick_start.duration_since(last_reconnect) >= reconnect_interval {
                self.reconnect.tick().await;
                last_reconnect = tick_start;
            }

            // ── Route sync ─────────────────────────────────────────────────
            if tick_start.duration_since(last_route_sync) >= route_sync_interval {
                self.reconcile_routes().await;
                last_route_sync = tick_start;
            }

            sleep(heartbeat_interval).await;
        }
    }

    /// Reconcile routes for all currently connected peers.
    async fn reconcile_routes(&self) {
        let now = chrono::Utc::now().to_rfc3339();
        // Freshness window: routes are valid for 2× the sync interval.
        let fresh_seconds = self.config.route_sync_interval.as_secs() * 2;
        let fresh_until = chrono::Utc::now()
            .checked_add_signed(chrono::Duration::seconds(fresh_seconds as i64))
            .map(|t| t.to_rfc3339())
            .unwrap_or_else(|| now.clone());

        let sessions = self.quic_provider.session_registry().all_sessions();
        let connected_peer_ids: Vec<String> = sessions
            .into_iter()
            .filter(|s| {
                s.transport_state == TransportState::Connected
                    || s.transport_state == TransportState::Connected
            })
            .map(|s| s.peer_id)
            .collect();

        let local_routes = self.local_routes.lock().await;
        let mut peer_states = self.peer_states.lock().await;

        for peer_id in &connected_peer_ids {
            let state = peer_states.entry(peer_id.clone()).or_insert_with(|| {
                PeerRouteState::new(
                    "unknown-device".into(),
                    "unknown-peer".into(),
                    peer_id.clone(),
                )
            });

            // Publish local routes to this peer's advertised registry.
            for route in local_routes.iter() {
                RouteSyncService::publish_local_route(
                    &mut state.advertised,
                    route,
                    "org",
                    &now,
                    &fresh_until,
                );
            }

            state.last_synced_at = Some(Instant::now());
        }

        // Deregister peers that are no longer connected.
        let disconnected: Vec<String> = peer_states
            .keys()
            .filter(|id| !connected_peer_ids.contains(id))
            .cloned()
            .collect();

        for peer_id in disconnected {
            if let Some(state) = peer_states.get_mut(&peer_id) {
                for route in state.imported.all_imports_mut() {
                    if route.import_state != crate::domain::routes::ImportState::Withdrawn {
                        route.import_state = crate::domain::routes::ImportState::Withdrawn;
                    }
                }
            }
        }
    }

    /// Snapshot of all currently imported routes across all peers.
    /// Useful for exposing to musu-bridge via the bridge-proxy.
    pub async fn all_imported_routes(&self) -> Vec<crate::domain::routes::ImportedRoute> {
        let states = self.peer_states.lock().await;
        states
            .values()
            .flat_map(|s| s.imported.all_imports().to_vec())
            .collect()
    }

    /// Snapshot of all currently advertised routes (what we're publishing).
    pub async fn all_advertised_routes(&self) -> Vec<crate::domain::routes::AdvertisedRoute> {
        let states = self.peer_states.lock().await;
        states
            .values()
            .flat_map(|s| s.advertised.all_routes().to_vec())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn make_config() -> SyncOrchestratorConfig {
        SyncOrchestratorConfig {
            heartbeat_interval: Duration::from_millis(100),
            route_sync_interval: Duration::from_millis(200),
            reconnect_check_interval: Duration::from_millis(150),
            heartbeat_failure_threshold: 2,
            reconnect_base_delay: Duration::from_millis(50),
            reconnect_max_delay: Duration::from_millis(500),
        }
    }

    #[test]
    fn config_defaults_are_sane() {
        let config = SyncOrchestratorConfig::default();
        assert_eq!(config.heartbeat_interval, Duration::from_secs(15));
        assert_eq!(config.route_sync_interval, Duration::from_secs(30));
        assert_eq!(config.heartbeat_failure_threshold, 3);
    }

    #[test]
    fn peer_route_state_initialization() {
        let state = PeerRouteState::new("dev-a".into(), "peer-a".into(), "peer-remote".into());
        assert!(state.last_synced_at.is_none());
        assert_eq!(state.imported.peer_id, "peer-remote");
        assert_eq!(state.advertised.source_device_id, "dev-a");
    }

    #[test]
    fn make_config_has_short_intervals() {
        let config = make_config();
        assert!(config.heartbeat_interval < Duration::from_secs(1));
        assert!(config.route_sync_interval < Duration::from_secs(1));
    }
}
