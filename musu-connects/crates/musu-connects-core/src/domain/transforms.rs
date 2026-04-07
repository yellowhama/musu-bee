use crate::domain::routes::{
    AdvertisedRoute, FreshnessState, ImportState, ImportedRoute, LocalManagedRoute,
};

pub fn advertise_local_route(
    route: &LocalManagedRoute,
    source_device_id: &str,
    source_peer_id: &str,
    share_scope: &str,
    advertised_at: &str,
    fresh_until: &str,
) -> AdvertisedRoute {
    AdvertisedRoute {
        route_id: route.route_id.clone(),
        alias: route.alias.clone(),
        protocol: route.protocol.clone(),
        entrypoint: route.entrypoint.clone(),
        target_kind: route.target_kind.clone(),
        visibility: route.visibility.clone(),
        source_device_id: source_device_id.to_owned(),
        source_peer_id: source_peer_id.to_owned(),
        share_scope: share_scope.to_owned(),
        advertised_at: advertised_at.to_owned(),
        fresh_until: fresh_until.to_owned(),
        route_health: route.health.clone(),
    }
}

pub fn import_advertised_route(
    route: &AdvertisedRoute,
    import_id: &str,
    import_state: ImportState,
    freshness_state: FreshnessState,
    collision_state: &str,
) -> ImportedRoute {
    ImportedRoute {
        import_id: import_id.to_owned(),
        route_id: route.route_id.clone(),
        alias: route.alias.clone(),
        protocol: route.protocol.clone(),
        entrypoint: route.entrypoint.clone(),
        target_kind: route.target_kind.clone(),
        visibility: route.visibility.clone(),
        origin_device_id: route.source_device_id.clone(),
        origin_peer_id: route.source_peer_id.clone(),
        import_state,
        freshness_state,
        collision_state: collision_state.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::{advertise_local_route, import_advertised_route};
    use crate::domain::routes::{
        Entrypoint, FreshnessState, HealthSnapshot, HealthStatus, ImportState, LocalManagedRoute,
        Visibility,
    };

    #[test]
    fn advertise_local_route_copies_local_shape_into_network_shape() {
        let local = LocalManagedRoute {
            route_id: "route-a".into(),
            alias: "editor".into(),
            protocol: "http".into(),
            entrypoint: Entrypoint {
                host: "127.0.0.1".into(),
                port: 8792,
            },
            target_kind: "mcp".into(),
            visibility: Visibility::Shared,
            health: HealthSnapshot {
                status: HealthStatus::Healthy,
                checked_at: "2026-04-02T00:00:00Z".into(),
            },
        };

        let advertised = advertise_local_route(
            &local,
            "device-a",
            "peer-a",
            "org",
            "2026-04-02T00:00:00Z",
            "2026-04-02T00:05:00Z",
        );

        assert_eq!(advertised.route_id, "route-a");
        assert_eq!(advertised.source_device_id, "device-a");
        assert_eq!(advertised.share_scope, "org");
    }

    #[test]
    fn import_advertised_route_copies_network_shape_into_import_shape() {
        let local = LocalManagedRoute {
            route_id: "route-a".into(),
            alias: "editor".into(),
            protocol: "http".into(),
            entrypoint: Entrypoint {
                host: "127.0.0.1".into(),
                port: 8792,
            },
            target_kind: "mcp".into(),
            visibility: Visibility::Shared,
            health: HealthSnapshot {
                status: HealthStatus::Healthy,
                checked_at: "2026-04-02T00:00:00Z".into(),
            },
        };
        let advertised = advertise_local_route(
            &local,
            "device-a",
            "peer-a",
            "org",
            "2026-04-02T00:00:00Z",
            "2026-04-02T00:05:00Z",
        );

        let imported = import_advertised_route(
            &advertised,
            "import-a",
            ImportState::Active,
            FreshnessState::Fresh,
            "clean",
        );

        assert_eq!(imported.import_id, "import-a");
        assert_eq!(imported.origin_device_id, "device-a");
        assert_eq!(imported.origin_peer_id, "peer-a");
    }
}
