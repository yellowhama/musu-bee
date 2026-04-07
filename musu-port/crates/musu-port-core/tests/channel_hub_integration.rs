use std::net::{IpAddr, Ipv4Addr};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use musu_port_core::platform::{load_device_profile, RuntimeContext};
use musu_port_core::{run_server, MusuPortConfig};
use tokio_tungstenite::tungstenite::Message as WsMessage;

/// Two WebSocket clients both receive a message broadcast via POST /channel/{name}.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_clients_receive_channel_broadcast() {
    let pm_port = free_tcp_port();
    let db_path = temp_path("chanhub-db", "sqlite3");
    let seed_path = temp_path("chanhub-seed", "json");
    std::fs::write(&seed_path, b"[]").expect("write empty seed");

    let _server = spawn_port_manager(pm_port, &seed_path, &db_path, "chanhub-test-device");
    wait_for_health(pm_port).await;

    let ws_url = format!("ws://127.0.0.1:{pm_port}/channel/test-chan");

    // Connect two WS clients.
    let (mut ws1, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("ws client 1 connect");
    let (mut ws2, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("ws client 2 connect");

    // Give the server a moment to register both subscribers.
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Broadcast via HTTP POST.
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("http://127.0.0.1:{pm_port}/channel/test-chan"))
        .body("hello-broadcast")
        .send()
        .await
        .expect("post broadcast");
    assert!(resp.status().is_success(), "broadcast POST failed: {}", resp.status());

    // Both clients must receive the message within 2 seconds.
    let msg1 = tokio::time::timeout(Duration::from_secs(2), ws1.next())
        .await
        .expect("ws1 receive timeout")
        .expect("ws1 stream ended")
        .expect("ws1 message error");

    let msg2 = tokio::time::timeout(Duration::from_secs(2), ws2.next())
        .await
        .expect("ws2 receive timeout")
        .expect("ws2 stream ended")
        .expect("ws2 message error");

    assert_eq!(msg1, WsMessage::Text("hello-broadcast".into()), "ws1 wrong message");
    assert_eq!(msg2, WsMessage::Text("hello-broadcast".into()), "ws2 wrong message");

    // Cleanup.
    let _ = ws1.close(None).await;
    let _ = ws2.close(None).await;
    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
}

/// After all subscribers disconnect the channel is GC-ed (receiver_count == 0).
/// A subsequent broadcast returns 0.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn channel_gc_after_all_clients_disconnect() {
    let pm_port = free_tcp_port();
    let db_path = temp_path("chanhub-gc-db", "sqlite3");
    let seed_path = temp_path("chanhub-gc-seed", "json");
    std::fs::write(&seed_path, b"[]").expect("write empty seed");

    let _server = spawn_port_manager(pm_port, &seed_path, &db_path, "chanhub-gc-device");
    wait_for_health(pm_port).await;

    let ws_url = format!("ws://127.0.0.1:{pm_port}/channel/gc-chan");
    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("ws connect");

    tokio::time::sleep(Duration::from_millis(50)).await;

    // Disconnect the only subscriber.
    ws.close(None).await.expect("ws close");
    // Wait for GC to run on the server side.
    tokio::time::sleep(Duration::from_millis(200)).await;

    // POST should deliver to 0 receivers.
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("http://127.0.0.1:{pm_port}/channel/gc-chan"))
        .body("after-gc")
        .send()
        .await
        .expect("post broadcast");
    assert!(resp.status().is_success());
    let body = resp.text().await.expect("body");
    assert_eq!(body, "0", "expected 0 receivers after GC, got: {body}");

    let _ = std::fs::remove_file(&seed_path);
    let _ = std::fs::remove_file(&db_path);
}

// ── helpers ──────────────────────────────────────────────────────────────────

fn spawn_port_manager(
    port: u16,
    seed_path: &Path,
    db_path: &Path,
    device_id: &str,
) -> tokio::task::JoinHandle<()> {
    let data_root = db_path.parent().expect("db parent").to_path_buf();
    let runtime_context = RuntimeContext::detect();
    let device_profile_path = data_root
        .join("device-profiles")
        .join(format!("{device_id}.json"));
    let device_profile =
        load_device_profile(&device_profile_path, &runtime_context, device_id)
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
        peer_urls: vec![],
    };
    tokio::spawn(async move {
        let _ = run_server(config).await;
    })
}

async fn wait_for_health(port: u16) {
    let client = reqwest::Client::new();
    for _ in 0..60 {
        if let Ok(resp) = client
            .get(format!("http://127.0.0.1:{port}/health"))
            .send()
            .await
        {
            if resp.status().is_success() {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("server did not become healthy on port {port}");
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
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("{prefix}-{stamp}.{extension}"))
}
