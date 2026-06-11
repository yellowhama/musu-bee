//! Task forwarding — V27.
//!
//! Handles receiving forwarded tasks from peer nodes and
//! sending tasks to remote peers.
//!
//! V27-F1: result callback — when a forwarded task completes, the
//! executing node POSTs a `TaskCallback` to the originating node's
//! `/api/tasks/callback` endpoint so it can update its local row.

use std::net::{IpAddr, SocketAddr};

use crate::bridge::error::{MusuError, Result};
use crate::bridge::route_evidence::elapsed_ms;
use crate::bridge::AppState;
use crate::peer::discovery::ResolvedPeer;
use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::Json;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

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
    /// Web/control-plane source for this work order, e.g. `musu.pro`.
    #[serde(default)]
    pub origin: Option<String>,
    /// Stable user-visible work order id from MUSU.PRO or another control plane.
    #[serde(default)]
    pub work_order_id: Option<String>,
    /// Project room context. Stored only as bounded audit/context metadata.
    #[serde(default)]
    pub project_id: Option<String>,
    /// Meeting room / collaboration room context.
    #[serde(default)]
    pub room_id: Option<String>,
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
        "accepted forwarded task task_id={} source_node={} source_task_id={} origin={} work_order_id={} project_id={} room_id={} rendezvous_session_id={} rendezvous_target_node_id={}",
        audit_fragment(task_id),
        audit_fragment(&req.source_node),
        audit_fragment(&req.source_task_id),
        audit_fragment_or_none(req.origin.as_deref()),
        audit_fragment_or_none(req.work_order_id.as_deref()),
        audit_fragment_or_none(req.project_id.as_deref()),
        audit_fragment_or_none(req.room_id.as_deref()),
        audit_fragment_or_none(req.rendezvous_session_id.as_deref()),
        audit_fragment_or_none(req.rendezvous_target_node_id.as_deref())
    )
}

pub fn forwarded_task_from_relay_payload(
    payload: &crate::cloud::P2pRelayPayloadStoredRecord,
    expected_target_node_id: &str,
) -> std::result::Result<ForwardedTask, String> {
    let expected_target_node_id = expected_target_node_id.trim();
    if expected_target_node_id.is_empty() {
        return Err("relay_payload_expected_target_missing".to_string());
    }
    if payload.status.trim() != "claimed" {
        return Err("relay_payload_not_claimed".to_string());
    }
    if payload.target_node_id.trim() != expected_target_node_id {
        return Err("relay_payload_target_mismatch".to_string());
    }
    if let Some(claimed_by) = payload.claimed_by.as_deref() {
        if claimed_by.trim() != expected_target_node_id {
            return Err("relay_payload_claimant_mismatch".to_string());
        }
    }
    if payload.payload_kind.trim() != RELAY_PAYLOAD_KIND_FORWARDED_TASK {
        return Err("relay_payload_kind_unsupported".to_string());
    }

    let payload_base64 = payload
        .payload_base64
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "relay_payload_missing_payload_bytes".to_string())?;
    let decoded = BASE64_STANDARD
        .decode(payload_base64.as_bytes())
        .map_err(|_| "relay_payload_base64_decode_failed".to_string())?;
    if payload.payload_bytes != decoded.len() as u64 {
        return Err("relay_payload_bytes_mismatch".to_string());
    }
    let actual_sha256 = hex::encode(Sha256::digest(&decoded));
    if !actual_sha256.eq_ignore_ascii_case(payload.payload_sha256.trim()) {
        return Err("relay_payload_sha256_mismatch".to_string());
    }

    let task: ForwardedTask = serde_json::from_slice(&decoded)
        .map_err(|_| "relay_payload_forwarded_task_decode_failed".to_string())?;
    if task.source_node.trim() != payload.source_node_id.trim() {
        return Err("relay_payload_source_mismatch".to_string());
    }
    if task
        .rendezvous_session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        != Some(payload.session_id.trim())
    {
        return Err("relay_payload_session_mismatch".to_string());
    }
    if let Some(target_node_id) = task.rendezvous_target_node_id.as_deref() {
        if target_node_id.trim() != payload.target_node_id.trim() {
            return Err("relay_payload_task_target_mismatch".to_string());
        }
    }

    Ok(task)
}

const RELAY_PAYLOAD_SCHEMA: &str = "musu.relay_payload_envelope.v1";
const RELAY_PAYLOAD_KIND_FORWARDED_TASK: &str = "forwarded_task_envelope";
const RELAY_PAYLOAD_ID_FRAGMENT_MAX_CHARS: usize = 96;

fn relay_payload_identifier_fragment(value: &str) -> String {
    let mut out = String::new();
    for ch in value.trim().chars() {
        if out.len() >= RELAY_PAYLOAD_ID_FRAGMENT_MAX_CHARS {
            break;
        }
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "none".to_string()
    } else {
        out
    }
}

fn relay_payload_tunnel_id(session_id: &str, lease_id: &str) -> String {
    format!(
        "relay-payload-{}-{}",
        relay_payload_identifier_fragment(session_id),
        relay_payload_identifier_fragment(lease_id)
    )
}

fn relay_payload_request_for_forwarded_task(
    source_node_id: &str,
    fallback_peer: &ResolvedPeer,
    relay: &crate::bridge::rendezvous::RelayLeaseFallback,
    session_id: &str,
    task: &ForwardedTask,
    relay_route_metadata: &crate::bridge::route_evidence::RouteRelayFallbackEvidence,
) -> std::result::Result<crate::cloud::P2pRelayPayloadRequest, String> {
    let lease_id = relay
        .lease_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "relay_payload_queue_missing_lease_id".to_string())?;
    let payload_json =
        serde_json::to_vec(task).map_err(|_| "relay_payload_queue_serialize_failed".to_string())?;
    let payload_sha256 = hex::encode(Sha256::digest(&payload_json));
    let payload_base64 = BASE64_STANDARD.encode(&payload_json);

    Ok(crate::cloud::P2pRelayPayloadRequest {
        schema: RELAY_PAYLOAD_SCHEMA.to_string(),
        session_id: session_id.to_string(),
        lease_id: lease_id.to_string(),
        source_node_id: source_node_id.to_string(),
        target_node_id: crate::bridge::route_evidence::target_node_id(fallback_peer),
        tunnel_id: relay_payload_tunnel_id(session_id, lease_id),
        payload_kind: RELAY_PAYLOAD_KIND_FORWARDED_TASK.to_string(),
        payload_base64,
        payload_sha256: Some(payload_sha256),
        candidate_route_kinds: route_kind_labels_to_cloud(
            &relay_route_metadata.candidate_route_kinds,
        ),
        attempted_route_kinds: route_kind_labels_to_cloud(
            &relay_route_metadata.attempted_route_kinds,
        ),
    })
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

fn push_route_kind_label(kinds: &mut Vec<String>, kind: &str) {
    if matches!(kind, "lan" | "tailscale" | "direct_quic" | "relay")
        && !kinds.iter().any(|existing| existing == kind)
    {
        kinds.push(kind.to_string());
    }
}

fn route_kind_labels_from_meta(peer: &ResolvedPeer, key: &str) -> Vec<String> {
    peer.meta
        .as_ref()
        .and_then(|meta| meta.get(key))
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .filter(|value| matches!(*value, "lan" | "tailscale" | "direct_quic" | "relay"))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn route_kind_labels_in_priority_order(kinds: Vec<String>) -> Vec<String> {
    let mut ordered = Vec::new();
    for preferred in ["lan", "tailscale", "direct_quic", "relay"] {
        if kinds.iter().any(|kind| kind == preferred) {
            ordered.push(preferred.to_string());
        }
    }
    ordered
}

fn candidate_route_kind_labels(
    attempted_peers: &[ResolvedPeer],
    fallback_peer: &ResolvedPeer,
    include_relay: bool,
) -> Vec<String> {
    let mut kinds = Vec::new();
    for peer in attempted_peers.iter().chain(std::iter::once(fallback_peer)) {
        for kind in route_kind_labels_from_meta(peer, "candidate_route_kinds") {
            push_route_kind_label(&mut kinds, &kind);
        }
    }
    for peer in attempted_peers.iter().chain(std::iter::once(fallback_peer)) {
        let kind = crate::bridge::route_evidence::route_evidence_kind_for_addr(&peer.addr);
        push_route_kind_label(&mut kinds, kind);
    }
    if include_relay {
        push_route_kind_label(&mut kinds, "relay");
    }
    route_kind_labels_in_priority_order(kinds)
}

fn route_kind_labels_to_cloud(labels: &[String]) -> Vec<crate::cloud::RouteKind> {
    labels
        .iter()
        .filter_map(|label| match label.as_str() {
            "lan" => Some(crate::cloud::RouteKind::Lan),
            "tailscale" => Some(crate::cloud::RouteKind::Tailscale),
            "direct_quic" => Some(crate::cloud::RouteKind::DirectQuic),
            "relay" => Some(crate::cloud::RouteKind::Relay),
            _ => None,
        })
        .collect()
}

fn push_unique_peer(peers: &mut Vec<ResolvedPeer>, peer: ResolvedPeer) {
    if !peers.iter().any(|existing| existing.addr == peer.addr) {
        peers.push(peer);
    }
}

fn relay_fallback_route_evidence(
    relay: &crate::bridge::rendezvous::RelayLeaseFallback,
    fallback_peer: &ResolvedPeer,
    attempted_peers: &[ResolvedPeer],
    requested_capability: Option<&str>,
    payload_queue: Option<&crate::bridge::rendezvous::RelayPayloadQueueOutcome>,
) -> crate::bridge::route_evidence::RouteRelayFallbackEvidence {
    let lease_requested = !matches!(
        relay.status,
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::SkippedNoToken
            | crate::bridge::rendezvous::RelayLeaseFallbackStatus::SkippedNoSession
    );
    let issued = matches!(
        relay.status,
        crate::bridge::rendezvous::RelayLeaseFallbackStatus::Issued
    );
    let payload_transport_attempted = payload_queue
        .map(|outcome| outcome.attempted)
        .unwrap_or(false);
    let payload_transport_proven = payload_queue.map(|outcome| outcome.proven).unwrap_or(false);
    let payload_transport_failure_class = if issued {
        payload_queue
            .and_then(|outcome| outcome.failure_class.clone())
            .or_else(|| {
                Some(
                    crate::bridge::route_evidence::RELAY_PAYLOAD_TRANSPORT_NOT_IMPLEMENTED
                        .to_string(),
                )
            })
    } else {
        None
    };

    crate::bridge::route_evidence::RouteRelayFallbackEvidence {
        direct_path_failed: true,
        lease_requested,
        status: relay_fallback_status_label(&relay.status).to_string(),
        lease_issued: relay.lease_issued,
        candidate_route_kinds: candidate_route_kind_labels(
            attempted_peers,
            fallback_peer,
            lease_requested,
        ),
        attempted_route_kinds: attempted_route_kind_labels(attempted_peers, fallback_peer),
        requested_capability: requested_capability.map(str::to_string),
        policy: relay.policy.clone(),
        blockers: relay.blockers.clone(),
        lease_id: relay.lease_id.clone(),
        failure_class: relay.failure_class.clone(),
        payload_transport_attempted,
        payload_transport_proven,
        payload_transport_failure_class,
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

    let response = accept_forwarded_task(
        &state,
        addr.ip(),
        "POST",
        "/api/tasks/forward",
        req,
        zip_data,
    )
    .await?;

    Ok((StatusCode::ACCEPTED, Json(response)))
}

pub async fn accept_forwarded_task(
    state: &AppState,
    actor_ip: IpAddr,
    method: &'static str,
    path: &'static str,
    req: ForwardedTask,
    zip_data: Option<axum::body::Bytes>,
) -> Result<ForwardResponse> {
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
            adapter_type: req
                .adapter_type
                .clone()
                .unwrap_or_else(crate::bridge::handlers::tasks::default_adapter_type),
            callback_url: req.callback_url.clone(),
            source_task_id: Some(req.source_task_id.clone()),
        })
        .await
        .map_err(|e| MusuError::Internal(format!("spawn forwarded task: {e}")))?;

    state
        .audit
        .write(crate::bridge::audit::AuditEntry {
            actor_ip,
            method: method.to_string(),
            path: path.to_string(),
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

    Ok(ForwardResponse {
        task_id,
        status: "queued".into(),
        node: state.config.node_name.clone(),
    })
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
    let mut route_candidates = rendezvous.route_peers.clone();
    push_unique_peer(&mut route_candidates, peer.clone());
    route_candidates = crate::bridge::router::select_remote_candidates_in_order(&route_candidates);
    let route_peer = route_candidates
        .first()
        .cloned()
        .or_else(|| rendezvous.route_peer.clone())
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
    let mut attempted_route_peers = Vec::new();
    let mut last_err: Option<ForwardAttemptError> = None;

    for (candidate_index, candidate) in route_candidates.iter().enumerate() {
        push_unique_peer(&mut attempted_route_peers, candidate.clone());
        if candidate_index > 0 {
            tracing::warn!(
                original_peer = %peer.addr,
                selected_peer = %candidate.addr,
                selected_route_kind = crate::bridge::router::route_kind_for_addr(&candidate.addr).as_str(),
                "previous forward route candidate failed; trying next direct candidate before relay fallback"
            );
        }
        let retries_for_candidate = if candidate_index == 0 { max_retries } else { 0 };
        for attempt in 0..=retries_for_candidate {
            match forward_to_peer_attempt(
                &state.http_client,
                candidate,
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
                    if attempt < retries_for_candidate {
                        let delay = std::time::Duration::from_secs(1 << attempt);
                        tracing::warn!(
                            peer = %candidate.addr,
                            attempt = attempt + 1,
                            max = retries_for_candidate,
                            delay_sec = delay.as_secs(),
                            err = %err_message,
                            "forward failed, retrying"
                        );
                        tokio::time::sleep(delay).await;
                    }
                }
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
    let total_attempts = (max_retries + 1) + route_candidates.len().saturating_sub(1) as u32;
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
    let relay_route_metadata = relay_fallback_route_evidence(
        &relay,
        peer,
        &attempted_route_peers,
        Some("remote_command"),
        None,
    );
    let relay_payload_queue = if relay.lease_issued
        && matches!(
            relay.status,
            crate::bridge::rendezvous::RelayLeaseFallbackStatus::Issued
        ) {
        match session_id.as_deref() {
            Some(session_id) => match relay_payload_request_for_forwarded_task(
                &state.config.node_name,
                peer,
                &relay,
                session_id,
                &task,
                &relay_route_metadata,
            ) {
                Ok(payload) => {
                    crate::bridge::rendezvous::submit_relay_payload_after_lease(
                        state, &relay, &payload,
                    )
                    .await
                }
                Err(failure_class) => {
                    crate::bridge::rendezvous::RelayPayloadQueueOutcome::failed(failure_class)
                }
            },
            None => crate::bridge::rendezvous::RelayPayloadQueueOutcome::failed(
                "relay_payload_queue_missing_session_id",
            ),
        }
    } else {
        crate::bridge::rendezvous::RelayPayloadQueueOutcome::not_attempted()
    };
    tracing::debug!(
        peer = %peer.addr,
        relay_status = ?relay.status,
        relay_lease_issued = relay.lease_issued,
        relay_policy = relay.policy.as_deref().unwrap_or(""),
        relay_blockers = ?relay.blockers,
        relay_lease_id = relay.lease_id.as_deref().unwrap_or(""),
        relay_failure_class = relay.failure_class.as_deref().unwrap_or(""),
        relay_payload_transport_attempted = relay_payload_queue.attempted,
        relay_payload_transport_proven = relay_payload_queue.proven,
        relay_payload_transport_failure_class =
            relay_payload_queue.failure_class.as_deref().unwrap_or(""),
        relay_payload_id = relay_payload_queue.payload_id.as_deref().unwrap_or(""),
        relay_payload_sha256 = relay_payload_queue.payload_sha256.as_deref().unwrap_or(""),
        relay_payload_bytes = relay_payload_queue.payload_bytes.unwrap_or(0),
        "relay fallback lease evaluated after failed direct route"
    );
    err.relay_fallback = Some(relay_fallback_route_evidence(
        &relay,
        peer,
        &attempted_route_peers,
        Some("remote_command"),
        Some(&relay_payload_queue),
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
            origin: Some("musu.pro".to_string()),
            work_order_id: Some("wo-20260604-1".to_string()),
            project_id: Some("project-rc1".to_string()),
            room_id: Some("room-release".to_string()),
            timeout_sec: None,
            callback_url: Some("http://127.0.0.1/callback".to_string()),
            rendezvous_session_id: Some("rv-session-1".to_string()),
            rendezvous_target_node_id: Some("target-node".to_string()),
        };

        let note = forwarded_task_audit_note("target-task-456", &task);

        assert!(note.contains("target-task-456"));
        assert!(note.contains("source_task_id=source-task-123"));
        assert!(note.contains("origin=musu.pro"));
        assert!(note.contains("work_order_id=wo-20260604-1"));
        assert!(note.contains("project_id=project-rc1"));
        assert!(note.contains("room_id=room-release"));
        assert!(note.contains("rendezvous_session_id=rv-session-1"));
        assert!(note.contains("source_node="));
        assert!(note.len() < 512);
        assert!(!note.contains("sensitive prompt"));
        assert!(!note.contains("F:/sensitive/workspace"));
        assert!(!note.contains("127.0.0.1/callback"));
    }

    #[test]
    fn relay_payload_request_for_forwarded_task_hashes_and_encodes_task() {
        let target = peer("192.168.1.10:8070", None);
        let relay = crate::bridge::rendezvous::RelayLeaseFallback {
            status: crate::bridge::rendezvous::RelayLeaseFallbackStatus::Issued,
            lease_issued: true,
            policy: Some("connect_pro_fallback_only".to_string()),
            blockers: vec![],
            lease_id: Some("lease/1".to_string()),
            failure_class: None,
        };
        let task = ForwardedTask {
            source_node: "source-node".to_string(),
            source_task_id: "source-task-123".to_string(),
            channel: "ops".to_string(),
            sender_id: "operator".to_string(),
            text: "prompt body queued only after direct route failure".to_string(),
            adapter_type: None,
            model: None,
            cwd: None,
            deadline_unix_ms: None,
            company_id: Some("company-1".to_string()),
            origin: Some("musu.pro".to_string()),
            work_order_id: Some("wo-relay-1".to_string()),
            project_id: Some("project-relay".to_string()),
            room_id: Some("room-relay".to_string()),
            timeout_sec: Some(30),
            callback_url: Some("http://127.0.0.1/callback".to_string()),
            rendezvous_session_id: Some("session/1".to_string()),
            rendezvous_target_node_id: Some("target-node".to_string()),
        };
        let relay_route_metadata = relay_fallback_route_evidence(
            &relay,
            &target,
            &[target.clone()],
            Some("remote_command"),
            None,
        );

        let req = relay_payload_request_for_forwarded_task(
            "source-node",
            &target,
            &relay,
            "session/1",
            &task,
            &relay_route_metadata,
        )
        .expect("relay payload request");
        let decoded = BASE64_STANDARD
            .decode(&req.payload_base64)
            .expect("base64 payload");
        let decoded_task: ForwardedTask =
            serde_json::from_slice(&decoded).expect("forwarded task payload");

        assert_eq!(req.schema, RELAY_PAYLOAD_SCHEMA);
        assert_eq!(req.session_id, "session/1");
        assert_eq!(req.lease_id, "lease/1");
        assert_eq!(req.source_node_id, "source-node");
        assert_eq!(req.target_node_id, "target-node");
        assert_eq!(req.tunnel_id, "relay-payload-session_1-lease_1");
        assert_eq!(req.payload_kind, RELAY_PAYLOAD_KIND_FORWARDED_TASK);
        assert_eq!(decoded_task.source_task_id, "source-task-123");
        assert_eq!(decoded_task.text, task.text);
        assert_eq!(decoded_task.origin, task.origin);
        assert_eq!(decoded_task.work_order_id, task.work_order_id);
        assert_eq!(decoded_task.project_id, task.project_id);
        assert_eq!(decoded_task.room_id, task.room_id);
        assert_eq!(
            req.payload_sha256,
            Some(hex::encode(Sha256::digest(&decoded)))
        );
        assert_eq!(
            req.candidate_route_kinds,
            vec![crate::cloud::RouteKind::Lan, crate::cloud::RouteKind::Relay]
        );
        assert_eq!(
            req.attempted_route_kinds,
            vec![crate::cloud::RouteKind::Lan]
        );
    }

    fn relay_payload_record_for_task(
        task: &ForwardedTask,
        target_node_id: &str,
    ) -> crate::cloud::P2pRelayPayloadStoredRecord {
        let payload_json = serde_json::to_vec(task).expect("task json");
        crate::cloud::P2pRelayPayloadStoredRecord {
            payload_id: "payload-1".to_string(),
            session_id: task.rendezvous_session_id.clone().unwrap(),
            lease_id: "lease-1".to_string(),
            source_node_id: task.source_node.clone(),
            target_node_id: target_node_id.to_string(),
            relay_url: "wss://relay.musu.pro/connect".to_string(),
            tunnel_id: "relay-payload-session-lease".to_string(),
            payload_kind: RELAY_PAYLOAD_KIND_FORWARDED_TASK.to_string(),
            payload_bytes: payload_json.len() as u64,
            payload_sha256: hex::encode(Sha256::digest(&payload_json)),
            status: "claimed".to_string(),
            relay_default_data_path: false,
            release_grade: false,
            transport_kind: "relay_payload_queue_preview".to_string(),
            created_at: "2026-06-04T00:00:00Z".to_string(),
            expires_at: "2026-06-04T00:05:00Z".to_string(),
            claimed_by: Some(target_node_id.to_string()),
            claimed_at: Some("2026-06-04T00:00:01Z".to_string()),
            delivered_at: None,
            payload_base64: Some(BASE64_STANDARD.encode(&payload_json)),
            candidate_route_kinds: vec![
                crate::cloud::RouteKind::Lan,
                crate::cloud::RouteKind::Relay,
            ],
            attempted_route_kinds: vec![crate::cloud::RouteKind::Lan],
        }
    }

    #[test]
    fn relay_payload_decoder_accepts_claimed_forwarded_task_for_local_target() {
        let task = ForwardedTask {
            source_node: "source-node".to_string(),
            source_task_id: "source-task-123".to_string(),
            channel: "ops".to_string(),
            sender_id: "operator".to_string(),
            text: "prompt body".to_string(),
            adapter_type: None,
            model: None,
            cwd: None,
            deadline_unix_ms: None,
            company_id: Some("company-1".to_string()),
            origin: None,
            work_order_id: None,
            project_id: None,
            room_id: None,
            timeout_sec: Some(30),
            callback_url: Some("http://127.0.0.1:8070/api/tasks/callback".to_string()),
            rendezvous_session_id: Some("session-1".to_string()),
            rendezvous_target_node_id: Some("target-node".to_string()),
        };
        let record = relay_payload_record_for_task(&task, "target-node");

        let decoded =
            forwarded_task_from_relay_payload(&record, "target-node").expect("decoded task");

        assert_eq!(decoded.source_task_id, task.source_task_id);
        assert_eq!(decoded.rendezvous_session_id, task.rendezvous_session_id);
        assert_eq!(
            decoded.rendezvous_target_node_id,
            task.rendezvous_target_node_id
        );
        assert_eq!(decoded.text, task.text);
    }

    #[test]
    fn relay_payload_decoder_rejects_target_or_hash_mismatch() {
        let task = ForwardedTask {
            source_node: "source-node".to_string(),
            source_task_id: "source-task-123".to_string(),
            channel: "ops".to_string(),
            sender_id: "operator".to_string(),
            text: "prompt body".to_string(),
            adapter_type: None,
            model: None,
            cwd: None,
            deadline_unix_ms: None,
            company_id: Some("company-1".to_string()),
            origin: None,
            work_order_id: None,
            project_id: None,
            room_id: None,
            timeout_sec: Some(30),
            callback_url: None,
            rendezvous_session_id: Some("session-1".to_string()),
            rendezvous_target_node_id: Some("target-node".to_string()),
        };
        let mut record = relay_payload_record_for_task(&task, "target-node");

        assert_eq!(
            forwarded_task_from_relay_payload(&record, "other-node").unwrap_err(),
            "relay_payload_target_mismatch"
        );

        record.payload_sha256 = "00".repeat(32);
        assert_eq!(
            forwarded_task_from_relay_payload(&record, "target-node").unwrap_err(),
            "relay_payload_sha256_mismatch"
        );
    }

    #[test]
    fn issued_relay_fallback_records_payload_queue_attempt_gap() {
        let target = peer("192.168.1.10:8070", None);
        let relay = crate::bridge::rendezvous::RelayLeaseFallback {
            status: crate::bridge::rendezvous::RelayLeaseFallbackStatus::Issued,
            lease_issued: true,
            policy: Some("connect_pro_fallback_only".to_string()),
            blockers: vec![],
            lease_id: Some("relay-lease-test".to_string()),
            failure_class: None,
        };
        let payload_queue = crate::bridge::rendezvous::RelayPayloadQueueOutcome {
            attempted: true,
            proven: false,
            failure_class: Some(
                crate::bridge::route_evidence::RELAY_TARGET_POLLING_NOT_IMPLEMENTED.to_string(),
            ),
            payload_id: Some("relay-payload-test".to_string()),
            payload_sha256: Some("abc123".to_string()),
            payload_bytes: Some(256),
        };

        let evidence = relay_fallback_route_evidence(
            &relay,
            &target,
            &[],
            Some("remote_command"),
            Some(&payload_queue),
        );

        assert!(evidence.direct_path_failed);
        assert!(evidence.lease_requested);
        assert!(evidence.lease_issued);
        assert_eq!(
            evidence.candidate_route_kinds,
            vec!["lan".to_string(), "relay".to_string()]
        );
        assert_eq!(evidence.attempted_route_kinds, vec!["lan".to_string()]);
        assert!(evidence.payload_transport_attempted);
        assert!(!evidence.payload_transport_proven);
        assert_eq!(
            evidence.payload_transport_failure_class.as_deref(),
            Some(crate::bridge::route_evidence::RELAY_TARGET_POLLING_NOT_IMPLEMENTED)
        );
    }
}
