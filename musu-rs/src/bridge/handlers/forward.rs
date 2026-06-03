//! Task forwarding — V27.
//!
//! Handles receiving forwarded tasks from peer nodes and
//! sending tasks to remote peers.
//!
//! V27-F1: result callback — when a forwarded task completes, the
//! executing node POSTs a `TaskCallback` to the originating node's
//! `/api/tasks/callback` endpoint so it can update its local row.

use std::net::SocketAddr;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::route_evidence::elapsed_ms;
use crate::bridge::AppState;
use crate::peer::discovery::ResolvedPeer;
use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

/// A task forwarded from a peer node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardedTask {
    /// Name of the node that originally received the task.
    pub source_node: String,
    /// Original task ID on the source node (for tracking).
    pub source_task_id: String,
    /// Channel for the task.
    pub channel: String,
    /// Sender ID.
    pub sender_id: String,
    /// The prompt/instruction text.
    pub text: String,
    /// Adapter type override.
    #[serde(default)]
    pub adapter_type: Option<String>,
    /// Model override.
    #[serde(default)]
    pub model: Option<String>,
    /// Working directory on the target machine.
    #[serde(default)]
    pub cwd: Option<String>,
    /// Deadline propagation.
    #[serde(default)]
    pub deadline_unix_ms: Option<i64>,
    /// Company ID.
    #[serde(default)]
    pub company_id: Option<String>,
    /// Timeout in seconds.
    #[serde(default)]
    pub timeout_sec: Option<u32>,
    /// V27-F1: URL to POST result back to when task completes.
    #[serde(default)]
    pub callback_url: Option<String>,
    /// Short-lived `musu.pro` rendezvous session for this route attempt.
    #[serde(default)]
    pub rendezvous_session_id: Option<String>,
    /// Target-side node id expected by the rendezvous session.
    #[serde(default)]
    pub rendezvous_target_node_id: Option<String>,
}

/// Response after receiving a forwarded task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardResponse {
    pub task_id: String,
    pub status: String,
    pub node: String,
}

#[derive(Debug, Clone)]
pub struct ForwardAttemptReport {
    pub response: ForwardResponse,
    pub route_peer: ResolvedPeer,
    pub rendezvous_session_id: Option<String>,
    pub handshake_ms: Option<u64>,
    pub total_attempt_ms: u64,
    pub transport_proof: Option<crate::bridge::route_evidence::RouteTransportProof>,
}

#[derive(Debug, Clone)]
pub struct ForwardAttemptError {
    pub message: String,
    pub route_peer: ResolvedPeer,
    pub rendezvous_session_id: Option<String>,
    pub handshake_ms: Option<u64>,
    pub total_attempt_ms: u64,
    pub failure_class: String,
    pub relay_fallback: Option<crate::bridge::route_evidence::RouteRelayFallbackEvidence>,
}

fn peer_meta_string(peer: &ResolvedPeer, key: &str) -> Option<String> {
    peer.meta
        .as_ref()
        .and_then(|meta| meta.get(key))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn peer_transport_scheme(peer: &ResolvedPeer) -> String {
    if peer.addr.trim_start().starts_with("https://") {
        return "https".to_string();
    }
    if peer.addr.trim_start().starts_with("http://") {
        return "http".to_string();
    }
    if let Some(scheme) = peer_meta_string(peer, "transport_scheme") {
        if matches!(scheme.as_str(), "http" | "https") {
            return scheme;
        }
    }
    if let Some(public_url) = peer_meta_string(peer, "public_url") {
        if let Ok(url) = reqwest::Url::parse(&public_url) {
            if matches!(url.scheme(), "http" | "https") {
                return url.scheme().to_string();
            }
        }
    }
    "http".to_string()
}

fn peer_public_key_fingerprint(peer: &ResolvedPeer) -> Option<String> {
    peer_meta_string(peer, "peer_public_key")
        .or_else(|| peer_meta_string(peer, "public_key"))
        .or_else(|| peer_meta_string(peer, "cert_fingerprint"))
        .filter(|value| value.starts_with("sha256:"))
}

fn forward_url_for_peer(peer: &ResolvedPeer) -> String {
    let addr = peer.addr.trim().trim_end_matches('/');
    let base = if addr.starts_with("http://") || addr.starts_with("https://") {
        addr.to_string()
    } else {
        format!("{}://{}", peer_transport_scheme(peer), addr)
    };
    format!("{}/api/tasks/forward", base.trim_end_matches('/'))
}

const AUDIT_FRAGMENT_MAX_CHARS: usize = 160;

fn audit_fragment(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= AUDIT_FRAGMENT_MAX_CHARS {
        return trimmed.to_string();
    }

    let mut out: String = trimmed.chars().take(AUDIT_FRAGMENT_MAX_CHARS).collect();
    out.push_str("...");
    out
}

fn audit_fragment_or_none(value: Option<&str>) -> String {
    value
        .map(audit_fragment)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "none".to_string())
}

fn forwarded_task_audit_note(task_id: &str, req: &ForwardedTask) -> String {
    format!(
        "accepted forwarded task task_id={} source_node={} source_task_id={} rendezvous_session_id={} rendezvous_target_node_id={}",
        audit_fragment(task_id),
        audit_fragment(&req.source_node),
        audit_fragment(&req.source_task_id),
        audit_fragment_or_none(req.rendezvous_session_id.as_deref()),
        audit_fragment_or_none(req.rendezvous_target_node_id.as_deref())
    )
}

fn relay_fallback_status_label(
    status: &crate::bridge::rendezvous::RelayLeaseFallbackStatus,
) -> &'static str {
    match status {
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::SkippedNoToken => "skipped_no_token",
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::SkippedNoSession => {
            "skipped_no_session"
        }
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::Denied => "denied",
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::Issued => "issued",
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::Failed => "failed",
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::TimedOut => "timed_out",
    }
}

fn attempted_route_kind_labels(
    attempted_peers: &[ResolvedPeer],
    fallback_peer: &ResolvedPeer,
) -> Vec<String> {
    let mut kinds = Vec::new();
    for peer in attempted_peers.iter().chain(std::iter::once(fallback_peer)) {
        let kind = crate::bridge::route_evidence::route_evidence_kind_for_addr(&peer.addr);
        if !kinds.iter().any(|existing| existing == kind) {
            kinds.push(kind.to_string());
        }
    }
    kinds
}

fn relay_fallback_route_evidence(
    relay: &crate::bridge::rendezvous::RelayLeaseFallback,
    fallback_peer: &ResolvedPeer,
    attempted_peers: &[ResolvedPeer],
    requested_capability: Option<&str>,
) -> crate::bridge::route_evidence::RouteRelayFallbackEvidence {
    let lease_requested = !matches!(
        relay.status,
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::SkippedNoToken
            | crate::bridge::rendezvous::RelayLeaseFallbackStatus::SkippedNoSession
    );

    crate::bridge::route_evidence::RouteRelayFallbackEvidence {
        direct_path_failed: true,
        lease_requested,
        status: relay_fallback_status_label(&relay.status).to_string(),
        lease_issued: relay.lease_issued,
        attempted_route_kinds: attempted_route_kind_labels(attempted_peers, fallback_peer),
        requested_capability: requested_capability.map(str::to_string),
        policy: relay.policy.clone(),
        blockers: relay.blockers.clone(),
        lease_id: relay.lease_id.clone(),
        failure_class: relay.failure_class.clone(),
    }
}

/// POST /api/tasks/forward — receive a forwarded task from a peer.
///
/// Handles receiving forwarded tasks, with an optional workspace ZIP context.
pub async fn receive_forwarded(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    mut multipart: axum::extract::Multipart,
) -> Result<(StatusCode, Json<ForwardResponse>)> {
    let mut task_req: Option<ForwardedTask> = None;
    let mut zip_data: Option<axum::body::Bytes> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| MusuError::BadRequest(e.to_string()))?
    {
        if let Some(name) = field.name() {
            if name == "task" {
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| MusuError::BadRequest(e.to_string()))?;
                task_req = serde_json::from_slice(&bytes).ok();
            } else if name == "workspace" {
                zip_data = field.bytes().await.ok();
            }
        }
    }

    let req = task_req.ok_or_else(|| MusuError::BadRequest("missing task metadata".into()))?;

    // Validate
    if req.text.is_empty() || req.text.len() > 10_000 {
        return Err(MusuError::BadRequest("text must be 1..10000 chars".into()));
    }
    if req.channel.is_empty() {
        return Err(MusuError::BadRequest("channel required".into()));
    }

    let task_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    // Setup working directory and unpack zip if present
    let cwd = if let Some(zip_bytes) = zip_data {
        let dest_dir = std::env::temp_dir().join("musu_workspaces").join(&task_id);
        std::fs::create_dir_all(&dest_dir).map_err(|e| MusuError::Internal(e.to_string()))?;

        let zip_path = dest_dir.join("workspace.zip");
        std::fs::write(&zip_path, zip_bytes).map_err(|e| MusuError::Internal(e.to_string()))?;

        crate::peer::context_sync::unpack_workspace(&zip_path, &dest_dir)
            .map_err(|e| MusuError::Internal(format!("failed to unpack workspace: {}", e)))?;

        std::fs::remove_file(&zip_path).ok();
        dest_dir
    } else {
        req.cwd
            .clone()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| {
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            })
    };

    // Insert pending row
    sqlx::query(
        "INSERT INTO route_executions (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
         VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    )
    .bind(&task_id)
    .bind(&req.company_id)
    .bind(&req.channel)
    .bind(&req.sender_id)
    .bind(format!("fwd:{}", req.source_task_id))
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    crate::writer::runner::TaskUpdate {
        task_id: &task_id,
        company_id: req.company_id.as_deref(),
        channel: Some(&req.channel),
        sender_id: Some(&req.sender_id),
        prompt: Some(&req.text),
        status: "pending",
        created_at: Some(now),
        ..Default::default()
    }
    .save();

    // Spawn task locally
    state
        .task_runner
        .spawn_task(crate::writer::TaskSpec {
            task_id: task_id.clone(),
            company_id: req.company_id.clone(),
            channel: req.channel.clone(),
            sender_id: req.sender_id.clone(),
            prompt: req.text.clone(),
            expected_output: None,
            cwd,
            model: req.model.clone(),
            timeout_sec: req.timeout_sec,
            adapter_type: req.adapter_type.clone().unwrap_or_else(|| "claude".into()),
            callback_url: req.callback_url.clone(),
            source_task_id: Some(req.source_task_id.clone()),
        })
        .await
        .map_err(|e| MusuError::Internal(format!("spawn forwarded task: {e}")))?;

    state
        .audit
        .write(crate::bridge::audit::AuditEntry {
            actor_ip: addr.ip(),
            method: "POST".to_string(),
            path: "/api/tasks/forward".to_string(),
            status_code: StatusCode::ACCEPTED.as_u16(),
            agent_id: None,
            note: Some(forwarded_task_audit_note(&task_id, &req)),
            company_id: req.company_id.clone(),
            cross_machine: true,
        })
        .await;

    tracing::info!(
        task_id = %task_id,
        source_node = %req.source_node,
        source_task_id = %req.source_task_id,
        rendezvous_session_id = req.rendezvous_session_id.as_deref().unwrap_or(""),
        "accepted forwarded task from peer"
    );

    if let Some(session_id) = req.rendezvous_session_id.clone() {
        crate::bridge::rendezvous::spawn_publish_target_candidates(
            state.clone(),
            session_id,
            req.source_task_id.clone(),
            req.rendezvous_target_node_id.clone(),
        );
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(ForwardResponse {
            task_id,
            status: "queued".into(),
            node: state.config.node_name.clone(),
        }),
    ))
}

async fn forward_to_peer_attempt(
    client: &reqwest::Client,
    peer: &ResolvedPeer,
    task: ForwardedTask,
    token: &str,
) -> std::result::Result<ForwardAttemptReport, ForwardAttemptError> {
    let url = forward_url_for_peer(peer);
    let total_started = std::time::Instant::now();
    let expected_tls_fingerprint = (peer_transport_scheme(peer) == "https")
        .then(|| peer_public_key_fingerprint(peer))
        .flatten();
    let pinned_client = if let Some(fingerprint) = expected_tls_fingerprint.as_deref() {
        Some(
            crate::bridge::tls_pin::fingerprint_pinned_client(fingerprint).map_err(|err| {
                ForwardAttemptError {
                    message: format!("forward TLS client error: {err}"),
                    route_peer: peer.clone(),
                    rendezvous_session_id: None,
                    handshake_ms: None,
                    total_attempt_ms: elapsed_ms(total_started.elapsed()),
                    failure_class: "forward_tls_client_build_error".to_string(),
                    relay_fallback: None,
                }
            })?,
        )
    } else {
        None
    };
    let request_client = pinned_client.as_ref().unwrap_or(client);

    tracing::info!(
        url = %url,
        source_task_id = %task.source_task_id,
        tls_fingerprint_pin = expected_tls_fingerprint.is_some(),
        "forwarding task to peer"
    );

    let task_json = serde_json::to_string(&task).map_err(|e| ForwardAttemptError {
        message: format!("serialize task: {e}"),
        route_peer: peer.clone(),
        rendezvous_session_id: None,
        handshake_ms: None,
        total_attempt_ms: elapsed_ms(total_started.elapsed()),
        failure_class: "forward_serialize_error".to_string(),
        relay_fallback: None,
    })?;
    let part = reqwest::multipart::Part::text(task_json)
        .mime_str("application/json")
        .unwrap();
    let form = reqwest::multipart::Form::new().part("task", part);

    let submit_started = std::time::Instant::now();
    let resp = request_client
        .post(&url)
        .bearer_auth(token)
        .multipart(form)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| ForwardAttemptError {
            message: format!("forward HTTP error: {e}"),
            route_peer: peer.clone(),
            rendezvous_session_id: None,
            handshake_ms: Some(elapsed_ms(submit_started.elapsed())),
            total_attempt_ms: elapsed_ms(total_started.elapsed()),
            failure_class: "forward_http_error".to_string(),
            relay_fallback: None,
        })?;
    let handshake_ms = Some(elapsed_ms(submit_started.elapsed()));

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ForwardAttemptError {
            message: format!("peer returned {status}: {body}"),
            route_peer: peer.clone(),
            rendezvous_session_id: None,
            handshake_ms,
            total_attempt_ms: elapsed_ms(total_started.elapsed()),
            failure_class: format!("peer_http_status_{}", status.as_u16()),
            relay_fallback: None,
        });
    }

    let response = resp
        .json::<ForwardResponse>()
        .await
        .map_err(|e| ForwardAttemptError {
            message: format!("forward response parse: {e}"),
            route_peer: peer.clone(),
            rendezvous_session_id: None,
            handshake_ms,
            total_attempt_ms: elapsed_ms(total_started.elapsed()),
            failure_class: "forward_response_parse".to_string(),
            relay_fallback: None,
        })?;

    let transport_proof = expected_tls_fingerprint
        .as_deref()
        .map(crate::bridge::route_evidence::https_fingerprint_transport_proof);

    Ok(ForwardAttemptReport {
        response,
        route_peer: peer.clone(),
        rendezvous_session_id: None,
        handshake_ms,
        total_attempt_ms: elapsed_ms(total_started.elapsed()),
        transport_proof,
    })
}

/// Forward a task with automatic retry on failure.
///
/// Retries up to `max_retries` times with exponential backoff (1s, 2s, 4s).
pub async fn forward_to_peer_with_retry(
    state: &AppState,
    peer: &ResolvedPeer,
    mut task: ForwardedTask,
    max_retries: u32,
) -> std::result::Result<ForwardAttemptReport, ForwardAttemptError> {
    let route_started = std::time::Instant::now();
    let rendezvous =
        crate::bridge::rendezvous::prepare_forward_rendezvous(state, peer, Some("task_forward"))
            .await;
    let route_peer = rendezvous
        .route_peer
        .clone()
        .unwrap_or_else(|| peer.clone());
    if let Some(session_id) = rendezvous.session_id.clone() {
        let target_node_id = crate::bridge::route_evidence::target_node_id(peer);
        tracing::debug!(
            peer = %peer.addr,
            session_id = %session_id,
            target_node_id = %target_node_id,
            target_candidate_count = rendezvous.target_candidate_count,
            selected_candidate = %route_peer.addr,
            "attaching rendezvous session to forwarded task"
        );
        task.rendezvous_session_id = Some(session_id);
        task.rendezvous_target_node_id = Some(target_node_id);
    }
    if route_peer.addr != peer.addr {
        tracing::info!(
            original_peer = %peer.addr,
            selected_peer = %route_peer.addr,
            selected_route_kind = crate::bridge::router::route_kind_for_addr(&route_peer.addr).as_str(),
            "using rendezvous target candidate for forward attempt"
        );
    }
    if let Some(failure_class) = rendezvous.failure_class.as_deref() {
        tracing::debug!(
            peer = %peer.addr,
            status = ?rendezvous.status,
            failure_class,
            "rendezvous was not available for this route attempt"
        );
    }

    let session_id = task.rendezvous_session_id.clone();
    let attempted_route_peers = if route_peer.addr != peer.addr {
        vec![route_peer.clone(), peer.clone()]
    } else {
        vec![route_peer.clone()]
    };
    let mut last_err: Option<ForwardAttemptError> = None;
    for attempt in 0..=max_retries {
        match forward_to_peer_attempt(
            &state.http_client,
            &route_peer,
            task.clone(),
            &state.config.token,
        )
        .await
        {
            Ok(mut report) => {
                report.total_attempt_ms = elapsed_ms(route_started.elapsed());
                report.rendezvous_session_id = session_id.clone();
                if let Some(session_id) = session_id.clone() {
                    let musu_home = state
                        .config
                        .nodes_toml_path
                        .parent()
                        .unwrap_or_else(|| std::path::Path::new("."))
                        .to_path_buf();
                    crate::bridge::rendezvous::spawn_close_rendezvous_session(
                        musu_home,
                        session_id,
                        "forward",
                        task.source_task_id.clone(),
                    );
                }
                return Ok(report);
            }
            Err(e) => {
                let mut e = e;
                e.rendezvous_session_id = session_id.clone();
                let err_message = e.message.clone();
                last_err = Some(e);
                if attempt < max_retries {
                    let delay = std::time::Duration::from_secs(1 << attempt);
                    tracing::warn!(
                        peer = %peer.addr,
                        attempt = attempt + 1,
                        max = max_retries,
                        delay_sec = delay.as_secs(),
                        err = %err_message,
                        "forward failed, retrying"
                    );
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }
    if route_peer.addr != peer.addr {
        tracing::warn!(
            original_peer = %peer.addr,
            selected_peer = %route_peer.addr,
            "rendezvous target candidate failed; falling back to original selected peer"
        );
        match forward_to_peer_attempt(&state.http_client, peer, task.clone(), &state.config.token)
            .await
        {
            Ok(mut report) => {
                report.total_attempt_ms = elapsed_ms(route_started.elapsed());
                report.rendezvous_session_id = session_id.clone();
                if let Some(session_id) = session_id.clone() {
                    let musu_home = state
                        .config
                        .nodes_toml_path
                        .parent()
                        .unwrap_or_else(|| std::path::Path::new("."))
                        .to_path_buf();
                    crate::bridge::rendezvous::spawn_close_rendezvous_session(
                        musu_home,
                        session_id,
                        "forward",
                        task.source_task_id.clone(),
                    );
                }
                return Ok(report);
            }
            Err(e) => {
                let mut e = e;
                e.rendezvous_session_id = session_id.clone();
                last_err = Some(e);
            }
        }
    }
    let mut err = last_err.unwrap_or_else(|| ForwardAttemptError {
        message: "forward failed before first attempt".to_string(),
        route_peer: route_peer.clone(),
        rendezvous_session_id: session_id.clone(),
        handshake_ms: None,
        total_attempt_ms: elapsed_ms(route_started.elapsed()),
        failure_class: "forward_no_attempt".to_string(),
        relay_fallback: None,
    });
    let total_attempts = max_retries + 1 + if route_peer.addr != peer.addr { 1 } else { 0 };
    err.message = format!(
        "forward failed after {} attempts: {}",
        total_attempts, err.message
    );
    err.total_attempt_ms = elapsed_ms(route_started.elapsed());
    err.failure_class = "forward_failed_after_retries".to_string();
    let relay = crate::bridge::rendezvous::request_relay_lease_after_direct_failure(
        state,
        peer,
        session_id.as_deref(),
        &attempted_route_peers,
        &err.failure_class,
        Some("remote_command"),
    )
    .await;
    tracing::debug!(
        peer = %peer.addr,
        relay_status = ?relay.status,
        relay_lease_issued = relay.lease_issued,
        relay_policy = relay.policy.as_deref().unwrap_or(""),
        relay_blockers = ?relay.blockers,
        relay_lease_id = relay.lease_id.as_deref().unwrap_or(""),
        relay_failure_class = relay.failure_class.as_deref().unwrap_or(""),
        "relay fallback lease evaluated after failed direct route"
    );
    err.relay_fallback = Some(relay_fallback_route_evidence(
        &relay,
        peer,
        &attempted_route_peers,
        Some("remote_command"),
    ));
    if let Some(session_id) = session_id {
        let musu_home = state
            .config
            .nodes_toml_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .to_path_buf();
        crate::bridge::rendezvous::spawn_close_rendezvous_session(
            musu_home,
            session_id,
            "forward",
            task.source_task_id.clone(),
        );
    }
    Err(err)
}

/// V27-F1: Result callback payload from a remote peer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCallback {
    /// Original task_id on the requesting node.
    pub source_task_id: String,
    /// Task ID on the executing node.
    pub remote_task_id: String,
    /// Final status: done, failed, cancelled.
    pub status: String,
    /// Task output (stdout).
    pub output: Option<String>,
    /// Error message if failed.
    pub error: Option<String>,
    /// Process exit code.
    pub exit_code: Option<i32>,
    /// Execution duration in seconds.
    pub duration_sec: Option<f64>,
    /// Name of the node that executed the task.
    pub node: String,
}

/// POST /api/tasks/callback — receive task result from a peer.
pub async fn receive_callback(
    State(state): State<AppState>,
    Json(cb): Json<TaskCallback>,
) -> Result<StatusCode> {
    tracing::info!(
        source_task_id = %cb.source_task_id,
        remote_task_id = %cb.remote_task_id,
        status = %cb.status,
        node = %cb.node,
        "received task result callback from peer"
    );

    // Update the original route_execution row with remote result.
    sqlx::query(
        "UPDATE route_executions SET status = ?, output = ?, error = ?, \
         exit_code = ?, duration_sec = ?, updated_at = ? WHERE task_id = ?",
    )
    .bind(&cb.status)
    .bind(&cb.output)
    .bind(&cb.error)
    .bind(cb.exit_code)
    .bind(cb.duration_sec)
    .bind(chrono::Utc::now().timestamp())
    .bind(&cb.source_task_id)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    crate::writer::runner::TaskUpdate {
        task_id: &cb.source_task_id,
        status: &cb.status,
        output: cb.output.as_deref(),
        error: cb.error.as_deref(),
        assigned_pc: Some(&cb.node),
        exit_code: cb.exit_code,
        duration_sec: cb.duration_sec,
        ..Default::default()
    }
    .save();

    // Broadcast SSE event so any listeners (including `musu route --wait`)
    // get notified.
    state.sse_broadcaster.publish(
        crate::writer::sse::TaskEvent::update(&cb.source_task_id, &cb.status)
            .with_result(
                cb.output.as_deref(),
                cb.error.as_deref(),
                cb.exit_code,
                cb.duration_sec,
            )
            .with_assigned_pc(Some(&cb.node)),
    );

    Ok(StatusCode::OK)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::peer::discovery::PeerSource;

    fn peer(addr: &str, meta: Option<serde_json::Value>) -> ResolvedPeer {
        ResolvedPeer {
            addr: addr.to_string(),
            name: Some("target-node".to_string()),
            source: PeerSource::Registry,
            meta,
        }
    }

    #[test]
    fn forward_url_uses_transport_scheme_from_peer_metadata() {
        let peer = peer(
            "192.168.1.10:8070",
            Some(serde_json::json!({
                "transport_scheme": "https",
            })),
        );

        assert_eq!(
            forward_url_for_peer(&peer),
            "https://192.168.1.10:8070/api/tasks/forward"
        );
    }

    #[test]
    fn forward_url_uses_public_url_scheme_when_available() {
        let peer = peer(
            "target.example.com:443",
            Some(serde_json::json!({
                "public_url": "https://target.example.com:443",
            })),
        );

        assert_eq!(
            forward_url_for_peer(&peer),
            "https://target.example.com:443/api/tasks/forward"
        );
    }

    #[test]
    fn https_fingerprint_transport_proof_marks_pinned_attempts() {
        let proof =
            crate::bridge::route_evidence::https_fingerprint_transport_proof("sha256:verified");

        assert_eq!(proof.peer_identity_method, "tls_cert_fingerprint_pin");
        assert_eq!(proof.peer_public_key, "sha256:verified");
        assert_eq!(proof.encryption, "https_tls_fingerprint_pin");
        assert_eq!(
            proof.transport_verified_by,
            crate::bridge::route_evidence::HTTPS_FINGERPRINT_TRANSPORT_VERIFIER
        );
    }

    #[test]
    fn forwarded_task_audit_note_is_bounded_and_excludes_prompt() {
        let task = ForwardedTask {
            source_node: "source-node".repeat(80),
            source_task_id: "source-task-123".to_string(),
            channel: "ops".to_string(),
            sender_id: "operator".to_string(),
            text: "sensitive prompt body that must not be written to audit".to_string(),
            adapter_type: None,
            model: None,
            cwd: Some("F:/sensitive/workspace".to_string()),
            deadline_unix_ms: None,
            company_id: Some("company-1".to_string()),
            timeout_sec: None,
            callback_url: Some("http://127.0.0.1/callback".to_string()),
            rendezvous_session_id: Some("rv-session-1".to_string()),
            rendezvous_target_node_id: Some("target-node".to_string()),
        };

        let note = forwarded_task_audit_note("target-task-456", &task);

        assert!(note.contains("target-task-456"));
        assert!(note.contains("source_task_id=source-task-123"));
        assert!(note.contains("rendezvous_session_id=rv-session-1"));
        assert!(note.contains("source_node="));
        assert!(note.len() < 512);
        assert!(!note.contains("sensitive prompt"));
        assert!(!note.contains("F:/sensitive/workspace"));
        assert!(!note.contains("127.0.0.1/callback"));
    }
}
