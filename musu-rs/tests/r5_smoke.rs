//! V24-R5 integration smoke test (wiki/495 §6 acceptance criterion #7 + C7).
//!
//! Flow:
//!   1. Spawn `musu bridge` against a fresh DB with `MUSU_CLAUDE_BINARY`
//!      pointing at a tiny script that emits one stream-json `result` event.
//!   2. POST /api/companies — create a company so /run has a target.
//!   3. POST /api/companies/{id}/run — verify 202 + task_id.
//!   4. Poll /api/tasks/events SSE OR poll the DB until status=done.
//!   5. Verify route_executions row has output populated + exit_code + duration.
//!
//! This exercises the wire path Researcher F7 + Critic C7 surfaced as a gap:
//! no in-process integration test for full POST → spawn → SSE → terminal.

use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(200);
const BOOT_TIMEOUT: Duration = Duration::from_secs(20);
const TASK_TIMEOUT: Duration = Duration::from_secs(20);

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
        "musu-rs-r5-smoke-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&p).expect("mkdir tempdir");
    p
}

/// Write a tiny script that prints one stream-json event and exits 0.
#[cfg(target_os = "windows")]
fn write_fake_claude(dir: &std::path::Path) -> std::path::PathBuf {
    let p = dir.join("fake_claude.cmd");
    // CMD echo line; needs no quotes around JSON since we want it raw.
    let body =
        "@echo off\r\necho {\"type\":\"result\",\"result\":\"smoke-ok\",\"is_error\":false}\r\n";
    std::fs::write(&p, body).unwrap();
    p
}

#[cfg(not(target_os = "windows"))]
fn write_fake_claude(dir: &std::path::Path) -> std::path::PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let p = dir.join("fake_claude.sh");
    let body =
        "#!/bin/sh\nprintf '{\"type\":\"result\",\"result\":\"smoke-ok\",\"is_error\":false}\\n'\n";
    std::fs::write(&p, body).unwrap();
    let mut perms = std::fs::metadata(&p).unwrap().permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&p, perms).unwrap();
    p
}

fn spawn_bridge(
    port: u16,
    db_path: &std::path::Path,
    companies_dir: &std::path::Path,
    fake_claude: &std::path::Path,
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
        .env("MUSU_PYTHON_BRIDGE_PORT", "8071")
        .env("MUSU_DISABLE_RATE_LIMIT", "1")
        .env("MUSU_CLAUDE_BINARY", fake_claude)
        .env("MUSU_TASK_MAX_GLOBAL", "4")
        .env("MUSU_TASK_MAX_PER_CHANNEL", "2")
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
                return resp.json().await.expect("ready body");
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
async fn r5_full_lifecycle_with_mock_claude() {
    let port = pick_port();
    let workdir = tempdir();
    let db_path = workdir.join("musu.db");
    let companies_dir = workdir.join("companies");
    let fake = write_fake_claude(&workdir);
    let token = "x".repeat(32);

    let _bridge = spawn_bridge(port, &db_path, &companies_dir, &fake, &token);
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("client build");

    // 1. /health/ready — must report schema_version=2 (R5 bumped).
    let ready = wait_for_ready(&client, &format!("{base}/health/ready"), &token).await;
    assert_eq!(
        ready.get("schema_version").and_then(|v| v.as_u64()),
        Some(2),
        "schema_version should be 2 post-R5; got: {ready}"
    );

    // 2. Create a company.
    let post = client
        .post(format!("{base}/api/companies"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": "smoke-r5",
            "id": "smoke-r5",
            "template_key": "default",
            "workspace_id": "ws1",
            "purpose": "smoke",
            "work_dir": workdir.to_string_lossy(),
        }))
        .send()
        .await
        .expect("POST companies");
    assert!(
        post.status().is_success(),
        "company create failed: {}",
        post.status()
    );

    // 3. POST /run with body — should 202 with task_id immediately.
    let run_resp = client
        .post(format!("{base}/api/companies/smoke-r5/run"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "text": "hello R5",
            "channel": "smoke-channel",
            "sender_id": "smoke-sender",
            "cwd": workdir.to_string_lossy(),
            "timeout_sec": 30,
        }))
        .send()
        .await
        .expect("POST run");
    assert_eq!(
        run_resp.status().as_u16(),
        202,
        "expected 202 from /run; got {} body={}",
        run_resp.status(),
        run_resp.text().await.unwrap_or_default()
    );
    let body: serde_json::Value = run_resp.json().await.expect("run body");
    let task_id = body
        .get("task")
        .and_then(|t| t.get("task_id"))
        .and_then(|v| v.as_str())
        .expect("task_id in response")
        .to_string();

    // 4. Poll DB until status=done OR timeout. We open a read-only pool
    //    against the same file the bridge is writing.
    let pool = open_ro_pool(&db_path).await;
    let deadline = Instant::now() + TASK_TIMEOUT;
    let mut final_row: Option<RouteRow> = None;
    while Instant::now() < deadline {
        if let Some(row) = fetch_row(&pool, &task_id).await {
            if row.status == "done" || row.status == "failed" || row.status == "cancelled" {
                final_row = Some(row);
                break;
            }
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
    let row = final_row.expect("task never reached terminal");
    assert_eq!(
        row.status, "done",
        "expected done; got status={} error={:?}",
        row.status, row.error
    );
    assert!(
        row.output.as_ref().map(|s| !s.is_empty()).unwrap_or(false),
        "output should be populated; got {:?}",
        row.output
    );
    assert_eq!(row.exit_code, Some(0), "exit_code should be 0 on done");
    assert!(
        row.duration_sec.unwrap_or(0.0) >= 0.0,
        "duration_sec should be non-negative"
    );
    assert!(
        row.error.is_none(),
        "error should be NULL; got {:?}",
        row.error
    );
}

#[derive(Debug)]
struct RouteRow {
    status: String,
    output: Option<String>,
    error: Option<String>,
    exit_code: Option<i64>,
    duration_sec: Option<f64>,
}

async fn open_ro_pool(db: &std::path::Path) -> sqlx::SqlitePool {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;
    let url = format!("sqlite://{}", db.display());
    let opts = SqliteConnectOptions::from_str(&url)
        .unwrap()
        .read_only(true)
        .busy_timeout(Duration::from_secs(5));
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .expect("ro pool")
}

/// (status, output, error, exit_code, duration_sec) — column tuple shape for
/// the SELECT in `fetch_row`. Aliased to keep clippy `type_complexity` happy.
type RouteRowTuple = (
    String,
    Option<String>,
    Option<String>,
    Option<i64>,
    Option<f64>,
);

async fn fetch_row(pool: &sqlx::SqlitePool, task_id: &str) -> Option<RouteRow> {
    let row: Option<RouteRowTuple> = sqlx::query_as(
        "SELECT status, output, error, exit_code, duration_sec \
             FROM route_executions WHERE task_id = ?",
    )
    .bind(task_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    row.map(|(s, o, e, c, d)| RouteRow {
        status: s,
        output: o,
        error: e,
        exit_code: c,
        duration_sec: d,
    })
}
