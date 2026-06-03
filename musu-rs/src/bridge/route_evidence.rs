//! Route attempt evidence for CLI and bridge forwarding paths.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::Result;
use serde::Serialize;

use crate::peer::discovery::ResolvedPeer;

pub const CLI_ROUTE_EVIDENCE_NOTE: &str = "Actual CLI route attempt evidence. HTTPS peers with advertised sha256 certificate fingerprints are recorded only after a fingerprint-pinned request succeeds; HTTP and advertised-only metadata remain non-release-grade until QUIC/TLS proof is wired.";
pub const BRIDGE_FORWARD_ROUTE_EVIDENCE_NOTE: &str = "Actual bridge remote forwarding evidence. Release-grade status depends on recorded peer identity and encryption proof; non-QUIC HTTP bearer remains non-release-grade.";
pub const HTTPS_FINGERPRINT_TRANSPORT_VERIFIER: &str =
    "musu_bridge_forward_fingerprint_pinned_client";
#[allow(dead_code)]
pub const QUIC_TLS_TRANSPORT_VERIFIER: &str = "musu_quic_tls_transport";
pub const RELAY_PAYLOAD_TRANSPORT_NOT_IMPLEMENTED: &str = "relay_payload_transport_not_implemented";
pub const RELAY_TARGET_POLLING_NOT_IMPLEMENTED: &str = "relay_target_polling_not_implemented";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RouteTransportProof {
    pub peer_identity_method: String,
    pub peer_public_key: String,
    pub encryption: String,
    pub transport_verified_by: String,
}

pub fn https_fingerprint_transport_proof(fingerprint: &str) -> RouteTransportProof {
    RouteTransportProof {
        peer_identity_method: "tls_cert_fingerprint_pin".to_string(),
        peer_public_key: fingerprint.to_string(),
        encryption: "https_tls_fingerprint_pin".to_string(),
        transport_verified_by: HTTPS_FINGERPRINT_TRANSPORT_VERIFIER.to_string(),
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RouteAttemptEvidenceResult {
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteRelayFallbackEvidence {
    pub direct_path_failed: bool,
    pub lease_requested: bool,
    pub status: String,
    pub lease_issued: bool,
    pub attempted_route_kinds: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_capability: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policy: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blockers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_class: Option<String>,
    pub payload_transport_attempted: bool,
    pub payload_transport_proven: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload_transport_failure_class: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteRelayPayloadDeliveryProof {
    pub schema: String,
    pub payload_id: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub tunnel_id: String,
    pub payload_sha256: String,
    pub payload_bytes: u64,
    pub delivered_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteAttemptEvidence {
    schema: &'static str,
    version: String,
    source_node_id: String,
    target_node_id: String,
    session_id: Option<String>,
    route_kind: &'static str,
    candidate_addr: String,
    handshake_ms: Option<u64>,
    total_attempt_ms: u64,
    peer_identity_verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    peer_identity_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    peer_public_key: Option<String>,
    encryption: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    transport_verified_by: Option<String>,
    payload_transited_musu_infra: bool,
    result: RouteAttemptEvidenceResult,
    failure_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    relay_fallback: Option<RouteRelayFallbackEvidence>,
    #[serde(skip_serializing_if = "Option::is_none")]
    relay_payload_delivery_proof: Option<RouteRelayPayloadDeliveryProof>,
    recorded_at: String,
    note: &'static str,
}

pub struct RouteAttemptEvidenceInput {
    pub source_node_id: String,
    pub target_node_id: String,
    pub session_id: Option<String>,
    pub candidate_addr: String,
    pub handshake_ms: Option<u64>,
    pub total_attempt_ms: u64,
    pub result: RouteAttemptEvidenceResult,
    pub failure_class: Option<String>,
    pub note: &'static str,
    pub peer_identity_verified: bool,
    pub peer_identity_method: Option<String>,
    pub peer_public_key: Option<String>,
    pub encryption: String,
    pub transport_verified_by: Option<String>,
    pub relay_fallback: Option<RouteRelayFallbackEvidence>,
    pub relay_payload_delivery_proof: Option<RouteRelayPayloadDeliveryProof>,
}

pub struct RouteEvidenceRecord {
    pub path: PathBuf,
    pub evidence: RouteAttemptEvidence,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RouteEvidenceSubmitOutcome {
    Submitted,
    SkippedNoToken,
}

pub fn build_route_attempt_evidence(input: RouteAttemptEvidenceInput) -> RouteAttemptEvidence {
    RouteAttemptEvidence {
        schema: "musu.route_evidence.v1",
        version: env!("CARGO_PKG_VERSION").to_string(),
        source_node_id: input.source_node_id,
        target_node_id: input.target_node_id,
        session_id: input.session_id,
        route_kind: route_evidence_kind_for_addr(&input.candidate_addr),
        candidate_addr: input.candidate_addr,
        handshake_ms: input.handshake_ms,
        total_attempt_ms: input.total_attempt_ms,
        peer_identity_verified: input.peer_identity_verified,
        peer_identity_method: input.peer_identity_method,
        peer_public_key: input.peer_public_key,
        encryption: input.encryption,
        transport_verified_by: input.transport_verified_by,
        payload_transited_musu_infra: false,
        result: input.result,
        failure_class: input.failure_class,
        relay_fallback: input.relay_fallback,
        relay_payload_delivery_proof: input.relay_payload_delivery_proof,
        recorded_at: chrono::Utc::now().to_rfc3339(),
        note: input.note,
    }
}

pub fn cloud_route_evidence(evidence: &RouteAttemptEvidence) -> crate::cloud::RouteEvidence {
    crate::cloud::RouteEvidence {
        schema: evidence.schema.to_string(),
        version: evidence.version.clone(),
        source_node_id: evidence.source_node_id.clone(),
        target_node_id: evidence.target_node_id.clone(),
        session_id: evidence.session_id.clone(),
        route_kind: cloud_route_kind(evidence.route_kind),
        candidate_addr: evidence.candidate_addr.clone(),
        handshake_ms: evidence.handshake_ms,
        total_attempt_ms: evidence.total_attempt_ms,
        peer_identity_verified: evidence.peer_identity_verified,
        peer_identity_method: evidence.peer_identity_method.clone(),
        peer_public_key: evidence.peer_public_key.clone(),
        encryption: evidence.encryption.to_string(),
        transport_verified_by: evidence.transport_verified_by.clone(),
        payload_transited_musu_infra: evidence.payload_transited_musu_infra,
        result: cloud_route_result(evidence.result),
        failure_class: evidence.failure_class.clone(),
        relay_fallback: evidence.relay_fallback.as_ref().map(cloud_relay_fallback),
        relay_transport_proof: None,
        relay_payload_delivery_proof: evidence
            .relay_payload_delivery_proof
            .as_ref()
            .map(cloud_relay_payload_delivery_proof),
        recorded_at: evidence.recorded_at.clone(),
    }
}

fn cloud_relay_payload_delivery_proof(
    evidence: &RouteRelayPayloadDeliveryProof,
) -> crate::cloud::RouteRelayPayloadDeliveryProof {
    crate::cloud::RouteRelayPayloadDeliveryProof {
        schema: evidence.schema.clone(),
        payload_id: evidence.payload_id.clone(),
        session_id: evidence.session_id.clone(),
        lease_id: evidence.lease_id.clone(),
        source_node_id: evidence.source_node_id.clone(),
        target_node_id: evidence.target_node_id.clone(),
        tunnel_id: evidence.tunnel_id.clone(),
        payload_sha256: evidence.payload_sha256.clone(),
        payload_bytes: evidence.payload_bytes,
        delivered_at: evidence.delivered_at.clone(),
    }
}

fn cloud_relay_fallback(
    evidence: &RouteRelayFallbackEvidence,
) -> crate::cloud::RouteRelayFallbackEvidence {
    crate::cloud::RouteRelayFallbackEvidence {
        direct_path_failed: evidence.direct_path_failed,
        lease_requested: evidence.lease_requested,
        status: evidence.status.clone(),
        lease_issued: evidence.lease_issued,
        attempted_route_kinds: evidence
            .attempted_route_kinds
            .iter()
            .map(|kind| cloud_route_kind(kind))
            .collect(),
        requested_capability: evidence.requested_capability.clone(),
        policy: evidence.policy.clone(),
        blockers: evidence.blockers.clone(),
        lease_id: evidence.lease_id.clone(),
        failure_class: evidence.failure_class.clone(),
        payload_transport_attempted: evidence.payload_transport_attempted,
        payload_transport_proven: evidence.payload_transport_proven,
        payload_transport_failure_class: evidence.payload_transport_failure_class.clone(),
    }
}

fn cloud_route_kind(route_kind: &str) -> crate::cloud::RouteKind {
    match route_kind {
        "lan" => crate::cloud::RouteKind::Lan,
        "tailscale" => crate::cloud::RouteKind::Tailscale,
        "direct_quic" => crate::cloud::RouteKind::DirectQuic,
        "relay" => crate::cloud::RouteKind::Relay,
        _ => crate::cloud::RouteKind::Failed,
    }
}

fn cloud_route_result(result: RouteAttemptEvidenceResult) -> crate::cloud::RouteAttemptResult {
    match result {
        RouteAttemptEvidenceResult::Success => crate::cloud::RouteAttemptResult::Success,
        RouteAttemptEvidenceResult::Failed => crate::cloud::RouteAttemptResult::Failed,
    }
}

pub async fn submit_recorded_route_evidence_if_configured(
    musu_home: &Path,
    record: &RouteEvidenceRecord,
) -> Result<RouteEvidenceSubmitOutcome> {
    let Some(token) = crate::cloud::token::load_token(musu_home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
    else {
        return Ok(RouteEvidenceSubmitOutcome::SkippedNoToken);
    };

    let base_url = crate::cloud::base_url_from_env();
    let cloud = crate::cloud::MusuCloud::new(&base_url, Some(token));
    cloud
        .submit_route_evidence(&cloud_route_evidence(&record.evidence))
        .await?;

    Ok(RouteEvidenceSubmitOutcome::Submitted)
}

pub fn spawn_recorded_route_evidence_submit_if_configured(
    musu_home: PathBuf,
    record: RouteEvidenceRecord,
    context: &'static str,
    task_id: String,
) {
    tokio::spawn(async move {
        match submit_recorded_route_evidence_if_configured(&musu_home, &record).await {
            Ok(RouteEvidenceSubmitOutcome::Submitted) => tracing::info!(
                task_id = %task_id,
                context,
                path = %record.path.display(),
                "route evidence submitted to musu.pro"
            ),
            Ok(RouteEvidenceSubmitOutcome::SkippedNoToken) => tracing::debug!(
                task_id = %task_id,
                context,
                path = %record.path.display(),
                "route evidence cloud submit skipped; no token"
            ),
            Err(err) => tracing::warn!(
                task_id = %task_id,
                context,
                path = %record.path.display(),
                err = %err,
                "failed to submit route evidence to musu.pro"
            ),
        }
    });
}

pub fn route_evidence_kind_for_addr(addr: &str) -> &'static str {
    match crate::bridge::router::route_kind_for_addr(addr) {
        crate::bridge::router::RoutePathKind::Local | crate::bridge::router::RoutePathKind::Lan => {
            "lan"
        }
        crate::bridge::router::RoutePathKind::Tailscale => "tailscale",
        crate::bridge::router::RoutePathKind::DirectQuic => "direct_quic",
    }
}

pub fn write_route_attempt_evidence(path: &Path, evidence: &RouteAttemptEvidence) -> Result<()> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }
    let mut json = serde_json::to_string_pretty(evidence)?;
    json.push('\n');
    std::fs::write(path, json)?;
    Ok(())
}

pub fn elapsed_ms(elapsed: Duration) -> u64 {
    elapsed.as_millis().min(u128::from(u64::MAX)) as u64
}

pub fn local_node_id() -> String {
    std::env::var("MUSU_NODE_NAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            hostname::get()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
}

pub fn route_evidence_path(musu_home: &Path, task_id: &str) -> PathBuf {
    let safe_task_id = task_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    musu_home
        .join("route-evidence")
        .join(format!("{safe_task_id}.route-evidence.json"))
}

pub fn target_node_id(peer: &ResolvedPeer) -> String {
    peer.name.clone().unwrap_or_else(|| peer.addr.clone())
}

struct PeerIdentityEvidence {
    verified: bool,
    method: Option<String>,
    public_key: Option<String>,
    encryption: String,
    transport_verified_by: Option<String>,
}

fn peer_identity_meta(
    peer: &ResolvedPeer,
    transport_proof: Option<&RouteTransportProof>,
) -> PeerIdentityEvidence {
    if let Some(proof) = transport_proof {
        return PeerIdentityEvidence {
            verified: true,
            method: Some(proof.peer_identity_method.clone()),
            public_key: Some(proof.peer_public_key.clone()),
            encryption: proof.encryption.clone(),
            transport_verified_by: Some(proof.transport_verified_by.clone()),
        };
    }

    let Some(meta) = &peer.meta else {
        return PeerIdentityEvidence {
            verified: false,
            method: None,
            public_key: None,
            encryption: "none_http_bearer".to_string(),
            transport_verified_by: None,
        };
    };
    let public_key = meta
        .get("peer_public_key")
        .or_else(|| meta.get("public_key"))
        .or_else(|| meta.get("cert_fingerprint"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    PeerIdentityEvidence {
        verified: false,
        method: public_key
            .as_ref()
            .map(|_| "advertised_tls_cert_fingerprint_unverified".to_string()),
        public_key,
        encryption: "none_http_bearer".to_string(),
        transport_verified_by: None,
    }
}

pub fn record_bridge_forward_route_evidence(
    musu_home: &Path,
    task_id: &str,
    source_node_id: &str,
    peer: &ResolvedPeer,
    session_id: Option<String>,
    handshake_ms: Option<u64>,
    total_attempt_ms: u64,
    result: RouteAttemptEvidenceResult,
    failure_class: Option<String>,
    transport_proof: Option<RouteTransportProof>,
    relay_fallback: Option<RouteRelayFallbackEvidence>,
) -> Result<RouteEvidenceRecord> {
    let path = route_evidence_path(musu_home, task_id);
    let peer_identity = peer_identity_meta(peer, transport_proof.as_ref());
    let evidence = build_route_attempt_evidence(RouteAttemptEvidenceInput {
        source_node_id: source_node_id.to_string(),
        target_node_id: target_node_id(peer),
        session_id,
        candidate_addr: peer.addr.clone(),
        handshake_ms,
        total_attempt_ms,
        result,
        failure_class,
        note: BRIDGE_FORWARD_ROUTE_EVIDENCE_NOTE,
        peer_identity_verified: peer_identity.verified,
        peer_identity_method: peer_identity.method,
        peer_public_key: peer_identity.public_key,
        encryption: peer_identity.encryption,
        transport_verified_by: peer_identity.transport_verified_by,
        relay_fallback,
        relay_payload_delivery_proof: None,
    });
    write_route_attempt_evidence(&path, &evidence)?;
    Ok(RouteEvidenceRecord { path, evidence })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_attempt_evidence_records_actual_cli_gap() {
        let evidence = build_route_attempt_evidence(RouteAttemptEvidenceInput {
            source_node_id: "source-node".to_string(),
            target_node_id: "target-node".to_string(),
            session_id: None,
            candidate_addr: "100.100.1.2:8070".to_string(),
            handshake_ms: Some(37),
            total_attempt_ms: 913,
            result: RouteAttemptEvidenceResult::Success,
            failure_class: None,
            note: CLI_ROUTE_EVIDENCE_NOTE,
            peer_identity_verified: false,
            peer_identity_method: None,
            peer_public_key: None,
            encryption: "none_http_bearer".to_string(),
            transport_verified_by: None,
            relay_fallback: None,
            relay_payload_delivery_proof: None,
        });
        let value = serde_json::to_value(evidence).unwrap();

        assert_eq!(value["schema"], "musu.route_evidence.v1");
        assert_eq!(value["source_node_id"], "source-node");
        assert_eq!(value["target_node_id"], "target-node");
        assert_eq!(value["route_kind"], "tailscale");
        assert_eq!(value["candidate_addr"], "100.100.1.2:8070");
        assert_eq!(value["handshake_ms"], 37);
        assert_eq!(value["total_attempt_ms"], 913);
        assert_eq!(value["peer_identity_verified"], false);
        assert_eq!(value["encryption"], "none_http_bearer");
        assert_eq!(value["payload_transited_musu_infra"], false);
        assert_eq!(value["result"], "success");
    }

    #[test]
    fn route_attempt_evidence_maps_loopback_to_lan_contract_kind() {
        let evidence = build_route_attempt_evidence(RouteAttemptEvidenceInput {
            source_node_id: "source-node".to_string(),
            target_node_id: "local".to_string(),
            session_id: None,
            candidate_addr: "127.0.0.1:8070".to_string(),
            handshake_ms: Some(5),
            total_attempt_ms: 12,
            result: RouteAttemptEvidenceResult::Failed,
            failure_class: Some("submit_http_status_503 Service Unavailable".to_string()),
            note: CLI_ROUTE_EVIDENCE_NOTE,
            peer_identity_verified: false,
            peer_identity_method: None,
            peer_public_key: None,
            encryption: "none_http_bearer".to_string(),
            transport_verified_by: None,
            relay_fallback: None,
            relay_payload_delivery_proof: None,
        });
        let value = serde_json::to_value(evidence).unwrap();

        assert_eq!(value["route_kind"], "lan");
        assert_eq!(value["result"], "failed");
        assert_eq!(
            value["failure_class"],
            "submit_http_status_503 Service Unavailable"
        );
    }

    #[test]
    fn route_evidence_path_sanitizes_task_id() {
        let path = route_evidence_path(Path::new("/tmp/musu"), "task:bad/slash");
        assert!(path.ends_with("route-evidence/task_bad_slash.route-evidence.json"));
    }

    #[test]
    fn bridge_route_evidence_records_advertised_peer_identity_material() {
        let dir =
            std::env::temp_dir().join(format!("musu-route-evidence-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let peer = ResolvedPeer {
            addr: "192.168.1.10:8070".to_string(),
            name: Some("target-node".to_string()),
            source: crate::peer::discovery::PeerSource::Registry,
            meta: Some(serde_json::json!({
                "peer_public_key": "sha256:test",
            })),
        };

        let record = record_bridge_forward_route_evidence(
            &dir,
            "task-id",
            "source-node",
            &peer,
            Some("rv_test".to_string()),
            Some(15),
            31,
            RouteAttemptEvidenceResult::Success,
            None,
            None,
            None,
        )
        .unwrap();
        let value = serde_json::to_value(record.evidence).unwrap();

        assert_eq!(
            value["peer_identity_method"],
            "advertised_tls_cert_fingerprint_unverified"
        );
        assert_eq!(value["peer_public_key"], "sha256:test");
        assert_eq!(value["peer_identity_verified"], false);
        assert_eq!(value["encryption"], "none_http_bearer");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn bridge_route_evidence_records_verified_tls_fingerprint_pin() {
        let dir =
            std::env::temp_dir().join(format!("musu-route-evidence-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let peer = ResolvedPeer {
            addr: "192.168.1.10:8070".to_string(),
            name: Some("target-node".to_string()),
            source: crate::peer::discovery::PeerSource::Registry,
            meta: Some(serde_json::json!({
                "peer_public_key": "sha256:test",
            })),
        };

        let record = record_bridge_forward_route_evidence(
            &dir,
            "task-id",
            "source-node",
            &peer,
            Some("rv_test".to_string()),
            Some(15),
            31,
            RouteAttemptEvidenceResult::Success,
            None,
            Some(https_fingerprint_transport_proof("sha256:test")),
            None,
        )
        .unwrap();
        let value = serde_json::to_value(record.evidence).unwrap();

        assert_eq!(value["peer_identity_verified"], true);
        assert_eq!(value["peer_identity_method"], "tls_cert_fingerprint_pin");
        assert_eq!(value["peer_public_key"], "sha256:test");
        assert_eq!(value["encryption"], "https_tls_fingerprint_pin");
        assert_eq!(
            value["transport_verified_by"],
            HTTPS_FINGERPRINT_TRANSPORT_VERIFIER
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn bridge_route_evidence_downgrades_untrusted_verified_quic_claim() {
        let dir =
            std::env::temp_dir().join(format!("musu-route-evidence-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let peer = ResolvedPeer {
            addr: "203.0.113.10:8070".to_string(),
            name: Some("target-node".to_string()),
            source: crate::peer::discovery::PeerSource::Registry,
            meta: Some(serde_json::json!({
                "peer_identity_verified": true,
                "peer_identity_method": "quic_tls_cert_fingerprint",
                "transport_verified_by": QUIC_TLS_TRANSPORT_VERIFIER,
                "peer_public_key": "sha256:test",
                "encryption": "quic_tls_1_3",
            })),
        };

        let record = record_bridge_forward_route_evidence(
            &dir,
            "task-id",
            "source-node",
            &peer,
            Some("rv_test".to_string()),
            Some(15),
            31,
            RouteAttemptEvidenceResult::Success,
            None,
            None,
            None,
        )
        .unwrap();
        let value = serde_json::to_value(record.evidence).unwrap();

        assert_eq!(value["peer_identity_verified"], false);
        assert_eq!(
            value["peer_identity_method"],
            "advertised_tls_cert_fingerprint_unverified"
        );
        assert_eq!(value["peer_public_key"], "sha256:test");
        assert_eq!(value["encryption"], "none_http_bearer");
        assert!(value.get("transport_verified_by").is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn route_attempt_evidence_maps_to_cloud_contract() {
        let evidence = build_route_attempt_evidence(RouteAttemptEvidenceInput {
            source_node_id: "source-node".to_string(),
            target_node_id: "target-node".to_string(),
            session_id: Some("rv_test".to_string()),
            candidate_addr: "203.0.113.10:8070".to_string(),
            handshake_ms: Some(17),
            total_attempt_ms: 29,
            result: RouteAttemptEvidenceResult::Success,
            failure_class: None,
            note: BRIDGE_FORWARD_ROUTE_EVIDENCE_NOTE,
            peer_identity_verified: false,
            peer_identity_method: Some("advertised_tls_cert_fingerprint_unverified".to_string()),
            peer_public_key: Some("sha256:test".to_string()),
            encryption: "none_http_bearer".to_string(),
            transport_verified_by: None,
            relay_fallback: Some(RouteRelayFallbackEvidence {
                direct_path_failed: true,
                lease_requested: true,
                status: "denied".to_string(),
                lease_issued: false,
                attempted_route_kinds: vec!["lan".to_string(), "tailscale".to_string()],
                requested_capability: Some("remote_command".to_string()),
                policy: Some("connect_pro_fallback_only".to_string()),
                blockers: vec!["relay_transport_not_wired".to_string()],
                lease_id: None,
                failure_class: Some("relay_lease_denied".to_string()),
                payload_transport_attempted: false,
                payload_transport_proven: false,
                payload_transport_failure_class: None,
            }),
            relay_payload_delivery_proof: None,
        });

        let cloud = cloud_route_evidence(&evidence);
        assert_eq!(cloud.schema, "musu.route_evidence.v1");
        assert_eq!(cloud.session_id.as_deref(), Some("rv_test"));
        assert_eq!(cloud.route_kind, crate::cloud::RouteKind::DirectQuic);
        assert_eq!(cloud.result, crate::cloud::RouteAttemptResult::Success);
        assert_eq!(
            cloud.peer_identity_method.as_deref(),
            Some("advertised_tls_cert_fingerprint_unverified")
        );
        assert_eq!(cloud.peer_public_key.as_deref(), Some("sha256:test"));
        assert_eq!(cloud.encryption, "none_http_bearer");
        assert_eq!(cloud.transport_verified_by, None);
        let relay = cloud.relay_fallback.unwrap();
        assert!(relay.direct_path_failed);
        assert!(relay.lease_requested);
        assert_eq!(relay.status, "denied");
        assert!(!relay.lease_issued);
        assert_eq!(
            relay.attempted_route_kinds,
            vec![
                crate::cloud::RouteKind::Lan,
                crate::cloud::RouteKind::Tailscale
            ]
        );
        assert_eq!(
            relay.requested_capability.as_deref(),
            Some("remote_command")
        );
        assert_eq!(
            relay.blockers,
            vec!["relay_transport_not_wired".to_string()]
        );
        assert!(!relay.payload_transport_attempted);
        assert!(!relay.payload_transport_proven);
        assert_eq!(relay.payload_transport_failure_class, None);
    }

    #[test]
    fn route_attempt_evidence_maps_relay_payload_delivery_proof_to_cloud_contract() {
        let evidence = build_route_attempt_evidence(RouteAttemptEvidenceInput {
            source_node_id: "source-node".to_string(),
            target_node_id: "target-node".to_string(),
            session_id: Some("rv_test".to_string()),
            candidate_addr: "203.0.113.10:8070".to_string(),
            handshake_ms: Some(17),
            total_attempt_ms: 29,
            result: RouteAttemptEvidenceResult::Success,
            failure_class: None,
            note: BRIDGE_FORWARD_ROUTE_EVIDENCE_NOTE,
            peer_identity_verified: true,
            peer_identity_method: Some("quic_tls_cert_fingerprint".to_string()),
            peer_public_key: Some("sha256:test".to_string()),
            encryption: "quic_tls_1_3".to_string(),
            transport_verified_by: Some(QUIC_TLS_TRANSPORT_VERIFIER.to_string()),
            relay_fallback: None,
            relay_payload_delivery_proof: Some(RouteRelayPayloadDeliveryProof {
                schema: "musu.relay_payload_delivery_proof.v1".to_string(),
                payload_id: "payload-1".to_string(),
                session_id: "rv_test".to_string(),
                lease_id: "lease-1".to_string(),
                source_node_id: "source-node".to_string(),
                target_node_id: "target-node".to_string(),
                tunnel_id: "relay-tunnel-1".to_string(),
                payload_sha256: "abc123".to_string(),
                payload_bytes: 128,
                delivered_at: "2026-06-04T00:00:02Z".to_string(),
            }),
        });

        let value = serde_json::to_value(&evidence).unwrap();
        assert_eq!(
            value["relay_payload_delivery_proof"]["schema"],
            "musu.relay_payload_delivery_proof.v1"
        );
        assert_eq!(
            value["relay_payload_delivery_proof"]["payload_id"],
            "payload-1"
        );

        let cloud = cloud_route_evidence(&evidence);
        let proof = cloud
            .relay_payload_delivery_proof
            .expect("cloud delivery proof");
        assert_eq!(proof.schema, "musu.relay_payload_delivery_proof.v1");
        assert_eq!(proof.payload_id, "payload-1");
        assert_eq!(proof.payload_bytes, 128);
        assert_eq!(proof.delivered_at, "2026-06-04T00:00:02Z");
    }

    #[test]
    fn issued_relay_fallback_records_payload_transport_gap() {
        let fallback = RouteRelayFallbackEvidence {
            direct_path_failed: true,
            lease_requested: true,
            status: "issued".to_string(),
            lease_issued: true,
            attempted_route_kinds: vec!["lan".to_string(), "tailscale".to_string()],
            requested_capability: Some("remote_command".to_string()),
            policy: Some("connect_pro_fallback_only".to_string()),
            blockers: Vec::new(),
            lease_id: Some("relay-lease-test".to_string()),
            failure_class: None,
            payload_transport_attempted: false,
            payload_transport_proven: false,
            payload_transport_failure_class: Some(
                RELAY_PAYLOAD_TRANSPORT_NOT_IMPLEMENTED.to_string(),
            ),
        };
        let value = serde_json::to_value(&fallback).unwrap();

        assert_eq!(value["status"], "issued");
        assert_eq!(value["lease_issued"], true);
        assert_eq!(value["payload_transport_attempted"], false);
        assert_eq!(value["payload_transport_proven"], false);
        assert_eq!(
            value["payload_transport_failure_class"],
            RELAY_PAYLOAD_TRANSPORT_NOT_IMPLEMENTED
        );
    }
}
