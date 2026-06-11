use super::claude::ClaudeAdapter;
use super::codex::CodexAdapter;
use super::gemini::GeminiAdapter;
use super::openai_compat::OpenAICompatAdapter;
use super::{Adapter, AdapterContext, AdapterError};

/// Dispatch to concrete adapter implementation.
#[allow(dead_code)]
pub fn dispatch(
    adapter_type: &str,
    _ctx: &AdapterContext,
) -> Result<Box<dyn Adapter>, AdapterError> {
    match adapter_type {
        "openai_compat_local" | "openai_compat_remote" => Ok(Box::new(OpenAICompatAdapter)),
        // V26-W1 Commit 3 (wiki/509) — claude shim registered for the
        // registry-callable surface. Runner hot path at
        // `writer/runner.rs:273` still dispatches "claude" via the
        // narrow `claude_dispatch_spawn()` helper (returns `Child`, keeps
        // SSE/admission/finalize byte-identical). M3 (W12) unifies both.
        "claude" => Ok(Box::new(ClaudeAdapter)),
        // V26-W? (additive): codex + gemini CLI subprocess adapters. Both
        // drive `adapter/cli_common.rs` generic spawn/JSONL plumbing, mirror
        // ClaudeAdapter's stream-loop (per-iter cancel + timeout + deadline).
        // Operator-env-only binary resolution (MUSU_CODEX_BINARY /
        // MUSU_GEMINI_BINARY); they live on the trait/registry surface used by
        // workflow/llm_dag_builder.rs. Wiring into the writer hot path is the
        // separate M3/W12 unification (out of scope here).
        "codex" => Ok(Box::new(CodexAdapter)),
        "gemini" => Ok(Box::new(GeminiAdapter)),
        // V28: zero-dependency shell adapter — runs the prompt as a system shell
        // command and returns stdout. No AI vendor required; runs in the hot path
        // via run_trait_adapter (it's not "claude", so spawn_task routes it here).
        "shell" => Ok(Box::new(super::shell::ShellAdapter)),
        //
        // Box<dyn Adapter> is intentionally chosen over enum dispatch for V27
        // adapter growth: new providers should not force every call site to
        // depend on a larger provider enum.
        _ => Err(AdapterError::Unknown(format!(
            "adapter type not registered: {}",
            adapter_type
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(adapter_type: &str) -> AdapterContext {
        AdapterContext {
            run_id: "test-run".into(),
            prompt: "test prompt".into(),
            agent_id: "test-agent".into(),
            adapter_type: adapter_type.into(),
            config_json: serde_json::Value::Null,
            session_id: None,
            cwd: None,
            deadline_unix_ms: None,
            cancel: None,
            extra: serde_json::Value::Null,
        }
    }

    #[test]
    fn dispatch_unknown_returns_unknown_error() {
        let ctx = ctx("unknown");
        match dispatch("unknown", &ctx) {
            Err(AdapterError::Unknown(message)) => {
                assert!(
                    message.contains("not registered"),
                    "error message should describe unregistered adapter; got {message:?}"
                );
                assert!(message.contains("unknown"));
            }
            Err(other) => panic!("expected Unknown, got {other:?}"),
            Ok(_) => panic!("expected Unknown error, got adapter"),
        }
    }

    /// V26-W1 Commit 3 (wiki/509 §5): claude shim must dispatch ok.
    #[test]
    fn dispatch_claude_returns_claude_adapter() {
        let ctx = ctx("claude");
        let res = dispatch("claude", &ctx);
        // Box<dyn Adapter> doesn't implement Debug; collapse to is_ok().
        assert!(
            res.is_ok(),
            "claude dispatch should succeed; got Err: {}",
            res.err()
                .map(|e| e.to_string())
                .unwrap_or_else(|| "<no err>".into())
        );
    }

    /// V26-W? (additive): codex + gemini CLI adapters must dispatch ok.
    #[test]
    fn dispatch_codex_and_gemini_return_adapters() {
        for ty in ["codex", "gemini"] {
            let ctx = ctx(ty);
            let res = dispatch(ty, &ctx);
            assert!(
                res.is_ok(),
                "{ty} dispatch should succeed; got Err: {}",
                res.err()
                    .map(|e| e.to_string())
                    .unwrap_or_else(|| "<no err>".into())
            );
        }
    }
}
