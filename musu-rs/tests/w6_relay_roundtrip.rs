//! W-6 — hermetic 2-bridge relay round-trip integration test
//! (docs/W6_RELAY_INTEGRATION_TEST_PLAN_2026_06_21.md).
//!
//! Proves W-1 (reverse relay callback) + W-2 (sender state reconciliation)
//! actually work end-to-end with NO direct peer path: forward task → relay KV
//! → drain → execute → reverse callback → drain → finalize. This is the
//! preview relay fallback works without a direct peer path as an executable
//! regression guard. This is not release-grade relay transport proof; the
//! preview queue stays `http_store_forward_preview`, non-release-grade, and
//! non-default data path.
//!
//! ## Architecture (plan §A, user-approved)
//!
//!   * Two REAL `musu bridge` child processes — `sender-node` + `receiver-node`
//!     — booted via `CARGO_BIN_EXE_musu` exactly like `tests/r2_smoke.rs`.
//!   * A `wiremock` MockServer (dev-dep, Cargo.toml:159) standing in for
//!     `musu.pro`. Both children point at it via `MUSU_CLOUD_BASE_URL`.
//!   * The mock is a STATEFUL relay KV (`Arc<Mutex<MockCloudState>>`): it
//!     stores submitted payloads, hands them out on claim (PATCH w/ claimant),
//!     and acknowledges delivery (PATCH w/ payload_id) with a delivery proof.
//!
//! ## Why we drive `/api/relay/payloads/drain` directly instead of the poller
//!
//! `relay_payload.rs::normalize_relay_payload_poller_interval_sec` HARD-FLOORS
//! the poller interval at `RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC = 30`s
//! (relay_payload.rs:29,167). A ~25s test budget would NEVER observe a single
//! background poll. The drain ROUTE (`POST /api/relay/payloads/drain`,
//! handlers/mod.rs:82) runs the identical `drain_relay_payloads_for_local_target`
//! logic synchronously, so we drive it directly for deterministic, fast draining
//! while still exercising the real production drain code path. The poller is
//! left enabled but is not relied on for timing.
//!
//! ## Forcing direct-FAIL + relay-SUCCESS
//!
//!   * sender registers `receiver-node` as a manual peer at the dead addr
//!     `127.0.0.1:1` (connection refused → fast direct failure).
//!   * the mock's rendezvous `target` advertises ONE dead `lan` candidate
//!     `127.0.0.1:1`, so the rendezvous-selected route also fails fast.
//!   * the sender advertises an unreachable public URL
//!     (`MUSU_BRIDGE_PUBLIC_URL=http://127.0.0.1:1`) so the RECEIVER's direct
//!     result callback to the sender also fails → reverse relay fallback fires.
//!   * the only working path for both directions is the mock relay KV.

use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine as _;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row as _;
use wiremock::matchers::{method, path, path_regex};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

const POLL_INTERVAL: Duration = Duration::from_millis(200);
const BOOT_TIMEOUT: Duration = Duration::from_secs(20);
const ROUNDTRIP_BUDGET: Duration = Duration::from_secs(45);

const SENDER_NODE: &str = "sender-node";
const RECEIVER_NODE: &str = "receiver-node";
const SHARED_TOKEN: &str = "test-token";
const DEAD_ADDR: &str = "127.0.0.1:1";
const FAR_FUTURE: &str = "2999-01-01T00:00:00Z";

// ── mock_cloud ───────────────────────────────────────────────────────────

mod mock_cloud {
    use super::*;

    /// One stored relay-KV payload record. Field set is the strict subset of
    /// `cloud::P2pRelayPayloadStoredRecord` the client decoders read.
    #[derive(Clone)]
    pub struct StoredPayload {
        pub payload_id: String,
        pub session_id: String,
        pub lease_id: String,
        pub source_node_id: String,
        pub target_node_id: String,
        pub tunnel_id: String,
        pub payload_kind: String,
        pub payload_base64: String,
        pub payload_sha256: String,
        pub payload_bytes: u64,
        pub status: String,
        pub claimed_by: Option<String>,
        pub claimed_at: Option<String>,
        pub delivered_at: Option<String>,
    }

    impl StoredPayload {
        /// Serialize as the cloud `P2pRelayPayloadStoredRecord` shape
        /// (snake_case, all required fields). `include_payload` controls
        /// whether the base64 body is echoed (claim path needs it; the submit
        /// echo does too — the decoders only require it on claimed records).
        pub fn to_record_json(&self, include_payload: bool) -> Value {
            let mut v = json!({
                "payload_id": self.payload_id,
                "session_id": self.session_id,
                "lease_id": self.lease_id,
                "source_node_id": self.source_node_id,
                "target_node_id": self.target_node_id,
                "relay_url": "wss://relay.musu.pro/connect",
                "tunnel_id": self.tunnel_id,
                "payload_kind": self.payload_kind,
                "payload_bytes": self.payload_bytes,
                "payload_sha256": self.payload_sha256,
                "status": self.status,
                "relay_default_data_path": false,
                "release_grade": false,
                "transport_kind": "http_store_forward_preview",
                "created_at": FAR_FUTURE,
                "expires_at": FAR_FUTURE,
            });
            if let Some(claimed_by) = &self.claimed_by {
                v["claimed_by"] = json!(claimed_by);
            }
            if let Some(claimed_at) = &self.claimed_at {
                v["claimed_at"] = json!(claimed_at);
            }
            if let Some(delivered_at) = &self.delivered_at {
                v["delivered_at"] = json!(delivered_at);
            }
            if include_payload {
                v["payload_base64"] = json!(self.payload_base64);
            }
            v
        }
    }

    #[derive(Default)]
    pub struct MockCloudState {
        pub payloads: Vec<StoredPayload>,
        pub seq: u64,
    }

    impl MockCloudState {
        /// Distinct kinds of every payload that has reached `delivered`.
        pub fn delivered_payload_kinds(&self) -> Vec<String> {
            self.payloads
                .iter()
                .filter(|p| p.status == "delivered")
                .map(|p| p.payload_kind.clone())
                .collect()
        }

        pub fn enqueued_payload_kinds(&self) -> Vec<String> {
            self.payloads
                .iter()
                .map(|p| p.payload_kind.clone())
                .collect()
        }
    }

    pub type SharedState = Arc<Mutex<MockCloudState>>;

    /// A `Respond` impl backed by shared state and a closure. wiremock's
    /// `respond_with` takes anything `Respond`; we wrap a boxed closure so each
    /// endpoint can mutate `MockCloudState` and build a JSON reply.
    pub struct StatefulResponder {
        state: SharedState,
        handler: Box<dyn Fn(&SharedState, &Request) -> ResponseTemplate + Send + Sync>,
    }

    impl StatefulResponder {
        pub fn new(
            state: SharedState,
            handler: impl Fn(&SharedState, &Request) -> ResponseTemplate + Send + Sync + 'static,
        ) -> Self {
            Self {
                state,
                handler: Box::new(handler),
            }
        }
    }

    impl Respond for StatefulResponder {
        fn respond(&self, request: &Request) -> ResponseTemplate {
            (self.handler)(&self.state, request)
        }
    }

    /// A NodeCandidateSet (cloud DTO) with the given candidate endpoints.
    fn node_candidate_set(node_id: &str, candidates: Value) -> Value {
        json!({
            "node_id": node_id,
            "node_name": node_id,
            "app_version": "test",
            "candidate_endpoints": candidates,
            "relay_capable": true,
            "public_key": "",
            "capabilities": [],
        })
    }

    /// The rendezvous session JSON. `target` carries exactly one DEAD `lan`
    /// candidate so the direct route fails fast; `source` is empty.
    pub fn rendezvous_session_json(session_id: &str) -> Value {
        let dead_lan = json!([{
            "kind": "lan",
            "addr": DEAD_ADDR,
            "observed_at": FAR_FUTURE,
        }]);
        json!({
            "session_id": session_id,
            "source": node_candidate_set(SENDER_NODE, json!([])),
            "target": node_candidate_set(RECEIVER_NODE, dead_lan),
            "expires_at": FAR_FUTURE,
            "approval_required": false,
        })
    }

    /// Build a relay-lease response with a unique lease id.
    fn lease_response_json(state: &SharedState, body: &Value) -> Value {
        let lease_id = {
            let mut st = state.lock().unwrap();
            st.seq += 1;
            format!("lease-{}", st.seq)
        };
        let session_id = body
            .get("session_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let source = body
            .get("source_node_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let target = body
            .get("target_node_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        json!({
            "ok": true,
            "lease_issued": true,
            "owner_scoped": true,
            "relay_control_plane_wired": true,
            "relay_transport_wired": true,
            "relay_default_data_path": false,
            "policy": "connect_pro_fallback_only",
            "blockers": [],
            "lease": {
                "lease_id": lease_id,
                "session_id": session_id,
                "source_node_id": source,
                "target_node_id": target,
                "relay_url": "wss://relay.musu.pro/connect",
                "route_kind": "relay",
                "payload_transited_musu_infra": true,
                "default_data_path": false,
                "policy": "connect_pro_fallback_only",
                "created_at": FAR_FUTURE,
                "expires_at": FAR_FUTURE,
            },
        })
    }

    /// POST submit → enqueue a `queued` StoredPayload and echo it back.
    fn submit_response_json(state: &SharedState, body: &Value) -> Value {
        let mut st = state.lock().unwrap();
        st.seq += 1;
        let payload_id = format!("pl-{}", st.seq);
        let payload_base64 = body
            .get("payload_base64")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        // Bytes/sha are derived from the SUBMITTED base64 so the decoder's
        // integrity checks pass byte-for-byte on the claim path.
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(payload_base64.as_bytes())
            .unwrap_or_default();
        let payload_sha256 = hex_sha256(&decoded);
        let stored = StoredPayload {
            payload_id: payload_id.clone(),
            session_id: str_field(body, "session_id"),
            lease_id: str_field(body, "lease_id"),
            source_node_id: str_field(body, "source_node_id"),
            target_node_id: str_field(body, "target_node_id"),
            tunnel_id: str_field(body, "tunnel_id"),
            payload_kind: str_field(body, "payload_kind"),
            payload_base64,
            payload_sha256,
            payload_bytes: decoded.len() as u64,
            status: "queued".to_string(),
            claimed_by: None,
            claimed_at: None,
            delivered_at: None,
        };
        let record = stored.to_record_json(true);
        st.payloads.push(stored);
        json!({
            "ok": true,
            "accepted": true,
            "stored": true,
            "owner_scoped": true,
            "relay_payload_queue_endpoint_wired": true,
            "relay_default_data_path": false,
            "payload_transit_requires_lease": true,
            "release_grade": false,
            "release_grade_blockers": ["relay_payload_queue_not_quic_tls_transport"],
            "relay_payload_store_configured": true,
            "relay_payload_store_backend": "mock",
            "relay_payload_store_release_grade": false,
            "payload": record,
        })
    }

    /// PATCH claim → take this target's `queued` payloads, mark them `claimed`,
    /// and return them WITH the base64 body so the decoder can verify integrity.
    fn claim_response_json(state: &SharedState, body: &Value) -> Value {
        let target = str_field(body, "target_node_id");
        let claimant = body
            .get("claimant_node_id")
            .and_then(Value::as_str)
            .unwrap_or(&target)
            .to_string();
        let limit = body.get("limit").and_then(Value::as_u64).unwrap_or(1) as usize;
        let mut st = state.lock().unwrap();
        let mut claimed_records = Vec::new();
        for p in st.payloads.iter_mut() {
            if claimed_records.len() >= limit.max(1) {
                break;
            }
            if p.status == "queued" && p.target_node_id == target {
                p.status = "claimed".to_string();
                p.claimed_by = Some(claimant.clone());
                p.claimed_at = Some(FAR_FUTURE.to_string());
                claimed_records.push(p.to_record_json(true));
            }
        }
        let claimed = !claimed_records.is_empty();
        json!({
            "schema": "musu.relay_payload_claim.v1",
            "ok": true,
            "owner_scoped": true,
            "accepted": true,
            "claimed": claimed,
            "relay_payload_queue_endpoint_wired": true,
            "relay_default_data_path": false,
            "release_grade": false,
            "relay_payload_store_configured": true,
            "relay_payload_store_backend": "mock",
            "relay_payload_store_release_grade": false,
            "count": claimed_records.len(),
            "payloads": claimed_records,
        })
    }

    /// PATCH delivery → mark the named payload `delivered` and return a
    /// delivery proof (drain errors `relay_payload_delivery_proof_missing`
    /// without one).
    fn delivery_response_json(state: &SharedState, body: &Value) -> Value {
        let payload_id = str_field(body, "payload_id");
        let target = str_field(body, "target_node_id");
        let mut st = state.lock().unwrap();
        let mut delivered_record: Option<Value> = None;
        let mut proof: Option<Value> = None;
        for p in st.payloads.iter_mut() {
            if p.payload_id == payload_id {
                p.status = "delivered".to_string();
                p.delivered_at = Some(FAR_FUTURE.to_string());
                proof = Some(json!({
                    "schema": "musu.relay_payload_delivery_proof.v1",
                    "payload_id": p.payload_id,
                    "session_id": p.session_id,
                    "lease_id": p.lease_id,
                    "source_node_id": p.source_node_id,
                    "target_node_id": p.target_node_id,
                    "relay_url": "wss://relay.musu.pro/connect",
                    "tunnel_id": p.tunnel_id,
                    "payload_kind": p.payload_kind,
                    "transport_kind": "http_store_forward_preview",
                    "relay_default_data_path": false,
                    "release_grade": false,
                    "payload_sha256": p.payload_sha256,
                    "payload_bytes": p.payload_bytes,
                    "claimed_by": p.claimed_by.clone().unwrap_or_else(|| target.clone()),
                    "claimed_at": p.claimed_at.clone().unwrap_or_else(|| FAR_FUTURE.to_string()),
                    "created_at": FAR_FUTURE,
                    "delivered_at": FAR_FUTURE,
                }));
                delivered_record = Some(p.to_record_json(true));
                break;
            }
        }
        json!({
            "schema": "musu.relay_payload_delivery.v1",
            "ok": true,
            "owner_scoped": true,
            "accepted": true,
            "delivered": delivered_record.is_some(),
            "relay_default_data_path": false,
            "release_grade": false,
            "relay_payload_store_configured": true,
            "relay_payload_store_backend": "mock",
            "relay_payload_store_release_grade": false,
            "payload": delivered_record,
            "delivery_proof": proof,
        })
    }

    fn str_field(body: &Value, key: &str) -> String {
        body.get(key)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    }

    pub fn hex_sha256(bytes: &[u8]) -> String {
        hex::encode(Sha256::digest(bytes))
    }

    /// Register every relay/rendezvous endpoint on the mock server.
    pub async fn mount_all(server: &MockServer, state: SharedState) {
        // ── Rendezvous ──────────────────────────────────────────────────
        // POST /api/v1/p2p/rendezvous → fixed session with dead target.
        Mock::given(method("POST"))
            .and(path("/api/v1/p2p/rendezvous"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(rendezvous_session_json("rv-w6")),
            )
            .mount(server)
            .await;

        // POST /api/v1/p2p/rendezvous/{id}/candidates → echo a fresh session.
        Mock::given(method("POST"))
            .and(path_regex(r"^/api/v1/p2p/rendezvous/[^/]+/candidates$"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(rendezvous_session_json("rv-w6")),
            )
            .mount(server)
            .await;

        // POST /api/v1/p2p/rendezvous/{id}/close → {}.
        Mock::given(method("POST"))
            .and(path_regex(r"^/api/v1/p2p/rendezvous/[^/]+/close$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({})))
            .mount(server)
            .await;

        // GET /api/v1/p2p/rendezvous/{id} → echo session.
        Mock::given(method("GET"))
            .and(path_regex(r"^/api/v1/p2p/rendezvous/[^/]+$"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(rendezvous_session_json("rv-w6")),
            )
            .mount(server)
            .await;

        // ── Relay lease ─────────────────────────────────────────────────
        Mock::given(method("POST"))
            .and(path("/api/v1/p2p/relay/lease"))
            .respond_with(StatefulResponder::new(state.clone(), |st, req| {
                let body: Value = serde_json::from_slice(&req.body).unwrap_or(Value::Null);
                ResponseTemplate::new(200).set_body_json(lease_response_json(st, &body))
            }))
            .mount(server)
            .await;

        // ── Relay payload submit (POST) ─────────────────────────────────
        Mock::given(method("POST"))
            .and(path("/api/v1/p2p/relay/payload"))
            .respond_with(StatefulResponder::new(state.clone(), |st, req| {
                let body: Value = serde_json::from_slice(&req.body).unwrap_or(Value::Null);
                ResponseTemplate::new(200).set_body_json(submit_response_json(st, &body))
            }))
            .mount(server)
            .await;

        // ── Relay payload PATCH: claim vs delivery dispatch on body shape ──
        // claim   → body has `claimant_node_id`/`limit` (P2pRelayPayloadClaimRequest)
        // delivery→ body is {schema, payload_id, target_node_id}
        Mock::given(method("PATCH"))
            .and(path("/api/v1/p2p/relay/payload"))
            .respond_with(StatefulResponder::new(state.clone(), |st, req| {
                let body: Value = serde_json::from_slice(&req.body).unwrap_or(Value::Null);
                let is_delivery = body.get("payload_id").is_some()
                    && body.get("claimant_node_id").is_none()
                    && body.get("limit").is_none();
                let reply = if is_delivery {
                    delivery_response_json(st, &body)
                } else {
                    claim_response_json(st, &body)
                };
                ResponseTemplate::new(200).set_body_json(reply)
            }))
            .mount(server)
            .await;

        // ── Best-effort catch-alls (drain submits these; must not 404) ────
        Mock::given(method("POST"))
            .and(path("/api/v1/p2p/relay/transport-proof"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"ok": true})))
            .mount(server)
            .await;

        // Route-evidence submit path (best-effort in drain). Catch any other
        // POST under /api/v1/p2p/ that we did not explicitly model.
        Mock::given(method("POST"))
            .and(path_regex(r"^/api/v1/p2p/.*$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"ok": true})))
            .mount(server)
            .await;
    }
}

use mock_cloud::{MockCloudState, SharedState, StoredPayload};

// ── bridge child helpers (mirrors tests/r2_smoke.rs) ───────────────────────

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

fn tempdir(tag: &str) -> std::path::PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!(
        "musu-rs-w6-{tag}-{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&p).expect("mkdir tempdir");
    p
}

/// Boot a `musu bridge` child wired to the mock cloud. `musu_home` holds the
/// per-node token, nodes/manual peers, and relay state.
#[allow(clippy::too_many_arguments)]
fn spawn_bridge_for_relay(
    node_name: &str,
    port: u16,
    db_path: &std::path::Path,
    musu_home: &std::path::Path,
    mock_base: &str,
    public_url: &str,
) -> BridgeProc {
    let bin = env!("CARGO_BIN_EXE_musu");
    let child = Command::new(bin)
        .arg("bridge")
        .env("MUSU_ENV", "development")
        .env("MUSU_HOME", musu_home)
        .env("MUSU_NODE_NAME", node_name)
        .env("MUSU_BRIDGE_TOKEN", SHARED_TOKEN)
        // peer_token + account token: the shared mesh bearer used for cross-machine
        // forward/callback AND as the account cloud token (cloud/token.rs reads
        // MUSU_TOKEN). Same value on both nodes so every bearer is accepted.
        .env("MUSU_TOKEN", SHARED_TOKEN)
        .env("MUSU_CLOUD_BASE_URL", mock_base)
        // Advertised URL the PEER uses for the direct result callback. We point
        // it at a dead addr so the receiver's direct callback fails → reverse
        // relay fallback fires.
        .env("MUSU_BRIDGE_PUBLIC_URL", public_url)
        .env("BRIDGE_HOST", "127.0.0.1")
        .env("BRIDGE_PORT", port.to_string())
        .env("MUSU_BRIDGE_DB_PATH", db_path)
        .env("MUSU_DISABLE_RATE_LIMIT", "1")
        // Poller enabled (default ON) but the 30s floor means we drive the
        // drain route directly; this just confirms enabling it is harmless.
        .env("MUSU_ENABLE_RELAY_PAYLOAD_POLLER", "1")
        // Keep cloud-call timeouts short so the direct-fail + callback-fail
        // backoff windows stay inside the budget.
        .env("MUSU_P2P_RENDEZVOUS_CLIENT_TIMEOUT_MS", "2000")
        .env("MUSU_P2P_RELAY_PAYLOAD_DRAIN_TIMEOUT_MS", "2000")
        .env("RUST_LOG", "warn")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn musu bridge");
    BridgeProc { child }
}

async fn wait_for_ready(client: &reqwest::Client, base: &str) {
    let url = format!("{base}/health/ready");
    let deadline = Instant::now() + BOOT_TIMEOUT;
    let mut last_err: Option<String> = None;
    while Instant::now() < deadline {
        match client.get(&url).bearer_auth(SHARED_TOKEN).send().await {
            Ok(resp) if resp.status().is_success() => return,
            Ok(resp) => last_err = Some(format!("status {}", resp.status())),
            Err(e) => last_err = Some(e.to_string()),
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
    panic!("bridge {base} not ready within {BOOT_TIMEOUT:?}; last: {last_err:?}");
}

/// Register `receiver-node` as a manual peer of the sender at a DEAD addr so
/// the direct forward attempt fails fast (connection refused).
fn seed_dead_peer(sender_home: &std::path::Path) {
    let toml = format!(
        "[[peers]]\naddr = \"{DEAD_ADDR}\"\nname = \"{RECEIVER_NODE}\"\nadded_at = \"{FAR_FUTURE}\"\n"
    );
    std::fs::write(sender_home.join("manual_peers.toml"), toml).expect("write manual_peers.toml");
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("client build")
}

/// POST /api/relay/payloads/drain on `base` with a small limit. Returns the
/// parsed report JSON. Drives the real production drain path synchronously so
/// we do not wait on the 30s-floored background poller.
async fn drive_drain(client: &reqwest::Client, base: &str) -> Value {
    let url = format!("{base}/api/relay/payloads/drain");
    let resp = client
        .post(&url)
        .bearer_auth(SHARED_TOKEN)
        .json(&json!({ "limit": 4 }))
        .send()
        .await
        .expect("drain POST");
    assert!(
        resp.status().is_success(),
        "drain status {} body {}",
        resp.status(),
        resp.text().await.unwrap_or_default()
    );
    resp.json().await.expect("drain report json")
}

/// Fetch one route_executions row from a node via GET /api/tasks/{task_id}.
/// NOTE: this endpoint exposes only status/output/error/exit_code/duration_sec/
/// route_proof — NOT forwarded_to_node/remote_task_id (tasks.rs:656). Use
/// [`read_route_execution_columns`] for those columns.
async fn get_task_row(client: &reqwest::Client, base: &str, task_id: &str) -> Option<Value> {
    let url = format!("{base}/api/tasks/{task_id}");
    let resp = client
        .get(&url)
        .bearer_auth(SHARED_TOKEN)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json().await.ok()
}

/// Open the bridge's sqlite DB read-only and read the columns the HTTP API
/// does not expose. SQLite WAL permits a concurrent reader while the child
/// bridge holds the DB; `mode=ro` + `immutable=false` is the safe shared read.
/// Returns `(status, output, forwarded_to_node, remote_task_id)`.
async fn read_route_execution_columns(
    db_path: &std::path::Path,
    task_id: &str,
) -> Option<(String, Option<String>, Option<String>, Option<String>)> {
    let url = format!(
        "sqlite://{}?mode=ro",
        db_path.display().to_string().replace('\\', "/")
    );
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .ok()?;
    let row = sqlx::query(
        "SELECT status, output, forwarded_to_node, remote_task_id \
         FROM route_executions WHERE task_id = ?",
    )
    .bind(task_id)
    .fetch_optional(&pool)
    .await
    .ok()?;
    let out = row.map(|r| {
        (
            r.try_get::<String, _>("status").unwrap_or_default(),
            r.try_get::<Option<String>, _>("output").unwrap_or(None),
            r.try_get::<Option<String>, _>("forwarded_to_node")
                .unwrap_or(None),
            r.try_get::<Option<String>, _>("remote_task_id")
                .unwrap_or(None),
        )
    });
    pool.close().await;
    out
}

// ── Pre-flight: the mock rendezvous JSON must deserialize via the real DTO ──

/// Plan §risk-4: a malformed mock rendezvous body would make the forward
/// silently skip the relay queue (a false-pass). Catch it by deserializing the
/// mock JSON through the SAME `serde_json` contract the client uses (snake_case,
/// all required NodeCandidateSet/CandidateEndpoint fields). We assert the shape
/// here without importing the private cloud module: every field the client's
/// `P2pRendezvousSession`/`NodeCandidateSet`/`CandidateEndpoint` requires must
/// be present and correctly typed.
#[test]
fn w6_mock_rendezvous_json_matches_cloud_contract() {
    let v = mock_cloud::rendezvous_session_json("rv-preflight");

    // P2pRendezvousSession required fields.
    assert!(v["session_id"].is_string(), "session_id must be a string");
    assert!(v["expires_at"].is_string(), "expires_at must be a string");
    assert!(
        v["approval_required"].is_boolean(),
        "approval_required must be a bool"
    );

    for side in ["source", "target"] {
        let set = &v[side];
        // NodeCandidateSet required fields (all non-Option in the DTO).
        for f in ["node_id", "node_name", "app_version", "public_key"] {
            assert!(set[f].is_string(), "{side}.{f} must be a string");
        }
        assert!(
            set["relay_capable"].is_boolean(),
            "{side}.relay_capable must be a bool"
        );
        assert!(
            set["candidate_endpoints"].is_array(),
            "{side}.candidate_endpoints must be an array"
        );
        assert!(
            set["capabilities"].is_array(),
            "{side}.capabilities must be an array"
        );
    }

    // The single target candidate must be a snake_case `lan` CandidateEndpoint
    // with the dead addr — this is what forces a fast direct failure.
    let cand = &v["target"]["candidate_endpoints"][0];
    assert_eq!(
        cand["kind"], "lan",
        "target candidate kind must be snake_case lan"
    );
    assert_eq!(
        cand["addr"], DEAD_ADDR,
        "target candidate must be the dead addr"
    );
    assert!(
        cand["observed_at"].is_string(),
        "candidate observed_at must be a string"
    );
    assert!(
        v["source"]["candidate_endpoints"]
            .as_array()
            .unwrap()
            .is_empty(),
        "source candidate set must be empty"
    );
}

// ── TEST 1: forward via relay + reverse callback round-trip ─────────────────

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn w6_forward_via_relay_and_reverse_callback_roundtrip() {
    let state: SharedState = Arc::new(Mutex::new(MockCloudState::default()));
    let server = MockServer::start().await;
    mock_cloud::mount_all(&server, state.clone()).await;
    let mock_base = server.uri();

    // ── boot receiver then sender ────────────────────────────────────────
    let recv_home = tempdir("recv");
    let send_home = tempdir("send");
    let recv_port = pick_port();
    let send_port = pick_port();
    let recv_db = recv_home.join("musu.db");
    let send_db = send_home.join("musu.db");

    seed_dead_peer(&send_home);

    let _recv = spawn_bridge_for_relay(
        RECEIVER_NODE,
        recv_port,
        &recv_db,
        &recv_home,
        &mock_base,
        // receiver's advertised URL is irrelevant to the test; keep it dead too.
        "http://127.0.0.1:1",
    );
    let _send = spawn_bridge_for_relay(
        SENDER_NODE,
        send_port,
        &send_db,
        &send_home,
        &mock_base,
        // sender advertises a DEAD public url → receiver's direct callback fails.
        "http://127.0.0.1:1",
    );

    let client = http_client();
    let recv_base = format!("http://127.0.0.1:{recv_port}");
    let send_base = format!("http://127.0.0.1:{send_port}");
    wait_for_ready(&client, &recv_base).await;
    wait_for_ready(&client, &send_base).await;

    // ── drive the forward: POST /api/tasks/delegate with target_node ─────
    let prompt = "w6-roundtrip-payload";
    let delegate = client
        .post(format!("{send_base}/api/tasks/delegate"))
        .bearer_auth(SHARED_TOKEN)
        .json(&json!({
            "channel": "ceo",
            "sender_id": "operator",
            "text": prompt,
            "target_node": RECEIVER_NODE,
            "adapter_type": "echo",
        }))
        .send()
        .await
        .expect("delegate POST");
    let status = delegate.status();
    let body: Value = delegate.json().await.expect("delegate body json");
    // The relay path MUST return 202 (queued): the forward failed directly and
    // the task was stored on the relay KV (W-2). A 200 would mean the direct
    // forward succeeded — which means the dead-path setup leaked and this test
    // is proving nothing about relay. Assert 202 exactly so a misconfigured
    // dead path fails LOUDLY here instead of via an indirect KV-snapshot timeout.
    assert_eq!(
        status.as_u16(),
        202,
        "delegate must return 202 (relay-queued); 200 means direct forward \
         succeeded — check the dead-path setup. body {body}"
    );
    let task_id = body
        .get("task_id")
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("delegate response missing task_id: {body}"))
        .to_string();

    // ── bounded round-trip loop ──────────────────────────────────────────
    // Pump the receiver drain (claims forwarded task → runs echo → fires
    // reverse callback) and the sender drain (claims the reverse callback →
    // finalizes the row). The receiver's direct callback to the dead sender
    // url backs off ~7s before the reverse-relay queue fires, so we keep
    // pumping both sides until the sender row is terminal.
    let deadline = Instant::now() + ROUNDTRIP_BUDGET;
    let mut final_row: Option<Value> = None;
    while Instant::now() < deadline {
        let _ = drive_drain(&client, &recv_base).await;
        let _ = drive_drain(&client, &send_base).await;
        if let Some(row) = get_task_row(&client, &send_base, &task_id).await {
            let status = row.get("status").and_then(Value::as_str).unwrap_or("");
            if matches!(status, "done" | "failed" | "cancelled") {
                final_row = Some(row);
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    let row = final_row.unwrap_or_else(|| {
        let snapshot = state.lock().unwrap();
        panic!(
            "sender task {task_id} never reached terminal state within {ROUNDTRIP_BUDGET:?}. \
             enqueued kinds={:?} delivered kinds={:?}",
            snapshot.enqueued_payload_kinds(),
            snapshot.delivered_payload_kinds(),
        )
    });

    // ── assert the sender row finalized via the reverse callback ─────────
    assert_eq!(
        row.get("status").and_then(Value::as_str),
        Some("done"),
        "sender row should be done; got {row}"
    );
    assert_eq!(
        row.get("output").and_then(Value::as_str),
        Some(format!("echo: {prompt}").as_str()),
        "sender output must equal the executor's echo result; got {row}"
    );

    // forwarded_to_node + remote_task_id are NOT exposed by GET /api/tasks/{id}
    // (tasks.rs:656), so read them directly from the sender DB (read-only).
    let (db_status, db_output, forwarded_to_node, remote_task_id) =
        read_route_execution_columns(&send_db, &task_id)
            .await
            .unwrap_or_else(|| panic!("could not read sender DB row for {task_id}"));
    assert_eq!(db_status, "done", "DB status mismatch");
    assert_eq!(
        db_output.as_deref(),
        Some(format!("echo: {prompt}").as_str()),
        "DB output mismatch"
    );
    assert_eq!(
        forwarded_to_node.as_deref(),
        Some(RECEIVER_NODE),
        "sender row must be bound to receiver-node via the relay Err-branch binding"
    );

    // ── assert the relay KV carried BOTH directions to delivered ─────────
    let (enqueued, delivered) = {
        let st = state.lock().unwrap();
        (st.enqueued_payload_kinds(), st.delivered_payload_kinds())
    };
    assert!(
        enqueued.iter().any(|k| k == "forwarded_task_envelope"),
        "expected a forwarded_task_envelope enqueued; got {enqueued:?}"
    );
    assert!(
        enqueued.iter().any(|k| k == "task_callback_envelope"),
        "expected a task_callback_envelope enqueued; got {enqueued:?}"
    );
    assert!(
        delivered.iter().any(|k| k == "forwarded_task_envelope"),
        "forwarded_task_envelope must reach delivered; got {delivered:?}"
    );
    assert!(
        delivered.iter().any(|k| k == "task_callback_envelope"),
        "task_callback_envelope must reach delivered; got {delivered:?}"
    );

    // remote_task_id: documented as a correlation aid. On the RELAY path the
    // sender only sets forwarded_to_node (tasks.rs:469-485 Err branch) and
    // apply_task_callback does NOT persist remote_task_id (forward.rs:1298-1314),
    // so unlike the direct-Ok path (tasks.rs:381-389) this column legitimately
    // stays NULL. We assert the ACTUAL behavior rather than the plan's optimistic
    // "remote_task_id populated" expectation; see FINDINGS / HANDOFF NOTES.
    assert!(
        remote_task_id.is_none() || remote_task_id.as_deref() == Some(""),
        "relay path does not persist remote_task_id on the sender; got {remote_task_id:?} \
         (if this fails, production now wires it — update assertion + FINDINGS)"
    );
}

// ── TEST 2: forged callback (wrong source node, S-2) is rejected ────────────

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn w6_forged_callback_wrong_source_node_is_rejected() {
    let state: SharedState = Arc::new(Mutex::new(MockCloudState::default()));
    let server = MockServer::start().await;
    mock_cloud::mount_all(&server, state.clone()).await;
    let mock_base = server.uri();

    let recv_home = tempdir("recv2");
    let send_home = tempdir("send2");
    let recv_port = pick_port();
    let send_port = pick_port();

    seed_dead_peer(&send_home);

    let _recv = spawn_bridge_for_relay(
        RECEIVER_NODE,
        recv_port,
        &recv_home.join("musu.db"),
        &recv_home,
        &mock_base,
        "http://127.0.0.1:1",
    );
    let _send = spawn_bridge_for_relay(
        SENDER_NODE,
        send_port,
        &send_home.join("musu.db"),
        &send_home,
        &mock_base,
        "http://127.0.0.1:1",
    );

    let client = http_client();
    let send_base = format!("http://127.0.0.1:{send_port}");
    wait_for_ready(&client, &send_base).await;

    // First, drive a real forward so the sender has a pending row bound to
    // receiver-node (forwarded_to_node = receiver-node). We do NOT pump the
    // receiver, so the task stays pending on the sender.
    let prompt = "w6-forgery-target";
    let delegate = client
        .post(format!("{send_base}/api/tasks/delegate"))
        .bearer_auth(SHARED_TOKEN)
        .json(&json!({
            "channel": "ceo",
            "sender_id": "operator",
            "text": prompt,
            "target_node": RECEIVER_NODE,
            "adapter_type": "echo",
        }))
        .send()
        .await
        .expect("delegate POST");
    let body: Value = delegate.json().await.expect("delegate body json");
    let task_id = body
        .get("task_id")
        .and_then(Value::as_str)
        .expect("task_id")
        .to_string();

    // Read the forwarded task envelope the sender queued so we can reuse its
    // session/lease and the sender row's source_task_id for the forgery.
    let forwarded = {
        let st = state.lock().unwrap();
        st.payloads
            .iter()
            .find(|p| p.payload_kind == "forwarded_task_envelope")
            .cloned()
            .expect("sender should have queued a forwarded_task_envelope")
    };

    // Pre-seed a FORGED task_callback addressed to sender-node. S-2: the
    // callback body's `node` ("evil-node") does NOT equal the payload's
    // source_node_id ("evil-node" set as submitter is fine; the mismatch the
    // decoder checks is cb.node vs payload.source_node_id). To trip S-2 we make
    // payload.source_node_id = receiver-node but cb.node = evil-node.
    seed_forged_callback(&state, &forwarded, &task_id);

    // Drain the sender ≥2 cycles. The forged callback is claimed but
    // callback_from_relay_payload rejects it (relay_callback_executor_mismatch),
    // so apply_task_callback never runs and the row stays pending.
    for _ in 0..4 {
        let _ = drive_drain(&client, &send_base).await;
        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    let row = get_task_row(&client, &send_base, &task_id)
        .await
        .unwrap_or_else(|| panic!("sender row {task_id} vanished"));
    assert_eq!(
        row.get("status").and_then(Value::as_str),
        Some("pending"),
        "forged callback must NOT finalize the row; status was {row}"
    );
    // The forged payload must NOT have been marked delivered (drain failed it).
    let delivered_callbacks: usize = {
        let st = state.lock().unwrap();
        st.payloads
            .iter()
            .filter(|p| p.payload_kind == "task_callback_envelope" && p.status == "delivered")
            .count()
    };
    assert_eq!(
        delivered_callbacks, 0,
        "forged callback must not be acknowledged delivered"
    );
    // The unused `client` GET helper keeps the API exercised; assert the
    // forged payload reached `claimed` (the decoder ran on it) but not
    // `delivered` (it was rejected before delivery ack).
    let claimed_forgeries: usize = {
        let st = state.lock().unwrap();
        st.payloads
            .iter()
            .filter(|p| p.payload_kind == "task_callback_envelope" && p.status == "claimed")
            .count()
    };
    assert!(
        claimed_forgeries >= 1,
        "the forged callback should have been claimed-then-rejected (claimed, not delivered)"
    );
}

/// Seed a forged TASK_CALLBACK payload directly into the mock KV, addressed to
/// the sender. The envelope body's `node` is `evil-node` while the payload's
/// declared `source_node_id` is `receiver-node` → decoder S-2
/// (`cb.node != payload.source_node_id`) rejects it.
fn seed_forged_callback(state: &SharedState, forwarded: &StoredPayload, source_task_id: &str) {
    // Build a TaskCallback JSON whose `node` is the forger ("evil-node").
    let cb = json!({
        "source_task_id": source_task_id,
        "remote_task_id": "evil-remote-1",
        "status": "done",
        "output": "PWNED",
        "error": null,
        "exit_code": 0,
        "duration_sec": 0.1,
        "node": "evil-node",
    });
    let cb_bytes = serde_json::to_vec(&cb).expect("serialize forged cb");
    let payload_base64 = base64::engine::general_purpose::STANDARD.encode(&cb_bytes);
    let payload_sha256 = mock_cloud::hex_sha256(&cb_bytes);

    let mut st = state.lock().unwrap();
    st.seq += 1;
    let payload_id = format!("forged-{}", st.seq);
    // source_node_id = receiver-node (the relay-asserted submitter); cb.node =
    // evil-node → S-2 mismatch. target = sender-node so the sender claims it.
    st.payloads.push(StoredPayload {
        payload_id,
        session_id: forwarded.session_id.clone(),
        lease_id: forwarded.lease_id.clone(),
        source_node_id: RECEIVER_NODE.to_string(),
        target_node_id: SENDER_NODE.to_string(),
        tunnel_id: forwarded.tunnel_id.clone(),
        payload_kind: "task_callback_envelope".to_string(),
        payload_base64,
        payload_sha256,
        payload_bytes: cb_bytes.len() as u64,
        status: "queued".to_string(),
        claimed_by: None,
        claimed_at: None,
        delivered_at: None,
    });
}
