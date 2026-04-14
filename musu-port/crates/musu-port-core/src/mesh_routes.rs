//! Mesh route exchange types for multi-node service discovery.
//!
//! `AdvertisedRoute` — the local service snapshot exposed to peers via GET /advertised-routes.
//! `ImportedPeerRoutes` — a bundle of routes received from one remote peer.
//!
//! JSON field names are kept compatible with musu-connects-core AdvertisedRoute
//! so both crates can consume each other's /advertised-routes output.

use serde::{Deserialize, Serialize};

use crate::route::ServiceRoute;

// ── Types ────────────────────────────────────────────────────────────────────

/// A local service advertised to peers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvertisedRoute {
    /// Stable route identifier (= ServiceRoute.name).
    pub route_id: String,
    /// Human-readable service alias.
    pub alias: String,
    /// Transport protocol: "http", "tcp", "quic", "ws", etc.
    pub protocol: String,
    /// Service class / target kind (= ServiceRoute.service_class).
    pub target_kind: String,
    /// Device that is advertising this route.
    pub source_device_id: String,
    /// Entrypoint URL as exposed by this node.
    pub entrypoint_url: String,
    /// Health derived from enabled/running flags: "healthy" | "degraded" | "unhealthy".
    pub health_status: String,
    /// Unix seconds when this snapshot was taken.
    pub advertised_at: u64,
    /// True if this service is agent-facing (routing / AI agent traffic).
    pub agent_facing: bool,
}

/// Routes imported from a single remote peer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedPeerRoutes {
    /// The peer's musu-port base URL (key in the cache).
    pub peer_url: String,
    /// Device ID reported by the peer's /health endpoint.
    pub peer_device_id: Option<String>,
    /// Routes advertised by the peer.
    pub routes: Vec<AdvertisedRoute>,
    /// Unix seconds when these routes were last fetched.
    pub fetched_at: u64,
}

// ── Conversion ───────────────────────────────────────────────────────────────

/// Convert a local `ServiceRoute` to the wire-format `AdvertisedRoute`.
pub fn service_route_to_advertised(route: &ServiceRoute, device_id: &str) -> AdvertisedRoute {
    let health_status = if route.enabled && route.running {
        "healthy"
    } else if route.enabled {
        "degraded"
    } else {
        "unhealthy"
    };

    AdvertisedRoute {
        route_id: route.name.clone(),
        alias: route.alias.clone(),
        protocol: route.protocol.clone(),
        target_kind: route.service_class.clone(),
        source_device_id: device_id.to_string(),
        entrypoint_url: route.entrypoint_url.clone(),
        health_status: health_status.to_string(),
        advertised_at: unix_now_secs(),
        agent_facing: route.agent_facing,
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

pub(crate) fn unix_now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
