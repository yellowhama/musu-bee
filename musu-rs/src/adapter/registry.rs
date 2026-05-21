use super::{Adapter, AdapterContext, AdapterError};

/// Dispatch to concrete adapter implementation.
#[allow(dead_code)]
pub fn dispatch(
    adapter_type: &str,
    _ctx: &AdapterContext,
) -> Result<Box<dyn Adapter>, AdapterError> {
    match adapter_type {
        // Commit 2 populates these with OpenAICompatAdapter.
        // "openai_compat_local" | "openai_compat_remote" => { ... }
        //
        // Commit 3 populates this with the claude shim.
        // "claude" => { ... }
        //
        // Box<dyn Adapter> is intentionally chosen over enum dispatch for V27
        // adapter growth: new providers should not force every call site to
        // depend on a larger provider enum.
        _ => Err(AdapterError::Unknown(format!(
            "adapter type not yet implemented in commit 1 skeleton: {}",
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
                assert!(message.contains("not yet implemented"));
                assert!(message.contains("unknown"));
            }
            Err(other) => panic!("expected Unknown, got {other:?}"),
            Ok(_) => panic!("expected Unknown error, got adapter"),
        }
    }
}
