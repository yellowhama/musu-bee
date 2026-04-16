use std::collections::HashSet;

use serde::Serialize;

use crate::application::pairing::{PairingError, PairingService};
use crate::application::port_adapter::{
    DefaultLocalRouteMapper, ImportedRouteApplyService, ImportedRouteProjection,
    InMemoryPortImportAdapter, MusuPortServiceRoute, PortLocalRouteExportService,
};
use crate::application::quic_provider::{QuicProvider, QuicProviderError, QuicSessionEvent};
use crate::application::route_sync::RouteSyncService;
use crate::domain::peers::{DiscoveryState, PeerRecord, TrustLevel};
use crate::domain::protocol::PairRequestPayload;
use crate::domain::registries::{AdvertisedRouteRegistry, ImportedRouteRegistry};
use crate::domain::routes::LocalManagedRoute;

const RUNTIME_TRANSPORT_EVIDENCE_KIND: &str = "runtime-musu-port-http-route-plane-v1";
const RUNTIME_SESSION_MODE_AUTHENTICATED: &str = "runtime-peer-authenticated";
const RUNTIME_SESSION_MODE_UNAUTHENTICATED: &str = "runtime-unauthenticated";
const SESSION_REMOTE_ADDR_SOURCE_RUNTIME: &str = "quic-session-event.remote_addr";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FirstProductDemoSnapshot {
    pub peer_id: String,
    pub trust_level: TrustLevel,
    pub discovery_state: DiscoveryState,
    pub trust_gate_reason: String,
    pub import_decision_reason: String,
    pub transport_evidence_kind: String,
    pub session_evidence_mode: String,
    pub session_remote_addr_source: String,
    pub exported_route: LocalManagedRoute,
    pub projected_routes: Vec<ImportedRouteProjection>,
    pub suppressed_routes: Vec<ImportedRouteProjection>,
    pub stale_routes: Vec<ImportedRouteProjection>,
    pub quic_session: Option<QuicSessionEvent>,
    pub pairing_session_id: Option<String>,
    pub pairing_outcome: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FirstProductDemoError {
    Quic(QuicProviderError),
    PairingBlocked,
    InvalidToken,
    MissingProjection,
}

pub struct FirstProductDemoService;

impl FirstProductDemoService {
    pub async fn run(
        route: MusuPortServiceRoute,
        local_aliases: HashSet<String>,
        peer: PeerRecord,
        now: &str,
    ) -> Result<FirstProductDemoSnapshot, FirstProductDemoError> {
        let export_service = PortLocalRouteExportService::new(DefaultLocalRouteMapper);
        let exported_route = export_service
            .export_routes(&[route])
            .into_iter()
            .next()
            .expect("single route export should produce one route");

        let mut advertised = AdvertisedRouteRegistry {
            source_device_id: peer.device.device_id.clone(),
            source_peer_id: peer.peer_id.clone(),
            published_at: now.into(),
            routes: vec![],
        };
        RouteSyncService::publish_local_route(
            &mut advertised,
            &exported_route,
            "org",
            now,
            "2026-04-03T00:05:00Z",
        );

        let mut imported = ImportedRouteRegistry {
            peer_id: peer.peer_id.clone(),
            refreshed_at: now.into(),
            routes: vec![],
        };
        RouteSyncService::import_snapshot_for_peer_with_local_aliases(
            &mut imported,
            &advertised.routes,
            now,
            &local_aliases,
            &peer,
        );

        let apply_service =
            ImportedRouteApplyService::new(InMemoryPortImportAdapter::new(local_aliases));
        let apply_result = apply_service.apply_registry(&imported);
        if apply_result.projected.is_empty()
            && apply_result.suppressed.is_empty()
            && apply_result.stale.is_empty()
        {
            return Err(FirstProductDemoError::MissingProjection);
        }
        let trust_gate_reason = derive_trust_gate_reason(&peer);
        let import_decision_reason = derive_import_decision_reason(
            &apply_result.projected,
            &apply_result.suppressed,
            &apply_result.stale,
        );
        let (
            transport_evidence_kind,
            session_evidence_mode,
            session_remote_addr_source,
            quic_session,
            pairing_session_id,
            pairing_outcome,
        ) =
            if trust_gate_reason == "peer-allowed" {
                let mut provider = QuicProvider::default();
                let (cert, key) = crate::application::identity::gen_self_signed_cert()
                    .map_err(|e| FirstProductDemoError::Quic(QuicProviderError::TlsConfigError(e.to_string())))?;
                provider.open_listener(cert, key).await.map_err(FirstProductDemoError::Quic)?;
                let remote_addr = provider
                    .runtime_remote_addr_for_peer(&peer.peer_id)
                    .map_err(FirstProductDemoError::Quic)?;
                let quic_session = provider
                    .accept(&peer.peer_id, "session-a", &remote_addr, now)
                    .await
                    .map_err(FirstProductDemoError::Quic)?;

                let request = PairRequestPayload {
                    peer_id: peer.peer_id.clone(),
                    node_id: "node-a".into(),
                    token: "a".repeat(64),
                    requested_at: now.into(),
                };
                let pairing = PairingService::default();
                let pairing_attempt = pairing.pair_peer(&peer, &request, "session-a", now);
                let (pairing_session_id, pairing_outcome, session_evidence_mode) =
                    match pairing_attempt {
                    Ok(frame) => {
                        let payload: crate::domain::protocol::PairSuccessPayload =
                            serde_json::from_value(frame.payload).expect("pair success payload");
                        (
                            Some(payload.session_id),
                            "paired".to_string(),
                            RUNTIME_SESSION_MODE_AUTHENTICATED.to_string(),
                        )
                    }
                    Err(PairingError::BlockedPeer) => (
                        None,
                        "peer_blocked".to_string(),
                        RUNTIME_SESSION_MODE_UNAUTHENTICATED.to_string(),
                    ),
                    Err(PairingError::InvalidToken) => (
                        None,
                        "invalid_token".to_string(),
                        RUNTIME_SESSION_MODE_UNAUTHENTICATED.to_string(),
                    ),
                };

                (
                    RUNTIME_TRANSPORT_EVIDENCE_KIND.to_string(),
                    session_evidence_mode,
                    SESSION_REMOTE_ADDR_SOURCE_RUNTIME.to_string(),
                    Some(quic_session),
                    pairing_session_id,
                    pairing_outcome,
                )
            } else {
                (
                    "trust-gate-suppressed".to_string(),
                    "not-generated".to_string(),
                    "none".to_string(),
                    None,
                    None,
                    "trust_gate_suppressed".to_string(),
                )
            };

        Ok(FirstProductDemoSnapshot {
            peer_id: peer.peer_id,
            trust_level: peer.trust_level,
            discovery_state: peer.discovery_state,
            trust_gate_reason,
            import_decision_reason,
            transport_evidence_kind,
            session_evidence_mode,
            session_remote_addr_source,
            exported_route,
            projected_routes: apply_result.projected,
            suppressed_routes: apply_result.suppressed,
            stale_routes: apply_result.stale,
            quic_session,
            pairing_session_id,
            pairing_outcome,
        })
    }
}

fn derive_trust_gate_reason(
    peer: &PeerRecord,
) -> String {
    RouteSyncService::peer_import_gate_reason(peer)
        .unwrap_or("peer-allowed")
        .to_string()
}

fn derive_import_decision_reason(
    projected: &[ImportedRouteProjection],
    suppressed: &[ImportedRouteProjection],
    stale: &[ImportedRouteProjection],
) -> String {
    if !projected.is_empty() {
        return projected[0].collision_state.clone();
    }

    suppressed
        .first()
        .map(|route| route.collision_state.clone())
        .or_else(|| stale.first().map(|route| route.collision_state.clone()))
        .unwrap_or_else(|| "missing-route-import-decision".to_string())
}

#[cfg(test)]
mod tests {
    use super::FirstProductDemoService;
    use crate::application::port_adapter::MusuPortServiceRoute;
    use crate::domain::peers::{DeviceIdentity, DiscoveryState, PeerRecord, TrustLevel};
    use crate::domain::routes::HealthStatus;
    use std::collections::HashSet;

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
            observed_addr: None,
            last_seen_at: "2026-04-03T00:00:00Z".into(),
            discovered_via: "live-harness".into(),
        }
    }

    #[tokio::test]
    async fn first_product_demo_service_builds_end_to_end_snapshot() {
        let snapshot = FirstProductDemoService::run(
            MusuPortServiceRoute {
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
            },
            HashSet::new(),
            peer_record(TrustLevel::Trusted, DiscoveryState::Verified),
            "2026-04-03T00:00:00Z",
        )
        .await
        .expect("demo snapshot should be produced");

        assert_eq!(snapshot.peer_id, "peer-a");
        assert_eq!(snapshot.trust_level, TrustLevel::Trusted);
        assert_eq!(snapshot.discovery_state, DiscoveryState::Verified);
        assert_eq!(snapshot.trust_gate_reason, "peer-allowed");
        assert_eq!(snapshot.import_decision_reason, "clean");
        assert_eq!(
            snapshot.transport_evidence_kind,
            "runtime-musu-port-http-route-plane-v1"
        );
        assert_eq!(snapshot.session_evidence_mode, "runtime-peer-authenticated");
        assert_eq!(
            snapshot.session_remote_addr_source,
            "quic-session-event.remote_addr"
        );
        assert_eq!(snapshot.exported_route.alias, "terminal");
        assert_eq!(snapshot.exported_route.health.status, HealthStatus::Healthy);
        assert_eq!(snapshot.projected_routes.len(), 1);
        assert_eq!(snapshot.suppressed_routes.len(), 0);
        assert_eq!(snapshot.stale_routes.len(), 0);
        assert_eq!(snapshot.projected_routes[0].alias, "terminal");
        assert_eq!(snapshot.projected_routes[0].import_state, crate::domain::routes::ImportState::Active);
        assert_eq!(snapshot.projected_routes[0].freshness_state, crate::domain::routes::FreshnessState::Fresh);
        assert_eq!(
            snapshot
                .quic_session
                .as_ref()
                .expect("trusted proof should include runtime quic session")
                .control_stream
                .descriptor,
            "bi/0/control"
        );
        assert_eq!(snapshot.pairing_session_id.as_deref(), Some("session-a"));
        assert_eq!(snapshot.pairing_outcome, "paired");
    }

    #[tokio::test]
    async fn blocked_peer_snapshot_is_suppressed_with_explicit_gate_reason() {
        let snapshot = FirstProductDemoService::run(
            MusuPortServiceRoute {
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
            },
            HashSet::new(),
            peer_record(TrustLevel::Blocked, DiscoveryState::Blocked),
            "2026-04-03T00:00:00Z",
        )
        .await
        .expect("blocked peer should still produce suppression snapshot");

        assert!(snapshot.projected_routes.is_empty());
        assert_eq!(snapshot.suppressed_routes.len(), 1);
        assert_eq!(snapshot.suppressed_routes[0].collision_state, "peer-blocked");
        assert_eq!(snapshot.suppressed_routes[0].available, false);
        assert_eq!(snapshot.trust_gate_reason, "peer-blocked");
        assert_eq!(snapshot.import_decision_reason, "peer-blocked");
        assert_eq!(snapshot.transport_evidence_kind, "trust-gate-suppressed");
        assert_eq!(snapshot.session_evidence_mode, "not-generated");
        assert_eq!(snapshot.session_remote_addr_source, "none");
        assert!(snapshot.quic_session.is_none());
        assert_eq!(snapshot.pairing_session_id, None);
        assert_eq!(snapshot.pairing_outcome, "trust_gate_suppressed");
    }

    #[tokio::test]
    async fn unverified_peer_snapshot_is_suppressed_without_pairing_failure() {
        let snapshot = FirstProductDemoService::run(
            MusuPortServiceRoute {
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
            },
            HashSet::new(),
            peer_record(TrustLevel::Known, DiscoveryState::Discovered),
            "2026-04-03T00:00:00Z",
        )
        .await
        .expect("unverified peer should produce suppression snapshot");

        assert!(snapshot.projected_routes.is_empty());
        assert_eq!(snapshot.suppressed_routes.len(), 1);
        assert_eq!(snapshot.suppressed_routes[0].collision_state, "peer-not-verified");
        assert_eq!(snapshot.trust_gate_reason, "peer-not-verified");
        assert_eq!(snapshot.import_decision_reason, "peer-not-verified");
        assert_eq!(snapshot.transport_evidence_kind, "trust-gate-suppressed");
        assert_eq!(snapshot.session_evidence_mode, "not-generated");
        assert_eq!(snapshot.session_remote_addr_source, "none");
        assert_eq!(snapshot.suppressed_routes[0].available, false);
        assert!(snapshot.quic_session.is_none());
        assert_eq!(snapshot.pairing_session_id, None);
        assert_eq!(snapshot.pairing_outcome, "trust_gate_suppressed");
        assert_eq!(
            snapshot
                .suppressed_routes
                .iter()
                .filter(|route| !route.available && route.collision_state == "peer-not-verified")
                .count(),
            1
        );
        assert_eq!(snapshot.stale_routes.len(), 0);
        assert_eq!(snapshot.exported_route.health.status, HealthStatus::Healthy);
    }

    #[tokio::test]
    async fn trusted_peer_alias_conflict_keeps_trust_gate_reason_distinct() {
        let snapshot = FirstProductDemoService::run(
            MusuPortServiceRoute {
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
            },
            HashSet::from(["terminal".to_string()]),
            peer_record(TrustLevel::Trusted, DiscoveryState::Verified),
            "2026-04-03T00:00:00Z",
        )
        .await
        .expect("trusted peer with alias conflict should still produce snapshot");

        assert!(snapshot.projected_routes.is_empty());
        assert_eq!(snapshot.suppressed_routes.len(), 1);
        assert_eq!(snapshot.suppressed_routes[0].collision_state, "local-alias-conflict");
        assert_eq!(snapshot.trust_gate_reason, "peer-allowed");
        assert_eq!(snapshot.import_decision_reason, "local-alias-conflict");
        assert_eq!(
            snapshot.transport_evidence_kind,
            "runtime-musu-port-http-route-plane-v1"
        );
        assert_eq!(snapshot.session_evidence_mode, "runtime-peer-authenticated");
        assert_eq!(
            snapshot.session_remote_addr_source,
            "quic-session-event.remote_addr"
        );
        assert!(snapshot.quic_session.is_some());
        assert_eq!(snapshot.pairing_session_id.as_deref(), Some("session-a"));
    }
}
