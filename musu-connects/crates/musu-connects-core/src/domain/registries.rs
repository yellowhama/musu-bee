use serde::{Deserialize, Serialize};

use crate::domain::routes::{AdvertisedRoute, ImportedRoute};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AdvertisedRouteRegistry {
    pub source_device_id: String,
    pub source_peer_id: String,
    pub published_at: String,
    pub routes: Vec<AdvertisedRoute>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportedRouteRegistry {
    pub peer_id: String,
    pub refreshed_at: String,
    pub routes: Vec<ImportedRoute>,
}

impl AdvertisedRouteRegistry {
    pub fn new(source_device_id: String, source_peer_id: String) -> Self {
        Self {
            source_device_id,
            source_peer_id,
            published_at: String::new(),
            routes: Vec::new(),
        }
    }

    pub fn route(&self, route_id: &str) -> Option<&AdvertisedRoute> {
        self.routes.iter().find(|route| route.route_id == route_id)
    }

    pub fn all_routes(&self) -> &[AdvertisedRoute] {
        &self.routes
    }

    pub fn publish(&mut self, route: AdvertisedRoute, published_at: &str) {
        if let Some(existing) = self
            .routes
            .iter_mut()
            .find(|existing| existing.route_id == route.route_id)
        {
            *existing = route;
        } else {
            self.routes.push(route);
        }
        self.published_at = published_at.to_owned();
    }
}

impl ImportedRouteRegistry {
    pub fn new(peer_id: String) -> Self {
        Self {
            peer_id,
            refreshed_at: String::new(),
            routes: Vec::new(),
        }
    }

    pub fn route(&self, import_id: &str) -> Option<&ImportedRoute> {
        self.routes
            .iter()
            .find(|route| route.import_id == import_id)
    }

    pub fn route_mut(&mut self, import_id: &str) -> Option<&mut ImportedRoute> {
        self.routes
            .iter_mut()
            .find(|route| route.import_id == import_id)
    }

    pub fn all_imports(&self) -> &[ImportedRoute] {
        &self.routes
    }

    pub fn all_imports_mut(&mut self) -> &mut [ImportedRoute] {
        &mut self.routes
    }

    pub fn merge(&mut self, route: ImportedRoute, refreshed_at: &str) {
        if let Some(existing) = self
            .routes
            .iter_mut()
            .find(|existing| existing.import_id == route.import_id)
        {
            *existing = route;
        } else {
            self.routes.push(route);
        }
        self.refreshed_at = refreshed_at.to_owned();
    }
}

#[cfg(test)]
mod tests {
    use super::{AdvertisedRouteRegistry, ImportedRouteRegistry};
    use crate::domain::routes::{
        AdvertisedRoute, Entrypoint, FreshnessState, HealthSnapshot, HealthStatus, ImportState,
        ImportedRoute, Visibility,
    };

    #[test]
    fn advertised_registry_finds_route_by_route_id() {
        let registry = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![AdvertisedRoute {
                route_id: "route-a".into(),
                alias: "editor".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "127.0.0.1".into(),
                    port: 8787,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                source_device_id: "device-a".into(),
                source_peer_id: "peer-a".into(),
                share_scope: "org".into(),
                advertised_at: "2026-04-02T00:00:00Z".into(),
                fresh_until: "2026-04-02T00:05:00Z".into(),
                route_health: HealthSnapshot {
                    status: HealthStatus::Healthy,
                    checked_at: "2026-04-02T00:00:00Z".into(),
                },
            }],
        };

        assert_eq!(
            registry.route("route-a").map(|route| route.alias.as_str()),
            Some("editor")
        );
    }

    #[test]
    fn imported_registry_finds_route_by_import_id() {
        let registry = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![ImportedRoute {
                import_id: "import-a".into(),
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
            }],
        };

        assert_eq!(
            registry
                .route("import-a")
                .map(|route| route.route_id.as_str()),
            Some("route-a")
        );
    }

    #[test]
    fn advertised_registry_publish_replaces_existing_route() {
        let mut registry = AdvertisedRouteRegistry {
            source_device_id: "device-a".into(),
            source_peer_id: "peer-a".into(),
            published_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![AdvertisedRoute {
                route_id: "route-a".into(),
                alias: "editor".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "127.0.0.1".into(),
                    port: 8787,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                source_device_id: "device-a".into(),
                source_peer_id: "peer-a".into(),
                share_scope: "org".into(),
                advertised_at: "2026-04-02T00:00:00Z".into(),
                fresh_until: "2026-04-02T00:05:00Z".into(),
                route_health: HealthSnapshot {
                    status: HealthStatus::Healthy,
                    checked_at: "2026-04-02T00:00:00Z".into(),
                },
            }],
        };

        registry.publish(
            AdvertisedRoute {
                route_id: "route-a".into(),
                alias: "editor-next".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "127.0.0.1".into(),
                    port: 8788,
                },
                target_kind: "mcp".into(),
                visibility: Visibility::Shared,
                source_device_id: "device-a".into(),
                source_peer_id: "peer-a".into(),
                share_scope: "org".into(),
                advertised_at: "2026-04-02T00:01:00Z".into(),
                fresh_until: "2026-04-02T00:06:00Z".into(),
                route_health: HealthSnapshot {
                    status: HealthStatus::Healthy,
                    checked_at: "2026-04-02T00:01:00Z".into(),
                },
            },
            "2026-04-02T00:01:00Z",
        );

        assert_eq!(registry.routes.len(), 1);
        assert_eq!(
            registry.route("route-a").map(|route| route.alias.as_str()),
            Some("editor-next")
        );
    }

    #[test]
    fn imported_registry_merge_replaces_existing_route() {
        let mut registry = ImportedRouteRegistry {
            peer_id: "peer-a".into(),
            refreshed_at: "2026-04-02T00:00:00Z".into(),
            routes: vec![ImportedRoute {
                import_id: "import-a".into(),
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
            }],
        };

        registry.merge(
            ImportedRoute {
                import_id: "import-a".into(),
                route_id: "route-a".into(),
                alias: "editor-next".into(),
                protocol: "http".into(),
                entrypoint: Entrypoint {
                    host: "10.0.0.10".into(),
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
            "2026-04-02T00:01:00Z",
        );

        assert_eq!(registry.routes.len(), 1);
        assert_eq!(
            registry.route("import-a").map(|route| route.alias.as_str()),
            Some("editor-next")
        );
    }
}
