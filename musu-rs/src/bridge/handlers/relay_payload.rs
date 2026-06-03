//! Bounded target-side relay payload drain.
//!
//! This is deliberately request-driven rather than a background loop so it does
//! not add idle CPU pressure. A future opt-in poller can call the same primitive
//! after adding sleep/backoff/cancellation evidence.

use std::net::SocketAddr;
use std::path::Path;
use std::time::Duration;

use axum::extract::{ConnectInfo, State};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::bridge::error::Result;
use crate::bridge::handlers::forward;
use crate::bridge::AppState;

const RELAY_PAYLOAD_DRAIN_SCHEMA: &str = "musu.relay_payload_drain.v1";
const RELAY_PAYLOAD_CLAIM_SCHEMA: &str = "musu.relay_payload_claim.v1";
const RELAY_PAYLOAD_DELIVERY_SCHEMA: &str = "musu.relay_payload_delivery.v1";
const DEFAULT_DRAIN_LIMIT: u32 = 1;
const MAX_DRAIN_LIMIT: u32 = 5;
const DEFAULT_DRAIN_TIMEOUT_MS: u64 = 3_000;

#[derive(Debug, Deserialize, Default)]
pub struct RelayPayloadDrainRequest {
    /// Maximum queued payloads to claim and hand to the local task runner.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Optional rendezvous session filter.
    #[serde(default)]
    pub session_id: Option<String>,
    /// Optional relay lease filter.
    #[serde(default)]
    pub lease_id: Option<String>,
    /// Optional source node filter.
    #[serde(default)]
    pub source_node_id: Option<String>,
    /// Optional tunnel id filter.
    #[serde(default)]
    pub tunnel_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RelayPayloadDrainItem {
    pub payload_id: String,
    pub session_id: String,
    pub lease_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub payload_kind: String,
    pub payload_bytes: u64,
    pub payload_sha256: String,
    pub accepted: bool,
    pub delivered: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_class: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RelayPayloadDrainReport {
    pub schema: &'static str,
    pub ok: bool,
    pub logged_in: bool,
    pub owner_scoped: bool,
    pub target_node_id: String,
    pub limit: u32,
    pub claimed_count: usize,
    pub accepted_count: usize,
    pub delivered_count: usize,
    pub relay_default_data_path: bool,
    pub release_grade: bool,
    pub relay_payload_store_configured: bool,
    pub relay_payload_store_backend: Option<String>,
    pub relay_payload_store_release_grade: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub payloads: Vec<RelayPayloadDrainItem>,
    pub next_steps: Vec<&'static str>,
}

fn drain_limit(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_DRAIN_LIMIT).clamp(1, MAX_DRAIN_LIMIT)
}

fn drain_timeout() -> Duration {
    let millis = std::env::var("MUSU_P2P_RELAY_PAYLOAD_DRAIN_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_DRAIN_TIMEOUT_MS)
        .clamp(250, 10_000);
    Duration::from_millis(millis)
}

fn musu_home_from_state(state: &AppState) -> &Path {
    state
        .config
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
}

fn account_cloud(state: &AppState) -> Option<crate::cloud::MusuCloud> {
    crate::cloud::token::load_token(musu_home_from_state(state))
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
        .map(|token| crate::cloud::MusuCloud::new(&crate::cloud::base_url_from_env(), Some(token)))
}

fn drain_item_from_payload(
    payload: &crate::cloud::P2pRelayPayloadStoredRecord,
) -> RelayPayloadDrainItem {
    RelayPayloadDrainItem {
        payload_id: payload.payload_id.clone(),
        session_id: payload.session_id.clone(),
        lease_id: payload.lease_id.clone(),
        source_node_id: payload.source_node_id.clone(),
        target_node_id: payload.target_node_id.clone(),
        payload_kind: payload.payload_kind.clone(),
        payload_bytes: payload.payload_bytes,
        payload_sha256: payload.payload_sha256.clone(),
        accepted: false,
        delivered: false,
        task_id: None,
        failure_class: None,
    }
}

pub async fn drain_relay_payloads(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    Json(req): Json<RelayPayloadDrainRequest>,
) -> Result<Json<RelayPayloadDrainReport>> {
    let target_node_id = state.config.node_name.clone();
    let limit = drain_limit(req.limit);
    let mut report = RelayPayloadDrainReport {
        schema: RELAY_PAYLOAD_DRAIN_SCHEMA,
        ok: false,
        logged_in: false,
        owner_scoped: false,
        target_node_id: target_node_id.clone(),
        limit,
        claimed_count: 0,
        accepted_count: 0,
        delivered_count: 0,
        relay_default_data_path: false,
        release_grade: false,
        relay_payload_store_configured: false,
        relay_payload_store_backend: None,
        relay_payload_store_release_grade: false,
        error: None,
        payloads: Vec::new(),
        next_steps: vec![
            "keep this drain request-driven until an opt-in poller has sleep/backoff/cancellation evidence",
            "do not mark relay transport release-grade until QUIC/TLS payload transit proof exists",
            "rerun hosted P2P evidence after production KV/Upstash and relay proof are in place",
        ],
    };

    let Some(cloud) = account_cloud(&state) else {
        report.error = Some("not_logged_in".to_string());
        return Ok(Json(report));
    };
    report.logged_in = true;

    let claim = crate::cloud::P2pRelayPayloadClaimRequest {
        schema: RELAY_PAYLOAD_CLAIM_SCHEMA.to_string(),
        target_node_id: target_node_id.clone(),
        claimant_node_id: Some(target_node_id.clone()),
        limit: Some(limit),
        session_id: req.session_id,
        lease_id: req.lease_id,
        source_node_id: req.source_node_id,
        tunnel_id: req.tunnel_id,
        include_payload: true,
    };

    let claim_response =
        match tokio::time::timeout(drain_timeout(), cloud.claim_relay_payloads(&claim)).await {
            Ok(Ok(response)) => response,
            Ok(Err(err)) => {
                report.error = Some(format!("relay_payload_claim_failed:{err}"));
                return Ok(Json(report));
            }
            Err(_) => {
                report.error = Some("relay_payload_claim_timeout".to_string());
                return Ok(Json(report));
            }
        };

    report.owner_scoped = claim_response.owner_scoped;
    report.relay_default_data_path = claim_response.relay_default_data_path;
    report.release_grade = claim_response.release_grade;
    report.relay_payload_store_configured = claim_response.relay_payload_store_configured;
    report.relay_payload_store_backend = Some(claim_response.relay_payload_store_backend.clone());
    report.relay_payload_store_release_grade = claim_response.relay_payload_store_release_grade;
    report.claimed_count = claim_response.payloads.len();

    for payload in claim_response.payloads {
        let mut item = drain_item_from_payload(&payload);
        match forward::forwarded_task_from_relay_payload(&payload, &target_node_id) {
            Ok(task) => match forward::accept_forwarded_task(
                &state,
                addr.ip(),
                "POST",
                "/api/relay/payloads/drain",
                task,
                None,
            )
            .await
            {
                Ok(response) => {
                    item.accepted = true;
                    item.task_id = Some(response.task_id);
                    report.accepted_count += 1;
                    let delivery = crate::cloud::P2pRelayPayloadDeliveryRequest {
                        schema: RELAY_PAYLOAD_DELIVERY_SCHEMA.to_string(),
                        payload_id: payload.payload_id.clone(),
                        target_node_id: target_node_id.clone(),
                    };
                    match tokio::time::timeout(
                        drain_timeout(),
                        cloud.mark_relay_payload_delivered(&delivery),
                    )
                    .await
                    {
                        Ok(Ok(delivery_response))
                            if delivery_response.ok && delivery_response.delivered =>
                        {
                            item.delivered = true;
                            report.delivered_count += 1;
                        }
                        Ok(Ok(_)) => {
                            item.failure_class =
                                Some("relay_payload_delivery_not_confirmed".to_string());
                        }
                        Ok(Err(_)) => {
                            item.failure_class = Some("relay_payload_delivery_failed".to_string());
                        }
                        Err(_) => {
                            item.failure_class = Some("relay_payload_delivery_timeout".to_string());
                        }
                    }
                }
                Err(_) => {
                    item.failure_class = Some("relay_payload_forward_accept_failed".to_string());
                }
            },
            Err(failure_class) => {
                item.failure_class = Some(failure_class);
            }
        }
        report.payloads.push(item);
    }

    report.ok = claim_response.ok
        && claim_response.owner_scoped
        && report.claimed_count == report.delivered_count
        && report
            .payloads
            .iter()
            .all(|item| item.accepted && item.delivered);
    Ok(Json(report))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drain_limit_is_bounded_for_idle_safe_manual_drains() {
        assert_eq!(drain_limit(None), 1);
        assert_eq!(drain_limit(Some(0)), 1);
        assert_eq!(drain_limit(Some(3)), 3);
        assert_eq!(drain_limit(Some(99)), MAX_DRAIN_LIMIT);
    }
}
