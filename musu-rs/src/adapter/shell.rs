//! Shell adapter — V28 "make it actually work" zero-dependency workhorse.
//!
//! Registers `"shell"`. Runs the prompt as a shell command and returns its
//! stdout as the result. Needs NO AI vendor: a bare machine can `run "date"` or
//! a local script and SEE the output through the observation loop. This is the
//! CLI-side twin of Phase 2's ComfyUI HTTP adapter — "each machine runs its
//! specialist program; MUSU binds them" — for anything driven by a command.
//!
//! Platform shell: `cmd /C <prompt>` on Windows, `sh -c <prompt>` elsewhere. The
//! prompt is passed as an argv (not stdin) so a one-liner runs verbatim.
//!
//! SECURITY: this executes an arbitrary command on the host. That is the point
//! (the user is commanding their own machine), and the bridge already requires a
//! bearer token, so only an authorized caller reaches here. It is gated behind an
//! explicit `adapter_type="shell"` — it is never a default.

use super::cli_common::{self, CliOutcome, CliSpawnSpec, LineSink};
use super::{Adapter, AdapterContext, AdapterError, AdapterResult};
use async_trait::async_trait;
use std::path::PathBuf;
use std::time::Duration;

pub struct ShellAdapter;

/// Build (binary, args-prefix) for running a command string on this platform.
fn shell_invocation(command_str: &str) -> (String, Vec<String>) {
    #[cfg(windows)]
    {
        (
            "cmd".to_string(),
            vec!["/C".to_string(), command_str.to_string()],
        )
    }
    #[cfg(not(windows))]
    {
        (
            "sh".to_string(),
            vec!["-c".to_string(), command_str.to_string()],
        )
    }
}

/// Collects raw stdout lines (shell output is plain text, not JSONL).
#[derive(Default)]
struct ShellSink {
    out: String,
}

impl LineSink for ShellSink {
    fn on_line(&mut self, line: &str) -> bool {
        if !self.out.is_empty() {
            self.out.push('\n');
        }
        self.out.push_str(line);
        false // shell stdout is never itself an "error frame"
    }
}

#[async_trait]
impl Adapter for ShellAdapter {
    async fn execute(&self, ctx: &AdapterContext) -> Result<AdapterResult, AdapterError> {
        let cmd = ctx.prompt.trim();
        if cmd.is_empty() {
            return Err(AdapterError::Unknown("shell: empty command".into()));
        }

        let (binary, args) = shell_invocation(cmd);
        let cwd = ctx
            .cwd
            .clone()
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| PathBuf::from("."));

        let spec = CliSpawnSpec {
            command: binary,
            args,
            prompt: String::new(),
            prompt_via_stdin: false,
            cwd,
            task_id: ctx.run_id.clone(),
            agent_id: Some(ctx.agent_id.clone()),
            run_id: ctx.session_id.clone(),
            company_id: None,
        };

        let mut handle = match cli_common::spawn(&spec).await {
            Ok(h) => h,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(AdapterError::Unknown(
                    "shell: system shell (cmd/sh) not found".into(),
                ));
            }
            Err(e) => return Err(AdapterError::Unknown(format!("shell spawn failed: {e}"))),
        };

        let mut reader = match cli_common::buffered_stdout(&mut handle.child) {
            Some(r) => r,
            None => {
                let _ = handle.child.kill().await;
                return Err(AdapterError::Unknown(
                    "shell child had no stdout pipe".into(),
                ));
            }
        };

        let mut sink = ShellSink::default();
        let outcome = cli_common::stream_until_done(
            &mut reader,
            &mut sink,
            ctx.cancel.clone(),
            None,
            ctx.deadline_unix_ms,
        )
        .await;

        finalize(&mut handle, outcome, sink).await
    }
}

async fn finalize(
    handle: &mut cli_common::CliChild,
    outcome: CliOutcome,
    sink: ShellSink,
) -> Result<AdapterResult, AdapterError> {
    match outcome {
        CliOutcome::Done { .. } => {
            let exit = tokio::time::timeout(Duration::from_secs(5), handle.child.wait())
                .await
                .ok()
                .and_then(|r| r.ok());
            let code = exit.and_then(|s| s.code()).unwrap_or(-1);
            let summary = if sink.out.is_empty() {
                format!("(no output; exit {code})")
            } else {
                sink.out
            };
            Ok(AdapterResult {
                success: code == 0,
                summary,
                session_id: None,
                usage: None,
                error_code: None,
            })
        }
        CliOutcome::Cancelled => {
            kill(handle).await;
            Err(AdapterError::Unknown("shell: cancelled".into()))
        }
        CliOutcome::Timeout => {
            kill(handle).await;
            Err(AdapterError::Timeout)
        }
        CliOutcome::IoError(e) => {
            kill(handle).await;
            Err(AdapterError::Unknown(format!("shell io error: {e}")))
        }
    }
}

async fn kill(handle: &mut cli_common::CliChild) {
    let pid = handle.child.id();
    crate::writer::runner::graceful_kill(&mut handle.child, pid).await;
}

#[allow(dead_code)]
const SHELL_GRACE: Duration = Duration::from_secs(2);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_invocation_is_platform_correct() {
        let (bin, args) = shell_invocation("echo hi");
        #[cfg(windows)]
        {
            assert_eq!(bin, "cmd");
            assert_eq!(args, vec!["/C".to_string(), "echo hi".to_string()]);
        }
        #[cfg(not(windows))]
        {
            assert_eq!(bin, "sh");
            assert_eq!(args, vec!["-c".to_string(), "echo hi".to_string()]);
        }
    }

    fn ctx(prompt: &str) -> AdapterContext {
        AdapterContext {
            run_id: "t-shell".into(),
            prompt: prompt.into(),
            agent_id: "op".into(),
            adapter_type: "shell".into(),
            config_json: serde_json::Value::Null,
            session_id: None,
            cwd: None,
            deadline_unix_ms: None,
            cancel: None,
            extra: serde_json::Value::Null,
        }
    }

    #[cfg(windows)]
    fn long_running_command() -> &'static str {
        "ping 127.0.0.1 -n 30"
    }

    #[cfg(not(windows))]
    fn long_running_command() -> &'static str {
        "printf started; sleep 30"
    }

    #[tokio::test]
    async fn shell_runs_echo_and_captures_stdout() {
        let result = ShellAdapter
            .execute(&ctx("echo musu-shell-ok"))
            .await
            .unwrap();
        assert!(result.success, "summary={}", result.summary);
        assert!(
            result.summary.contains("musu-shell-ok"),
            "summary={}",
            result.summary
        );
    }

    #[tokio::test]
    async fn shell_cancel_signal_returns_promptly() {
        let cancel = std::sync::Arc::new(tokio::sync::Notify::new());
        let mut ctx = ctx(long_running_command());
        ctx.cancel = Some(cancel.clone());

        let fut = ShellAdapter.execute(&ctx);
        tokio::pin!(fut);
        tokio::time::sleep(Duration::from_millis(200)).await;
        cancel.notify_one();

        let result = tokio::time::timeout(Duration::from_secs(6), fut).await;
        assert!(
            result.is_ok(),
            "shell cancel should not wait for command exit"
        );
        let err = result.unwrap();
        assert!(
            err.is_err(),
            "cancel should return an adapter error, got {err:?}"
        );
        let message = format!("{:?}", err.err().unwrap());
        assert!(message.contains("cancelled"), "message={message}");
    }

    #[tokio::test]
    async fn shell_empty_command_errors() {
        let err = ShellAdapter.execute(&ctx("   ")).await;
        assert!(err.is_err());
    }
}
