//! Fleet node-status types and dashboard — V27-F3 / V27-F4.
//!
//! Provides [`NodeCapabilities`] for hardware/OS detection,
//! [`NodeStatus`] for F4 smart auto-routing, and F3 fleet dashboard
//! handlers (`fleet_status`, `node_status`, `list_tasks`).
#![allow(dead_code)]

use axum::extract::State;
use axum::Json;
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};

/// Freshness window for the "relay-reachable" verdict (F-3).
///
/// A peer whose direct probe fails is still shown as relay-reachable (yellow,
/// not offline) if the cloud registry saw a heartbeat within this many seconds.
/// The registry heartbeat TTL is 120s (see cloud/mod.rs `heartbeat_ttl_seconds`,
/// the publish payload sends 120). We use 300s ≈ 2.5×TTL: it tolerates 1-2
/// missed beats (transient packet loss) but a node the registry has already
/// expired (its record is gone past TTL) will not be falsely shown reachable —
/// once the registry drops the node, `peer_last_seen` returns no recent stamp.
/// Do NOT widen this to 600s: that would paint a registry-dead node "relay" for
/// up to 10 minutes.
const RELAY_FRESH_SECS: i64 = 300;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;
use crate::peer::discovery::{resolve_all_peers, ResolvedPeer};

// ── F4 types (smart auto-routing) ───────────────────────────────────

/// Hardware and OS capabilities reported by each fleet node.
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct NodeCapabilities {
    /// Whether a GPU is available on this node.
    pub gpu_present: bool,
    /// GPU VRAM in GB, if known.
    pub gpu_vram_gb: Option<f32>,
    /// Number of logical CPU cores.
    pub cpu_cores: u32,
    /// Total system memory in GB (0.0 if unknown).
    pub memory_gb: f32,
    /// Operating system identifier (e.g. `"windows"`, `"linux"`).
    pub os: String,
}

impl NodeCapabilities {
    /// Detect capabilities of the current machine.
    ///
    /// GPU presence is read from the `MUSU_GPU_PRESENT` environment variable
    /// (`"1"` or `"true"`). VRAM is read from `MUSU_GPU_VRAM_GB`. CPU core
    /// count is obtained via [`std::thread::available_parallelism`].
    pub fn detect() -> Self {
        Self {
            gpu_present: std::env::var("MUSU_GPU_PRESENT")
                .map(|v| v == "1" || v == "true")
                .unwrap_or(false),
            gpu_vram_gb: std::env::var("MUSU_GPU_VRAM_GB")
                .ok()
                .and_then(|v| v.parse().ok()),
            cpu_cores: std::thread::available_parallelism()
                .map(|n| n.get() as u32)
                .unwrap_or(1),
            memory_gb: 0.0, // platform-specific, leave as 0 for now
            os: std::env::consts::OS.to_string(),
        }
    }
}

/// Status snapshot for a single fleet node (F4 auto-routing).
#[derive(Debug, Serialize, Deserialize)]
pub struct NodeStatus {
    /// Node name (from config).
    pub name: String,
    /// Whether the node is currently reachable.
    pub online: bool,
    /// Number of tasks currently running on this node.
    pub active_tasks: u32,
    /// Hardware/OS capabilities.
    pub capabilities: NodeCapabilities,
}

// ── F3 dashboard types ──────────────────────────────────────────────

/// Overall fleet status returned by `GET /api/fleet/status`.
#[derive(Debug, Serialize)]
pub struct FleetDashboard {
    pub this_node: FleetNodeStatus,
    pub peers: Vec<FleetNodeStatus>,
    pub total_nodes: usize,
    pub online_nodes: usize,
    pub total_tasks_running: u32,
    pub total_tasks_pending: u32,
}

/// Status of a single node in the fleet dashboard.
#[derive(Debug, Serialize, Deserialize)]
pub struct FleetNodeStatus {
    pub name: String,
    pub addr: String,
    pub healthy: bool,
    /// How this node is seen from this bridge: `"direct"` (probe succeeded or
    /// self), `"relay"` (direct probe failed but the registry has a recent
    /// heartbeat, so this is a relay/display candidate), or absent/`None`
    /// (offline — neither direct nor relay-fresh). `healthy` remains `false`
    /// for a relay peer; relay is not counted in `online_nodes` until real
    /// transport proves work can move through it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reachable_via: Option<String>,
    pub is_self: bool,
    pub last_seen: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tailscale_ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mesh_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub control_server_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub control_server_verified: Option<bool>,
    pub tasks_running: u32,
    pub tasks_pending: u32,
    pub shared_dirs: Vec<String>,
    pub version: String,
}

fn peer_meta_string(peer: &ResolvedPeer, key: &str) -> Option<String> {
    peer.meta
        .as_ref()
        .and_then(|meta| meta.get(key))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

fn peer_last_seen(peer: &ResolvedPeer) -> Option<String> {
    peer_meta_string(peer, "last_seen").or_else(|| {
        peer.meta
            .as_ref()
            .and_then(|meta| meta.get("last_health_at"))
            .and_then(|v| v.as_i64())
            .and_then(|ts| Utc.timestamp_opt(ts, 0).single())
            .map(|dt| dt.to_rfc3339())
    })
}

fn peer_meta_bool(peer: &ResolvedPeer, key: &str) -> Option<bool> {
    peer.meta
        .as_ref()
        .and_then(|meta| meta.get(key))
        .and_then(|v| v.as_bool())
}

/// Collapse peers that share the same non-empty name down to the single freshest
/// record (newest `peer_last_seen`), preserving first-seen order. Fixes the
/// ghost-node accumulation where a machine re-registered on a new ephemeral port
/// surfaces as several dead same-name records. DISPLAY-ONLY: routing keeps every
/// addr (see `resolve_all_peers` doc). Peers with no name are never merged.
fn collapse_peers_by_name_for_display(peers: Vec<ResolvedPeer>) -> Vec<ResolvedPeer> {
    use std::collections::HashMap;
    let mut best_for_name: HashMap<String, usize> = HashMap::new();
    let mut out: Vec<ResolvedPeer> = Vec::with_capacity(peers.len());

    let parse = |s: &str| {
        DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|d| d.with_timezone(&Utc))
    };

    for peer in peers {
        let name = peer.name.as_deref().unwrap_or("").trim().to_string();
        if name.is_empty() {
            out.push(peer);
            continue;
        }
        match best_for_name.get(&name).copied() {
            None => {
                best_for_name.insert(name, out.len());
                out.push(peer);
            }
            Some(idx) => {
                let incoming = peer_last_seen(&peer).as_deref().and_then(parse);
                let existing = peer_last_seen(&out[idx]).as_deref().and_then(parse);
                let replace = match (incoming, existing) {
                    (Some(a), Some(b)) => a > b,
                    (Some(_), None) => true,
                    _ => false, // existing wins ties / when incoming has no stamp
                };
                if replace {
                    out[idx] = peer;
                }
            }
        }
    }

    out
}

/// Decide whether a peer whose direct probe failed still has fresh relay-display
/// evidence.
///
/// Pure function over the peer's last-seen RFC3339 stamp (from the cloud
/// registry heartbeat, normalized by [`peer_last_seen`]) and a "now" instant.
/// Returns `Some("relay")` when the stamp parses and is within
/// [`RELAY_FRESH_SECS`] of `now`; otherwise `None` (offline). This is a display
/// verdict only: direct work is not proven, and `online_nodes` must not include
/// this peer. No last_seen → `None` (preserves the offline-with-no-fabrication
/// contract).
fn relay_verdict(last_seen: Option<&str>, now: DateTime<Utc>) -> Option<String> {
    let stamp = last_seen?;
    let parsed = DateTime::parse_from_rfc3339(stamp).ok()?;
    let age = now.signed_duration_since(parsed.with_timezone(&Utc));
    if age.num_seconds() >= 0 && age.num_seconds() <= RELAY_FRESH_SECS {
        Some("relay".to_string())
    } else {
        None
    }
}

/// Outcome of a direct probe against a peer's `/api/fleet/node-status`, after the
/// HTTP/await layer has resolved. Pure input to [`map_probe_response`] so the
/// probe→status decision is testable without reqwest/timeout/join_all.
enum ProbeOutcome {
    /// Peer answered 2xx and the body parsed into a `FleetNodeStatus`.
    Parsed(FleetNodeStatus),
    /// Peer answered 2xx but the body could not be parsed.
    Unreadable,
    /// Send failed, timed out, or returned a non-success status.
    Failed,
}

/// Decide a peer's fleet status from a resolved probe outcome (pure).
///
/// - `Parsed`: the prober reached the peer DIRECTLY, so we override the peer's
///   self-report — `reachable_via` is forced to `"direct"` (MED-2: the peer
///   can't know how WE reach it), `last_seen` is filled if absent, and any
///   stale `status_error` is cleared.
/// - `Unreadable` / `Failed`: defer to [`peer_fallback_status`], which judges
///   relay-vs-offline from the registry heartbeat freshness.
fn map_probe_response(peer: &ResolvedPeer, outcome: ProbeOutcome) -> FleetNodeStatus {
    match outcome {
        ProbeOutcome::Parsed(mut ns) => {
            ns.last_seen.get_or_insert_with(|| Utc::now().to_rfc3339());
            ns.status_error = None;
            ns.reachable_via = Some("direct".to_string());
            ns
        }
        ProbeOutcome::Unreadable => peer_fallback_status(peer, "node status unreadable"),
        ProbeOutcome::Failed => peer_fallback_status(peer, "node status probe failed"),
    }
}

fn peer_fallback_status(peer: &ResolvedPeer, status_error: impl Into<String>) -> FleetNodeStatus {
    let last_seen = peer_last_seen(peer);
    // Direct probe failed; if the registry still has a fresh heartbeat the peer
    // is a relay-display candidate, not direct/offline. healthy STAYS false (no
    // direct route) — reachable_via carries the distinction without implying
    // work can be routed.
    let reachable_via = relay_verdict(last_seen.as_deref(), Utc::now());
    FleetNodeStatus {
        name: peer.name.clone().unwrap_or_else(|| peer.addr.clone()),
        addr: peer.addr.clone(),
        healthy: false,
        reachable_via,
        is_self: false,
        last_seen,
        status_error: Some(status_error.into()),
        tailscale_ip: peer_meta_string(peer, "tailscale_ip"),
        mesh_mode: peer_meta_string(peer, "mesh_mode"),
        route_label: peer_meta_string(peer, "route_label"),
        control_server_url: peer_meta_string(peer, "control_server_url"),
        control_server_verified: peer_meta_bool(peer, "control_server_verified"),
        tasks_running: 0,
        tasks_pending: 0,
        shared_dirs: vec![],
        version: "unknown".into(),
    }
}

fn local_mesh_status(
    musu_home: &std::path::Path,
) -> crate::install::private_mesh::PrivateMeshStatusReport {
    crate::install::private_mesh::build_status_report(musu_home)
}

/// Roll up the fleet dashboard counters from the per-peer statuses.
///
/// Returns `(online_nodes, total_tasks_running, total_tasks_pending)`, seeded
/// with self (online starts at 1; the local task counts are passed in).
///
/// `online_nodes` means direct/healthy nodes that can be queried for work now.
/// A relay-display peer (`reachable_via == "relay"`) is intentionally NOT
/// counted online because direct probing failed and release-grade relay
/// transport is not proven by the fleet status endpoint. Counting it would make
/// the CLI/cockpit imply "work can be sent" when only a recent registry
/// heartbeat exists.
fn tally_fleet(
    peer_statuses: &[FleetNodeStatus],
    local_running: u32,
    local_pending: u32,
) -> (u32, u32, u32) {
    let mut total_running = local_running;
    let mut total_pending = local_pending;
    let mut online = 1u32; // self
    for ns in peer_statuses {
        if ns.healthy {
            online += 1;
            total_running += ns.tasks_running;
            total_pending += ns.tasks_pending;
        }
    }
    (online, total_running, total_pending)
}

// ── F3 handlers ─────────────────────────────────────────────────────

/// GET /api/fleet/status — overview of the entire fleet.
pub async fn fleet_status(State(state): State<AppState>) -> Result<Json<FleetDashboard>> {
    // Get local task counts.
    let local_running: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM route_executions WHERE status = 'running'")
            .fetch_one(&state.pool)
            .await
            .map_err(MusuError::Sqlx)?;

    let local_pending: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM route_executions WHERE status = 'pending'")
            .fetch_one(&state.pool)
            .await
            .map_err(MusuError::Sqlx)?;

    let local_running = local_running as u32;
    let local_pending = local_pending as u32;

    // Get shared dirs.
    let shares = crate::install::shares::SharesConfig::load(
        state
            .config
            .nodes_toml_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new(".")),
    );
    let local_shares: Vec<String> = shares.shared.iter().map(|s| s.path.clone()).collect();

    let musu_home = state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    let local_mesh = local_mesh_status(musu_home);

    let this_node = FleetNodeStatus {
        name: state.config.node_name.clone(),
        addr: crate::bridge::services::advertised_bridge_http_url(&state.config)
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .to_string(),
        healthy: true,
        reachable_via: Some("direct".to_string()),
        is_self: true,
        last_seen: Some(Utc::now().to_rfc3339()),
        status_error: None,
        tailscale_ip: local_mesh.local_tailnet_ip.clone(),
        mesh_mode: Some(local_mesh.mode.clone()),
        route_label: Some(local_mesh.route_label.clone()),
        control_server_url: local_mesh.control_server_url.clone(),
        control_server_verified: Some(local_mesh.control_server_verified),
        tasks_running: local_running,
        tasks_pending: local_pending,
        shared_dirs: local_shares,
        version: env!("CARGO_PKG_VERSION").to_string(),
    };

    // Query peers, then collapse same-name ghosts for the DISPLAY/tally. A
    // machine that re-registered on a new ephemeral port (BRIDGE_PORT=0) appears
    // as multiple same-name records that linger in the 7-day cache; without this
    // collapse one machine shows up as N dead "offline" nodes and inflates
    // total_nodes. We dedup here (fleet read path) rather than in
    // resolve_all_peers because routing/failover (bridge::router) deliberately
    // keeps every addr per name to try alternates.
    let peers = collapse_peers_by_name_for_display(resolve_all_peers(musu_home));
    let client = &state.http_client;
    // Cross-machine probe MUST use the account-wide mesh bearer (C-1), not this
    // machine's local bridge token — a sibling validates the bearer against its
    // OWN token, so the local token 401s and the peer is wrongly shown offline.
    // outbound_peer_bearer() returns the mesh bearer (peer_token), falling back
    // to the local token only when no mesh bearer is configured.
    let token = state.config.outbound_peer_bearer();

    // Probe every peer CONCURRENTLY. Serial probing made this O(peers × 3s):
    // a few offline peers (each blocking the full 3s timeout) pushed total
    // latency past callers' client timeouts, so the cockpit's `nodes --local`
    // read failed with "error sending request" even though the bridge was up.
    // join_all bounds wall-clock at the single slowest peer (~3s) regardless of
    // fleet size.
    let probes = peers.iter().map(|peer| {
        let url = format!("http://{}/api/fleet/node-status", peer.addr);
        async move {
            // Resolve the HTTP/await layer into a pure ProbeOutcome, then let
            // map_probe_response (tested) decide the FleetNodeStatus. Keeping the
            // decision pure means the direct-override + last_seen-insert + fallback
            // routing is unit-tested without reqwest/timeout/join_all.
            let outcome = match client
                .get(&url)
                .bearer_auth(token)
                .timeout(std::time::Duration::from_secs(3))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    match resp.json::<FleetNodeStatus>().await {
                        Ok(ns) => ProbeOutcome::Parsed(ns),
                        Err(_) => ProbeOutcome::Unreadable,
                    }
                }
                _ => ProbeOutcome::Failed,
            };
            map_probe_response(peer, outcome)
        }
    });
    let peer_statuses: Vec<FleetNodeStatus> = futures_util::future::join_all(probes).await;

    let (online, total_running, total_pending) =
        tally_fleet(&peer_statuses, local_running, local_pending);

    let total_nodes = 1 + peer_statuses.len();

    Ok(Json(FleetDashboard {
        this_node,
        peers: peer_statuses,
        total_nodes,
        online_nodes: online as usize,
        total_tasks_running: total_running,
        total_tasks_pending: total_pending,
    }))
}

/// GET /api/fleet/node-status — this node's status (called by peers).
pub async fn node_status(State(state): State<AppState>) -> Result<Json<FleetNodeStatus>> {
    let running: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM route_executions WHERE status = 'running'")
            .fetch_one(&state.pool)
            .await
            .map_err(MusuError::Sqlx)?;

    let pending: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM route_executions WHERE status = 'pending'")
            .fetch_one(&state.pool)
            .await
            .map_err(MusuError::Sqlx)?;

    let shares = crate::install::shares::SharesConfig::load(
        state
            .config
            .nodes_toml_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new(".")),
    );
    let musu_home = state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    let local_mesh = local_mesh_status(musu_home);

    Ok(Json(FleetNodeStatus {
        name: state.config.node_name.clone(),
        addr: crate::bridge::services::advertised_bridge_http_url(&state.config)
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .to_string(),
        healthy: true,
        // Self answering a peer's probe: from our own vantage we are reachable
        // directly. The PROBER on the other side overwrites this with its own
        // verdict (see the probe success branch in `fleet_status`), so this is
        // only the default the requesting peer sees if it somehow trusts our
        // self-report.
        reachable_via: Some("direct".to_string()),
        is_self: false,
        last_seen: Some(Utc::now().to_rfc3339()),
        status_error: None,
        tailscale_ip: local_mesh.local_tailnet_ip.clone(),
        mesh_mode: Some(local_mesh.mode.clone()),
        route_label: Some(local_mesh.route_label.clone()),
        control_server_url: local_mesh.control_server_url.clone(),
        control_server_verified: Some(local_mesh.control_server_verified),
        tasks_running: running as u32,
        tasks_pending: pending as u32,
        shared_dirs: shares.shared.iter().map(|s| s.path.clone()).collect(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }))
}

/// GET /api/tasks — list all tasks with status.
pub async fn list_tasks(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    use sqlx::Row;

    let rows = sqlx::query(
        "SELECT task_id, company_id, channel, sender_id, status, \
         created_at, updated_at, duration_sec \
         FROM route_executions ORDER BY created_at DESC LIMIT 100",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    let tasks: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "task_id": row.try_get::<String, _>("task_id").unwrap_or_default(),
                "company_id": row.try_get::<Option<String>, _>("company_id").unwrap_or(None),
                "channel": row.try_get::<String, _>("channel").unwrap_or_default(),
                "status": row.try_get::<String, _>("status").unwrap_or_default(),
                "created_at": row.try_get::<i64, _>("created_at").unwrap_or(0),
                "duration_sec": row.try_get::<Option<f64>, _>("duration_sec").unwrap_or(None),
            })
        })
        .collect();

    let total = tasks.len();

    Ok(Json(serde_json::json!({
        "tasks": tasks,
        "total": total,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::AppState;
    use axum::extract::State;
    use std::sync::Arc;
    use tempfile::TempDir;

    #[test]
    fn detect_returns_valid_defaults() {
        let caps = NodeCapabilities::detect();
        assert!(caps.cpu_cores >= 1);
        assert!(!caps.os.is_empty());
    }

    #[test]
    fn node_status_serializes() {
        let status = NodeStatus {
            name: "test-node".into(),
            online: true,
            active_tasks: 0,
            capabilities: NodeCapabilities::default(),
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("test-node"));
    }

    #[test]
    fn peer_last_seen_prefers_registry_timestamp() {
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "127.0.0.1:8071".to_string(),
            name: Some("studio-pc".to_string()),
            source: crate::peer::discovery::PeerSource::Cache,
            meta: Some(serde_json::json!({
                "last_seen": "2026-06-12T01:02:03+00:00",
            })),
        };

        assert_eq!(
            peer_last_seen(&peer).as_deref(),
            Some("2026-06-12T01:02:03+00:00")
        );
    }

    #[test]
    fn collapse_for_display_keeps_freshest_same_name_and_never_merges_nameless() {
        use crate::peer::discovery::{PeerSource, ResolvedPeer};
        let mk = |addr: &str, name: Option<&str>, last_seen: Option<&str>| ResolvedPeer {
            addr: addr.to_string(),
            name: name.map(str::to_string),
            source: PeerSource::Cache,
            meta: last_seen.map(|s| serde_json::json!({ "last_seen": s })),
        };
        let collapsed = collapse_peers_by_name_for_display(vec![
            // hugh-main re-registered on 3 ephemeral ports; only the freshest stays.
            mk(
                "192.168.1.192:3032",
                Some("hugh-main"),
                Some("2026-06-20T00:00:00+00:00"),
            ),
            mk(
                "192.168.1.192:2957",
                Some("hugh-main"),
                Some("2026-06-24T00:00:00+00:00"),
            ), // live
            mk("192.168.1.192:7203", Some("hugh-main"), None),
            // two distinct names + two nameless peers all survive.
            mk("10.0.0.5:8070", Some("studio-pc"), None),
            mk("10.0.0.9:1", None, None),
            mk("10.0.0.9:2", None, None),
        ]);
        // hugh-main(1) + studio-pc(1) + 2 nameless = 4
        assert_eq!(collapsed.len(), 4);
        let hugh = collapsed
            .iter()
            .find(|p| p.name.as_deref() == Some("hugh-main"))
            .unwrap();
        assert_eq!(hugh.addr, "192.168.1.192:2957", "freshest port wins");
        assert_eq!(
            collapsed.iter().filter(|p| p.name.is_none()).count(),
            2,
            "nameless not merged"
        );
    }

    #[test]
    fn peer_last_seen_converts_nodes_toml_health_epoch() {
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "127.0.0.1:8072".to_string(),
            name: Some("lab-pc".to_string()),
            source: crate::peer::discovery::PeerSource::NodesToml,
            meta: Some(serde_json::json!({
                "last_health_at": 1_781_234_523_i64,
            })),
        };

        assert_eq!(
            peer_last_seen(&peer).as_deref(),
            Some("2026-06-12T03:22:03+00:00")
        );
    }

    /// Build a minimal peer status for tally tests.
    fn status(
        healthy: bool,
        reachable_via: Option<&str>,
        running: u32,
        pending: u32,
    ) -> FleetNodeStatus {
        FleetNodeStatus {
            name: "peer".into(),
            addr: "127.0.0.1:1".into(),
            healthy,
            reachable_via: reachable_via.map(str::to_string),
            is_self: false,
            last_seen: None,
            status_error: None,
            tailscale_ip: None,
            mesh_mode: None,
            route_label: None,
            control_server_url: None,
            control_server_verified: None,
            tasks_running: running,
            tasks_pending: pending,
            shared_dirs: vec![],
            version: "test".into(),
        }
    }

    #[test]
    fn relay_verdict_fresh_last_seen_is_relay() {
        let now = Utc::now();
        let last_seen = (now - chrono::Duration::seconds(60)).to_rfc3339();
        assert_eq!(
            relay_verdict(Some(&last_seen), now).as_deref(),
            Some("relay")
        );
    }

    #[test]
    fn relay_verdict_stale_last_seen_is_offline() {
        let now = Utc::now();
        let last_seen = (now - chrono::Duration::hours(2)).to_rfc3339();
        assert_eq!(relay_verdict(Some(&last_seen), now), None);
    }

    #[test]
    fn relay_verdict_no_last_seen_is_offline() {
        let now = Utc::now();
        assert_eq!(relay_verdict(None, now), None);
    }

    #[test]
    fn relay_verdict_boundary_exactly_fresh_is_relay() {
        // A stamp exactly RELAY_FRESH_SECS old is still relay (inclusive).
        let now = Utc::now();
        let last_seen = (now - chrono::Duration::seconds(RELAY_FRESH_SECS)).to_rfc3339();
        assert_eq!(
            relay_verdict(Some(&last_seen), now).as_deref(),
            Some("relay")
        );
    }

    #[test]
    fn peer_fallback_status_fresh_heartbeat_is_relay_not_offline() {
        // Fresh registry heartbeat (epoch ~now-60s) → relay-reachable, but
        // healthy stays false (direct probe failed).
        let recent = (Utc::now() - chrono::Duration::seconds(60)).timestamp();
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "10.0.0.9:8070".to_string(),
            name: Some("wan-pc".to_string()),
            source: crate::peer::discovery::PeerSource::Cache,
            meta: Some(serde_json::json!({ "last_health_at": recent })),
        };
        let status = peer_fallback_status(&peer, "node status probe failed");
        assert!(!status.healthy, "relay peer is not healthy");
        assert_eq!(status.reachable_via.as_deref(), Some("relay"));
    }

    #[test]
    fn peer_fallback_status_stale_heartbeat_is_offline() {
        let stale = (Utc::now() - chrono::Duration::hours(2)).timestamp();
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "10.0.0.10:8070".to_string(),
            name: Some("dead-pc".to_string()),
            source: crate::peer::discovery::PeerSource::Cache,
            meta: Some(serde_json::json!({ "last_health_at": stale })),
        };
        let status = peer_fallback_status(&peer, "node status probe failed");
        assert!(!status.healthy);
        assert_eq!(
            status.reachable_via, None,
            "stale peer is offline, not relay"
        );
    }

    #[test]
    fn tally_counts_only_direct_healthy_peers_online() {
        // A relay-display peer is visible but not counted online because direct
        // probing failed and relay transport is not proven by this endpoint. A
        // stale/offline peer increments neither.
        let peers = vec![
            status(true, Some("direct"), 3, 1), // healthy: online + tasks
            status(false, Some("relay"), 9, 9), // relay: display only
            status(false, None, 5, 5),          // offline: neither
        ];
        let (online, running, pending) = tally_fleet(&peers, 2, 4);
        // self(1) + healthy(1) = 2 online; relay-display is not work-available
        assert_eq!(online, 2);
        // local 2 + healthy peer 3 = 5; relay/offline task counts excluded
        assert_eq!(running, 5);
        // local 4 + healthy peer 1 = 5
        assert_eq!(pending, 5);
    }

    #[test]
    fn peer_fallback_status_does_not_fabricate_online_or_last_seen() {
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "127.0.0.1:8073".to_string(),
            name: Some("broken-pc".to_string()),
            source: crate::peer::discovery::PeerSource::NodesToml,
            meta: Some(serde_json::json!({
                "tailscale_ip": "100.64.0.73",
                "mesh_mode": "musu_headscale",
            })),
        };

        let status = peer_fallback_status(&peer, "node status unreadable");

        assert!(!status.healthy);
        assert_eq!(status.last_seen, None);
        assert_eq!(
            status.status_error.as_deref(),
            Some("node status unreadable")
        );
        assert_eq!(status.tailscale_ip.as_deref(), Some("100.64.0.73"));
    }

    #[test]
    fn map_probe_response_parsed_forces_direct_and_fills_last_seen() {
        // A successful direct probe: the prober's verdict overrides the peer's
        // self-report (MED-2). The peer claims "relay" with no last_seen and a
        // stale error; map_probe_response must force reachable_via="direct",
        // fill last_seen, and clear status_error — WITHOUT touching the
        // heartbeat-fallback path.
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "10.0.0.5:8070".to_string(),
            name: Some("studio-pc".to_string()),
            source: crate::peer::discovery::PeerSource::Cache,
            meta: None,
        };
        let mut parsed = status(true, Some("relay"), 4, 2);
        parsed.last_seen = None;
        parsed.status_error = Some("stale self-reported error".into());

        let out = map_probe_response(&peer, ProbeOutcome::Parsed(parsed));

        assert!(out.healthy, "parsed body's own healthy flag is preserved");
        assert_eq!(
            out.reachable_via.as_deref(),
            Some("direct"),
            "prober overrides peer's self-reported reachable_via"
        );
        assert!(out.last_seen.is_some(), "last_seen filled when absent");
        assert_eq!(out.status_error, None, "stale self-reported error cleared");
        // The real payload's task counts survive (only routing fields are forced).
        assert_eq!(out.tasks_running, 4);
        assert_eq!(out.tasks_pending, 2);
    }

    #[test]
    fn map_probe_response_unreadable_falls_back_to_heartbeat_offline() {
        // 2xx but unparseable body → fallback path. With no/stale heartbeat the
        // peer is offline (relay-vs-offline is peer_fallback_status's job, already
        // covered; here we assert the routing reaches it with the right error).
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "10.0.0.6:8070".to_string(),
            name: Some("garbled-pc".to_string()),
            source: crate::peer::discovery::PeerSource::Cache,
            meta: None,
        };

        let out = map_probe_response(&peer, ProbeOutcome::Unreadable);

        assert!(!out.healthy, "unreadable body is never healthy");
        assert_eq!(out.reachable_via, None, "no heartbeat → offline");
        assert_eq!(out.status_error.as_deref(), Some("node status unreadable"));
    }

    #[test]
    fn peer_mesh_metadata_reads_cached_registry_fields() {
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "100.64.0.8:8070".to_string(),
            name: Some("studio-pc".to_string()),
            source: crate::peer::discovery::PeerSource::Cache,
            meta: Some(serde_json::json!({
                "tailscale_ip": "100.64.0.8",
                "mesh_mode": "musu_headscale",
                "route_label": "Private Mesh",
                "control_server_url": "https://mesh.example",
                "control_server_verified": true,
            })),
        };

        assert_eq!(
            peer_meta_string(&peer, "tailscale_ip").as_deref(),
            Some("100.64.0.8")
        );
        assert_eq!(
            peer_meta_string(&peer, "mesh_mode").as_deref(),
            Some("musu_headscale")
        );
        assert_eq!(peer_meta_bool(&peer, "control_server_verified"), Some(true));
    }

    #[tokio::test]
    async fn node_status_uses_runtime_registry_addr() {
        let tmp = TempDir::new().unwrap();
        let musu_home = tmp.path().join(".musu");
        std::fs::create_dir_all(musu_home.join("services")).unwrap();

        let registry =
            crate::bridge::services::ServiceRegistry::with_dir(musu_home.join("services"));
        registry
            .register(&crate::bridge::services::ServiceRecord {
                name: "bridge".to_string(),
                addr: "127.0.0.1:43123".to_string(),
                pid: None,
                started_at: 0,
                transport: crate::bridge::services::Transport::Tcp,
            })
            .unwrap();

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE route_executions (
                task_id TEXT,
                status TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        let cfg = Arc::new(crate::bridge::config::BridgeConfig {
            bridge_host: "127.0.0.1".to_string(),
            bridge_port: 0,
            public_url: None,
            node_name: "test-node".to_string(),
            db_path: musu_home.join("db").join("musu.db"),
            audit_db_path: musu_home.join("data").join("audit.db"),
            nodes_toml_path: musu_home.join("nodes.toml"),
            token: String::new(),
            peer_token: None,
            localhost_auth_required: false,
            env: crate::bridge::config::AuthMode::Development,
            rate_limit_disabled: true,
            rate_limit_per_min: 0,
            allow_plaintext_lan: false,
            file_serve_roots: vec![],
            file_serve_writable: false,
            tls_enabled: false,
            tls_cert_path: None,
            tls_key_path: None,
        });

        let sse_broadcaster = crate::writer::SseBroadcaster::from_env();
        let task_runner =
            crate::writer::TaskRunnerHandle::new(pool.clone(), sse_broadcaster.clone()).await;

        let state = AppState {
            config: cfg,
            pool: pool.clone(),
            http_client: reqwest::Client::new(),
            audit: crate::bridge::audit::AuditState::new(pool.clone()),
            dedup: crate::bridge::dedup::DedupCache::new(),
            task_runner,
            sse_broadcaster,
            pairing: crate::bridge::handlers::pair::PairingStore::new(),
        };

        let Json(status) = node_status(State(state)).await.unwrap();
        // This test asserts the advertised addr uses the RUNTIME registry PORT
        // (43123), not the static config port. The HOST is now the machine's
        // LAN IP when bridge_host is the loopback default (F-1: peers must reach
        // us, not their own loopback), so we assert the port suffix rather than
        // a hardcoded loopback host — keeps the test env-independent (CI / any
        // LAN IP) while still proving the runtime-port wiring.
        assert!(
            status.addr.ends_with(":43123"),
            "advertised addr should use runtime registry port 43123, got {}",
            status.addr
        );
        assert!(status.last_seen.is_some());
    }
}
