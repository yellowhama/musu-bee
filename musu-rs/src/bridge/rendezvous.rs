//! Runtime rendezvous lifecycle for MUSU-assisted P2P routes.
//!
//! This keeps `musu.pro` on the control-plane path only: route attempts may
//! create a short-lived session and publish endpoint candidates, while the
//! task payload still goes over the selected peer path.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, Result};

use crate::bridge::AppState;
use crate::peer::discovery::ResolvedPeer;

const DEFAULT_RENDEZVOUS_TIMEOUT_MS: u64 = 3_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RendezvousStatus {
    Created,
    SkippedNoToken,
    Failed,
}

#[derive(Debug, Clone)]
pub struct RendezvousPreparation {
    pub status: RendezvousStatus,
    pub session_id: Option<String>,
    pub route_peer: Option<ResolvedPeer>,
    pub target_candidate_count: usize,
    pub failure_class: Option<String>,
}

impl RendezvousPreparation {
    fn skipped_no_token() -> Self {
        Self {
            status: RendezvousStatus::SkippedNoToken,
            session_id: None,
            route_peer: None,
            target_candidate_count: 0,
            failure_class: Some("rendezvous_no_account_token".to_string()),
        }
    }

    fn failed(failure_class: impl Into<String>) -> Self {
        Self {
            status: RendezvousStatus::Failed,
            session_id: None,
            route_peer: None,
            target_candidate_count: 0,
            failure_class: Some(failure_class.into()),
        }
    }
}

fn rendezvous_timeout() -> Duration {
    let millis = std::env::var("MUSU_P2P_RENDEZVOUS_CLIENT_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_RENDEZVOUS_TIMEOUT_MS)
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

fn account_cloud(musu_home: &Path) -> Option<crate::cloud::MusuCloud> {
    crate::cloud::token::load_token(musu_home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
        .map(|token| crate::cloud::MusuCloud::new(&crate::cloud::base_url_from_env(), Some(token)))
}

pub fn endpoint_addr_from_url(value: &str) -> String {
    let trimmed = value.trim().trim_end_matches('/');
    if let Ok(url) = reqwest::Url::parse(trimmed) {
        if let Some(host) = url.host_str() {
            let port = url
                .port_or_known_default()
                .unwrap_or(crate::bridge::services::DEFAULT_LOCAL_BRIDGE_PORT);
            if host.contains(':') && !host.starts_with('[') {
                return format!("[{host}]:{port}");
            }
            return format!("{host}:{port}");
        }
    }

    trimmed
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .to_string()
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

pub fn local_candidate_request(
    cfg: &crate::bridge::config::BridgeConfig,
) -> crate::cloud::P2pRendezvousCandidatesRequest {
    local_candidate_request_for_node_id(cfg, cfg.node_name.clone())
}

pub fn local_candidate_request_for_node_id(
    cfg: &crate::bridge::config::BridgeConfig,
    node_id: String,
) -> crate::cloud::P2pRendezvousCandidatesRequest {
    let advertised = crate::bridge::services::advertised_bridge_http_url(cfg);
    let addr = endpoint_addr_from_url(&advertised);
    crate::cloud::P2pRendezvousCandidatesRequest {
        node_id,
        candidate_endpoints: vec![crate::cloud::CandidateEndpoint {
            kind: cloud_route_kind_for_addr(&addr),
            addr,
            observed_at: chrono::Utc::now().to_rfc3339(),
        }],
        relay_capable: false,
        node_name: Some(cfg.node_name.clone()),
        app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
        public_key: None,
        capabilities: Some(vec!["bridge_http_forward".to_string()]),
    }
}

fn route_peer_from_target_candidates(
    target_node_id: &str,
    candidates: &[crate::cloud::CandidateEndpoint],
) -> Option<ResolvedPeer> {
    let peers = candidates
        .iter()
        .filter_map(|candidate| {
            if candidate.addr.trim().is_empty() {
                return None;
            }
            if matches!(
                candidate.kind,
                crate::cloud::RouteKind::Relay | crate::cloud::RouteKind::Failed
            ) {
                return None;
            }
            Some(ResolvedPeer {
                addr: candidate.addr.trim().to_string(),
                name: Some(target_node_id.to_string()),
                source: crate::peer::discovery::PeerSource::Registry,
                meta: Some(serde_json::json!({
                    "source": "musu.pro_rendezvous",
                    "candidate_kind": candidate.kind,
                    "observed_at": candidate.observed_at,
                })),
            })
        })
        .collect::<Vec<_>>();

    crate::bridge::router::select_best_remote_candidate(&peers)
}

pub async fn prepare_forward_rendezvous(
    state: &AppState,
    peer: &ResolvedPeer,
    requested_capability: Option<&str>,
) -> RendezvousPreparation {
    let musu_home = musu_home_from_state(state);
    let Some(cloud) = account_cloud(musu_home) else {
        return RendezvousPreparation::skipped_no_token();
    };

    let source_node_id = state.config.node_name.clone();
    let target_node_id = crate::bridge::route_evidence::target_node_id(peer);
    let create_req = crate::cloud::P2pRendezvousRequest {
        source_node_id: source_node_id.clone(),
        target_node_id: target_node_id.clone(),
        requested_capability: requested_capability.map(str::to_string),
    };
    let candidates_req = local_candidate_request(&state.config);

    let fut = async {
        let created = cloud.create_rendezvous(&create_req).await?;
        let session = cloud
            .add_rendezvous_candidates(&created.session_id, &candidates_req)
            .await?;
        let refreshed = cloud
            .get_rendezvous(&session.session_id)
            .await
            .unwrap_or(session);
        Ok::<_, anyhow::Error>(refreshed)
    };

    match tokio::time::timeout(rendezvous_timeout(), fut).await {
        Ok(Ok(session)) => {
            let route_peer = route_peer_from_target_candidates(
                &target_node_id,
                &session.target.candidate_endpoints,
            );
            tracing::info!(
                session_id = %session.session_id,
                source_node_id = %source_node_id,
                target_node_id = %target_node_id,
                target_candidates = session.target.candidate_endpoints.len(),
                selected_candidate = route_peer.as_ref().map(|peer| peer.addr.as_str()).unwrap_or(""),
                "created/refreshed musu.pro rendezvous session for route attempt"
            );
            RendezvousPreparation {
                status: RendezvousStatus::Created,
                session_id: Some(session.session_id),
                route_peer,
                target_candidate_count: session.target.candidate_endpoints.len(),
                failure_class: None,
            }
        }
        Ok(Err(err)) => {
            tracing::warn!(
                source_node_id = %source_node_id,
                target_node_id = %target_node_id,
                err = %err,
                "failed to create/refresh musu.pro rendezvous session; falling back to selected peer path"
            );
            RendezvousPreparation::failed(format!("rendezvous_error:{err}"))
        }
        Err(_) => {
            tracing::warn!(
                source_node_id = %source_node_id,
                target_node_id = %target_node_id,
                timeout_ms = rendezvous_timeout().as_millis(),
                "timed out creating/refreshing musu.pro rendezvous session; falling back to selected peer path"
            );
            RendezvousPreparation::failed("rendezvous_timeout")
        }
    }
}

pub fn spawn_publish_target_candidates(
    state: AppState,
    session_id: String,
    source_task_id: String,
    target_node_id: Option<String>,
) {
    tokio::spawn(async move {
        let musu_home = musu_home_from_state(&state).to_path_buf();
        match publish_local_candidates(&state, &musu_home, &session_id, target_node_id).await {
            Ok(()) => tracing::info!(
                session_id = %session_id,
                source_task_id = %source_task_id,
                "published local candidates to received rendezvous session"
            ),
            Err(err) => tracing::warn!(
                session_id = %session_id,
                source_task_id = %source_task_id,
                err = %err,
                "failed to publish local candidates to received rendezvous session"
            ),
        }
    });
}

async fn publish_local_candidates(
    state: &AppState,
    musu_home: &Path,
    session_id: &str,
    target_node_id: Option<String>,
) -> Result<()> {
    let cloud = account_cloud(musu_home).ok_or_else(|| anyhow!("rendezvous_no_account_token"))?;
    let req = local_candidate_request_for_node_id(
        &state.config,
        target_node_id.unwrap_or_else(|| state.config.node_name.clone()),
    );
    tokio::time::timeout(
        rendezvous_timeout(),
        cloud.add_rendezvous_candidates(session_id, &req),
    )
    .await
    .map_err(|_| anyhow!("rendezvous_timeout"))??;
    Ok(())
}

pub fn spawn_close_rendezvous_session(
    musu_home: PathBuf,
    session_id: String,
    context: &'static str,
    task_id: String,
) {
    tokio::spawn(async move {
        let Some(cloud) = account_cloud(&musu_home) else {
            tracing::debug!(
                task_id = %task_id,
                session_id = %session_id,
                context,
                "rendezvous close skipped; no account token"
            );
            return;
        };

        let result =
            tokio::time::timeout(rendezvous_timeout(), cloud.close_rendezvous(&session_id)).await;
        match result {
            Ok(Ok(())) => tracing::info!(
                task_id = %task_id,
                session_id = %session_id,
                context,
                "closed musu.pro rendezvous session"
            ),
            Ok(Err(err)) => tracing::warn!(
                task_id = %task_id,
                session_id = %session_id,
                context,
                err = %err,
                "failed to close musu.pro rendezvous session"
            ),
            Err(_) => tracing::warn!(
                task_id = %task_id,
                session_id = %session_id,
                context,
                "timed out closing musu.pro rendezvous session"
            ),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_addr_from_url_preserves_host_port() {
        assert_eq!(
            endpoint_addr_from_url("http://192.168.1.20:8070/"),
            "192.168.1.20:8070"
        );
        assert_eq!(
            endpoint_addr_from_url("https://peer.example.test:443"),
            "peer.example.test:443"
        );
        assert_eq!(
            endpoint_addr_from_url("http://[fd7a:115c:a1e0::99]:8070/"),
            "[fd7a:115c:a1e0::99]:8070"
        );
    }

    #[test]
    fn local_candidate_request_records_bridge_http_capability() {
        let cfg = crate::bridge::config::BridgeConfig {
            bridge_host: "127.0.0.1".to_string(),
            bridge_port: 8070,
            python_facade_port: 8071,
            public_url: Some("http://100.64.1.5:8070".to_string()),
            node_name: "test-node".to_string(),
            db_path: ":memory:".into(),
            audit_db_path: ":memory:".into(),
            nodes_toml_path: ".musu/nodes.toml".into(),
            token: "x".repeat(32),
            peer_token: None,
            localhost_auth_required: true,
            env: crate::bridge::config::AuthMode::Development,
            rate_limit_disabled: true,
            rate_limit_per_min: 0,
            allow_plaintext_lan: false,
            file_serve_roots: vec![],
            file_serve_writable: false,
            tls_enabled: false,
            tls_cert_path: None,
            tls_key_path: None,
        };

        let req = local_candidate_request(&cfg);
        assert_eq!(req.node_id, "test-node");
        assert_eq!(req.node_name.as_deref(), Some("test-node"));
        assert_eq!(req.app_version.as_deref(), Some(env!("CARGO_PKG_VERSION")));
        assert_eq!(req.candidate_endpoints[0].addr, "100.64.1.5:8070");
        assert_eq!(
            req.candidate_endpoints[0].kind,
            crate::cloud::RouteKind::Tailscale
        );
        assert_eq!(
            req.capabilities.as_ref().unwrap(),
            &vec!["bridge_http_forward".to_string()]
        );

        let override_req = local_candidate_request_for_node_id(&cfg, "100.64.1.5:8070".into());
        assert_eq!(override_req.node_id, "100.64.1.5:8070");
        assert_eq!(override_req.node_name.as_deref(), Some("test-node"));
    }

    #[test]
    fn route_peer_from_target_candidates_prefers_best_direct_path() {
        let now = chrono::Utc::now().to_rfc3339();
        let candidates = vec![
            crate::cloud::CandidateEndpoint {
                kind: crate::cloud::RouteKind::DirectQuic,
                addr: "203.0.113.10:8070".to_string(),
                observed_at: now.clone(),
            },
            crate::cloud::CandidateEndpoint {
                kind: crate::cloud::RouteKind::Tailscale,
                addr: "100.64.1.10:8070".to_string(),
                observed_at: now.clone(),
            },
            crate::cloud::CandidateEndpoint {
                kind: crate::cloud::RouteKind::Lan,
                addr: "192.168.1.10:8070".to_string(),
                observed_at: now,
            },
            crate::cloud::CandidateEndpoint {
                kind: crate::cloud::RouteKind::Relay,
                addr: "relay.musu.pro:443".to_string(),
                observed_at: chrono::Utc::now().to_rfc3339(),
            },
        ];

        let peer = route_peer_from_target_candidates("target-node", &candidates).unwrap();
        assert_eq!(peer.name.as_deref(), Some("target-node"));
        assert_eq!(peer.addr, "192.168.1.10:8070");
    }
}
