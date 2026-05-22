//! V26-W1 Commit 3 (wiki/509 §11) — operator-attested real-backend smoke.
//!
//! NOT run in CI (`.github/workflows/test.yml` runs `pytest` only). Run
//! locally with:
//!
//! ```text
//! cargo test --manifest-path musu-rs/Cargo.toml \
//!   --test adapter_real_backend_smoke -- --ignored --nocapture
//! ```
//!
//! Env knobs:
//! - `OLLAMA_URL` — default `http://localhost:11434/v1`
//! - `OLLAMA_MODEL` — default `qwen2.5-coder:7b`
//!
//! If this file gains additional tests in the future, share an `ENV_LOCK`
//! mutex (per `core/companies.rs::tests::ENV_LOCK` pattern) to serialize
//! env-var reads across tests (Critic LOW-1).

use musu_rs::adapter::openai_compat::OpenAICompatAdapter;
use musu_rs::adapter::{Adapter, AdapterContext};
use serde_json::json;

#[tokio::test]
#[ignore = "operator-attested; requires real Ollama on $OLLAMA_URL (default http://localhost:11434/v1). \
            Not run in CI. Smoke proof for W1 closure operator-attest evidence."]
async fn real_ollama_happy_path() {
    let base_url =
        std::env::var("OLLAMA_URL").unwrap_or_else(|_| "http://localhost:11434/v1".into());
    let model = std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "qwen2.5-coder:7b".into());

    let ctx = AdapterContext {
        run_id: "smoke".into(),
        prompt: "Reply with exactly the word OK.".into(),
        agent_id: "smoke".into(),
        adapter_type: "openai_compat_local".into(),
        config_json: json!({
            "base_url": base_url,
            "model": model,
            "backend": "ollama"
        }),
        session_id: None,
        cwd: None,
        deadline_unix_ms: None,
        cancel: None,
        extra: serde_json::Value::Null,
    };

    let res = OpenAICompatAdapter
        .execute(&ctx)
        .await
        .expect("real Ollama happy path");
    assert!(res.success);
    assert!(
        !res.summary.trim().is_empty(),
        "Ollama returned empty summary; check {base_url} / {model}"
    );
}
