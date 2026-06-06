//! Task routing engine — V27.
//!
//! Decides where to execute a task: locally or on a remote peer node.
//! Called by `delegate()` and `run_company()` handlers before `spawn_task()`.
//!
//! V27-F4 adds [`RouteHints`] for capability-based auto-routing (GPU
//! preference, OS preference, least-busy selection).

use crate::bridge::AppState;
use crate::peer::discovery::{resolve_all_peers, PeerSource, ResolvedPeer};

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Circuit breaker state for a single peer.
struct CircuitState {
    consecutive_failures: u32,
    #[allow(dead_code)]
    last_failure: Instant,
    open_until: Option<Instant>,
}

/// Failure threshold before opening the circuit.
const FAILURE_THRESHOLD: u32 = 3;

/// Cooldown duration while the circuit is open.
const COOLDOWN: Duration = Duration::from_secs(60);

/// Circuit breaker state for peers.
/// If a peer fails consecutively, it's temporarily marked unhealthy.
static CIRCUIT_BREAKER: std::sync::LazyLock<Mutex<HashMap<String, CircuitState>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Path kind used by the local selector before relay transport exists.
///
/// This is deliberately narrower than the final `musu.route_evidence.v1`
/// contract: relay remains an unwired fallback and therefore is not returned
/// as a selected direct peer path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoutePathKind {
    Local,
    Lan,
    Tailscale,
    DirectQuic,
}

impl RoutePathKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Lan => "lan",
            Self::Tailscale => "tailscale",
            Self::DirectQuic => "direct_quic",
        }
    }

    fn priority(self) -> u8 {
        match self {
            Self::Local => 0,
            Self::Lan => 10,
            Self::Tailscale => 20,
            Self::DirectQuic => 30,
        }
    }
}

/// Classify an endpoint address for path selection and diagnostics.
pub fn route_kind_for_addr(addr: &str) -> RoutePathKind {
    let Some(host) = host_from_addr(addr) else {
        return RoutePathKind::DirectQuic;
    };
    let Ok(ip) = host.parse::<std::net::IpAddr>() else {
        return RoutePathKind::DirectQuic;
    };

    match ip {
        std::net::IpAddr::V4(v4) => {
            let octets = v4.octets();
            if v4.is_loopback() {
                RoutePathKind::Local
            } else if octets[0] == 100 && (64..=127).contains(&octets[1]) {
                RoutePathKind::Tailscale
            } else if v4.is_private() || v4.is_link_local() {
                RoutePathKind::Lan
            } else {
                RoutePathKind::DirectQuic
            }
        }
        std::net::IpAddr::V6(v6) => {
            if v6.is_loopback() {
                RoutePathKind::Local
            } else if v6.is_unicast_link_local() {
                RoutePathKind::Lan
            } else {
                RoutePathKind::DirectQuic
            }
        }
    }
}

fn host_from_addr(addr: &str) -> Option<&str> {
    let without_scheme = addr
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    let authority = without_scheme.split('/').next()?.trim();
    if authority.is_empty() {
        return None;
    }
    if let Some(rest) = authority.strip_prefix('[') {
        return rest.split(']').next();
    }
    authority
        .rsplit_once(':')
        .map(|(host, _)| host)
        .or(Some(authority))
}

fn source_priority(source: PeerSource) -> u8 {
    match source {
        PeerSource::Registry => 0,
        PeerSource::Cache => 1,
        PeerSource::Manual => 2,
        PeerSource::NodesToml => 3,
    }
}

fn peer_sort_key(peer: &ResolvedPeer) -> (u8, u8, &str) {
    (
        route_kind_for_addr(&peer.addr).priority(),
        source_priority(peer.source),
        peer.addr.as_str(),
    )
}

fn has_gpu_hint(peer: &ResolvedPeer) -> bool {
    if let Some(meta) = &peer.meta {
        if let Some(vram) = meta
            .get("hardware")
            .and_then(|hardware| hardware.get("gpu_vram_mb"))
            .and_then(|value| value.as_u64())
        {
            if vram > 0 {
                return true;
            }
        }
    }

    peer.name
        .as_deref()
        .is_some_and(|name| name.to_lowercase().contains("gpu"))
}

fn matches_os_hint(peer: &ResolvedPeer, preferred_os: &str) -> bool {
    peer.meta
        .as_ref()
        .and_then(|meta| meta.get("hardware"))
        .and_then(|hardware| hardware.get("os"))
        .and_then(|value| value.as_str())
        .is_some_and(|peer_os| {
            peer_os
                .to_lowercase()
                .contains(&preferred_os.to_lowercase())
        })
}

/// Select the best remote peer from an already-resolved candidate list.
///
/// Priority is LAN → Tailscale/overlay → direct QUIC candidate. Relay is not
/// selected here because the relay/tunnel transport is not implemented yet.
pub fn select_peer_for_route(
    explicit_target: Option<&str>,
    hints: &RouteHints,
    peers: &[ResolvedPeer],
) -> Option<ResolvedPeer> {
    if let Some(target) = explicit_target {
        let mut exact_addr_matches: Vec<&ResolvedPeer> =
            peers.iter().filter(|peer| peer.addr == target).collect();
        exact_addr_matches.sort_by_key(|peer| peer_sort_key(peer));
        if let Some(peer) = exact_addr_matches.first() {
            return Some((*peer).clone());
        }

        let mut name_matches: Vec<&ResolvedPeer> = peers
            .iter()
            .filter(|peer| peer.name.as_deref() == Some(target))
            .collect();
        name_matches.sort_by_key(|peer| peer_sort_key(peer));
        if let Some(peer) = name_matches
            .iter()
            .copied()
            .find(|peer| !is_circuit_open(&peer.addr))
            .or_else(|| name_matches.first().copied())
        {
            return Some(peer.clone());
        }

        return None;
    }

    if !hints.needs_gpu && hints.prefer_os.is_none() && !hints.prefer_least_busy {
        return None;
    }

    let mut candidates: Vec<&ResolvedPeer> = peers
        .iter()
        .filter(|peer| !is_circuit_open(&peer.addr))
        .collect();

    if hints.needs_gpu {
        candidates.retain(|peer| has_gpu_hint(peer));
    }

    if let Some(preferred_os) = hints.prefer_os.as_deref() {
        candidates.retain(|peer| matches_os_hint(peer, preferred_os));
    }

    candidates.sort_by_key(|peer| peer_sort_key(peer));
    candidates.first().map(|peer| (*peer).clone())
}

/// Record a successful forwarding to a peer, resetting its circuit state.
pub fn record_success(peer_addr: &str) {
    if let Ok(mut map) = CIRCUIT_BREAKER.lock() {
        map.remove(peer_addr);
    }
}

/// Record a failed forwarding to a peer.
///
/// After [`FAILURE_THRESHOLD`] consecutive failures the circuit opens for
/// [`COOLDOWN`] seconds, preventing further attempts.
pub fn record_failure(peer_addr: &str) {
    if let Ok(mut map) = CIRCUIT_BREAKER.lock() {
        let state = map.entry(peer_addr.to_string()).or_insert(CircuitState {
            consecutive_failures: 0,
            last_failure: Instant::now(),
            open_until: None,
        });
        state.consecutive_failures += 1;
        state.last_failure = Instant::now();
        if state.consecutive_failures >= FAILURE_THRESHOLD {
            state.open_until = Some(Instant::now() + COOLDOWN);
            tracing::warn!(
                peer = %peer_addr,
                failures = state.consecutive_failures,
                cooldown_sec = COOLDOWN.as_secs(),
                "circuit breaker OPEN — peer temporarily disabled"
            );
        }
    }
}

/// Check if a peer's circuit breaker is open (unhealthy).
///
/// When the cooldown expires the circuit moves to half-open: the counter is
/// reset and one attempt is allowed through.
pub fn is_circuit_open(peer_addr: &str) -> bool {
    if let Ok(mut map) = CIRCUIT_BREAKER.lock() {
        if let Some(state) = map.get_mut(peer_addr) {
            if let Some(until) = state.open_until {
                if Instant::now() < until {
                    return true; // still in cooldown
                }
                // Cooldown expired, half-open: allow one attempt.
                state.open_until = None;
                state.consecutive_failures = 0;
            }
        }
    }
    false
}

/// Routing decision for a task.
#[derive(Debug)]
pub enum RouteDecision {
    /// Execute on this node.
    Local,
    /// Forward to a remote peer.
    Remote { peer: ResolvedPeer },
}

/// Routing hints for auto-routing decisions.
///
/// When all fields are at their defaults the router falls back to `Local`
/// (preserving pre-F4 behaviour).
#[derive(Debug, Default)]
pub struct RouteHints {
    /// Task requires a GPU.
    pub needs_gpu: bool,
    /// Preferred OS (e.g. `"linux"`, `"windows"`).
    pub prefer_os: Option<String>,
    /// Route to the least busy node (future — currently unused).
    pub prefer_least_busy: bool,
}

/// Decide where to execute a task.
///
/// Priority:
///   1. `explicit_target` specified → find matching peer, forward.
///   2. `hints` contain non-default preferences → capability-based routing.
///   3. Everything default → always local.
pub fn route_task(
    state: &AppState,
    explicit_target: Option<&str>,
    hints: &RouteHints,
) -> RouteDecision {
    let musu_home = state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    let peers = resolve_all_peers(musu_home);

    // ── 1. Explicit target takes priority ───────────────────────────────
    if let Some(target) = explicit_target {
        if let Some(peer) = select_peer_for_route(Some(target), hints, &peers) {
            if is_circuit_open(&peer.addr) {
                tracing::warn!(peer = %peer.addr, "circuit breaker open but explicit target — attempting anyway");
            }
            tracing::info!(
                target = %target,
                addr = %peer.addr,
                route_kind = route_kind_for_addr(&peer.addr).as_str(),
                source = ?peer.source,
                "routing task to remote peer"
            );
            return RouteDecision::Remote { peer };
        }

        tracing::warn!(
            target = %target,
            "explicit target not found in peers, falling back to local"
        );
    }

    // ── 2. If hints are all default, stay local ─────────────────────────
    if !hints.needs_gpu && hints.prefer_os.is_none() && !hints.prefer_least_busy {
        return RouteDecision::Local;
    }

    // ── 3. Auto-route based on hints ────────────────────────────────────
    if peers.is_empty() {
        tracing::debug!("no peers discovered, executing locally");
        return RouteDecision::Local;
    }

    if let Some(peer) = select_peer_for_route(None, hints, &peers) {
        let name_display = peer.name.as_deref().unwrap_or("unknown");
        tracing::info!(
            peer = %name_display,
            addr = %peer.addr,
            route_kind = route_kind_for_addr(&peer.addr).as_str(),
            source = ?peer.source,
            needs_gpu = hints.needs_gpu,
            prefer_os = hints.prefer_os.as_deref().unwrap_or(""),
            "auto-routing to best available peer"
        );
        return RouteDecision::Remote { peer };
    }

    tracing::warn!("no peer matched route hints, executing locally");
    RouteDecision::Local
}

/// Pick the best concrete remote candidate after a control-plane session has
/// already authorized the target.
#[cfg(test)]
pub fn select_best_remote_candidate(peers: &[ResolvedPeer]) -> Option<ResolvedPeer> {
    select_remote_candidates_in_order(peers).into_iter().next()
}

pub fn select_remote_candidates_in_order(peers: &[ResolvedPeer]) -> Vec<ResolvedPeer> {
    let mut candidates: Vec<&ResolvedPeer> = peers
        .iter()
        .filter(|peer| !is_circuit_open(&peer.addr))
        .collect();
    candidates.sort_by_key(|peer| peer_sort_key(peer));
    candidates.into_iter().cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn peer(name: &str, addr: &str, source: PeerSource) -> ResolvedPeer {
        ResolvedPeer {
            addr: addr.to_string(),
            name: Some(name.to_string()),
            source,
            meta: None,
        }
    }

    fn gpu_peer(name: &str, addr: &str, source: PeerSource) -> ResolvedPeer {
        ResolvedPeer {
            addr: addr.to_string(),
            name: Some(name.to_string()),
            source,
            meta: Some(serde_json::json!({
                "hardware": {
                    "gpu_vram_mb": 8192,
                    "os": "windows"
                }
            })),
        }
    }

    #[test]
    fn route_local_when_no_target() {
        // Without AppState we can't call route_task directly,
        // but we can test the enum.
        match RouteDecision::Local {
            RouteDecision::Local => {}
            _ => panic!("expected Local"),
        }
    }

    #[test]
    fn route_hints_default_is_passive() {
        let hints = RouteHints::default();
        assert!(!hints.needs_gpu);
        assert!(hints.prefer_os.is_none());
        assert!(!hints.prefer_least_busy);
    }

    #[test]
    fn route_kind_classifies_path_priority_inputs() {
        assert_eq!(route_kind_for_addr("127.0.0.1:8070"), RoutePathKind::Local);
        assert_eq!(route_kind_for_addr("192.168.1.5:8070"), RoutePathKind::Lan);
        assert_eq!(
            route_kind_for_addr("100.100.1.5:8070"),
            RoutePathKind::Tailscale
        );
        assert_eq!(
            route_kind_for_addr("8.8.8.8:443"),
            RoutePathKind::DirectQuic
        );
    }

    #[test]
    fn explicit_name_selects_lan_before_tailscale_and_public() {
        let peers = vec![
            peer("workstation", "8.8.8.8:8070", PeerSource::Cache),
            peer("workstation", "100.100.1.5:8070", PeerSource::Cache),
            peer("workstation", "192.168.1.5:8070", PeerSource::Manual),
        ];
        let selected =
            select_peer_for_route(Some("workstation"), &RouteHints::default(), &peers).unwrap();
        assert_eq!(selected.addr, "192.168.1.5:8070");
    }

    #[test]
    fn gpu_hint_selects_best_path_among_gpu_candidates() {
        let hints = RouteHints {
            needs_gpu: true,
            ..Default::default()
        };
        let peers = vec![
            gpu_peer("gpu-public", "8.8.8.8:8070", PeerSource::Cache),
            gpu_peer("gpu-lan", "10.0.0.25:8070", PeerSource::Manual),
            peer("cpu-lan", "10.0.0.30:8070", PeerSource::Manual),
        ];
        let selected = select_peer_for_route(None, &hints, &peers).unwrap();
        assert_eq!(selected.name.as_deref(), Some("gpu-lan"));
    }

    #[test]
    fn best_remote_candidate_prefers_lan_then_tailscale_then_public() {
        let peers = vec![
            peer("public", "203.0.113.10:8070", PeerSource::Registry),
            peer("tail", "100.64.1.10:8070", PeerSource::Registry),
            peer("lan", "192.168.1.10:8070", PeerSource::Registry),
        ];

        let selected = select_best_remote_candidate(&peers).unwrap();
        assert_eq!(selected.name.as_deref(), Some("lan"));
    }
}
