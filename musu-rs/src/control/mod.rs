//! `musu control` — native Rust MCP stdio server replacing Python `musu-control`.
//!
//! wiki/493 (V24-R3 CONTROL-RS).
//!
//! Boot order is load-bearing (acceptance #11 + Critic C1/C2/C6):
//!   1. `main.rs` set up stderr-only `tracing` BEFORE entering this fn.
//!   2. Eagerly construct `BridgeClient` — token-resolve failure returns Err
//!      before any byte hits stdout.
//!   3. Build the `ServerHandler` with all 13 tool routes pre-registered.
//!   4. `serve((stdin, stdout))` — rmcp's `AsyncRwTransport` returns on
//!      stdin EOF, so `service.waiting()` resolves when the client closes
//!      its stdin. C8 belt-and-suspenders: we run that `waiting()` future
//!      under `tokio::select!` with an explicit `CancellationToken` so a
//!      future rmcp build that DOESN'T return on EOF still lets us exit
//!      cleanly. The token is also tripped on SIGINT / Ctrl-C (Windows
//!      console + Unix signal hook).
//!
//! Per Critic C5 we deliberately do NOT introduce a `transport.rs`
//! abstraction. The fallback path documented in §7 R3-W1 is "rewrite
//! control/ against jsonrpc-core + tokio stdin/stdout (~300 LOC, one PR)";
//! a `Box<dyn Transport>` wrapper would force lifetime gymnastics for no
//! actual swappability.

use std::sync::Arc;

use anyhow::{Context, Result};
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    CallToolResult, Content, Implementation, InitializeResult, ServerCapabilities, ServerInfo,
};
use rmcp::{tool, tool_handler, tool_router, ErrorData, ServerHandler, ServiceExt};
use tokio_util::sync::CancellationToken;

pub mod bridge_client;
pub mod tools;

use bridge_client::BridgeClient;
use tools::params::{
    CancelTaskParams, CreateCompanyParams, DelegateTaskParams, GetAgentParams, GetCompanyParams,
    RunCompanyParams,
};

/// The MCP server. Holds the eagerly-constructed bridge client + the rmcp
/// tool router. Cheap to clone (everything inside is `Arc`).
#[derive(Clone)]
pub struct ControlServer {
    bridge: Arc<BridgeClient>,
    tool_router: ToolRouter<Self>,
}

impl ControlServer {
    pub fn new(bridge: Arc<BridgeClient>) -> Self {
        Self {
            bridge,
            tool_router: Self::tool_router(),
        }
    }
}

// ─────────────────────────── Tool implementations ───────────────────────────
//
// rmcp 1.7 generates one tool registration per `#[tool(...)]` attribute on a
// method inside `#[tool_router(...)]`. We co-locate them here so they share
// `&self` access to the BridgeClient. Each tool returns `CallToolResult` —
// the convention per Critic C12 / §1.1 Q8 is "always Ok(text)", never an
// error frame, so Claude Code surfaces the human message verbatim.
//
// IMPORTANT (Critic C10): T2 `description` strings are LITERAL `&str` and
// the macro doesn't accept `concat!(...)` here (darling parses
// `description` as `Option<String>`, not `Expr`). Each T2 tool ends with
// the EXACT bytes of `tools::params::T2_SUFFIX`. The compile-time const
// check in tools/params.rs + the runtime `assert!(desc.ends_with(T2_SUFFIX))`
// in `r3_mcp_smoke` is the C10 gate.

#[tool_router(router = tool_router)]
impl ControlServer {
    // ── T1 strictly-native: companies (5 tools) ──────────────────────────

    /// list_companies — proxies GET /api/companies.
    #[tool(
        name = "list_companies",
        description = "List all companies registered with the local musu bridge."
    )]
    async fn list_companies(&self) -> Result<CallToolResult, ErrorData> {
        ok_text(self.bridge.list_companies().await)
    }

    /// get_company — proxies GET /api/companies/:id (V24-R3 R1 patch).
    #[tool(
        name = "get_company",
        description = "Fetch a single company by id from the local musu bridge."
    )]
    async fn get_company(
        &self,
        Parameters(p): Parameters<GetCompanyParams>,
    ) -> Result<CallToolResult, ErrorData> {
        ok_text(self.bridge.get_company(&p.id).await)
    }

    /// create_company — proxies POST /api/companies.
    #[tool(
        name = "create_company",
        description = "Create a new company on the local musu bridge."
    )]
    async fn create_company(
        &self,
        Parameters(p): Parameters<CreateCompanyParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let body = serde_json::to_value(&p).map_err(serialize_err)?;
        ok_text(self.bridge.create_company(&body).await)
    }

    /// activate_company — proxies POST /api/companies/:id/activate.
    #[tool(
        name = "activate_company",
        description = "Activate (set status=active) a company on the local musu bridge."
    )]
    async fn activate_company(
        &self,
        Parameters(p): Parameters<GetCompanyParams>,
    ) -> Result<CallToolResult, ErrorData> {
        ok_text(self.bridge.activate_company(&p.id).await)
    }

    /// run_company — proxies POST /api/companies/:id/run.
    #[tool(
        name = "run_company",
        description = "Start a run for a company on the local musu bridge."
    )]
    async fn run_company(
        &self,
        Parameters(p): Parameters<RunCompanyParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let body = serde_json::to_value(&p.body).map_err(serialize_err)?;
        ok_text(self.bridge.run_company(&p.id, &body).await)
    }

    // ── T1 strictly-native: tasks (2 tools) ──────────────────────────────

    /// delegate_task — proxies POST /api/tasks/delegate.
    #[tool(
        name = "delegate_task",
        description = "Delegate a task to an agent via the local musu bridge writer."
    )]
    async fn delegate_task(
        &self,
        Parameters(p): Parameters<DelegateTaskParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let body = serde_json::to_value(&p).map_err(serialize_err)?;
        ok_text(self.bridge.delegate_task(&body).await)
    }

    /// cancel_task — proxies DELETE /api/tasks/:task_id (R5).
    #[tool(
        name = "cancel_task",
        description = "Cancel a running task on the local musu bridge writer."
    )]
    async fn cancel_task(
        &self,
        Parameters(p): Parameters<CancelTaskParams>,
    ) -> Result<CallToolResult, ErrorData> {
        ok_text(self.bridge.cancel_task(&p.task_id).await)
    }

    // ── T1 strictly-native: nodes (1 tool) ───────────────────────────────

    /// list_nodes — proxies GET /api/nodes.
    #[tool(
        name = "list_nodes",
        description = "List musu nodes (self + peers) known to the local bridge."
    )]
    async fn list_nodes(&self) -> Result<CallToolResult, ErrorData> {
        ok_text(self.bridge.list_nodes().await)
    }

    // ── T2 DEPRECATED stubs (5 tools) ────────────────────────────────────
    //
    // Per Critic C10 / §1.1 Q7: every T2 description ends with the LITERAL
    // bytes of `tools::params::T2_SUFFIX` (= ` (deprecated, will be removed
    // in V25 unless ported to native Rust endpoint)`). The macro requires a
    // literal string so we cannot `concat!` — instead we hard-code the full
    // string and rely on the unit test in tools/params.rs (`t2_suffix_*`)
    // + the runtime smoke test (`r3_mcp_smoke::ends_with_suffix`) to keep
    // these in lock-step. If you change T2_SUFFIX, you MUST hand-update all
    // 5 strings below — the const-vs-literal divergence test will fail
    // loudly if you forget.

    /// list_agents (deprecated stub).
    #[tool(
        name = "list_agents",
        description = "list known agents (legacy) (deprecated, will be removed in V25 unless ported to native Rust endpoint)"
    )]
    async fn list_agents(&self) -> Result<CallToolResult, ErrorData> {
        ok_text(Ok(tools::params::T2_BODY.to_string()))
    }

    /// get_agent (deprecated stub).
    #[tool(
        name = "get_agent",
        description = "fetch a single agent's record (legacy) (deprecated, will be removed in V25 unless ported to native Rust endpoint)"
    )]
    async fn get_agent(
        &self,
        Parameters(_p): Parameters<GetAgentParams>,
    ) -> Result<CallToolResult, ErrorData> {
        ok_text(Ok(tools::params::T2_BODY.to_string()))
    }

    /// get_dashboard (deprecated stub).
    #[tool(
        name = "get_dashboard",
        description = "fetch the dashboard payload (legacy) (deprecated, will be removed in V25 unless ported to native Rust endpoint)"
    )]
    async fn get_dashboard(&self) -> Result<CallToolResult, ErrorData> {
        ok_text(Ok(tools::params::T2_BODY.to_string()))
    }

    /// list_runs (deprecated stub).
    #[tool(
        name = "list_runs",
        description = "list run records (legacy) (deprecated, will be removed in V25 unless ported to native Rust endpoint)"
    )]
    async fn list_runs(&self) -> Result<CallToolResult, ErrorData> {
        ok_text(Ok(tools::params::T2_BODY.to_string()))
    }

    /// get_activity (deprecated stub).
    #[tool(
        name = "get_activity",
        description = "fetch agent activity stream (legacy) (deprecated, will be removed in V25 unless ported to native Rust endpoint)"
    )]
    async fn get_activity(&self) -> Result<CallToolResult, ErrorData> {
        ok_text(Ok(tools::params::T2_BODY.to_string()))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for ControlServer {
    fn get_info(&self) -> ServerInfo {
        // ServerInfo = InitializeResult is #[non_exhaustive] — build via
        // public builder so we can't be broken by future field additions.
        InitializeResult::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                "musu-control",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(
                "musu control plane — exposes T1 native tools that proxy the local musu bridge, \
                 plus T2 legacy stubs that will be removed in V25 unless ported.",
            )
    }
}

/// Convert an `anyhow::Result<String>` tool result into an MCP `CallToolResult`.
/// Per Critic C12 — even when the underlying HTTP call failed, we surface the
/// mapped human string as `Ok(text)`. The ONLY way to get an `Err(ErrorData)`
/// is when we ourselves fail to build the JSON-RPC frame (e.g. `serde_json::to_value`
/// on our own param struct, which is a bug, not a runtime failure mode).
fn ok_text(result: Result<String>) -> Result<CallToolResult, ErrorData> {
    match result {
        Ok(body) => Ok(CallToolResult::success(vec![Content::text(body)])),
        Err(e) => {
            // Bug path: we own this struct, this should be unreachable. Surface
            // as text anyway so Claude Code shows the error instead of dying.
            tracing::error!(error = %e, "control tool bug — wrapped as text");
            Ok(CallToolResult::error(vec![Content::text(format!(
                "musu control internal error: {e}"
            ))]))
        }
    }
}

fn serialize_err(e: serde_json::Error) -> ErrorData {
    ErrorData::internal_error(format!("serialize: {e}"), None)
}

/// Subcommand entrypoint. Wired from `main.rs Cmd::Control`.
pub async fn run() -> Result<()> {
    // C6 (eager init): construct the bridge client BEFORE rmcp serves. If the
    // token can't be resolved, error out with a clear stderr message and
    // NEVER write a byte to stdout — acceptance #11 / `r3_stdout_clean.rs`.
    let bridge = Arc::new(BridgeClient::try_new().context(
        "musu control: failed to initialize bridge client. \
             MCP transport will NOT start.",
    )?);

    let server = ControlServer::new(bridge);

    // C8: dedicated CancellationToken so a future rmcp build that DOESN'T
    // return on stdin EOF still lets us exit on Ctrl-C (or test-supplied
    // cancel). We pass this into `serve_with_ct` so rmcp's own shutdown
    // path also honours it.
    let ct = CancellationToken::new();

    // SIGINT/Ctrl-C watcher. Best-effort — failure to install the hook is
    // not fatal; rmcp's stdin EOF detection is the primary shutdown trigger.
    {
        let ct = ct.clone();
        tokio::spawn(async move {
            if tokio::signal::ctrl_c().await.is_ok() {
                tracing::info!("musu control: SIGINT received, cancelling rmcp service");
                ct.cancel();
            }
        });
    }

    // rmcp's `ServiceExt::serve_with_ct` consumes a transport. `(stdin, stdout)`
    // implements `IntoTransport` for the server role via the
    // `transport-async-rw` feature (pulled in by rmcp's `server` default).
    let transport = (tokio::io::stdin(), tokio::io::stdout());
    let service = server
        .serve_with_ct(transport, ct.clone())
        .await
        .context("rmcp serve failed during MCP initialize handshake")?;

    // service.waiting() resolves when the transport closes (stdin EOF) or
    // the cancellation token trips. C8 belt-and-suspenders is the
    // CancellationToken above.
    let reason = service.waiting().await;

    match reason {
        Ok(quit) => {
            tracing::info!(?quit, "musu control: rmcp service exited cleanly");
            Ok(())
        }
        Err(e) => {
            tracing::warn!(error = %e, "musu control: rmcp service join error");
            // Even a join error is non-fatal from the OS perspective —
            // Claude Code expects exit 0 on clean shutdown.
            Ok(())
        }
    }
}
