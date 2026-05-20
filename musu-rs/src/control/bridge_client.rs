//! HTTP proxy client used by `musu control` MCP tools to call the local
//! musu-bridge over loopback.
//!
//! wiki/493 §3 + §4 + Critic C6 (eager init) + Critic C12 (error mapping):
//!
//!  * **Eager construction** (C6): `BridgeClient::try_new()` is called at
//!    `control::run()` entry, BEFORE `rmcp::serve` ever touches stdout. If
//!    the token cannot be resolved, we error out with a stderr message and
//!    return — the MCP transport never emits a frame, satisfying acceptance
//!    criterion #11 (missing token → clear stderr BEFORE any MCP frame on
//!    stdout). The client is then wrapped in `Arc<BridgeClient>` and threaded
//!    through the ServerHandler. The old plan called for `OnceLock` but
//!    Critic C6 (MED) flagged the closure-panic-poisoning + lazy-init-after-
//!    first-frame failure modes.
//!
//!  * **Tool-style error mapping** (C12 / §1.1 Q8 / acceptance #10): every
//!    proxy method returns `anyhow::Result<String>`. A connection refused or
//!    a non-2xx status is NEVER an error frame — it is `Ok(human_string)`
//!    that the tool returns verbatim to Claude Code. Internal RFC-rejected
//!    panics are also wrapped to `Ok(...)`. We log the full `reqwest::Error`
//!    to stderr via `tracing::warn!`. Only true bugs (`serde_json::to_string`
//!    on a struct we own) bubble as `Err`.
//!
//!  * **Token resolver** (Critic C4): we call
//!    `crate::install::token::read_bridge_token` — the same dedup'd resolver
//!    that auto_update.rs + uninstall.rs now use. Three previous copies → 1.

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{anyhow, Result};
use reqwest::StatusCode;
use serde::Serialize;
use serde_json::Value;

const DEFAULT_BRIDGE_URL: &str = "http://127.0.0.1:8070";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Thin proxy wrapping a `reqwest::Client` + the bearer token. Cheap to clone
/// (the inner client is `Arc<reqwest::ClientInner>`), but we wrap the whole
/// thing in `Arc<BridgeClient>` at the call site to match rmcp's
/// `Arc<ServerHandler>` lifecycle.
#[derive(Debug, Clone)]
pub struct BridgeClient {
    http: reqwest::Client,
    base_url: String,
    token: String,
}

impl BridgeClient {
    /// Eager construction. Returns `Err` ONLY when the token cannot be
    /// resolved — caller must propagate before `rmcp::serve` writes any frame.
    pub fn try_new() -> Result<Self> {
        let base_url = std::env::var("MUSU_BRIDGE_URL")
            .unwrap_or_else(|_| DEFAULT_BRIDGE_URL.to_string())
            .trim_end_matches('/')
            .to_string();

        let home = musu_home_for_token()?;
        let token = crate::install::token::read_bridge_token(&home).ok_or_else(|| {
            anyhow!(
                "MUSU_BRIDGE_TOKEN not set and {}/bridge.env is missing or empty. \
                 Run `musu install` to provision, or export MUSU_BRIDGE_TOKEN manually.",
                home.display()
            )
        })?;

        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            // Loopback only; rustls is fine but never reached in practice.
            .build()
            .map_err(|e| anyhow!("reqwest::Client::build: {e}"))?;

        Ok(Self {
            http,
            base_url,
            token,
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    /// Centralized HTTP→tool-string mapping. Per C12 / acceptance #10:
    ///   * connection-refused / dns / timeout → `Ok(bridge_not_running_msg)`
    ///   * 401 → `Ok(bridge_rejected_token_msg)`
    ///   * other 4xx → `Ok(format!("bridge rejected: {status} — {body}"))`
    ///   * 5xx       → `Ok(format!("bridge error: {status} — {body}"))`
    ///   * 2xx       → `Ok(body)` (caller decides whether to pretty-print)
    async fn send(&self, builder: reqwest::RequestBuilder) -> Result<String> {
        let builder = builder.bearer_auth(&self.token);
        let resp = match builder.send().await {
            Ok(r) => r,
            Err(e) => {
                // C12 (a): connection-refused / DNS / timeout / TLS — all
                // collapse to the same operator-facing message. We log the
                // underlying error to stderr for ops debugging.
                tracing::warn!(error = %e, url = %self.base_url, "bridge request failed");
                return Ok(format!(
                    "musu bridge not running at {}; start with `musu install` or `musud`",
                    self.base_url
                ));
            }
        };

        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();

        match status {
            s if s.is_success() => Ok(body),
            StatusCode::UNAUTHORIZED => Ok(
                "musu bridge rejected our token; verify MUSU_BRIDGE_TOKEN env / \
                 ~/.musu/bridge.env match the bridge"
                    .to_string(),
            ),
            s if s.is_client_error() => Ok(format!("bridge rejected: {s} — {body}")),
            s if s.is_server_error() => Ok(format!("bridge error: {s} — {body}")),
            // 1xx / 3xx — reqwest auto-follows redirects, so this is a real
            // bug if we land here. Pass through.
            other => Ok(format!("bridge unexpected status: {other} — {body}")),
        }
    }

    /// GET helper. `path` should begin with `/`.
    pub async fn get(&self, path: &str) -> Result<String> {
        self.send(self.http.get(self.url(path))).await
    }

    /// POST with arbitrary JSON-serializable body.
    pub async fn post_json<T: Serialize>(&self, path: &str, body: &T) -> Result<String> {
        self.send(self.http.post(self.url(path)).json(body)).await
    }

    /// DELETE helper (R5 cancel-task endpoint).
    pub async fn delete(&self, path: &str) -> Result<String> {
        self.send(self.http.delete(self.url(path))).await
    }

    // ──────────────────── T1 strictly-native methods ────────────────────
    //
    // Each returns the bridge body verbatim (already JSON). The MCP tool
    // implementations wrap these results in `Ok(string)` per §1.1 Q8 — they
    // never re-format or re-parse on the happy path.

    pub async fn list_companies(&self) -> Result<String> {
        self.get("/api/companies").await
    }

    pub async fn get_company(&self, id: &str) -> Result<String> {
        // Defense in depth: refuse obviously bogus ids before round-tripping.
        if id.is_empty() {
            return Ok("error: company id required".into());
        }
        self.get(&format!("/api/companies/{}", url_segment(id)))
            .await
    }

    pub async fn create_company(&self, body: &Value) -> Result<String> {
        self.post_json("/api/companies", body).await
    }

    pub async fn activate_company(&self, id: &str) -> Result<String> {
        if id.is_empty() {
            return Ok("error: company id required".into());
        }
        self.post_json(
            &format!("/api/companies/{}/activate", url_segment(id)),
            &serde_json::json!({}),
        )
        .await
    }

    pub async fn run_company(&self, id: &str, body: &Value) -> Result<String> {
        if id.is_empty() {
            return Ok("error: company id required".into());
        }
        self.post_json(&format!("/api/companies/{}/run", url_segment(id)), body)
            .await
    }

    pub async fn delegate_task(&self, body: &Value) -> Result<String> {
        self.post_json("/api/tasks/delegate", body).await
    }

    pub async fn cancel_task(&self, task_id: &str) -> Result<String> {
        if task_id.is_empty() {
            return Ok("error: task_id required".into());
        }
        self.delete(&format!("/api/tasks/{}", url_segment(task_id)))
            .await
    }

    pub async fn list_nodes(&self) -> Result<String> {
        self.get("/api/nodes").await
    }
}

/// Resolve `~/.musu/` for the token lookup. Honours `MUSU_HOME` env override
/// (used by tests) before falling back to `dirs::home_dir()`. We DO NOT use
/// `install::resolve_musu_home` because that takes `Option<&Path>` from CLI
/// args; control has no CLI arg surface.
fn musu_home_for_token() -> Result<PathBuf> {
    if let Ok(s) = std::env::var("MUSU_HOME") {
        if !s.is_empty() {
            return Ok(PathBuf::from(s));
        }
    }
    let home = dirs::home_dir().ok_or_else(|| {
        anyhow!(
            "cannot resolve user home directory (HOME / USERPROFILE unset); \
             set MUSU_HOME or MUSU_BRIDGE_TOKEN explicitly"
        )
    })?;
    Ok(home.join(".musu"))
}

/// Minimal path-segment safety: refuse `/`, `?`, `#`. We don't need full
/// percent-encoding — the bridge IDs are uuids / kebab strings — but a
/// stray slash would change the route, so guard against it. (Caller already
/// rejected empty.)
fn url_segment(s: &str) -> String {
    s.replace(['/', '?', '#'], "_")
}
