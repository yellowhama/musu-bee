//! V28 — setup endpoints so an interactive Claude Code session can configure the
//! fleet through MUSU's MCP tools ("set up my computers") instead of the operator
//! hand-editing bridge.env / running install commands. The exact "MCP inversion"
//! the product thesis is built on, applied to onboarding: the LLM the user
//! already lives in does the setup.
//!
//!   GET  /api/setup/status          — diagnose the environment (what agents are
//!                                      installed, local services, current default)
//!   POST /api/setup/default-adapter — persist MUSU_DEFAULT_ADAPTER to bridge.env

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

#[derive(Debug, Serialize)]
pub struct SetupStatus {
    /// Agent CLIs found on PATH (codex/claude/gemini) — what can run today.
    pub agents_installed: Vec<String>,
    /// Whether a local Ollama server answers on the default port.
    pub ollama_running: bool,
    /// Whether a local ComfyUI server answers on the default port.
    pub comfyui_running: bool,
    /// The current effective default adapter (MUSU_DEFAULT_ADAPTER env, else the
    /// auto-detected choice). What a task with no explicit adapter_type uses.
    pub current_default_adapter: String,
    /// The adapter MUSU would auto-detect right now (codex > claude > echo).
    pub recommended_default_adapter: String,
    /// True when the bridge token is configured (always, post-install).
    pub bridge_token_present: bool,
    /// True when a cloud account token exists (logged in to musu.pro).
    pub account_logged_in: bool,
    /// Human guidance the LLM can relay to the user.
    pub note: String,
}

/// GET /api/setup/status — environment + config snapshot for the LLM to reason
/// about. Read-only.
pub async fn get_setup_status(State(_state): State<AppState>) -> Result<Json<SetupStatus>> {
    let mut agents = Vec::new();
    for stem in ["codex", "claude", "gemini"] {
        if crate::writer::runner::adapter_binary_on_path(stem) {
            agents.push(stem.to_string());
        }
    }

    let ollama_running = http_ok("http://127.0.0.1:11434/api/tags").await;
    let comfyui_running = http_ok("http://127.0.0.1:8188/system_stats").await;

    let current_default = crate::bridge::handlers::tasks::default_adapter_type();
    let recommended = crate::bridge::handlers::tasks::detect_default_adapter().to_string();

    let home = crate::install::resolve_musu_home_from_env().unwrap_or_default();
    let bridge_token_present = crate::install::token::read_bridge_token(&home).is_some();
    let account_logged_in = crate::cloud::token::load_token(&home).is_some();

    let note = if agents.is_empty() && !ollama_running {
        "No external AI agent found. The built-in `echo` adapter works with zero \
         setup; install codex (or run Ollama) and call set_default_adapter to use a \
         real model."
            .to_string()
    } else {
        format!("Ready. Default adapter is `{current_default}`. Recommended: `{recommended}`.")
    };

    Ok(Json(SetupStatus {
        agents_installed: agents,
        ollama_running,
        comfyui_running,
        current_default_adapter: current_default,
        recommended_default_adapter: recommended,
        bridge_token_present,
        account_logged_in,
        note,
    }))
}

/// Quick reachability probe: does a GET to `url` return 2xx within 2s? Used to
/// detect a local Ollama / ComfyUI without depending on their response shape.
async fn http_ok(url: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    matches!(client.get(url).send().await, Ok(r) if r.status().is_success())
}

#[derive(Debug, Deserialize)]
pub struct SetDefaultAdapterRequest {
    /// One of: echo, codex, claude, gemini, openai_compat_local, openai_compat_remote.
    pub adapter: String,
}

#[derive(Debug, Serialize)]
pub struct SetDefaultAdapterResponse {
    pub ok: bool,
    pub adapter: String,
    pub note: String,
}

/// Adapters MUSU can actually run, so we never persist a default that fails.
/// `echo` (in-process) + `shell` (runs a system command) are zero-dependency;
/// the rest need the corresponding agent CLI or a model endpoint.
const KNOWN_ADAPTERS: &[&str] = &[
    "echo",
    "shell",
    "codex",
    "claude",
    "gemini",
    "openai_compat_local",
    "openai_compat_remote",
];

/// Adapters that may be persisted as the FLEET-WIDE DEFAULT. `shell` is
/// deliberately excluded: a default adapter runs for any task that omits
/// `adapter_type`, INCLUDING cross-machine forwarded tasks, and the shell
/// adapter executes the task prompt verbatim via `cmd /C` / `sh -c`. Making
/// `shell` the default would turn ordinary prompt-execution into shell RCE on
/// every forwarded task. `shell` stays dispatchable only via an explicit
/// per-task `adapter_type="shell"`.
const DEFAULTABLE_ADAPTERS: &[&str] = &[
    "echo",
    "codex",
    "claude",
    "gemini",
    "openai_compat_local",
    "openai_compat_remote",
];

/// POST /api/setup/default-adapter — persist `MUSU_DEFAULT_ADAPTER=<adapter>` into
/// `bridge.env` so it survives restarts. The LLM calls this after diagnosing the
/// environment. The change takes effect for the running process immediately (we
/// set the env var) AND on next boot (the file).
pub async fn set_default_adapter(
    State(_state): State<AppState>,
    Json(req): Json<SetDefaultAdapterRequest>,
) -> Result<Json<SetDefaultAdapterResponse>> {
    let adapter = req.adapter.trim().to_string();
    if !KNOWN_ADAPTERS.contains(&adapter.as_str()) {
        return Err(MusuError::BadRequest(format!(
            "unknown adapter {adapter:?}; known: {}",
            KNOWN_ADAPTERS.join(", ")
        )));
    }
    if !DEFAULTABLE_ADAPTERS.contains(&adapter.as_str()) {
        return Err(MusuError::BadRequest(format!(
            "adapter {adapter:?} cannot be the fleet default (it executes commands); \
             dispatch it per-task with adapter_type instead. Defaultable: {}",
            DEFAULTABLE_ADAPTERS.join(", ")
        )));
    }

    let home = crate::install::resolve_musu_home_from_env()
        .map_err(|e| MusuError::Internal(format!("resolve musu home: {e}")))?;

    upsert_bridge_env(&home, "MUSU_DEFAULT_ADAPTER", &adapter)
        .map_err(|e| MusuError::Internal(format!("write bridge.env: {e}")))?;

    // NOTE: we intentionally do NOT std::env::set_var here. Mutating the process
    // environment at request time races std::env::var on the task-spawn hot path
    // (default_adapter_type) under the multi-threaded tokio runtime — concurrent
    // setenv/getenv is UB. The default is persisted to bridge.env and takes
    // effect on the next bridge start.
    Ok(Json(SetDefaultAdapterResponse {
        ok: true,
        adapter: adapter.clone(),
        note: format!(
            "default adapter set to `{adapter}` (persisted to bridge.env, applies on next bridge restart)"
        ),
    }))
}

/// Set `KEY=value` in `<home>/bridge.env`, replacing an existing line or
/// appending. Preserves other lines (e.g. MUSU_BRIDGE_TOKEN). Creates the file if
/// absent. Minimal line-based editor — bridge.env is small and flat.
fn upsert_bridge_env(home: &std::path::Path, key: &str, value: &str) -> std::io::Result<()> {
    let path = home.join("bridge.env");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let prefix = format!("{key}=");
    let mut replaced = false;
    let mut lines: Vec<String> = existing
        .lines()
        .map(|line| {
            let trimmed = line.trim_start();
            let body = trimmed.strip_prefix("export ").unwrap_or(trimmed);
            if body.starts_with(&prefix) {
                replaced = true;
                format!("{key}={value}")
            } else {
                line.to_string()
            }
        })
        .collect();
    if !replaced {
        lines.push(format!("{key}={value}"));
    }
    let mut body = lines.join("\n");
    body.push('\n');
    std::fs::create_dir_all(home)?;
    std::fs::write(&path, body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_bridge_env_replaces_and_appends_preserving_others() {
        let tmp = std::env::temp_dir().join(format!("musu-setup-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();

        // Seed with an existing token line.
        std::fs::write(tmp.join("bridge.env"), "MUSU_BRIDGE_TOKEN=abc123\n").unwrap();

        // Append the adapter.
        upsert_bridge_env(&tmp, "MUSU_DEFAULT_ADAPTER", "codex").unwrap();
        let after = std::fs::read_to_string(tmp.join("bridge.env")).unwrap();
        assert!(after.contains("MUSU_BRIDGE_TOKEN=abc123"));
        assert!(after.contains("MUSU_DEFAULT_ADAPTER=codex"));

        // Replace it (not duplicate).
        upsert_bridge_env(&tmp, "MUSU_DEFAULT_ADAPTER", "echo").unwrap();
        let after2 = std::fs::read_to_string(tmp.join("bridge.env")).unwrap();
        assert!(after2.contains("MUSU_DEFAULT_ADAPTER=echo"));
        assert!(!after2.contains("MUSU_DEFAULT_ADAPTER=codex"));
        assert_eq!(after2.matches("MUSU_DEFAULT_ADAPTER").count(), 1);
        assert!(after2.contains("MUSU_BRIDGE_TOKEN=abc123"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn shell_is_known_but_not_defaultable() {
        // shell must be runnable per-task but never the fleet-wide default,
        // or a forwarded task's prompt would execute as a shell command.
        assert!(KNOWN_ADAPTERS.contains(&"shell"));
        assert!(!DEFAULTABLE_ADAPTERS.contains(&"shell"));
        // every defaultable adapter is also a known adapter
        assert!(DEFAULTABLE_ADAPTERS.iter().all(|a| KNOWN_ADAPTERS.contains(a)));
    }
}
