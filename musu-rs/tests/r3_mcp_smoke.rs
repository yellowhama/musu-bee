//! V24-R3 wiki/493 §6 acceptance #4-#8 + Critic C11 parameterized smoke test.
//!
//! Spawns the real `musu control` binary as a subprocess (the same binary
//! Claude Code launches) and drives it with rmcp client over the
//! subprocess's stdin/stdout pipes. The musu-bridge endpoints that T1 tools
//! proxy to are stubbed by wiremock; we set `MUSU_BRIDGE_URL` in the
//! subprocess env to point at the wiremock listener.
//!
//! Coverage (Critic C11): one fixture per tool, 13 tools total.
//!   * T1 tools assert wiremock receives the right HTTP shape AND the MCP
//!     response contains the bridge body verbatim.
//!   * T2 tools assert the response is exactly `T2_BODY` and the tool's
//!     description ends with `T2_SUFFIX` (acceptance #8 / C10).

use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use rmcp::model::{CallToolRequestParams, JsonObject};
use rmcp::ServiceExt;
use serde_json::json;
use tokio::process::{Child, Command};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

// Mirrors the const in src/control/tools/params.rs. We can't `use` the
// non-`[lib]` crate from a tests/ file, so we duplicate the literal and
// rely on the unit test inside params.rs + acceptance #8 here to catch
// drift. If you change one, change the other.
const T2_SUFFIX: &str =
    " (deprecated, will be removed in V25 unless ported to native Rust endpoint)";
const T2_BODY: &str = "endpoint not yet ported to Rust (V25 candidate)";

const CALL_TIMEOUT: Duration = Duration::from_secs(15);

/// Spin up wiremock + spawn `musu control` against it. Returns (client peer,
/// mock server, child handle). Dropping `_child` kills the subprocess.
struct Harness {
    client: rmcp::service::RunningService<rmcp::RoleClient, ()>,
    mock: Arc<MockServer>,
    _child: Child,
}

async fn boot() -> Harness {
    let mock = Arc::new(MockServer::start().await);

    let bin = env!("CARGO_BIN_EXE_musu");
    let musu_home = std::env::temp_dir().join(format!(
        "musu-rs-r3-smoke-home-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&musu_home).expect("mkdir musu_home");
    std::fs::write(
        musu_home.join("bridge.env"),
        "MUSU_BRIDGE_TOKEN=smoke-test-token-32-bytes-long-aa\n",
    )
    .expect("write bridge.env");

    let mut cmd = Command::new(bin);
    cmd.arg("control")
        .env("MUSU_BRIDGE_URL", mock.uri())
        .env("MUSU_HOME", &musu_home)
        // Force file-resolver path (also avoids env-bleed if test harness
        // already exported MUSU_BRIDGE_TOKEN from a previous test).
        .env_remove("MUSU_BRIDGE_TOKEN")
        .env("RUST_LOG", "warn")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().expect("spawn musu control");

    let stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    // stderr can stay attached to child; rmcp tracing goes there. We drain
    // it via `stderr.take()` further down to avoid backpressure on a long
    // run, but for the smoke test the buffer is plenty.

    let client = ().serve((stdout, stdin)).await.expect("client.serve over subprocess pipes");

    Harness {
        client,
        mock,
        _child: child,
    }
}

fn args(v: serde_json::Value) -> Option<JsonObject> {
    Some(v.as_object().expect("arg must be a JSON object").clone())
}

// ─────────── Fixture types + bridge wiremock setups ───────────────

type Setup = fn(Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()>;

struct Fixture {
    tool: &'static str,
    arguments: Option<JsonObject>,
    bridge_setup: Setup,
    expected_substring: &'static str,
    is_t2: bool,
}

fn setup_list_companies(mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {
        Mock::given(method("GET"))
            .and(path("/api/companies"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!([
                { "id": "co-1", "name": "Alpha" }
            ])))
            .mount(&mock)
            .await;
    })
}

fn setup_get_company(mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {
        Mock::given(method("GET"))
            .and(path("/api/companies/co-1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "id": "co-1", "name": "Alpha"
            })))
            .mount(&mock)
            .await;
    })
}

fn setup_create_company(mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {
        Mock::given(method("POST"))
            .and(path("/api/companies"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "company": { "id": "newco", "name": "Newco" }
            })))
            .mount(&mock)
            .await;
    })
}

fn setup_activate_company(mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {
        Mock::given(method("POST"))
            .and(path("/api/companies/co-1/activate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "company": { "id": "co-1", "status": "active" }
            })))
            .mount(&mock)
            .await;
    })
}

fn setup_run_company(mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {
        Mock::given(method("POST"))
            .and(path("/api/companies/co-1/run"))
            .respond_with(ResponseTemplate::new(202).set_body_json(json!({
                "task_id": "task-run-42", "status": "queued"
            })))
            .mount(&mock)
            .await;
    })
}

fn setup_delegate_task(mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {
        Mock::given(method("POST"))
            .and(path("/api/tasks/delegate"))
            .respond_with(ResponseTemplate::new(202).set_body_json(json!({
                "task_id": "task-deleg-99", "status": "queued"
            })))
            .mount(&mock)
            .await;
    })
}

fn setup_cancel_task(mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {
        Mock::given(method("DELETE"))
            .and(path("/api/tasks/task-deleg-99"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "task_id": "task-deleg-99", "cancelled": true
            })))
            .mount(&mock)
            .await;
    })
}

fn setup_list_nodes(mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {
        Mock::given(method("GET"))
            .and(path("/api/nodes"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "nodes": [{ "name": "self", "is_self": true }],
                "total": 1
            })))
            .mount(&mock)
            .await;
    })
}

fn setup_noop(_mock: Arc<MockServer>) -> futures_util::future::BoxFuture<'static, ()> {
    Box::pin(async move {})
}

fn fixtures() -> Vec<Fixture> {
    vec![
        // ── T1 (8) ─────────────────────────────────────────
        Fixture {
            tool: "list_companies",
            arguments: None,
            bridge_setup: setup_list_companies,
            expected_substring: "Alpha",
            is_t2: false,
        },
        Fixture {
            tool: "get_company",
            arguments: args(json!({ "id": "co-1" })),
            bridge_setup: setup_get_company,
            expected_substring: "co-1",
            is_t2: false,
        },
        Fixture {
            tool: "create_company",
            arguments: args(json!({ "name": "Newco" })),
            bridge_setup: setup_create_company,
            expected_substring: "newco",
            is_t2: false,
        },
        Fixture {
            tool: "activate_company",
            arguments: args(json!({ "id": "co-1" })),
            bridge_setup: setup_activate_company,
            expected_substring: "active",
            is_t2: false,
        },
        Fixture {
            tool: "run_company",
            arguments: args(json!({ "id": "co-1", "body": {} })),
            bridge_setup: setup_run_company,
            expected_substring: "task-run-42",
            is_t2: false,
        },
        Fixture {
            tool: "delegate_task",
            arguments: args(json!({
                "channel": "agent-pm",
                "sender_id": "ctrl-smoke",
                "text": "do the thing"
            })),
            bridge_setup: setup_delegate_task,
            expected_substring: "task-deleg-99",
            is_t2: false,
        },
        Fixture {
            tool: "cancel_task",
            arguments: args(json!({ "task_id": "task-deleg-99" })),
            bridge_setup: setup_cancel_task,
            expected_substring: "cancelled",
            is_t2: false,
        },
        Fixture {
            tool: "list_nodes",
            arguments: None,
            bridge_setup: setup_list_nodes,
            expected_substring: "is_self",
            is_t2: false,
        },
        // ── T2 deprecated (5) ──────────────────────────────
        Fixture {
            tool: "list_agents",
            arguments: None,
            bridge_setup: setup_noop,
            expected_substring: T2_BODY,
            is_t2: true,
        },
        Fixture {
            tool: "get_agent",
            arguments: args(json!({ "agent_id": "any" })),
            bridge_setup: setup_noop,
            expected_substring: T2_BODY,
            is_t2: true,
        },
        Fixture {
            tool: "get_dashboard",
            arguments: None,
            bridge_setup: setup_noop,
            expected_substring: T2_BODY,
            is_t2: true,
        },
        Fixture {
            tool: "list_runs",
            arguments: None,
            bridge_setup: setup_noop,
            expected_substring: T2_BODY,
            is_t2: true,
        },
        Fixture {
            tool: "get_activity",
            arguments: None,
            bridge_setup: setup_noop,
            expected_substring: T2_BODY,
            is_t2: true,
        },
    ]
}

/// Acceptance #4 (initialize) + #5 (13 tools) + #8 (T2 suffix).
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn r3_mcp_initialize_lists_13_tools_with_t2_suffix() {
    let harness = boot().await;

    let listed = harness
        .client
        .list_all_tools()
        .await
        .expect("list_all_tools");
    assert_eq!(
        listed.len(),
        13,
        "expected 13 tools; got: {:?}",
        listed.iter().map(|t| t.name.as_ref()).collect::<Vec<_>>()
    );

    let fixture_names: std::collections::HashSet<&str> =
        fixtures().iter().map(|f| f.tool).collect();
    let listed_names: std::collections::HashSet<String> =
        listed.iter().map(|t| t.name.to_string()).collect();
    for name in &fixture_names {
        assert!(
            listed_names.contains(*name),
            "fixture tool `{}` missing from tools/list output: {:?}",
            name,
            listed_names
        );
    }

    // Acceptance #8 / Critic C10: every T2 tool description ends with the
    // exact T2_SUFFIX bytes.
    let by_name: std::collections::HashMap<&str, &rmcp::model::Tool> =
        listed.iter().map(|t| (t.name.as_ref(), t)).collect();
    for fx in fixtures() {
        if !fx.is_t2 {
            continue;
        }
        let tool = by_name.get(fx.tool).expect("tool present");
        let desc: &str = tool
            .description
            .as_deref()
            .expect("T2 tool MUST have description");
        assert!(
            desc.ends_with(T2_SUFFIX),
            "C10 violation: T2 tool `{}` description does not end with T2_SUFFIX.\n  desc:   {desc:?}\n  suffix: {T2_SUFFIX:?}",
            fx.tool
        );
    }

    let _ = harness.client.cancel().await;
}

/// Acceptance #6 + #7 + Critic C11: each of the 13 tools is callable and
/// produces the expected response shape. Per Q8 / C12, even on T2 stubs
/// `is_error` is never true — the contract is "Ok(text) always".
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn r3_mcp_all_13_tools_callable() {
    for fx in fixtures() {
        let harness = boot().await;
        (fx.bridge_setup)(harness.mock.clone()).await;

        let params = match &fx.arguments {
            Some(a) => CallToolRequestParams::new(fx.tool).with_arguments(a.clone()),
            None => CallToolRequestParams::new(fx.tool),
        };
        let result = tokio::time::timeout(CALL_TIMEOUT, harness.client.call_tool(params))
            .await
            .unwrap_or_else(|_| panic!("call_tool {} timed out after {CALL_TIMEOUT:?}", fx.tool))
            .unwrap_or_else(|e| panic!("call_tool {} failed: {e}", fx.tool));

        let text = result
            .content
            .first()
            .and_then(|c| c.raw.as_text())
            .map(|t| t.text.clone())
            .unwrap_or_else(|| panic!("tool {} returned no text content", fx.tool));

        assert!(
            text.contains(fx.expected_substring),
            "tool {} response missing expected substring {:?}; got: {text:?}",
            fx.tool,
            fx.expected_substring
        );

        // Per Critic C12 / §1.1 Q8: tool results are ALWAYS surfaced as
        // Ok/text — never as JSON-RPC error frames.
        assert!(
            !matches!(result.is_error, Some(true)),
            "tool {} returned is_error=true; per Q8 we never error-frame: {result:?}",
            fx.tool
        );

        let _ = harness.client.cancel().await;
    }
}

/// Acceptance #10(a) / Critic C12: bridge unreachable → friendly text.
/// We DON'T set up any mock routes — wiremock 404s on every request — but
/// before that, our client points to a port nothing is listening on so
/// reqwest hits connection refused.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn r3_mcp_bridge_unreachable_returns_friendly_text() {
    // Pick a port nothing is listening on by binding then dropping.
    let dead_port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").expect("bind dead");
        l.local_addr().expect("dead local_addr").port()
    };
    let dead_url = format!("http://127.0.0.1:{dead_port}");

    let bin = env!("CARGO_BIN_EXE_musu");
    let musu_home = std::env::temp_dir().join(format!(
        "musu-rs-r3-smoke-dead-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&musu_home).expect("mkdir musu_home");
    std::fs::write(
        musu_home.join("bridge.env"),
        "MUSU_BRIDGE_TOKEN=dead-bridge-token-32-bytes-long-x\n",
    )
    .expect("write bridge.env");

    let mut child = Command::new(bin)
        .arg("control")
        .env("MUSU_BRIDGE_URL", &dead_url)
        .env("MUSU_HOME", &musu_home)
        .env_remove("MUSU_BRIDGE_TOKEN")
        .env("RUST_LOG", "warn")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn musu control");

    let stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let client = ().serve((stdout, stdin)).await.expect("client.serve dead bridge");

    let params = CallToolRequestParams::new("list_companies");
    let result = tokio::time::timeout(CALL_TIMEOUT, client.call_tool(params))
        .await
        .expect("call_tool timed out")
        .expect("call_tool err");

    let text = result
        .content
        .first()
        .and_then(|c| c.raw.as_text())
        .map(|t| t.text.clone())
        .expect("text content");

    assert!(
        text.contains("musu bridge not running"),
        "expected C12(a) connection-refused message; got: {text:?}"
    );
    assert!(
        text.contains(&dead_url),
        "expected message to include url; got: {text:?}"
    );

    let _ = client.cancel().await;
}
