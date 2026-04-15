use std::net::{IpAddr, Ipv4Addr};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::extract::OriginalUri;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::any;
use axum::Router;
use musu_port_core::platform::{load_device_profile, RuntimeContext};
use musu_port_core::{run_server, MusuPortConfig};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn standalone_runtime_matches_parity_baseline() {
    let http_port = free_tcp_port();
    let tcp_target_port = free_tcp_port();
    let pm_port_a = free_tcp_port();
    let pm_port_b = free_tcp_port();
    let udp_target_port = free_udp_port();

    let db_path = temp_path("parity-db", "sqlite3");
    let seed_path = temp_path("parity-seed", "json");
    write_seed_file(&seed_path, http_port);

    let http_task = spawn_http_echo_server(http_port).await;
    let tcp_task = spawn_tcp_echo_server(tcp_target_port).await;
    let udp_guard = tokio::net::UdpSocket::bind(("127.0.0.1", udp_target_port))
        .await
        .expect("bind udp discovery guard");

    let base_url_a = format!("http://127.0.0.1:{pm_port_a}");
    let server_a = spawn_port_manager(pm_port_a, &seed_path, &db_path, "parity-test-device", None);
    wait_for_health(&base_url_a).await;

    let client = reqwest::Client::new();
    let health = get_json(&client, &format!("{base_url_a}/health")).await;
    assert!(health
        .get("runtime_context")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty()));
    assert!(health
        .get("filesystem_context")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty()));
    assert!(health
        .get("binary_kind")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty()));
    assert!(health
        .get("discovery_provider")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty()));
    assert!(health
        .get("data_root")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty()));
    assert!(health
        .get("preferred_executable_path")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty()));
    assert!(health
        .get("executable_candidates")
        .and_then(Value::as_array)
        .is_some_and(|rows| !rows.is_empty()));
    assert_eq!(
        health
            .get("device_profile_guidance_hints")
            .and_then(Value::as_u64)
            .unwrap_or_default(),
        0
    );
    assert!(health.get("cpu_pct").and_then(Value::as_f64).is_some());
    assert!(health.get("ram_used").and_then(Value::as_u64).is_some());
    assert!(health.get("ram_total").and_then(Value::as_u64).is_some());
    assert!(health.get("queue_depth").and_then(Value::as_u64).is_some());
    assert!(matches!(
        health.get("gpu_util"),
        Some(value) if value.is_null() || value.as_f64().is_some()
    ));
    assert!(matches!(
        health.get("gpu_mem_used"),
        Some(value) if value.is_null() || value.as_u64().is_some()
    ));
    assert!(matches!(
        health.get("gpu_mem_total"),
        Some(value) if value.is_null() || value.as_u64().is_some()
    ));

    let connect_disabled =
        get_json_with_status(&client, &format!("{base_url_a}/connect/demo-api")).await;
    assert_eq!(connect_disabled.0, reqwest::StatusCode::FORBIDDEN);
    assert_eq!(
        connect_disabled
            .1
            .get("denial_reason")
            .and_then(Value::as_str),
        Some("CONNECT mode is disabled")
    );

    let denied_events = get_json(&client, &format!("{base_url_a}/audit/connect-denied")).await;
    assert_eq!(denied_events.as_array().map(|rows| rows.len()), Some(1));
    let drained_events = get_json(
        &client,
        &format!("{base_url_a}/audit/connect-denied?drain=true"),
    )
    .await;
    assert_eq!(drained_events.as_array().map(|rows| rows.len()), Some(1));
    let denied_after_drain = get_json(&client, &format!("{base_url_a}/audit/connect-denied")).await;
    assert_eq!(
        denied_after_drain.as_array().map(|rows| rows.len()),
        Some(0)
    );

    let connect_mode = post_json(
        &client,
        &format!("{base_url_a}/connect/mode"),
        serde_json::json!({ "mode": "preview" }),
    )
    .await;
    assert_eq!(
        connect_mode.get("mode").and_then(Value::as_str),
        Some("preview")
    );
    let connect_preview =
        get_json_with_status(&client, &format!("{base_url_a}/connect/demo-api")).await;
    assert_eq!(connect_preview.0, reqwest::StatusCode::OK);
    assert_eq!(
        connect_preview.1.get("allowed").and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        connect_preview
            .1
            .get("delivery_contract")
            .and_then(Value::as_str),
        Some("connect_url_handoff")
    );
    assert_eq!(
        connect_preview
            .1
            .get("bridge_owner")
            .and_then(Value::as_str),
        Some("musu-port")
    );
    assert_eq!(
        connect_preview
            .1
            .get("remote_bridge_supported")
            .and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(
        connect_preview
            .1
            .get("connect_kind")
            .and_then(Value::as_str),
        Some("http_alias")
    );

    let routes = get_json(&client, &format!("{base_url_a}/routes")).await;
    assert!(routes
        .as_array()
        .expect("routes array")
        .iter()
        .any(|row| row.get("alias") == Some(&Value::String("demo-api".to_string()))));

    let http_body = client
        .get(format!("{base_url_a}/demo-api/parity?check=1"))
        .send()
        .await
        .expect("proxy request")
        .text()
        .await
        .expect("proxy body");
    assert_eq!(http_body, "/parity?check=1");

    let tcp_signature = wait_for_discovered_signature(&client, &base_url_a, "tcp", tcp_target_port)
        .await
        .expect("discover tcp signature");
    let udp_signature = wait_for_discovered_signature(&client, &base_url_a, "udp", udp_target_port)
        .await
        .expect("discover udp signature");

    let promote_response = post_json(
        &client,
        &format!("{base_url_a}/promote"),
        serde_json::json!({
            "signature": tcp_signature,
            "alias": "tcp-parity",
            "protocol": "tcp"
        }),
    )
    .await;
    let tcp_entrypoint = promote_response
        .get("entrypoint_url")
        .and_then(Value::as_str)
        .expect("promote entrypoint");
    let tcp_bind_port = parse_port_from_endpoint(tcp_entrypoint);

    wait_for_l4_runner(&client, &base_url_a, "tcp-parity").await;
    assert_tcp_echo(tcp_bind_port, b"parity-ping").await;

    let _ignored = post_empty(
        &client,
        &format!("{base_url_a}/ignore"),
        serde_json::json!({ "signature": udp_signature }),
    )
    .await;

    let discovery_after_ignore = get_json(&client, &format!("{base_url_a}/discovery")).await;
    let ignored_row = discovery_after_ignore
        .as_array()
        .expect("discovery array")
        .iter()
        .find(|row| row.get("signature") == Some(&Value::String(udp_signature.clone())))
        .expect("ignored discovery row");
    assert_eq!(
        ignored_row.get("ignored").and_then(Value::as_bool),
        Some(true)
    );

    let coverage_a = get_json(&client, &format!("{base_url_a}/coverage")).await;
    let dual_path_status = coverage_a
        .get("metadata_dual_path_status")
        .expect("metadata_dual_path_status");
    assert!(dual_path_status.is_object());
    assert!(dual_path_status
        .get("roundtrip_ready")
        .and_then(Value::as_bool)
        .is_some());
    assert!(coverage_a
        .get("managed_aliases")
        .and_then(Value::as_array)
        .expect("managed_aliases")
        .iter()
        .any(|value| value == "demo-api"));
    assert!(coverage_a
        .get("managed_aliases")
        .and_then(Value::as_array)
        .expect("managed_aliases")
        .iter()
        .any(|value| value == "tcp-parity"));
    assert!(coverage_a
        .get("ignored_signatures")
        .and_then(Value::as_array)
        .expect("ignored_signatures")
        .iter()
        .any(|value| value == &Value::String(udp_signature.clone())));

    let audit_events_a = get_json(&client, &format!("{base_url_a}/audit/events")).await;
    let event_types_a = audit_events_a
        .as_array()
        .expect("audit events array")
        .iter()
        .filter_map(|row| row.get("event_type").and_then(Value::as_str))
        .collect::<Vec<_>>();
    assert!(event_types_a.contains(&"promote"));
    assert!(event_types_a.contains(&"ignore_signature"));

    server_a.abort();
    let _ = server_a.await;

    let base_url_b = format!("http://127.0.0.1:{pm_port_b}");
    let server_b = spawn_port_manager(pm_port_b, &seed_path, &db_path, "parity-test-device", None);
    wait_for_health(&base_url_b).await;
    wait_for_l4_runner(&client, &base_url_b, "tcp-parity").await;

    let routes_b = get_json(&client, &format!("{base_url_b}/routes")).await;
    assert!(routes_b
        .as_array()
        .expect("routes array")
        .iter()
        .any(|row| row.get("alias") == Some(&Value::String("tcp-parity".to_string()))));

    assert_tcp_echo(tcp_bind_port, b"parity-restart").await;

    let coverage_b = get_json(&client, &format!("{base_url_b}/coverage")).await;
    assert!(coverage_b
        .get("ignored_signatures")
        .and_then(Value::as_array)
        .expect("ignored_signatures")
        .iter()
        .any(|value| value == &Value::String(udp_signature.clone())));
    assert_eq!(
        coverage_b
            .get("external_routes")
            .and_then(Value::as_u64)
            .expect("external_routes"),
        1
    );

    let audit_events_b = get_json(&client, &format!("{base_url_b}/audit/events")).await;
    let event_types_b = audit_events_b
        .as_array()
        .expect("audit events array")
        .iter()
        .filter_map(|row| row.get("event_type").and_then(Value::as_str))
        .collect::<Vec<_>>();
    assert!(event_types_b.contains(&"promote"));
    assert!(event_types_b.contains(&"ignore_signature"));

    server_b.abort();
    let _ = server_b.await;
    http_task.abort();
    let _ = http_task.await;
    tcp_task.abort();
    let _ = tcp_task.await;
    drop(udp_guard);

    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn discovery_uses_device_profile_for_mcp_health_and_aliasing() {
    let mcp_port = free_tcp_port();
    let pm_port = free_tcp_port();
    let db_path = temp_path("mcp-profile-db", "sqlite3");
    let seed_path = temp_path("mcp-profile-seed", "json");
    write_empty_seed_file(&seed_path);

    let device_id = "mcp-test-device";
    let profile_payload = serde_json::json!({
        "device_id": device_id,
        "health": {
            "mcp_health_path": "/custom-mcp/health"
        },
        "guidance": {
            "translator_hints": ["use device-profile health path first"]
        },
        "service_templates": [
            {
                "name": "python3",
                "service_class": "mcp_server",
                "match_process_names": ["python3"],
                "agent_facing": true
            }
        ]
    });

    let mcp_task = spawn_mcp_health_server(mcp_port, "/custom-mcp/health").await;
    let base_url = format!("http://127.0.0.1:{pm_port}");
    let server = spawn_port_manager(
        pm_port,
        &seed_path,
        &db_path,
        device_id,
        Some(profile_payload),
    );
    wait_for_health(&base_url).await;

    let client = reqwest::Client::new();
    let health = get_json(&client, &format!("{base_url}/health")).await;
    assert_eq!(
        health.get("device_profile_loaded").and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        health
            .get("device_profile_guidance_hints")
            .and_then(Value::as_u64),
        Some(1)
    );

    let discovery = wait_for_discovery_match(&client, &base_url, |row| {
        row.get("port").and_then(Value::as_u64) == Some(mcp_port as u64)
            && row.get("service_class").and_then(Value::as_str) == Some("mcp_server")
    })
    .await
    .expect("mcp discovery match");

    assert_eq!(
        discovery
            .get("classification_source")
            .and_then(Value::as_str),
        Some("mcp_health_probe")
    );
    assert_eq!(
        discovery.get("agent_facing").and_then(Value::as_bool),
        Some(true)
    );
    assert!(discovery
        .get("suggested_alias")
        .and_then(Value::as_str)
        .is_some_and(|alias| alias.starts_with("mcp-mcp-test-device-")));

    server.abort();
    let _ = server.await;
    mcp_task.abort();
    let _ = mcp_task.await;

    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(
        db_path
            .parent()
            .expect("db parent")
            .join("device-profiles")
            .join(format!("{device_id}.json")),
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn mcp_candidates_can_auto_promote_from_device_profile_policy() {
    let mcp_port = free_tcp_port();
    let stray_mcp_port = free_tcp_port();
    let pm_port = free_tcp_port();
    let db_path = temp_path("mcp-auto-promote-db", "sqlite3");
    let seed_path = temp_path("mcp-auto-promote-seed", "json");
    write_empty_seed_file(&seed_path);

    let device_id = "auto-promote-device";
    let profile_payload = serde_json::json!({
        "device_id": device_id,
        "health": {
            "mcp_health_path": "/mcp/health"
        },
        "transport": {
            "auto_promote_mcp": true
        },
        "service_templates": [
            {
                "name": "python3",
                "service_class": "mcp_server",
                "alias": "mcp-auto-promo",
                "health_path": "/mcp/health",
                "agent_facing": true,
                "match_ports": [mcp_port],
                "match_protocols": ["tcp"]
            }
        ]
    });

    let mcp_task = spawn_mcp_health_server(mcp_port, "/mcp/health").await;
    let stray_mcp_task = spawn_mcp_health_server(stray_mcp_port, "/mcp/health").await;
    let base_url = format!("http://127.0.0.1:{pm_port}");
    let server = spawn_port_manager(
        pm_port,
        &seed_path,
        &db_path,
        device_id,
        Some(profile_payload),
    );
    wait_for_health(&base_url).await;

    let client = reqwest::Client::new();
    wait_for_route_alias(&client, &base_url, "mcp-auto-promo").await;
    let routes = get_json(&client, &format!("{base_url}/routes")).await;
    let auto_promoted = routes
        .as_array()
        .expect("routes array")
        .iter()
        .find(|row| row.get("alias").and_then(Value::as_str) == Some("mcp-auto-promo"))
        .expect("auto promoted route");
    assert_eq!(
        auto_promoted.get("service_class").and_then(Value::as_str),
        Some("mcp_server")
    );
    assert_eq!(
        auto_promoted.get("agent_facing").and_then(Value::as_bool),
        Some(true)
    );
    assert!(routes
        .as_array()
        .expect("routes array")
        .iter()
        .all(|row| row.get("alias").and_then(Value::as_str)
            != Some("mcp-auto-promote-device-python3")));
    assert_eq!(routes.as_array().expect("routes array").len(), 1);

    server.abort();
    let _ = server.await;
    mcp_task.abort();
    let _ = mcp_task.await;
    stray_mcp_task.abort();
    let _ = stray_mcp_task.await;

    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(
        db_path
            .parent()
            .expect("db parent")
            .join("device-profiles")
            .join(format!("{device_id}.json")),
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn mcp_auto_promote_skips_unmatched_templates_when_templates_exist() {
    let mcp_port = free_tcp_port();
    let unmatched_port = free_tcp_port();
    let pm_port = free_tcp_port();
    let db_path = temp_path("mcp-auto-promote-skip-db", "sqlite3");
    let seed_path = temp_path("mcp-auto-promote-skip-seed", "json");
    write_empty_seed_file(&seed_path);

    let device_id = "auto-promote-skip-device";
    let profile_payload = serde_json::json!({
        "device_id": device_id,
        "health": {
            "mcp_health_path": "/mcp/health"
        },
        "transport": {
            "auto_promote_mcp": true
        },
        "service_templates": [
            {
                "name": "python3",
                "service_class": "mcp_server",
                "alias": "mcp-auto-skip",
                "health_path": "/mcp/health",
                "agent_facing": true,
                "match_ports": [unmatched_port],
                "match_protocols": ["tcp"]
            }
        ]
    });

    let mcp_task = spawn_mcp_health_server(mcp_port, "/mcp/health").await;
    let base_url = format!("http://127.0.0.1:{pm_port}");
    let server = spawn_port_manager(
        pm_port,
        &seed_path,
        &db_path,
        device_id,
        Some(profile_payload),
    );
    wait_for_health(&base_url).await;

    let client = reqwest::Client::new();
    assert_route_alias_absent(&client, &base_url, "mcp-auto-skip").await;
    let routes = get_json(&client, &format!("{base_url}/routes")).await;
    assert_eq!(routes.as_array().expect("routes array").len(), 0);

    server.abort();
    let _ = server.await;
    mcp_task.abort();
    let _ = mcp_task.await;

    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(
        db_path
            .parent()
            .expect("db parent")
            .join("device-profiles")
            .join(format!("{device_id}.json")),
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn discovery_can_classify_mcp_via_initialize_probe() {
    let mcp_port = free_tcp_port();
    let pm_port = free_tcp_port();
    let db_path = temp_path("mcp-deep-probe-db", "sqlite3");
    let seed_path = temp_path("mcp-deep-probe-seed", "json");
    write_empty_seed_file(&seed_path);

    let device_id = "mcp-deep-device";
    let profile_payload = serde_json::json!({
        "device_id": device_id,
        "health": {
            "mcp_probe_mode": "deep",
            "mcp_rpc_paths": ["/mcp"]
        },
        "guidance": {
            "translator_hints": ["use deep MCP probe before classifying"]
        },
        "service_templates": [
            {
                "name": "python3",
                "service_class": "mcp_server",
                "rpc_path": "/mcp",
                "match_process_names": ["python3"],
                "agent_facing": true
            }
        ]
    });

    let mcp_task = spawn_mcp_jsonrpc_server(mcp_port, "/mcp").await;
    let base_url = format!("http://127.0.0.1:{pm_port}");
    let server = spawn_port_manager(
        pm_port,
        &seed_path,
        &db_path,
        device_id,
        Some(profile_payload),
    );
    wait_for_health(&base_url).await;

    let client = reqwest::Client::new();
    let discovery = wait_for_discovery_match(&client, &base_url, |row| {
        row.get("port").and_then(Value::as_u64) == Some(mcp_port as u64)
            && row.get("service_class").and_then(Value::as_str) == Some("mcp_server")
    })
    .await
    .expect("mcp discovery match");

    assert_eq!(
        discovery
            .get("classification_source")
            .and_then(Value::as_str),
        Some("mcp_initialize_probe")
    );
    assert_eq!(
        discovery.get("agent_facing").and_then(Value::as_bool),
        Some(true)
    );

    server.abort();
    let _ = server.await;
    mcp_task.abort();
    let _ = mcp_task.await;

    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(
        db_path
            .parent()
            .expect("db parent")
            .join("device-profiles")
            .join(format!("{device_id}.json")),
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn invalid_device_profile_can_fail_startup_in_strict_mode() {
    let pm_port = free_tcp_port();
    let db_path = temp_path("device-profile-strict-db", "sqlite3");
    let seed_path = temp_path("device-profile-strict-seed", "json");
    write_empty_seed_file(&seed_path);

    let device_id = "strict-device";
    let data_root = db_path.parent().expect("db parent").to_path_buf();
    let runtime_context = RuntimeContext::detect();
    let device_profile_path = data_root
        .join("device-profiles")
        .join(format!("{device_id}.json"));
    std::fs::create_dir_all(device_profile_path.parent().expect("device profile parent"))
        .expect("create device profile dir");
    std::fs::write(
        &device_profile_path,
        serde_json::to_vec_pretty(&serde_json::json!({
            "device_id": device_id,
            "validation": {
                "on_error": "fail"
            },
            "service_templates": [
                {
                    "name": "python3",
                    "service_class": "mcp_server",
                    "alias": "dup"
                },
                {
                    "name": "python",
                    "service_class": "mcp_server",
                    "alias": "dup"
                }
            ]
        }))
        .expect("serialize strict profile"),
    )
    .expect("write strict profile");
    let device_profile = load_device_profile(&device_profile_path, &runtime_context, device_id)
        .expect("load strict profile");
    let config = MusuPortConfig {
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        preferred_port: pm_port,
        allow_port_fallback: false,
        seed_services_path: Some(seed_path.to_path_buf()),
        peer_urls: Vec::new(),
        device_id: device_id.to_string(),
        device_profile_path: device_profile_path.clone(),
        device_profile,
        data_root,
        state_db_path: db_path.to_path_buf(),
        runtime_context,
    };

    let err = run_server(config)
        .await
        .expect_err("strict startup must fail");
    assert!(err.contains("action=fail"));
    assert!(err.contains("validation error"));

    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(&device_profile_path);
}

fn spawn_port_manager(
    port: u16,
    seed_path: &Path,
    db_path: &Path,
    device_id: &str,
    profile_payload: Option<Value>,
) -> tokio::task::JoinHandle<()> {
    let data_root = db_path.parent().expect("db parent").to_path_buf();
    let runtime_context = RuntimeContext::detect();
    let device_profile_path = data_root
        .join("device-profiles")
        .join(format!("{device_id}.json"));
    if let Some(payload) = profile_payload {
        std::fs::create_dir_all(device_profile_path.parent().expect("device profile parent"))
            .expect("create device profile dir");
        std::fs::write(
            &device_profile_path,
            serde_json::to_vec_pretty(&payload).expect("serialize device profile"),
        )
        .expect("write device profile");
    }
    let device_profile = load_device_profile(&device_profile_path, &runtime_context, device_id)
        .expect("load device profile");
    let config = MusuPortConfig {
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        preferred_port: port,
        allow_port_fallback: false,
        seed_services_path: Some(seed_path.to_path_buf()),
        peer_urls: Vec::new(),
        device_id: device_id.to_string(),
        device_profile_path,
        device_profile,
        data_root,
        state_db_path: db_path.to_path_buf(),
        runtime_context,
    };
    tokio::spawn(async move {
        let _ = run_server(config).await;
    })
}

async fn spawn_http_echo_server(port: u16) -> tokio::task::JoinHandle<()> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .expect("bind http echo");
    tokio::spawn(async move {
        let app = Router::new().fallback(any(|uri: OriginalUri| async move { uri.0.to_string() }));
        let _ = axum::serve(listener, app).await;
    })
}

async fn spawn_mcp_health_server(
    port: u16,
    health_path: &'static str,
) -> tokio::task::JoinHandle<()> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .expect("bind mcp health");
    tokio::spawn(async move {
        let route_path = health_path.to_string();
        let app = Router::new().fallback(any(move |uri: OriginalUri| {
            let route_path = route_path.clone();
            async move {
                if uri.0.path() == route_path {
                    (
                        StatusCode::OK,
                        axum::Json(serde_json::json!({ "status": "ok", "service": "mcp" })),
                    )
                        .into_response()
                } else {
                    (StatusCode::NOT_FOUND, "not found").into_response()
                }
            }
        }));
        let _ = axum::serve(listener, app).await;
    })
}

async fn spawn_mcp_jsonrpc_server(
    port: u16,
    rpc_path: &'static str,
) -> tokio::task::JoinHandle<()> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .expect("bind mcp jsonrpc");
    tokio::spawn(async move {
        let route_path = rpc_path.to_string();
        let app = Router::new().fallback(any(
            move |uri: OriginalUri, axum::Json(body): axum::Json<Value>| {
                let route_path = route_path.clone();
                async move {
                    if uri.0.path() != route_path {
                        return (StatusCode::NOT_FOUND, "not found").into_response();
                    }
                    let method = body
                        .get("method")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let response = match method {
                        "initialize" => serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": body.get("id").cloned().unwrap_or(Value::Null),
                            "result": {
                                "protocolVersion": "2025-03-26",
                                "capabilities": {},
                                "serverInfo": {
                                    "name": "fake-mcp",
                                    "version": "0.1.0"
                                }
                            }
                        }),
                        "tools/list" => serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": body.get("id").cloned().unwrap_or(Value::Null),
                            "result": {
                                "tools": []
                            }
                        }),
                        _ => serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": body.get("id").cloned().unwrap_or(Value::Null),
                            "error": {
                                "code": -32601,
                                "message": "method not found"
                            }
                        }),
                    };
                    (StatusCode::OK, axum::Json(response)).into_response()
                }
            },
        ));
        let _ = axum::serve(listener, app).await;
    })
}

async fn spawn_tcp_echo_server(port: u16) -> tokio::task::JoinHandle<()> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .expect("bind tcp echo");
    tokio::spawn(async move {
        loop {
            let (mut socket, _) = listener.accept().await.expect("accept tcp");
            tokio::spawn(async move {
                let mut buf = [0u8; 1024];
                loop {
                    let n = match socket.read(&mut buf).await {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(_) => break,
                    };
                    if socket.write_all(&buf[..n]).await.is_err() {
                        break;
                    }
                }
            });
        }
    })
}

async fn wait_for_health(base_url: &str) {
    let client = reqwest::Client::new();
    for _ in 0..60 {
        if let Ok(response) = client.get(format!("{base_url}/health")).send().await {
            if response.status().is_success() {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("server did not become healthy: {base_url}");
}

async fn wait_for_discovered_signature(
    client: &reqwest::Client,
    base_url: &str,
    protocol: &str,
    port: u16,
) -> Option<String> {
    for _ in 0..80 {
        let payload = get_json(client, &format!("{base_url}/discovery")).await;
        if let Some(signature) = payload
            .as_array()
            .expect("discovery array")
            .iter()
            .find(|row| {
                row.get("protocol").and_then(Value::as_str) == Some(protocol)
                    && row.get("port").and_then(Value::as_u64) == Some(port as u64)
            })
            .and_then(|row| row.get("signature").and_then(Value::as_str))
        {
            return Some(signature.to_string());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    None
}

async fn wait_for_l4_runner(client: &reqwest::Client, base_url: &str, alias: &str) {
    for _ in 0..80 {
        let payload = get_json(client, &format!("{base_url}/l4/runners")).await;
        let found = payload
            .as_array()
            .expect("l4 runners array")
            .iter()
            .any(|row| {
                row.get("alias").and_then(Value::as_str) == Some(alias)
                    && row.get("running").and_then(Value::as_bool) == Some(true)
            });
        if found {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("l4 runner did not become ready: {alias}");
}

async fn wait_for_route_alias(client: &reqwest::Client, base_url: &str, alias: &str) {
    for _ in 0..80 {
        let payload = get_json(client, &format!("{base_url}/routes")).await;
        let found = payload
            .as_array()
            .expect("routes array")
            .iter()
            .any(|row| row.get("alias").and_then(Value::as_str) == Some(alias));
        if found {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("route alias did not appear: {alias}");
}

async fn assert_route_alias_absent(client: &reqwest::Client, base_url: &str, alias: &str) {
    for _ in 0..30 {
        let payload = get_json(client, &format!("{base_url}/routes")).await;
        let found = payload
            .as_array()
            .expect("routes array")
            .iter()
            .any(|row| row.get("alias").and_then(Value::as_str) == Some(alias));
        assert!(!found, "route alias unexpectedly appeared: {alias}");
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn assert_tcp_echo(port: u16, payload: &[u8]) {
    let mut socket = tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("connect tcp entrypoint");
    socket.write_all(payload).await.expect("write tcp payload");
    let mut out = vec![0u8; payload.len()];
    socket
        .read_exact(&mut out)
        .await
        .expect("read echoed payload");
    assert_eq!(out, payload);
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

async fn get_json_with_status(client: &reqwest::Client, url: &str) -> (reqwest::StatusCode, Value) {
    let response = client.get(url).send().await.expect("send get");
    let status = response.status();
    let payload = response.json::<Value>().await.expect("decode json");
    (status, payload)
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

async fn post_empty(client: &reqwest::Client, url: &str, body: Value) -> reqwest::Response {
    client
        .post(url)
        .json(&body)
        .send()
        .await
        .expect("send post")
}

fn parse_port_from_endpoint(raw: &str) -> u16 {
    raw.rsplit(':')
        .next()
        .and_then(|value| value.parse::<u16>().ok())
        .expect("parse port from endpoint")
}

fn write_seed_file(path: &Path, http_port: u16) {
    let payload = serde_json::json!([
        {
            "name": "demo-api",
            "alias": "demo-api",
            "enabled": true,
            "running": true,
            "port": http_port
        }
    ]);
    std::fs::write(
        path,
        serde_json::to_vec_pretty(&payload).expect("serialize seed"),
    )
    .expect("write seed");
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

fn free_udp_port() -> u16 {
    std::net::UdpSocket::bind(("127.0.0.1", 0))
        .expect("bind free udp")
        .local_addr()
        .expect("udp local addr")
        .port()
}

fn temp_path(prefix: &str, extension: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("{prefix}-{stamp}.{extension}"))
}

async fn wait_for_discovery_match<F>(
    client: &reqwest::Client,
    base_url: &str,
    mut predicate: F,
) -> Option<Value>
where
    F: FnMut(&Value) -> bool,
{
    for _ in 0..80 {
        let payload = get_json(client, &format!("{base_url}/discovery")).await;
        if let Some(row) = payload
            .as_array()
            .expect("discovery array")
            .iter()
            .find(|row| predicate(row))
        {
            return Some(row.clone());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    None
}
