//! claude CLI spawn + stream-json line parser — wiki/495 §1 #2, §3 claude.rs.
//!
//! Mirrors Python `claude_local.py:115-301` shape but as a streaming reader
//! rather than a buffer-then-parse pass:
//!   - Spawn `claude --print - --output-format stream-json --verbose ...`
//!   - Pipe prompt via stdin; close.
//!   - Read stdout line-by-line; each line is one JSON event.
//!   - Emit `ClaudeEvent`s to a channel; the runner reconciles state.
//!
//! Critic C5: `BufReader::with_capacity(64 * 1024, stdout)` so >50KB lines
//! don't thrash the default 8KB buffer.

use std::path::PathBuf;
use std::process::Stdio;

use anyhow::Context;
use serde::Deserialize;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

use crate::writer::env::{build_env, MusuEnvelope};

/// Spec for one claude invocation.
#[derive(Debug, Clone)]
#[allow(dead_code)] // `timeout_sec` recorded for parity / future enforcement here; runner already enforces.
pub struct SpawnSpec {
    pub command: String,
    pub task_id: String,
    pub prompt: String,
    pub cwd: PathBuf,
    pub model: Option<String>,
    pub timeout_sec: Option<u32>,
    pub company_id: Option<String>,
    pub agent_id: Option<String>,
    pub run_id: Option<String>,
}

impl SpawnSpec {
    fn build_args(&self) -> Vec<String> {
        let mut args: Vec<String> = vec![
            "--print".into(),
            "-".into(),
            "--output-format".into(),
            "stream-json".into(),
            "--verbose".into(),
        ];
        if let Some(m) = &self.model {
            args.push("--model".into());
            args.push(m.clone());
        }
        args
    }
}

/// One stream-json event from claude. We project the fields the runner
/// cares about; everything else lives in `raw` for forensic logging.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)] // forensic fields kept for future tracing/auditor visibility.
pub struct RawEvent {
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub subtype: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub message: Option<Value>,
    #[serde(default)]
    pub result: Option<String>,
    #[serde(default)]
    pub total_cost_usd: Option<f64>,
    #[serde(default)]
    pub usage: Option<Value>,
    #[serde(default)]
    pub is_error: Option<bool>,
}

/// Classified event types the runner consumes.
#[derive(Debug, Clone)]
#[allow(dead_code)] // event fields surfaced for tests + future tracing breadcrumbs.
pub enum ClaudeEvent {
    /// system/init — initial session handshake.
    Init {
        session_id: Option<String>,
        model: Option<String>,
    },
    /// assistant — model produced text; accumulate into output.
    Assistant { text: String },
    /// result — final event with cost + summary.
    Result {
        text: Option<String>,
        cost_usd: Option<f64>,
        is_error: bool,
    },
    /// Anything else (tool_use, system/other, etc.) — kept for completeness.
    Other,
}

impl ClaudeEvent {
    /// Project a parsed `RawEvent` into the classified shape.
    pub fn from_raw(raw: &RawEvent) -> Self {
        match raw.r#type.as_str() {
            "system" => {
                if raw.subtype.as_deref() == Some("init") {
                    ClaudeEvent::Init {
                        session_id: raw.session_id.clone(),
                        model: raw.model.clone(),
                    }
                } else {
                    ClaudeEvent::Other
                }
            }
            "assistant" => {
                let text = raw
                    .message
                    .as_ref()
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                    .map(|blocks| {
                        blocks
                            .iter()
                            .filter_map(|b| {
                                let typ = b.get("type").and_then(|v| v.as_str())?;
                                if typ == "text" {
                                    b.get("text").and_then(|v| v.as_str())
                                } else {
                                    None
                                }
                            })
                            .collect::<Vec<_>>()
                            .join("")
                    })
                    .unwrap_or_default();
                ClaudeEvent::Assistant { text }
            }
            "result" => ClaudeEvent::Result {
                text: raw.result.clone(),
                cost_usd: raw.total_cost_usd,
                is_error: raw.is_error.unwrap_or(false),
            },
            _ => ClaudeEvent::Other,
        }
    }
}

/// Spawn claude, push the prompt down stdin, and return the `Child` plus
/// a 64KB BufReader over stdout. Caller drives line-by-line parsing.
///
/// On `ErrorKind::NotFound`, the caller MUST surface "claude CLI not on PATH"
/// to the operator (R5-W5).
pub async fn spawn(spec: &SpawnSpec) -> std::io::Result<Child> {
    let envelope = MusuEnvelope {
        task_id: &spec.task_id,
        agent_id: spec.agent_id.as_deref(),
        run_id: spec.run_id.as_deref(),
        company_id: spec.company_id.as_deref(),
    };
    let env = build_env(envelope);

    let mut cmd = Command::new(&spec.command);
    cmd.args(spec.build_args())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(&spec.cwd)
        .env_clear()
        .envs(&env)
        .kill_on_drop(true);

    #[cfg(target_os = "linux")]
    crate::writer::platform_linux::configure(&mut cmd);
    #[cfg(target_os = "macos")]
    crate::writer::platform_macos::configure(&mut cmd);
    #[cfg(target_os = "windows")]
    crate::writer::platform_windows::configure(&mut cmd);

    let mut child = cmd.spawn()?;

    // Feed the prompt then close stdin.
    if let Some(mut stdin) = child.stdin.take() {
        let prompt = spec.prompt.clone();
        // We don't block the calling task; stdin write may be small for normal
        // prompts but is not bounded.
        tokio::spawn(async move {
            if let Err(e) = stdin.write_all(prompt.as_bytes()).await {
                tracing::warn!(error = %e, "claude stdin write failed");
            }
            let _ = stdin.shutdown().await;
            drop(stdin);
        });
    }

    Ok(child)
}

/// Parse a single line of stream-json output.
///
/// Returns Ok(Some(event)) on a valid JSON line, Ok(None) on blank line,
/// Err on malformed JSON. The runner uses Err as a skip-and-log signal
/// (Critic C5 / R5-W6).
pub fn parse_line(line: &str) -> anyhow::Result<Option<ClaudeEvent>> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let raw: RawEvent =
        serde_json::from_str(trimmed).context("parse stream-json line as RawEvent")?;
    Ok(Some(ClaudeEvent::from_raw(&raw)))
}

/// Convenience: wrap `child.stdout` in a 64KB BufReader (Critic C5).
pub fn buffered_stdout(child: &mut Child) -> Option<BufReader<tokio::process::ChildStdout>> {
    child
        .stdout
        .take()
        .map(|s| BufReader::with_capacity(64 * 1024, s))
}

/// Stream lines off stdout, yielding parsed events as the runner drains.
pub async fn next_event(
    reader: &mut BufReader<tokio::process::ChildStdout>,
    line_buf: &mut String,
) -> std::io::Result<Option<Result<ClaudeEvent, anyhow::Error>>> {
    line_buf.clear();
    let n = reader.read_line(line_buf).await?;
    if n == 0 {
        return Ok(None);
    }
    match parse_line(line_buf) {
        Ok(Some(ev)) => Ok(Some(Ok(ev))),
        Ok(None) => Ok(Some(Ok(ClaudeEvent::Other))),
        Err(e) => Ok(Some(Err(e))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_system_init_event() {
        let line = r#"{"type":"system","subtype":"init","session_id":"sess-1","model":"claude-sonnet-4-5"}"#;
        let ev = parse_line(line).unwrap().expect("event");
        match ev {
            ClaudeEvent::Init { session_id, model } => {
                assert_eq!(session_id.as_deref(), Some("sess-1"));
                assert_eq!(model.as_deref(), Some("claude-sonnet-4-5"));
            }
            other => panic!("expected Init, got {other:?}"),
        }
    }

    #[test]
    fn parses_assistant_text_event() {
        let line =
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hello world"}]}}"#;
        let ev = parse_line(line).unwrap().expect("event");
        match ev {
            ClaudeEvent::Assistant { text } => assert_eq!(text, "hello world"),
            other => panic!("expected Assistant, got {other:?}"),
        }
    }

    #[test]
    fn parses_result_event_with_usage() {
        let line = r#"{"type":"result","result":"final","total_cost_usd":0.0123,"is_error":false,"usage":{"input_tokens":42}}"#;
        let ev = parse_line(line).unwrap().expect("event");
        match ev {
            ClaudeEvent::Result {
                text,
                cost_usd,
                is_error,
            } => {
                assert_eq!(text.as_deref(), Some("final"));
                assert!((cost_usd.unwrap() - 0.0123).abs() < 1e-9);
                assert!(!is_error);
            }
            other => panic!("expected Result, got {other:?}"),
        }
    }

    #[test]
    fn tolerates_partial_json_line() {
        // R5-W6: malformed line returns Err; caller skips + logs and continues.
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"unterm"#;
        let res = parse_line(line);
        assert!(res.is_err(), "malformed JSON should return Err");

        // Blank line returns Ok(None).
        let res2 = parse_line("   \n").unwrap();
        assert!(res2.is_none(), "blank line should be Ok(None)");
    }
}
