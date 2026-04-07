use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::domain::registries::ImportedRouteRegistry;
use crate::domain::routes::{
    AdvertisedRoute, Entrypoint, FreshnessState, HealthSnapshot, HealthStatus, ImportState,
    ImportedRoute, LocalManagedRoute, Visibility,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortLocalRoute {
    pub route_id: String,
    pub alias: String,
    pub protocol: String,
    pub entrypoint: Entrypoint,
    pub target_kind: String,
    pub visibility: Visibility,
    pub health: HealthSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MusuPortServiceRoute {
    pub name: String,
    pub alias: String,
    pub protocol: String,
    pub service_class: String,
    pub agent_facing: bool,
    pub enabled: bool,
    pub running: bool,
    pub port: Option<u16>,
    pub target_url: Option<String>,
    pub entrypoint_url: String,
}

pub trait PortExportAdapter<TRoute> {
    fn map_local_route(&self, route: &TRoute) -> LocalManagedRoute;
}

pub trait PortImportAdapter {
    fn local_aliases(&self) -> HashSet<String>;
    fn project_imported_route(&self, route: &ImportedRoute) -> ImportedRouteProjection;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DefaultLocalRouteMapper;

fn default_port_for_protocol(protocol: &str) -> u16 {
    match protocol.trim().to_ascii_lowercase().as_str() {
        "https" | "wss" => 443,
        "http" | "ws" => 80,
        "quic" => 4433,
        _ => 0,
    }
}

fn host_and_port_from_url_like(
    raw: &str,
    protocol: &str,
    fallback_port: Option<u16>,
) -> Entrypoint {
    let trimmed = raw.trim();
    let without_scheme = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed)
        .trim_end_matches('/');
    let host_port = without_scheme.split('/').next().unwrap_or(without_scheme);

    if let Some((host, port)) = host_port.rsplit_once(':') {
        if let Ok(parsed_port) = port.parse::<u16>() {
            return Entrypoint {
                host: host.to_owned(),
                port: parsed_port,
            };
        }
    }

    Entrypoint {
        host: host_port.to_owned(),
        port: fallback_port.unwrap_or_else(|| default_port_for_protocol(protocol)),
    }
}

impl PortExportAdapter<PortLocalRoute> for DefaultLocalRouteMapper {
    fn map_local_route(&self, route: &PortLocalRoute) -> LocalManagedRoute {
        LocalManagedRoute {
            route_id: route.route_id.clone(),
            alias: route.alias.clone(),
            protocol: route.protocol.clone(),
            entrypoint: route.entrypoint.clone(),
            target_kind: route.target_kind.clone(),
            visibility: route.visibility.clone(),
            health: route.health.clone(),
        }
    }
}

impl PortExportAdapter<MusuPortServiceRoute> for DefaultLocalRouteMapper {
    fn map_local_route(&self, route: &MusuPortServiceRoute) -> LocalManagedRoute {
        LocalManagedRoute {
            route_id: route.name.clone(),
            alias: route.alias.clone(),
            protocol: route.protocol.clone(),
            entrypoint: route
                .target_url
                .as_deref()
                .map(|target| host_and_port_from_url_like(target, &route.protocol, route.port))
                .unwrap_or_else(|| {
                    host_and_port_from_url_like(&route.entrypoint_url, &route.protocol, route.port)
                }),
            target_kind: route.service_class.clone(),
            visibility: if route.agent_facing {
                Visibility::PeerVisible
            } else {
                Visibility::Shared
            },
            health: HealthSnapshot {
                status: if route.enabled && route.running {
                    HealthStatus::Healthy
                } else if route.enabled {
                    HealthStatus::Degraded
                } else {
                    HealthStatus::Unhealthy
                },
                checked_at: "port-adapter".into(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportedRouteProjection {
    pub import_id: String,
    pub alias: String,
    pub protocol: String,
    pub target_kind: String,
    pub source_peer_id: String,
    pub import_state: ImportState,
    pub freshness_state: FreshnessState,
    pub collision_state: String,
    pub available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RouteApplyResult {
    pub projected: Vec<ImportedRouteProjection>,
    pub suppressed: Vec<ImportedRouteProjection>,
    pub stale: Vec<ImportedRouteProjection>,
}

pub struct PortLocalRouteExportService<TMapper> {
    mapper: TMapper,
}

impl<TMapper> PortLocalRouteExportService<TMapper> {
    pub fn new(mapper: TMapper) -> Self {
        Self { mapper }
    }

    pub fn export_routes<TRoute>(&self, routes: &[TRoute]) -> Vec<LocalManagedRoute>
    where
        TMapper: PortExportAdapter<TRoute>,
    {
        routes
            .iter()
            .map(|route| self.mapper.map_local_route(route))
            .collect()
    }
}

pub struct ImportedRouteApplyService<TAdapter> {
    adapter: TAdapter,
}

impl<TAdapter> ImportedRouteApplyService<TAdapter> {
    pub fn new(adapter: TAdapter) -> Self {
        Self { adapter }
    }
}

impl<TAdapter> ImportedRouteApplyService<TAdapter>
where
    TAdapter: PortImportAdapter,
{
    pub fn apply_registry(&self, registry: &ImportedRouteRegistry) -> RouteApplyResult {
        let mut projected = Vec::new();
        let mut suppressed = Vec::new();
        let mut stale = Vec::new();

        for route in &registry.routes {
            let projection = self.adapter.project_imported_route(route);
            match route.import_state {
                ImportState::Suppressed => suppressed.push(projection),
                ImportState::Stale | ImportState::Withdrawn => stale.push(projection),
                ImportState::Active => projected.push(projection),
            }
        }

        RouteApplyResult {
            projected,
            suppressed,
            stale,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportMergeDecision {
    pub import_state: ImportState,
    pub freshness_state: FreshnessState,
    pub collision_state: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StaleCleanupHandoff {
    pub stale_import_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ImportMergePolicy;

impl ImportMergePolicy {
    pub fn evaluate(
        &self,
        candidate: &AdvertisedRoute,
        registry: &ImportedRouteRegistry,
        local_aliases: &HashSet<String>,
    ) -> ImportMergeDecision {
        let freshness_state = match candidate.route_health.status {
            HealthStatus::Healthy => FreshnessState::Fresh,
            HealthStatus::Degraded => FreshnessState::Degraded,
            HealthStatus::Unhealthy => FreshnessState::Stale,
        };

        if local_aliases.contains(&candidate.alias) {
            return ImportMergeDecision {
                import_state: ImportState::Suppressed,
                freshness_state: freshness_state.clone(),
                collision_state: "local-alias-conflict".into(),
            };
        }

        let cross_peer_alias_conflict = registry.routes.iter().any(|existing| {
            existing.alias == candidate.alias && existing.origin_peer_id != candidate.source_peer_id
        });
        if cross_peer_alias_conflict {
            return ImportMergeDecision {
                import_state: ImportState::Suppressed,
                freshness_state: freshness_state.clone(),
                collision_state: "alias-conflict".into(),
            };
        }

        let import_state = if freshness_state == FreshnessState::Stale {
            ImportState::Stale
        } else {
            ImportState::Active
        };

        ImportMergeDecision {
            import_state,
            freshness_state,
            collision_state: "clean".into(),
        }
    }

    pub fn stale_cleanup_handoff(
        &self,
        registry: &ImportedRouteRegistry,
        active_snapshot: &[AdvertisedRoute],
    ) -> StaleCleanupHandoff {
        let active_ids: HashSet<String> = active_snapshot
            .iter()
            .map(|route| format!("{}::{}", registry.peer_id, route.route_id))
            .collect();

        let stale_import_ids = registry
            .routes
            .iter()
            .filter(|route| !active_ids.contains(&route.import_id))
            .map(|route| route.import_id.clone())
            .collect();

        StaleCleanupHandoff { stale_import_ids }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InMemoryPortImportAdapter {
    aliases: HashSet<String>,
}

impl InMemoryPortImportAdapter {
    pub fn new(aliases: HashSet<String>) -> Self {
        Self { aliases }
    }
}

impl PortImportAdapter for InMemoryPortImportAdapter {
    fn local_aliases(&self) -> HashSet<String> {
        self.aliases.clone()
    }

    fn project_imported_route(&self, route: &ImportedRoute) -> ImportedRouteProjection {
        ImportedRouteProjection {
            import_id: route.import_id.clone(),
            alias: route.alias.clone(),
            protocol: route.protocol.clone(),
            target_kind: route.target_kind.clone(),
            source_peer_id: route.origin_peer_id.clone(),
            import_state: route.import_state.clone(),
            freshness_state: route.freshness_state.clone(),
            collision_state: route.collision_state.clone(),
            available: matches!(route.import_state, ImportState::Active)
                && !matches!(route.freshness_state, FreshnessState::Stale),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{
        DefaultLocalRouteMapper, ImportMergePolicy, ImportedRouteApplyService,
        InMemoryPortImportAdapter, MusuPortServiceRoute, PortExportAdapter, PortLocalRoute,
        PortLocalRouteExportService,
    };
    use crate::application::route_sync::RouteSyncService;
    use crate::domain::registries::{AdvertisedRouteRegistry, ImportedRouteRegistry};
    use crate::domain::routes::{
        AdvertisedRoute, Entrypoint, FreshnessState, HealthSnapshot, HealthStatus, ImportState,
        ImportedRoute, Visibility,
    };

    #[test]
    fn default_mapper_copies_port_route_shape() {
        let mapper = DefaultLocalRouteMapper;
        let local = mapper.map_local_route(&PortLocalRoute {
            route_id: "route-a".into(),
            alias: "editor".into(),
            protocol: "http".into(),
            entrypoint: Entrypoint {
                host: "127.0.0.1".into(),
                port: 8787,
            },
            target_kind: "mcp".into(),
            visibility: Visibility::Shared,
            health: HealthSnapshot {
                status: HealthStatus::Healthy,
                checked_at: "2026-04-03T00:00:00Z".into(),
            },
        });

        assert_eq!(local.route_id, "route-a");
        assert_eq!(local.alias, "editor");
        assert_eq!(local.entrypoint.port, 8787);
    }

    #[test]
    fn service_route_mapper_projects_musu_port_shape() {
        let mapper = DefaultLocalRouteMapper;
        let local = mapper.map_local_route(&MusuPortServiceRoute {
            name: "shell".into(),
            alias: "terminal".into(),
            protocol: "http".into(),
            service_class: "agent_facing".into(),
            agent_facing: true,
            enabled: true,
            running: true,
            port: Some(3000),
            target_url: Some("http://127.0.0.1:3000".into()),
            entrypoint_url: "http://127.0.0.1:1355/terminal".into(),
        });

        assert_eq!(local.route_id, "shell");
        assert_eq!(local.alias, "terminal");
        assert_eq!(local.target_kind, "agent_facing");
        assert_eq!(local.visibility, Visibility::PeerVisible);
        assert_eq!(local.entrypoint.port, 3000);
    }

    #[test]
    fn export_service_maps_multiple_routes() {
        let service = PortLocalRouteExportService::new(DefaultLocalRouteMapper);
        let exported = service.export_routes(&[
            PortLocalRoute {
                route_id: "route-a".into(),
                alias: "editor".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "127.0.0.1".into(),
                    port: 8787,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                health: HealthSnapshot {
                    status: HealthStatus::Healthy,
                    checked_at: "2026-04-03T00:00:00Z".into(),
                },
            },
            PortLocalRoute {
                route_id: "route-b".into(),
                alias: "shell".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "127.0.0.1".into(),
                    port: 8788,
                },
                target_kind: "agent".into(),
                visibility: Visibility::PeerVisible,
                health: HealthSnapshot {
                    status: HealthStatus::Healthy,
                    checked_at: "2026-04-03T00:00:00Z".into(),
                },
            },
        ]);

        assert_eq!(exported.len(), 2);
        assert_eq!(exported[1].alias, "shell");
    }

    fn imported_registry(imported: Vec<ImportedRoute>) -> ImportedRouteRegistry {
        ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-03T00:00:00Z".into(),
            routes: imported,
        }
    }

    fn advertised(route_id: &str, alias: &str, peer_id: &str) -> AdvertisedRoute {
        advertised_with_health(route_id, alias, peer_id, HealthStatus::Healthy)
    }

    fn advertised_with_health(
        route_id: &str,
        alias: &str,
        peer_id: &str,
        health_status: HealthStatus,
    ) -> AdvertisedRoute {
        AdvertisedRoute {
            route_id: route_id.into(),
            alias: alias.into(),
            protocol: "http".into(),
            entrypoint: Entrypoint {
                host: "10.0.0.10".into(),
                port: 8787,
            },
            target_kind: "mcp".into(),
            visibility: Visibility::Shared,
            source_device_id: "device-a".into(),
            source_peer_id: peer_id.into(),
            share_scope: "org".into(),
            advertised_at: "2026-04-03T00:00:00Z".into(),
            fresh_until: "2026-04-03T00:05:00Z".into(),
            route_health: HealthSnapshot {
                status: health_status,
                checked_at: "2026-04-03T00:00:00Z".into(),
            },
        }
    }

    #[test]
    fn merge_policy_suppresses_when_alias_conflicts_with_local() {
        let policy = ImportMergePolicy;
        let registry = imported_registry(vec![]);
        let local_aliases: HashSet<String> = ["editor".into()].into_iter().collect();

        let decision = policy.evaluate(
            &advertised("route-a", "editor", "peer-a"),
            &registry,
            &local_aliases,
        );

        assert_eq!(decision.import_state, ImportState::Suppressed);
        assert_eq!(decision.collision_state, "local-alias-conflict");
    }

    #[test]
    fn merge_policy_suppresses_cross_peer_alias_conflict() {
        let policy = ImportMergePolicy;
        let registry = imported_registry(vec![ImportedRoute {
            import_id: "peer-a::route-a".into(),
            route_id: "route-a".into(),
            alias: "editor".into(),
            protocol: "http".into(),
            entrypoint: Entrypoint {
                host: "10.0.0.10".into(),
                port: 8787,
            },
            target_kind: "mcp".into(),
            visibility: Visibility::Shared,
            origin_device_id: "device-a".into(),
            origin_peer_id: "peer-a".into(),
            import_state: ImportState::Active,
            freshness_state: FreshnessState::Fresh,
            collision_state: "clean".into(),
        }]);

        let decision = policy.evaluate(
            &advertised("route-b", "editor", "peer-b"),
            &registry,
            &HashSet::new(),
        );

        assert_eq!(decision.import_state, ImportState::Suppressed);
        assert_eq!(decision.collision_state, "alias-conflict");
    }

    #[test]
    fn merge_policy_marks_degraded_route_as_degraded_freshness() {
        let policy = ImportMergePolicy;
        let registry = imported_registry(vec![]);

        let decision = policy.evaluate(
            &advertised_with_health("route-a", "editor", "peer-a", HealthStatus::Degraded),
            &registry,
            &HashSet::new(),
        );

        assert_eq!(decision.import_state, ImportState::Active);
        assert_eq!(decision.freshness_state, FreshnessState::Degraded);
        assert_eq!(decision.collision_state, "clean");
    }

    #[test]
    fn merge_policy_marks_unhealthy_route_as_stale_import() {
        let policy = ImportMergePolicy;
        let registry = imported_registry(vec![]);

        let decision = policy.evaluate(
            &advertised_with_health("route-a", "editor", "peer-a", HealthStatus::Unhealthy),
            &registry,
            &HashSet::new(),
        );

        assert_eq!(decision.import_state, ImportState::Stale);
        assert_eq!(decision.freshness_state, FreshnessState::Stale);
        assert_eq!(decision.collision_state, "clean");
    }

    #[test]
    fn stale_cleanup_handoff_returns_missing_imports() {
        let policy = ImportMergePolicy;
        let registry = imported_registry(vec![
            ImportedRoute {
                import_id: "peer-a::route-a".into(),
                route_id: "route-a".into(),
                alias: "editor".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "10.0.0.10".into(),
                    port: 8787,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                origin_device_id: "device-a".into(),
                origin_peer_id: "peer-a".into(),
                import_state: ImportState::Active,
                freshness_state: FreshnessState::Fresh,
                collision_state: "clean".into(),
            },
            ImportedRoute {
                import_id: "peer-a::route-b".into(),
                route_id: "route-b".into(),
                alias: "shell".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "10.0.0.11".into(),
                    port: 8788,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                origin_device_id: "device-a".into(),
                origin_peer_id: "peer-a".into(),
                import_state: ImportState::Active,
                freshness_state: FreshnessState::Fresh,
                collision_state: "clean".into(),
            },
        ]);
        let active = vec![advertised("route-a", "editor", "peer-a")];

        let handoff = policy.stale_cleanup_handoff(&registry, &active);

        assert_eq!(
            handoff.stale_import_ids,
            vec!["peer-a::route-b".to_string()]
        );
    }

    #[test]
    fn imported_route_apply_service_splits_active_suppressed_and_stale_routes() {
        let adapter = InMemoryPortImportAdapter::new(HashSet::from([String::from("local-editor")]));
        let service = ImportedRouteApplyService::new(adapter);
        let registry = imported_registry(vec![
            ImportedRoute {
                import_id: "peer-a::route-a".into(),
                route_id: "route-a".into(),
                alias: "editor".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "10.0.0.10".into(),
                    port: 8787,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                origin_device_id: "device-a".into(),
                origin_peer_id: "peer-a".into(),
                import_state: ImportState::Active,
                freshness_state: FreshnessState::Fresh,
                collision_state: "clean".into(),
            },
            ImportedRoute {
                import_id: "peer-a::route-b".into(),
                route_id: "route-b".into(),
                alias: "shell".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "10.0.0.11".into(),
                    port: 8788,
                },
                target_kind: "agent".into(),
                visibility: Visibility::Shared,
                origin_device_id: "device-a".into(),
                origin_peer_id: "peer-a".into(),
                import_state: ImportState::Suppressed,
                freshness_state: FreshnessState::Fresh,
                collision_state: "alias-conflict".into(),
            },
            ImportedRoute {
                import_id: "peer-a::route-c".into(),
                route_id: "route-c".into(),
                alias: "legacy".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "10.0.0.12".into(),
                    port: 8789,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                origin_device_id: "device-a".into(),
                origin_peer_id: "peer-a".into(),
                import_state: ImportState::Withdrawn,
                freshness_state: FreshnessState::Stale,
                collision_state: "stale-timeout".into(),
            },
        ]);

        let result = service.apply_registry(&registry);
        assert_eq!(result.projected.len(), 1);
        assert_eq!(result.suppressed.len(), 1);
        assert_eq!(result.stale.len(), 1);
        assert_eq!(result.projected[0].alias, "editor");
        assert!(!result.stale[0].available);
    }

    #[test]
    fn musu_port_service_route_can_flow_through_advertise_import_and_apply() {
        let export_service = PortLocalRouteExportService::new(DefaultLocalRouteMapper);
        let exported = export_service.export_routes(&[MusuPortServiceRoute {
            name: "shell".into(),
            alias: "terminal".into(),
            protocol: "http".into(),
            service_class: "agent_facing".into(),
            agent_facing: true,
            enabled: true,
            running: true,
            port: Some(3000),
            target_url: Some("http://127.0.0.1:3000".into()),
            entrypoint_url: "http://127.0.0.1:1355/terminal".into(),
        }]);

        let mut advertised = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-03T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::publish_local_route(
            &mut advertised,
            &exported[0],
            "org",
            "2026-04-03T00:00:00Z",
            "2026-04-03T00:05:00Z",
        );

        let mut imported = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-03T00:00:00Z".into(),
            routes: vec![],
        };
        RouteSyncService::import_snapshot(
            &mut imported,
            &advertised.routes,
            "2026-04-03T00:01:00Z",
        );

        let apply_service =
            ImportedRouteApplyService::new(InMemoryPortImportAdapter::new(HashSet::new()));
        let result = apply_service.apply_registry(&imported);

        assert_eq!(result.projected.len(), 1);
        assert_eq!(result.projected[0].alias, "terminal");
        assert_eq!(result.projected[0].source_peer_id, "peer-a");
        assert!(result.projected[0].available);
    }
}
