//! Tool parameter structs + the T2-deprecation string constants.
//!
//! wiki/493 §3.1 + Critic C10 (LOW):
//!   * `T2_SUFFIX` is a `const &str`. rmcp 1.7's `#[tool(description = ...)]`
//!     macro accepts ONLY literal strings (not `concat!()`), so the macro sites
//!     in `control::mod.rs` carry the same bytes as hand-written literals; the
//!     const exists for the test gate. `r3_mcp_smoke::ends_with_suffix` asserts
//!     every T2 tool's runtime description ends with the const, detecting drift
//!     between the macro-site literal and the canonical suffix.
//!   * `T2_BODY` is the literal stub return value. Acceptance #7.
//!
//! Param schemas use `#[serde(deny_unknown_fields)]` (wiki/493 §4 C6) so a
//! Claude Code typo on a field name fails LOUDLY instead of silently
//! producing a no-op call. `JsonSchema` derive feeds rmcp's tool-input-schema
//! generator.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// T2 description suffix — Critic C10.
///
/// Every deprecated stub tool's `description` ends with EXACTLY this string.
/// Acceptance #8 cross-checks `description.ends_with(T2_SUFFIX)` on every T2
/// tool in the `tools/list` response.
///
/// `#[allow(dead_code)]` because the `#[tool(description = "...")]` macro
/// requires a literal string and cannot reference this const — the literal
/// strings in `control::mod.rs` carry the same bytes and are checked against
/// this const at runtime by `r3_mcp_smoke::ends_with_suffix`. The
/// production binary itself never reads the const; tests + the unit test
/// below do.
#[allow(dead_code)]
pub const T2_SUFFIX: &str =
    " (deprecated, will be removed in V25 unless ported to native Rust endpoint)";

/// T2 body — every deprecated stub returns this literal text. Acceptance #7.
pub const T2_BODY: &str = "endpoint not yet ported to Rust (V25 candidate)";

// ─────────────────────── T1 companies params ───────────────────────

/// Params for `get_company` and `activate_company` (both take a single `id`).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GetCompanyParams {
    /// Company id (uuid or kebab-string). Required.
    pub id: String,
}

/// Params for `create_company`. Mirrors the bridge POST body shape but with
/// only the fields Claude Code reasonably populates from prose. The bridge
/// fills in defaults for `template_key`, `workspace_id`, and `test_cmd`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCompanyParams {
    /// Human-readable company name. Required.
    pub name: String,
    /// Optional explicit id (default: server-generated UUIDv4).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Free-text purpose blurb stored on the company row.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub purpose: Option<String>,
    /// Workspace root path. Defaults to bridge config.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub work_dir: Option<String>,
    /// Shell test command. Defaults to `python -m pytest -q` per R1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub test_cmd: Option<String>,
}

/// Params for `run_company`. Wraps an opaque body so callers can pass through
/// run-time knobs (model, branch, etc.) without us re-validating fields the
/// bridge already validates.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RunCompanyParams {
    /// Company id.
    pub id: String,
    /// Opaque request body forwarded to POST /api/companies/:id/run.
    /// Use `{}` for an empty body.
    #[serde(default = "default_empty_obj")]
    pub body: serde_json::Value,
}

fn default_empty_obj() -> serde_json::Value {
    serde_json::Value::Object(Default::default())
}

// ─────────────────────── T1 tasks params ───────────────────────

/// Params for `delegate_task` — mirrors `bridge::handlers::tasks::DelegateRequest`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DelegateTaskParams {
    /// Routing channel (agent id / pm handle).
    pub channel: String,
    /// Sender agent id (this control session's identity).
    pub sender_id: String,
    /// Task text payload.
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_output: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_sec: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub company_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

/// Params for `cancel_task`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CancelTaskParams {
    /// Task id returned by `delegate_task` (R5).
    pub task_id: String,
}

// ─────────────────────── T1 R4 indexer params ───────────────────────

/// V24-R4 wiki/494 §3 — params for `search_company` MCP tool.
///
/// Proxies `GET /api/index-search?q=&workspace=&scope=&limit=` over the
/// loopback bridge HTTP. The MCP layer adds NO defaults of its own; the
/// bridge handler applies `scope=all` and `limit=20` if absent (matching
/// Python parity bytes).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SearchCompanyParams {
    /// Workspace selector — company id OR company name. Required.
    pub workspace: String,
    /// FTS5 query string. Empty → empty result (Python parity short-circuit).
    pub q: String,
    /// `all` | `code` | `doc`. Advisory in R4; defaults to `all` on the
    /// bridge side when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    /// Result cap. Defaults to 20 on the bridge side when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

// ─────────────────────── T1 KVM Control params ───────────────────────

/// Params for `kvm_control` — Pillar 1 Perfect Butler KVM physical execution.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct KvmControlParams {
    /// Type of action: "mousemove", "mousedown", "mouseup", "keydown", "keyup"
    pub action_type: String,

    /// For mousemove: X coordinate ratio (0.0 to 1.0)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rx: Option<f64>,
    /// For mousemove: Y coordinate ratio (0.0 to 1.0)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ry: Option<f64>,

    /// For mousedown/up: "left", "right", "middle"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub button: Option<String>,

    /// For keydown/up: key name (e.g. "enter", "tab", "super", "a")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}

// ─────────────────────── T2 deprecated params ───────────────────────

/// T2 deprecated `get_agent` takes an agent id we never use (stub body
/// returns `T2_BODY` regardless). We still expose the param so the MCP tool
/// signature matches what V24 V25 would land — that way callers can wire up
/// the call site today and seamlessly switch when the endpoint ports.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GetAgentParams {
    /// Agent id. Currently unused — stub returns `T2_BODY` regardless.
    pub agent_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Compile-time sanity: the T2 suffix begins with a space so concatenation
    /// against any descriptive base (e.g., "list known agents (legacy)") is
    /// safe — no callers must remember to add the separator themselves.
    #[test]
    fn t2_suffix_has_leading_space() {
        assert!(T2_SUFFIX.starts_with(' '));
        assert!(T2_SUFFIX.contains("V25"));
        assert!(T2_SUFFIX.contains("deprecated"));
    }

    /// T2_BODY mentions V25 so an operator who copy-pastes the response into
    /// an issue/PR has the right roadmap anchor.
    #[test]
    fn t2_body_mentions_v25() {
        assert!(T2_BODY.contains("V25"));
        assert!(T2_BODY.contains("Rust"));
    }
}
