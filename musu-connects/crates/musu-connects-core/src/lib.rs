pub mod application;
pub mod bootstrap;
pub mod domain;

pub use application::discovery::{DiscoveryProvider, InMemoryDiscoveredPeerRegistry};
pub use application::heartbeat::HeartbeatService;
pub use application::identity::{
    cert_fingerprint, gen_self_signed_cert, load_or_gen_cert, FingerprintVerifier, NoVerifier,
};
pub use application::mdns_service::{MdnsService, parse_mdns_peer};
pub use application::pairing::{PairingError, PairingService};
pub use application::port_adapter::{
    DefaultLocalRouteMapper, ImportMergeDecision, ImportMergePolicy, ImportedRouteApplyService,
    ImportedRouteProjection, InMemoryPortImportAdapter, MusuPortServiceRoute, PortExportAdapter,
    PortImportAdapter, PortLocalRoute, PortLocalRouteExportService, RouteApplyResult,
    StaleCleanupHandoff,
};
pub use application::product_demo::{
    FirstProductDemoError, FirstProductDemoService, FirstProductDemoSnapshot,
};
pub use application::quic_provider::{
    QuicBindTarget, QuicControlBiStream, QuicEndpointConfig, QuicProvider, QuicProviderError,
    QuicSessionEvent,
};
pub use application::reconnect::ReconnectionService;
pub use application::route_sync::RouteSyncService;
pub use application::stun_service::StunService;
pub use application::sync_orchestrator::{
    PeerRouteState, SyncOrchestrator, SyncOrchestratorConfig,
};
pub use domain::peers::{DeviceIdentity, DiscoveryState, PeerRecord, TrustLevel};
pub use domain::protocol::{
    ConnectsFrame, ConnectsOpCode, ErrorPayload, PairRequestPayload, PairSuccessPayload,
    QuicTransportConfig,
};
pub use domain::registries::{AdvertisedRouteRegistry, ImportedRouteRegistry};
pub use domain::routes::{
    AdvertisedRoute, Entrypoint, FreshnessState, HealthSnapshot, HealthStatus, ImportState,
    ImportedRoute, LocalManagedRoute, Visibility,
};
pub use domain::transforms::{advertise_local_route, import_advertised_route};
pub use domain::transport::{
    HealthRecord, Reachability, ReconcileState, SessionRecord, SessionRegistry, TransportState,
};
