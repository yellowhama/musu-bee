//! CLI command handlers for share, route, ls, get, put — V27.
//!
//! Each public `run_*` function corresponds to a `Cmd::*` variant wired
//! from `main.rs`. They resolve peer addresses from `nodes.toml` /
//! `manual_peers.toml`, authenticate with `MUSU_BRIDGE_TOKEN` /
//! `MUSU_TOKEN`, and print operator-friendly output.

use anyhow::Result;
use clap::{Args, Subcommand};
use serde::Serialize;

use crate::bridge::route_evidence::{
    build_route_attempt_evidence, elapsed_ms, local_node_id, write_route_attempt_evidence,
    RouteAttemptEvidenceInput, RouteAttemptEvidenceResult, CLI_ROUTE_EVIDENCE_NOTE,
};

use super::shares::SharesConfig;

const BRIDGE_HEALTH_TIMEOUT_SECS: u64 = 10;

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
}

/// Options for `musu relay status`.
#[derive(Args, Debug)]
pub struct RelayStatusOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
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

    let url = format!("http://{addr}/api/tasks/delegate");
    let client = reqwest::Client::new();
    let route_started = std::time::Instant::now();
    let handshake_ms: Option<u64>;
    let mut route_result = RouteAttemptEvidenceResult::Failed;
    let mut failure_class: Option<String> = None;

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
    let resp = match client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(resp) => {
            handshake_ms = Some(elapsed_ms(submit_started.elapsed()));
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
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                let status_url = format!("http://{}/api/tasks/{}", addr, task_id);
                let status_resp = client
                    .get(&status_url)
                    .bearer_auth(&token)
                    .timeout(std::time::Duration::from_secs(10))
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
    )?;
    Ok(())
}

fn write_route_evidence_if_requested(
    opts: &RouteOpts,
    candidate_addr: &str,
    target_node_id: &str,
    handshake_ms: Option<u64>,
    total_attempt_ms: u64,
    result: RouteAttemptEvidenceResult,
    failure_class: Option<String>,
) -> Result<()> {
    let Some(path) = opts.route_evidence_path.as_deref() else {
        return Ok(());
    };
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
        peer_identity_verified: false,
        peer_identity_method: None,
        peer_public_key: None,
        encryption: "none_http_bearer".to_string(),
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
            .map(|p| format!("http://{}/api/tasks/delegate", p.addr))
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
    let peer_identity_verified = candidate_peer_identity_verified(meta.as_ref());
    let peer_identity_method =
        candidate_peer_identity_method(meta.as_ref(), peer_identity_verified);
    let encryption = candidate_encryption(meta.as_ref(), peer_identity_verified);
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

fn candidate_peer_identity_verified(meta: Option<&serde_json::Value>) -> bool {
    meta.and_then(|meta| meta.get("peer_identity_verified"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
        && candidate_peer_public_key(meta).is_some()
}

fn candidate_peer_identity_method(
    meta: Option<&serde_json::Value>,
    verified: bool,
) -> Option<String> {
    if verified {
        candidate_meta_string(meta, &["peer_identity_method"])
            .or_else(|| Some("tls_cert_fingerprint_pin".to_string()))
    } else {
        candidate_peer_public_key(meta)
            .as_ref()
            .map(|_| "advertised_tls_cert_fingerprint_unverified".to_string())
    }
}

fn candidate_encryption(meta: Option<&serde_json::Value>, verified: bool) -> String {
    if verified {
        candidate_meta_string(meta, &["encryption"])
            .unwrap_or_else(|| "https_tls_fingerprint_pin".to_string())
    } else {
        "none_http_bearer".to_string()
    }
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
    }
}

#[derive(Debug, Serialize)]
struct RelayStatusReport {
    schema: &'static str,
    registry_url: &'static str,
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
    relay_transport_wired: bool,
    relay_default_data_path: bool,
    release_route_evidence_ready: bool,
    path_priority: Vec<&'static str>,
    next_steps: Vec<&'static str>,
}

async fn run_relay_status(opts: RelayStatusOpts) -> Result<()> {
    let home = musu_home();
    let token_present =
        crate::cloud::token::load_token(&home).is_some_and(|token| !token.trim().is_empty());
    let cached_registry = crate::peer::discovery::CachedRegistry::load(&home);
    let cached_node_count = cached_registry
        .as_ref()
        .map(|cache| cache.nodes.len())
        .unwrap_or(0);

    let report = RelayStatusReport {
        schema: "musu.relay_status.v1",
        registry_url: "https://musu.pro",
        logged_in: token_present,
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
        relay_transport_wired: false,
        relay_default_data_path: false,
        release_route_evidence_ready: false,
        path_priority: vec!["lan", "tailscale", "direct_quic", "relay"],
        next_steps: vec![
            "verify rendezvous target-candidate-assisted routing on a real second PC route",
            "verify HTTPS fingerprint pinning on a real second PC route, then replace bridge HTTP/TLS with QUIC/TLS proof",
            "wire relay/tunnel transport behind the Connect/Pro fallback lease policy",
        ],
    };

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
    println!("  relay transport wired: {}", report.relay_transport_wired);
    println!(
        "  relay default data path: {}",
        report.relay_default_data_path
    );
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
struct UpReport {
    ok: bool,
    token_created: bool,
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

    let bridge_check = check_bridge(&home).await;
    let dashboard_check = check_dashboard().await;
    let distribution = crate::install::distribution::DistributionMode::current()
        .as_str()
        .to_string();
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
    ];
    if cfg!(windows) {
        levels.push(package_check.status);
    }
    let overall = summarize_levels(&levels);

    let next_steps = next_steps_for(
        &account_check,
        bridge_check.status,
        dashboard_check.status,
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

    let dashboard = check_dashboard().await;
    let mut dashboard_open_error = None;
    if opts.open_dashboard {
        let url = dashboard
            .reachable_url
            .as_deref()
            .unwrap_or(dashboard.dev_url.as_str());
        if let Err(err) = open_url(url) {
            dashboard_open_error = Some(err.to_string());
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
    if dashboard.status != DoctorLevel::Ok {
        next_steps
            .push("Start the dashboard from `musu-bee`: `npm run dev` or `npm start`.".into());
    }
    if next_steps.is_empty() {
        next_steps.push("Open the dashboard and run a first agent task.".into());
    }

    let report = UpReport {
        ok,
        token_created,
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

async fn check_dashboard() -> DoctorDashboard {
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
                    note: "Dashboard is reachable.".into(),
                };
            }
        }
    }

    DoctorDashboard {
        status: DoctorLevel::Warn,
        dev_url: "http://127.0.0.1:3000/app".into(),
        start_url: "http://127.0.0.1:3001/app".into(),
        reachable_url: None,
        note: "Dashboard is not reachable from this shell. Start `musu-bee` with `npm run dev` or `npm start`.".into(),
    }
}

async fn wait_for_bridge(home: &std::path::Path, timeout: std::time::Duration) -> DoctorBridge {
    let deadline = std::time::Instant::now() + timeout;
    let mut last = check_bridge(home).await;
    while std::time::Instant::now() < deadline {
        if bridge_reachable(&last) {
            return last;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        last = check_bridge(home).await;
    }
    last
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
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
    }

    cmd.spawn().map_err(Into::into)
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
    if matches!(dashboard, DoctorLevel::Warn | DoctorLevel::Fail) {
        steps.push("Start the dashboard from `musu-bee`: `npm run dev` for port 3000 or `npm start` for port 3001.".into());
    }
    if steps.is_empty() {
        steps.push(
            "System looks ready. Use the dashboard or `musu route --wait <task>` to run work."
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
    println!("bridge log: {}", report.bridge_log_path);
    println!("dashboard: {}", report.dashboard.status.label());
    println!("dashboard dev: {}", report.dashboard.dev_url);
    println!("dashboard start: {}", report.dashboard.start_url);
    if let Some(err) = &report.dashboard_open_error {
        println!("dashboard open failed: {err}");
    }
    println!();
    println!("Next steps:");
    for step in &report.next_steps {
        println!("  - {step}");
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
pub async fn run_status() -> Result<()> {
    let _home = musu_home();
    let token = get_token();
    let url = format!("{}/api/fleet/status", local_bridge_base_url());
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
                println!("  1. Run `musu doctor` to verify local state.");
                println!("  2. Start the bridge with `musu bridge` if it is not already running.");
                println!(
                    "  3. Open the dashboard: http://127.0.0.1:3000/app or http://127.0.0.1:3001/app"
                );
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
    fn candidate_report_preserves_verified_fingerprint_pin_metadata() {
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

        assert!(candidate.peer_identity_verified);
        assert_eq!(
            candidate.peer_identity_method.as_deref(),
            Some("tls_cert_fingerprint_pin")
        );
        assert!(candidate.peer_public_key_present);
        assert!(candidate.https_fingerprint_pin_available);
        assert_eq!(candidate.encryption, "https_tls_fingerprint_pin");
    }
}
