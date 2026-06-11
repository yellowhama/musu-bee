//! Fleet node-status types and dashboard — V27-F3 / V27-F4.
//!
//! Provides [`NodeCapabilities`] for hardware/OS detection,
//! [`NodeStatus`] for F4 smart auto-routing, and F3 fleet dashboard
//! handlers (`fleet_status`, `node_status`, `list_tasks`).
#![allow(dead_code)]

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;
use crate::peer::discovery::resolve_all_peers;

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
    pub is_self: bool,
    pub tasks_running: u32,
    pub tasks_pending: u32,
    pub shared_dirs: Vec<String>,
    pub version: String,
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

    let this_node = FleetNodeStatus {
        name: state.config.node_name.clone(),
        addr: crate::bridge::services::advertised_bridge_http_url(&state.config)
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .to_string(),
        healthy: true,
        is_self: true,
        tasks_running: local_running,
        tasks_pending: local_pending,
        shared_dirs: local_shares,
        version: env!("CARGO_PKG_VERSION").to_string(),
    };

    // Query peers.
    let musu_home = state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    let peers = resolve_all_peers(musu_home);
    let client = &state.http_client;
    let token = &state.config.token;

    // Probe every peer CONCURRENTLY. Serial probing made this O(peers × 3s):
    // a few offline peers (each blocking the full 3s timeout) pushed total
    // latency past callers' client timeouts, so the cockpit's `nodes --local`
    // read failed with "error sending request" even though the bridge was up.
    // join_all bounds wall-clock at the single slowest peer (~3s) regardless of
    // fleet size.
    let probes = peers.iter().map(|peer| {
        let url = format!("http://{}/api/fleet/node-status", peer.addr);
        async move {
            match client
                .get(&url)
                .bearer_auth(token)
                .timeout(std::time::Duration::from_secs(3))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => match resp.json::<FleetNodeStatus>().await
                {
                    Ok(ns) => ns,
                    Err(_) => FleetNodeStatus {
                        name: peer.name.clone().unwrap_or_else(|| peer.addr.clone()),
                        addr: peer.addr.clone(),
                        healthy: true,
                        is_self: false,
                        tasks_running: 0,
                        tasks_pending: 0,
                        shared_dirs: vec![],
                        version: "unknown".into(),
                    },
                },
                _ => FleetNodeStatus {
                    name: peer.name.clone().unwrap_or_else(|| peer.addr.clone()),
                    addr: peer.addr.clone(),
                    healthy: false,
                    is_self: false,
                    tasks_running: 0,
                    tasks_pending: 0,
                    shared_dirs: vec![],
                    version: "unknown".into(),
                },
            }
        }
    });
    let peer_statuses: Vec<FleetNodeStatus> = futures_util::future::join_all(probes).await;

    let mut total_running = local_running;
    let mut total_pending = local_pending;
    let mut online = 1u32; // self
    for ns in &peer_statuses {
        if ns.healthy {
            online += 1;
            total_running += ns.tasks_running;
            total_pending += ns.tasks_pending;
        }
    }

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

    Ok(Json(FleetNodeStatus {
        name: state.config.node_name.clone(),
        addr: crate::bridge::services::advertised_bridge_http_url(&state.config)
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .to_string(),
        healthy: true,
        is_self: false,
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

    #[tokio::test]
    async fn node_status_uses_runtime_registry_addr() {
        let tmp = TempDir::new().unwrap();
        let musu_home = tmp.path().join(".musu");
        std::env::set_var("MUSU_HOME", &musu_home);
        std::fs::create_dir_all(musu_home.join("services")).unwrap();

        let registry = crate::bridge::services::ServiceRegistry::new();
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
            python_facade_port: 0,
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
        assert_eq!(status.addr, "127.0.0.1:43123");

        std::env::remove_var("MUSU_HOME");
    }
}
