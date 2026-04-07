use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Visibility {
    LocalOnly,
    PeerVisible,
    Shared,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HealthSnapshot {
    pub status: HealthStatus,
    pub checked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Entrypoint {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalManagedRoute {
    pub route_id: String,
    pub alias: String,
    pub protocol: String,
    pub entrypoint: Entrypoint,
    pub target_kind: String,
    pub visibility: Visibility,
    pub health: HealthSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AdvertisedRoute {
    pub route_id: String,
    pub alias: String,
    pub protocol: String,
    pub entrypoint: Entrypoint,
    pub target_kind: String,
    pub visibility: Visibility,
    pub source_device_id: String,
    pub source_peer_id: String,
    pub share_scope: String,
    pub advertised_at: String,
    pub fresh_until: String,
    pub route_health: HealthSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ImportState {
    Active,
    Suppressed,
    Stale,
    Withdrawn,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FreshnessState {
    Fresh,
    Degraded,
    Stale,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportedRoute {
    pub import_id: String,
    pub route_id: String,
    pub alias: String,
    pub protocol: String,
    pub entrypoint: Entrypoint,
    pub target_kind: String,
    pub visibility: Visibility,
    pub origin_device_id: String,
    pub origin_peer_id: String,
    pub import_state: ImportState,
    pub freshness_state: FreshnessState,
    pub collision_state: String,
}
