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
use sqlx::Row;

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

fn base_url_for_peer(peer: &ResolvedPeer) -> String {
    let addr = peer.addr.trim().trim_end_matches('/');
    if addr.starts_with("http://") || addr.starts_with("https://") {
        addr.to_string()
    } else {
        format!("{}://{}", peer_transport_scheme(peer), addr)
    }
}

fn forward_url_for_peer(peer: &ResolvedPeer) -> String {
    format!(
        "{}/api/tasks/forward",
        base_url_for_peer(peer).trim_end_matches('/')
    )
}

fn route_preflight_url_for_peer(peer: &ResolvedPeer) -> String {
    format!(
        "{}/api/fleet/node-status",
        base_url_for_peer(peer).trim_end_matches('/')
    )
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
/// W-1 §S-2: payload_kind for a result callback travelling the REVERSE
/// direction (executor → original source) through the relay KV queue.
pub const RELAY_PAYLOAD_KIND_TASK_CALLBACK: &str = "task_callback_envelope";

/// W-1 §S-2: strict mirror of [`forwarded_task_from_relay_payload`] for the
/// reverse callback envelope. Used by the drain path when `payload_kind ==
/// task_callback_envelope` to recover a verified [`TaskCallback`] that the
/// executor queued for the original source node.
///
/// Same structural gauntlet as the forward path: claimed status, target match
/// (this node is the original source — the callback's destination), claimant
/// match, kind match, base64/bytes/sha256 integrity. THEN the decode-side
/// consistency checks that make a forged callback unprofitable:
///
///   - `cb.node == payload.source_node_id` — the executor's self-declared
///     identity in the callback body MUST match the relay-asserted submitter
///     of the payload. A peer cannot queue a callback "from" a node it is not.
///
/// The DB-side executor binding (`cb.node == route_executions.forwarded_to_node`
/// for `cb.source_task_id`) is enforced separately at receive time (T5), so a
/// same-account peer that *could* still queue a syntactically valid callback
/// for someone else's task is rejected there because we never forwarded that
/// task to it. This function owns the in-payload half of that defense.
pub fn callback_from_relay_payload(
    payload: &crate::cloud::P2pRelayPayloadStoredRecord,
    expected_target_node_id: &str,
) -> std::result::Result<TaskCallback, String> {
    let expected_target_node_id = expected_target_node_id.trim();
    if expected_target_node_id.is_empty() {
        return Err("relay_callback_expected_target_missing".to_string());
    }
    if payload.status.trim() != "claimed" {
        return Err("relay_callback_not_claimed".to_string());
    }
    if payload.target_node_id.trim() != expected_target_node_id {
        return Err("relay_callback_target_mismatch".to_string());
    }
    if let Some(claimed_by) = payload.claimed_by.as_deref() {
        if claimed_by.trim() != expected_target_node_id {
            return Err("relay_callback_claimant_mismatch".to_string());
        }
    }
    if payload.payload_kind.trim() != RELAY_PAYLOAD_KIND_TASK_CALLBACK {
        return Err("relay_callback_kind_unsupported".to_string());
    }

    let payload_base64 = payload
        .payload_base64
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "relay_callback_missing_payload_bytes".to_string())?;
    let decoded = BASE64_STANDARD
        .decode(payload_base64.as_bytes())
        .map_err(|_| "relay_callback_base64_decode_failed".to_string())?;
    if payload.payload_bytes != decoded.len() as u64 {
        return Err("relay_callback_bytes_mismatch".to_string());
    }
    let actual_sha256 = hex::encode(Sha256::digest(&decoded));
    if !actual_sha256.eq_ignore_ascii_case(payload.payload_sha256.trim()) {
        return Err("relay_callback_sha256_mismatch".to_string());
    }

    let cb: TaskCallback = serde_json::from_slice(&decoded)
        .map_err(|_| "relay_callback_task_callback_decode_failed".to_string())?;
    // S-2 executor-identity consistency: the callback body's `node` (who claims
    // to have executed the task) MUST be the relay-asserted submitter. This is
    // the in-payload half of the executor-binding defense; the DB half (was this
    // task actually forwarded to that node?) is enforced at receive time (T5).
    if cb.node.trim() != payload.source_node_id.trim() {
        return Err("relay_callback_executor_mismatch".to_string());
    }
    // Structural validity guard (NOT a session-correlation defense): a callback
    // riding a real relay session must name a source task. Note `TaskCallback`
    // carries no session_id field, so unlike the forward decoder this cannot bind
    // cb→payload.session_id; the authoritative task binding is the DB executor
    // gate in `apply_task_callback` (forwarded_to_node = cb.node), not this check.
    if !payload.session_id.trim().is_empty() && cb.source_task_id.trim().is_empty() {
        return Err("relay_callback_missing_source_task".to_string());
    }
    if !task_callback_status_is_terminal(cb.status.trim()) {
        return Err("relay_callback_status_not_terminal".to_string());
    }

    Ok(cb)
}
const RELAY_PAYLOAD_ID_FRAGMENT_MAX_CHARS: usize = 96;

/// W-1 §S-3/§S-4: build the reverse-direction relay payload request that
/// carries a [`TaskCallback`] from the executor back to the original sender.
///
/// Pure (no I/O) so it is unit-testable. `source_node_id` is THIS executor;
/// `target_node_id` is the original sender (the callback's destination). The
/// payload is the same sha256-bound base64 envelope shape as the forward path,
/// but with `payload_kind = task_callback_envelope` so the drain side routes it
/// to [`callback_from_relay_payload`] (T7), not the forwarded-task decoder.
fn relay_request_for_callback(
    source_node_id: &str,
    target_node_id: &str,
    session_id: &str,
    lease_id: &str,
    cb: &TaskCallback,
) -> std::result::Result<crate::cloud::P2pRelayPayloadRequest, String> {
    let payload_json =
        serde_json::to_vec(cb).map_err(|_| "relay_callback_queue_serialize_failed".to_string())?;
    let payload_sha256 = hex::encode(Sha256::digest(&payload_json));
    let payload_base64 = BASE64_STANDARD.encode(&payload_json);

    Ok(crate::cloud::P2pRelayPayloadRequest {
        schema: RELAY_PAYLOAD_SCHEMA.to_string(),
        session_id: session_id.to_string(),
        lease_id: lease_id.to_string(),
        source_node_id: source_node_id.to_string(),
        target_node_id: target_node_id.to_string(),
        tunnel_id: relay_payload_tunnel_id(session_id, lease_id),
        payload_kind: RELAY_PAYLOAD_KIND_TASK_CALLBACK.to_string(),
        payload_base64,
        payload_sha256: Some(payload_sha256),
        candidate_route_kinds: vec![crate::cloud::RouteKind::Relay],
        attempted_route_kinds: vec![],
    })
}

/// W-1 §S-3/§S-4: queue a result callback through the relay KV when the direct
/// callback POST to the original sender failed (the sender is NAT'd/loopback).
///
/// Self-contained (does NOT take `AppState`): the runner's `fire_callback` has
/// no handler state, so this resolves the account cloud client from `musu_home`
/// and runs its OWN reverse lease (S-3, separate from the forward's lease) then
/// submits the callback envelope. Best-effort: any failure is logged and the
/// callback simply remains undelivered (the source can re-poll / re-drive),
/// never a panic. Returns Ok(()) only when the payload was accepted+stored.
pub async fn queue_callback_via_relay(
    musu_home: &std::path::Path,
    source_node_id: &str,
    target_node_id: &str,
    session_id: &str,
    cb: &TaskCallback,
) -> std::result::Result<(), String> {
    let target_node_id = target_node_id.trim();
    let session_id = session_id.trim();
    if target_node_id.is_empty() || session_id.is_empty() {
        return Err("relay_callback_queue_missing_context".to_string());
    }
    let token = crate::cloud::token::load_token(musu_home)
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .ok_or_else(|| "relay_callback_queue_no_account_token".to_string())?;
    let cloud = crate::cloud::MusuCloud::new(&crate::cloud::base_url_from_env(), Some(token));

    // S-3: request a reverse lease (executor → original sender). This is a
    // distinct lease from the forward's; reusing the forward lease would let a
    // single grant authorize traffic in both directions, which the security
    // Critic flagged. direct_path_failed=true marks this as a post-direct
    // fallback so the server applies the connect_pro_fallback_only policy.
    let lease_req = crate::cloud::P2pRelayLeaseRequest {
        session_id: session_id.to_string(),
        source_node_id: source_node_id.to_string(),
        target_node_id: target_node_id.to_string(),
        requested_capability: Some("task_callback".to_string()),
        transport_intent: Some(crate::cloud::RelayTransportIntent::StoreForwardQueue),
        attempted_route_kinds: vec![crate::cloud::RouteKind::Lan],
        direct_path_failed: true,
        failure_class: Some("callback_direct_post_failed".to_string()),
    };
    let lease = cloud
        .request_relay_lease(&lease_req)
        .await
        .map_err(|e| format!("relay_callback_lease_request_failed: {e}"))?;
    if !lease.lease_issued {
        return Err("relay_callback_lease_not_issued".to_string());
    }
    let lease_id = lease
        .lease
        .as_ref()
        .map(|l| l.lease_id.clone())
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| "relay_callback_lease_missing_id".to_string())?;

    let payload =
        relay_request_for_callback(source_node_id, target_node_id, session_id, &lease_id, cb)?;
    let response = cloud
        .submit_relay_payload(&payload)
        .await
        .map_err(|e| format!("relay_callback_payload_submit_failed: {e}"))?;
    if response.ok && response.accepted && response.stored {
        tracing::info!(
            source_task_id = %cb.source_task_id,
            target_node_id,
            session_id,
            "callback queued via relay KV after direct delivery failed"
        );
        Ok(())
    } else {
        Err("relay_callback_payload_not_stored".to_string())
    }
}

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
    // W-2: the relay KV submission was accepted and stored. Read the queue
    // outcome's `stored` flag directly (set from the server's `stored=true`),
    // NOT `payload_id.is_some()` — a stored response may omit the record body,
    // which would falsely look dropped. NOT `attempted` (set even on failed
    // submits) and NOT `failure_class` (a stored payload still carries the
    // benign relay_target_polling_not_implemented class).
    let payload_transport_stored = payload_queue.map(|outcome| outcome.stored).unwrap_or(false);
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
        payload_transport_stored,
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
            // Shared mesh bearer so the result callback to the source node
            // authenticates: the source validates the callback against its own
            // peer_token, which is the SAME account-wide mesh bearer. Previously
            // this sent the target's own per-machine token → callback 401 → source
            // task stuck pending forever (the mirror of the forward bug).
            callback_token: Some(state.config.outbound_peer_bearer().to_string()),
            // W-1: relay-callback context. When the direct callback POST to the
            // source fails (source is NAT'd/loopback), fire_callback queues the
            // result back through the relay KV queue. The reverse envelope targets
            // the ORIGINAL sender (req.source_node) and reuses the forward's
            // rendezvous session to bind the callback to this task.
            callback_target_node_id: Some(req.source_node.clone()),
            callback_session_id: req.rendezvous_session_id.clone(),
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

const ROUTE_CANDIDATE_PREFLIGHT_TIMEOUT_MS: u64 = 1_200;
const ROUTE_CANDIDATE_PREFLIGHT_MAX: usize = 4;

async fn probe_forward_route_candidate(
    client: &reqwest::Client,
    peer: &ResolvedPeer,
    token: &str,
) -> bool {
    let url = route_preflight_url_for_peer(peer);
    let expected_tls_fingerprint = (peer_transport_scheme(peer) == "https")
        .then(|| peer_public_key_fingerprint(peer))
        .flatten();
    let pinned_client = if let Some(fingerprint) = expected_tls_fingerprint.as_deref() {
        match crate::bridge::tls_pin::fingerprint_pinned_client(fingerprint) {
            Ok(client) => Some(client),
            Err(err) => {
                tracing::warn!(
                    peer = %peer.addr,
                    err = %err,
                    "route candidate preflight skipped; TLS pin client unavailable"
                );
                return false;
            }
        }
    } else {
        None
    };
    let request_client = pinned_client.as_ref().unwrap_or(client);

    match request_client
        .get(&url)
        .bearer_auth(token)
        .timeout(std::time::Duration::from_millis(
            ROUTE_CANDIDATE_PREFLIGHT_TIMEOUT_MS,
        ))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => true,
        Ok(resp) => {
            tracing::debug!(
                peer = %peer.addr,
                status = %resp.status(),
                "route candidate preflight rejected candidate"
            );
            false
        }
        Err(err) => {
            tracing::debug!(
                peer = %peer.addr,
                err = %err,
                "route candidate preflight failed"
            );
            false
        }
    }
}

fn reorder_route_candidates_by_preflight(
    candidates: Vec<ResolvedPeer>,
    preflight_ok: Vec<bool>,
) -> Vec<ResolvedPeer> {
    let mut reachable = Vec::new();
    let mut unproven = Vec::new();
    let mut deferred = Vec::new();

    for (idx, candidate) in candidates.into_iter().enumerate() {
        match preflight_ok.get(idx).copied() {
            Some(true) => reachable.push(candidate),
            Some(false) => unproven.push(candidate),
            None => deferred.push(candidate),
        }
    }

    reachable.extend(unproven);
    reachable.extend(deferred);
    reachable
}

async fn prioritize_route_candidates_for_forward(
    client: &reqwest::Client,
    candidates: Vec<ResolvedPeer>,
    token: &str,
) -> Vec<ResolvedPeer> {
    if candidates.len() < 2 {
        return candidates;
    }

    let preflight_count = candidates.len().min(ROUTE_CANDIDATE_PREFLIGHT_MAX);
    let probes = candidates
        .iter()
        .take(preflight_count)
        .map(|candidate| probe_forward_route_candidate(client, candidate, token));
    let preflight_ok = futures_util::future::join_all(probes).await;
    let reachable_count = preflight_ok.iter().filter(|ok| **ok).count();
    let ordered = reorder_route_candidates_by_preflight(candidates, preflight_ok);
    if reachable_count > 0 {
        tracing::info!(
            candidate_count = ordered.len(),
            preflighted = preflight_count,
            reachable = reachable_count,
            selected_peer = %ordered[0].addr,
            "route candidate preflight selected reachable direct candidate"
        );
    } else {
        tracing::debug!(
            candidate_count = ordered.len(),
            preflighted = preflight_count,
            "route candidate preflight found no reachable direct candidate; preserving fallback order"
        );
    }
    ordered
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
    // Probe candidates with a read-only endpoint before sending the task. Racing
    // `/api/tasks/forward` itself would duplicate execution; this only changes
    // candidate order and leaves the existing direct-then-relay fallback intact.
    route_candidates = prioritize_route_candidates_for_forward(
        &state.http_client,
        route_candidates,
        state.config.outbound_peer_bearer(),
    )
    .await;
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
                state.config.outbound_peer_bearer(),
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

fn route_proof_confirms_private_mesh_callback(proof: &serde_json::Value) -> bool {
    proof.get("route_kind").and_then(|v| v.as_str()) == Some("tailscale")
        && proof.get("result").and_then(|v| v.as_str()) == Some("success")
        && proof
            .get("callback_delivered")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
}

fn task_callback_status_is_terminal(status: &str) -> bool {
    matches!(status, "done" | "failed" | "cancelled")
}

/// Terminal outcome of applying a [`TaskCallback`] to local state.
///
/// `Applied` → the row transitioned and SSE was broadcast. `DuplicateNoOp` →
/// the task was already terminal (idempotent late/duplicate callback). Both are
/// success from the caller's perspective; the axum handler maps both to 200.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskCallbackOutcome {
    Applied,
    DuplicateNoOp,
}

/// POST /api/tasks/callback — receive task result from a peer.
///
/// Thin axum wrapper over [`apply_task_callback`] so the in-process relay drain
/// path (T7) can finalize a verified callback without re-entering the HTTP
/// stack. Both outcomes map to 200.
pub async fn receive_callback(
    State(state): State<AppState>,
    Json(cb): Json<TaskCallback>,
) -> Result<StatusCode> {
    apply_task_callback(&state, &cb)
        .await
        .map(|_| StatusCode::OK)
}

/// Core callback application shared by the HTTP handler and the relay drain.
///
/// W-1 §S-1 (DB-side executor binding): the atomic UPDATE additionally gates on
/// `forwarded_to_node = cb.node`, so a callback only finalizes a task that this
/// node actually forwarded to the node now claiming the result. A same-account
/// peer cannot mark someone else's pending task done — it never appears as that
/// task's `forwarded_to_node`. The gate lives inside the UPDATE's WHERE (not a
/// separate SELECT) so there is no TOCTOU window (pattern-toctou-atomic-update).
pub async fn apply_task_callback(
    state: &AppState,
    cb: &TaskCallback,
) -> Result<TaskCallbackOutcome> {
    tracing::info!(
        source_task_id = %cb.source_task_id,
        remote_task_id = %cb.remote_task_id,
        status = %cb.status,
        node = %cb.node,
        "received task result callback from peer"
    );
    if !task_callback_status_is_terminal(&cb.status) {
        tracing::warn!(
            source_task_id = %cb.source_task_id,
            remote_task_id = %cb.remote_task_id,
            status = %cb.status,
            "rejected task callback with non-terminal status"
        );
        return Err(MusuError::BadRequest(
            "callback status must be done, failed, or cancelled".into(),
        ));
    }

    // Update the original route_execution row with the remote result, but ONLY
    // if it is not already in a terminal state AND the claiming node is the one
    // we actually forwarded the task to. The runner retries the callback up to
    // 3× and a task may be re-forwarded, so a duplicate/late callback can
    // otherwise clobber a row that was already cancelled/failed/done — silently
    // flipping the recorded outcome and re-broadcasting SSE. Gate on status +
    // executor binding and dispatch on rows_affected (pattern-toctou-atomic-update).
    let update_result = sqlx::query(
        "UPDATE route_executions SET status = ?, output = ?, error = ?, \
         exit_code = ?, duration_sec = ?, updated_at = ? \
         WHERE task_id = ? AND status NOT IN ('done', 'failed', 'cancelled') \
         AND forwarded_to_node = ?",
    )
    .bind(&cb.status)
    .bind(&cb.output)
    .bind(&cb.error)
    .bind(cb.exit_code)
    .bind(cb.duration_sec)
    .bind(chrono::Utc::now().timestamp())
    .bind(&cb.source_task_id)
    .bind(&cb.node)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;
    if update_result.rows_affected() == 0 {
        // 0 rows means one of: (a) task already terminal, (b) task unknown,
        // (c) executor-binding mismatch (forged/misrouted callback). Probe the
        // row to give each case the right disposition. The probe is read-only
        // and post-hoc — the authoritative gate already ran in the UPDATE WHERE,
        // so a racing legitimate UPDATE cannot be undone by this branch.
        let bound: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT status, forwarded_to_node FROM route_executions \
             WHERE task_id = ? LIMIT 1",
        )
        .bind(&cb.source_task_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;
        match bound {
            None => {
                tracing::warn!(
                    source_task_id = %cb.source_task_id,
                    remote_task_id = %cb.remote_task_id,
                    "rejected task callback for unknown source task"
                );
                return Err(MusuError::NotFound(format!(
                    "source task {} not found",
                    cb.source_task_id
                )));
            }
            Some((status, _)) if task_callback_status_is_terminal(&status) => {
                tracing::info!(
                    source_task_id = %cb.source_task_id,
                    remote_task_id = %cb.remote_task_id,
                    "ignoring duplicate/late callback for already-terminal task"
                );
                // Idempotent no-op: do not re-broadcast SSE or overwrite the row.
                return Ok(TaskCallbackOutcome::DuplicateNoOp);
            }
            Some((_, None)) => {
                // Non-terminal row exists but has NO executor binding yet. This is
                // NOT forgery evidence: the forward-time binding write may have
                // failed/raced (C-1/Finding-4), or a callback arrived before the
                // binding landed. Returning BadRequest here would let the relay
                // drain permanently drop a legitimate result. Return a RETRIABLE
                // error so the source can re-drive / the executor can re-deliver.
                tracing::warn!(
                    source_task_id = %cb.source_task_id,
                    remote_task_id = %cb.remote_task_id,
                    claimed_node = %cb.node,
                    "task callback arrived before executor binding was recorded; retriable"
                );
                return Err(MusuError::Internal(
                    "executor binding not yet recorded for this task".into(),
                ));
            }
            Some((_, Some(bound_node))) => {
                // Non-terminal row with a CONCRETE binding that does not match the
                // claimant: this is a genuine forged/misrouted callback. Reject.
                tracing::warn!(
                    source_task_id = %cb.source_task_id,
                    remote_task_id = %cb.remote_task_id,
                    claimed_node = %cb.node,
                    bound_node = %bound_node,
                    "rejected task callback: executor binding mismatch"
                );
                return Err(MusuError::BadRequest(
                    "callback executor does not match the task's forwarded node".into(),
                ));
            }
        }
    }

    let callback_context = sqlx::query(
        "SELECT company_id, channel, sender_id FROM route_executions WHERE task_id = ? LIMIT 1",
    )
    .bind(&cb.source_task_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;
    let callback_company_id = callback_context.as_ref().and_then(|row| {
        row.try_get::<Option<String>, _>("company_id")
            .ok()
            .flatten()
    });
    let callback_channel = callback_context
        .as_ref()
        .and_then(|row| row.try_get::<Option<String>, _>("channel").ok().flatten());
    let callback_sender_id = callback_context
        .as_ref()
        .and_then(|row| row.try_get::<Option<String>, _>("sender_id").ok().flatten());

    let musu_home = state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    match crate::bridge::route_evidence::record_task_callback_proof(
        musu_home,
        &cb.source_task_id,
        &cb.remote_task_id,
        &cb.node,
        &cb.status,
        cb.exit_code,
        cb.duration_sec,
    ) {
        Ok(_) => {
            if let Some(proof) =
                crate::bridge::route_evidence::task_route_proof(musu_home, &cb.source_task_id)
            {
                if route_proof_confirms_private_mesh_callback(&proof) {
                    match crate::install::private_mesh::mark_callback_verified(musu_home, &proof) {
                        Ok(true) => tracing::info!(
                            source_task_id = %cb.source_task_id,
                            remote_task_id = %cb.remote_task_id,
                            "MUSU Private Mesh callback proof marked verified"
                        ),
                        Ok(false) => tracing::debug!(
                            source_task_id = %cb.source_task_id,
                            "callback proof was not applied because Private Mesh config is absent or not Headscale mode"
                        ),
                        Err(err) => tracing::warn!(
                            source_task_id = %cb.source_task_id,
                            err = %err,
                            "failed to mark MUSU Private Mesh callback proof verified"
                        ),
                    }
                }
            }
        }
        Err(err) => {
            tracing::warn!(
                source_task_id = %cb.source_task_id,
                remote_task_id = %cb.remote_task_id,
                err = %err,
                "failed to write task callback proof"
            );
        }
    }

    crate::writer::runner::TaskUpdate {
        task_id: &cb.source_task_id,
        status: &cb.status,
        company_id: callback_company_id.as_deref(),
        channel: callback_channel.as_deref(),
        sender_id: callback_sender_id.as_deref(),
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
            .with_context(
                callback_company_id.as_deref(),
                callback_channel.as_deref(),
                callback_sender_id.as_deref(),
            )
            .with_result(
                cb.output.as_deref(),
                cb.error.as_deref(),
                cb.exit_code,
                cb.duration_sec,
            )
            .with_assigned_pc(Some(&cb.node)),
    );

    Ok(TaskCallbackOutcome::Applied)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::peer::discovery::PeerSource;
    use axum::extract::State;
    use std::sync::Arc;
    use tempfile::TempDir;
    use tokio::sync::broadcast::error::TryRecvError;

    fn peer(addr: &str, meta: Option<serde_json::Value>) -> ResolvedPeer {
        ResolvedPeer {
            addr: addr.to_string(),
            name: Some("target-node".to_string()),
            source: PeerSource::Registry,
            meta,
        }
    }

    async fn callback_test_state(pool: sqlx::SqlitePool, musu_home: &std::path::Path) -> AppState {
        let cfg = Arc::new(crate::bridge::config::BridgeConfig {
            bridge_host: "127.0.0.1".to_string(),
            bridge_port: 0,
            public_url: None,
            node_name: "source-node".to_string(),
            db_path: musu_home.join("db").join("musu.db"),
            audit_db_path: musu_home.join("data").join("audit.db"),
            nodes_toml_path: musu_home.join("nodes.toml"),
            token: "test-token".to_string(),
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
        let sse_broadcaster = crate::writer::SseBroadcaster::new(16);
        let task_runner =
            crate::writer::TaskRunnerHandle::new(pool.clone(), sse_broadcaster.clone()).await;
        AppState {
            config: cfg,
            pool: pool.clone(),
            http_client: reqwest::Client::new(),
            audit: crate::bridge::audit::AuditState::new(pool),
            dedup: crate::bridge::dedup::DedupCache::new(),
            task_runner,
            sse_broadcaster,
            pairing: crate::bridge::handlers::pair::PairingStore::new(),
        }
    }

    async fn callback_test_pool() -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE route_executions (
                task_id TEXT PRIMARY KEY,
                company_id TEXT,
                channel TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                input_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                output TEXT,
                error TEXT,
                exit_code INTEGER,
                duration_sec REAL,
                started_at INTEGER,
                updated_at INTEGER,
                forwarded_to_node TEXT,
                remote_task_id TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[test]
    fn private_mesh_callback_gate_requires_tailscale_success_and_callback() {
        assert!(route_proof_confirms_private_mesh_callback(
            &serde_json::json!({
                "route_kind": "tailscale",
                "result": "success",
                "callback_delivered": true,
            })
        ));
        assert!(!route_proof_confirms_private_mesh_callback(
            &serde_json::json!({
                "route_kind": "lan",
                "result": "success",
                "callback_delivered": true,
            })
        ));
        assert!(!route_proof_confirms_private_mesh_callback(
            &serde_json::json!({
                "route_kind": "tailscale",
                "result": "failed",
                "callback_delivered": true,
            })
        ));
        assert!(!route_proof_confirms_private_mesh_callback(
            &serde_json::json!({
                "route_kind": "tailscale",
                "result": "success",
                "callback_delivered": false,
            })
        ));
    }

    #[test]
    fn task_callback_status_accepts_only_terminal_statuses() {
        assert!(task_callback_status_is_terminal("done"));
        assert!(task_callback_status_is_terminal("failed"));
        assert!(task_callback_status_is_terminal("cancelled"));
        assert!(!task_callback_status_is_terminal("pending"));
        assert!(!task_callback_status_is_terminal("running"));
        assert!(!task_callback_status_is_terminal("done "));
        assert!(!task_callback_status_is_terminal(""));
    }

    #[tokio::test]
    async fn receive_callback_rejects_non_terminal_status_before_db_or_sse() {
        let tmp = TempDir::new().unwrap();
        let pool = callback_test_pool().await;
        let state = callback_test_state(pool.clone(), tmp.path()).await;
        sqlx::query(
            "INSERT INTO route_executions (
                task_id, company_id, channel, sender_id, input_hash, status, created_at, updated_at
            ) VALUES ('source-task-1', NULL, 'ceo', 'operator', 'hash', 'pending', 10, 10)",
        )
        .execute(&pool)
        .await
        .unwrap();
        let broadcaster = state.sse_broadcaster.clone();
        let mut events = broadcaster.subscribe();
        while events.try_recv().is_ok() {}

        let result = receive_callback(
            State(state),
            Json(TaskCallback {
                source_task_id: "source-task-1".to_string(),
                remote_task_id: "remote-task-1".to_string(),
                status: "running".to_string(),
                output: Some("should not persist".to_string()),
                error: None,
                exit_code: None,
                duration_sec: None,
                node: "studio-pc".to_string(),
            }),
        )
        .await;

        match result {
            Err(MusuError::BadRequest(message)) => {
                assert!(message.contains("callback status must be done"));
            }
            other => panic!("expected bad request, got {other:?}"),
        }
        let row = sqlx::query("SELECT status, output FROM route_executions WHERE task_id = ?")
            .bind("source-task-1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.try_get::<String, _>("status").unwrap(), "pending");
        assert_eq!(row.try_get::<Option<String>, _>("output").unwrap(), None);
        assert!(matches!(events.try_recv(), Err(TryRecvError::Empty)));
    }

    #[tokio::test]
    async fn receive_callback_rejects_unknown_source_task_before_sse() {
        let tmp = TempDir::new().unwrap();
        let pool = callback_test_pool().await;
        let state = callback_test_state(pool, tmp.path()).await;
        let broadcaster = state.sse_broadcaster.clone();
        let mut events = broadcaster.subscribe();
        while events.try_recv().is_ok() {}

        let result = receive_callback(
            State(state),
            Json(TaskCallback {
                source_task_id: "missing-source-task".to_string(),
                remote_task_id: "remote-task-1".to_string(),
                status: "done".to_string(),
                output: Some("should not publish".to_string()),
                error: None,
                exit_code: Some(0),
                duration_sec: Some(1.0),
                node: "studio-pc".to_string(),
            }),
        )
        .await;

        match result {
            Err(MusuError::NotFound(message)) => {
                assert!(message.contains("source task missing-source-task not found"));
            }
            other => panic!("expected not found, got {other:?}"),
        }
        match events.try_recv() {
            Err(TryRecvError::Empty) => {}
            Ok(event) => assert_ne!(event.task_id, "missing-source-task"),
            Err(other) => panic!("unexpected callback event receive error: {other:?}"),
        }
    }

    // ── W-1 §S-1: receive-side executor binding (DB half) ────────────────────

    async fn insert_forwarded_row(
        pool: &sqlx::SqlitePool,
        task_id: &str,
        status: &str,
        forwarded_to_node: Option<&str>,
    ) {
        sqlx::query(
            "INSERT INTO route_executions (
                task_id, company_id, channel, sender_id, input_hash, status,
                created_at, updated_at, forwarded_to_node
            ) VALUES (?, NULL, 'ceo', 'operator', 'hash', ?, 10, 10, ?)",
        )
        .bind(task_id)
        .bind(status)
        .bind(forwarded_to_node)
        .execute(pool)
        .await
        .unwrap();
    }

    #[test]
    fn relay_request_for_callback_binds_hash_kind_and_reverse_direction() {
        let cb = sample_callback("exec-node");
        let req = relay_request_for_callback(
            "exec-node",   // source = executor (callback sender)
            "source-node", // target = original sender (callback destination)
            "session-1",
            "rev-lease-1",
            &cb,
        )
        .expect("callback request");

        // Reverse direction: executor is the source, original sender is target.
        assert_eq!(req.source_node_id, "exec-node");
        assert_eq!(req.target_node_id, "source-node");
        assert_eq!(req.session_id, "session-1");
        assert_eq!(req.lease_id, "rev-lease-1");
        assert_eq!(req.payload_kind, RELAY_PAYLOAD_KIND_TASK_CALLBACK);

        // Payload is the sha256 of the serialized callback — round-trips through
        // the decoder's integrity gate.
        let decoded = BASE64_STANDARD
            .decode(req.payload_base64.as_bytes())
            .unwrap();
        assert_eq!(
            req.payload_sha256.as_deref(),
            Some(hex::encode(Sha256::digest(&decoded)).as_str())
        );
        let round_trip: TaskCallback = serde_json::from_slice(&decoded).unwrap();
        assert_eq!(round_trip.node, "exec-node");
        assert_eq!(round_trip.source_task_id, cb.source_task_id);
    }

    #[tokio::test]
    async fn apply_task_callback_applies_when_executor_binding_matches() {
        let tmp = TempDir::new().unwrap();
        let pool = callback_test_pool().await;
        // Build state FIRST so boot-orphan recovery (which flips pending→failed)
        // runs on the empty table; then insert the live pending row.
        let state = callback_test_state(pool.clone(), tmp.path()).await;
        // Task was forwarded to "studio-pc"; a callback from "studio-pc" is legit.
        insert_forwarded_row(&pool, "bound-task", "pending", Some("studio-pc")).await;

        let outcome = apply_task_callback(
            &state,
            &TaskCallback {
                source_task_id: "bound-task".to_string(),
                remote_task_id: "remote-1".to_string(),
                status: "done".to_string(),
                output: Some("ok".to_string()),
                error: None,
                exit_code: Some(0),
                duration_sec: Some(2.0),
                node: "studio-pc".to_string(),
            },
        )
        .await
        .expect("callback should apply");
        assert_eq!(outcome, TaskCallbackOutcome::Applied);

        let row = sqlx::query("SELECT status, output FROM route_executions WHERE task_id = ?")
            .bind("bound-task")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.try_get::<String, _>("status").unwrap(), "done");
        assert_eq!(
            row.try_get::<Option<String>, _>("output")
                .unwrap()
                .as_deref(),
            Some("ok")
        );
    }

    #[tokio::test]
    async fn apply_task_callback_rejects_executor_binding_mismatch() {
        let tmp = TempDir::new().unwrap();
        let pool = callback_test_pool().await;
        // Build state first (orphan recovery on empty table), then insert the row.
        let state = callback_test_state(pool.clone(), tmp.path()).await;
        // Task was forwarded to "studio-pc", but "attacker-pc" tries to finalize it.
        insert_forwarded_row(&pool, "victim-task", "pending", Some("studio-pc")).await;
        let mut events = state.sse_broadcaster.subscribe();
        while events.try_recv().is_ok() {}

        let result = apply_task_callback(
            &state,
            &TaskCallback {
                source_task_id: "victim-task".to_string(),
                remote_task_id: "remote-evil".to_string(),
                status: "done".to_string(),
                output: Some("forged result".to_string()),
                error: None,
                exit_code: Some(0),
                duration_sec: Some(0.1),
                node: "attacker-pc".to_string(),
            },
        )
        .await;

        match result {
            Err(MusuError::BadRequest(message)) => {
                assert!(message.contains("executor does not match"));
            }
            other => panic!("expected executor-binding rejection, got {other:?}"),
        }
        // Row must remain untouched (still pending, no forged output, no SSE).
        let row = sqlx::query("SELECT status, output FROM route_executions WHERE task_id = ?")
            .bind("victim-task")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.try_get::<String, _>("status").unwrap(), "pending");
        assert_eq!(row.try_get::<Option<String>, _>("output").unwrap(), None);
        assert!(matches!(events.try_recv(), Err(TryRecvError::Empty)));
    }

    #[tokio::test]
    async fn apply_task_callback_unbound_row_is_retriable_not_forgery() {
        // C-2: a non-terminal row with forwarded_to_node = NULL must NOT be
        // rejected as forgery (BadRequest) — the binding write may have raced or
        // the callback may have arrived first. It must be a RETRIABLE Internal
        // error so the relay drain does not permanently drop a real result.
        let tmp = TempDir::new().unwrap();
        let pool = callback_test_pool().await;
        let state = callback_test_state(pool.clone(), tmp.path()).await;
        // No forwarded_to_node binding (NULL).
        insert_forwarded_row(&pool, "unbound-task", "pending", None).await;

        let result = apply_task_callback(
            &state,
            &TaskCallback {
                source_task_id: "unbound-task".to_string(),
                remote_task_id: "remote-1".to_string(),
                status: "done".to_string(),
                output: Some("real result".to_string()),
                error: None,
                exit_code: Some(0),
                duration_sec: Some(1.0),
                node: "studio-pc".to_string(),
            },
        )
        .await;

        match result {
            Err(MusuError::Internal(message)) => {
                assert!(message.contains("binding not yet recorded"));
            }
            other => panic!("expected retriable Internal, got {other:?}"),
        }
        // Row stays pending (not clobbered) — a retry can still finalize it.
        let row = sqlx::query("SELECT status FROM route_executions WHERE task_id = ?")
            .bind("unbound-task")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.try_get::<String, _>("status").unwrap(), "pending");
    }

    #[tokio::test]
    async fn apply_task_callback_duplicate_on_terminal_is_idempotent_noop() {
        let tmp = TempDir::new().unwrap();
        let pool = callback_test_pool().await;
        let state = callback_test_state(pool.clone(), tmp.path()).await;
        // Already terminal (done). A redelivered callback must be a no-op.
        // (done survives orphan recovery, but keep insert-after-state for parity.)
        insert_forwarded_row(&pool, "settled-task", "done", Some("studio-pc")).await;
        let mut events = state.sse_broadcaster.subscribe();
        while events.try_recv().is_ok() {}

        let outcome = apply_task_callback(
            &state,
            &TaskCallback {
                source_task_id: "settled-task".to_string(),
                remote_task_id: "remote-dup".to_string(),
                status: "failed".to_string(), // would-be clobber to failed
                output: Some("late clobber".to_string()),
                error: Some("nope".to_string()),
                exit_code: Some(1),
                duration_sec: Some(9.0),
                node: "studio-pc".to_string(),
            },
        )
        .await
        .expect("duplicate callback should be a no-op, not an error");
        assert_eq!(outcome, TaskCallbackOutcome::DuplicateNoOp);

        // Original terminal state preserved — no clobber, no SSE re-broadcast.
        let row = sqlx::query("SELECT status, output FROM route_executions WHERE task_id = ?")
            .bind("settled-task")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.try_get::<String, _>("status").unwrap(), "done");
        assert_eq!(row.try_get::<Option<String>, _>("output").unwrap(), None);
        assert!(matches!(events.try_recv(), Err(TryRecvError::Empty)));
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
    fn route_preflight_url_uses_same_peer_base_as_forward() {
        let peer = peer(
            "192.168.1.10:8070",
            Some(serde_json::json!({
                "transport_scheme": "https",
            })),
        );

        assert_eq!(
            route_preflight_url_for_peer(&peer),
            "https://192.168.1.10:8070/api/fleet/node-status"
        );
    }

    #[test]
    fn preflight_reorders_reachable_candidate_before_stale_first_candidate() {
        let stale_lan = peer("192.168.1.10:8070", None);
        let reachable_lan = peer("192.168.1.192:8070", None);
        let deferred_tailnet = peer("100.64.1.10:8070", None);

        let ordered = reorder_route_candidates_by_preflight(
            vec![
                stale_lan.clone(),
                reachable_lan.clone(),
                deferred_tailnet.clone(),
            ],
            vec![false, true],
        );

        assert_eq!(ordered[0].addr, reachable_lan.addr);
        assert_eq!(ordered[1].addr, stale_lan.addr);
        assert_eq!(ordered[2].addr, deferred_tailnet.addr);
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

    // ── W-1 §S-2: reverse callback decoder (forged-callback defense) ──────────

    fn sample_callback(node: &str) -> TaskCallback {
        TaskCallback {
            source_task_id: "source-task-123".to_string(),
            remote_task_id: "remote-task-456".to_string(),
            status: "done".to_string(),
            output: Some("result body".to_string()),
            error: None,
            exit_code: Some(0),
            duration_sec: Some(1.5),
            node: node.to_string(),
        }
    }

    /// Build a claimed relay-payload record carrying a `task_callback_envelope`.
    /// `submitter` is the relay-asserted source_node_id (the executor that
    /// queued the callback); `destination` is the original source node that is
    /// draining it.
    fn relay_payload_record_for_callback(
        cb: &TaskCallback,
        submitter: &str,
        destination: &str,
    ) -> crate::cloud::P2pRelayPayloadStoredRecord {
        let payload_json = serde_json::to_vec(cb).expect("callback json");
        crate::cloud::P2pRelayPayloadStoredRecord {
            payload_id: "cb-payload-1".to_string(),
            session_id: "session-1".to_string(),
            lease_id: "rev-lease-1".to_string(),
            source_node_id: submitter.to_string(),
            target_node_id: destination.to_string(),
            relay_url: "wss://relay.musu.pro/connect".to_string(),
            tunnel_id: "relay-payload-session-revlease".to_string(),
            payload_kind: RELAY_PAYLOAD_KIND_TASK_CALLBACK.to_string(),
            payload_bytes: payload_json.len() as u64,
            payload_sha256: hex::encode(Sha256::digest(&payload_json)),
            status: "claimed".to_string(),
            relay_default_data_path: false,
            release_grade: false,
            transport_kind: "relay_payload_queue_preview".to_string(),
            created_at: "2026-06-20T00:00:00Z".to_string(),
            expires_at: "2026-06-20T00:05:00Z".to_string(),
            claimed_by: Some(destination.to_string()),
            claimed_at: Some("2026-06-20T00:00:01Z".to_string()),
            delivered_at: None,
            payload_base64: Some(BASE64_STANDARD.encode(&payload_json)),
            candidate_route_kinds: vec![crate::cloud::RouteKind::Relay],
            attempted_route_kinds: vec![],
        }
    }

    #[test]
    fn relay_callback_decoder_accepts_claimed_callback_for_local_target() {
        // executor "exec-node" queues a callback for original source "source-node".
        let cb = sample_callback("exec-node");
        let record = relay_payload_record_for_callback(&cb, "exec-node", "source-node");

        let decoded =
            callback_from_relay_payload(&record, "source-node").expect("decoded callback");
        assert_eq!(decoded.source_task_id, "source-task-123");
        assert_eq!(decoded.node, "exec-node");
        assert_eq!(decoded.status, "done");
    }

    #[test]
    fn relay_callback_decoder_rejects_forged_executor_identity() {
        // A same-account peer "attacker-node" claims a result for a task, but the
        // callback body says it was executed by "exec-node" — i.e. it is lying
        // about who it is. source_node_id (relay-asserted submitter) is the
        // attacker; cb.node disagrees → rejected.
        let cb = sample_callback("exec-node");
        let record = relay_payload_record_for_callback(&cb, "attacker-node", "source-node");
        assert_eq!(
            callback_from_relay_payload(&record, "source-node").unwrap_err(),
            "relay_callback_executor_mismatch"
        );
    }

    #[test]
    fn relay_callback_decoder_rejects_target_kind_and_hash_tampering() {
        let cb = sample_callback("exec-node");
        let mut record = relay_payload_record_for_callback(&cb, "exec-node", "source-node");

        // Wrong destination — this node is not the callback's target.
        assert_eq!(
            callback_from_relay_payload(&record, "other-node").unwrap_err(),
            "relay_callback_target_mismatch"
        );

        // Forwarded-task kind must NOT be accepted by the callback decoder.
        record.payload_kind = RELAY_PAYLOAD_KIND_FORWARDED_TASK.to_string();
        assert_eq!(
            callback_from_relay_payload(&record, "source-node").unwrap_err(),
            "relay_callback_kind_unsupported"
        );

        // Restore kind, then tamper the hash → integrity failure.
        record.payload_kind = RELAY_PAYLOAD_KIND_TASK_CALLBACK.to_string();
        record.payload_sha256 = "00".repeat(32);
        assert_eq!(
            callback_from_relay_payload(&record, "source-node").unwrap_err(),
            "relay_callback_sha256_mismatch"
        );
    }

    #[test]
    fn relay_callback_decoder_rejects_non_terminal_status() {
        let mut cb = sample_callback("exec-node");
        cb.status = "running".to_string();
        let record = relay_payload_record_for_callback(&cb, "exec-node", "source-node");
        assert_eq!(
            callback_from_relay_payload(&record, "source-node").unwrap_err(),
            "relay_callback_status_not_terminal"
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
            stored: true,
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
        // W-2: a queued payload carries a payload_id → stored=true, and since the
        // lease was issued the task is genuinely in flight (relay_payload_stored).
        // The benign polling-not-implemented failure_class must NOT mask this.
        assert!(evidence.payload_transport_stored);
        assert!(evidence.relay_payload_stored());
    }

    #[test]
    fn failed_relay_payload_submit_is_not_stored() {
        // W-2 HIGH-1 regression guard: a FAILED relay submission (no payload_id)
        // sets attempted=true but must report stored=false / relay_payload_stored
        // = false, so the sender returns 500 (retryable) instead of a 202 for a
        // task that never reached the relay queue.
        let target = peer("192.168.1.10:8070", None);
        let relay = crate::bridge::rendezvous::RelayLeaseFallback {
            status: crate::bridge::rendezvous::RelayLeaseFallbackStatus::Issued,
            lease_issued: true,
            policy: Some("connect_pro_fallback_only".to_string()),
            blockers: vec![],
            lease_id: Some("relay-lease-test".to_string()),
            failure_class: None,
        };
        let payload_queue = crate::bridge::rendezvous::RelayPayloadQueueOutcome::failed(
            "relay_payload_queue_missing_session_id",
        );

        let evidence = relay_fallback_route_evidence(
            &relay,
            &target,
            &[],
            Some("remote_command"),
            Some(&payload_queue),
        );

        assert!(evidence.lease_issued);
        assert!(evidence.payload_transport_attempted);
        assert!(!evidence.payload_transport_stored);
        assert!(!evidence.relay_payload_stored());
    }
}
