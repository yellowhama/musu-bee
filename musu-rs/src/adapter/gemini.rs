//! Gemini CLI subprocess adapter — V26-W? (additive to trait/registry surface).
//!
//! Registers `"gemini"` as an `Adapter`, driving the generic
//! `adapter/cli_common.rs` plumbing (not `writer/claude.rs::spawn`).
//!
//! Spike (2026-06-09, facts): `gemini -p "PROMPT" -o stream-json [-m MODEL]`.
//! Prompt goes via the `-p` ARG (spike), so `prompt_via_stdin = false`.
//! Output is JSONL:
//!   {"type":"init","session_id":"...","model":"..."}
//!   {"type":"message","role":"user","content":"..."}
//!   {"type":"message","role":"assistant","content":"hi","delta":true}
//!   {"type":"result","status":"success","stats":{"output_tokens":29,"input_tokens":...}}
//! These shapes ARE spike-confirmed. stderr emits "True color"/"Ripgrep"
//! warnings — drained, never parsed. assistant `message` lines carry text
//! (delta or full) and are accumulated; `result.stats` → UsageSummary
//! (critique H-A1: don't drop usage); `result.status != "success"` → error.

use super::cli_common::{self, CliOutcome, CliSpawnSpec, LineSink};
use super::{Adapter, AdapterContext, AdapterError, AdapterResult, UsageSummary};
use async_trait::async_trait;
use serde_json::Value;
use std::path::PathBuf;
use std::time::Duration;

/// Operator-env override for the gemini binary. Default `"gemini"`.
/// Operator-env-ONLY (critique M1): never read from ctx.extra/config/payload.
const GEMINI_BINARY_ENV: &str = "MUSU_GEMINI_BINARY";
const DEFAULT_GEMINI_BINARY: &str = "gemini";

pub struct GeminiAdapter;

fn resolve_binary() -> String {
    std::env::var(GEMINI_BINARY_ENV)
        .unwrap_or_else(|_| crate::writer::runner::resolve_agent_binary(DEFAULT_GEMINI_BINARY))
}

/// Build argv for `gemini -p PROMPT -o stream-json [-m MODEL]`.
/// Prompt is passed via `-p` (spike), NOT stdin.
fn build_args(prompt: &str, model: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-p".into(),
        prompt.to_string(),
        "-o".into(),
        "stream-json".into(),
    ];
    if let Some(m) = model {
        args.push("-m".into());
        args.push(m.to_string());
    }
    args
}

/// Accumulates gemini JSONL output into final text/usage/session/error state.
#[derive(Default)]
pub struct GeminiSink {
    pub accumulated: String,
    pub session_id: Option<String>,
    pub usage: Option<UsageSummary>,
    pub error_message: Option<String>,
}

impl LineSink for GeminiSink {
    /// Map one gemini JSONL line to accumulated state. Returns true on error.
    /// Tolerates blank/unknown/unparseable lines (ignored — never crash).
    fn on_line(&mut self, line: &str) -> bool {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return false;
        }
        let v: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(error = %e, line = %trimmed, "gemini JSONL parse error; skipping");
                return false;
            }
        };
        let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match typ {
            // {"type":"init","session_id":"...","model":"..."}
            "init" => {
                if let Some(id) = v.get("session_id").and_then(|x| x.as_str()) {
                    self.session_id = Some(id.to_string());
                }
                false
            }
            // {"type":"message","role":"assistant","content":"hi","delta":true}
            // Only accumulate assistant content (skip the echoed user message).
            "message" => {
                let role = v.get("role").and_then(|x| x.as_str()).unwrap_or("");
                if role == "assistant" {
                    if let Some(content) = v.get("content").and_then(|x| x.as_str()) {
                        // delta:true → token chunk (concatenate, no newline);
                        // delta absent/false → full message (treat the same —
                        // concatenation of a single full chunk is identity).
                        self.accumulated.push_str(content);
                    }
                }
                false
            }
            // {"type":"result","status":"success","stats":{...}}
            "result" => {
                let status = v.get("status").and_then(|x| x.as_str()).unwrap_or("");
                if let Some(stats) = v.get("stats") {
                    self.usage = Some(parse_gemini_stats(stats));
                }
                if status != "success" {
                    self.error_message = Some(format!("gemini result status: {status}"));
                    return true;
                }
                false
            }
            // Unknown type — tolerate (Ignored), do NOT crash.
            _ => false,
        }
    }
}

/// Map gemini `stats` → `UsageSummary` (critique H-A1: don't drop usage).
/// Spike fields: `output_tokens`, `input_tokens`.
fn parse_gemini_stats(stats: &Value) -> UsageSummary {
    let prompt = stats
        .get("input_tokens")
        .and_then(|x| x.as_u64())
        .map(|n| n as u32);
    let completion = stats
        .get("output_tokens")
        .and_then(|x| x.as_u64())
        .map(|n| n as u32);
    let total = stats
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
impl Adapter for GeminiAdapter {
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
            args: build_args(&ctx.prompt, model.as_deref()),
            prompt: ctx.prompt.clone(),
            // gemini takes the prompt via `-p` arg, not stdin (spike).
            prompt_via_stdin: false,
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
            Err(e) => return Err(AdapterError::Unknown(format!("gemini spawn failed: {e}"))),
        };

        let mut reader = match cli_common::buffered_stdout(&mut handle.child) {
            Some(r) => r,
            None => {
                let _ = handle.child.kill().await;
                return Err(AdapterError::Unknown(
                    "gemini child had no stdout pipe".into(),
                ));
            }
        };

        let mut sink = GeminiSink::default();
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

async fn finalize(
    handle: &mut cli_common::CliChild,
    outcome: CliOutcome,
    sink: GeminiSink,
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
                    .unwrap_or_else(|| "gemini reported an error".into());
                return Err(AdapterError::Unknown(msg));
            }
            if code != 0 {
                let stderr_tail = handle
                    .last_stderr
                    .lock()
                    .ok()
                    .and_then(|g| g.clone())
                    .unwrap_or_default();
                return Err(AdapterError::Unknown(format!(
                    "gemini exited code {code}; stderr: {stderr_tail}"
                )));
            }

            let session_id = sink.session_id.clone().or(ctx_session);
            // Exit 0 with no assistant text is the "ran but empty" regression:
            // surface it as a failure with stderr rather than a clean success.
            if sink.accumulated.trim().is_empty() {
                let stderr_tail = handle
                    .last_stderr
                    .lock()
                    .ok()
                    .and_then(|g| g.clone())
                    .unwrap_or_default();
                return Err(AdapterError::Unknown(format!(
                    "gemini completed with no output (exit 0, no assistant text parsed); stderr: {stderr_tail}"
                )));
            }
            Ok(AdapterResult {
                success: true,
                summary: sink.accumulated,
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
                "gemini stdout read error: {e}"
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
    fn build_args_uses_p_and_stream_json() {
        let args = build_args("say hi", None);
        let p_idx = args.iter().position(|a| a == "-p").expect("-p present");
        assert_eq!(args[p_idx + 1], "say hi", "prompt via -p arg (spike)");
        let o_idx = args.iter().position(|a| a == "-o").expect("-o present");
        assert_eq!(args[o_idx + 1], "stream-json");
        assert!(!args.contains(&"-m".to_string()));
    }

    #[test]
    fn build_args_appends_model() {
        let args = build_args("hi", Some("gemini-2.5-pro"));
        let idx = args.iter().position(|a| a == "-m").expect("-m present");
        assert_eq!(args[idx + 1], "gemini-2.5-pro");
    }

    #[test]
    fn resolve_binary_env_override_wins() {
        std::env::set_var(GEMINI_BINARY_ENV, "/custom/gemini-path");
        assert_eq!(resolve_binary(), "/custom/gemini-path");
        std::env::remove_var(GEMINI_BINARY_ENV);
        let resolved = resolve_binary();
        assert!(
            resolved == "gemini" || resolved.to_lowercase().contains("gemini"),
            "unexpected gemini resolution: {resolved}"
        );
    }

    // --- Spike-line parser tests (REAL captured spike lines, 2026-06-09) ---

    #[test]
    fn parses_init_session_and_model() {
        let mut sink = GeminiSink::default();
        // Spike line.
        let err = sink.on_line(r#"{"type":"init","session_id":"sess-9","model":"gemini-2.5-pro"}"#);
        assert!(!err);
        assert_eq!(sink.session_id.as_deref(), Some("sess-9"));
    }

    #[test]
    fn skips_user_message_accumulates_assistant_delta() {
        let mut sink = GeminiSink::default();
        // Spike lines: user echo must be skipped; assistant deltas concatenate.
        sink.on_line(r#"{"type":"message","role":"user","content":"say hi"}"#);
        sink.on_line(r#"{"type":"message","role":"assistant","content":"hi","delta":true}"#);
        sink.on_line(r#"{"type":"message","role":"assistant","content":" there","delta":true}"#);
        assert_eq!(
            sink.accumulated, "hi there",
            "only assistant content accumulates; deltas concatenate w/o newline"
        );
    }

    #[test]
    fn parses_result_success_with_stats_usage() {
        let mut sink = GeminiSink::default();
        // Spike line.
        let err = sink.on_line(
            r#"{"type":"result","status":"success","stats":{"output_tokens":29,"input_tokens":7}}"#,
        );
        assert!(!err, "success result must not flag error");
        let u = sink.usage.expect("usage parsed from stats");
        assert_eq!(u.completion_tokens, Some(29));
        assert_eq!(u.prompt_tokens, Some(7));
        assert_eq!(u.total_tokens, Some(36), "total derived from in+out");
    }

    #[test]
    fn result_non_success_flags_error() {
        let mut sink = GeminiSink::default();
        let err = sink.on_line(r#"{"type":"result","status":"error","stats":{}}"#);
        assert!(err, "status != success must flag had_error");
        assert!(sink
            .error_message
            .as_deref()
            .unwrap()
            .contains("status: error"));
    }

    #[test]
    fn tolerates_unknown_and_blank_lines() {
        let mut sink = GeminiSink::default();
        assert!(!sink.on_line(r#"{"type":"future.thing"}"#));
        assert!(!sink.on_line("   "));
        assert!(!sink.on_line("not json"));
        assert!(sink.accumulated.is_empty());
        assert!(sink.error_message.is_none());
    }
}
