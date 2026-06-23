//! V24-R3 wiki/493 §3 R1 patch + Critic C3 / C9 integration test.
//!
//! Acceptance #13:
//!   * 200 + body shape on GET /api/companies/:id with a known id
//!   * 404 on GET /api/companies/:id for an absent id (NOT 500)
//!   * C3 invariant: audit_log row count UNCHANGED by 100 successful GETs
//!
//! Implementation mirrors `r2_smoke.rs` — spawn a real `musu bridge` against
//! a tempdir DB, hit endpoints with reqwest.

use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(200);
const BOOT_TIMEOUT: Duration = Duration::from_secs(20);

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
    let l = std::net::TcpListener::bind("127.0.0.1:0").expect("pick_port bind");
    l.local_addr().expect("pick_port local_addr").port()
}

fn tempdir() -> std::path::PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!(
        "musu-rs-r3-companies-get-{}",
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
        .env("MUSU_ENV", "development")
        .env("MUSU_BRIDGE_TOKEN", token)
        .env("BRIDGE_HOST", "127.0.0.1")
        .env("BRIDGE_PORT", port.to_string())
        .env("MUSU_BRIDGE_DB_PATH", db_path)
        .env("MUSU_COMPANIES_DIR", companies_dir)
        .env("MUSU_DISABLE_RATE_LIMIT", "1")
        .env("RUST_LOG", "warn")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn musu bridge");
    BridgeProc { child }
}

async fn wait_for_ready(client: &reqwest::Client, url: &str, token: &str) {
    let deadline = Instant::now() + BOOT_TIMEOUT;
    while Instant::now() < deadline {
        if let Ok(resp) = client.get(url).bearer_auth(token).send().await {
            if resp.status().is_success() {
                return;
            }
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
    panic!("bridge did not become ready within {BOOT_TIMEOUT:?}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn r3_companies_get_200_and_404() {
    let port = pick_port();
    let workdir = tempdir();
    let db_path = workdir.join("musu.db");
    let companies_dir = workdir.join("companies");
    let token = "y".repeat(32);

    let _bridge = spawn_bridge(port, &db_path, &companies_dir, &token);
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("client build");

    wait_for_ready(&client, &format!("{base}/health/ready"), &token).await;

    // 1. Seed: POST /api/companies with a known id.
    let create_url = format!("{base}/api/companies");
    let post = client
        .post(&create_url)
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": "r3-get-test",
            "id": "r3-get-id",
            "template_key": "default",
            "workspace_id": "ws1",
            "purpose": "r3 GET test",
            "work_dir": "/tmp/r3get",
            "meta": {}
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

    // 2. GET /api/companies/r3-get-id — 200 + matching body shape.
    let get_url = format!("{base}/api/companies/r3-get-id");
    let resp = client
        .get(&get_url)
        .bearer_auth(&token)
        .send()
        .await
        .expect("GET by id");
    assert_eq!(
        resp.status(),
        reqwest::StatusCode::OK,
        "expected 200 OK for known id"
    );
    let body: serde_json::Value = resp.json().await.expect("body json");
    assert_eq!(body["id"].as_str(), Some("r3-get-id"));
    assert_eq!(body["name"].as_str(), Some("r3-get-test"));
    assert_eq!(body["purpose"].as_str(), Some("r3 GET test"));
    // meta is an object (R1 row_to_company default).
    assert!(body["meta"].is_object(), "meta should be object: {body}");

    // 3. GET /api/companies/does-not-exist — 404 (C9: fetch_optional →
    //    NotFound), NOT 500 (which would mean fetch_one returned RowNotFound).
    let miss_url = format!(
        "{base}/api/companies/does-not-exist-{}",
        uuid::Uuid::new_v4()
    );
    let miss = client
        .get(&miss_url)
        .bearer_auth(&token)
        .send()
        .await
        .expect("GET miss");
    assert_eq!(
        miss.status(),
        reqwest::StatusCode::NOT_FOUND,
        "expected 404 NOT_FOUND for absent id, got {}",
        miss.status()
    );
    let miss_body: serde_json::Value = miss.json().await.expect("404 body json");
    // C9: error code should be "not_found", proving the MusuError::NotFound
    // path was taken (not the generic Internal/db path).
    assert_eq!(
        miss_body["code"].as_str(),
        Some("not_found"),
        "expected code=not_found, got: {miss_body}"
    );
}

/// C3 invariant: GET requests MUST NOT write to audit_log. We assert this by
/// counting `audit_log` rows directly in the DB before/after 100 successful
/// GET calls. The count must be IDENTICAL.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn r3_companies_get_does_not_audit() {
    let port = pick_port();
    let workdir = tempdir();
    let db_path = workdir.join("musu.db");
    let companies_dir = workdir.join("companies");
    let token = "z".repeat(32);

    let _bridge = spawn_bridge(port, &db_path, &companies_dir, &token);
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("client build");

    wait_for_ready(&client, &format!("{base}/health/ready"), &token).await;

    // Seed one company so the GETs return 200 (404s are also non-mutating but
    // we want to prove the 200 success path doesn't audit).
    let create_url = format!("{base}/api/companies");
    client
        .post(&create_url)
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": "audit-baseline",
            "id": "audit-baseline-id",
            "template_key": "default",
            "workspace_id": "ws1",
            "purpose": "",
            "work_dir": "",
            "meta": {}
        }))
        .send()
        .await
        .expect("POST seed")
        .error_for_status()
        .expect("POST seed status");

    // Audit writes are async (write_then_optional_flush in audit.rs); allow a
    // beat for the create-time audit row to land BEFORE we snapshot.
    tokio::time::sleep(Duration::from_millis(500)).await;

    let baseline_count = audit_row_count(&db_path).await;

    // 100 successful GETs to /api/companies/audit-baseline-id.
    let get_url = format!("{base}/api/companies/audit-baseline-id");
    for _ in 0..100 {
        let resp = client
            .get(&get_url)
            .bearer_auth(&token)
            .send()
            .await
            .expect("GET");
        assert_eq!(resp.status(), reqwest::StatusCode::OK);
    }

    // Allow any incidental async flush to complete (none expected — we're
    // proving its absence).
    tokio::time::sleep(Duration::from_millis(500)).await;

    let after_count = audit_row_count(&db_path).await;
    assert_eq!(
        baseline_count,
        after_count,
        "C3 violation: 100 GETs added {} audit rows (was {}, now {})",
        after_count - baseline_count,
        baseline_count,
        after_count
    );
}

/// Read audit_log COUNT(*) directly via sqlx. We bypass the bridge to avoid
/// any chance of the call itself perturbing the audit table.
async fn audit_row_count(db_path: &std::path::Path) -> i64 {
    use sqlx::Row;
    let url = format!(
        "sqlite://{}",
        db_path.display().to_string().replace('\\', "/")
    );
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .expect("open audit db");
    let row = sqlx::query("SELECT COUNT(*) as c FROM audit_log")
        .fetch_one(&pool)
        .await
        .expect("count audit_log");
    row.try_get::<i64, _>("c").expect("read count")
}
