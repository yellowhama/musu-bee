//! V24-R2 integration smoke test (wiki/492 §11 acceptance criterion 3).
//!
//! Flow:
//!   1. Spawn `musu bridge` against a fresh `MUSU_BRIDGE_DB_PATH`.
//!   2. Hit GET /health/ready — confirm `ready=true` (schema apply ran
//!      during boot per wiki/492 §3 boot-order invariant).
//!   3. POST /api/companies with template_key=default — confirm 200.
//!   4. Confirm a YAML file landed in MUSU_COMPANIES_DIR matching the id.
//!   5. GET /api/companies — confirm the created row is listed.
//!
//! This test boots the actual binary via cargo's `CARGO_BIN_EXE_musu`
//! env var (set automatically for `tests/*.rs` in binary crates).
//!
//! Uses async reqwest (already a non-blocking-only dep in R1 Cargo.toml;
//! adding `blocking` feature is forbidden per wiki/492 §2 zero-new-deps).

use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(200);
const BOOT_TIMEOUT: Duration = Duration::from_secs(20);

/// Hold-onto guard that kills the subprocess on drop. Avoids zombie bridges
/// when assertions panic mid-test.
struct BridgeProc {
    child: Child,
}

impl Drop for BridgeProc {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn pick_port() -> u16 {
    // Bind to 0 → OS assigns a port; drop the listener so bridge can
    // re-bind. Small race window between drop and rebind; acceptable for
    // a single-developer smoke test.
    let l = std::net::TcpListener::bind("127.0.0.1:0").expect("pick_port bind");
    l.local_addr().expect("pick_port local_addr").port()
}

fn tempdir() -> std::path::PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!(
        "musu-rs-r2-smoke-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&p).expect("mkdir tempdir");
    p
}

fn spawn_bridge(
    port: u16,
    db_path: &std::path::Path,
    companies_dir: &std::path::Path,
    token: &str,
) -> BridgeProc {
    let bin = env!("CARGO_BIN_EXE_musu");
    let child = Command::new(bin)
        .arg("bridge")
        .env("MUSU_ENV", "development") // skip token-length check
        .env("MUSU_BRIDGE_TOKEN", token)
        .env("BRIDGE_HOST", "127.0.0.1")
        .env("BRIDGE_PORT", port.to_string())
        .env("MUSU_BRIDGE_DB_PATH", db_path)
        .env("MUSU_COMPANIES_DIR", companies_dir)
        .env("MUSU_PYTHON_BRIDGE_PORT", "8071") // unused (no facade calls in smoke)
        .env("MUSU_DISABLE_RATE_LIMIT", "1")
        .env("RUST_LOG", "warn")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn musu bridge");
    BridgeProc { child }
}

async fn wait_for_ready(client: &reqwest::Client, url: &str, token: &str) -> serde_json::Value {
    let deadline = Instant::now() + BOOT_TIMEOUT;
    let mut last_err: Option<String> = None;
    while Instant::now() < deadline {
        match client.get(url).bearer_auth(token).send().await {
            Ok(resp) if resp.status().is_success() => {
                let body: serde_json::Value = resp.json().await.expect("ready body json");
                return body;
            }
            Ok(resp) => last_err = Some(format!("status {}", resp.status())),
            Err(e) => last_err = Some(e.to_string()),
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
    panic!(
        "bridge did not become ready within {:?}; last error: {:?}",
        BOOT_TIMEOUT, last_err
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn r2_smoke_fresh_db_apply_and_company_yaml_roundtrip() {
    let port = pick_port();
    let workdir = tempdir();
    let db_path = workdir.join("musu.db");
    let companies_dir = workdir.join("companies");
    let token = "x".repeat(32);

    let _bridge = spawn_bridge(port, &db_path, &companies_dir, &token);

    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        // Don't redirect — bridge is localhost-only.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("client build");

    // 1. /health/ready — schema apply ran during boot per wiki/492 §3.
    let ready_url = format!("{base}/health/ready");
    let ready: serde_json::Value = wait_for_ready(&client, &ready_url, &token).await;
    assert_eq!(
        ready.get("ready").and_then(|v| v.as_bool()),
        Some(true),
        "ready should be true post-apply; got: {ready}"
    );
    // R5 (wiki/495) bumped EXPECTED_SCHEMA_VERSION to 2. R2 smoke now asserts
    // ≥1 (still proves R2's v1 ran) since the R5 migration ladder always lifts
    // a fresh DB through both rungs.
    let v = ready
        .get("schema_version")
        .and_then(|v| v.as_u64())
        .expect("schema_version present");
    assert!(
        v >= 1,
        "schema_version should be >=1 (R2 v1 applied); got: {ready}"
    );

    // 2. POST /api/companies with template_key=default.
    let create_url = format!("{base}/api/companies");
    let post = client
        .post(&create_url)
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": "smoke-test-co",
            "id": "smoke-co",
            "template_key": "default",
            "workspace_id": "ws1",
            "purpose": "smoke",
            "work_dir": "/tmp/smoke",
            "meta": {"language": "rust"}
        }))
        .send()
        .await
        .expect("POST create");
    assert!(
        post.status().is_success(),
        "create failed: {} {}",
        post.status(),
        post.text().await.unwrap_or_default()
    );

    // 3. YAML file landed in companies_dir.
    let yaml_path = companies_dir.join("smoke-co.yaml");
    assert!(
        yaml_path.exists(),
        "expected {} after POST; companies dir entries: {:?}",
        yaml_path.display(),
        std::fs::read_dir(&companies_dir)
            .map(|d| d
                .filter_map(|e| e.ok().map(|e| e.path()))
                .collect::<Vec<_>>())
            .unwrap_or_default()
    );
    let yaml_text = std::fs::read_to_string(&yaml_path).expect("read yaml");
    assert!(
        yaml_text.contains("schema_version: 1"),
        "yaml missing schema_version=1: {yaml_text}"
    );
    assert!(
        yaml_text.contains("id: smoke-co"),
        "yaml missing id: {yaml_text}"
    );

    // 4. GET /api/companies — created row appears.
    let list_url = format!("{base}/api/companies");
    let list = client
        .get(&list_url)
        .bearer_auth(&token)
        .send()
        .await
        .expect("GET list");
    assert!(list.status().is_success(), "list status: {}", list.status());
    let rows: Vec<serde_json::Value> = list.json().await.expect("list body");
    let found = rows
        .iter()
        .any(|r| r.get("id").and_then(|v| v.as_str()) == Some("smoke-co"));
    assert!(found, "smoke-co not found in list: {rows:?}");

    // 5. Cleanup — workdir is in tempdir, harness-managed; bridge killed
    //    on _bridge drop.
}
