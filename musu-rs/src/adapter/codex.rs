//! Codex CLI subprocess adapter — V26-W? (additive to trait/registry surface).
//!
//! Registers `"codex"` as an `Adapter`. Unlike `claude.rs` (which reuses
//! `writer/claude.rs::spawn`), codex is a DIFFERENT binary with different
//! args + JSONL semantics, so this adapter drives the generic
//! `adapter/cli_common.rs` plumbing.
//!
//! Spike (2026-06-09, facts): `codex exec --json --skip-git-repo-check [-m MODEL]`,
//! prompt via stdin. Output is JSONL, e.g.:
//!   {"type":"thread.started","thread_id":"..."}
//!   {"type":"turn.started"}
//!   {"type":"error","message":"..."}
//!   {"type":"turn.failed","error":{"message":"..."}}
//! Success path (REAL, captured 2026-06-12 from `codex.cmd exec --json`):
//!   {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hi."}}
//!   {"type":"turn.completed","usage":{"input_tokens":18835,"output_tokens":76,...}}
//! Assistant text is at `item.text` (nested) for item.type=="agent_message".
//! Unknown `type` lines are tolerated (ignored), never crash.
//! `--skip-git-repo-check` is a FIXED arg (codex requires a trusted/git dir).
//! stderr emits a benign "rmcp serde error" line — drained, never parsed.

use super::cli_common::{self, CliOutcome, CliSpawnSpec, LineSink};
use super::{Adapter, AdapterContext, AdapterError, AdapterResult, UsageSummary};
use async_trait::async_trait;
use serde_json::Value;
use std::path::PathBuf;
use std::time::Duration;

/// Operator-env override for the codex binary. Default `"codex"`.
/// Operator-env-ONLY (critique M1): never read from ctx.extra/config/payload.
const CODEX_BINARY_ENV: &str = "MUSU_CODEX_BINARY";
const DEFAULT_CODEX_BINARY: &str = "codex";

pub struct CodexAdapter;

/// Resolve the codex binary: explicit `MUSU_CODEX_BINARY` env wins (M1);
/// otherwise resolve `codex` to a directly-runnable path on this platform
/// (`…/codex.cmd` on Windows, where the bare `codex` npm shim is NOT
/// CreateProcess-runnable — the cause of "model unavailable" before V28).
fn resolve_binary() -> String {
    std::env::var(CODEX_BINARY_ENV)
        .unwrap_or_else(|_| crate::writer::runner::resolve_agent_binary(DEFAULT_CODEX_BINARY))
}

/// Build argv for `codex exec --json --skip-git-repo-check [-m MODEL]`.
fn build_args(model: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "exec".into(),
        "--json".into(),
        "--skip-git-repo-check".into(),
    ];
    if let Some(m) = model {
        args.push("-m".into());
        args.push(m.to_string());
    }
    args
}

/// Accumulates codex JSONL output into final text/usage/session/error state.
#[derive(Default)]
pub struct CodexSink {
    pub accumulated: String,
    pub result_text: Option<String>,
    pub session_id: Option<String>,
    pub usage: Option<UsageSummary>,
    pub error_message: Option<String>,
}

impl CodexSink {
    fn push_text(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        if !self.accumulated.is_empty() {
            self.accumulated.push('\n');
        }
        self.accumulated.push_str(text);
    }
}

impl LineSink for CodexSink {
    /// Map one codex JSONL line to accumulated state. Returns true on error.
    /// Tolerates blank/unknown/unparseable lines (ignored — never crash).
    fn on_line(&mut self, line: &str) -> bool {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return false;
        }
        let v: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                // Tolerate unparseable line (codex may interleave non-JSON);
                // log + skip rather than crash.
                tracing::warn!(error = %e, line = %trimmed, "codex JSONL parse error; skipping");
                return false;
            }
        };
        let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match typ {
            // {"type":"thread.started","thread_id":"..."} — capture session.
            "thread.started" => {
                if let Some(id) = v.get("thread_id").and_then(|x| x.as_str()) {
                    self.session_id = Some(id.to_string());
                }
                false
            }
            // {"type":"turn.started"} — no-op.
            "turn.started" => false,
            // {"type":"error","message":"..."} — provider error.
            "error" => {
                let msg = v
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("codex error (no message)")
                    .to_string();
                self.error_message = Some(msg);
                true
            }
            // {"type":"turn.failed","error":{"message":"..."}} — provider error.
            "turn.failed" => {
                let msg = v
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("codex turn failed (no message)")
                    .to_string();
                self.error_message = Some(msg);
                true
            }
            // {"type":"turn.completed", ...usage...} — ASSUMED success/usage
            // shape (not spike-captured). We defensively look for a `usage`
            // object with prompt/completion/total token fields and tolerate
            // its absence (usage stays None — no crash).
            "turn.completed" => {
                if let Some(u) = v.get("usage") {
                    self.usage = Some(parse_codex_usage(u));
                }
                false
            }
            // item.* — assistant message. REAL shape (captured 2026-06-12 from
            // `codex.cmd exec --json`):
            //   {"type":"item.completed","item":{"id":"item_0",
            //    "type":"agent_message","text":"Hi."}}
            // The assistant text is at `item.text` (nested), only for
            // item.type == "agent_message". Earlier code looked at the TOP level
            // and never found it → empty result. Now correct.
            t if t.starts_with("item") => {
                if let Some(text) = extract_item_text(&v) {
                    self.push_text(&text);
                }
                false
            }
            // Unknown type — tolerate (Ignored), do NOT crash.
            _ => false,
        }
    }
}

/// Extract assistant text from a codex `item.*` line. REAL shape (2026-06-12
/// capture): text lives at `item.text` when `item.type == "agent_message"`.
/// Falls back to legacy top-level / content-array locations defensively so a
/// future codex format tweak degrades rather than crashes.
fn extract_item_text(v: &Value) -> Option<String> {
    // Canonical: v.item with type=="agent_message", text=...
    if let Some(item) = v.get("item") {
        let is_agent_msg = item.get("type").and_then(|t| t.as_str()) == Some("agent_message");
        if is_agent_msg {
            if let Some(s) = item.get("text").and_then(|x| x.as_str()) {
                if !s.is_empty() {
                    return Some(s.to_string());
                }
            }
        }
        // Other item types (reasoning, tool calls) carry no user-facing text.
        if item.get("type").is_some() {
            return None;
        }
    }
    // Legacy/defensive fallbacks (top-level text/message/content).
    if let Some(s) = v.get("text").and_then(|x| x.as_str()) {
        return Some(s.to_string());
    }
    if let Some(s) = v.get("message").and_then(|x| x.as_str()) {
        return Some(s.to_string());
    }
    match v.get("content") {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Array(blocks)) => {
            let joined: String = blocks
                .iter()
                .filter_map(|b| b.get("text").and_then(|x| x.as_str()))
                .collect::<Vec<_>>()
                .join("");
            if joined.is_empty() {
                None
            } else {
                Some(joined)
            }
        }
        _ => None,
    }
}

/// Parse a codex `usage` object into `UsageSummary`. ASSUMED field names
/// (not spike-captured): tolerate both OpenAI-style
/// (`input_tokens`/`output_tokens`/`total_tokens`) and
/// (`prompt_tokens`/`completion_tokens`).
fn parse_codex_usage(u: &Value) -> UsageSummary {
    let prompt = u
        .get("input_tokens")
        .or_else(|| u.get("prompt_tokens"))
        .and_then(|x| x.as_u64())
        .map(|n| n as u32);
    let completion = u
        .get("output_tokens")
        .or_else(|| u.get("completion_tokens"))
        .and_then(|x| x.as_u64())
        .map(|n| n as u32);
    let total = u
        .get("total_tokens")
        .and_then(|x| x.as_u64())
        .map(|n| n as u32)
        .or_else(|| match (prompt, completion) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        });
    UsageSummary {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: total,
    }
}

#[async_trait]
impl Adapter for CodexAdapter {
    async fn execute(&self, ctx: &AdapterContext) -> Result<AdapterResult, AdapterError> {
        let model = ctx
            .config_json
            .get("model")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let timeout = ctx
            .config_json
            .get("timeout_sec")
            .and_then(|v| v.as_u64())
            .map(Duration::from_secs);
        let company_id = ctx
            .config_json
            .get("company_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let cwd = ctx
            .cwd
            .clone()
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| PathBuf::from("."));

        let spec = CliSpawnSpec {
            command: resolve_binary(),
            args: build_args(model.as_deref()),
            prompt: ctx.prompt.clone(),
            prompt_via_stdin: true,
            cwd,
            task_id: ctx.run_id.clone(),
            agent_id: Some(ctx.agent_id.clone()),
            run_id: ctx.session_id.clone(),
            company_id,
        };

        let mut handle = match cli_common::spawn(&spec).await {
            Ok(h) => h,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(AdapterError::ModelUnavailable);
            }
            Err(e) => return Err(AdapterError::Unknown(format!("codex spawn failed: {e}"))),
        };

        let mut reader = match cli_common::buffered_stdout(&mut handle.child) {
            Some(r) => r,
            None => {
                let _ = handle.child.kill().await;
                return Err(AdapterError::Unknown(
                    "codex child had no stdout pipe".into(),
                ));
            }
        };

        let mut sink = CodexSink::default();
        let outcome = cli_common::stream_until_done(
            &mut reader,
            &mut sink,
            ctx.cancel.clone(),
            timeout,
            ctx.deadline_unix_ms,
        )
        .await;

        finalize(&mut handle, outcome, sink, ctx.session_id.clone()).await
    }
}

/// Reap the child + map outcome → AdapterResult/AdapterError.
async fn finalize(
    handle: &mut cli_common::CliChild,
    outcome: CliOutcome,
    sink: CodexSink,
    ctx_session: Option<String>,
) -> Result<AdapterResult, AdapterError> {
    match outcome {
        CliOutcome::Done { had_error } => {
            let exit = tokio::time::timeout(Duration::from_secs(5), handle.child.wait())
                .await
                .ok()
                .and_then(|r| r.ok());
            let code = exit.and_then(|s| s.code()).unwrap_or(0);

            if had_error {
                let msg = sink
                    .error_message
                    .clone()
                    .unwrap_or_else(|| "codex reported an error".into());
                return Err(AdapterError::Unknown(msg));
            }
            if code != 0 {
                // Non-zero exit with no result line: fold last stderr in so
                // failures aren't silent (critique L-E1).
                let stderr_tail = handle
                    .last_stderr
                    .lock()
                    .ok()
                    .and_then(|g| g.clone())
                    .unwrap_or_default();
                return Err(AdapterError::Unknown(format!(
                    "codex exited code {code}; stderr: {stderr_tail}"
                )));
            }

            let session_id = sink.session_id.clone().or(ctx_session);
            let summary = sink.result_text.clone().unwrap_or(sink.accumulated);
            Ok(AdapterResult {
                success: true,
                summary,
                session_id,
                usage: sink.usage,
                error_code: None,
            })
        }
        CliOutcome::Cancelled => {
            kill(handle).await;
            Err(AdapterError::Unknown("cancelled by operator".into()))
        }
        CliOutcome::Timeout => {
            kill(handle).await;
            Err(AdapterError::Timeout)
        }
        CliOutcome::IoError(e) => {
            kill(handle).await;
            Err(AdapterError::Unknown(format!(
                "codex stdout read error: {e}"
            )))
        }
    }
}

async fn kill(handle: &mut cli_common::CliChild) {
    let pid = handle.child.id();
    crate::writer::runner::graceful_kill(&mut handle.child, pid).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_args_includes_fixed_skip_git_repo_check() {
        let args = build_args(None);
        assert_eq!(args[0], "exec");
        assert!(args.contains(&"--json".to_string()));
        assert!(
            args.contains(&"--skip-git-repo-check".to_string()),
            "--skip-git-repo-check is a FIXED arg (spike: codex requires trusted/git dir)"
        );
        assert!(!args.contains(&"-m".to_string()));
    }

    #[test]
    fn build_args_appends_model() {
        let args = build_args(Some("o4-mini"));
        let idx = args.iter().position(|a| a == "-m").expect("-m present");
        assert_eq!(args[idx + 1], "o4-mini");
    }

    #[test]
    fn resolve_binary_env_override_wins() {
        // Explicit MUSU_CODEX_BINARY wins verbatim (M1).
        std::env::set_var(CODEX_BINARY_ENV, "/custom/codex-path");
        assert_eq!(resolve_binary(), "/custom/codex-path");
        std::env::remove_var(CODEX_BINARY_ENV);
        // Fallback resolves to a runnable codex on PATH (…/codex.cmd on Windows)
        // or the bare stem if absent; either way it ends in the codex stem.
        let resolved = resolve_binary();
        assert!(
            resolved == "codex"
                || resolved.to_lowercase().contains("codex"),
            "unexpected codex resolution: {resolved}"
        );
    }

    // --- Spike-line parser tests (REAL captured spike lines, 2026-06-09) ---

    #[test]
    fn parses_thread_started_as_session() {
        let mut sink = CodexSink::default();
        // Spike line.
        let err = sink.on_line(r#"{"type":"thread.started","thread_id":"th-abc-123"}"#);
        assert!(!err);
        assert_eq!(sink.session_id.as_deref(), Some("th-abc-123"));
    }

    /// REAL `codex.cmd exec --json` output captured 2026-06-12: the assistant
    /// text is at `item.text` for `item.type == "agent_message"`. This was the
    /// "codex runs but output is empty" bug — the parser looked top-level.
    #[test]
    fn captures_agent_message_text_from_item_completed() {
        let mut sink = CodexSink::default();
        sink.on_line(r#"{"type":"thread.started","thread_id":"t1"}"#);
        sink.on_line(r#"{"type":"turn.started"}"#);
        sink.on_line(
            r#"{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hi."}}"#,
        );
        sink.on_line(
            r#"{"type":"turn.completed","usage":{"input_tokens":18835,"output_tokens":76}}"#,
        );
        assert_eq!(sink.accumulated, "Hi.");
        let u = sink.usage.expect("usage parsed");
        assert_eq!(u.prompt_tokens, Some(18835));
        assert_eq!(u.completion_tokens, Some(76));
    }

    /// A non-message item (e.g. reasoning) carries no user-facing text.
    #[test]
    fn ignores_non_agent_message_items() {
        let mut sink = CodexSink::default();
        sink.on_line(
            r#"{"type":"item.completed","item":{"id":"r0","type":"reasoning","text":"thinking..."}}"#,
        );
        assert!(sink.accumulated.is_empty());
    }

    #[test]
    fn turn_started_is_noop() {
        let mut sink = CodexSink::default();
        // Spike line.
        let err = sink.on_line(r#"{"type":"turn.started"}"#);
        assert!(!err);
        assert!(sink.accumulated.is_empty());
        assert!(sink.error_message.is_none());
    }

    #[test]
    fn parses_error_line_sets_had_error_and_message() {
        let mut sink = CodexSink::default();
        // Spike line.
        let err = sink.on_line(r#"{"type":"error","message":"usage limit reached"}"#);
        assert!(err, "error line must flag had_error");
        assert_eq!(sink.error_message.as_deref(), Some("usage limit reached"));
    }

    #[test]
    fn parses_turn_failed_nested_error_message() {
        let mut sink = CodexSink::default();
        // Spike line.
        let err = sink.on_line(r#"{"type":"turn.failed","error":{"message":"model overloaded"}}"#);
        assert!(err, "turn.failed must flag had_error");
        assert_eq!(sink.error_message.as_deref(), Some("model overloaded"));
    }

    #[test]
    fn tolerates_unknown_type_without_crash() {
        let mut sink = CodexSink::default();
        let err = sink.on_line(r#"{"type":"some.future.event","foo":"bar"}"#);
        assert!(!err);
        assert!(sink.accumulated.is_empty());
        assert!(sink.error_message.is_none());
    }

    #[test]
    fn tolerates_blank_and_garbage_lines() {
        let mut sink = CodexSink::default();
        assert!(!sink.on_line("   "));
        assert!(!sink.on_line("not json at all"));
        assert!(sink.error_message.is_none());
    }

    #[test]
    fn assumed_item_text_accumulates() {
        // ASSUMED success shape (NOT spike-captured): item.* carries text.
        let mut sink = CodexSink::default();
        sink.on_line(r#"{"type":"item.completed","text":"hello"}"#);
        sink.on_line(r#"{"type":"item.completed","text":"world"}"#);
        assert_eq!(sink.accumulated, "hello\nworld");
    }

    #[test]
    fn assumed_turn_completed_usage_maps() {
        // ASSUMED usage shape (NOT spike-captured).
        let mut sink = CodexSink::default();
        sink.on_line(
            r#"{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":8,"total_tokens":20}}"#,
        );
        let u = sink.usage.expect("usage parsed");
        assert_eq!(u.prompt_tokens, Some(12));
        assert_eq!(u.completion_tokens, Some(8));
        assert_eq!(u.total_tokens, Some(20));
    }
}
