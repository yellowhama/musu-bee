//! Route attempt evidence for CLI and bridge forwarding paths.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::Result;
use serde::Serialize;

use crate::peer::discovery::ResolvedPeer;

pub const CLI_ROUTE_EVIDENCE_NOTE: &str = "Actual CLI route attempt evidence. Current transport is legacy HTTP bearer, so this records timing/result but is intentionally not release-grade until peer identity and QUIC/TLS proof are wired.";
pub const BRIDGE_FORWARD_ROUTE_EVIDENCE_NOTE: &str = "Actual bridge remote forwarding evidence. Current transport is legacy HTTP bearer, so this records timing/result but is intentionally not release-grade until peer identity and QUIC/TLS proof are wired.";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RouteAttemptEvidenceResult {
    Success,
    Failed,
}

#[derive(Debug, Serialize)]
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
    encryption: &'static str,
    payload_transited_musu_infra: bool,
    result: RouteAttemptEvidenceResult,
    failure_class: Option<String>,
    recorded_at: String,
    note: &'static str,
}

pub struct RouteAttemptEvidenceInput {
    pub source_node_id: String,
    pub target_node_id: String,
    pub candidate_addr: String,
    pub handshake_ms: Option<u64>,
    pub total_attempt_ms: u64,
    pub result: RouteAttemptEvidenceResult,
    pub failure_class: Option<String>,
    pub note: &'static str,
}

pub fn build_route_attempt_evidence(input: RouteAttemptEvidenceInput) -> RouteAttemptEvidence {
    RouteAttemptEvidence {
        schema: "musu.route_evidence.v1",
        version: env!("CARGO_PKG_VERSION").to_string(),
        source_node_id: input.source_node_id,
        target_node_id: input.target_node_id,
        session_id: None,
        route_kind: route_evidence_kind_for_addr(&input.candidate_addr),
        candidate_addr: input.candidate_addr,
        handshake_ms: input.handshake_ms,
        total_attempt_ms: input.total_attempt_ms,
        peer_identity_verified: false,
        encryption: "none_http_bearer",
        payload_transited_musu_infra: false,
        result: input.result,
        failure_class: input.failure_class,
        recorded_at: chrono::Utc::now().to_rfc3339(),
        note: input.note,
    }
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

pub fn record_bridge_forward_route_evidence(
    musu_home: &Path,
    task_id: &str,
    source_node_id: &str,
    peer: &ResolvedPeer,
    handshake_ms: Option<u64>,
    total_attempt_ms: u64,
    result: RouteAttemptEvidenceResult,
    failure_class: Option<String>,
) -> Result<PathBuf> {
    let path = route_evidence_path(musu_home, task_id);
    let evidence = build_route_attempt_evidence(RouteAttemptEvidenceInput {
        source_node_id: source_node_id.to_string(),
        target_node_id: target_node_id(peer),
        candidate_addr: peer.addr.clone(),
        handshake_ms,
        total_attempt_ms,
        result,
        failure_class,
        note: BRIDGE_FORWARD_ROUTE_EVIDENCE_NOTE,
    });
    write_route_attempt_evidence(&path, &evidence)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_attempt_evidence_records_actual_cli_gap() {
        let evidence = build_route_attempt_evidence(RouteAttemptEvidenceInput {
            source_node_id: "source-node".to_string(),
            target_node_id: "target-node".to_string(),
            candidate_addr: "100.100.1.2:8070".to_string(),
            handshake_ms: Some(37),
            total_attempt_ms: 913,
            result: RouteAttemptEvidenceResult::Success,
            failure_class: None,
            note: CLI_ROUTE_EVIDENCE_NOTE,
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
            candidate_addr: "127.0.0.1:8070".to_string(),
            handshake_ms: Some(5),
            total_attempt_ms: 12,
            result: RouteAttemptEvidenceResult::Failed,
            failure_class: Some("submit_http_status_503 Service Unavailable".to_string()),
            note: CLI_ROUTE_EVIDENCE_NOTE,
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
}
