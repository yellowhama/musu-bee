use std::collections::HashSet;

use crate::application::port_adapter::ImportMergePolicy;
use crate::domain::peers::{DiscoveryState, PeerRecord, TrustLevel};
use crate::domain::registries::{AdvertisedRouteRegistry, ImportedRouteRegistry};
use crate::domain::routes::{AdvertisedRoute, FreshnessState, ImportState, LocalManagedRoute};
use crate::domain::transforms::{advertise_local_route, import_advertised_route};

pub struct RouteSyncService;

impl RouteSyncService {
    pub fn publish_local_route(
        registry: &mut AdvertisedRouteRegistry,
        route: &LocalManagedRoute,
        share_scope: &str,
        advertised_at: &str,
        fresh_until: &str,
    ) {
        let advertised = advertise_local_route(
            route,
            &registry.source_device_id,
            &registry.source_peer_id,
            share_scope,
            advertised_at,
            fresh_until,
        );
        registry.publish(advertised, advertised_at);
    }

    pub fn import_snapshot(
        registry: &mut ImportedRouteRegistry,
        routes: &[AdvertisedRoute],
        refreshed_at: &str,
    ) {
        Self::import_snapshot_with_local_aliases(registry, routes, refreshed_at, &HashSet::new());
    }

    pub fn import_snapshot_with_local_aliases(
        registry: &mut ImportedRouteRegistry,
        routes: &[AdvertisedRoute],
        refreshed_at: &str,
        local_aliases: &HashSet<String>,
    ) {
        let policy = ImportMergePolicy;
        for route in routes {
            let import_id = format!("{}::{}", registry.peer_id, route.route_id);
            let decision = policy.evaluate(route, registry, local_aliases);
            let imported = import_advertised_route(
                route,
                &import_id,
                decision.import_state,
                decision.freshness_state,
                &decision.collision_state,
            );
            registry.merge(imported, refreshed_at);
        }

        Self::mark_missing_routes_withdrawn(registry, routes);
    }

    pub fn import_snapshot_for_peer(
        registry: &mut ImportedRouteRegistry,
        routes: &[AdvertisedRoute],
        refreshed_at: &str,
        peer: &PeerRecord,
    ) {
        Self::import_snapshot_for_peer_with_local_aliases(
            registry,
            routes,
            refreshed_at,
            &HashSet::new(),
            peer,
        );
    }

    pub fn import_snapshot_for_peer_with_local_aliases(
        registry: &mut ImportedRouteRegistry,
        routes: &[AdvertisedRoute],
        refreshed_at: &str,
        local_aliases: &HashSet<String>,
        peer: &PeerRecord,
    ) {
        if let Some(block_reason) = Self::peer_import_gate_reason(peer) {
            Self::import_snapshot_suppressed_for_peer(registry, routes, refreshed_at, block_reason);
            return;
        }

        Self::import_snapshot_with_local_aliases(registry, routes, refreshed_at, local_aliases);
    }

    pub fn peer_import_gate_reason(peer: &PeerRecord) -> Option<&'static str> {
        Self::peer_import_block_reason(peer)
    }

    fn import_snapshot_suppressed_for_peer(
        registry: &mut ImportedRouteRegistry,
        routes: &[AdvertisedRoute],
        refreshed_at: &str,
        block_reason: &str,
    ) {
        for route in routes {
            let import_id = format!("{}::{}", registry.peer_id, route.route_id);
            let imported = import_advertised_route(
                route,
                &import_id,
                ImportState::Suppressed,
                FreshnessState::Stale,
                block_reason,
            );
            registry.merge(imported, refreshed_at);
        }

        Self::mark_missing_routes_withdrawn(registry, routes);
    }

    fn mark_missing_routes_withdrawn(
        registry: &mut ImportedRouteRegistry,
        routes: &[AdvertisedRoute],
    ) {
        let policy = ImportMergePolicy;
        let cleanup = policy.stale_cleanup_handoff(registry, routes);
        for import_id in cleanup.stale_import_ids {
            if let Some(existing) = registry.route_mut(&import_id) {
                existing.import_state = ImportState::Withdrawn;
                existing.freshness_state = FreshnessState::Stale;
                existing.collision_state = "stale-timeout".into();
            }
        }
    }

    fn peer_import_block_reason(peer: &PeerRecord) -> Option<&'static str> {
        if peer.trust_level == TrustLevel::Blocked
            || matches!(
                peer.discovery_state,
                DiscoveryState::Blocked | DiscoveryState::Forgotten
            )
        {
            return Some("peer-blocked");
        }

        if !matches!(
            peer.discovery_state,
            DiscoveryState::Verified | DiscoveryState::Connected
        ) {
            return Some("peer-not-verified");
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::RouteSyncService;
    use crate::domain::peers::{DeviceIdentity, DiscoveryState, PeerRecord, TrustLevel};
    use crate::domain::registries::{AdvertisedRouteRegistry, ImportedRouteRegistry};
    use crate::domain::routes::{
        Entrypoint, FreshnessState, HealthSnapshot, HealthStatus, ImportState, ImportedRoute,
        LocalManagedRoute, Visibility,
    };
    use std::collections::HashSet;

    fn local_route(route_id: &str, alias: &str, port: u16) -> LocalManagedRoute {
        LocalManagedRoute {
            route_id: route_id.into(),
            alias: alias.into(),
            protocol: "http".into(),
            entrypoint: Entrypoint {
                host: "127.0.0.1".into(),
                port,
            },
            target_kind: "mcp".into(),
            visibility: Visibility::Shared,
            health: HealthSnapshot {
                status: HealthStatus::Healthy,
                checked_at: "2026-04-02T00:00:00Z".into(),
            },
        }
    }

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
            last_seen_at: "2026-04-03T00:00:00Z".into(),
            discovered_via: "quic".into(),
        }
    }

    #[test]
    fn local_route_is_published_into_advertised_registry() {
        let mut registry = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![],
        };

        RouteSyncService::publish_local_route(
            &mut registry,
            &local_route("route-a", "editor", 8792),
            "org",
            "2026-04-02T00:00:00Z",
            "2026-04-02T00:05:00Z",
        );

        assert_eq!(registry.routes.len(), 1);
        assert_eq!(
            registry.route("route-a").map(|route| route.alias.as_str()),
            Some("editor")
        );
    }

    #[test]
    fn advertised_snapshot_is_imported_into_registry() {
        let mut advertised = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::publish_local_route(
            &mut advertised,
            &local_route("route-a", "editor", 8792),
            "org",
            "2026-04-02T00:00:00Z",
            "2026-04-02T00:05:00Z",
        );

        let mut imported = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::import_snapshot(
            &mut imported,
            &advertised.routes,
            "2026-04-02T00:01:00Z",
        );

        assert_eq!(imported.routes.len(), 1);
        assert_eq!(
            imported
                .route("peer-a::route-a")
                .map(|route| route.route_id.as_str()),
            Some("route-a")
        );
    }

    #[test]
    fn local_alias_conflict_is_suppressed_on_import() {
        let mut advertised = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::publish_local_route(
            &mut advertised,
            &local_route("route-a", "editor", 8792),
            "org",
            "2026-04-02T00:00:00Z",
            "2026-04-02T00:05:00Z",
        );

        let mut imported = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![],
        };
        let local_aliases: HashSet<String> = ["editor".into()].into_iter().collect();
        RouteSyncService::import_snapshot_with_local_aliases(
            &mut imported,
            &advertised.routes,
            "2026-04-02T00:01:00Z",
            &local_aliases,
        );

        let route = imported
            .route("peer-a::route-a")
            .expect("route should exist");
        assert_eq!(route.import_state, ImportState::Suppressed);
        assert_eq!(route.collision_state, "local-alias-conflict");
    }

    #[test]
    fn missing_routes_are_marked_withdrawn_after_snapshot_refresh() {
        let mut imported = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![ImportedRoute {
                import_id: "peer-a::route-old".into(),
                route_id: "route-old".into(),
                alias: "legacy".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "10.0.0.10".into(),
                    port: 8888,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                origin_device_id: "device-a".into(),
                origin_peer_id: "peer-a".into(),
                import_state: ImportState::Active,
                freshness_state: FreshnessState::Fresh,
                collision_state: "clean".into(),
            }],
        };

        let mut advertised = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::publish_local_route(
            &mut advertised,
            &local_route("route-a", "editor", 8792),
            "org",
            "2026-04-02T00:00:00Z",
            "2026-04-02T00:05:00Z",
        );

        RouteSyncService::import_snapshot(
            &mut imported,
            &advertised.routes,
            "2026-04-02T00:01:00Z",
        );

        let stale = imported
            .route("peer-a::route-old")
            .expect("old route should still exist for handoff");
        assert_eq!(stale.import_state, ImportState::Withdrawn);
        assert_eq!(stale.freshness_state, FreshnessState::Stale);
        assert_eq!(stale.collision_state, "stale-timeout");
    }

    #[test]
    fn blocked_peer_snapshot_is_suppressed_before_import() {
        let mut advertised = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-03T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::publish_local_route(
            &mut advertised,
            &local_route("route-a", "editor", 8792),
            "org",
            "2026-04-03T00:00:00Z",
            "2026-04-03T00:05:00Z",
        );

        let mut imported = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-03T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::import_snapshot_for_peer(
            &mut imported,
            &advertised.routes,
            "2026-04-03T00:01:00Z",
            &peer_record(TrustLevel::Blocked, DiscoveryState::Blocked),
        );

        let route = imported
            .route("peer-a::route-a")
            .expect("route should exist");
        assert_eq!(route.import_state, ImportState::Suppressed);
        assert_eq!(route.freshness_state, FreshnessState::Stale);
        assert_eq!(route.collision_state, "peer-blocked");
    }

    #[test]
    fn unverified_peer_snapshot_is_suppressed_before_import() {
        let mut advertised = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-03T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::publish_local_route(
            &mut advertised,
            &local_route("route-a", "editor", 8792),
            "org",
            "2026-04-03T00:00:00Z",
            "2026-04-03T00:05:00Z",
        );

        let mut imported = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-03T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::import_snapshot_for_peer(
            &mut imported,
            &advertised.routes,
            "2026-04-03T00:01:00Z",
            &peer_record(TrustLevel::Known, DiscoveryState::Discovered),
        );

        let route = imported
            .route("peer-a::route-a")
            .expect("route should exist");
        assert_eq!(route.import_state, ImportState::Suppressed);
        assert_eq!(route.freshness_state, FreshnessState::Stale);
        assert_eq!(route.collision_state, "peer-not-verified");
    }

    #[test]
    fn verified_peer_snapshot_imports_route_normally() {
        let mut advertised = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-03T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::publish_local_route(
            &mut advertised,
            &local_route("route-a", "editor", 8792),
            "org",
            "2026-04-03T00:00:00Z",
            "2026-04-03T00:05:00Z",
        );

        let mut imported = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-03T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::import_snapshot_for_peer(
            &mut imported,
            &advertised.routes,
            "2026-04-03T00:01:00Z",
            &peer_record(TrustLevel::Trusted, DiscoveryState::Verified),
        );

        let route = imported
            .route("peer-a::route-a")
            .expect("route should exist");
        assert_eq!(route.import_state, ImportState::Active);
        assert_eq!(route.freshness_state, FreshnessState::Fresh);
        assert_eq!(route.collision_state, "clean");
    }
}
