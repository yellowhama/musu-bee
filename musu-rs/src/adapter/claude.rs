//! Claude subprocess shim — V26-W1 Commit 3 (wiki/509).
//!
//! Registers `"claude"` as an `Adapter` so `registry::dispatch` is uniform
//! across providers. The shim is **thin**: every subprocess concern
//! (`Command::new`, env build, platform configure, kill semantics) re-uses
//! V24-R5 SHIP helpers under `writer/claude.rs` + `writer/runner.rs`.
//!
//! Two integration surfaces (detail plan §4.2):
//!
//! 1. `Adapter::execute(&ctx)` — registry-callable. Builds a `SpawnSpec`
//!    from `AdapterContext`, calls `claude::spawn`, drains stream, returns
//!    `AdapterResult`. Used by future W9/W13 downstream tooling that needs
//!    a uniform `execute()` surface across providers.
//! 2. `build_spawn_spec(ctx, default_command)` — runner-callable. Returns a
//!    `SpawnSpec` so `writer/runner.rs`'s existing stream loop, admission
//!    accounting, SSE publish, and finalize flow stay bit-for-bit identical
//!    to V24-R5 SHIP. **The runner hot path actually used by
//!    `bridge/handlers/{tasks,run}.rs` still routes through this surface
//!    via `claude_dispatch_spawn()` in `writer/runner.rs`.**
//!
//! Anti-pattern (forbidden per detail plan §3 R1 + §13): re-implementing
//! `Command::new("claude")` here. The shim **calls** `claude::spawn`.

use super::{Adapter, AdapterContext, AdapterError, AdapterResult};
use crate::writer::claude::{self, ClaudeEvent, SpawnSpec};
use async_trait::async_trait;
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// Default claude CLI binary name when `AdapterContext.extra["claude_binary"]`
/// is absent. Mirrors `writer/runner.rs`'s `MUSU_CLAUDE_BINARY` fallback at
/// runner-construction time (but the runner-callable path uses
/// `Inner.claude_command`; this default only applies to the
/// registry-callable `execute()` path).
const DEFAULT_CLAUDE_BINARY: &str = "claude";

/// Per-iteration read timeout for the shim's stream loop. Matches the
/// runner's per-iteration 500ms polling cadence at `writer/runner.rs:503`
/// so cancel + deadline checks happen on the same beat.
const PER_ITER_TIMEOUT: Duration = Duration::from_millis(500);

/// Zero-state shim. The registry stores `Box<dyn Adapter>` and only needs
/// the impl, so the struct holds no fields.
pub struct ClaudeAdapter;

/// Build a `SpawnSpec` from `AdapterContext` per detail plan §4.3 mapping
/// table. Public so `writer/runner.rs::claude_dispatch_spawn` can reuse
/// the same logic in the registry-callable path if it ever switches over.
///
/// `default_command` is the binary name to spawn; callers pass the
/// `MUSU_CLAUDE_BINARY`-resolved value (runner uses `Inner.claude_command`;
/// shim falls back to `DEFAULT_CLAUDE_BINARY` when `extra["claude_binary"]`
/// is absent).
#[allow(dead_code)] // M3 (W12) will route `runner::claude_dispatch_spawn` through this.
pub fn build_spawn_spec(ctx: &AdapterContext, default_command: &str) -> SpawnSpec {
    let cwd = ctx
        .cwd
        .clone()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));

    let model = ctx
        .config_json
        .get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let timeout_sec = ctx
        .config_json
        .get("timeout_sec")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);
    let company_id = ctx
        .config_json
        .get("company_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            ctx.extra
                .get("company_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });
    let command = ctx
        .extra
        .get("claude_binary")
        .and_then(|v| v.as_str())
        .unwrap_or(default_command)
        .to_string();

    SpawnSpec {
        command,
        task_id: ctx.run_id.clone(),
        prompt: ctx.prompt.clone(),
        cwd,
        model,
        timeout_sec,
        company_id,
        agent_id: Some(ctx.agent_id.clone()),
        run_id: ctx.session_id.clone(),
    }
}

#[async_trait]
impl Adapter for ClaudeAdapter {
    async fn execute(&self, ctx: &AdapterContext) -> Result<AdapterResult, AdapterError> {
        let spec = build_spawn_spec(ctx, DEFAULT_CLAUDE_BINARY);

        // Spawn — map io::ErrorKind::NotFound to ModelUnavailable per
        // detail plan §4.5 (retriable so operator-fix loop works).
        let mut child = match claude::spawn(&spec).await {
            Ok(c) => c,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(AdapterError::ModelUnavailable);
            }
            Err(e) => {
                return Err(AdapterError::Unknown(format!("spawn failed: {e}")));
            }
        };
        let pid = child.id();

        // Pull buffered stdout (Critic C5: 64KB BufReader for >50KB lines).
        let mut reader = match claude::buffered_stdout(&mut child) {
            Some(r) => r,
            None => {
                let _ = child.kill().await;
                return Err(AdapterError::Unknown(
                    "claude child had no stdout pipe".into(),
                ));
            }
        };

        let timeout = spec.timeout_sec.map(|s| Duration::from_secs(s as u64));
        let outcome = stream_until_done(
            &mut reader,
            ctx.cancel.clone(),
            timeout,
            ctx.deadline_unix_ms,
        )
        .await;

        // Reap subprocess based on outcome, mirroring runner.rs:361-392.
        match outcome {
            ShimOutcome::Done {
                accumulated,
                result_text,
                had_error,
            } => {
                let exit = tokio::time::timeout(Duration::from_secs(5), child.wait())
                    .await
                    .ok()
                    .and_then(|r| r.ok());
                let code = exit.and_then(|s| s.code()).unwrap_or(0);
                if had_error || code != 0 {
                    return Err(AdapterError::Unknown(format!(
                        "claude exited code {code}; had_error={had_error}"
                    )));
                }
                let summary = result_text.unwrap_or(accumulated);
                Ok(AdapterResult {
                    success: true,
                    summary,
                    session_id: ctx.session_id.clone(),
                    usage: None,
                    error_code: None,
                })
            }
            ShimOutcome::Cancelled => {
                // Per detail plan §3 R6: re-use runner::graceful_kill rather
                // than duplicating kill logic. graceful_kill is elevated to
                // pub(crate) in M1 (Critic HIGH-2).
                crate::writer::runner::graceful_kill(&mut child, pid).await;
                // Per detail plan §4.5: AdapterError has no Cancelled variant
                // (Critic C5 lock — exactly 5 variants); use Unknown with the
                // canonical message that mirrors runner.rs:379.
                Err(AdapterError::Unknown("cancelled by operator".into()))
            }
            ShimOutcome::Timeout => {
                crate::writer::runner::graceful_kill(&mut child, pid).await;
                Err(AdapterError::Timeout)
            }
            ShimOutcome::IoError(e) => {
                crate::writer::runner::graceful_kill(&mut child, pid).await;
                Err(AdapterError::Unknown(format!("stdout read error: {e}")))
            }
        }
    }
}

/// Result of draining the shim's stream loop. Mirrors runner.rs `StreamOutcome`
/// but carries the accumulated text so the caller can wrap into `AdapterResult`.
enum ShimOutcome {
    Done {
        accumulated: String,
        result_text: Option<String>,
        had_error: bool,
    },
    Cancelled,
    Timeout,
    IoError(std::io::Error),
}

/// Drive claude's stdout line-by-line, honoring per-iter cancel + deadline.
///
/// Mirrors `writer/runner.rs::stream_until_done` shape (per-iter `tokio::select!`
/// on cancel + bounded `tokio::time::timeout`) so behavior is consistent with
/// the runner-callable surface (detail plan §4.6 contract).
async fn stream_until_done(
    reader: &mut tokio::io::BufReader<tokio::process::ChildStdout>,
    cancel: Option<std::sync::Arc<tokio::sync::Notify>>,
    timeout: Option<Duration>,
    deadline_unix_ms: Option<u64>,
) -> ShimOutcome {
    let mut line_buf = String::new();
    let mut accumulated: String = String::new();
    let mut result_text: Option<String> = None;
    let mut had_error: bool = false;

    let mono_deadline = timeout.map(|t| Instant::now() + t);
    loop {
        // Soft deadline check (W12 preempt slot).
        if let Some(deadline_ms) = deadline_unix_ms {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            if now_ms >= deadline_ms {
                return ShimOutcome::Timeout;
            }
        }

        let remaining = match mono_deadline {
            Some(d) => {
                let now = Instant::now();
                if now >= d {
                    return ShimOutcome::Timeout;
                }
                Some(d - now)
            }
            None => None,
        };
        let per_iter = remaining.unwrap_or(PER_ITER_TIMEOUT);

        line_buf.clear();
        let read_fut = claude::next_event(reader, &mut line_buf);

        let result = if let Some(cancel) = cancel.as_ref() {
            tokio::select! {
                biased;
                _ = cancel.notified() => return ShimOutcome::Cancelled,
                r = tokio::time::timeout(per_iter, read_fut) => r,
            }
        } else {
            tokio::time::timeout(per_iter, read_fut).await
        };

        match result {
            Err(_) => {
                // Per-iter timeout: if we had a real deadline, that's a hard
                // timeout; otherwise loop and re-check cancel + deadline.
                if remaining.is_some() {
                    return ShimOutcome::Timeout;
                }
                continue;
            }
            Ok(Ok(None)) => {
                return ShimOutcome::Done {
                    accumulated,
                    result_text,
                    had_error,
                };
            }
            Ok(Ok(Some(Ok(ev)))) => {
                handle_event(ev, &mut accumulated, &mut result_text, &mut had_error);
            }
            Ok(Ok(Some(Err(e)))) => {
                tracing::warn!(
                    error = %e,
                    line = %line_buf.trim(),
                    "stream-json parse error in ClaudeAdapter shim; skipping line"
                );
            }
            Ok(Err(e)) => return ShimOutcome::IoError(e),
        }
    }
}

/// Local copy of `writer/runner.rs::handle_event` accumulation behavior.
/// Kept here rather than re-exported to avoid widening the runner module's
/// public surface for a single shim call site. Behavior must mirror
/// runner.rs:536-564 exactly (Critic C1 / detail plan §14 Q1).
fn handle_event(
    ev: ClaudeEvent,
    accumulated: &mut String,
    result_text: &mut Option<String>,
    had_error: &mut bool,
) {
    match ev {
        ClaudeEvent::Init { .. } => {}
        ClaudeEvent::Assistant { text } => {
            if !text.is_empty() {
                if !accumulated.is_empty() {
                    accumulated.push('\n');
                }
                accumulated.push_str(&text);
            }
        }
        ClaudeEvent::Result {
            text,
            cost_usd: _,
            is_error,
        } => {
            if is_error {
                *had_error = true;
            }
            *result_text = text;
        }
        ClaudeEvent::Other => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::AdapterContext;
    use serde_json::json;
    use std::path::PathBuf;

    fn ctx(extra: serde_json::Value, config: serde_json::Value) -> AdapterContext {
        AdapterContext {
            run_id: "task-abc".into(),
            prompt: "hello".into(),
            agent_id: "agent-1".into(),
            adapter_type: "claude".into(),
            config_json: config,
            session_id: Some("sess-xyz".into()),
            cwd: Some(PathBuf::from("/tmp/x")),
            deadline_unix_ms: None,
            cancel: None,
            extra,
        }
    }

    #[test]
    fn claude_adapter_builds_spawn_spec_from_context() {
        let c = ctx(
            json!({ "claude_binary": "/usr/local/bin/claude-custom" }),
            json!({ "model": "claude-sonnet-4-5", "timeout_sec": 60, "company_id": "co-7" }),
        );
        let spec = build_spawn_spec(&c, "claude");
        assert_eq!(spec.command, "/usr/local/bin/claude-custom");
        assert_eq!(spec.task_id, "task-abc");
        assert_eq!(spec.prompt, "hello");
        assert_eq!(spec.cwd, PathBuf::from("/tmp/x"));
        assert_eq!(spec.model.as_deref(), Some("claude-sonnet-4-5"));
        assert_eq!(spec.timeout_sec, Some(60));
        assert_eq!(spec.company_id.as_deref(), Some("co-7"));
        assert_eq!(spec.agent_id.as_deref(), Some("agent-1"));
        assert_eq!(spec.run_id.as_deref(), Some("sess-xyz"));
    }

    #[test]
    fn claude_adapter_default_command_when_extra_missing() {
        let c = ctx(serde_json::Value::Null, json!({}));
        let spec = build_spawn_spec(&c, "claude");
        assert_eq!(
            spec.command, "claude",
            "absent extra.claude_binary should fall back to default_command"
        );
        assert!(spec.model.is_none());
        assert!(spec.timeout_sec.is_none());
        assert!(spec.company_id.is_none());
    }

    #[test]
    fn claude_adapter_company_id_falls_back_to_extra() {
        // config_json has no company_id; extra does → extra wins.
        let c = ctx(
            json!({ "company_id": "extra-co" }),
            json!({ "model": "claude-3-5-sonnet" }),
        );
        let spec = build_spawn_spec(&c, "claude");
        assert_eq!(spec.company_id.as_deref(), Some("extra-co"));
    }
}
