use std::net::{IpAddr, Ipv4Addr};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use musu_port_core::platform::{load_device_profile, RuntimeContext};
use musu_port_core::{run_server, MusuPortConfig};
use serde_json::Value;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn route_to_remote_when_resource_rule_requires_it() {
    let port_a = free_tcp_port();
    let port_b = free_tcp_port();
    let db_a = temp_path("handoff-route-a-db", "sqlite3");
    let db_b = temp_path("handoff-route-b-db", "sqlite3");
    let seed_a = temp_path("handoff-route-a-seed", "json");
    let seed_b = temp_path("handoff-route-b-seed", "json");
    write_empty_seed_file(&seed_a);
    write_empty_seed_file(&seed_b);

    let base_b = format!("http://127.0.0.1:{port_b}");
    let server_b = spawn_port_manager(port_b, &seed_b, &db_b, "device-b", vec![]);
    let server_a = spawn_port_manager(port_a, &seed_a, &db_a, "device-a", vec![base_b.clone()]);
    let base_a = format!("http://127.0.0.1:{port_a}");
    wait_for_health(&base_a).await;
    wait_for_health(&base_b).await;

    let client = reqwest::Client::new();
    wait_for_peer_status(&client, &base_a, "ok").await;
    let decision = post_json(
        &client,
        &format!("{base_a}/handoff/route"),
        serde_json::json!({
            "ingress_host": "host-a",
            "resource_requirement": "gpu",
            "metrics_max_age_ms": 60_000
        }),
    )
    .await;

    assert_eq!(
        decision.get("ingress_host").and_then(Value::as_str),
        Some("host-a")
    );
    assert_eq!(
        decision.get("boss_host").and_then(Value::as_str),
        Some("host-a")
    );
    assert_eq!(
        decision.get("selected_target").and_then(Value::as_str),
        Some("device-b")
    );
    assert_eq!(
        decision.get("decision_reason_code").and_then(Value::as_str),
        Some("resource_rule_remote_selected")
    );
    assert_eq!(
        decision.get("fallback_applied").and_then(Value::as_bool),
        Some(false)
    );

    server_a.abort();
    let _ = server_a.await;
    server_b.abort();
    let _ = server_b.await;
    cleanup_paths(&[&seed_a, &seed_b, &db_a, &db_b]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn device_switch_updates_boss_deterministically() {
    let port = free_tcp_port();
    let db = temp_path("handoff-boss-db", "sqlite3");
    let seed = temp_path("handoff-boss-seed", "json");
    write_empty_seed_file(&seed);

    let server = spawn_port_manager(port, &seed, &db, "device-a", vec![]);
    let base = format!("http://127.0.0.1:{port}");
    wait_for_health(&base).await;

    let client = reqwest::Client::new();
    let first = post_json(
        &client,
        &format!("{base}/handoff/route"),
        serde_json::json!({
            "ingress_host": "ingress-alpha",
            "resource_requirement": "cpu",
            "metrics_max_age_ms": 60_000
        }),
    )
    .await;
    assert_eq!(
        first.get("boss_host").and_then(Value::as_str),
        Some("ingress-alpha")
    );

    let second = post_json(
        &client,
        &format!("{base}/handoff/route"),
        serde_json::json!({
            "ingress_host": "ingress-beta",
            "resource_requirement": "cpu",
            "metrics_max_age_ms": 60_000
        }),
    )
    .await;
    assert_eq!(
        second.get("boss_host").and_then(Value::as_str),
        Some("ingress-beta")
    );
    assert_eq!(
        second.get("decision_reason_code").and_then(Value::as_str),
        Some("local_resource_rule")
    );

    let boss_status = get_json(&client, &format!("{base}/boss")).await;
    assert_eq!(
        boss_status.get("boss_device_id").and_then(Value::as_str),
        Some("ingress-beta")
    );

    let latest = get_json(&client, &format!("{base}/handoff/latest")).await;
    assert_eq!(latest.get("available").and_then(Value::as_bool), Some(true));
    assert!(
        latest
            .get("recorded_at_ms")
            .and_then(Value::as_u64)
            .unwrap_or_default()
            > 0
    );
    let latest_decision = latest.get("decision").expect("handoff decision");
    assert_eq!(
        latest_decision.get("boss_host").and_then(Value::as_str),
        Some("ingress-beta")
    );
    assert_eq!(
        latest_decision
            .get("decision_reason_code")
            .and_then(Value::as_str),
        Some("local_resource_rule")
    );

    server.abort();
    let _ = server.await;
    cleanup_paths(&[&seed, &db]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn stale_metrics_force_local_fallback() {
    let port_a = free_tcp_port();
    let port_b = free_tcp_port();
    let db_a = temp_path("handoff-stale-a-db", "sqlite3");
    let db_b = temp_path("handoff-stale-b-db", "sqlite3");
    let seed_a = temp_path("handoff-stale-a-seed", "json");
    let seed_b = temp_path("handoff-stale-b-seed", "json");
    write_empty_seed_file(&seed_a);
    write_empty_seed_file(&seed_b);

    let base_b = format!("http://127.0.0.1:{port_b}");
    let server_b = spawn_port_manager(port_b, &seed_b, &db_b, "device-b", vec![]);
    let server_a = spawn_port_manager(port_a, &seed_a, &db_a, "device-a", vec![base_b.clone()]);
    let base_a = format!("http://127.0.0.1:{port_a}");
    wait_for_health(&base_a).await;
    wait_for_health(&base_b).await;

    let client = reqwest::Client::new();
    wait_for_peer_status(&client, &base_a, "ok").await;
    tokio::time::sleep(Duration::from_millis(20)).await;

    let decision = post_json(
        &client,
        &format!("{base_a}/handoff/route"),
        serde_json::json!({
            "ingress_host": "host-a",
            "resource_requirement": "gpu",
            "metrics_max_age_ms": 0
        }),
    )
    .await;

    assert_eq!(
        decision.get("selected_target").and_then(Value::as_str),
        Some("device-a")
    );
    assert_eq!(
        decision.get("decision_reason_code").and_then(Value::as_str),
        Some("stale_metrics_local_fallback")
    );
    assert_eq!(
        decision.get("fallback_applied").and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        decision
            .get("attempted_remote_target")
            .and_then(Value::as_str),
        Some("device-b")
    );
    assert!(
        decision
            .get("metrics_age_ms")
            .and_then(Value::as_u64)
            .unwrap_or_default()
            > 0
    );

    server_a.abort();
    let _ = server_a.await;
    server_b.abort();
    let _ = server_b.await;
    cleanup_paths(&[&seed_a, &seed_b, &db_a, &db_b]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn unreachable_remote_forces_local_fallback_with_reason_code() {
    let port_a = free_tcp_port();
    let unreachable_port = free_tcp_port();
    let db_a = temp_path("handoff-unreachable-db", "sqlite3");
    let seed_a = temp_path("handoff-unreachable-seed", "json");
    write_empty_seed_file(&seed_a);

    let unreachable_peer = format!("http://127.0.0.1:{unreachable_port}");
    let server_a = spawn_port_manager(port_a, &seed_a, &db_a, "device-a", vec![unreachable_peer]);
    let base_a = format!("http://127.0.0.1:{port_a}");
    wait_for_health(&base_a).await;

    let client = reqwest::Client::new();
    wait_for_peer_status(&client, &base_a, "unreachable").await;

    let decision = post_json(
        &client,
        &format!("{base_a}/handoff/route"),
        serde_json::json!({
            "ingress_host": "host-a",
            "resource_requirement": "gpu",
            "metrics_max_age_ms": 60_000
        }),
    )
    .await;

    assert_eq!(
        decision.get("selected_target").and_then(Value::as_str),
        Some("device-a")
    );
    assert_eq!(
        decision.get("decision_reason_code").and_then(Value::as_str),
        Some("remote_unreachable_local_fallback")
    );
    assert_eq!(
        decision.get("fallback_applied").and_then(Value::as_bool),
        Some(true)
    );

    server_a.abort();
    let _ = server_a.await;
    cleanup_paths(&[&seed_a, &db_a]);
}

fn spawn_port_manager(
    port: u16,
    seed_path: &Path,
    db_path: &Path,
    device_id: &str,
    peer_urls: Vec<String>,
) -> tokio::task::JoinHandle<()> {
    let data_root = db_path.parent().expect("db parent").to_path_buf();
    let runtime_context = RuntimeContext::detect();
    let device_profile_path = data_root
        .join("device-profiles")
        .join(format!("{device_id}.json"));
    let device_profile = load_device_profile(&device_profile_path, &runtime_context, device_id)
        .expect("load device profile");
    let config = MusuPortConfig {
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        preferred_port: port,
        allow_port_fallback: false,
        seed_services_path: Some(seed_path.to_path_buf()),
        device_id: device_id.to_string(),
        device_profile_path,
        device_profile,
        data_root,
        state_db_path: db_path.to_path_buf(),
        runtime_context,
        peer_urls,
        auth_token: None,
    };
    tokio::spawn(async move {
        let _ = run_server(config).await;
    })
}

async fn wait_for_health(base_url: &str) {
    let client = reqwest::Client::new();
    for _ in 0..80 {
        if let Ok(response) = client.get(format!("{base_url}/health")).send().await {
            if response.status().is_success() {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("server did not become healthy: {base_url}");
}

async fn wait_for_peer_status(client: &reqwest::Client, base_url: &str, expected: &str) {
    let peers_url = format!("{base_url}/peers");
    for _ in 0..120 {
        let found = match client.get(&peers_url).send().await {
            Ok(response) if response.status().is_success() => match response.json::<Value>().await {
                Ok(peers) => peers.as_array().is_some_and(|rows| {
                    rows.iter()
                        .any(|row| row.get("status").and_then(Value::as_str) == Some(expected))
                }),
                Err(_) => false,
            },
            _ => false,
        };
        if found {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("peer status '{expected}' did not appear for {base_url}");
}

async fn get_json(client: &reqwest::Client, url: &str) -> Value {
    client
        .get(url)
        .send()
        .await
        .expect("send get")
        .json::<Value>()
        .await
        .expect("decode json")
}

async fn post_json(client: &reqwest::Client, url: &str, body: Value) -> Value {
    client
        .post(url)
        .json(&body)
        .send()
        .await
        .expect("send post")
        .json::<Value>()
        .await
        .expect("decode json")
}

fn write_empty_seed_file(path: &Path) {
    std::fs::write(path, b"[]").expect("write empty seed");
}

fn free_tcp_port() -> u16 {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .expect("bind free tcp")
        .local_addr()
        .expect("tcp local addr")
        .port()
}

fn temp_path(prefix: &str, extension: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("{prefix}-{stamp}.{extension}"))
}

fn cleanup_paths(paths: &[&Path]) {
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
}
