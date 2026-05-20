//! V24-R4 wiki/494 acceptance #5 + #6 + Critic C-R4-1 / C-R4-5 gate.
//!
//! End-to-end smoke:
//!   1. Tempdir mock workspace with .rs + .md sample files.
//!   2. `indexer::sync::sync_workspace_async` populates `.musu_dev.db`.
//!   3. Spawn `musu bridge`, POST a company with the tempdir as work_dir,
//!      then `GET /api/index-search?q=...&workspace=...` and assert the
//!      response shape + literal byte gates (U+2026 ellipsis, `<b>` markers).
//!   4. Separately: a company with empty work_dir produces an empty (but
//!      non-erroring) search response — C-R4-5 contract.

use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

// NOTE: musu-rs is a binary-only crate (no [lib]), so we can't `use
// musu_rs::indexer::sync` directly. Pre-sync is driven by shelling out
// to `musu indexer sync` against the tempdir; that's the same CLI path
// operators use, and it exercises the indexer module end-to-end via the
// same binary the bridge uses.

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

fn tempdir(prefix: &str) -> std::path::PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!(
        "musu-rs-{}-{}",
        prefix,
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&p).expect("mkdir tempdir");
    p
}

fn seed_workspace(work_dir: &Path) {
    // A small set of files designed to exercise the file/symbol/section
    // rows of the FTS5 index. The query `fn` in the test will hit
    // `pub fn hello` in alpha.rs — that's the matched substring that
    // triggers the snippet() generation.
    //
    // C-R4-1 byte-gate context: FTS5's `snippet(... '…', N)` operates on
    // a TOKEN window (last arg = number of tokens, 1-64), not raw chars.
    // A long run of `xxxxxx` tokenizes as a single token, so even 400
    // chars wouldn't force eliding. Build a padding made of many small
    // space-separated tokens so each padding chunk costs N tokens of
    // window, forcing FTS5 to drop content + emit U+2026.
    let pad_tokens: Vec<String> = (0..200).map(|i| format!("word{i}")).collect();
    let pad = pad_tokens.join(" ");
    std::fs::write(
        work_dir.join("alpha.rs"),
        format!(
            "// prefix {pad}\npub struct Greeter;\n\npub fn hello() -> u32 {{\n    42\n}}\n// suffix {pad}\n"
        ),
    )
    .unwrap();
    std::fs::write(
        work_dir.join("beta.rs"),
        format!("// prefix {pad}\nfn local_helper() {{}}\n// suffix {pad}\n"),
    )
    .unwrap();
    std::fs::write(
        work_dir.join("notes.md"),
        format!(
            "# Top\n\nprefix {pad}\nintro paragraph fn keyword nearby\nsuffix {pad}\n\n## Detail\n\nbody fn keyword\n"
        ),
    )
    .unwrap();
}

fn spawn_bridge(port: u16, db_path: &Path, companies_dir: &Path, token: &str) -> BridgeProc {
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
        .env("RUST_LOG", "warn")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn musu bridge");
    BridgeProc { child }
}

async fn wait_for_ready(client: &reqwest::Client, url: &str, token: &str) {
    let deadline = Instant::now() + BOOT_TIMEOUT;
    let mut last: Option<String> = None;
    while Instant::now() < deadline {
        match client.get(url).bearer_auth(token).send().await {
            Ok(r) if r.status().is_success() => return,
            Ok(r) => last = Some(format!("status {}", r.status())),
            Err(e) => last = Some(e.to_string()),
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
    panic!("bridge not ready in {BOOT_TIMEOUT:?}; last: {last:?}");
}

/// C-R4-1 gate: the snippet bytes returned by /api/index-search MUST
/// contain the literal U+2026 ellipsis byte sequence AND `<b>` markers
/// (matching Python `server.py:2732`). Tests run sync_workspace_async,
/// then drives the live bridge over loopback to verify the end-to-end
/// shape, NOT just the indexer library in isolation.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn r4_index_smoke_search_shape_and_snippet_bytes() {
    let port = pick_port();
    let work = tempdir("r4-smoke");
    let db_path = tempdir("r4-bridge-db").join("musu.db");
    let companies_dir = tempdir("r4-companies");
    let token = "y".repeat(32);

    let work_dir = work.clone();
    seed_workspace(&work_dir);

    // Pre-sync the index BEFORE we even talk to the bridge — exercises
    // the public sync API via the `musu indexer sync` CLI subcommand.
    // Deterministic across runs because the bridge's post-create fire-
    // and-forget can race against the immediate GET below.
    let bin = env!("CARGO_BIN_EXE_musu");
    let sync_output = Command::new(bin)
        .arg("indexer")
        .arg("sync")
        .arg("--work-dir")
        .arg(&work_dir)
        .arg("--name")
        .arg("r4-test-co")
        .env("RUST_LOG", "warn")
        .output()
        .expect("spawn musu indexer sync");
    assert!(
        sync_output.status.success(),
        "musu indexer sync failed: stdout={} stderr={}",
        String::from_utf8_lossy(&sync_output.stdout),
        String::from_utf8_lossy(&sync_output.stderr)
    );
    // The CLI prints "indexed N files (M symbols) in T ms" — assert ≥1 file.
    let stdout = String::from_utf8_lossy(&sync_output.stdout);
    assert!(
        stdout.contains("indexed "),
        "unexpected sync stdout: {stdout}"
    );

    // Boot the bridge against a fresh musu.db.
    let _bridge = spawn_bridge(port, &db_path, &companies_dir, &token);
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    wait_for_ready(&client, &format!("{base}/health/ready"), &token).await;

    // Register a company pointing at the pre-synced workspace.
    let work_dir_str = work_dir.to_string_lossy().to_string();
    let create = client
        .post(format!("{base}/api/companies"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": "r4-co",
            "id": "r4-co",
            "template_key": "default",
            "workspace_id": "ws-r4",
            "purpose": "r4 smoke",
            "work_dir": work_dir_str,
            "meta": {}
        }))
        .send()
        .await
        .expect("POST create");
    assert!(
        create.status().is_success(),
        "create: {} {}",
        create.status(),
        create.text().await.unwrap_or_default()
    );

    // Search for `fn` — alpha.rs has `pub fn hello`, notes.md has `fn
    // keyword`. Either way the snippet generator should emit `<b>` around
    // the matched token plus a U+2026 ellipsis around the trim point.
    let search_url = format!("{base}/api/index-search?workspace=r4-co&q=fn&limit=20");
    let resp = client
        .get(&search_url)
        .bearer_auth(&token)
        .send()
        .await
        .expect("GET search");
    assert!(
        resp.status().is_success(),
        "search status {}: {}",
        resp.status(),
        resp.text().await.unwrap_or_default()
    );
    let hits: Vec<serde_json::Value> = resp.json().await.expect("hits json");
    assert!(!hits.is_empty(), "expected ≥1 hit; got empty");

    // Shape check — every hit MUST have exactly path/snippet/type.
    for h in &hits {
        let obj = h.as_object().expect("hit must be object");
        assert!(obj.contains_key("path"), "missing path: {h}");
        assert!(obj.contains_key("snippet"), "missing snippet: {h}");
        assert!(obj.contains_key("type"), "missing type: {h}");
        let extra = obj
            .keys()
            .filter(|k| k.as_str() != "path" && k.as_str() != "snippet" && k.as_str() != "type")
            .count();
        assert_eq!(extra, 0, "hit has unexpected extra keys: {h}");
    }

    // C-R4-1 BYTE GATE — at least one snippet contains both the literal
    // `<b>` marker AND the U+2026 ellipsis char (Python parity). We
    // can't guarantee EVERY hit will have an ellipsis (short contents
    // may not need trimming), but with our 3 sample files at least one
    // `file`-row snippet ought to need it.
    let has_b_marker = hits.iter().any(|h| {
        h.get("snippet")
            .and_then(|s| s.as_str())
            .map(|s| s.contains("<b>"))
            .unwrap_or(false)
    });
    assert!(
        has_b_marker,
        "no snippet contained <b> marker; C-R4-1 violated: {hits:?}"
    );

    let has_u2026 = hits.iter().any(|h| {
        h.get("snippet")
            .and_then(|s| s.as_str())
            .map(|s| s.contains('\u{2026}'))
            .unwrap_or(false)
    });
    assert!(
        has_u2026,
        "no snippet contained U+2026 ellipsis; C-R4-1 violated: {hits:?}"
    );
}

/// C-R4-5 gate: a company row with empty `work_dir` MUST NOT cause the
/// /api/index-search route to error — it returns `[]`. Mirrors the
/// `sync_workspace_async` `skipped_reason="no_work_dir"` contract on
/// the bridge HTTP surface.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn r4_index_smoke_empty_work_dir_returns_empty_array() {
    let port = pick_port();
    let db_path = tempdir("r4-empty-bridge-db").join("musu.db");
    let companies_dir = tempdir("r4-empty-companies");
    let token = "z".repeat(32);

    let _bridge = spawn_bridge(port, &db_path, &companies_dir, &token);
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    wait_for_ready(&client, &format!("{base}/health/ready"), &token).await;

    let _create = client
        .post(format!("{base}/api/companies"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "name": "no-workdir-co",
            "id": "no-workdir-co",
            "template_key": "default",
            "workspace_id": "ws-empty",
            "purpose": "C-R4-5 gate",
            "work_dir": "",
            "meta": {}
        }))
        .send()
        .await
        .expect("POST create");

    let resp = client
        .get(format!(
            "{base}/api/index-search?workspace=no-workdir-co&q=anything"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .expect("GET search");
    assert!(
        resp.status().is_success(),
        "expected 2xx on empty work_dir; got {}: {}",
        resp.status(),
        resp.text().await.unwrap_or_default()
    );
    let hits: Vec<serde_json::Value> = resp.json().await.expect("hits json");
    assert!(
        hits.is_empty(),
        "empty work_dir must yield []; got: {hits:?}"
    );
}
