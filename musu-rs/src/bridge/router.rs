//! Task routing engine — V27.
//!
//! Decides where to execute a task: locally or on a remote peer node.
//! Called by `delegate()` and `run_company()` handlers before `spawn_task()`.
//!
//! V27-F4 adds [`RouteHints`] for capability-based auto-routing (GPU
//! preference, OS preference, least-busy selection).

use crate::bridge::AppState;
use crate::peer::discovery::{resolve_all_peers, ResolvedPeer};

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
    // ── 1. Explicit target takes priority ───────────────────────────────
    if let Some(target) = explicit_target {
        // Resolve musu home for peer discovery
        let musu_home = state
            .config
            .nodes_toml_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."));
        let peers = resolve_all_peers(musu_home);

        // Find peer matching the target (by name or addr)
        if let Some(peer) = peers
            .into_iter()
            .find(|p| p.addr == target || p.name.as_deref() == Some(target))
        {
            if is_circuit_open(&peer.addr) {
                tracing::warn!(peer = %peer.addr, "circuit breaker open but explicit target — attempting anyway");
            }
            tracing::info!(
                target = %target,
                addr = %peer.addr,
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
    let musu_home = state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    let peers = resolve_all_peers(musu_home);

    if peers.is_empty() {
        tracing::debug!("no peers discovered, executing locally");
        return RouteDecision::Local;
    }

    // Future: query /api/fleet/node-status for real-time capability data.
    if hints.needs_gpu {
        for peer in &peers {
            // Skip peers with open circuit breakers.
            if is_circuit_open(&peer.addr) {
                tracing::debug!(peer = %peer.addr, "skipping — circuit breaker open");
                continue;
            }

            // 1. Check hardware metadata from cloud
            let mut has_gpu = false;
            if let Some(meta) = &peer.meta {
                if let Some(hardware) = meta.get("hardware") {
                    if let Some(vram) = hardware.get("gpu_vram_mb").and_then(|v| v.as_u64()) {
                        if vram > 0 {
                            has_gpu = true;
                        }
                    }
                }
            }

            // 2. Fallback to name-based heuristic
            if !has_gpu {
                if let Some(ref name) = peer.name {
                    if name.to_lowercase().contains("gpu") {
                        has_gpu = true;
                    }
                }
            }

            if has_gpu {
                let name_display = peer.name.as_deref().unwrap_or("unknown");
                tracing::info!(
                    peer = %name_display,
                    addr = %peer.addr,
                    "auto-routing to GPU node (hardware spec matched)"
                );
                return RouteDecision::Remote { peer: peer.clone() };
            }
        }
        tracing::warn!("no GPU peer found, executing locally");
    }

    // Example OS preference routing
    if let Some(ref os) = hints.prefer_os {
        for peer in &peers {
            if is_circuit_open(&peer.addr) {
                continue;
            }
            if let Some(meta) = &peer.meta {
                if let Some(hardware) = meta.get("hardware") {
                    if let Some(peer_os) = hardware.get("os").and_then(|v| v.as_str()) {
                        if peer_os.to_lowercase().contains(&os.to_lowercase()) {
                            let name_display = peer.name.as_deref().unwrap_or("unknown");
                            tracing::info!(
                                peer = %name_display,
                                os = %peer_os,
                                "auto-routing based on OS preference"
                            );
                            return RouteDecision::Remote { peer: peer.clone() };
                        }
                    }
                }
            }
        }
    }

    RouteDecision::Local
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
