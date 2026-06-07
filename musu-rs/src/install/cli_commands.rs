//! CLI command handlers for share, route, ls, get, put — V27.
//!
//! Each public `run_*` function corresponds to a `Cmd::*` variant wired
//! from `main.rs`. They resolve peer addresses from `nodes.toml` /
//! `manual_peers.toml`, authenticate with `MUSU_BRIDGE_TOKEN` /
//! `MUSU_TOKEN`, and print operator-friendly output.

use anyhow::{anyhow, Result};
use clap::{Args, Subcommand};
use serde::Serialize;

use crate::bridge::route_evidence::{
    build_route_attempt_evidence, elapsed_ms, https_fingerprint_transport_proof, local_node_id,
    write_route_attempt_evidence, RouteAttemptEvidenceInput, RouteAttemptEvidenceResult,
    RouteTransportProof, CLI_ROUTE_EVIDENCE_NOTE,
};

use super::shares::SharesConfig;

const BRIDGE_HEALTH_TIMEOUT_SECS: u64 = 10;
const BRIDGE_HEALTH_POLL_INITIAL_MS: u64 = 250;
const BRIDGE_HEALTH_POLL_MAX_MS: u64 = 2_000;
const ROUTE_WAIT_DEFAULT_TIMEOUT_SECS: u64 = 300;
const ROUTE_WAIT_MAX_TIMEOUT_SECS: u64 = 3_600;
const ROUTE_WAIT_POLL_INTERVAL_SECS: u64 = 2;
const ROUTE_WAIT_STATUS_REQUEST_TIMEOUT_SECS: u64 = 10;

// ── V27 CLI option structs ──────────────────────────────────────────────

/// Options for `musu share <path>`.
#[derive(Args, Debug)]
pub struct ShareOpts {
    /// Directory path to share (e.g., F:\workspace).
    pub path: String,
    /// Allow peers to write to this directory.
    #[arg(long, short = 'w')]
    pub writable: bool,
    /// Optional human-readable label for the share.
    #[arg(long)]
    pub label: Option<String>,
}

/// Options for `musu unshare <path>`.
#[derive(Args, Debug)]
pub struct UnshareOpts {
    /// Directory path to stop sharing.
    pub path: String,
}

/// Options for `musu route <text>`.
#[derive(Args, Debug)]
pub struct RouteOpts {
    /// The instruction/prompt to execute.
    pub text: String,
    /// Target node name (auto-routes if omitted).
    #[arg(long, short = 't')]
    pub target: Option<String>,
    /// Channel name.
    #[arg(long, default_value = "cli")]
    pub channel: String,
    /// Wait for the task to complete and print the result.
    #[arg(long, short = 'w')]
    pub wait: bool,
    /// Maximum seconds to wait for task completion when --wait is used.
    #[arg(long, default_value_t = ROUTE_WAIT_DEFAULT_TIMEOUT_SECS)]
    pub wait_timeout_sec: u64,
    /// Route to a GPU-capable node.
    #[arg(long)]
    pub gpu: bool,
    /// Explain the route plan and release-evidence gaps without executing.
    #[arg(long)]
    pub explain: bool,
    /// Emit machine-readable JSON for `--explain`.
    #[arg(long)]
    pub json: bool,
    /// Write a `musu.route_evidence.v1` JSON file for this actual route attempt.
    #[arg(long)]
    pub route_evidence_path: Option<std::path::PathBuf>,
}

/// Subcommands for `musu relay`.
#[derive(Subcommand, Debug)]
pub enum RelayAction {
    /// Show current registry/rendezvous/relay readiness.
    Status(RelayStatusOpts),
    /// Query owner-scoped relay transport descriptor/preflight state from musu.pro.
    Transport(RelayTransportOpts),
    /// Query owner-scoped relay lease audit records from musu.pro.
    Leases(RelayLeasesOpts),
    /// Query owner-scoped relay payload queue records from musu.pro.
    Payloads(RelayPayloadsOpts),
    /// Claim queued owner-scoped relay payloads for a target node.
    PayloadClaim(RelayPayloadClaimOpts),
    /// Mark one claimed owner-scoped relay payload delivered.
    PayloadDeliver(RelayPayloadDeliverOpts),
    /// Query owner-scoped release-grade relay route evidence from musu.pro.
    RouteEvidence(RelayRouteEvidenceOpts),
}

/// Subcommands for `musu room`.
#[derive(Subcommand, Debug)]
pub enum RoomAction {
    /// Publish or query room-scoped local executor presence.
    Presence {
        #[command(subcommand)]
        action: RoomPresenceAction,
    },
    /// Claim/drain owner-scoped MUSU.PRO room work orders for this local program.
    WorkOrders {
        #[command(subcommand)]
        action: RoomWorkOrdersAction,
    },
}

/// Subcommands for `musu room presence`.
#[derive(Subcommand, Debug)]
pub enum RoomPresenceAction {
    /// Publish this local MUSU program's current presence and route candidates.
    Publish(RoomPresencePublishOpts),
    /// List current owner-scoped room presence records.
    List(RoomPresenceListOpts),
}

/// Subcommands for `musu room work-orders`.
#[derive(Subcommand, Debug)]
pub enum RoomWorkOrdersAction {
    /// Claim queued owner-scoped MUSU.PRO work orders without executing them.
    Claim(RoomWorkOrdersClaimOpts),
    /// Claim queued MUSU.PRO work orders and hand them to the local bridge.
    Drain(RoomWorkOrdersDrainOpts),
}

/// Options for `musu relay status`.
#[derive(Args, Debug)]
pub struct RelayStatusOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}

/// Options for `musu relay transport`.
#[derive(Args, Debug)]
pub struct RelayTransportOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}

/// Options for `musu relay leases`.
#[derive(Args, Debug)]
pub struct RelayLeasesOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Maximum leases to return.
    #[arg(long, default_value_t = 20)]
    pub limit: u32,
    /// Filter by rendezvous session id.
    #[arg(long)]
    pub session_id: Option<String>,
    /// Filter by source node id.
    #[arg(long)]
    pub source_node_id: Option<String>,
    /// Filter by target node id.
    #[arg(long)]
    pub target_node_id: Option<String>,
}

/// Options for `musu relay payloads`.
#[derive(Args, Debug)]
pub struct RelayPayloadsOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Maximum payload records to return.
    #[arg(long, default_value_t = 20)]
    pub limit: u32,
    /// Filter by rendezvous session id.
    #[arg(long)]
    pub session_id: Option<String>,
    /// Filter by relay lease id.
    #[arg(long)]
    pub lease_id: Option<String>,
    /// Filter by source node id.
    #[arg(long)]
    pub source_node_id: Option<String>,
    /// Filter by target node id.
    #[arg(long)]
    pub target_node_id: Option<String>,
    /// Filter by the current local node id as target.
    #[arg(long)]
    pub local_target: bool,
    /// Filter by relay tunnel id.
    #[arg(long)]
    pub tunnel_id: Option<String>,
    /// Filter by queue status: queued, claimed, or delivered.
    #[arg(long)]
    pub status: Option<String>,
    /// Include payload bytes in JSON output. Human text output still omits them.
    #[arg(long)]
    pub include_payload: bool,
}

/// Options for `musu relay payload-claim`.
#[derive(Args, Debug)]
pub struct RelayPayloadClaimOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Maximum payload records to claim.
    #[arg(long, default_value_t = 1)]
    pub limit: u32,
    /// Filter by rendezvous session id.
    #[arg(long)]
    pub session_id: Option<String>,
    /// Filter by relay lease id.
    #[arg(long)]
    pub lease_id: Option<String>,
    /// Filter by source node id.
    #[arg(long)]
    pub source_node_id: Option<String>,
    /// Claim payloads for this target node id.
    #[arg(long)]
    pub target_node_id: Option<String>,
    /// Claim payloads for the current local node id.
    #[arg(long)]
    pub local_target: bool,
    /// Filter by relay tunnel id.
    #[arg(long)]
    pub tunnel_id: Option<String>,
    /// Include payload bytes in JSON output. Human text output still omits them.
    #[arg(long)]
    pub include_payload: bool,
}

/// Options for `musu relay payload-deliver`.
#[derive(Args, Debug)]
pub struct RelayPayloadDeliverOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Claimed payload id to acknowledge as delivered.
    pub payload_id: String,
    /// Deliver payload for this target node id.
    #[arg(long)]
    pub target_node_id: Option<String>,
    /// Deliver payload for the current local node id.
    #[arg(long)]
    pub local_target: bool,
}

/// Options for `musu relay route-evidence`.
#[derive(Args, Debug)]
pub struct RelayRouteEvidenceOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Maximum route evidence records to return.
    #[arg(long, default_value_t = 20)]
    pub limit: u32,
    /// Filter by source node id.
    #[arg(long)]
    pub source_node_id: Option<String>,
    /// Filter by target node id.
    #[arg(long)]
    pub target_node_id: Option<String>,
}

/// Options for `musu room presence publish <room-id>`.
#[derive(Args, Debug)]
pub struct RoomPresencePublishOpts {
    /// Room id on musu.pro.
    pub room_id: String,
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Override the local node id.
    #[arg(long)]
    pub node_id: Option<String>,
    /// Override the human-readable node name.
    #[arg(long)]
    pub node_name: Option<String>,
    /// Presence status.
    #[arg(long, default_value = "online")]
    pub status: String,
    /// Company id context.
    #[arg(long)]
    pub company_id: Option<String>,
    /// Project id context.
    #[arg(long)]
    pub project_id: Option<String>,
    /// Source agent id context.
    #[arg(long)]
    pub source_agent_id: Option<String>,
    /// Active work order id. May be repeated.
    #[arg(long = "work-order-id")]
    pub work_order_ids: Vec<String>,
    /// Capability. May be repeated.
    #[arg(long = "capability")]
    pub capabilities: Vec<String>,
    /// Override the advertised bridge URL used to build the route candidate.
    #[arg(long)]
    pub public_url: Option<String>,
    /// Extra advertised route candidate URL. May be repeated.
    #[arg(long = "candidate-url")]
    pub candidate_urls: Vec<String>,
    /// NAT classification for public/direct route candidates.
    #[arg(long)]
    pub nat_type: Option<String>,
    /// Observer that produced the NAT classification, for example `stun:musu.pro`.
    #[arg(long)]
    pub nat_observed_by: Option<String>,
    /// Relay fallback URL advertised for this local node.
    #[arg(long)]
    pub relay_url: Option<String>,
    /// Relay transport protocol: quic_relay_tunnel, quic_tls_1_3, websocket_tunnel, or store_forward_queue.
    #[arg(long)]
    pub relay_protocol: Option<String>,
    /// Mark this node as relay-capable in the room presence record.
    #[arg(long)]
    pub relay_capable: bool,
    /// Origin marker recorded in the room presence record.
    #[arg(long, default_value = "musu.local-program")]
    pub origin: String,
}

/// Options for `musu room presence list <room-id>`.
#[derive(Args, Debug)]
pub struct RoomPresenceListOpts {
    /// Room id on musu.pro.
    pub room_id: String,
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Maximum presence records to return.
    #[arg(long, default_value_t = 20)]
    pub limit: u32,
    /// Company id filter.
    #[arg(long)]
    pub company_id: Option<String>,
    /// Project id filter.
    #[arg(long)]
    pub project_id: Option<String>,
    /// Node id filter.
    #[arg(long)]
    pub node_id: Option<String>,
    /// Source agent id filter.
    #[arg(long)]
    pub source_agent_id: Option<String>,
    /// Presence status filter: online, idle, busy, or offline.
    #[arg(long)]
    pub status: Option<String>,
    /// Include expired presence records.
    #[arg(long)]
    pub include_expired: bool,
}

/// Options for `musu room work-orders claim <room-id>`.
#[derive(Args, Debug)]
pub struct RoomWorkOrdersClaimOpts {
    /// Room id on musu.pro.
    pub room_id: String,
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Maximum queued work orders to claim.
    #[arg(long, default_value_t = 1)]
    pub limit: u32,
    /// Claim work orders targeted to this node id.
    #[arg(long)]
    pub target_node_id: Option<String>,
    /// Claim work orders targeted to the current local node id.
    #[arg(long)]
    pub local_target: bool,
    /// Company id filter.
    #[arg(long)]
    pub company_id: Option<String>,
    /// Project id filter.
    #[arg(long)]
    pub project_id: Option<String>,
    /// Source agent id filter.
    #[arg(long)]
    pub source_agent_id: Option<String>,
    /// Specific work order id to claim.
    #[arg(long)]
    pub work_order_id: Option<String>,
}

/// Options for `musu room work-orders drain <room-id>`.
#[derive(Args, Debug)]
pub struct RoomWorkOrdersDrainOpts {
    /// Room id on musu.pro.
    pub room_id: String,
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Maximum queued work orders to claim and hand to the local bridge.
    #[arg(long, default_value_t = 1)]
    pub limit: u32,
    /// Claim work orders targeted to this node id.
    #[arg(long)]
    pub target_node_id: Option<String>,
    /// Claim work orders targeted to the current local node id.
    #[arg(long)]
    pub local_target: bool,
    /// Company id filter.
    #[arg(long)]
    pub company_id: Option<String>,
    /// Project id filter.
    #[arg(long)]
    pub project_id: Option<String>,
    /// Source agent id filter.
    #[arg(long)]
    pub source_agent_id: Option<String>,
    /// Specific work order id to claim.
    #[arg(long)]
    pub work_order_id: Option<String>,
    /// Override local bridge base URL.
    #[arg(long)]
    pub bridge_url: Option<String>,
}

/// Options for `musu ls peer-name:/path`.
#[derive(Args, Debug)]
pub struct LsOpts {
    /// Remote path: peer-name:/path or peer-name:C:\path.
    pub remote: String,
}

/// Options for `musu get peer-name:/path/to/file`.
#[derive(Args, Debug)]
pub struct GetOpts {
    /// Remote file: peer-name:/path/to/file.
    pub remote: String,
    /// Local destination (default: current directory, original filename).
    #[arg(short, long)]
    pub output: Option<String>,
}

/// Options for `musu put <local> peer-name:/path/to/dest`.
#[derive(Args, Debug)]
pub struct PutOpts {
    /// Local file to upload.
    pub local: String,
    /// Remote destination: peer-name:/path/to/dest.
    pub remote: String,
}

/// Options for `musu doctor`.
#[derive(Args, Debug, Clone)]
pub struct DoctorOpts {
    /// Emit machine-readable JSON for dashboards and install scripts.
    #[arg(long)]
    pub json: bool,
}

/// Options for `musu up`.
#[derive(Args, Debug, Clone)]
pub struct UpOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Open the dashboard URL after the bridge is reachable.
    #[arg(long)]
    pub open_dashboard: bool,
    /// Seconds to wait for bridge health after starting it.
    #[arg(long, default_value_t = 20)]
    pub timeout_sec: u64,
}

/// Options for `musu stop` / `musu down`.
#[derive(Args, Debug, Clone)]
pub struct StopOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Seconds to wait for the registered bridge PID to exit.
    #[arg(long, default_value_t = 5)]
    pub timeout_sec: u64,
    /// Also stop MUSU desktop shell processes (`musu-desktop.exe`).
    #[arg(long)]
    pub include_desktop: bool,
}

/// Options for `musu status`.
#[derive(Args, Debug, Clone)]
pub struct StatusOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}
// ── share / unshare / shares ────────────────────────────────────────────

/// `musu share <path>` — register a directory in `shares.toml`.
pub async fn run_share(opts: ShareOpts) -> Result<()> {
    let home = musu_home();
    std::fs::create_dir_all(&home)?;

    let abs_path = std::fs::canonicalize(&opts.path)
        .map_err(|e| anyhow::anyhow!("cannot resolve '{}': {e}", opts.path))?;

    if !abs_path.is_dir() {
        anyhow::bail!("'{}' is not a directory", abs_path.display());
    }

    let mut config = SharesConfig::load(&home);
    config.add(&abs_path.to_string_lossy(), opts.writable, opts.label);
    config.save(&home)?;

    println!("✓ Shared: {}", abs_path.display());
    if opts.writable {
        println!("  Mode: read/write");
    } else {
        println!("  Mode: read-only");
    }
    println!("  Restart bridge to apply: musu bridge");
    Ok(())
}

/// `musu unshare <path>` — remove a directory from `shares.toml`.
pub async fn run_unshare(opts: UnshareOpts) -> Result<()> {
    let home = musu_home();
    let mut config = SharesConfig::load(&home);

    let abs_path =
        std::fs::canonicalize(&opts.path).unwrap_or_else(|_| std::path::PathBuf::from(&opts.path));

    if config.remove(&abs_path.to_string_lossy()) {
        config.save(&home)?;
        println!("✓ Unshared: {}", abs_path.display());
    } else {
        println!("⚠ Not currently shared: {}", abs_path.display());
    }
    Ok(())
}

/// `musu shares` — list all shared directories.
pub async fn run_shares() -> Result<()> {
    let home = musu_home();
    let config = SharesConfig::load(&home);

    if config.shared.is_empty() {
        println!("No directories currently shared.");
        println!("Use: musu share <path>");
        return Ok(());
    }

    println!("Shared directories:");
    for (i, s) in config.shared.iter().enumerate() {
        let mode = if s.writable { "rw" } else { "ro" };
        let label = s.label.as_deref().unwrap_or("-");
        println!("  {}. {} [{}] ({})", i + 1, s.path, mode, label);
    }
    Ok(())
}

// ── route ───────────────────────────────────────────────────────────────

/// `musu route <text>` — send a task to a peer (or local bridge).
pub async fn run_route(opts: RouteOpts) -> Result<()> {
    if opts.explain || opts.json {
        if opts.route_evidence_path.is_some() {
            anyhow::bail!(
                "--route-evidence-path requires an executing route, not --explain/--json"
            );
        }
        return explain_route(&opts).await;
    }

    let home = musu_home();
    let token = get_token();
    let hints = route_hints_from_opts(&opts);
    let peers = crate::peer::discovery::resolve_all_peers(&home);
    let selected_peer = opts.target.as_ref().and_then(|target| {
        crate::bridge::router::select_peer_for_route(Some(target.as_str()), &hints, &peers)
    });

    let addr = if let Some(ref target) = opts.target {
        if let Some(peer) = selected_peer.as_ref() {
            peer.addr.clone()
        } else {
            find_peer_addr(&home, target.as_str())?
        }
    } else {
        local_bridge_addr()
    };
    let target_node_id = opts
        .target
        .clone()
        .or_else(|| selected_peer.as_ref().and_then(|peer| peer.name.clone()))
        .unwrap_or_else(|| "local".to_string());
    let candidate_addr = addr.clone();

    let route_base_url = route_base_url_for_addr(&addr, selected_peer.as_ref());
    let url = route_delegate_url(&route_base_url);
    let client = reqwest::Client::new();
    let route_started = std::time::Instant::now();
    let handshake_ms: Option<u64>;
    let mut route_result = RouteAttemptEvidenceResult::Failed;
    let mut failure_class: Option<String> = None;
    let transport_proof: Option<RouteTransportProof>;
    let expected_tls_fingerprint = route_expected_tls_fingerprint(selected_peer.as_ref());
    let pinned_client = if let Some(fingerprint) = expected_tls_fingerprint.as_deref() {
        match crate::bridge::tls_pin::fingerprint_pinned_client(fingerprint) {
            Ok(client) => Some(client),
            Err(err) => {
                failure_class = Some("submit_tls_client_build_error".to_string());
                write_route_evidence_if_requested(
                    &opts,
                    &candidate_addr,
                    &target_node_id,
                    None,
                    elapsed_ms(route_started.elapsed()),
                    route_result,
                    failure_class.clone(),
                    None,
                )?;
                return Err(anyhow!("route TLS client error: {err}"));
            }
        }
    } else {
        None
    };
    let request_client = pinned_client.as_ref().unwrap_or(&client);

    println!(
        "→ Sending task to {}...",
        opts.target.as_deref().unwrap_or("local")
    );

    let body = serde_json::json!({
        "channel": opts.channel,
        "sender_id": "cli",
        "text": opts.text,
        "target_node": opts.target,
        "needs_gpu": opts.gpu,
    });

    let submit_started = std::time::Instant::now();
    let resp = match request_client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(resp) => {
            handshake_ms = Some(elapsed_ms(submit_started.elapsed()));
            transport_proof = expected_tls_fingerprint
                .as_deref()
                .map(https_fingerprint_transport_proof);
            resp
        }
        Err(e) => {
            handshake_ms = Some(elapsed_ms(submit_started.elapsed()));
            failure_class = Some("submit_http_error".to_string());
            write_route_evidence_if_requested(
                &opts,
                &candidate_addr,
                &target_node_id,
                handshake_ms,
                elapsed_ms(route_started.elapsed()),
                route_result,
                failure_class.clone(),
                None,
            )?;
            return Err(e.into());
        }
    };

    if resp.status().is_success() {
        let result: serde_json::Value = match resp.json().await {
            Ok(result) => result,
            Err(e) => {
                failure_class = Some("submit_response_parse_error".to_string());
                write_route_evidence_if_requested(
                    &opts,
                    &candidate_addr,
                    &target_node_id,
                    handshake_ms,
                    elapsed_ms(route_started.elapsed()),
                    route_result,
                    failure_class.clone(),
                    transport_proof.clone(),
                )?;
                return Err(e.into());
            }
        };
        let task_id = result["task_id"].as_str().unwrap_or("unknown");
        println!("✓ Task queued: {}", task_id,);
        route_result = RouteAttemptEvidenceResult::Success;

        if opts.wait {
            println!("⏳ Waiting for task {}...", task_id);
            let task_id = task_id.to_string();
            let wait_timeout = route_wait_timeout(opts.wait_timeout_sec);
            let wait_deadline = std::time::Instant::now() + wait_timeout;
            loop {
                let now = std::time::Instant::now();
                if now >= wait_deadline {
                    println!("Task wait timed out after {}s.", wait_timeout.as_secs());
                    route_result = RouteAttemptEvidenceResult::Failed;
                    failure_class = Some("remote_task_wait_timeout".to_string());
                    break;
                }

                let status_url = route_task_status_url(&route_base_url, &task_id);
                let request_timeout =
                    std::time::Duration::from_secs(ROUTE_WAIT_STATUS_REQUEST_TIMEOUT_SECS)
                        .min(wait_deadline.saturating_duration_since(now));
                let status_resp = request_client
                    .get(&status_url)
                    .bearer_auth(&token)
                    .timeout(request_timeout)
                    .send()
                    .await;
                match status_resp {
                    Ok(r) if r.status().is_success() => {
                        let data: serde_json::Value = r.json().await?;
                        let status = data["status"].as_str().unwrap_or("");
                        match status {
                            "done" => {
                                println!("✓ Task completed");
                                if let Some(output) = data["output"].as_str() {
                                    if !output.is_empty() {
                                        println!("{}", output);
                                    }
                                }
                                break;
                            }
                            "failed" => {
                                println!("✗ Task failed");
                                if let Some(err) = data["error"].as_str() {
                                    eprintln!("{}", err);
                                }
                                route_result = RouteAttemptEvidenceResult::Failed;
                                failure_class = Some("remote_task_failed".to_string());
                                break;
                            }
                            "cancelled" => {
                                println!("⚠ Task cancelled");
                                route_result = RouteAttemptEvidenceResult::Failed;
                                failure_class = Some("remote_task_cancelled".to_string());
                                break;
                            }
                            _ => {
                                // still pending/running, continue polling
                            }
                        }
                    }
                    Ok(_) | Err(_) => {
                        // non-success or network error, keep polling
                    }
                }
                let now = std::time::Instant::now();
                if now >= wait_deadline {
                    println!("Task wait timed out after {}s.", wait_timeout.as_secs());
                    route_result = RouteAttemptEvidenceResult::Failed;
                    failure_class = Some("remote_task_wait_timeout".to_string());
                    break;
                }
                let sleep_for = std::time::Duration::from_secs(ROUTE_WAIT_POLL_INTERVAL_SECS)
                    .min(wait_deadline.saturating_duration_since(now));
                tokio::time::sleep(sleep_for).await;
            }
        }
    } else {
        let status = resp.status();
        let body = resp.text().await?;
        println!("✗ Failed ({status}): {body}");
        failure_class = Some(format!("submit_http_status_{status}"));
    }

    write_route_evidence_if_requested(
        &opts,
        &candidate_addr,
        &target_node_id,
        handshake_ms,
        elapsed_ms(route_started.elapsed()),
        route_result,
        failure_class,
        transport_proof,
    )?;
    Ok(())
}

fn route_base_url_for_addr(
    addr: &str,
    peer: Option<&crate::peer::discovery::ResolvedPeer>,
) -> String {
    let trimmed = addr.trim().trim_end_matches('/');
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    let scheme = peer
        .map(|peer| candidate_transport_scheme(&peer.addr, peer.meta.as_ref()))
        .unwrap_or_else(|| "http".to_string());
    format!("{scheme}://{trimmed}")
}

fn route_base_url_for_scheme(addr: &str, scheme: &str) -> String {
    let trimmed = addr.trim().trim_end_matches('/');
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    format!("{scheme}://{trimmed}")
}

fn route_delegate_url(base_url: &str) -> String {
    format!("{}/api/tasks/delegate", base_url.trim_end_matches('/'))
}

fn route_task_status_url(base_url: &str, task_id: &str) -> String {
    format!("{}/api/tasks/{}", base_url.trim_end_matches('/'), task_id)
}

fn route_wait_timeout(timeout_sec: u64) -> std::time::Duration {
    std::time::Duration::from_secs(timeout_sec.clamp(1, ROUTE_WAIT_MAX_TIMEOUT_SECS))
}

fn route_expected_tls_fingerprint(
    peer: Option<&crate::peer::discovery::ResolvedPeer>,
) -> Option<String> {
    let peer = peer?;
    (candidate_transport_scheme(&peer.addr, peer.meta.as_ref()) == "https")
        .then(|| candidate_peer_public_key(peer.meta.as_ref()))
        .flatten()
}

fn write_route_evidence_if_requested(
    opts: &RouteOpts,
    candidate_addr: &str,
    target_node_id: &str,
    handshake_ms: Option<u64>,
    total_attempt_ms: u64,
    result: RouteAttemptEvidenceResult,
    failure_class: Option<String>,
    transport_proof: Option<RouteTransportProof>,
) -> Result<()> {
    let Some(path) = opts.route_evidence_path.as_deref() else {
        return Ok(());
    };
    let peer_identity = transport_proof.as_ref();
    let evidence = build_route_attempt_evidence(RouteAttemptEvidenceInput {
        source_node_id: local_node_id(),
        target_node_id: target_node_id.to_string(),
        session_id: None,
        candidate_addr: candidate_addr.to_string(),
        handshake_ms,
        total_attempt_ms,
        result,
        failure_class,
        note: CLI_ROUTE_EVIDENCE_NOTE,
        peer_identity_verified: peer_identity.is_some(),
        peer_identity_method: peer_identity.map(|proof| proof.peer_identity_method.clone()),
        peer_public_key: peer_identity.map(|proof| proof.peer_public_key.clone()),
        encryption: peer_identity
            .map(|proof| proof.encryption.clone())
            .unwrap_or_else(|| "none_http_bearer".to_string()),
        transport_verified_by: peer_identity.map(|proof| proof.transport_verified_by.clone()),
        relay_fallback: None,
        relay_transport_proof: None,
        relay_payload_delivery_proof: None,
    });
    write_route_attempt_evidence(path, &evidence)?;
    println!("route evidence written: {}", path.display());
    Ok(())
}

#[derive(Debug, Serialize)]
struct RouteExplainReport {
    schema: &'static str,
    version: String,
    requested_target: Option<String>,
    channel: String,
    needs_gpu: bool,
    submission_endpoint: String,
    selected_candidate: Option<RouteCandidateReport>,
    candidate_count: usize,
    current_transport: &'static str,
    bridge_path_selection_wired: bool,
    rendezvous_session_wired: bool,
    https_fingerprint_pinning_wired: bool,
    release_grade_transport_required: &'static str,
    route_evidence_ready: bool,
    release_blockers: Vec<&'static str>,
    path_priority: Vec<&'static str>,
    relay_policy: &'static str,
}

#[derive(Debug, Serialize)]
struct RouteCandidateReport {
    name: Option<String>,
    addr: String,
    source: String,
    route_kind: &'static str,
    transport_scheme: String,
    peer_identity_verified: bool,
    peer_identity_method: Option<String>,
    peer_public_key_present: bool,
    https_fingerprint_pin_available: bool,
    encryption: String,
    payload_transited_musu_infra: bool,
}

async fn explain_route(opts: &RouteOpts) -> Result<()> {
    let home = musu_home();
    let peers = crate::peer::discovery::resolve_all_peers(&home);
    let selected = select_route_candidate(opts, &peers);
    let submission_endpoint = if opts.target.is_some() {
        selected
            .as_ref()
            .map(|p| route_delegate_url(&route_base_url_for_scheme(&p.addr, &p.transport_scheme)))
            .unwrap_or_else(|| format!("{}/api/tasks/delegate", local_bridge_base_url()))
    } else {
        format!("{}/api/tasks/delegate", local_bridge_base_url())
    };

    let current_transport = route_explain_current_transport(selected.as_ref());
    let report = RouteExplainReport {
        schema: "musu.route_explain.v1",
        version: env!("CARGO_PKG_VERSION").to_string(),
        requested_target: opts.target.clone(),
        channel: opts.channel.clone(),
        needs_gpu: opts.gpu,
        submission_endpoint,
        selected_candidate: selected,
        candidate_count: peers.len(),
        current_transport,
        bridge_path_selection_wired: true,
        rendezvous_session_wired: true,
        https_fingerprint_pinning_wired: true,
        release_grade_transport_required: "quic_tls_1_3",
        route_evidence_ready: false,
        release_blockers: vec![
            "peer_identity_verified=false for current manual/local HTTP route",
            "bridge HTTPS fingerprint pinning is not release-grade QUIC/TLS route proof",
            "route evidence is not release-grade until the runtime route attempt records quic_tls_1_3",
            "rendezvous target-candidate-assisted routing still needs real second-PC evidence",
            "relay/tunnel fallback transport is not wired",
        ],
        path_priority: vec!["lan", "tailscale", "direct_quic", "relay"],
        relay_policy:
            "relay is Connect/Pro fallback only; it must not become the default data path",
    };

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU route explanation");
    println!("  submission: {}", report.submission_endpoint);
    println!("  current transport: {}", report.current_transport);
    println!(
        "  bridge path selection wired: {}",
        report.bridge_path_selection_wired
    );
    println!(
        "  rendezvous session wired: {}",
        report.rendezvous_session_wired
    );
    println!(
        "  HTTPS fingerprint pinning wired: {}",
        report.https_fingerprint_pinning_wired
    );
    println!(
        "  release transport required: {}",
        report.release_grade_transport_required
    );
    println!("  release evidence ready: {}", report.route_evidence_ready);
    if let Some(candidate) = &report.selected_candidate {
        println!(
            "  candidate: {} ({})",
            candidate.name.as_deref().unwrap_or(candidate.addr.as_str()),
            candidate.addr
        );
        println!("  route_kind: {}", candidate.route_kind);
        println!("  transport scheme: {}", candidate.transport_scheme);
        println!(
            "  peer identity verified: {}",
            candidate.peer_identity_verified
        );
        if let Some(method) = &candidate.peer_identity_method {
            println!("  peer identity method: {method}");
        }
        println!(
            "  peer public key present: {}",
            candidate.peer_public_key_present
        );
        println!(
            "  HTTPS fingerprint pin available: {}",
            candidate.https_fingerprint_pin_available
        );
        println!("  encryption proof: {}", candidate.encryption);
    } else {
        println!("  candidate: local bridge");
    }
    println!("  path priority: {}", report.path_priority.join(" -> "));
    println!("  blockers:");
    for blocker in &report.release_blockers {
        println!("    - {blocker}");
    }
    Ok(())
}

fn route_hints_from_opts(opts: &RouteOpts) -> crate::bridge::router::RouteHints {
    crate::bridge::router::RouteHints {
        needs_gpu: opts.gpu,
        prefer_os: None,
        prefer_least_busy: false,
    }
}

fn select_route_candidate(
    opts: &RouteOpts,
    peers: &[crate::peer::discovery::ResolvedPeer],
) -> Option<RouteCandidateReport> {
    let hints = route_hints_from_opts(opts);
    crate::bridge::router::select_peer_for_route(opts.target.as_deref(), &hints, peers).map(
        |peer| {
            candidate_report(
                peer.name,
                peer.addr,
                format!("{:?}", peer.source).to_lowercase(),
                peer.meta,
            )
        },
    )
}

fn route_explain_current_transport(candidate: Option<&RouteCandidateReport>) -> &'static str {
    if candidate.is_some_and(|candidate| candidate.https_fingerprint_pin_available) {
        "bridge_https_fingerprint_pin_available"
    } else {
        "http_bearer"
    }
}

fn candidate_report(
    name: Option<String>,
    addr: String,
    source: String,
    meta: Option<serde_json::Value>,
) -> RouteCandidateReport {
    let transport_scheme = candidate_transport_scheme(&addr, meta.as_ref());
    let peer_public_key_present = candidate_peer_public_key(meta.as_ref()).is_some();
    let peer_identity_verified = false;
    let peer_identity_method = candidate_peer_identity_method(meta.as_ref());
    let encryption = candidate_encryption();
    let https_fingerprint_pin_available = transport_scheme == "https" && peer_public_key_present;

    RouteCandidateReport {
        route_kind: crate::bridge::router::route_kind_for_addr(&addr).as_str(),
        name,
        addr,
        source,
        transport_scheme,
        peer_identity_verified,
        peer_identity_method,
        peer_public_key_present,
        https_fingerprint_pin_available,
        encryption,
        payload_transited_musu_infra: false,
    }
}

fn candidate_transport_scheme(addr: &str, meta: Option<&serde_json::Value>) -> String {
    if addr.trim_start().starts_with("https://") {
        return "https".to_string();
    }
    if addr.trim_start().starts_with("http://") {
        return "http".to_string();
    }
    if let Some(scheme) = candidate_meta_string(meta, &["transport_scheme"]) {
        if matches!(scheme.as_str(), "http" | "https") {
            return scheme;
        }
    }
    if let Some(public_url) = candidate_meta_string(meta, &["public_url"]) {
        if let Ok(url) = reqwest::Url::parse(&public_url) {
            if matches!(url.scheme(), "http" | "https") {
                return url.scheme().to_string();
            }
        }
    }
    "http".to_string()
}

fn candidate_peer_public_key(meta: Option<&serde_json::Value>) -> Option<String> {
    candidate_meta_string(meta, &["peer_public_key", "public_key", "cert_fingerprint"])
        .filter(|value| value.starts_with("sha256:"))
}

fn candidate_peer_identity_method(meta: Option<&serde_json::Value>) -> Option<String> {
    candidate_peer_public_key(meta)
        .as_ref()
        .map(|_| "advertised_tls_cert_fingerprint_unverified".to_string())
}

fn candidate_encryption() -> String {
    "none_http_bearer".to_string()
}

fn candidate_meta_string(meta: Option<&serde_json::Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        meta.and_then(|meta| meta.get(*key))
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

/// `musu relay ...` — inspect MUSU-assisted routing state.
pub async fn run_relay(action: RelayAction) -> Result<()> {
    match action {
        RelayAction::Status(opts) => run_relay_status(opts).await,
        RelayAction::Transport(opts) => run_relay_transport(opts).await,
        RelayAction::Leases(opts) => run_relay_leases(opts).await,
        RelayAction::Payloads(opts) => run_relay_payloads(opts).await,
        RelayAction::PayloadClaim(opts) => run_relay_payload_claim(opts).await,
        RelayAction::PayloadDeliver(opts) => run_relay_payload_deliver(opts).await,
        RelayAction::RouteEvidence(opts) => run_relay_route_evidence(opts).await,
    }
}

pub async fn run_room(action: RoomAction) -> Result<()> {
    match action {
        RoomAction::Presence { action } => match action {
            RoomPresenceAction::Publish(opts) => run_room_presence_publish(opts).await,
            RoomPresenceAction::List(opts) => run_room_presence_list(opts).await,
        },
        RoomAction::WorkOrders { action } => match action {
            RoomWorkOrdersAction::Claim(opts) => super::room_work_orders::run_claim(opts).await,
            RoomWorkOrdersAction::Drain(opts) => super::room_work_orders::run_drain(opts).await,
        },
    }
}

#[derive(Debug, Serialize)]
struct RelayStatusReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    cached_registry_present: bool,
    cached_registry_valid: bool,
    cached_node_count: usize,
    rust_client_dtos_wired: bool,
    route_evidence_client_wired: bool,
    bridge_path_selection_wired: bool,
    rendezvous_session_wired: bool,
    https_fingerprint_pinning_wired: bool,
    release_grade_transport_required: &'static str,
    relay_control_plane_lease_wired: bool,
    relay_lease_endpoint: &'static str,
    relay_runtime_fallback_lease_request_wired: bool,
    relay_transport_preflight_ok: bool,
    relay_transport_descriptor_wired: bool,
    relay_transport_wired: bool,
    relay_connect_endpoint_wired: bool,
    relay_payload_endpoint_wired: bool,
    relay_payload_queue_endpoint_wired: bool,
    relay_default_data_path: bool,
    relay_lease_store_configured: bool,
    relay_lease_store_backend: Option<String>,
    relay_lease_store_release_grade: bool,
    relay_transport_blockers: Vec<String>,
    relay_transport_error: Option<String>,
    release_route_evidence_ready: bool,
    path_priority: Vec<&'static str>,
    next_steps: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct RelayLeasesFilters {
    limit: u32,
    session_id: Option<String>,
    source_node_id: Option<String>,
    target_node_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct RelayPayloadsFilters {
    limit: u32,
    session_id: Option<String>,
    lease_id: Option<String>,
    source_node_id: Option<String>,
    target_node_id: Option<String>,
    local_target: bool,
    tunnel_id: Option<String>,
    status: Option<String>,
    include_payload: bool,
}

#[derive(Debug, Serialize)]
struct RelayPayloadClaimFilters {
    limit: u32,
    session_id: Option<String>,
    lease_id: Option<String>,
    source_node_id: Option<String>,
    target_node_id: String,
    local_target: bool,
    tunnel_id: Option<String>,
    include_payload: bool,
}

#[derive(Debug, Serialize)]
struct RelayPayloadDeliverFilters {
    payload_id: String,
    target_node_id: String,
    local_target: bool,
}

#[derive(Debug, Serialize)]
struct RelayTransportReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    ok: bool,
    owner_scope_verified: bool,
    owner_scoped: bool,
    relay_control_plane_wired: bool,
    relay_transport_descriptor_wired: bool,
    relay_transport_wired: bool,
    relay_connect_endpoint_wired: bool,
    relay_payload_endpoint_wired: bool,
    relay_payload_queue_endpoint_wired: bool,
    relay_default_data_path: bool,
    relay_url: String,
    relay_connect_path: String,
    relay_transport_kind: String,
    release_grade_transport_required: String,
    payload_transit_requires_lease: bool,
    policy: String,
    relay_lease_store_configured: bool,
    relay_lease_store_backend: Option<String>,
    relay_lease_store_release_grade: bool,
    blockers: Vec<String>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct RelayLeasesReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    ok: bool,
    owner_scope_verified: bool,
    owner_scoped: bool,
    relay_control_plane_wired: bool,
    relay_transport_wired: bool,
    relay_default_data_path: bool,
    relay_lease_store_configured: bool,
    relay_lease_store_backend: Option<String>,
    relay_lease_store_release_grade: bool,
    count: usize,
    filters: RelayLeasesFilters,
    leases: Vec<crate::cloud::P2pRelayLease>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct RelayPayloadsReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    ok: bool,
    owner_scope_verified: bool,
    owner_scoped: bool,
    relay_payload_queue_endpoint_wired: bool,
    relay_default_data_path: bool,
    release_grade: bool,
    relay_payload_store_configured: bool,
    relay_payload_store_backend: Option<String>,
    relay_payload_store_release_grade: bool,
    count: usize,
    filters: RelayPayloadsFilters,
    payloads: Vec<crate::cloud::P2pRelayPayloadStoredRecord>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct RelayPayloadClaimReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    ok: bool,
    owner_scope_verified: bool,
    owner_scoped: bool,
    accepted: bool,
    claimed: bool,
    relay_payload_queue_endpoint_wired: bool,
    relay_default_data_path: bool,
    release_grade: bool,
    relay_payload_store_configured: bool,
    relay_payload_store_backend: Option<String>,
    relay_payload_store_release_grade: bool,
    count: usize,
    filters: RelayPayloadClaimFilters,
    payloads: Vec<crate::cloud::P2pRelayPayloadStoredRecord>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct RelayPayloadDeliverReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    ok: bool,
    owner_scope_verified: bool,
    owner_scoped: bool,
    accepted: bool,
    delivered: bool,
    relay_default_data_path: bool,
    release_grade: bool,
    relay_payload_store_configured: bool,
    relay_payload_store_backend: Option<String>,
    relay_payload_store_release_grade: bool,
    filters: RelayPayloadDeliverFilters,
    payload: Option<crate::cloud::P2pRelayPayloadStoredRecord>,
    delivery_proof: Option<crate::cloud::RouteRelayPayloadDeliveryProof>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct RelayRouteEvidenceFilters {
    limit: u32,
    route_kind: &'static str,
    result: &'static str,
    release_grade: bool,
    source_node_id: Option<String>,
    target_node_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct RelayRouteEvidenceReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    ok: bool,
    owner_scope_verified: bool,
    owner_scoped: bool,
    relay_transport_proven: bool,
    count: usize,
    filters: RelayRouteEvidenceFilters,
    records: Vec<crate::cloud::RouteEvidenceRecord>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

#[derive(Clone, Debug, Serialize)]
struct RoomPresenceCandidate {
    kind: crate::cloud::RouteKind,
    addr: String,
    scheme: Option<String>,
    public_addr: Option<String>,
    nat_type: Option<crate::cloud::NatType>,
    nat_observed_by: Option<String>,
    relay_url: Option<String>,
    relay_protocol: Option<crate::cloud::RelayProtocol>,
}

#[derive(Debug, Serialize)]
struct RoomPresencePublishReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    room_id: String,
    ok: bool,
    candidate_cache_seeded: bool,
    local_node_id: String,
    local_node_name: String,
    status: String,
    candidate: Option<RoomPresenceCandidate>,
    candidates: Vec<RoomPresenceCandidate>,
    presence: Option<crate::cloud::RoomPresenceRecord>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct RoomPresenceListFilters {
    limit: u32,
    company_id: Option<String>,
    project_id: Option<String>,
    node_id: Option<String>,
    source_agent_id: Option<String>,
    status: Option<String>,
    include_expired: bool,
}

#[derive(Debug, Serialize)]
struct RoomPresenceListReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    room_id: String,
    ok: bool,
    presence_order: String,
    count: usize,
    filters: RoomPresenceListFilters,
    presence: Vec<crate::cloud::RoomPresenceRecord>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

fn json_bool_property(value: &serde_json::Value, name: &str) -> Option<bool> {
    value.get(name).and_then(|property| property.as_bool())
}

fn json_string_property(value: &serde_json::Value, name: &str) -> Option<String> {
    value
        .get(name)
        .and_then(|property| property.as_str())
        .map(str::to_string)
}

fn json_string_array_property(value: &serde_json::Value, name: &str) -> Option<Vec<String>> {
    value.get(name).and_then(|property| {
        property.as_array().map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
    })
}

fn parse_json_object_from_error_text(text: &str) -> Option<serde_json::Value> {
    let start = text.find('{')?;
    serde_json::from_str(&text[start..]).ok()
}

fn relay_payload_status_filter(status: Option<String>) -> Result<Option<String>> {
    let Some(status) = status else {
        return Ok(None);
    };
    let status = status.trim().to_string();
    if matches!(status.as_str(), "queued" | "claimed" | "delivered") {
        Ok(Some(status))
    } else {
        Err(anyhow!(
            "--status must be one of: queued, claimed, delivered"
        ))
    }
}

fn resolve_relay_payload_target(
    target_node_id: Option<&str>,
    local_target: bool,
) -> Result<Option<String>> {
    if !local_target {
        return Ok(target_node_id.map(str::to_string));
    }

    let local = local_node_id();
    if let Some(target_node_id) = target_node_id {
        if target_node_id != local {
            return Err(anyhow!(
                "--local-target conflicts with --target-node-id {}; local node is {}",
                target_node_id,
                local
            ));
        }
    }
    Ok(Some(local))
}

fn relay_payload_target_filter(opts: &RelayPayloadsOpts) -> Result<Option<String>> {
    resolve_relay_payload_target(opts.target_node_id.as_deref(), opts.local_target)
}

fn required_relay_payload_target(
    target_node_id: Option<&str>,
    local_target: bool,
) -> Result<String> {
    resolve_relay_payload_target(target_node_id, local_target)?.ok_or_else(|| {
        anyhow!("target node required; pass --target-node-id <id> or --local-target")
    })
}

fn apply_relay_payload_error_json_to_store_fields(
    relay_payload_store_configured: &mut bool,
    relay_payload_store_backend: &mut Option<String>,
    relay_payload_store_release_grade: &mut bool,
    error_json: &serde_json::Value,
) {
    if let Some(value) = json_bool_property(error_json, "relay_payload_store_configured") {
        *relay_payload_store_configured = value;
    }
    if let Some(value) = json_string_property(error_json, "relay_payload_store_backend") {
        *relay_payload_store_backend = Some(value);
    }
    if let Some(value) = json_bool_property(error_json, "relay_payload_store_release_grade") {
        *relay_payload_store_release_grade = value;
    }
}

fn apply_relay_transport_response_to_status(
    report: &mut RelayStatusReport,
    response: crate::cloud::P2pRelayTransportResponse,
) {
    report.relay_transport_preflight_ok = response.ok;
    report.relay_control_plane_lease_wired = response.relay_control_plane_wired;
    report.relay_transport_descriptor_wired = response.relay_transport_descriptor_wired;
    report.relay_transport_wired = response.relay_transport_wired;
    report.relay_connect_endpoint_wired = response.relay_connect_endpoint_wired;
    report.relay_payload_endpoint_wired = response.relay_payload_endpoint_wired;
    report.relay_payload_queue_endpoint_wired = response.relay_payload_queue_endpoint_wired;
    report.relay_default_data_path = response.relay_default_data_path;
    report.relay_lease_store_configured = response.relay_lease_store_configured;
    report.relay_lease_store_backend = response.relay_lease_store_backend;
    report.relay_lease_store_release_grade = response.relay_lease_store_release_grade;
    report.relay_transport_blockers = response.blockers;
}

fn apply_relay_transport_error_json_to_status(
    report: &mut RelayStatusReport,
    error_json: &serde_json::Value,
) {
    if let Some(value) = json_bool_property(error_json, "relay_control_plane_wired") {
        report.relay_control_plane_lease_wired = value;
    }
    if let Some(value) = json_bool_property(error_json, "relay_transport_descriptor_wired") {
        report.relay_transport_descriptor_wired = value;
    }
    if let Some(value) = json_bool_property(error_json, "relay_transport_wired") {
        report.relay_transport_wired = value;
    }
    if let Some(value) = json_bool_property(error_json, "relay_connect_endpoint_wired") {
        report.relay_connect_endpoint_wired = value;
    }
    if let Some(value) = json_bool_property(error_json, "relay_payload_endpoint_wired") {
        report.relay_payload_endpoint_wired = value;
    }
    if let Some(value) = json_bool_property(error_json, "relay_payload_queue_endpoint_wired") {
        report.relay_payload_queue_endpoint_wired = value;
    }
    if let Some(value) = json_bool_property(error_json, "relay_default_data_path") {
        report.relay_default_data_path = value;
    }
    if let Some(value) = json_bool_property(error_json, "relay_lease_store_configured") {
        report.relay_lease_store_configured = value;
    }
    if let Some(value) = json_string_property(error_json, "relay_lease_store_backend") {
        report.relay_lease_store_backend = Some(value);
    }
    if let Some(value) = json_bool_property(error_json, "relay_lease_store_release_grade") {
        report.relay_lease_store_release_grade = value;
    }
    if let Some(value) = json_string_array_property(error_json, "blockers") {
        report.relay_transport_blockers = value;
    }
}

async fn run_relay_status(opts: RelayStatusOpts) -> Result<()> {
    let home = musu_home();
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());
    let cached_registry = crate::peer::discovery::CachedRegistry::load(&home);
    let cached_node_count = cached_registry
        .as_ref()
        .map(|cache| cache.nodes.len())
        .unwrap_or(0);

    let mut report = RelayStatusReport {
        schema: "musu.relay_status.v1",
        registry_url: crate::cloud::base_url_from_env(),
        logged_in: token.is_some(),
        cached_registry_present: cached_registry.is_some(),
        cached_registry_valid: cached_registry
            .as_ref()
            .map(|cache| cache.is_valid())
            .unwrap_or(false),
        cached_node_count,
        rust_client_dtos_wired: true,
        route_evidence_client_wired: true,
        bridge_path_selection_wired: true,
        rendezvous_session_wired: true,
        https_fingerprint_pinning_wired: true,
        release_grade_transport_required: "quic_tls_1_3",
        relay_control_plane_lease_wired: true,
        relay_lease_endpoint: "/api/v1/p2p/relay/lease",
        relay_runtime_fallback_lease_request_wired: true,
        relay_transport_preflight_ok: false,
        relay_transport_descriptor_wired: false,
        relay_transport_wired: false,
        relay_connect_endpoint_wired: false,
        relay_payload_endpoint_wired: false,
        relay_payload_queue_endpoint_wired: false,
        relay_default_data_path: false,
        relay_lease_store_configured: false,
        relay_lease_store_backend: None,
        relay_lease_store_release_grade: false,
        relay_transport_blockers: vec![],
        relay_transport_error: None,
        release_route_evidence_ready: false,
        path_priority: vec!["lan", "tailscale", "direct_quic", "relay"],
        next_steps: vec![
            "verify rendezvous target-candidate-assisted routing on a real second PC route",
            "verify HTTPS fingerprint pinning on a real second PC route, then replace bridge HTTP/TLS with QUIC/TLS proof",
            "wire relay/tunnel transport behind the Connect/Pro fallback lease policy",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&report.registry_url, Some(token));
        match cloud.query_relay_transport().await {
            Ok(response) => apply_relay_transport_response_to_status(&mut report, response),
            Err(err) => {
                let error = err.to_string();
                if let Some(error_json) = parse_json_object_from_error_text(&error) {
                    apply_relay_transport_error_json_to_status(&mut report, &error_json);
                }
                report.relay_transport_error = Some(error);
            }
        }
    } else {
        report.relay_transport_error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU relay/control-plane status");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!(
        "  cached registry: present={}, valid={}, nodes={}",
        report.cached_registry_present, report.cached_registry_valid, report.cached_node_count
    );
    println!(
        "  Rust rendezvous DTO/client: {}",
        report.rust_client_dtos_wired
    );
    println!(
        "  route evidence client: {}",
        report.route_evidence_client_wired
    );
    println!(
        "  bridge path selection wired: {}",
        report.bridge_path_selection_wired
    );
    println!(
        "  rendezvous session wired: {}",
        report.rendezvous_session_wired
    );
    println!(
        "  HTTPS fingerprint pinning wired: {}",
        report.https_fingerprint_pinning_wired
    );
    println!(
        "  release transport required: {}",
        report.release_grade_transport_required
    );
    println!(
        "  relay lease control-plane: {} ({})",
        report.relay_control_plane_lease_wired, report.relay_lease_endpoint
    );
    println!(
        "  relay runtime fallback lease request wired: {}",
        report.relay_runtime_fallback_lease_request_wired
    );
    println!(
        "  relay transport preflight ok: {}",
        report.relay_transport_preflight_ok
    );
    println!(
        "  relay transport descriptor wired: {}",
        report.relay_transport_descriptor_wired
    );
    println!("  relay transport wired: {}", report.relay_transport_wired);
    println!(
        "  relay connect endpoint wired: {}",
        report.relay_connect_endpoint_wired
    );
    println!(
        "  relay payload endpoint wired: {}",
        report.relay_payload_endpoint_wired
    );
    println!(
        "  relay payload queue endpoint wired: {}",
        report.relay_payload_queue_endpoint_wired
    );
    println!(
        "  relay default data path: {}",
        report.relay_default_data_path
    );
    println!(
        "  relay lease store: configured={}, backend={}, release_grade={}",
        report.relay_lease_store_configured,
        report
            .relay_lease_store_backend
            .as_deref()
            .unwrap_or("unknown"),
        report.relay_lease_store_release_grade
    );
    if !report.relay_transport_blockers.is_empty() {
        println!(
            "  relay transport blockers: {}",
            report.relay_transport_blockers.join(", ")
        );
    }
    if let Some(error) = &report.relay_transport_error {
        println!("  relay transport error: {error}");
    }
    println!(
        "  release route evidence ready: {}",
        report.release_route_evidence_ready
    );
    println!("  path priority: {}", report.path_priority.join(" -> "));
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

async fn run_relay_transport(opts: RelayTransportOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());

    let mut report = RelayTransportReport {
        schema: "musu.relay_transport.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        ok: false,
        owner_scope_verified: false,
        owner_scoped: false,
        relay_control_plane_wired: true,
        relay_transport_descriptor_wired: false,
        relay_transport_wired: false,
        relay_connect_endpoint_wired: false,
        relay_payload_endpoint_wired: false,
        relay_payload_queue_endpoint_wired: false,
        relay_default_data_path: false,
        relay_url: String::new(),
        relay_connect_path: String::new(),
        relay_transport_kind: String::new(),
        release_grade_transport_required: "quic_tls_1_3".to_string(),
        payload_transit_requires_lease: true,
        policy: "connect_pro_fallback_only".to_string(),
        relay_lease_store_configured: false,
        relay_lease_store_backend: None,
        relay_lease_store_release_grade: false,
        blockers: vec![],
        error: None,
        next_steps: vec![
            "keep relay_default_data_path=false; relay must remain a fallback path",
            "verify relay URL, entitlement, and release-grade lease storage before capturing live evidence",
            "record release-grade relay route evidence with actual payload transit before public P2P release",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        match cloud.query_relay_transport().await {
            Ok(response) => {
                report.ok = response.ok;
                report.owner_scope_verified = true;
                report.owner_scoped = response.owner_scoped;
                report.relay_control_plane_wired = response.relay_control_plane_wired;
                report.relay_transport_descriptor_wired = response.relay_transport_descriptor_wired;
                report.relay_transport_wired = response.relay_transport_wired;
                report.relay_connect_endpoint_wired = response.relay_connect_endpoint_wired;
                report.relay_payload_endpoint_wired = response.relay_payload_endpoint_wired;
                report.relay_payload_queue_endpoint_wired =
                    response.relay_payload_queue_endpoint_wired;
                report.relay_default_data_path = response.relay_default_data_path;
                report.relay_url = response.relay_url;
                report.relay_connect_path = response.relay_connect_path;
                report.relay_transport_kind = response.relay_transport_kind;
                report.release_grade_transport_required = response.release_grade_transport_required;
                report.payload_transit_requires_lease = response.payload_transit_requires_lease;
                report.policy = response.policy;
                report.relay_lease_store_configured = response.relay_lease_store_configured;
                report.relay_lease_store_backend = response.relay_lease_store_backend;
                report.relay_lease_store_release_grade = response.relay_lease_store_release_grade;
                report.blockers = response.blockers;
            }
            Err(err) => {
                let error = err.to_string();
                if let Some(error_json) = parse_json_object_from_error_text(&error) {
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_control_plane_wired")
                    {
                        report.relay_control_plane_wired = value;
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_transport_descriptor_wired")
                    {
                        report.relay_transport_descriptor_wired = value;
                    }
                    if let Some(value) = json_bool_property(&error_json, "relay_transport_wired") {
                        report.relay_transport_wired = value;
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_connect_endpoint_wired")
                    {
                        report.relay_connect_endpoint_wired = value;
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_payload_endpoint_wired")
                    {
                        report.relay_payload_endpoint_wired = value;
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_payload_queue_endpoint_wired")
                    {
                        report.relay_payload_queue_endpoint_wired = value;
                    }
                    if let Some(value) = json_bool_property(&error_json, "relay_default_data_path")
                    {
                        report.relay_default_data_path = value;
                    }
                    if let Some(value) = json_string_property(&error_json, "relay_url") {
                        report.relay_url = value;
                    }
                    if let Some(value) = json_string_property(&error_json, "relay_connect_path") {
                        report.relay_connect_path = value;
                    }
                    if let Some(value) = json_string_property(&error_json, "relay_transport_kind") {
                        report.relay_transport_kind = value;
                    }
                    if let Some(value) =
                        json_string_property(&error_json, "release_grade_transport_required")
                    {
                        report.release_grade_transport_required = value;
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "payload_transit_requires_lease")
                    {
                        report.payload_transit_requires_lease = value;
                    }
                    if let Some(value) = json_string_property(&error_json, "policy") {
                        report.policy = value;
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_lease_store_configured")
                    {
                        report.relay_lease_store_configured = value;
                    }
                    if let Some(value) =
                        json_string_property(&error_json, "relay_lease_store_backend")
                    {
                        report.relay_lease_store_backend = Some(value);
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_lease_store_release_grade")
                    {
                        report.relay_lease_store_release_grade = value;
                    }
                }
                report.error = Some(error);
            }
        }
    } else {
        report.error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU relay transport preflight");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  ok: {}", report.ok);
    println!("  owner scope verified: {}", report.owner_scope_verified);
    println!("  owner scoped: {}", report.owner_scoped);
    println!(
        "  relay control-plane wired: {}",
        report.relay_control_plane_wired
    );
    println!(
        "  relay transport descriptor wired: {}",
        report.relay_transport_descriptor_wired
    );
    println!("  relay transport wired: {}", report.relay_transport_wired);
    println!(
        "  relay connect endpoint wired: {}",
        report.relay_connect_endpoint_wired
    );
    println!(
        "  relay payload endpoint wired: {}",
        report.relay_payload_endpoint_wired
    );
    println!(
        "  relay payload queue endpoint wired: {}",
        report.relay_payload_queue_endpoint_wired
    );
    println!(
        "  relay default data path: {}",
        report.relay_default_data_path
    );
    println!("  relay url: {}", report.relay_url);
    println!("  relay connect path: {}", report.relay_connect_path);
    println!("  relay transport kind: {}", report.relay_transport_kind);
    println!(
        "  release transport required: {}",
        report.release_grade_transport_required
    );
    println!(
        "  payload transit requires lease: {}",
        report.payload_transit_requires_lease
    );
    println!(
        "  relay lease store: configured={}, backend={}, release_grade={}",
        report.relay_lease_store_configured,
        report
            .relay_lease_store_backend
            .as_deref()
            .unwrap_or("unknown"),
        report.relay_lease_store_release_grade
    );
    if !report.blockers.is_empty() {
        println!("  blockers: {}", report.blockers.join(", "));
    }
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

async fn run_relay_leases(opts: RelayLeasesOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let filters = RelayLeasesFilters {
        limit: opts.limit.clamp(1, 200),
        session_id: opts.session_id.clone(),
        source_node_id: opts.source_node_id.clone(),
        target_node_id: opts.target_node_id.clone(),
    };
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());

    let mut report = RelayLeasesReport {
        schema: "musu.relay_leases.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        ok: false,
        owner_scope_verified: false,
        owner_scoped: false,
        relay_control_plane_wired: true,
        relay_transport_wired: false,
        relay_default_data_path: false,
        relay_lease_store_configured: false,
        relay_lease_store_backend: None,
        relay_lease_store_release_grade: false,
        count: 0,
        filters,
        leases: vec![],
        error: None,
        next_steps: vec![
            "run a real failed direct route with a logged-in account so relay fallback is evaluated",
            "verify the lease audit record is owner-scoped and tied to the rendezvous session id",
            "keep relay_default_data_path=false until relay/tunnel payload transport is implemented",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        let query = crate::cloud::P2pRelayLeaseQuery {
            limit: Some(report.filters.limit),
            session_id: report.filters.session_id.clone(),
            source_node_id: report.filters.source_node_id.clone(),
            target_node_id: report.filters.target_node_id.clone(),
        };
        match cloud.query_relay_leases(&query).await {
            Ok(response) => {
                report.ok = response.ok;
                report.owner_scope_verified = true;
                report.owner_scoped = response.owner_scoped;
                report.relay_control_plane_wired = response.relay_control_plane_wired;
                report.relay_transport_wired = response.relay_transport_wired;
                report.relay_default_data_path = response.relay_default_data_path;
                report.relay_lease_store_configured = response.relay_lease_store_configured;
                report.relay_lease_store_backend = response.relay_lease_store_backend;
                report.relay_lease_store_release_grade = response.relay_lease_store_release_grade;
                report.count = response.count;
                report.leases = response.leases;
            }
            Err(err) => {
                let error = err.to_string();
                if let Some(error_json) = parse_json_object_from_error_text(&error) {
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_control_plane_wired")
                    {
                        report.relay_control_plane_wired = value;
                    }
                    if let Some(value) = json_bool_property(&error_json, "relay_transport_wired") {
                        report.relay_transport_wired = value;
                    }
                    if let Some(value) = json_bool_property(&error_json, "relay_default_data_path")
                    {
                        report.relay_default_data_path = value;
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_lease_store_configured")
                    {
                        report.relay_lease_store_configured = value;
                    }
                    if let Some(value) =
                        json_string_property(&error_json, "relay_lease_store_backend")
                    {
                        report.relay_lease_store_backend = Some(value);
                    }
                    if let Some(value) =
                        json_bool_property(&error_json, "relay_lease_store_release_grade")
                    {
                        report.relay_lease_store_release_grade = value;
                    }
                }
                report.error = Some(error);
            }
        }
    } else {
        report.error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU relay lease audits");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  ok: {}", report.ok);
    println!("  owner scope verified: {}", report.owner_scope_verified);
    println!("  owner scoped: {}", report.owner_scoped);
    println!(
        "  relay control-plane wired: {}",
        report.relay_control_plane_wired
    );
    println!("  relay transport wired: {}", report.relay_transport_wired);
    println!(
        "  relay default data path: {}",
        report.relay_default_data_path
    );
    println!(
        "  relay lease store: configured={}, backend={}, release_grade={}",
        report.relay_lease_store_configured,
        report
            .relay_lease_store_backend
            .as_deref()
            .unwrap_or("unknown"),
        report.relay_lease_store_release_grade
    );
    println!("  count: {}", report.count);
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    for lease in &report.leases {
        println!(
            "  - {} session={} {} -> {} expires={}",
            lease.lease_id,
            lease.session_id,
            lease.source_node_id,
            lease.target_node_id,
            lease.expires_at
        );
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

async fn run_relay_payloads(opts: RelayPayloadsOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let filters = RelayPayloadsFilters {
        limit: opts.limit.clamp(1, 200),
        session_id: opts.session_id.clone(),
        lease_id: opts.lease_id.clone(),
        source_node_id: opts.source_node_id.clone(),
        target_node_id: relay_payload_target_filter(&opts)?,
        local_target: opts.local_target,
        tunnel_id: opts.tunnel_id.clone(),
        status: relay_payload_status_filter(opts.status.clone())?,
        include_payload: opts.include_payload,
    };
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());

    let mut report = RelayPayloadsReport {
        schema: "musu.relay_payloads.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        ok: false,
        owner_scope_verified: false,
        owner_scoped: false,
        relay_payload_queue_endpoint_wired: true,
        relay_default_data_path: false,
        release_grade: false,
        relay_payload_store_configured: false,
        relay_payload_store_backend: None,
        relay_payload_store_release_grade: false,
        count: 0,
        filters,
        payloads: vec![],
        error: None,
        next_steps: vec![
            "run this on the target node with --local-target --status queued to inspect queued fallback envelopes",
            "keep this as on-demand diagnostics until target-side polling has bounded sleep/backoff/cancellation",
            "claim payloads manually with `musu relay payload-claim --local-target` before wiring execution",
            "decode and execute claimed payloads only after execution safety and relay transport proof are wired",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        let query = crate::cloud::P2pRelayPayloadQuery {
            limit: Some(report.filters.limit),
            session_id: report.filters.session_id.clone(),
            lease_id: report.filters.lease_id.clone(),
            source_node_id: report.filters.source_node_id.clone(),
            target_node_id: report.filters.target_node_id.clone(),
            tunnel_id: report.filters.tunnel_id.clone(),
            status: report.filters.status.clone(),
            include_payload: report.filters.include_payload,
        };
        match cloud.query_relay_payloads(&query).await {
            Ok(response) => {
                report.ok = response.ok;
                report.owner_scope_verified = true;
                report.owner_scoped = response.owner_scoped;
                report.relay_payload_queue_endpoint_wired =
                    response.relay_payload_queue_endpoint_wired;
                report.relay_default_data_path = response.relay_default_data_path;
                report.release_grade = response.release_grade;
                report.relay_payload_store_configured = response.relay_payload_store_configured;
                report.relay_payload_store_backend = Some(response.relay_payload_store_backend);
                report.relay_payload_store_release_grade =
                    response.relay_payload_store_release_grade;
                report.count = response.count;
                report.payloads = response.payloads;
            }
            Err(err) => {
                let error = err.to_string();
                if let Some(error_json) = parse_json_object_from_error_text(&error) {
                    apply_relay_payload_error_json_to_store_fields(
                        &mut report.relay_payload_store_configured,
                        &mut report.relay_payload_store_backend,
                        &mut report.relay_payload_store_release_grade,
                        &error_json,
                    );
                }
                report.error = Some(error);
            }
        }
    } else {
        report.error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU relay payload queue");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  ok: {}", report.ok);
    println!("  owner scope verified: {}", report.owner_scope_verified);
    println!("  owner scoped: {}", report.owner_scoped);
    println!(
        "  relay payload queue endpoint wired: {}",
        report.relay_payload_queue_endpoint_wired
    );
    println!(
        "  relay default data path: {}",
        report.relay_default_data_path
    );
    println!("  release grade: {}", report.release_grade);
    println!(
        "  relay payload store: configured={}, backend={}, release_grade={}",
        report.relay_payload_store_configured,
        report
            .relay_payload_store_backend
            .as_deref()
            .unwrap_or("unknown"),
        report.relay_payload_store_release_grade
    );
    println!("  count: {}", report.count);
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    for payload in &report.payloads {
        println!(
            "  - {} status={} session={} lease={} {} -> {} bytes={} expires={}",
            payload.payload_id,
            payload.status,
            payload.session_id,
            payload.lease_id,
            payload.source_node_id,
            payload.target_node_id,
            payload.payload_bytes,
            payload.expires_at
        );
        if report.filters.include_payload && payload.payload_base64.is_some() {
            println!("    payload_base64: omitted in text output; use --json to print explicitly");
        }
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

async fn run_relay_payload_claim(opts: RelayPayloadClaimOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let target_node_id =
        required_relay_payload_target(opts.target_node_id.as_deref(), opts.local_target)?;
    let filters = RelayPayloadClaimFilters {
        limit: opts.limit.clamp(1, 20),
        session_id: opts.session_id.clone(),
        lease_id: opts.lease_id.clone(),
        source_node_id: opts.source_node_id.clone(),
        target_node_id,
        local_target: opts.local_target,
        tunnel_id: opts.tunnel_id.clone(),
        include_payload: opts.include_payload,
    };
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());

    let mut report = RelayPayloadClaimReport {
        schema: "musu.relay_payload_claim_report.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        ok: false,
        owner_scope_verified: false,
        owner_scoped: false,
        accepted: false,
        claimed: false,
        relay_payload_queue_endpoint_wired: true,
        relay_default_data_path: false,
        release_grade: false,
        relay_payload_store_configured: false,
        relay_payload_store_backend: None,
        relay_payload_store_release_grade: false,
        count: 0,
        filters,
        payloads: vec![],
        error: None,
        next_steps: vec![
            "inspect claimed payloads manually before wiring a bounded target poller",
            "keep claim attempts on demand until sleep/backoff/cancellation and execution safety are implemented",
            "mark successfully handled payloads with `musu relay payload-deliver <payload-id> --local-target`",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        let claim = crate::cloud::P2pRelayPayloadClaimRequest {
            schema: "musu.relay_payload_claim.v1".to_string(),
            target_node_id: report.filters.target_node_id.clone(),
            claimant_node_id: Some(report.filters.target_node_id.clone()),
            limit: Some(report.filters.limit),
            session_id: report.filters.session_id.clone(),
            lease_id: report.filters.lease_id.clone(),
            source_node_id: report.filters.source_node_id.clone(),
            tunnel_id: report.filters.tunnel_id.clone(),
            include_payload: report.filters.include_payload,
        };
        match cloud.claim_relay_payloads(&claim).await {
            Ok(response) => {
                report.ok = response.ok;
                report.owner_scope_verified = true;
                report.owner_scoped = response.owner_scoped;
                report.accepted = response.accepted;
                report.claimed = response.claimed;
                report.relay_payload_queue_endpoint_wired =
                    response.relay_payload_queue_endpoint_wired;
                report.relay_default_data_path = response.relay_default_data_path;
                report.release_grade = response.release_grade;
                report.relay_payload_store_configured = response.relay_payload_store_configured;
                report.relay_payload_store_backend = Some(response.relay_payload_store_backend);
                report.relay_payload_store_release_grade =
                    response.relay_payload_store_release_grade;
                report.count = response.count;
                report.payloads = response.payloads;
            }
            Err(err) => {
                let error = err.to_string();
                if let Some(error_json) = parse_json_object_from_error_text(&error) {
                    apply_relay_payload_error_json_to_store_fields(
                        &mut report.relay_payload_store_configured,
                        &mut report.relay_payload_store_backend,
                        &mut report.relay_payload_store_release_grade,
                        &error_json,
                    );
                }
                report.error = Some(error);
            }
        }
    } else {
        report.error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU relay payload claim");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  ok: {}", report.ok);
    println!("  owner scope verified: {}", report.owner_scope_verified);
    println!("  owner scoped: {}", report.owner_scoped);
    println!("  accepted: {}", report.accepted);
    println!("  claimed: {}", report.claimed);
    println!(
        "  relay payload queue endpoint wired: {}",
        report.relay_payload_queue_endpoint_wired
    );
    println!(
        "  relay default data path: {}",
        report.relay_default_data_path
    );
    println!("  release grade: {}", report.release_grade);
    println!(
        "  relay payload store: configured={}, backend={}, release_grade={}",
        report.relay_payload_store_configured,
        report
            .relay_payload_store_backend
            .as_deref()
            .unwrap_or("unknown"),
        report.relay_payload_store_release_grade
    );
    println!("  count: {}", report.count);
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    for payload in &report.payloads {
        println!(
            "  - {} status={} session={} lease={} {} -> {} bytes={} claimed_by={} expires={}",
            payload.payload_id,
            payload.status,
            payload.session_id,
            payload.lease_id,
            payload.source_node_id,
            payload.target_node_id,
            payload.payload_bytes,
            payload.claimed_by.as_deref().unwrap_or("unknown"),
            payload.expires_at
        );
        if report.filters.include_payload && payload.payload_base64.is_some() {
            println!("    payload_base64: omitted in text output; use --json to print explicitly");
        }
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

async fn run_relay_payload_deliver(opts: RelayPayloadDeliverOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let target_node_id =
        required_relay_payload_target(opts.target_node_id.as_deref(), opts.local_target)?;
    let filters = RelayPayloadDeliverFilters {
        payload_id: opts.payload_id.clone(),
        target_node_id,
        local_target: opts.local_target,
    };
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());

    let mut report = RelayPayloadDeliverReport {
        schema: "musu.relay_payload_delivery_report.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        ok: false,
        owner_scope_verified: false,
        owner_scoped: false,
        accepted: false,
        delivered: false,
        relay_default_data_path: false,
        release_grade: false,
        relay_payload_store_configured: false,
        relay_payload_store_backend: None,
        relay_payload_store_release_grade: false,
        filters,
        payload: None,
        delivery_proof: None,
        error: None,
        next_steps: vec![
            "delivery only acknowledges a claimed payload; it does not prove QUIC/TLS relay transport",
            "record release-grade relay transport proof only after actual payload transit is implemented",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        let delivery = crate::cloud::P2pRelayPayloadDeliveryRequest {
            schema: "musu.relay_payload_delivery.v1".to_string(),
            payload_id: report.filters.payload_id.clone(),
            target_node_id: report.filters.target_node_id.clone(),
        };
        match cloud.mark_relay_payload_delivered(&delivery).await {
            Ok(response) => {
                report.ok = response.ok;
                report.owner_scope_verified = true;
                report.owner_scoped = response.owner_scoped;
                report.accepted = response.accepted;
                report.delivered = response.delivered;
                report.relay_default_data_path = response.relay_default_data_path;
                report.release_grade = response.release_grade;
                report.relay_payload_store_configured = response.relay_payload_store_configured;
                report.relay_payload_store_backend = Some(response.relay_payload_store_backend);
                report.relay_payload_store_release_grade =
                    response.relay_payload_store_release_grade;
                report.delivery_proof = response.delivery_proof;
                report.payload = response.payload;
            }
            Err(err) => {
                let error = err.to_string();
                if let Some(error_json) = parse_json_object_from_error_text(&error) {
                    apply_relay_payload_error_json_to_store_fields(
                        &mut report.relay_payload_store_configured,
                        &mut report.relay_payload_store_backend,
                        &mut report.relay_payload_store_release_grade,
                        &error_json,
                    );
                }
                report.error = Some(error);
            }
        }
    } else {
        report.error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU relay payload delivery");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  ok: {}", report.ok);
    println!("  owner scope verified: {}", report.owner_scope_verified);
    println!("  owner scoped: {}", report.owner_scoped);
    println!("  accepted: {}", report.accepted);
    println!("  delivered: {}", report.delivered);
    println!(
        "  relay default data path: {}",
        report.relay_default_data_path
    );
    println!("  release grade: {}", report.release_grade);
    println!(
        "  relay payload store: configured={}, backend={}, release_grade={}",
        report.relay_payload_store_configured,
        report
            .relay_payload_store_backend
            .as_deref()
            .unwrap_or("unknown"),
        report.relay_payload_store_release_grade
    );
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    if let Some(payload) = &report.payload {
        println!(
            "  payload: {} status={} session={} lease={} {} -> {} delivered_at={}",
            payload.payload_id,
            payload.status,
            payload.session_id,
            payload.lease_id,
            payload.source_node_id,
            payload.target_node_id,
            payload.delivered_at.as_deref().unwrap_or("unknown")
        );
    }
    if let Some(proof) = &report.delivery_proof {
        println!(
            "  delivery proof: {} session={} lease={} tunnel={} bytes={} delivered_at={}",
            proof.payload_id,
            proof.session_id,
            proof.lease_id,
            proof.tunnel_id,
            proof.payload_bytes,
            proof.delivered_at
        );
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

async fn run_relay_route_evidence(opts: RelayRouteEvidenceOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let filters = RelayRouteEvidenceFilters {
        limit: opts.limit.clamp(1, 200),
        route_kind: "relay",
        result: "success",
        release_grade: true,
        source_node_id: opts.source_node_id.clone(),
        target_node_id: opts.target_node_id.clone(),
    };
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());

    let mut report = RelayRouteEvidenceReport {
        schema: "musu.relay_route_evidence.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        ok: false,
        owner_scope_verified: false,
        owner_scoped: false,
        relay_transport_proven: false,
        count: 0,
        filters,
        records: vec![],
        error: None,
        next_steps: vec![
            "run a real relay fallback route after direct path failure",
            "record release-grade route evidence with route_kind=relay and payload_transited_musu_infra=true",
            "verify the relay route evidence query is owner-scoped before public P2P release",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        let query = crate::cloud::RouteEvidenceQuery {
            limit: Some(report.filters.limit),
            source_node_id: report.filters.source_node_id.clone(),
            target_node_id: report.filters.target_node_id.clone(),
            route_kind: Some(crate::cloud::RouteKind::Relay),
            result: Some(crate::cloud::RouteAttemptResult::Success),
            release_grade: Some(true),
        };
        match cloud.query_route_evidence(&query).await {
            Ok(response) => {
                report.owner_scope_verified = true;
                report.owner_scoped = response.owner_scoped;
                report.count = response.count;
                report.records = response.records;
                report.relay_transport_proven =
                    report.owner_scoped && report.count > 0 && !report.records.is_empty();
                report.ok = response.ok && report.relay_transport_proven;
            }
            Err(err) => {
                report.error = Some(err.to_string());
            }
        }
    } else {
        report.error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU relay route evidence");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  ok: {}", report.ok);
    println!("  owner scope verified: {}", report.owner_scope_verified);
    println!("  owner scoped: {}", report.owner_scoped);
    println!(
        "  relay transport proven: {}",
        report.relay_transport_proven
    );
    println!("  count: {}", report.count);
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    for record in &report.records {
        println!(
            "  - {} {} -> {} received={} release_grade={}",
            record.id,
            record.evidence.source_node_id,
            record.evidence.target_node_id,
            record.received_at,
            record.release_grade
        );
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

fn parse_room_presence_status(value: &str) -> Result<crate::cloud::RoomPresenceStatus> {
    match value.trim().to_ascii_lowercase().as_str() {
        "online" => Ok(crate::cloud::RoomPresenceStatus::Online),
        "idle" => Ok(crate::cloud::RoomPresenceStatus::Idle),
        "busy" => Ok(crate::cloud::RoomPresenceStatus::Busy),
        "offline" => Ok(crate::cloud::RoomPresenceStatus::Offline),
        _ => Err(anyhow!(
            "room presence status must be one of: online, idle, busy, offline"
        )),
    }
}

fn room_presence_status_label(status: &crate::cloud::RoomPresenceStatus) -> &'static str {
    match status {
        crate::cloud::RoomPresenceStatus::Online => "online",
        crate::cloud::RoomPresenceStatus::Idle => "idle",
        crate::cloud::RoomPresenceStatus::Busy => "busy",
        crate::cloud::RoomPresenceStatus::Offline => "offline",
    }
}

fn cloud_route_kind_for_addr(addr: &str) -> crate::cloud::RouteKind {
    match crate::bridge::router::route_kind_for_addr(addr) {
        crate::bridge::router::RoutePathKind::Local | crate::bridge::router::RoutePathKind::Lan => {
            crate::cloud::RouteKind::Lan
        }
        crate::bridge::router::RoutePathKind::Tailscale => crate::cloud::RouteKind::Tailscale,
        crate::bridge::router::RoutePathKind::DirectQuic => crate::cloud::RouteKind::DirectQuic,
    }
}

fn endpoint_scheme_from_url(value: &str) -> Option<String> {
    reqwest::Url::parse(value.trim().trim_end_matches('/'))
        .ok()
        .and_then(|url| match url.scheme() {
            "http" | "https" => Some(url.scheme().to_string()),
            "ws" => Some("http".to_string()),
            "wss" => Some("https".to_string()),
            _ => None,
        })
}

fn parse_candidate_nat_type(value: Option<&str>) -> Result<Option<crate::cloud::NatType>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let normalized = value.to_ascii_lowercase().replace('-', "_");
    match normalized.as_str() {
        "unknown" => Ok(Some(crate::cloud::NatType::Unknown)),
        "open" | "open_internet" => Ok(Some(crate::cloud::NatType::OpenInternet)),
        "full_cone" => Ok(Some(crate::cloud::NatType::FullCone)),
        "restricted_cone" => Ok(Some(crate::cloud::NatType::RestrictedCone)),
        "port_restricted_cone" => Ok(Some(crate::cloud::NatType::PortRestrictedCone)),
        "symmetric" => Ok(Some(crate::cloud::NatType::Symmetric)),
        _ => Err(anyhow!(
            "candidate nat type must be one of: unknown, open_internet, full_cone, restricted_cone, port_restricted_cone, symmetric"
        )),
    }
}

fn parse_relay_protocol(value: Option<&str>) -> Result<Option<crate::cloud::RelayProtocol>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let normalized = value.to_ascii_lowercase().replace('-', "_");
    match normalized.as_str() {
        "quic_relay_tunnel" => Ok(Some(crate::cloud::RelayProtocol::QuicRelayTunnel)),
        "quic_tls_1_3" | "quic_tls13" => Ok(Some(crate::cloud::RelayProtocol::QuicTls13)),
        "websocket" | "websocket_tunnel" => Ok(Some(crate::cloud::RelayProtocol::WebsocketTunnel)),
        "store_forward" | "store_forward_queue" => {
            Ok(Some(crate::cloud::RelayProtocol::StoreForwardQueue))
        }
        _ => Err(anyhow!(
            "relay protocol must be one of: quic_relay_tunnel, quic_tls_1_3, websocket_tunnel, store_forward_queue"
        )),
    }
}

fn room_presence_candidate_endpoint_from_url(
    value: &str,
    observed_at: &str,
    nat_type: Option<&crate::cloud::NatType>,
    nat_observed_by: Option<&str>,
) -> Option<crate::cloud::CandidateEndpoint> {
    let addr = crate::bridge::rendezvous::endpoint_addr_from_url(value);
    if addr.trim().is_empty() {
        return None;
    }
    let scheme = endpoint_scheme_from_url(value);
    let kind = cloud_route_kind_for_addr(&addr);
    let is_direct = matches!(kind, crate::cloud::RouteKind::DirectQuic);
    Some(crate::cloud::CandidateEndpoint {
        kind,
        addr: addr.clone(),
        observed_at: observed_at.to_string(),
        scheme,
        public_addr: is_direct.then(|| addr.clone()),
        nat_type: if is_direct { nat_type.cloned() } else { None },
        nat_observed_by: if is_direct {
            nat_observed_by.map(str::to_string)
        } else {
            None
        },
        relay_url: None,
        relay_protocol: None,
    })
}

fn room_presence_relay_candidate_endpoint_from_url(
    value: &str,
    protocol: crate::cloud::RelayProtocol,
    observed_at: &str,
) -> Option<crate::cloud::CandidateEndpoint> {
    let relay_url = value.trim().trim_end_matches('/').to_string();
    if relay_url.is_empty() {
        return None;
    }
    let addr = crate::bridge::rendezvous::endpoint_addr_from_url(&relay_url);
    if addr.trim().is_empty() {
        return None;
    }
    Some(crate::cloud::CandidateEndpoint {
        kind: crate::cloud::RouteKind::Relay,
        addr,
        observed_at: observed_at.to_string(),
        scheme: endpoint_scheme_from_url(&relay_url),
        public_addr: None,
        nat_type: None,
        nat_observed_by: None,
        relay_url: Some(relay_url),
        relay_protocol: Some(protocol),
    })
}

fn room_presence_report_candidate(
    candidate: &crate::cloud::CandidateEndpoint,
) -> RoomPresenceCandidate {
    RoomPresenceCandidate {
        kind: candidate.kind.clone(),
        addr: candidate.addr.clone(),
        scheme: candidate.scheme.clone(),
        public_addr: candidate.public_addr.clone(),
        nat_type: candidate.nat_type.clone(),
        nat_observed_by: candidate.nat_observed_by.clone(),
        relay_url: candidate.relay_url.clone(),
        relay_protocol: candidate.relay_protocol.clone(),
    }
}

fn local_room_public_key() -> Option<String> {
    crate::install::tls::default_cert_fingerprint(&musu_home())
        .ok()
        .flatten()
        .filter(|value| !value.trim().is_empty())
}

fn room_presence_request_from_opts(
    opts: &RoomPresencePublishOpts,
) -> Result<(
    crate::cloud::RoomPresenceRequest,
    Vec<RoomPresenceCandidate>,
)> {
    let status = parse_room_presence_status(&opts.status)?;
    let node_id = opts.node_id.clone().unwrap_or_else(local_node_id);
    let node_name = opts.node_name.clone().unwrap_or_else(|| node_id.clone());
    let public_url = opts
        .public_url
        .clone()
        .unwrap_or_else(resolve_public_bridge_url);
    let nat_type = parse_candidate_nat_type(opts.nat_type.as_deref())?;
    let nat_observed_by = opts
        .nat_observed_by
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let relay_url = opts
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let relay_protocol = parse_relay_protocol(opts.relay_protocol.as_deref())?;
    if opts.relay_protocol.is_some() && relay_url.is_none() {
        return Err(anyhow!("relay protocol requires --relay-url"));
    }
    let mut capabilities = if opts.capabilities.is_empty() {
        vec!["bridge_http_forward".to_string()]
    } else {
        opts.capabilities.clone()
    };
    capabilities.sort();
    capabilities.dedup();

    let observed_at = chrono::Utc::now().to_rfc3339();
    let mut candidate_urls = vec![public_url];
    candidate_urls.extend(opts.candidate_urls.iter().cloned());
    let mut candidate_endpoints = Vec::new();
    for candidate_url in candidate_urls {
        if let Some(candidate) = room_presence_candidate_endpoint_from_url(
            &candidate_url,
            &observed_at,
            nat_type.as_ref(),
            nat_observed_by,
        ) {
            candidate_endpoints.push(candidate);
        }
    }
    if let Some(relay_url) = relay_url {
        let protocol = relay_protocol.unwrap_or(crate::cloud::RelayProtocol::QuicRelayTunnel);
        if let Some(candidate) =
            room_presence_relay_candidate_endpoint_from_url(relay_url, protocol, &observed_at)
        {
            candidate_endpoints.push(candidate);
        }
    }

    let report_candidates = candidate_endpoints
        .iter()
        .map(room_presence_report_candidate)
        .collect::<Vec<_>>();

    let request = crate::cloud::RoomPresenceRequest {
        node_id,
        node_name: Some(node_name),
        app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
        status: Some(status),
        company_id: opts.company_id.clone(),
        project_id: opts.project_id.clone(),
        source_agent_id: opts.source_agent_id.clone(),
        active_work_order_ids: opts.work_order_ids.clone(),
        candidate_endpoints,
        relay_capable: opts.relay_capable || relay_url.is_some(),
        public_key: local_room_public_key(),
        capabilities,
        origin: Some(opts.origin.clone()),
    };

    Ok((request, report_candidates))
}

async fn run_room_presence_publish(opts: RoomPresencePublishOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());
    let (request, candidates) = room_presence_request_from_opts(&opts)?;
    let candidate = candidates.first().cloned();
    let mut report = RoomPresencePublishReport {
        schema: "musu.room_presence_publish.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        room_id: opts.room_id.clone(),
        ok: false,
        candidate_cache_seeded: false,
        local_node_id: request.node_id.clone(),
        local_node_name: request
            .node_name
            .clone()
            .unwrap_or_else(|| request.node_id.clone()),
        status: request
            .status
            .as_ref()
            .map(room_presence_status_label)
            .unwrap_or("online")
            .to_string(),
        candidate,
        candidates,
        presence: None,
        error: None,
        next_steps: vec![
            "run this on each participating local MUSU program for the same room id",
            "use `musu room presence list <room-id>` to confirm both nodes are visible before rendezvous",
            "keep presence publishing on demand until a bounded heartbeat loop with sleep/backoff/cancellation is wired",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        match cloud.publish_room_presence(&opts.room_id, &request).await {
            Ok(response) => {
                report.ok = response.ok;
                report.candidate_cache_seeded = response.candidate_cache_seeded;
                report.presence = Some(response.presence);
            }
            Err(err) => {
                report.error = Some(err.to_string());
            }
        }
    } else {
        report.error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU room presence publish");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  room: {}", report.room_id);
    println!("  ok: {}", report.ok);
    println!(
        "  node: {} ({})",
        report.local_node_id, report.local_node_name
    );
    println!("  status: {}", report.status);
    if let Some(candidate) = &report.candidate {
        println!(
            "  candidate: {:?} {} scheme={}",
            candidate.kind,
            candidate.addr,
            candidate.scheme.as_deref().unwrap_or("unknown")
        );
    }
    println!(
        "  candidate cache seeded: {}",
        report.candidate_cache_seeded
    );
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

async fn run_room_presence_list(opts: RoomPresenceListOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let token = crate::cloud::token::load_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());
    let status = opts
        .status
        .as_deref()
        .map(parse_room_presence_status)
        .transpose()?;
    let filters = RoomPresenceListFilters {
        limit: opts.limit.clamp(1, 200),
        company_id: opts.company_id.clone(),
        project_id: opts.project_id.clone(),
        node_id: opts.node_id.clone(),
        source_agent_id: opts.source_agent_id.clone(),
        status: status
            .as_ref()
            .map(room_presence_status_label)
            .map(str::to_string),
        include_expired: opts.include_expired,
    };
    let query = crate::cloud::RoomPresenceQuery {
        limit: Some(filters.limit),
        company_id: filters.company_id.clone(),
        project_id: filters.project_id.clone(),
        node_id: filters.node_id.clone(),
        source_agent_id: filters.source_agent_id.clone(),
        status,
        include_expired: filters.include_expired,
    };
    let mut report = RoomPresenceListReport {
        schema: "musu.room_presence_list.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        room_id: opts.room_id.clone(),
        ok: false,
        presence_order: "last_seen_desc".to_string(),
        count: 0,
        filters,
        presence: vec![],
        error: None,
        next_steps: vec![
            "confirm all expected local MUSU programs have fresh non-expired presence",
            "start a room-scoped rendezvous only after source and target presence include route candidates",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        match cloud.query_room_presence(&opts.room_id, &query).await {
            Ok(response) => {
                report.ok = response.ok;
                report.presence_order = response.presence_order;
                report.count = response.count;
                report.presence = response.presence;
            }
            Err(err) => {
                report.error = Some(err.to_string());
            }
        }
    } else {
        report.error = Some("not_logged_in".to_string());
    }

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("MUSU room presence");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  room: {}", report.room_id);
    println!("  ok: {}", report.ok);
    println!("  count: {}", report.count);
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    for presence in &report.presence {
        println!(
            "  - {} status={:?} app={} candidates={} expires={}",
            presence.node_id,
            presence.status,
            presence.app_version,
            presence.candidate_endpoints.len(),
            presence.expires_at
        );
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

// ── ls / get / put ──────────────────────────────────────────────────────

/// `musu ls peer-name:/path` — list files on a remote peer.
pub async fn run_ls(opts: LsOpts) -> Result<()> {
    let home = musu_home();
    let token = get_token();
    let (peer_name, path) = parse_remote(&opts.remote)?;
    let addr = find_peer_addr(&home, &peer_name)?;

    let url = format!(
        "http://{addr}/api/files?path={}",
        urlencoding::encode(&path)
    );
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }

    let listing: serde_json::Value = resp.json().await?;
    let entries = listing["entries"].as_array();

    if let Some(entries) = entries {
        println!("{peer_name}:{path} ({} items)", entries.len());
        println!();
        for entry in entries {
            let is_dir = entry["is_dir"].as_bool().unwrap_or(false);
            let name = entry["name"].as_str().unwrap_or("?");
            let size = entry["size"].as_u64().unwrap_or(0);

            if is_dir {
                println!("  📁 {name}/");
            } else {
                let size_str = format_size(size);
                println!("  📄 {name} ({size_str})");
            }
        }
    }
    Ok(())
}

/// `musu get peer-name:/path/to/file` — download a file from a peer.
pub async fn run_get(opts: GetOpts) -> Result<()> {
    let home = musu_home();
    let token = get_token();
    let (peer_name, path) = parse_remote(&opts.remote)?;
    let addr = find_peer_addr(&home, &peer_name)?;

    let url = format!(
        "http://{addr}/api/files/read?path={}",
        urlencoding::encode(&path)
    );
    let client = reqwest::Client::new();

    println!("→ Downloading {peer_name}:{path}...");

    let resp = client.get(&url).bearer_auth(&token).send().await?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }

    let filename = std::path::Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let dest = opts.output.unwrap_or(filename);

    let bytes = resp.bytes().await?;
    std::fs::write(&dest, &bytes)?;
    println!("✓ Saved: {dest} ({})", format_size(bytes.len() as u64));
    Ok(())
}

/// `musu put local-file peer-name:/path/to/dest` — upload a file to a peer.
pub async fn run_put(opts: PutOpts) -> Result<()> {
    let home = musu_home();
    let token = get_token();
    let (peer_name, path) = parse_remote(&opts.remote)?;
    let addr = find_peer_addr(&home, &peer_name)?;

    let data = std::fs::read(&opts.local)
        .map_err(|e| anyhow::anyhow!("cannot read '{}': {e}", opts.local))?;
    let size = data.len();

    let url = format!(
        "http://{addr}/api/files/write?path={}",
        urlencoding::encode(&path)
    );
    let client = reqwest::Client::new();

    println!("→ Uploading {} to {peer_name}:{path}...", opts.local);

    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .body(data)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await?;

    if resp.status().is_success() {
        println!("✓ Uploaded: {path} ({})", format_size(size as u64));
    } else {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }
    Ok(())
}

// ── helpers ─────────────────────────────────────────────────────────────

/// Parse `"peer-name:/path"` or `"peer-name:C:\path"` into `(peer, path)`.
///
/// Windows drive letters are handled: the first colon separates the peer
/// name from the remote path, and a second colon (e.g. `C:\`) is left
/// as part of the path.
fn parse_remote(remote: &str) -> Result<(String, String)> {
    let colon_pos = remote.find(':').ok_or_else(|| {
        anyhow::anyhow!(
            "invalid remote format '{remote}'. Use: peer-name:/path or peer-name:C:\\path"
        )
    })?;

    let peer = &remote[..colon_pos];
    let path = &remote[colon_pos + 1..];

    if peer.is_empty() {
        anyhow::bail!("missing peer name in '{remote}'");
    }
    Ok((peer.to_string(), path.to_string()))
}

/// Resolve a peer's bridge address from `nodes.toml` or `manual_peers.toml`.
fn find_peer_addr(home: &std::path::Path, peer_name: &str) -> Result<String> {
    // Try nodes.toml first.
    let nodes_path = home.join("nodes.toml");
    if nodes_path.exists() {
        let data = std::fs::read_to_string(&nodes_path)?;
        let parsed: toml::Value = toml::from_str(&data)?;
        if let Some(nodes) = parsed.get("nodes").and_then(|n| n.as_table()) {
            if let Some(node) = nodes.get(peer_name).and_then(|n| n.as_table()) {
                if let Some(url) = node.get("url").and_then(|u| u.as_str()) {
                    let addr = url
                        .trim_start_matches("http://")
                        .trim_start_matches("https://")
                        .trim_end_matches('/');
                    return Ok(addr.to_string());
                }
            }
        }
    }

    // Fallback: manual_peers.toml.
    let manual_path = home.join("manual_peers.toml");
    if manual_path.exists() {
        let data = std::fs::read_to_string(&manual_path)?;
        let parsed: toml::Value = toml::from_str(&data)?;
        if let Some(peers) = parsed.get("peers").and_then(|p| p.as_array()) {
            for peer in peers {
                if let Some(name) = peer.get("name").and_then(|n| n.as_str()) {
                    if name == peer_name {
                        if let Some(addr) = peer.get("addr").and_then(|a| a.as_str()) {
                            return Ok(addr.to_string());
                        }
                    }
                }
            }
        }
    }

    anyhow::bail!(
        "peer '{peer_name}' not found. Use: musu peer add --addr <ip:port> --name {peer_name}"
    )
}

/// Read the bridge/peer token from env.
fn get_token() -> String {
    if let Ok(token) = std::env::var("MUSU_BRIDGE_TOKEN") {
        if !token.trim().is_empty() {
            return token;
        }
    }
    if let Ok(token) = std::env::var("MUSU_TOKEN") {
        if !token.trim().is_empty() {
            return token;
        }
    }
    crate::install::token::read_bridge_token(&musu_home()).unwrap_or_default()
}

fn local_bridge_addr() -> String {
    crate::bridge::services::local_bridge_addr(&musu_home())
}

fn local_bridge_base_url() -> String {
    crate::bridge::services::local_bridge_http_url(&musu_home())
}

fn resolve_public_bridge_url() -> String {
    crate::bridge::services::resolve_public_bridge_url(&musu_home())
}

// ── doctor ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum DoctorLevel {
    Ok,
    Warn,
    Fail,
}

impl DoctorLevel {
    fn label(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Warn => "warn",
            Self::Fail => "fail",
        }
    }
}

#[derive(Debug, Serialize)]
struct DoctorReport {
    overall: DoctorLevel,
    generated_at: String,
    version: &'static str,
    distribution: String,
    home: DoctorHome,
    binary: DoctorBinary,
    account: DoctorAccount,
    bridge: DoctorBridge,
    dashboard: DoctorDashboard,
    package: DoctorPackage,
    background: DoctorBackground,
    next_steps: Vec<String>,
}

#[derive(Debug, Serialize)]
struct DoctorHome {
    status: DoctorLevel,
    path: String,
    exists: bool,
    note: String,
}

#[derive(Debug, Serialize)]
struct DoctorBinary {
    status: DoctorLevel,
    current_exe: Option<String>,
    installed_binary: String,
    installed_binary_exists: bool,
    bin_dir_on_path: bool,
    first_path_musu: Option<String>,
    windowsapps_alias: Option<String>,
    alias_shadowed_by: Option<String>,
    note: String,
}

#[derive(Debug, Serialize)]
struct DoctorAccount {
    status: DoctorLevel,
    logged_in: bool,
    account_token_present: bool,
    bridge_token_present: bool,
    note: String,
}

#[derive(Debug, Serialize)]
struct DoctorBridge {
    status: DoctorLevel,
    local_url: String,
    service_registry_addr: Option<String>,
    service_registry_pid: Option<u32>,
    public_url: String,
    public_url_valid: bool,
    health_http_status: Option<u16>,
    health_body: Option<serde_json::Value>,
    error: Option<String>,
    note: String,
}

#[derive(Debug, Serialize)]
struct DoctorDashboard {
    status: DoctorLevel,
    dev_url: String,
    start_url: String,
    reachable_url: Option<String>,
    required: bool,
    note: String,
}

#[derive(Debug, Serialize)]
struct DoctorPackage {
    status: DoctorLevel,
    distribution: String,
    package_status_command: String,
    note: String,
}

#[derive(Debug, Serialize)]
struct DoctorBackground {
    status: DoctorLevel,
    mdns: DoctorBackgroundFeature,
    mdns_ipv6: DoctorBackgroundFeature,
    mdns_tailscale: DoctorBackgroundFeature,
    mdns_virtual_interfaces: DoctorBackgroundFeature,
    clipboard_sync: DoctorBackgroundFeature,
    cloud_registration: DoctorBackgroundFeature,
    cloud_heartbeat_interval_sec: u64,
    cloud_heartbeat_floor_sec: u64,
    file_sync: DoctorBackgroundFeature,
    file_serve_root_count: usize,
    file_serve_writable: bool,
    relay_payload_poller: DoctorBackgroundFeature,
    relay_payload_poller_interval_sec: u64,
    relay_payload_poller_interval_floor_sec: u64,
    relay_payload_poller_empty_backoff_max_sec: u64,
    relay_payload_poller_empty_backoff_ceiling_sec: u64,
    relay_payload_poller_limit: u32,
    planner: DoctorBackgroundFeature,
    planner_interval_sec: u64,
    planner_interval_floor_sec: u64,
    planner_command_timeout_sec: u64,
    planner_command_timeout_floor_sec: u64,
    planner_command_timeout_ceiling_sec: u64,
    note: String,
}

#[derive(Debug, Serialize)]
struct DoctorBackgroundFeature {
    enabled: bool,
    env_var: Option<&'static str>,
    note: String,
}

#[derive(Debug, Serialize)]
struct UpReport {
    ok: bool,
    token_created: bool,
    stale_bridge_registry_removed: bool,
    stale_bridge_registry_pid: Option<u32>,
    bridge_started: bool,
    bridge_pid: Option<u32>,
    terminated_unhealthy_bridge_pid: Option<u32>,
    bridge_log_path: String,
    bridge: DoctorBridge,
    dashboard: DoctorDashboard,
    dashboard_open_attempted: bool,
    dashboard_open_error: Option<String>,
    next_steps: Vec<String>,
}

#[derive(Debug, Serialize)]
struct StopReport {
    schema: &'static str,
    ok: bool,
    home: String,
    bridge_addr: Option<String>,
    bridge_pid: Option<u32>,
    registry_record_present: bool,
    pid_alive_before: bool,
    pid_is_musu_runtime: Option<bool>,
    terminate_attempted: bool,
    terminate_requested: bool,
    pid_alive_after: bool,
    registry_deregistered: bool,
    include_desktop: bool,
    desktop_cleanup_attempted: bool,
    desktop_pids_before: Vec<u32>,
    desktop_terminate_requested_pids: Vec<u32>,
    desktop_pids_after: Vec<u32>,
    desktop_errors: Vec<String>,
    error: Option<String>,
    next_steps: Vec<String>,
}

/// `musu doctor` — diagnose install, login, bridge, dashboard, and package state.
pub async fn run_doctor(opts: DoctorOpts) -> Result<()> {
    let home = musu_home();
    let home_exists = home.exists();
    let home_status = if home_exists {
        DoctorLevel::Ok
    } else {
        DoctorLevel::Warn
    };
    let home_check = DoctorHome {
        status: home_status,
        path: home.display().to_string(),
        exists: home_exists,
        note: if home_exists {
            "MUSU home exists.".into()
        } else {
            "MUSU home does not exist yet. Run `musu install` or start the bridge once.".into()
        },
    };

    let bin_dir = home.join("bin");
    let installed_binary = bin_dir.join(crate::install::musu_binary_name());
    let installed_binary_exists = installed_binary.exists();
    let current_exe = std::env::current_exe().ok();
    let bin_dir_on_path = path_contains_dir(&bin_dir);
    let first_path_musu = find_first_binary_on_path(crate::install::musu_binary_name());
    let windowsapps_alias = windowsapps_alias_path();
    let alias_shadowed_by = match (&windowsapps_alias, &first_path_musu) {
        (Some(alias), Some(first)) if !paths_equivalent(alias, first) => {
            Some(first.display().to_string())
        }
        _ => None,
    };
    let binary_status = if alias_shadowed_by.is_some() {
        DoctorLevel::Warn
    } else if installed_binary_exists || current_exe.is_some() {
        if bin_dir_on_path
            || crate::install::distribution::DistributionMode::current().is_store_msix()
        {
            DoctorLevel::Ok
        } else {
            DoctorLevel::Warn
        }
    } else {
        DoctorLevel::Fail
    };
    let binary_check = DoctorBinary {
        status: binary_status,
        current_exe: current_exe.as_ref().map(|p| p.display().to_string()),
        installed_binary: installed_binary.display().to_string(),
        installed_binary_exists,
        bin_dir_on_path,
        first_path_musu: first_path_musu.as_ref().map(|p| p.display().to_string()),
        windowsapps_alias: windowsapps_alias.as_ref().map(|p| p.display().to_string()),
        alias_shadowed_by: alias_shadowed_by.clone(),
        note: match binary_status {
            DoctorLevel::Ok => "CLI binary is discoverable.".into(),
            DoctorLevel::Warn if alias_shadowed_by.is_some() => {
                "WindowsApps package alias is shadowed by another musu.exe earlier on PATH.".into()
            }
            DoctorLevel::Warn => {
                "CLI binary exists, but ~/.musu/bin is not on PATH for this shell.".into()
            }
            DoctorLevel::Fail => "Cannot locate a MUSU CLI binary.".into(),
        },
    };

    let account_token = crate::cloud::token::load_token(&home);
    let bridge_token = get_token();
    let account_token_present = account_token
        .as_deref()
        .is_some_and(|t| !t.trim().is_empty());
    let bridge_token_present = !bridge_token.trim().is_empty();
    let account_status = match (account_token_present, bridge_token_present) {
        (true, true) => DoctorLevel::Ok,
        (true, false) | (false, true) => DoctorLevel::Warn,
        (false, false) => DoctorLevel::Fail,
    };
    let account_check = DoctorAccount {
        status: account_status,
        logged_in: account_token_present,
        account_token_present,
        bridge_token_present,
        note: match account_status {
            DoctorLevel::Ok => "Account token and local bridge token are present.".into(),
            DoctorLevel::Warn => {
                "Partial auth state: either account login or local bridge token is missing.".into()
            }
            DoctorLevel::Fail => "No account token or bridge token found. Run `musu login`.".into(),
        },
    };

    let distribution_mode = crate::install::distribution::DistributionMode::current();
    let distribution = distribution_mode.as_str().to_string();
    let bridge_check = check_bridge(&home).await;
    let dashboard_check = check_dashboard(distribution_mode).await;
    let background_check = check_background_features(&home, account_token_present);
    let package_status = if cfg!(windows) {
        DoctorLevel::Ok
    } else {
        DoctorLevel::Warn
    };
    let package_check = DoctorPackage {
        status: package_status,
        distribution: distribution.clone(),
        package_status_command: "musu package-status".into(),
        note: if cfg!(windows) {
            "Run `musu package-status` for Windows package identity and startup-task details."
                .into()
        } else {
            "Package startup-task diagnostics are Windows/MSIX specific.".into()
        },
    };

    let mut levels = vec![
        home_check.status,
        binary_check.status,
        account_check.status,
        bridge_check.status,
        dashboard_check.status,
        background_check.status,
    ];
    if cfg!(windows) {
        levels.push(package_check.status);
    }
    let overall = summarize_levels(&levels);

    let next_steps = next_steps_for(
        &account_check,
        bridge_check.status,
        dashboard_check.status,
        dashboard_check.required,
        bridge_check.public_url_valid,
    );

    let report = DoctorReport {
        overall,
        generated_at: chrono::Utc::now().to_rfc3339(),
        version: env!("CARGO_PKG_VERSION"),
        distribution,
        home: home_check,
        binary: binary_check,
        account: account_check,
        bridge: bridge_check,
        dashboard: dashboard_check,
        package: package_check,
        background: background_check,
        next_steps,
    };

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_doctor_report(&report);
    }
    Ok(())
}

/// `musu up` — first-run helper. Ensures a bridge token exists, starts the
/// bridge if needed, waits for health, and prints the dashboard handoff.
pub async fn run_up(opts: UpOpts) -> Result<()> {
    let home = musu_home();
    std::fs::create_dir_all(&home)?;

    let had_token = crate::install::token::read_bridge_token(&home).is_some();
    let _token = crate::install::token::ensure_bridge_token(&home)?;
    let token_created = !had_token;

    let registry = crate::bridge::services::ServiceRegistry::with_dir(home.join("services"));
    let stale_bridge_registry_pid = registry
        .discover("bridge")
        .and_then(|record| record.pid)
        .filter(|pid| {
            let alive = crate::bridge::services::is_pid_alive(*pid);
            if !alive {
                tracing::warn!(pid, "removing stale bridge registry before startup");
            }
            !alive
        });
    if stale_bridge_registry_pid.is_some() {
        registry.cleanup_stale();
    }
    let stale_bridge_registry_removed =
        stale_bridge_registry_pid.is_some() && registry.discover("bridge").is_none();

    let mut bridge = check_bridge(&home).await;
    let bridge_log_path = home.join("logs").join("bridge.log");
    let mut bridge_started = false;
    let mut bridge_pid = None;
    let mut terminated_unhealthy_bridge_pid = None;

    if !bridge_reachable(&bridge) {
        if let Some(pid) = bridge.service_registry_pid {
            if crate::bridge::services::is_pid_alive(pid) {
                let registered_pid_is_musu_runtime =
                    crate::bridge::services::is_musu_runtime_pid(pid);
                if registered_pid_is_musu_runtime {
                    tracing::warn!(
                        pid,
                        error = ?bridge.error,
                        "terminating unhealthy registered bridge before restart"
                    );
                } else {
                    tracing::warn!(
                        pid,
                        error = ?bridge.error,
                        "registered bridge pid is alive but is not a MUSU runtime process; leaving it untouched"
                    );
                }
                if registered_pid_is_musu_runtime {
                    if crate::bridge::services::terminate_pid(pid) {
                        terminated_unhealthy_bridge_pid = Some(pid);
                        for _ in 0..10 {
                            if !crate::bridge::services::is_pid_alive(pid) {
                                break;
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                        }
                    } else {
                        tracing::warn!(pid, "failed to terminate unhealthy registered bridge");
                    }
                }
            }
        }
        let child = spawn_bridge_process(&home, &bridge_log_path)?;
        bridge_started = true;
        bridge_pid = Some(child.id());
        bridge = wait_for_bridge(&home, std::time::Duration::from_secs(opts.timeout_sec)).await;
    }

    let distribution = crate::install::distribution::DistributionMode::current();
    let dashboard = check_dashboard(distribution).await;
    let mut dashboard_open_error = None;
    if opts.open_dashboard {
        if let Some(url) = dashboard
            .reachable_url
            .as_deref()
            .or_else(|| dashboard.required.then_some(dashboard.dev_url.as_str()))
        {
            if let Err(err) = open_url(url) {
                dashboard_open_error = Some(err.to_string());
            }
        } else {
            dashboard_open_error =
                Some("No local dashboard URL is required for the packaged local runtime.".into());
        }
    }

    let ok = bridge_reachable(&bridge);
    let mut next_steps = Vec::new();
    if !bridge_reachable(&bridge) {
        next_steps.push(format!(
            "Bridge did not become healthy within {}s. Check {}.",
            opts.timeout_sec,
            bridge_log_path.display()
        ));
    }
    if dashboard.required && dashboard.status != DoctorLevel::Ok {
        next_steps
            .push("Start the dashboard from `musu-bee`: `npm run dev` or `npm start`.".into());
    }
    if next_steps.is_empty() {
        if dashboard.reachable_url.is_some() {
            next_steps.push("Open the dashboard and run a first agent task.".into());
        } else {
            next_steps.push("Local runtime is ready. Use MUSU.PRO remote input or `musu route --wait <task>` to run work on this device.".into());
        }
    }

    let report = UpReport {
        ok,
        token_created,
        stale_bridge_registry_removed,
        stale_bridge_registry_pid,
        bridge_started,
        bridge_pid,
        terminated_unhealthy_bridge_pid,
        bridge_log_path: bridge_log_path.display().to_string(),
        bridge,
        dashboard,
        dashboard_open_attempted: opts.open_dashboard,
        dashboard_open_error,
        next_steps,
    };

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_up_report(&report);
    }
    Ok(())
}

/// `musu stop` / `musu down` — stop the registered local bridge runtime.
pub async fn run_stop(opts: StopOpts) -> Result<()> {
    let home = musu_home();
    let registry = crate::bridge::services::ServiceRegistry::with_dir(home.join("services"));
    let record = registry.discover("bridge");
    let bridge_addr = record.as_ref().and_then(|record| {
        if matches!(record.transport, crate::bridge::services::Transport::Tcp) {
            Some(crate::bridge::services::normalize_loopback_addr(
                &record.addr,
            ))
        } else {
            None
        }
    });
    let bridge_pid = record.as_ref().and_then(|record| record.pid);

    let mut pid_alive_before = false;
    let mut pid_is_musu_runtime = None;
    let mut terminate_attempted = false;
    let mut terminate_requested = false;
    let mut pid_alive_after = false;
    let mut registry_deregistered = false;
    let mut error = None;
    let mut next_steps = Vec::new();
    let mut desktop_cleanup_attempted = false;
    let mut desktop_pids_before = Vec::new();
    let mut desktop_terminate_requested_pids = Vec::new();
    let mut desktop_pids_after = Vec::new();
    let mut desktop_errors = Vec::new();

    match bridge_pid {
        Some(pid) => {
            pid_alive_before = crate::bridge::services::is_pid_alive(pid);
            if pid_alive_before {
                let is_runtime = crate::bridge::services::is_musu_runtime_pid(pid);
                pid_is_musu_runtime = Some(is_runtime);
                if is_runtime {
                    terminate_attempted = true;
                    terminate_requested = crate::bridge::services::terminate_pid(pid);
                    if terminate_requested {
                        wait_for_pid_exit(pid, std::time::Duration::from_secs(opts.timeout_sec))
                            .await;
                    }
                    pid_alive_after = crate::bridge::services::is_pid_alive(pid);
                    if pid_alive_after {
                        error = Some(format!(
                            "registered bridge PID {pid} did not exit within {}s",
                            opts.timeout_sec
                        ));
                        next_steps.push(
                            "Run `musu doctor --json` and inspect bridge.service_registry_pid."
                                .into(),
                        );
                    } else {
                        registry.deregister("bridge")?;
                        registry_deregistered = true;
                        next_steps.push("Local bridge runtime stopped.".into());
                    }
                } else {
                    pid_alive_after = true;
                    error = Some(format!(
                        "registered bridge PID {pid} is alive but is not a MUSU runtime process"
                    ));
                    next_steps.push(
                        "Registry was left intact to avoid terminating an unrelated process."
                            .into(),
                    );
                }
            } else {
                registry.deregister("bridge")?;
                registry_deregistered = true;
                next_steps.push("Removed stale bridge registry record.".into());
            }
        }
        None => {
            if record.is_some() {
                error = Some("bridge registry record has no PID; cannot stop it safely".into());
                next_steps.push(
                    "Remove the stale bridge registry only after confirming no bridge is running."
                        .into(),
                );
            } else {
                next_steps.push("No registered local bridge runtime found.".into());
            }
        }
    }

    if opts.include_desktop {
        desktop_cleanup_attempted = true;
        desktop_pids_before = crate::bridge::services::musu_desktop_pids();
        for pid in &desktop_pids_before {
            if !crate::bridge::services::is_pid_alive(*pid) {
                continue;
            }
            if crate::bridge::services::terminate_pid(*pid) {
                desktop_terminate_requested_pids.push(*pid);
            } else {
                desktop_errors.push(format!("failed to request desktop PID {pid} termination"));
            }
        }

        if !desktop_terminate_requested_pids.is_empty() {
            wait_for_pids_exit(
                &desktop_terminate_requested_pids,
                std::time::Duration::from_secs(opts.timeout_sec),
            )
            .await;
        }

        desktop_pids_after = crate::bridge::services::musu_desktop_pids();
        if !desktop_pids_after.is_empty() {
            desktop_errors.push(format!(
                "desktop PID(s) still alive after cleanup: {}",
                desktop_pids_after
                    .iter()
                    .map(|pid| pid.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }

        if desktop_errors.is_empty() {
            if desktop_pids_before.is_empty() {
                next_steps.push("No MUSU desktop shell processes found.".into());
            } else {
                next_steps.push(format!(
                    "Stopped {} MUSU desktop shell process(es).",
                    desktop_terminate_requested_pids.len()
                ));
            }
        } else {
            next_steps.push(
                "Inspect remaining `musu-desktop` processes before recording release evidence."
                    .into(),
            );
        }
    }

    if error.is_none() && !desktop_errors.is_empty() {
        error = Some(desktop_errors.join("; "));
    }

    let ok = error.is_none();
    let report = StopReport {
        schema: "musu.stop_report.v1",
        ok,
        home: home.display().to_string(),
        bridge_addr,
        bridge_pid,
        registry_record_present: record.is_some(),
        pid_alive_before,
        pid_is_musu_runtime,
        terminate_attempted,
        terminate_requested,
        pid_alive_after,
        registry_deregistered,
        include_desktop: opts.include_desktop,
        desktop_cleanup_attempted,
        desktop_pids_before,
        desktop_terminate_requested_pids,
        desktop_pids_after,
        desktop_errors,
        error,
        next_steps,
    };

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_stop_report(&report);
    }

    if report.ok {
        Ok(())
    } else {
        anyhow::bail!(
            "{}",
            report
                .error
                .as_deref()
                .unwrap_or("failed to stop local bridge runtime")
        )
    }
}

async fn check_bridge(home: &std::path::Path) -> DoctorBridge {
    let local_url = crate::bridge::services::local_bridge_http_url(home);
    let registry = crate::bridge::services::ServiceRegistry::with_dir(home.join("services"));
    let service_registry_record = registry.discover("bridge");
    let service_registry_addr = service_registry_record.as_ref().and_then(|record| {
        if matches!(record.transport, crate::bridge::services::Transport::Tcp) {
            Some(crate::bridge::services::normalize_loopback_addr(
                &record.addr,
            ))
        } else {
            None
        }
    });
    let service_registry_pid = service_registry_record
        .as_ref()
        .and_then(|record| record.pid);
    let public_url = crate::bridge::services::resolve_public_bridge_url(home);
    let public_url_valid = is_http_url(&public_url);

    let client = reqwest::Client::new();
    match client
        .get(format!("{}/health", local_url.trim_end_matches('/')))
        .timeout(std::time::Duration::from_secs(BRIDGE_HEALTH_TIMEOUT_SECS))
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            let health_http_status = Some(status.as_u16());
            let health_body = resp.json::<serde_json::Value>().await.ok();
            let level = if status.is_success() {
                if public_url_valid {
                    DoctorLevel::Ok
                } else {
                    DoctorLevel::Warn
                }
            } else {
                DoctorLevel::Fail
            };
            DoctorBridge {
                status: level,
                local_url,
                service_registry_addr,
                service_registry_pid,
                public_url,
                public_url_valid,
                health_http_status,
                health_body,
                error: None,
                note: match level {
                    DoctorLevel::Ok => "Local bridge is reachable.".into(),
                    DoctorLevel::Warn => {
                        "Local bridge is reachable, but public URL is not a valid http/https URL."
                            .into()
                    }
                    DoctorLevel::Fail => "Bridge health endpoint returned an error status.".into(),
                },
            }
        }
        Err(err) => DoctorBridge {
            status: DoctorLevel::Fail,
            local_url,
            service_registry_addr,
            service_registry_pid,
            public_url,
            public_url_valid,
            health_http_status: None,
            health_body: None,
            error: Some(err.to_string()),
            note: "Local bridge is not reachable. Start it with `musu bridge`.".into(),
        },
    }
}

async fn check_dashboard(
    distribution: crate::install::distribution::DistributionMode,
) -> DoctorDashboard {
    let candidates = [
        ("http://127.0.0.1:3000/app", "dev"),
        ("http://127.0.0.1:3001/app", "start"),
    ];
    let client = reqwest::Client::new();
    for (url, _) in candidates {
        if let Ok(resp) = client
            .get(url)
            .timeout(std::time::Duration::from_secs(1))
            .send()
            .await
        {
            if resp.status().is_success() || resp.status().is_redirection() {
                return DoctorDashboard {
                    status: DoctorLevel::Ok,
                    dev_url: "http://127.0.0.1:3000/app".into(),
                    start_url: "http://127.0.0.1:3001/app".into(),
                    reachable_url: Some(url.into()),
                    required: !distribution.is_store_msix(),
                    note: "Dashboard is reachable.".into(),
                };
            }
        }
    }

    if distribution.is_store_msix() {
        return DoctorDashboard {
            status: DoctorLevel::Ok,
            dev_url: String::new(),
            start_url: String::new(),
            reachable_url: None,
            required: false,
            note: "Packaged local runtime does not require a workspace dashboard; web input should arrive through MUSU.PRO or another connected operator surface.".into(),
        };
    }

    DoctorDashboard {
        status: DoctorLevel::Warn,
        dev_url: "http://127.0.0.1:3000/app".into(),
        start_url: "http://127.0.0.1:3001/app".into(),
        reachable_url: None,
        required: true,
        note: "Dashboard is not reachable from this shell. Start `musu-bee` with `npm run dev` or `npm start`.".into(),
    }
}

fn check_background_features(
    home: &std::path::Path,
    account_token_present: bool,
) -> DoctorBackground {
    const CLOUD_HEARTBEAT_FLOOR_SEC: u64 = 60;

    let mdns_enabled = env_truthy("MUSU_ENABLE_MDNS");
    let mdns_ipv6_enabled = env_truthy("MUSU_MDNS_ENABLE_IPV6");
    let mdns_tailscale_enabled = env_truthy("MUSU_MDNS_ENABLE_TAILSCALE");
    let mdns_virtual_enabled = env_truthy("MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES");
    let clipboard_enabled = env_truthy("MUSU_ENABLE_CLIPBOARD_SYNC");
    let relay_payload_poller_enabled = env_truthy("MUSU_ENABLE_RELAY_PAYLOAD_POLLER");
    let relay_payload_poller_interval_sec =
        crate::bridge::handlers::relay_payload::normalize_relay_payload_poller_interval_sec(
            std::env::var("MUSU_RELAY_PAYLOAD_POLLER_INTERVAL_SEC")
                .ok()
                .as_deref(),
        );
    let relay_payload_poller_empty_backoff_max_sec =
        crate::bridge::handlers::relay_payload::normalize_relay_payload_poller_empty_backoff_max_sec(
            std::env::var("MUSU_RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_SEC")
                .ok()
                .as_deref(),
            relay_payload_poller_interval_sec,
        );
    let relay_payload_poller_limit =
        crate::bridge::handlers::relay_payload::normalize_relay_payload_poller_limit(
            std::env::var("MUSU_RELAY_PAYLOAD_POLLER_LIMIT")
                .ok()
                .as_deref(),
        );
    let planner_enabled = env_truthy("MUSU_ENABLE_PLANNER");
    let planner_interval_sec = crate::brain::planner::normalize_planner_interval_sec(
        std::env::var("MUSU_PLANNER_INTERVAL_SEC").ok().as_deref(),
    );
    let planner_command_timeout_sec = crate::brain::planner::normalize_planner_command_timeout_sec(
        std::env::var("MUSU_PLANNER_COMMAND_TIMEOUT_SEC")
            .ok()
            .as_deref(),
    );
    let cloud_heartbeat_interval_sec = std::env::var("MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(300)
        .max(CLOUD_HEARTBEAT_FLOOR_SEC);

    let (file_serve_root_count, file_serve_writable) = background_file_sync_state(home);
    let file_sync_enabled = file_serve_root_count > 0;

    let hot_opt_ins = [
        mdns_enabled,
        mdns_ipv6_enabled,
        mdns_tailscale_enabled,
        mdns_virtual_enabled,
        clipboard_enabled,
        file_sync_enabled,
        relay_payload_poller_enabled,
        planner_enabled,
    ]
    .into_iter()
    .filter(|enabled| *enabled)
    .count();

    let status = if hot_opt_ins == 0 {
        DoctorLevel::Ok
    } else {
        DoctorLevel::Warn
    };

    DoctorBackground {
        status,
        mdns: DoctorBackgroundFeature {
            enabled: mdns_enabled,
            env_var: Some("MUSU_ENABLE_MDNS"),
            note: if mdns_enabled {
                "mDNS LAN discovery is enabled; keep disabled for idle CPU evidence unless testing discovery.".into()
            } else {
                "mDNS LAN discovery is off by default.".into()
            },
        },
        mdns_ipv6: DoctorBackgroundFeature {
            enabled: mdns_ipv6_enabled,
            env_var: Some("MUSU_MDNS_ENABLE_IPV6"),
            note: if mdns_ipv6_enabled {
                "IPv6 mDNS is enabled; Windows VPN/Tailscale link-local paths can be noisy.".into()
            } else {
                "IPv6 mDNS is off by default.".into()
            },
        },
        mdns_tailscale: DoctorBackgroundFeature {
            enabled: mdns_tailscale_enabled,
            env_var: Some("MUSU_MDNS_ENABLE_TAILSCALE"),
            note: if mdns_tailscale_enabled {
                "Tailscale mDNS is enabled; use only when explicitly validating this path.".into()
            } else {
                "Tailscale mDNS is off by default.".into()
            },
        },
        mdns_virtual_interfaces: DoctorBackgroundFeature {
            enabled: mdns_virtual_enabled,
            env_var: Some("MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES"),
            note: if mdns_virtual_enabled {
                "VPN/virtual mDNS interfaces are enabled; this can expand multicast work.".into()
            } else {
                "VPN/virtual mDNS interfaces are filtered by default.".into()
            },
        },
        clipboard_sync: DoctorBackgroundFeature {
            enabled: clipboard_enabled,
            env_var: Some("MUSU_ENABLE_CLIPBOARD_SYNC"),
            note: if clipboard_enabled {
                "Clipboard polling is enabled; keep disabled for Store-candidate idle evidence unless explicitly testing sync.".into()
            } else {
                "Clipboard polling is off by default.".into()
            },
        },
        cloud_registration: DoctorBackgroundFeature {
            enabled: account_token_present,
            env_var: None,
            note: if account_token_present {
                "musu.pro registration uses a low-duty heartbeat with backoff and jitter.".into()
            } else {
                "musu.pro registration is disabled until account login.".into()
            },
        },
        cloud_heartbeat_interval_sec,
        cloud_heartbeat_floor_sec: CLOUD_HEARTBEAT_FLOOR_SEC,
        file_sync: DoctorBackgroundFeature {
            enabled: file_sync_enabled,
            env_var: Some("MUSU_FILE_SERVE_ROOTS"),
            note: if file_sync_enabled {
                format!(
                    "File watcher/sync will start for {file_serve_root_count} shared root(s) when the bridge runs."
                )
            } else {
                "File watcher/sync is disabled because no shared roots are configured.".into()
            },
        },
        file_serve_root_count,
        file_serve_writable,
        relay_payload_poller: DoctorBackgroundFeature {
            enabled: relay_payload_poller_enabled,
            env_var: Some("MUSU_ENABLE_RELAY_PAYLOAD_POLLER"),
            note: if relay_payload_poller_enabled {
                format!(
                    "Relay payload target polling is enabled at a bounded {relay_payload_poller_interval_sec}s interval, limit {relay_payload_poller_limit}, with empty/failure backoff capped at {relay_payload_poller_empty_backoff_max_sec}s."
                )
            } else {
                "Relay payload target polling is off by default; manual drain remains request-driven.".into()
            },
        },
        relay_payload_poller_interval_sec,
        relay_payload_poller_interval_floor_sec:
            crate::bridge::handlers::relay_payload::RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC,
        relay_payload_poller_empty_backoff_max_sec,
        relay_payload_poller_empty_backoff_ceiling_sec:
            crate::bridge::handlers::relay_payload::RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_CEILING_SEC,
        relay_payload_poller_limit,
        planner: DoctorBackgroundFeature {
            enabled: planner_enabled,
            env_var: Some("MUSU_ENABLE_PLANNER"),
            note: if planner_enabled {
                format!(
                    "Autonomous planner loop is enabled at a bounded {planner_interval_sec}s interval with {planner_command_timeout_sec}s crawler timeout."
                )
            } else {
                "Autonomous planner loop is off by default.".into()
            },
        },
        planner_interval_sec,
        planner_interval_floor_sec: crate::brain::planner::PLANNER_MIN_INTERVAL_SEC,
        planner_command_timeout_sec,
        planner_command_timeout_floor_sec: crate::brain::planner::PLANNER_MIN_COMMAND_TIMEOUT_SEC,
        planner_command_timeout_ceiling_sec: crate::brain::planner::PLANNER_MAX_COMMAND_TIMEOUT_SEC,
        note: if status == DoctorLevel::Ok {
            "Background work is in the low-duty default profile.".into()
        } else {
            "One or more optional background features are enabled; include them explicitly in idle CPU evidence.".into()
        },
    }
}

fn background_file_sync_state(home: &std::path::Path) -> (usize, bool) {
    let shares = SharesConfig::load(home);
    let mut roots: Vec<std::path::PathBuf> = std::env::var("MUSU_FILE_SERVE_ROOTS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
        .collect();
    for root in shares.roots() {
        if !roots.contains(&root) {
            roots.push(root);
        }
    }

    let writable = env_truthy("MUSU_FILE_SERVE_WRITABLE") || shares.any_writable();
    (roots.len(), writable)
}

fn env_truthy(name: &str) -> bool {
    matches!(
        std::env::var(name).as_deref(),
        Ok("1") | Ok("true") | Ok("yes")
    )
}

async fn wait_for_bridge(home: &std::path::Path, timeout: std::time::Duration) -> DoctorBridge {
    let deadline = std::time::Instant::now() + timeout;
    let mut last = check_bridge(home).await;
    let mut attempt = 0_u32;
    while std::time::Instant::now() < deadline {
        if bridge_reachable(&last) {
            return last;
        }
        let now = std::time::Instant::now();
        if now >= deadline {
            break;
        }
        let delay = bridge_health_poll_delay(attempt).min(deadline.saturating_duration_since(now));
        attempt = attempt.saturating_add(1);
        tokio::time::sleep(delay).await;
        last = check_bridge(home).await;
    }
    last
}

fn bridge_health_poll_delay(attempt: u32) -> std::time::Duration {
    let multiplier = 1_u64 << attempt.min(3);
    std::time::Duration::from_millis(
        BRIDGE_HEALTH_POLL_INITIAL_MS
            .saturating_mul(multiplier)
            .min(BRIDGE_HEALTH_POLL_MAX_MS),
    )
}

async fn wait_for_pid_exit(pid: u32, timeout: std::time::Duration) {
    let deadline = std::time::Instant::now() + timeout;
    let mut attempt = 0_u32;
    while std::time::Instant::now() < deadline {
        if !crate::bridge::services::is_pid_alive(pid) {
            return;
        }
        let now = std::time::Instant::now();
        if now >= deadline {
            return;
        }
        let delay = bridge_health_poll_delay(attempt).min(deadline.saturating_duration_since(now));
        attempt = attempt.saturating_add(1);
        tokio::time::sleep(delay).await;
    }
}

async fn wait_for_pids_exit(pids: &[u32], timeout: std::time::Duration) {
    let deadline = std::time::Instant::now() + timeout;
    let mut attempt = 0_u32;
    while std::time::Instant::now() < deadline {
        if pids
            .iter()
            .all(|pid| !crate::bridge::services::is_pid_alive(*pid))
        {
            return;
        }
        let now = std::time::Instant::now();
        if now >= deadline {
            return;
        }
        let delay = bridge_health_poll_delay(attempt).min(deadline.saturating_duration_since(now));
        attempt = attempt.saturating_add(1);
        tokio::time::sleep(delay).await;
    }
}

fn bridge_reachable(bridge: &DoctorBridge) -> bool {
    bridge
        .health_http_status
        .is_some_and(|status| (200..300).contains(&status))
}

fn spawn_bridge_process(
    home: &std::path::Path,
    log_path: &std::path::Path,
) -> Result<std::process::Child> {
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let stdout = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;
    let stderr = stdout.try_clone()?;
    let exe = std::env::current_exe()?;
    let mut cmd = std::process::Command::new(exe);
    cmd.arg("bridge")
        .env("MUSU_HOME", home)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::from(stdout))
        .stderr(std::process::Stdio::from(stderr));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        clear_standard_handle_inheritance();
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
    }

    cmd.spawn().map_err(Into::into)
}

#[cfg(windows)]
fn clear_standard_handle_inheritance() {
    use windows_sys::Win32::Foundation::{
        SetHandleInformation, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::System::Console::{
        GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
    };

    // Windows can pass unrelated inheritable pipe handles to a detached child.
    // `musu up --json | ConvertFrom-Json` then waits forever because the
    // bridge keeps PowerShell's stdout pipe open. Clearing inheritance on the
    // current standard handles is safe for this short-lived parent process and
    // prevents the long-lived bridge from pinning caller pipelines.
    for std_handle in [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE] {
        // SAFETY: GetStdHandle and SetHandleInformation are Win32 FFI calls.
        // We only clear the inheritance flag on valid pseudo/real standard
        // handles and intentionally ignore failures because the explicit bridge
        // stdout/stderr log handles above remain the child stdio contract.
        unsafe {
            let handle = GetStdHandle(std_handle);
            if handle.is_null() || handle == INVALID_HANDLE_VALUE {
                continue;
            }
            let _ = SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0);
        }
    }
}

fn open_url(url: &str) -> Result<()> {
    #[cfg(windows)]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", url]);
        c
    };

    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(url);
        c
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url);
        c
    };

    #[cfg(not(any(windows, target_os = "macos", unix)))]
    {
        let _ = url;
        anyhow::bail!("opening dashboard URLs is not supported on this platform");
    }

    #[cfg(any(windows, target_os = "macos", unix))]
    {
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;
        Ok(())
    }
}

fn summarize_levels(levels: &[DoctorLevel]) -> DoctorLevel {
    if levels.contains(&DoctorLevel::Fail) {
        DoctorLevel::Fail
    } else if levels.contains(&DoctorLevel::Warn) {
        DoctorLevel::Warn
    } else {
        DoctorLevel::Ok
    }
}

fn next_steps_for(
    account: &DoctorAccount,
    bridge: DoctorLevel,
    dashboard: DoctorLevel,
    dashboard_required: bool,
    public_url_valid: bool,
) -> Vec<String> {
    let mut steps = Vec::new();
    if !account.account_token_present {
        steps.push("Run `musu login`.".into());
    }
    if !account.bridge_token_present {
        steps.push(
            "Seed the local bridge token by running `musu install` or starting `musu bridge` once."
                .into(),
        );
    }
    if matches!(bridge, DoctorLevel::Fail) {
        steps.push("Start the local bridge with `musu bridge`.".into());
    }
    if !public_url_valid {
        steps.push("Set MUSU_BRIDGE_PUBLIC_URL to an http:// or https:// URL if cloud registration rejects the computed URL.".into());
    }
    if dashboard_required && matches!(dashboard, DoctorLevel::Warn | DoctorLevel::Fail) {
        steps.push("Start the dashboard from `musu-bee`: `npm run dev` for port 3000 or `npm start` for port 3001.".into());
    }
    if steps.is_empty() {
        steps.push(
            "System looks ready. Use MUSU.PRO, a connected dashboard, or `musu route --wait <task>` to run work."
                .into(),
        );
    }
    steps
}

fn is_http_url(raw: &str) -> bool {
    reqwest::Url::parse(raw)
        .map(|url| matches!(url.scheme(), "http" | "https"))
        .unwrap_or(false)
}

fn path_contains_dir(dir: &std::path::Path) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|entry| paths_equivalent(&entry, dir))
}

fn paths_equivalent(a: &std::path::Path, b: &std::path::Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

fn find_first_binary_on_path(binary_name: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(binary_name);
        if candidate.exists() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            if !binary_name.to_ascii_lowercase().ends_with(".exe") {
                let candidate = dir.join(format!("{binary_name}.exe"));
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn windowsapps_alias_path() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        let local_app_data = std::env::var_os("LOCALAPPDATA")?;
        let path = std::path::PathBuf::from(local_app_data)
            .join("Microsoft")
            .join("WindowsApps")
            .join(crate::install::musu_binary_name());
        path.exists().then_some(path)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn print_doctor_report(report: &DoctorReport) {
    println!("MUSU Doctor");
    println!("version: {}", report.version);
    println!("overall: {}", report.overall.label());
    println!();
    print_line(
        "home",
        report.home.status,
        &format!("{} ({})", report.home.path, report.home.note),
    );
    print_line(
        "binary",
        report.binary.status,
        &format!(
            "{}; PATH={}",
            report.binary.installed_binary,
            if report.binary.bin_dir_on_path {
                "ok"
            } else {
                "missing"
            }
        ),
    );
    if let Some(shadow) = &report.binary.alias_shadowed_by {
        print_line(
            "alias",
            DoctorLevel::Warn,
            &format!("WindowsApps alias shadowed by {shadow}"),
        );
    }
    print_line("account", report.account.status, &report.account.note);
    print_line(
        "bridge",
        report.bridge.status,
        &format!("{} ({})", report.bridge.local_url, report.bridge.note),
    );
    print_line(
        "public URL",
        if report.bridge.public_url_valid {
            DoctorLevel::Ok
        } else {
            DoctorLevel::Warn
        },
        &report.bridge.public_url,
    );
    print_line("dashboard", report.dashboard.status, &report.dashboard.note);
    print_line("package", report.package.status, &report.package.note);
    print_line(
        "background",
        report.background.status,
        &report.background.note,
    );
    println!(
        "  mDNS={} clipboard={} cloud_heartbeat={}s file_roots={} relay_payload_poller={} relay_interval={}s relay_backoff_max={}s relay_limit={} planner={} planner_interval={}s planner_timeout={}s",
        if report.background.mdns.enabled {
            "on"
        } else {
            "off"
        },
        if report.background.clipboard_sync.enabled {
            "on"
        } else {
            "off"
        },
        report.background.cloud_heartbeat_interval_sec,
        report.background.file_serve_root_count,
        if report.background.relay_payload_poller.enabled {
            "on"
        } else {
            "off"
        },
        report.background.relay_payload_poller_interval_sec,
        report.background.relay_payload_poller_empty_backoff_max_sec,
        report.background.relay_payload_poller_limit,
        if report.background.planner.enabled {
            "on"
        } else {
            "off"
        },
        report.background.planner_interval_sec,
        report.background.planner_command_timeout_sec
    );
    println!();
    println!("Next steps:");
    for step in &report.next_steps {
        println!("  - {step}");
    }
}

fn print_up_report(report: &UpReport) {
    println!("MUSU Up");
    println!(
        "bridge: {} ({})",
        report.bridge.status.label(),
        report.bridge.local_url
    );
    println!(
        "token: {}",
        if report.token_created {
            "created"
        } else {
            "existing"
        }
    );
    if report.bridge_started {
        println!(
            "started bridge pid: {}",
            report
                .bridge_pid
                .map(|p| p.to_string())
                .unwrap_or_else(|| "unknown".into())
        );
    } else {
        println!("bridge was already running or still unreachable");
    }
    if report.stale_bridge_registry_removed {
        println!(
            "removed stale bridge registry pid: {}",
            report
                .stale_bridge_registry_pid
                .map(|p| p.to_string())
                .unwrap_or_else(|| "unknown".into())
        );
    }
    println!("bridge log: {}", report.bridge_log_path);
    println!("dashboard: {}", report.dashboard.status.label());
    if !report.dashboard.dev_url.is_empty() {
        println!("dashboard dev: {}", report.dashboard.dev_url);
    }
    if !report.dashboard.start_url.is_empty() {
        println!("dashboard start: {}", report.dashboard.start_url);
    }
    if let Some(err) = &report.dashboard_open_error {
        println!("dashboard open failed: {err}");
    }
    println!();
    println!("Next steps:");
    for step in &report.next_steps {
        println!("  - {step}");
    }
}

fn print_stop_report(report: &StopReport) {
    if report.ok {
        println!("MUSU bridge stop: ok");
    } else {
        println!("MUSU bridge stop: failed");
    }
    println!("  home: {}", report.home);
    if let Some(addr) = &report.bridge_addr {
        println!("  bridge: {addr}");
    }
    if let Some(pid) = report.bridge_pid {
        println!("  pid: {pid}");
    }
    println!(
        "  registry record present: {}",
        report.registry_record_present
    );
    println!("  pid alive before: {}", report.pid_alive_before);
    if let Some(is_runtime) = report.pid_is_musu_runtime {
        println!("  pid is MUSU runtime: {is_runtime}");
    }
    println!("  terminate attempted: {}", report.terminate_attempted);
    println!("  terminate requested: {}", report.terminate_requested);
    println!("  pid alive after: {}", report.pid_alive_after);
    println!("  registry deregistered: {}", report.registry_deregistered);
    println!("  include desktop: {}", report.include_desktop);
    println!(
        "  desktop cleanup attempted: {}",
        report.desktop_cleanup_attempted
    );
    if report.desktop_cleanup_attempted {
        println!("  desktop pids before: {:?}", report.desktop_pids_before);
        println!(
            "  desktop termination requested: {:?}",
            report.desktop_terminate_requested_pids
        );
        println!("  desktop pids after: {:?}", report.desktop_pids_after);
        if !report.desktop_errors.is_empty() {
            println!("  desktop errors: {}", report.desktop_errors.join("; "));
        }
    }
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    if !report.next_steps.is_empty() {
        println!("  next steps:");
        for step in &report.next_steps {
            println!("    - {step}");
        }
    }
}

fn print_line(name: &str, level: DoctorLevel, detail: &str) {
    println!("  [{:<4}] {:<10} {}", level.label(), name, detail);
}

/// Human-friendly byte-size formatter.
fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

/// Resolve `~/.musu` from environment.
fn musu_home() -> std::path::PathBuf {
    crate::install::resolve_musu_home_from_env()
        .unwrap_or_else(|_| std::path::PathBuf::from(".").join(".musu"))
}

// ── F3 fleet dashboard CLI ──────────────────────────────────────────

/// `musu status` — show fleet status across all connected nodes.
pub async fn run_status(opts: StatusOpts) -> Result<()> {
    let bridge_url = local_bridge_base_url();
    let token = get_token();
    let url = format!("{bridge_url}/api/fleet/status");
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            anyhow::anyhow!("cannot reach local bridge: {e}. Is `musu bridge` running?")
        })?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        anyhow::bail!("bridge error: {body}");
    }

    let fleet: serde_json::Value = resp.json().await?;
    if opts.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "schema": "musu.fleet_status_cli.v1",
                "ok": true,
                "bridge_url": bridge_url,
                "fleet": fleet,
            }))?
        );
        return Ok(());
    }

    println!("\n\u{1f41d} MUSU Fleet Status\n");

    // This node
    let this = &fleet["this_node"];
    let status_icon = if this["healthy"].as_bool().unwrap_or(false) {
        "\u{2705}"
    } else {
        "\u{274c}"
    };
    println!(
        "  {} {} (this)    {} running, {} pending, {} dirs shared",
        status_icon,
        this["name"].as_str().unwrap_or("?"),
        this["tasks_running"].as_u64().unwrap_or(0),
        this["tasks_pending"].as_u64().unwrap_or(0),
        this["shared_dirs"].as_array().map(|a| a.len()).unwrap_or(0),
    );

    // Peers
    if let Some(peers) = fleet["peers"].as_array() {
        for peer in peers {
            let icon = if peer["healthy"].as_bool().unwrap_or(false) {
                "\u{2705}"
            } else {
                "\u{274c}"
            };
            let label = if peer["healthy"].as_bool().unwrap_or(false) {
                "healthy"
            } else {
                "offline"
            };
            println!(
                "  {} {} ({})    {} running, {} pending",
                icon,
                peer["name"].as_str().unwrap_or("?"),
                label,
                peer["tasks_running"].as_u64().unwrap_or(0),
                peer["tasks_pending"].as_u64().unwrap_or(0),
            );
        }
    }

    println!(
        "\n  Total: {} nodes, {} online, {} tasks running\n",
        fleet["total_nodes"].as_u64().unwrap_or(0),
        fleet["online_nodes"].as_u64().unwrap_or(0),
        fleet["total_tasks_running"].as_u64().unwrap_or(0),
    );

    Ok(())
}

/// `musu tasks` — list recent tasks across the fleet.
pub async fn run_tasks() -> Result<()> {
    let token = get_token();
    let url = format!("{}/api/tasks", local_bridge_base_url());
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("cannot reach local bridge: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        anyhow::bail!("bridge error: {body}");
    }

    let data: serde_json::Value = resp.json().await?;
    let tasks = data["tasks"].as_array();

    if let Some(tasks) = tasks {
        if tasks.is_empty() {
            println!("No tasks found.");
            return Ok(());
        }

        println!(
            "\n{:<12} {:<10} {:<10} CHANNEL",
            "TASK_ID", "STATUS", "DURATION"
        );
        println!("{}", "-".repeat(50));

        for task in tasks {
            let id = task["task_id"].as_str().unwrap_or("?");
            let short_id = if id.len() > 8 { &id[..8] } else { id };
            let status = task["status"].as_str().unwrap_or("?");
            let duration = task["duration_sec"]
                .as_f64()
                .map(|d| format!("{:.1}s", d))
                .unwrap_or_else(|| "-".into());
            let channel = task["channel"].as_str().unwrap_or("?");

            println!(
                "{:<12} {:<10} {:<10} {}",
                short_id, status, duration, channel
            );
        }
        println!("\nTotal: {} tasks", tasks.len());
    }

    Ok(())
}

// ── F5 workflow execution CLI ───────────────────────────────────────

/// `musu workflow-run --id <ID>` — execute a workflow via the bridge.
pub async fn run_workflow_execute(workflow_id: &str) -> Result<()> {
    let token = get_token();
    let url = format!(
        "{}/api/workflows/{}/execute",
        local_bridge_base_url(),
        workflow_id
    );
    let client = reqwest::Client::new();

    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("cannot reach bridge: {e}"))?;

    if resp.status().is_success() {
        let data: serde_json::Value = resp.json().await?;
        println!("\u{2713} Workflow {} execution started", workflow_id);
        println!("  Status: {}", data["status"].as_str().unwrap_or("?"));
    } else {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }
    Ok(())
}

// ── F7 easy token pairing CLI ───────────────────────────────────────

/// `musu pair` — generate a pairing code for another machine to join.
pub async fn run_pair() -> Result<()> {
    let token = get_token();
    let url = format!("{}/api/pair/offer", local_bridge_base_url());
    let client = reqwest::Client::new();

    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("cannot reach bridge: {e}"))?;

    if resp.status().is_success() {
        let data: serde_json::Value = resp.json().await?;
        let code = data["code"].as_str().unwrap_or("?");
        println!("\n\u{1f517} Pairing code: {}\n", code);
        println!("   Valid for 5 minutes.");
        println!("   On the other machine, run:");
        println!("   musu join {}\n", code);
    } else {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }
    Ok(())
}

/// `musu join <code>` — join another machine using a pairing code.
pub async fn run_join(code: &str) -> Result<()> {
    // First, try to find the pairing host via mDNS.
    println!("\u{1f50d} Looking for pairing host...");
    let peers = crate::peer::mdns::discover_peers(std::time::Duration::from_secs(5)).await;

    let token = get_token();
    let my_name = std::env::var("MUSU_NODE_NAME").unwrap_or_else(|_| {
        hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    let my_url = resolve_public_bridge_url();

    // Try each discovered peer.
    let client = reqwest::Client::new();
    for peer in &peers {
        let url = format!("http://{}/api/pair/accept", peer.addr);
        let body = serde_json::json!({
            "code": code,
            "my_name": my_name,
            "my_url": my_url,
        });

        match client
            .post(&url)
            .json(&body)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                let data: serde_json::Value = resp.json().await?;
                let peer_name = data["peer_name"].as_str().unwrap_or("?");
                println!("\u{2713} Paired with {} ({})", peer_name, peer.addr);

                // Also add the peer to our manual_peers.
                let home = musu_home();
                let mut list = crate::peer::discovery::ManualPeerList::load(&home);
                list.add(peer.addr.clone(), Some(peer_name.to_string()));
                let _ = list.save(&home);
                return Ok(());
            }
            Ok(resp) if resp.status().as_u16() == 404 => continue, // wrong peer
            _ => continue,
        }
    }

    // Fallback: try local bridge.
    let url = format!("{}/api/pair/accept", local_bridge_base_url());
    let body = serde_json::json!({
        "code": code,
        "my_name": my_name,
        "my_url": my_url,
    });
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("no peers found and local bridge unreachable: {e}"))?;

    if resp.status().is_success() {
        println!("\u{2713} Paired via local bridge");
    } else {
        let body = resp.text().await?;
        anyhow::bail!("pairing failed: {body}");
    }
    Ok(())
}

// ── F9 file real-time sync CLI ──────────────────────────────────────

/// `musu sync` — start watching shared directories and sync to peers.
pub async fn run_sync() -> Result<()> {
    let home = musu_home();
    let shares = crate::install::shares::SharesConfig::load(&home);
    let paths: Vec<std::path::PathBuf> = shares
        .shared
        .iter()
        .map(|s| std::path::PathBuf::from(&s.path))
        .collect();

    if paths.is_empty() {
        println!("No shared directories. Use `musu share <path>` first.");
        return Ok(());
    }

    let token = get_token();
    let peers: Vec<String> = crate::peer::discovery::resolve_all_peers(&home)
        .into_iter()
        .map(|p| p.addr)
        .collect();

    if peers.is_empty() {
        println!("No peers found. Use `musu peer add` or `musu pair` first.");
        return Ok(());
    }

    println!(
        "Watching {} directories, syncing to {} peers...",
        paths.len(),
        peers.len()
    );
    for p in &paths {
        println!("  {}", p.display());
    }

    let (rx, watcher) = crate::install::sync::start_watcher(&paths)?;
    crate::install::sync::run_sync_loop(rx, watcher, peers, token).await;
    Ok(())
}

// ── F10 WebDAV mount CLI ────────────────────────────────────────────

/// `musu mount [--node <name>]` — show WebDAV URL and mount instructions.
pub async fn run_mount(node: Option<&str>) -> Result<()> {
    let home = musu_home();
    let peers = crate::peer::discovery::resolve_all_peers(&home);

    if let Some(target) = node {
        // Find specific peer.
        let peer = peers
            .iter()
            .find(|p| p.addr == target || p.name.as_deref() == Some(target));
        match peer {
            Some(p) => {
                let url = format!("http://{}/webdav", p.addr);
                println!("\nWebDAV URL: {}\n", url);
                println!("To mount on Windows:");
                println!("  net use Z: {}", url);
                println!("\nTo mount on macOS:");
                println!("  mount_webdav {} /Volumes/musu", url);
                println!("\nTo mount on Linux:");
                println!("  sudo mount -t davfs {} /mnt/musu", url);
            }
            None => {
                anyhow::bail!("peer '{}' not found", target);
            }
        }
    } else {
        // Show local WebDAV URL.
        let url = format!("{}/webdav", local_bridge_base_url());
        println!("\nLocal WebDAV URL: {}\n", url);
        println!("Mount it on another machine to access shared files.");

        if !peers.is_empty() {
            println!("\nRemote nodes:");
            for p in &peers {
                let name = p.name.as_deref().unwrap_or(&p.addr);
                println!("  {} — http://{}/webdav", name, p.addr);
            }
            println!("\nUse `musu mount --node <name>` for mount instructions.");
        }
    }
    Ok(())
}

// ── V27 Account Auth CLI ────────────────────────────────────────────

/// `musu login` — start the device code login flow.
fn login_connection_checklist() -> [&'static str; 3] {
    [
        "Run `musu doctor` to verify local state.",
        "Start the bridge with `musu bridge` if it is not already running.",
        "Open MUSU Desktop or a MUSU.PRO workspace; localhost dashboards are optional developer surfaces only.",
    ]
}

pub async fn run_login() -> Result<()> {
    let home = musu_home();
    let my_name = std::env::var("MUSU_NODE_NAME").unwrap_or_else(|_| {
        hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });

    println!("\u{1f511} Initiating login to musu.pro...");

    let cloud_base_url = crate::cloud::base_url_from_env();
    let cloud = crate::cloud::MusuCloud::new(&cloud_base_url, None);
    let flow = cloud.initiate_device_login(&my_name).await?;

    println!("\n🔗 Open this URL in your browser to approve:");
    println!("   {}", flow.verification_uri);
    println!("   Code: {}", flow.user_code);
    println!(
        "\n⏳ Waiting for approval (timeout {}s)...",
        flow.expires_in
    );

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(flow.expires_in as u64);

    loop {
        if start.elapsed() > timeout {
            anyhow::bail!("Login timed out.");
        }

        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        match cloud.poll_device_token(&flow.device_code).await {
            Ok(Some(token)) => {
                crate::cloud::token::save_token(&home, &token)?;
                println!("\nAccount login succeeded.");

                // V27: Automatically register this node in the mesh
                println!("Registering node to your fleet...");
                let authed_cloud = crate::cloud::MusuCloud::new(&cloud_base_url, Some(token));
                let public_url = resolve_public_bridge_url();
                let req = crate::cloud::RegisterNodeRequest {
                    node_name: my_name.clone(),
                    public_url: public_url.clone(),
                    ..Default::default()
                };
                if let Err(e) = authed_cloud.register_node(req).await {
                    println!("Node registration failed.");
                    println!("  reason: {}", e);
                    println!("  computed public_url: {}", public_url);
                    println!(
                        "This machine is logged in, but is not yet fully registered in your fleet."
                    );
                } else {
                    println!("Node registered successfully.");
                    println!("This machine is connected to your MUSU account.");
                }

                println!();
                println!("Connection checklist:");
                for (index, step) in login_connection_checklist().iter().enumerate() {
                    println!("  {}. {}", index + 1, step);
                }
                return Ok(());
            }
            Ok(None) => {
                // still pending
            }
            Err(e) => {
                anyhow::bail!("Login failed: {}", e);
            }
        }
    }
}

/// `musu logout` — remove the account token.
pub async fn run_logout() -> Result<()> {
    let home = musu_home();
    crate::cloud::token::delete_token(&home)?;
    println!("✅ Logged out.");
    Ok(())
}

/// `musu whoami` — check if logged in.
pub async fn run_whoami() -> Result<()> {
    let home = musu_home();
    if let Some(_token) = crate::cloud::token::load_token(&home) {
        println!("✅ You are logged in.");
    } else {
        println!("❌ Not logged in. Run `musu login`.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn bridge_health_poll_delay_backs_off_and_caps() {
        let samples: Vec<u64> = (0..6)
            .map(|attempt| bridge_health_poll_delay(attempt).as_millis() as u64)
            .collect();
        assert_eq!(samples, vec![250, 500, 1_000, 2_000, 2_000, 2_000]);
    }

    #[test]
    fn packaged_runtime_dashboard_absence_does_not_request_dev_server() {
        let account = DoctorAccount {
            status: DoctorLevel::Ok,
            logged_in: true,
            account_token_present: true,
            bridge_token_present: true,
            note: String::new(),
        };

        let steps = next_steps_for(&account, DoctorLevel::Ok, DoctorLevel::Warn, false, true);

        assert!(!steps.iter().any(|step| step.contains("npm run dev")));
        assert!(steps.iter().any(|step| step.contains("MUSU.PRO")));
    }

    #[test]
    fn developer_dashboard_absence_keeps_dev_server_hint() {
        let account = DoctorAccount {
            status: DoctorLevel::Ok,
            logged_in: true,
            account_token_present: true,
            bridge_token_present: true,
            note: String::new(),
        };

        let steps = next_steps_for(&account, DoctorLevel::Ok, DoctorLevel::Warn, true, true);

        assert!(steps.iter().any(|step| step.contains("npm run dev")));
    }

    #[test]
    fn login_connection_checklist_does_not_open_fixed_localhost_dashboard() {
        let checklist = login_connection_checklist().join("\n");

        assert!(checklist.contains("MUSU Desktop"));
        assert!(checklist.contains("MUSU.PRO"));
        assert!(!checklist.contains("127.0.0.1:3001"));
        assert!(!checklist.contains("localhost:3001"));
    }

    #[test]
    fn relay_payload_status_filter_accepts_only_queue_states() {
        assert_eq!(
            relay_payload_status_filter(Some("queued".to_string())).unwrap(),
            Some("queued".to_string())
        );
        assert_eq!(
            relay_payload_status_filter(Some("claimed".to_string())).unwrap(),
            Some("claimed".to_string())
        );
        assert_eq!(
            relay_payload_status_filter(Some("delivered".to_string())).unwrap(),
            Some("delivered".to_string())
        );
        assert!(relay_payload_status_filter(Some("running".to_string())).is_err());
    }

    #[test]
    fn relay_payload_local_target_filter_uses_local_node_id() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_NODE_NAME", "local-node");
        let opts = RelayPayloadsOpts {
            json: true,
            limit: 20,
            session_id: None,
            lease_id: None,
            source_node_id: None,
            target_node_id: None,
            local_target: true,
            tunnel_id: None,
            status: Some("queued".to_string()),
            include_payload: false,
        };

        assert_eq!(
            relay_payload_target_filter(&opts).unwrap(),
            Some("local-node".to_string())
        );

        std::env::remove_var("MUSU_NODE_NAME");
    }

    #[test]
    fn relay_payload_claim_requires_target_or_local_target() {
        assert!(required_relay_payload_target(None, false).is_err());
        assert_eq!(
            required_relay_payload_target(Some("node-b"), false).unwrap(),
            "node-b".to_string()
        );
    }

    #[test]
    fn relay_payload_required_target_uses_local_node_id() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_NODE_NAME", "local-node");

        assert_eq!(
            required_relay_payload_target(None, true).unwrap(),
            "local-node".to_string()
        );
        assert!(required_relay_payload_target(Some("other-node"), true).is_err());

        std::env::remove_var("MUSU_NODE_NAME");
    }

    #[test]
    fn room_presence_status_accepts_expected_values() {
        assert!(matches!(
            parse_room_presence_status("online").unwrap(),
            crate::cloud::RoomPresenceStatus::Online
        ));
        assert!(matches!(
            parse_room_presence_status("idle").unwrap(),
            crate::cloud::RoomPresenceStatus::Idle
        ));
        assert!(matches!(
            parse_room_presence_status("busy").unwrap(),
            crate::cloud::RoomPresenceStatus::Busy
        ));
        assert!(matches!(
            parse_room_presence_status("offline").unwrap(),
            crate::cloud::RoomPresenceStatus::Offline
        ));
        assert!(parse_room_presence_status("sleeping").is_err());
    }

    #[test]
    fn room_presence_publish_request_defaults_to_local_candidate() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_NODE_NAME", "room-node");
        std::env::set_var("MUSU_BRIDGE_PUBLIC_URL", "http://192.168.1.20:8949");
        let opts = RoomPresencePublishOpts {
            room_id: "project-room".to_string(),
            json: true,
            node_id: None,
            node_name: None,
            status: "idle".to_string(),
            company_id: Some("company-a".to_string()),
            project_id: Some("project-a".to_string()),
            source_agent_id: None,
            work_order_ids: vec!["wo-1".to_string()],
            capabilities: vec![],
            public_url: None,
            candidate_urls: vec![],
            nat_type: None,
            nat_observed_by: None,
            relay_url: None,
            relay_protocol: None,
            relay_capable: false,
            origin: "musu.local-program".to_string(),
        };

        let (request, candidates) = room_presence_request_from_opts(&opts).unwrap();

        assert_eq!(request.node_id, "room-node");
        assert_eq!(request.node_name.as_deref(), Some("room-node"));
        assert!(matches!(
            request.status,
            Some(crate::cloud::RoomPresenceStatus::Idle)
        ));
        assert_eq!(request.company_id.as_deref(), Some("company-a"));
        assert_eq!(request.project_id.as_deref(), Some("project-a"));
        assert_eq!(request.active_work_order_ids, vec!["wo-1".to_string()]);
        assert_eq!(
            request.capabilities,
            vec!["bridge_http_forward".to_string()]
        );
        assert_eq!(request.candidate_endpoints.len(), 1);
        assert_eq!(request.candidate_endpoints[0].addr, "192.168.1.20:8949");
        assert!(matches!(
            request.candidate_endpoints[0].kind,
            crate::cloud::RouteKind::Lan
        ));
        assert!(request.candidate_endpoints[0].public_addr.is_none());
        assert!(request.candidate_endpoints[0].nat_type.is_none());
        assert!(request.candidate_endpoints[0].relay_url.is_none());
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].addr, "192.168.1.20:8949");

        std::env::remove_var("MUSU_NODE_NAME");
        std::env::remove_var("MUSU_BRIDGE_PUBLIC_URL");
    }

    #[test]
    fn room_presence_publish_request_accepts_public_nat_and_relay_candidates() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_NODE_NAME", "room-node");
        let opts = RoomPresencePublishOpts {
            room_id: "project-room".to_string(),
            json: true,
            node_id: Some("pc-a".to_string()),
            node_name: Some("HUGH_SECOND".to_string()),
            status: "online".to_string(),
            company_id: Some("company-a".to_string()),
            project_id: Some("project-a".to_string()),
            source_agent_id: Some("agent-a".to_string()),
            work_order_ids: vec!["wo-1".to_string()],
            capabilities: vec!["bridge_http_forward".to_string()],
            public_url: Some("https://8.8.8.8:8949".to_string()),
            candidate_urls: vec!["https://100.64.1.20:8949".to_string()],
            nat_type: Some("symmetric".to_string()),
            nat_observed_by: Some("stun:musu.pro".to_string()),
            relay_url: Some("wss://relay.musu.pro/api/v1/relay/connect".to_string()),
            relay_protocol: None,
            relay_capable: false,
            origin: "musu.local-program".to_string(),
        };

        let (request, candidates) = room_presence_request_from_opts(&opts).unwrap();

        assert_eq!(request.node_id, "pc-a");
        assert_eq!(request.candidate_endpoints.len(), 3);
        let direct = &request.candidate_endpoints[0];
        assert!(matches!(direct.kind, crate::cloud::RouteKind::DirectQuic));
        assert_eq!(direct.addr, "8.8.8.8:8949");
        assert_eq!(direct.scheme.as_deref(), Some("https"));
        assert_eq!(direct.public_addr.as_deref(), Some("8.8.8.8:8949"));
        assert!(matches!(
            direct.nat_type,
            Some(crate::cloud::NatType::Symmetric)
        ));
        assert_eq!(direct.nat_observed_by.as_deref(), Some("stun:musu.pro"));

        let tailscale = &request.candidate_endpoints[1];
        assert!(matches!(tailscale.kind, crate::cloud::RouteKind::Tailscale));
        assert_eq!(tailscale.addr, "100.64.1.20:8949");
        assert!(tailscale.public_addr.is_none());
        assert!(tailscale.nat_type.is_none());

        let relay = &request.candidate_endpoints[2];
        assert!(matches!(relay.kind, crate::cloud::RouteKind::Relay));
        assert_eq!(relay.addr, "relay.musu.pro:443");
        assert_eq!(
            relay.relay_url.as_deref(),
            Some("wss://relay.musu.pro/api/v1/relay/connect")
        );
        assert!(matches!(
            relay.relay_protocol,
            Some(crate::cloud::RelayProtocol::QuicRelayTunnel)
        ));
        assert!(request.relay_capable);
        assert_eq!(candidates.len(), 3);
        assert_eq!(candidates[0].public_addr.as_deref(), Some("8.8.8.8:8949"));
        assert_eq!(
            candidates[2].relay_url.as_deref(),
            Some("wss://relay.musu.pro/api/v1/relay/connect")
        );

        std::env::remove_var("MUSU_NODE_NAME");
    }

    #[tokio::test]
    async fn wait_for_pid_exit_returns_without_timeout_for_dead_pid() {
        wait_for_pid_exit(u32::MAX, std::time::Duration::from_secs(5)).await;
    }

    #[test]
    fn route_wait_timeout_is_bounded() {
        assert_eq!(route_wait_timeout(0), std::time::Duration::from_secs(1));
        assert_eq!(
            route_wait_timeout(ROUTE_WAIT_DEFAULT_TIMEOUT_SECS),
            std::time::Duration::from_secs(ROUTE_WAIT_DEFAULT_TIMEOUT_SECS)
        );
        assert_eq!(
            route_wait_timeout(ROUTE_WAIT_MAX_TIMEOUT_SECS + 1),
            std::time::Duration::from_secs(ROUTE_WAIT_MAX_TIMEOUT_SECS)
        );
    }

    #[test]
    fn shared_service_helper_normalizes_wildcards_to_loopback() {
        assert_eq!(
            crate::bridge::services::normalize_loopback_addr("0.0.0.0:8070"),
            "127.0.0.1:8070"
        );
        assert_eq!(
            crate::bridge::services::normalize_loopback_addr("[::]:9000"),
            "127.0.0.1:9000"
        );
        assert_eq!(
            crate::bridge::services::normalize_loopback_addr(":::7777"),
            "127.0.0.1:7777"
        );
        assert_eq!(
            crate::bridge::services::normalize_loopback_addr("127.0.0.1:5555"),
            "127.0.0.1:5555"
        );
    }

    #[test]
    fn local_bridge_addr_prefers_service_registry_and_normalizes_it() {
        let tmp = tempfile::tempdir().unwrap();
        let musu_home = tmp.path().join(".musu");
        std::env::set_var("MUSU_HOME", &musu_home);
        std::env::set_var("BRIDGE_PORT", "9999");

        let registry = crate::bridge::services::ServiceRegistry::new();
        registry
            .register(&crate::bridge::services::ServiceRecord {
                name: "bridge".to_string(),
                addr: "0.0.0.0:43123".to_string(),
                pid: Some(std::process::id()),
                started_at: chrono::Utc::now().timestamp(),
                transport: crate::bridge::services::Transport::Tcp,
            })
            .unwrap();

        assert_eq!(local_bridge_addr(), "127.0.0.1:43123");

        std::env::remove_var("BRIDGE_PORT");
        std::env::remove_var("MUSU_HOME");
    }

    #[test]
    fn resolve_public_bridge_url_prefers_explicit_env() {
        std::env::set_var("MUSU_BRIDGE_PUBLIC_URL", "https://fleet.example.test");
        assert_eq!(resolve_public_bridge_url(), "https://fleet.example.test");
        std::env::remove_var("MUSU_BRIDGE_PUBLIC_URL");
    }

    #[test]
    fn route_kind_classifies_private_lan_and_tailscale() {
        assert_eq!(
            crate::bridge::router::route_kind_for_addr("192.168.1.50:8070").as_str(),
            "lan"
        );
        assert_eq!(
            crate::bridge::router::route_kind_for_addr("10.0.0.5:8070").as_str(),
            "lan"
        );
        assert_eq!(
            crate::bridge::router::route_kind_for_addr("100.100.1.2:8070").as_str(),
            "tailscale"
        );
    }

    #[test]
    fn route_kind_classifies_public_and_loopback() {
        assert_eq!(
            crate::bridge::router::route_kind_for_addr("8.8.8.8:443").as_str(),
            "direct_quic"
        );
        assert_eq!(
            crate::bridge::router::route_kind_for_addr("127.0.0.1:8070").as_str(),
            "local"
        );
    }

    #[test]
    fn candidate_report_records_current_legacy_transport_gap() {
        let candidate = candidate_report(
            Some("remote".to_string()),
            "192.168.1.50:8070".to_string(),
            "manual".to_string(),
            None,
        );
        assert_eq!(candidate.route_kind, "lan");
        assert_eq!(candidate.transport_scheme, "http");
        assert!(!candidate.peer_identity_verified);
        assert_eq!(candidate.peer_identity_method, None);
        assert!(!candidate.peer_public_key_present);
        assert!(!candidate.https_fingerprint_pin_available);
        assert_eq!(candidate.encryption, "none_http_bearer");
        assert!(!candidate.payload_transited_musu_infra);
    }

    #[test]
    fn candidate_report_marks_https_fingerprint_pin_available_without_claiming_verified() {
        let candidate = candidate_report(
            Some("remote".to_string()),
            "192.168.1.50:8070".to_string(),
            "registry".to_string(),
            Some(serde_json::json!({
                "transport_scheme": "https",
                "peer_public_key": "sha256:abcdef",
            })),
        );

        assert_eq!(candidate.transport_scheme, "https");
        assert!(!candidate.peer_identity_verified);
        assert_eq!(
            candidate.peer_identity_method.as_deref(),
            Some("advertised_tls_cert_fingerprint_unverified")
        );
        assert!(candidate.peer_public_key_present);
        assert!(candidate.https_fingerprint_pin_available);
        assert_eq!(candidate.encryption, "none_http_bearer");
        assert_eq!(
            route_explain_current_transport(Some(&candidate)),
            "bridge_https_fingerprint_pin_available"
        );
    }

    #[test]
    fn candidate_report_downgrades_verified_fingerprint_pin_metadata() {
        let candidate = candidate_report(
            Some("remote".to_string()),
            "192.168.1.50:8070".to_string(),
            "registry".to_string(),
            Some(serde_json::json!({
                "transport_scheme": "https",
                "peer_identity_verified": true,
                "peer_identity_method": "tls_cert_fingerprint_pin",
                "peer_public_key": "sha256:abcdef",
                "encryption": "https_tls_fingerprint_pin",
            })),
        );

        assert!(!candidate.peer_identity_verified);
        assert_eq!(
            candidate.peer_identity_method.as_deref(),
            Some("advertised_tls_cert_fingerprint_unverified")
        );
        assert!(candidate.peer_public_key_present);
        assert!(candidate.https_fingerprint_pin_available);
        assert_eq!(candidate.encryption, "none_http_bearer");
    }

    fn relay_status_fixture() -> RelayStatusReport {
        RelayStatusReport {
            schema: "musu.relay_status.v1",
            registry_url: "https://musu.pro".to_string(),
            logged_in: true,
            cached_registry_present: false,
            cached_registry_valid: false,
            cached_node_count: 0,
            rust_client_dtos_wired: true,
            route_evidence_client_wired: true,
            bridge_path_selection_wired: true,
            rendezvous_session_wired: true,
            https_fingerprint_pinning_wired: true,
            release_grade_transport_required: "quic_tls_1_3",
            relay_control_plane_lease_wired: true,
            relay_lease_endpoint: "/api/v1/p2p/relay/lease",
            relay_runtime_fallback_lease_request_wired: true,
            relay_transport_preflight_ok: false,
            relay_transport_descriptor_wired: false,
            relay_transport_wired: false,
            relay_connect_endpoint_wired: false,
            relay_payload_endpoint_wired: false,
            relay_payload_queue_endpoint_wired: false,
            relay_default_data_path: false,
            relay_lease_store_configured: false,
            relay_lease_store_backend: None,
            relay_lease_store_release_grade: false,
            relay_transport_blockers: vec!["relay_transport_not_wired".to_string()],
            relay_transport_error: None,
            release_route_evidence_ready: false,
            path_priority: vec!["lan", "tailscale", "direct_quic", "relay"],
            next_steps: vec![],
        }
    }

    #[test]
    fn relay_status_reflects_live_transport_descriptor() {
        let mut report = relay_status_fixture();
        apply_relay_transport_response_to_status(
            &mut report,
            crate::cloud::P2pRelayTransportResponse {
                schema: "musu.p2p_relay_transport.v1".to_string(),
                ok: true,
                owner_scoped: true,
                relay_control_plane_wired: true,
                relay_transport_descriptor_wired: true,
                relay_transport_wired: true,
                relay_connect_endpoint_wired: true,
                relay_payload_endpoint_wired: true,
                relay_payload_queue_endpoint_wired: true,
                relay_default_data_path: false,
                relay_url: "wss://relay.musu.pro/api/v1/relay/connect".to_string(),
                relay_connect_path: "/api/v1/relay/connect".to_string(),
                relay_transport_kind: "websocket_tunnel".to_string(),
                release_grade_transport_required: "quic_tls_1_3".to_string(),
                payload_transit_requires_lease: true,
                policy: "connect_pro_fallback_only".to_string(),
                relay_lease_store_configured: true,
                relay_lease_store_backend: Some("upstash_redis".to_string()),
                relay_lease_store_release_grade: true,
                blockers: vec![],
            },
        );

        assert!(report.relay_transport_preflight_ok);
        assert!(report.relay_transport_descriptor_wired);
        assert!(report.relay_transport_wired);
        assert!(report.relay_connect_endpoint_wired);
        assert!(report.relay_payload_endpoint_wired);
        assert!(report.relay_payload_queue_endpoint_wired);
        assert!(!report.relay_default_data_path);
        assert!(report.relay_lease_store_configured);
        assert_eq!(
            report.relay_lease_store_backend.as_deref(),
            Some("upstash_redis")
        );
        assert!(report.relay_lease_store_release_grade);
        assert!(report.relay_transport_blockers.is_empty());
    }

    #[test]
    fn cli_route_uses_https_endpoint_when_candidate_metadata_requires_it() {
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "192.168.1.50:8070".to_string(),
            name: Some("remote".to_string()),
            source: crate::peer::discovery::PeerSource::Cache,
            meta: Some(serde_json::json!({
                "transport_scheme": "https",
                "peer_public_key": "sha256:abcdef",
            })),
        };

        let base = route_base_url_for_addr(&peer.addr, Some(&peer));

        assert_eq!(base, "https://192.168.1.50:8070");
        assert_eq!(
            route_delegate_url(&base),
            "https://192.168.1.50:8070/api/tasks/delegate"
        );
        assert_eq!(
            route_task_status_url(&base, "task-123"),
            "https://192.168.1.50:8070/api/tasks/task-123"
        );
        assert_eq!(
            route_expected_tls_fingerprint(Some(&peer)).as_deref(),
            Some("sha256:abcdef")
        );
    }

    #[test]
    fn cli_route_does_not_claim_fingerprint_proof_for_http_candidates() {
        let peer = crate::peer::discovery::ResolvedPeer {
            addr: "192.168.1.50:8070".to_string(),
            name: Some("remote".to_string()),
            source: crate::peer::discovery::PeerSource::Cache,
            meta: Some(serde_json::json!({
                "transport_scheme": "http",
                "peer_public_key": "sha256:abcdef",
            })),
        };

        assert_eq!(
            route_base_url_for_addr(&peer.addr, Some(&peer)),
            "http://192.168.1.50:8070"
        );
        assert_eq!(route_expected_tls_fingerprint(Some(&peer)), None);
    }

    #[test]
    fn cli_route_evidence_records_successful_fingerprint_pinned_transport() {
        let tmp = tempfile::tempdir().unwrap();
        let evidence_path = tmp.path().join("route-evidence.json");
        let opts = RouteOpts {
            text: "test".to_string(),
            target: Some("remote".to_string()),
            channel: "cli".to_string(),
            wait: false,
            wait_timeout_sec: ROUTE_WAIT_DEFAULT_TIMEOUT_SECS,
            gpu: false,
            explain: false,
            json: false,
            route_evidence_path: Some(evidence_path.clone()),
        };

        write_route_evidence_if_requested(
            &opts,
            "192.168.1.50:8070",
            "remote",
            Some(12),
            34,
            RouteAttemptEvidenceResult::Success,
            None,
            Some(https_fingerprint_transport_proof("sha256:abcdef")),
        )
        .unwrap();

        let value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(evidence_path).unwrap()).unwrap();
        assert_eq!(value["peer_identity_verified"], true);
        assert_eq!(value["peer_identity_method"], "tls_cert_fingerprint_pin");
        assert_eq!(value["peer_public_key"], "sha256:abcdef");
        assert_eq!(value["encryption"], "https_tls_fingerprint_pin");
        assert_eq!(
            value["transport_verified_by"],
            crate::bridge::route_evidence::HTTPS_FINGERPRINT_TRANSPORT_VERIFIER
        );
    }

    #[test]
    fn doctor_background_file_sync_state_reads_shares() {
        let _guard = ENV_LOCK.lock().unwrap();
        clear_background_env();
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join(".musu");
        std::fs::create_dir_all(&home).unwrap();
        let mut shares = SharesConfig::default();
        shares.add("F:\\workspace", true, Some("workspace".to_string()));
        shares.save(&home).unwrap();

        let (root_count, writable) = background_file_sync_state(&home);

        assert_eq!(root_count, 1);
        assert!(writable);
    }

    #[test]
    fn doctor_background_defaults_are_low_duty() {
        let _guard = ENV_LOCK.lock().unwrap();
        clear_background_env();
        let tmp = tempfile::tempdir().unwrap();

        let background = check_background_features(tmp.path(), false);

        assert_eq!(background.status, DoctorLevel::Ok);
        assert!(!background.mdns.enabled);
        assert!(!background.clipboard_sync.enabled);
        assert_eq!(background.cloud_heartbeat_interval_sec, 300);
        assert_eq!(background.cloud_heartbeat_floor_sec, 60);
        assert_eq!(background.file_serve_root_count, 0);
        assert!(!background.relay_payload_poller.enabled);
        assert_eq!(
            background.relay_payload_poller_interval_sec,
            crate::bridge::handlers::relay_payload::RELAY_PAYLOAD_POLLER_DEFAULT_INTERVAL_SEC
        );
        assert_eq!(
            background.relay_payload_poller_interval_floor_sec,
            crate::bridge::handlers::relay_payload::RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC
        );
        assert_eq!(
            background.relay_payload_poller_empty_backoff_max_sec,
            crate::bridge::handlers::relay_payload::RELAY_PAYLOAD_POLLER_DEFAULT_EMPTY_BACKOFF_MAX_SEC
        );
        assert_eq!(background.relay_payload_poller_limit, 1);
        assert_eq!(
            background.planner_interval_sec,
            crate::brain::planner::PLANNER_DEFAULT_INTERVAL_SEC
        );
        assert_eq!(
            background.planner_interval_floor_sec,
            crate::brain::planner::PLANNER_MIN_INTERVAL_SEC
        );
        assert_eq!(
            background.planner_command_timeout_sec,
            crate::brain::planner::PLANNER_DEFAULT_COMMAND_TIMEOUT_SEC
        );
    }

    #[test]
    fn doctor_background_warns_for_hot_opt_ins_and_floors_heartbeat() {
        let _guard = ENV_LOCK.lock().unwrap();
        clear_background_env();
        std::env::set_var("MUSU_ENABLE_MDNS", "1");
        std::env::set_var("MUSU_ENABLE_CLIPBOARD_SYNC", "true");
        std::env::set_var("MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC", "5");
        let tmp = tempfile::tempdir().unwrap();

        let background = check_background_features(tmp.path(), true);

        assert_eq!(background.status, DoctorLevel::Warn);
        assert!(background.mdns.enabled);
        assert!(background.clipboard_sync.enabled);
        assert!(background.cloud_registration.enabled);
        assert_eq!(background.cloud_heartbeat_interval_sec, 60);

        std::env::remove_var("MUSU_ENABLE_MDNS");
        std::env::remove_var("MUSU_ENABLE_CLIPBOARD_SYNC");
        std::env::remove_var("MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC");
    }

    #[test]
    fn doctor_background_floors_planner_loop_budget() {
        let _guard = ENV_LOCK.lock().unwrap();
        clear_background_env();
        std::env::set_var("MUSU_ENABLE_PLANNER", "1");
        std::env::set_var("MUSU_PLANNER_INTERVAL_SEC", "0");
        std::env::set_var("MUSU_PLANNER_COMMAND_TIMEOUT_SEC", "9999");
        let tmp = tempfile::tempdir().unwrap();

        let background = check_background_features(tmp.path(), false);

        assert_eq!(background.status, DoctorLevel::Warn);
        assert!(background.planner.enabled);
        assert_eq!(
            background.planner_interval_sec,
            crate::brain::planner::PLANNER_MIN_INTERVAL_SEC
        );
        assert_eq!(
            background.planner_command_timeout_sec,
            crate::brain::planner::PLANNER_MAX_COMMAND_TIMEOUT_SEC
        );
        assert_eq!(
            background.planner_command_timeout_floor_sec,
            crate::brain::planner::PLANNER_MIN_COMMAND_TIMEOUT_SEC
        );
        assert_eq!(
            background.planner_command_timeout_ceiling_sec,
            crate::brain::planner::PLANNER_MAX_COMMAND_TIMEOUT_SEC
        );
    }

    #[test]
    fn doctor_background_warns_and_floors_relay_payload_poller_budget() {
        let _guard = ENV_LOCK.lock().unwrap();
        clear_background_env();
        std::env::set_var("MUSU_ENABLE_RELAY_PAYLOAD_POLLER", "1");
        std::env::set_var("MUSU_RELAY_PAYLOAD_POLLER_INTERVAL_SEC", "0");
        std::env::set_var("MUSU_RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_SEC", "5");
        std::env::set_var("MUSU_RELAY_PAYLOAD_POLLER_LIMIT", "999");
        let tmp = tempfile::tempdir().unwrap();

        let background = check_background_features(tmp.path(), false);

        assert_eq!(background.status, DoctorLevel::Warn);
        assert!(background.relay_payload_poller.enabled);
        assert_eq!(
            background.relay_payload_poller_interval_sec,
            crate::bridge::handlers::relay_payload::RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC
        );
        assert_eq!(
            background.relay_payload_poller_empty_backoff_max_sec,
            crate::bridge::handlers::relay_payload::RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC
        );
        assert_eq!(background.relay_payload_poller_limit, 5);
    }

    fn clear_background_env() {
        for name in [
            "MUSU_ENABLE_MDNS",
            "MUSU_MDNS_ENABLE_IPV6",
            "MUSU_MDNS_ENABLE_TAILSCALE",
            "MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES",
            "MUSU_ENABLE_CLIPBOARD_SYNC",
            "MUSU_ENABLE_RELAY_PAYLOAD_POLLER",
            "MUSU_RELAY_PAYLOAD_POLLER_INTERVAL_SEC",
            "MUSU_RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_SEC",
            "MUSU_RELAY_PAYLOAD_POLLER_LIMIT",
            "MUSU_ENABLE_PLANNER",
            "MUSU_PLANNER_INTERVAL_SEC",
            "MUSU_PLANNER_COMMAND_TIMEOUT_SEC",
            "MUSU_FILE_SERVE_ROOTS",
            "MUSU_FILE_SERVE_WRITABLE",
            "MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC",
        ] {
            std::env::remove_var(name);
        }
    }
}
