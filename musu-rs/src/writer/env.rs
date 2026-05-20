//! Env-builder for claude subprocess — wiki/495 §1 #5.
//!
//! Mirrors Python `claude_local.py:137-154 build_env()`:
//!   - Strip 4 nesting vars so claude can launch nested inside another
//!     Claude Code session.
//!   - Inject 4 MUSU envelope vars (task_id, agent_id, run_id, company_id).

use std::collections::HashMap;

/// Env vars that cause "cannot be launched inside another session" errors
/// when claude runs nested inside an existing Claude Code session.
pub const NESTING_VARS: &[&str] = &[
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SESSION",
    "CLAUDE_CODE_PARENT_SESSION",
];

/// Envelope vars injected so musu downstream tooling can correlate the run.
pub struct MusuEnvelope<'a> {
    pub task_id: &'a str,
    pub agent_id: Option<&'a str>,
    pub run_id: Option<&'a str>,
    pub company_id: Option<&'a str>,
}

/// Build the env map for `tokio::process::Command::envs(...)`.
///
/// Returns a fresh HashMap derived from `std::env::vars()`:
///   - 4 nesting vars removed (if present)
///   - 4 MUSU_* / PAPERCLIP_* envelope vars added
pub fn build_env(envelope: MusuEnvelope<'_>) -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    for k in NESTING_VARS {
        env.remove(*k);
    }
    env.insert("MUSU_TASK_ID".into(), envelope.task_id.to_string());
    if let Some(a) = envelope.agent_id {
        env.insert("MUSU_AGENT_ID".into(), a.to_string());
    }
    if let Some(r) = envelope.run_id {
        env.insert("MUSU_RUN_ID".into(), r.to_string());
    }
    if let Some(c) = envelope.company_id {
        env.insert("PAPERCLIP_COMPANY_ID".into(), c.to_string());
    }
    env
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_4_nesting_vars_and_injects_4_musu_vars() {
        // Set every nesting var first; build_env must strip all four.
        // Use unique sentinel values so we know it was *our* env that got
        // stripped, not just absent in CI.
        for k in NESTING_VARS {
            std::env::set_var(k, "should-be-stripped");
        }

        let env = build_env(MusuEnvelope {
            task_id: "task-abc",
            agent_id: Some("agent-1"),
            run_id: Some("run-2"),
            company_id: Some("co-3"),
        });

        for k in NESTING_VARS {
            assert!(
                !env.contains_key(*k),
                "expected nesting var {k} to be stripped"
            );
        }
        assert_eq!(
            env.get("MUSU_TASK_ID").map(String::as_str),
            Some("task-abc")
        );
        assert_eq!(
            env.get("MUSU_AGENT_ID").map(String::as_str),
            Some("agent-1")
        );
        assert_eq!(env.get("MUSU_RUN_ID").map(String::as_str), Some("run-2"));
        assert_eq!(
            env.get("PAPERCLIP_COMPANY_ID").map(String::as_str),
            Some("co-3")
        );

        // Cleanup so other tests don't see our pollution.
        for k in NESTING_VARS {
            std::env::remove_var(k);
        }
    }
}
