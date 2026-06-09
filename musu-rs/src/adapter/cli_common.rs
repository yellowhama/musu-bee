//! Shared CLI-subprocess plumbing for codex/gemini adapters — V26-W? (additive).
//!
//! `claude.rs` reuses `writer/claude.rs::spawn`, which bakes in claude-specific
//! args (`--print -`, `--output-format stream-json`) and the claude
//! `ClaudeEvent` parser. codex and gemini need the SAME subprocess discipline
//! (piped stdin/stdout/stderr, prompt-via-stdin-then-close, large-line-cap
//! reader, separate stderr drain task, per-iter cancel + timeout + deadline)
//! but with DIFFERENT binaries, args, and JSONL line semantics.
//!
//! This module factors out the provider-agnostic parts:
//!   - [`spawn`] — generic `Command::new(binary)` with piped stdio, env build
//!     (reusing `writer/env.rs::build_env`), platform hardening (reusing
//!     `writer/platform_*::configure`), prompt-via-stdin write+close, and a
//!     **separate stderr drain task** (avoids pipe-full deadlock; never parsed
//!     as events — critique L-E1: last stderr is retained for failure folding).
//!   - [`buffered_stdout`] — large-cap BufReader so a multi-MB assistant line
//!     is never silently dropped.
//!   - [`read_jsonl_line`] — bounded `read_line` with a multi-MB cap.
//!   - [`StreamControl`] + [`stream_until_done`] — the per-iter
//!     `tokio::select!`(cancel) + bounded `timeout` + soft-deadline loop,
//!     copied in shape from `adapter/claude.rs::stream_until_done` so
//!     cancel/timeout/deadline behavior is identical across all subprocess
//!     adapters. Parameterized by a [`LineSink`] the caller supplies.
//!
//! The writer hot path (`writer/runner.rs` + `writer/claude.rs`) is NOT
//! touched; this is purely additive to the trait/registry surface.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdout, Command};
use tokio::sync::Notify;

use crate::writer::env::{build_env, MusuEnvelope};

/// 8 MiB single-line cap. A JSONL assistant message can be large; the default
/// 8KB BufReader fill would still stitch a long line across reads, but we set
/// an explicit ceiling so a pathological unbounded line can't OOM the process.
/// Far above any realistic single assistant turn, so a "big assistant line"
/// is NOT silently dropped (requirement 2).
pub const MAX_LINE_BYTES: usize = 8 * 1024 * 1024;

/// BufReader capacity for stdout. 64KB matches `writer/claude.rs`'s Critic-C5
/// choice so large lines don't thrash the default 8KB buffer.
const STDOUT_BUF_CAP: usize = 64 * 1024;

/// Per-iteration read timeout when no hard deadline is active. Matches
/// `adapter/claude.rs::PER_ITER_TIMEOUT` (500ms) so cancel + deadline checks
/// happen on the same beat across adapters.
pub const PER_ITER_TIMEOUT: Duration = Duration::from_millis(500);

/// Spec for one generic CLI invocation. Unlike `writer/claude.rs::SpawnSpec`,
/// `args` is fully caller-controlled (codex/gemini build their own).
#[derive(Debug, Clone)]
pub struct CliSpawnSpec {
    /// Resolved binary name/path (operator-env-only; see codex/gemini M1 note).
    pub command: String,
    /// Full argv (excluding the binary). Caller bakes in fixed + model args.
    pub args: Vec<String>,
    /// Prompt text. Written to stdin then stdin is closed — UNLESS
    /// `prompt_via_stdin` is false (gemini passes prompt via `-p` arg).
    pub prompt: String,
    /// When true, write `prompt` to child stdin then close. When false, stdin
    /// is still piped+closed (no hang) but nothing is written (gemini `-p`).
    pub prompt_via_stdin: bool,
    pub cwd: PathBuf,
    /// MUSU envelope correlation fields.
    pub task_id: String,
    pub agent_id: Option<String>,
    pub run_id: Option<String>,
    pub company_id: Option<String>,
}

/// Handle to a spawned CLI child plus its drained-stderr buffer.
pub struct CliChild {
    pub child: Child,
    /// Last non-empty stderr line, updated by the drain task. Folded into
    /// `AdapterError::Unknown` on non-zero exit with no result (critique L-E1).
    pub last_stderr: Arc<Mutex<Option<String>>>,
}

/// Spawn a generic CLI subprocess.
///
/// Mirrors `writer/claude.rs::spawn` discipline (env_clear + build_env +
/// platform configure + kill_on_drop + stdin write/close) but with a
/// caller-supplied argv and an added **separate stderr drain task**.
///
/// On `ErrorKind::NotFound`, returns the io error so the caller can map to
/// `AdapterError::ModelUnavailable` (requirement 8).
pub async fn spawn(spec: &CliSpawnSpec) -> std::io::Result<CliChild> {
    let envelope = MusuEnvelope {
        task_id: &spec.task_id,
        agent_id: spec.agent_id.as_deref(),
        run_id: spec.run_id.as_deref(),
        company_id: spec.company_id.as_deref(),
    };
    let env = build_env(envelope);

    let mut cmd = Command::new(&spec.command);
    cmd.args(&spec.args)
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

    // Feed the prompt (when stdin-driven) then close stdin. Always close
    // stdin even when not writing, so a CLI that waits on EOF doesn't hang.
    if let Some(mut stdin) = child.stdin.take() {
        let prompt = if spec.prompt_via_stdin {
            Some(spec.prompt.clone())
        } else {
            None
        };
        tokio::spawn(async move {
            if let Some(p) = prompt {
                if let Err(e) = stdin.write_all(p.as_bytes()).await {
                    tracing::warn!(error = %e, "cli adapter stdin write failed");
                }
            }
            let _ = stdin.shutdown().await;
            drop(stdin);
        });
    }

    // Drain stderr in a SEPARATE task to avoid pipe-full deadlock. We do NOT
    // parse stderr as events (codex emits a benign "rmcp serde error" line;
    // gemini emits "True color"/"Ripgrep" warnings). We retain the last
    // non-empty line so a silent failure can be folded into the error.
    let last_stderr: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    if let Some(stderr) = child.stderr.take() {
        let sink = Arc::clone(&last_stderr);
        tokio::spawn(async move {
            let mut reader = BufReader::with_capacity(STDOUT_BUF_CAP, stderr);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            if let Ok(mut guard) = sink.lock() {
                                *guard = Some(trimmed.to_string());
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    Ok(CliChild { child, last_stderr })
}

/// Wrap `child.stdout` in a large-cap BufReader.
pub fn buffered_stdout(child: &mut Child) -> Option<BufReader<ChildStdout>> {
    child
        .stdout
        .take()
        .map(|s| BufReader::with_capacity(STDOUT_BUF_CAP, s))
}

/// Read one JSONL line with a multi-MB cap. Returns:
///   - `Ok(None)` on EOF,
///   - `Ok(Some(line))` on a line (trailing newline included; caller trims),
///   - `Err` on I/O error or when the cap is exceeded (a runaway unbounded
///     line — surfaced rather than silently truncated).
pub async fn read_jsonl_line(
    reader: &mut BufReader<ChildStdout>,
    line_buf: &mut String,
) -> std::io::Result<Option<()>> {
    line_buf.clear();
    let n = reader.read_line(line_buf).await?;
    if n == 0 {
        return Ok(None);
    }
    if line_buf.len() > MAX_LINE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!(
                "JSONL line exceeded {MAX_LINE_BYTES} byte cap ({} bytes)",
                line_buf.len()
            ),
        ));
    }
    Ok(Some(()))
}

/// Outcome of draining a CLI subprocess's stdout. Mirrors
/// `adapter/claude.rs::ShimOutcome`.
pub enum CliOutcome {
    /// Stdout hit EOF. `had_error` set if a provider error line was seen.
    Done {
        had_error: bool,
    },
    Cancelled,
    Timeout,
    IoError(std::io::Error),
}

/// What a per-adapter line parser does with each JSONL line: accumulate text,
/// capture a result/usage, or flag an error. The shared loop owns control
/// flow; the sink owns provider semantics.
pub trait LineSink {
    /// Handle one raw JSONL line (already read off stdout). Implementations
    /// parse it and mutate their own state. MUST tolerate unknown/blank lines
    /// (ignore, do not error) per the codex "unknown type" requirement.
    /// Return `true` if this line indicated a provider error (sets had_error).
    fn on_line(&mut self, line: &str) -> bool;
}

/// Per-iter cancel + timeout + deadline driver, generic over a [`LineSink`].
///
/// Copied in shape from `adapter/claude.rs::stream_until_done` so
/// cancel/timeout/deadline semantics are byte-for-byte consistent.
pub async fn stream_until_done<S: LineSink>(
    reader: &mut BufReader<ChildStdout>,
    sink: &mut S,
    cancel: Option<Arc<Notify>>,
    timeout: Option<Duration>,
    deadline_unix_ms: Option<u64>,
) -> CliOutcome {
    let mut line_buf = String::new();
    let mut had_error = false;

    let mono_deadline = timeout.map(|t| Instant::now() + t);
    loop {
        // Soft deadline check (W12 preempt slot).
        if let Some(deadline_ms) = deadline_unix_ms {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            if now_ms >= deadline_ms {
                return CliOutcome::Timeout;
            }
        }

        let remaining = match mono_deadline {
            Some(d) => {
                let now = Instant::now();
                if now >= d {
                    return CliOutcome::Timeout;
                }
                Some(d - now)
            }
            None => None,
        };
        let per_iter = remaining.unwrap_or(PER_ITER_TIMEOUT);

        let read_fut = read_jsonl_line(reader, &mut line_buf);

        let result = if let Some(cancel) = cancel.as_ref() {
            tokio::select! {
                biased;
                _ = cancel.notified() => return CliOutcome::Cancelled,
                r = tokio::time::timeout(per_iter, read_fut) => r,
            }
        } else {
            tokio::time::timeout(per_iter, read_fut).await
        };

        match result {
            Err(_) => {
                // Per-iter timeout: hard timeout only if a real deadline was
                // set; otherwise loop and re-check cancel + deadline.
                if remaining.is_some() {
                    return CliOutcome::Timeout;
                }
                continue;
            }
            Ok(Ok(None)) => {
                return CliOutcome::Done { had_error };
            }
            Ok(Ok(Some(()))) => {
                if sink.on_line(&line_buf) {
                    had_error = true;
                }
            }
            Ok(Err(e)) => return CliOutcome::IoError(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct CountingSink {
        lines: usize,
        errors: usize,
    }
    impl LineSink for CountingSink {
        fn on_line(&mut self, line: &str) -> bool {
            self.lines += 1;
            let is_err = line.contains("\"error\"");
            if is_err {
                self.errors += 1;
            }
            is_err
        }
    }

    #[test]
    fn counting_sink_flags_error_lines() {
        let mut sink = CountingSink {
            lines: 0,
            errors: 0,
        };
        assert!(!sink.on_line("{\"type\":\"ok\"}"));
        assert!(sink.on_line("{\"type\":\"error\",\"message\":\"boom\"}"));
        assert_eq!(sink.lines, 2);
        assert_eq!(sink.errors, 1);
    }

    #[test]
    fn max_line_cap_is_multi_mb() {
        // Guard against an accidental shrink to a small cap that would drop a
        // big assistant line.
        assert!(MAX_LINE_BYTES >= 1024 * 1024);
    }
}
