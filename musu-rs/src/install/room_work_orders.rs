use anyhow::{anyhow, Result};
use serde::Serialize;

use crate::bridge::route_evidence::local_node_id;

use super::cli_commands::{RoomWorkOrdersClaimOpts, RoomWorkOrdersDrainOpts};

#[derive(Debug, Serialize)]
struct RoomWorkOrdersClaimFilters {
    limit: u32,
    target_node_id: String,
    local_target: bool,
    company_id: Option<String>,
    project_id: Option<String>,
    source_agent_id: Option<String>,
    work_order_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct RoomWorkOrdersClaimReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    room_id: String,
    ok: bool,
    owner_scope_verified: bool,
    owner_scoped: bool,
    claimed: bool,
    count: usize,
    filters: RoomWorkOrdersClaimFilters,
    work_orders: Vec<crate::cloud::RoomWorkOrderRecord>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct RoomWorkOrdersDrainFilters {
    limit: u32,
    target_node_id: String,
    local_target: bool,
    company_id: Option<String>,
    project_id: Option<String>,
    source_agent_id: Option<String>,
    work_order_id: Option<String>,
    bridge_url: String,
}

#[derive(Debug, Serialize)]
struct RoomWorkOrderBridgeHandoff {
    work_order_id: String,
    ok: bool,
    bridge_status: Option<u16>,
    bridge_task_id: Option<String>,
    bridge_body: Option<serde_json::Value>,
    error: Option<String>,
    server_ack_ok: bool,
    server_ack_error: Option<String>,
}

#[derive(Debug, Serialize)]
struct RoomWorkOrdersDrainReport {
    schema: &'static str,
    registry_url: String,
    logged_in: bool,
    bridge_token_present: bool,
    room_id: String,
    ok: bool,
    owner_scope_verified: bool,
    owner_scoped: bool,
    claimed: bool,
    count: usize,
    handoff_count: usize,
    accepted_count: usize,
    server_ack_count: usize,
    filters: RoomWorkOrdersDrainFilters,
    work_orders: Vec<crate::cloud::RoomWorkOrderRecord>,
    handoffs: Vec<RoomWorkOrderBridgeHandoff>,
    error: Option<String>,
    next_steps: Vec<&'static str>,
}

fn musu_home() -> std::path::PathBuf {
    crate::install::resolve_musu_home_from_env()
        .unwrap_or_else(|_| std::path::PathBuf::from(".").join(".musu"))
}

fn local_bridge_base_url() -> String {
    crate::bridge::services::local_bridge_http_url(&musu_home())
}

fn resolve_room_work_order_target(
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

fn required_room_work_order_target(
    target_node_id: Option<&str>,
    local_target: bool,
) -> Result<String> {
    resolve_room_work_order_target(target_node_id, local_target)?.ok_or_else(|| {
        anyhow!("target node required; pass --target-node-id <id> or --local-target")
    })
}

fn room_work_order_claim_request(
    filters: &RoomWorkOrdersClaimFilters,
) -> crate::cloud::RoomWorkOrderClaimRequest {
    crate::cloud::RoomWorkOrderClaimRequest {
        schema: "musu.room_work_order_claim.v1".to_string(),
        target_node_id: filters.target_node_id.clone(),
        claimant_node_id: Some(filters.target_node_id.clone()),
        company_id: filters.company_id.clone(),
        project_id: filters.project_id.clone(),
        source_agent_id: filters.source_agent_id.clone(),
        work_order_id: filters.work_order_id.clone(),
        limit: Some(filters.limit),
    }
}

fn room_work_order_delegate_body(order: &crate::cloud::RoomWorkOrderRecord) -> serde_json::Value {
    serde_json::json!({
        "channel": order.channel,
        "sender_id": order.sender_id,
        "text": order.instruction,
        "adapter_type": order.adapter_type,
        "cwd": order.cwd,
        "company_id": order.company_id,
        "project_id": order.project_id,
        "room_id": order.room_id,
        "work_order_id": order.work_order_id,
        "origin": "musu.pro",
        "permission_envelope": order.permission_envelope,
        "allow_duplicate": true,
    })
}

fn room_work_order_control_token(home: &std::path::Path) -> Option<String> {
    // Audit H3: control-token precedence now lives in the canonical resolver
    // (`install::token::read_control_token`) instead of being duplicated here,
    // so it cannot silently diverge from the bridge-token chain.
    crate::install::token::read_control_token(home)
}

fn room_work_order_delivery_request(
    order: &crate::cloud::RoomWorkOrderRecord,
    target_node_id: &str,
    handoff: &RoomWorkOrderBridgeHandoff,
) -> crate::cloud::RoomWorkOrderDeliveryRequest {
    crate::cloud::RoomWorkOrderDeliveryRequest {
        schema: "musu.room_work_order_delivery.v1".to_string(),
        work_order_id: order.work_order_id.clone(),
        target_node_id: order
            .target_node
            .clone()
            .unwrap_or_else(|| target_node_id.to_string()),
        status: if handoff.ok { "accepted" } else { "queued" }.to_string(),
        bridge_task_id: handoff.bridge_task_id.clone(),
        bridge_status: handoff.bridge_status.map(|status| status.to_string()),
        error: handoff.error.clone(),
    }
}

fn delivery_ack_matches(
    delivery: &crate::cloud::RoomWorkOrderDeliveryRequest,
    ack: &crate::cloud::RoomWorkOrderDeliveryResponse,
) -> bool {
    match delivery.status.as_str() {
        "accepted" => ack.accepted && !ack.requeued && !ack.failed,
        "queued" => ack.requeued && !ack.accepted && !ack.failed,
        "failed" => ack.failed && !ack.accepted && !ack.requeued,
        _ => false,
    }
}

async fn submit_room_work_order_to_bridge(
    order: &crate::cloud::RoomWorkOrderRecord,
    bridge_url: &str,
    bridge_token: &str,
) -> RoomWorkOrderBridgeHandoff {
    let body = room_work_order_delegate_body(order);
    let url = format!("{}/api/tasks/delegate", bridge_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let resp = match client
        .post(&url)
        .bearer_auth(bridge_token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(err) => {
            return RoomWorkOrderBridgeHandoff {
                work_order_id: order.work_order_id.clone(),
                ok: false,
                bridge_status: None,
                bridge_task_id: None,
                bridge_body: None,
                error: Some(format!("bridge_unavailable:{err}")),
                server_ack_ok: false,
                server_ack_error: None,
            };
        }
    };

    let status = resp.status();
    let bridge_status = Some(status.as_u16());
    let text = resp.text().await.unwrap_or_default();
    let bridge_body = serde_json::from_str::<serde_json::Value>(&text).ok();
    let bridge_task_id = bridge_body
        .as_ref()
        .and_then(|body| body.get("task_id"))
        .and_then(|task_id| task_id.as_str())
        .map(str::to_string);
    let ok = status.is_success() && bridge_task_id.is_some();
    let error = if ok {
        None
    } else {
        Some(
            bridge_body
                .as_ref()
                .and_then(|body| body.get("error"))
                .and_then(|error| error.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| format!("bridge_delegate_failed:{status}:{text}")),
        )
    };

    RoomWorkOrderBridgeHandoff {
        work_order_id: order.work_order_id.clone(),
        ok,
        bridge_status,
        bridge_task_id,
        bridge_body,
        error,
        server_ack_ok: false,
        server_ack_error: None,
    }
}

pub async fn run_claim(opts: RoomWorkOrdersClaimOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let token = room_work_order_control_token(&home);
    let target_node_id =
        required_room_work_order_target(opts.target_node_id.as_deref(), opts.local_target)?;
    let filters = RoomWorkOrdersClaimFilters {
        limit: opts.limit.clamp(1, 20),
        target_node_id,
        local_target: opts.local_target,
        company_id: opts.company_id.clone(),
        project_id: opts.project_id.clone(),
        source_agent_id: opts.source_agent_id.clone(),
        work_order_id: opts.work_order_id.clone(),
    };
    let mut report = RoomWorkOrdersClaimReport {
        schema: "musu.room_work_order_claim_cli.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        room_id: opts.room_id.clone(),
        ok: false,
        owner_scope_verified: false,
        owner_scoped: false,
        claimed: false,
        count: 0,
        filters,
        work_orders: vec![],
        error: None,
        next_steps: vec![
            "inspect claimed work orders manually before wiring a bounded Desktop pickup loop",
            "use `musu room work-orders drain <room-id> --local-target` to hand claimed work to the local bridge",
            "keep pickup on demand until sleep/backoff/cancellation and idle CPU gates are proven",
        ],
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        let claim = room_work_order_claim_request(&report.filters);
        match cloud.claim_room_work_orders(&opts.room_id, &claim).await {
            Ok(response) => {
                report.ok = response.ok;
                report.owner_scope_verified = true;
                report.owner_scoped = response.owner_scoped;
                report.claimed = response.claimed;
                report.count = response.count;
                report.work_orders = response.work_orders;
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

    println!("MUSU room work-order claim");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  room: {}", report.room_id);
    println!("  ok: {}", report.ok);
    println!("  owner scoped: {}", report.owner_scoped);
    println!("  claimed: {}", report.claimed);
    println!("  count: {}", report.count);
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    for order in &report.work_orders {
        println!(
            "  - {} status={} target={} channel={} expires={}",
            order.work_order_id,
            order.status,
            order.target_node.as_deref().unwrap_or("none"),
            order.channel,
            order.expires_at
        );
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

pub async fn run_drain(opts: RoomWorkOrdersDrainOpts) -> Result<()> {
    let home = musu_home();
    let registry_url = crate::cloud::base_url_from_env();
    let token = room_work_order_control_token(&home);
    let bridge_token = crate::install::token::read_bridge_token(&home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());
    let bridge_url = opts
        .bridge_url
        .clone()
        .unwrap_or_else(local_bridge_base_url)
        .trim()
        .trim_end_matches('/')
        .to_string();
    let target_node_id =
        required_room_work_order_target(opts.target_node_id.as_deref(), opts.local_target)?;
    let filters = RoomWorkOrdersDrainFilters {
        limit: opts.limit.clamp(1, 20),
        target_node_id,
        local_target: opts.local_target,
        company_id: opts.company_id.clone(),
        project_id: opts.project_id.clone(),
        source_agent_id: opts.source_agent_id.clone(),
        work_order_id: opts.work_order_id.clone(),
        bridge_url,
    };
    let mut report = RoomWorkOrdersDrainReport {
        schema: "musu.room_work_order_drain_cli.v1",
        registry_url: registry_url.clone(),
        logged_in: token.is_some(),
        bridge_token_present: bridge_token.is_some(),
        room_id: opts.room_id.clone(),
        ok: false,
        owner_scope_verified: false,
        owner_scoped: false,
        claimed: false,
        count: 0,
        handoff_count: 0,
        accepted_count: 0,
        server_ack_count: 0,
        filters,
        work_orders: vec![],
        handoffs: vec![],
        error: None,
        next_steps: vec![
            "use the returned bridge task ids as one-machine execution evidence",
            "add bounded Desktop background pickup only after the on-demand drain path passes",
            "report terminal task status back to MUSU.PRO after bridge result upload is wired",
        ],
    };

    let Some(bridge_token) = bridge_token else {
        report.error = Some("bridge_token_missing".to_string());
        if opts.json {
            println!("{}", serde_json::to_string_pretty(&report)?);
            return Ok(());
        }
        println!("MUSU room work-order drain");
        println!("  registry: {}", report.registry_url);
        println!("  logged in: {}", report.logged_in);
        println!("  bridge token present: {}", report.bridge_token_present);
        println!("  room: {}", report.room_id);
        println!("  ok: {}", report.ok);
        println!("  error: bridge_token_missing");
        return Ok(());
    };

    if let Some(token) = token {
        let cloud = crate::cloud::MusuCloud::new(&registry_url, Some(token));
        let claim_filters = RoomWorkOrdersClaimFilters {
            limit: report.filters.limit,
            target_node_id: report.filters.target_node_id.clone(),
            local_target: report.filters.local_target,
            company_id: report.filters.company_id.clone(),
            project_id: report.filters.project_id.clone(),
            source_agent_id: report.filters.source_agent_id.clone(),
            work_order_id: report.filters.work_order_id.clone(),
        };
        let claim = room_work_order_claim_request(&claim_filters);
        match cloud.claim_room_work_orders(&opts.room_id, &claim).await {
            Ok(response) => {
                report.owner_scope_verified = true;
                report.owner_scoped = response.owner_scoped;
                report.claimed = response.claimed;
                report.count = response.count;
                report.work_orders = response.work_orders;
                for order in &report.work_orders {
                    let mut handoff = submit_room_work_order_to_bridge(
                        order,
                        &report.filters.bridge_url,
                        &bridge_token,
                    )
                    .await;
                    let delivery = room_work_order_delivery_request(
                        order,
                        &report.filters.target_node_id,
                        &handoff,
                    );
                    match cloud
                        .submit_room_work_order_delivery(&opts.room_id, &delivery)
                        .await
                    {
                        Ok(ack) => {
                            handoff.server_ack_ok = ack.ok && delivery_ack_matches(&delivery, &ack);
                            if !ack.ok {
                                handoff.server_ack_error =
                                    Some("room_work_order_delivery_ack_not_ok".to_string());
                            } else if !handoff.server_ack_ok {
                                handoff.server_ack_error = Some(format!(
                                    "room_work_order_delivery_ack_mismatch:requested={}",
                                    delivery.status
                                ));
                            }
                        }
                        Err(err) => {
                            handoff.server_ack_error = Some(err.to_string());
                        }
                    }
                    report.handoffs.push(handoff);
                }
                report.handoff_count = report.handoffs.len();
                report.accepted_count = report.handoffs.iter().filter(|handoff| handoff.ok).count();
                report.server_ack_count = report
                    .handoffs
                    .iter()
                    .filter(|handoff| handoff.server_ack_ok)
                    .count();
                report.ok = response.ok
                    && response.owner_scoped
                    && report.handoff_count == report.count
                    && report.accepted_count == report.count
                    && report.server_ack_count == report.count;
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

    println!("MUSU room work-order drain");
    println!("  registry: {}", report.registry_url);
    println!("  logged in: {}", report.logged_in);
    println!("  bridge token present: {}", report.bridge_token_present);
    println!("  bridge: {}", report.filters.bridge_url);
    println!("  room: {}", report.room_id);
    println!("  ok: {}", report.ok);
    println!("  owner scoped: {}", report.owner_scoped);
    println!("  claimed: {}", report.claimed);
    println!("  count: {}", report.count);
    println!("  handoff count: {}", report.handoff_count);
    println!("  accepted count: {}", report.accepted_count);
    println!("  server ack count: {}", report.server_ack_count);
    if let Some(error) = &report.error {
        println!("  error: {error}");
    }
    for handoff in &report.handoffs {
        println!(
            "  - {} ok={} status={} task_id={} server_ack={}",
            handoff.work_order_id,
            handoff.ok,
            handoff
                .bridge_status
                .map(|status| status.to_string())
                .unwrap_or_else(|| "none".to_string()),
            handoff.bridge_task_id.as_deref().unwrap_or("none"),
            handoff.server_ack_ok
        );
        if let Some(error) = &handoff.error {
            println!("    error: {error}");
        }
        if let Some(error) = &handoff.server_ack_error {
            println!("    server ack error: {error}");
        }
    }
    println!("  next steps:");
    for step in &report.next_steps {
        println!("    - {step}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn room_work_order_required_target_uses_local_node_id() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_NODE_NAME", "local-node");

        assert_eq!(
            required_room_work_order_target(None, true).unwrap(),
            "local-node".to_string()
        );
        assert_eq!(
            required_room_work_order_target(Some("node-b"), false).unwrap(),
            "node-b".to_string()
        );
        assert!(required_room_work_order_target(Some("other-node"), true).is_err());
        assert!(required_room_work_order_target(None, false).is_err());

        std::env::remove_var("MUSU_NODE_NAME");
    }

    #[test]
    fn room_work_order_delegate_body_forces_local_execution_context() {
        let order: crate::cloud::RoomWorkOrderRecord = serde_json::from_value(serde_json::json!({
            "schema": "musu.room_work_order.v1",
            "work_order_id": "wo-1",
            "room_id": "project-room",
            "company_id": "company-a",
            "project_id": "project-a",
            "target_node": "local-node",
            "source_agent_id": "agent-a",
            "sender_id": "musu.pro-room",
            "channel": "company-room",
            "adapter_type": "claude",
            "workspace_uri": "file:///F:/workspace/musu-bee",
            "cwd": "F:\\workspace\\musu-bee",
            "instruction": "Run the one-machine smoke",
            "permission_envelope": {"allow": ["read"]},
            "trace_id": "trace-1",
            "origin": "musu.pro",
            "delivery_mode": "desktop_outbound_pickup",
            "status": "claimed",
            "created_at": "2026-06-07T10:00:00Z",
            "expires_at": "2026-06-07T10:15:00Z",
            "claimed_by": "local-node",
            "claimed_at": "2026-06-07T10:01:00Z"
        }))
        .unwrap();

        let body = room_work_order_delegate_body(&order);

        assert_eq!(body["channel"], "company-room");
        assert_eq!(body["sender_id"], "musu.pro-room");
        assert_eq!(body["text"], "Run the one-machine smoke");
        assert_eq!(body["origin"], "musu.pro");
        assert_eq!(body["work_order_id"], "wo-1");
        assert_eq!(body["room_id"], "project-room");
        assert_eq!(body["permission_envelope"]["allow"][0], "read");
        assert_eq!(body["allow_duplicate"], true);
        assert!(body.get("target_node").is_none());
    }

    #[test]
    fn room_work_order_control_token_prefers_p2p_env_then_account_file() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("MUSU_P2P_CONTROL_TOKEN");
        std::env::remove_var("MUSU_ROUTE_EVIDENCE_TOKEN");
        std::env::remove_var("MUSU_TOKEN");
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join(".musu");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::write(home.join("token"), "account-token\n").unwrap();

        assert_eq!(
            room_work_order_control_token(&home),
            Some("account-token".to_string())
        );

        std::env::set_var("MUSU_P2P_CONTROL_TOKEN", "control-token");
        assert_eq!(
            room_work_order_control_token(&home),
            Some("control-token".to_string())
        );

        std::env::remove_var("MUSU_P2P_CONTROL_TOKEN");
        std::env::remove_var("MUSU_ROUTE_EVIDENCE_TOKEN");
        std::env::remove_var("MUSU_TOKEN");
    }

    #[test]
    fn room_work_order_delivery_request_requeues_failed_handoff() {
        let order: crate::cloud::RoomWorkOrderRecord = serde_json::from_value(serde_json::json!({
            "schema": "musu.room_work_order.v1",
            "work_order_id": "wo-2",
            "room_id": "project-room",
            "target_node": "local-node",
            "sender_id": "musu.pro-room",
            "channel": "company-room",
            "instruction": "Run the one-machine smoke",
            "origin": "musu.pro",
            "delivery_mode": "desktop_outbound_pickup",
            "status": "claimed",
            "created_at": "2026-06-07T10:00:00Z",
            "expires_at": "2026-06-07T10:15:00Z"
        }))
        .unwrap();
        let handoff = RoomWorkOrderBridgeHandoff {
            work_order_id: "wo-2".to_string(),
            ok: false,
            bridge_status: None,
            bridge_task_id: None,
            bridge_body: None,
            error: Some("bridge_unavailable:test".to_string()),
            server_ack_ok: false,
            server_ack_error: None,
        };

        let delivery = room_work_order_delivery_request(&order, "fallback-node", &handoff);

        assert_eq!(delivery.schema, "musu.room_work_order_delivery.v1");
        assert_eq!(delivery.work_order_id, "wo-2");
        assert_eq!(delivery.target_node_id, "local-node");
        assert_eq!(delivery.status, "queued");
        assert_eq!(delivery.error, Some("bridge_unavailable:test".to_string()));
    }

    #[test]
    fn delivery_ack_must_match_requested_status() {
        let delivery = crate::cloud::RoomWorkOrderDeliveryRequest {
            schema: "musu.room_work_order_delivery.v1".to_string(),
            work_order_id: "wo-3".to_string(),
            target_node_id: "local-node".to_string(),
            status: "queued".to_string(),
            bridge_task_id: None,
            bridge_status: None,
            error: Some("bridge_unavailable:test".to_string()),
        };
        let ack = crate::cloud::RoomWorkOrderDeliveryResponse {
            schema: "musu.room_work_order_delivery.v1".to_string(),
            ok: true,
            room_id: "project-room".to_string(),
            owner_scoped: true,
            accepted: true,
            requeued: false,
            failed: false,
            work_order: serde_json::from_value(serde_json::json!({
                "schema": "musu.room_work_order.v1",
                "work_order_id": "wo-3",
                "room_id": "project-room",
                "target_node": "local-node",
                "sender_id": "musu.pro-room",
                "channel": "company-room",
                "instruction": "Run the one-machine smoke",
                "origin": "musu.pro",
                "delivery_mode": "desktop_outbound_pickup",
                "status": "accepted",
                "created_at": "2026-06-07T10:00:00Z",
                "expires_at": "2026-06-07T10:15:00Z"
            }))
            .unwrap(),
        };

        assert!(!delivery_ack_matches(&delivery, &ack));
    }
}
