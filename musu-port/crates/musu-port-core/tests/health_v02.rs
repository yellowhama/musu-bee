use std::net::{IpAddr, Ipv4Addr};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use musu_port_core::platform::{load_device_profile, RuntimeContext};
use musu_port_core::{run_server, MusuPortConfig};
use serde_json::Value;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn health_v02_reports_telemetry_fields() {
    let port = free_tcp_port();
    let db_path = temp_path("health-v02-db", "sqlite3");
    let seed_path = temp_path("health-v02-seed", "json");
    std::fs::write(&seed_path, "[]\n").expect("write empty seed file");

    let device_id = "health-v02-device";
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
        seed_services_path: Some(seed_path.clone()),
        peer_urls: Vec::new(),
        device_id: device_id.to_string(),
        device_profile_path: device_profile_path.clone(),
        device_profile,
        data_root,
        state_db_path: db_path.clone(),
        runtime_context,
    };

    let server = tokio::spawn(async move {
        let _ = run_server(config).await;
    });

    let base_url = format!("http://127.0.0.1:{port}");
    wait_for_health(&base_url).await;
    let client = reqwest::Client::new();
    let health = client
        .get(format!("{base_url}/health"))
        .send()
        .await
        .expect("health request")
        .error_for_status()
        .expect("health status")
        .json::<Value>()
        .await
        .expect("health json");

    assert!(health.get("cpu_pct").and_then(Value::as_f64).is_some());
    assert!(health.get("ram_used").and_then(Value::as_u64).is_some());
    assert!(health.get("ram_total").and_then(Value::as_u64).is_some());
    assert!(health.get("queue_depth").and_then(Value::as_u64).is_some());

    assert_null_or_number(health.get("gpu_util"));
    assert_null_or_u64(health.get("gpu_mem_used"));
    assert_null_or_u64(health.get("gpu_mem_total"));

    server.abort();
    let _ = server.await;

    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(&device_profile_path);
}

fn assert_null_or_number(value: Option<&Value>) {
    assert!(matches!(
        value,
        Some(v) if v.is_null() || v.as_f64().is_some()
    ));
}

fn assert_null_or_u64(value: Option<&Value>) {
    assert!(matches!(
        value,
        Some(v) if v.is_null() || v.as_u64().is_some()
    ));
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

fn free_tcp_port() -> u16 {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .expect("bind tcp")
        .local_addr()
        .expect("local addr")
        .port()
}

fn temp_path(prefix: &str, ext: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    std::env::temp_dir().join(format!("{prefix}-{unique}.{ext}"))
}
