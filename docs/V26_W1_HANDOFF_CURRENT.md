# V26-W1 Handoff (CURRENT) - 2026-05-22

## §1 Summary

- **Working Dir**: `F:\workspace\musu-bee`
- **Branch**: `v26/distributed-actor`
- **Latest code commit**: `15e07a5` — `V26-W1 commit 2 of 3: OpenAI-compat adapter + wiremock tests`
- **Remote base**: `origin/v26/distributed-actor` at `d3cd085`
- **Status**: Builder commit 1 and commit 2 are complete locally. Commit 3 remains pending.

## §2 Completed This Session

1. Restored `docs/V26_W1_HANDOFF_2026_05_22.md` from HEAD after mojibake corruption.
2. Commit 1 created:
   - `979589d` — `V26-W1 commit 1 of 3: trait + registry skeleton + Cargo deps`
   - Added `adapter/mod.rs`, `adapter/registry.rs`, Cargo deps, and `mod adapter;`.
3. Commit 2 created:
   - `15e07a5` — `V26-W1 commit 2 of 3: OpenAI-compat adapter + wiremock tests`
   - Added `adapter/openai_compat.rs`.
   - Connected `openai_compat_local` / `openai_compat_remote` dispatch in registry.

## §3 Verification

- `RUSTFLAGS='-D warnings' cargo build --manifest-path musu-rs\Cargo.toml` — pass.
- `RUSTFLAGS='-D warnings' cargo test --manifest-path musu-rs\Cargo.toml --bin musu adapter -- --nocapture` — pass, 10 adapter tests.
- `cargo clippy --manifest-path musu-rs\Cargo.toml -- -D warnings` — pass.
- Broader `cargo test --manifest-path musu-rs\Cargo.toml adapter -- --nocapture` was not used as the commit gate because Windows attempted to execute `tests\r6_auto_update.rs` and hit OS error 740 elevation. The bin-scoped unit-test command above avoids that unrelated integration-test launcher issue.

## §4 Commit 2 Implementation Notes

- Uses `reqwest` for the runtime request path and keeps `async-openai = "=0.38.2"` pinned per W1 plan dependency decision.
- Sends default bearer token `musu-local-noauth`.
- Sends `X-Musu-Adapter: openai_compat_<backend>`.
- Supports backend enum variants: `ollama`, `vllm`, `lm_studio`.
- Handles vLLM tool-call responses that omit a per-tool `"type"` field by parsing tool calls as flexible JSON.
- Maps `429` to `RateLimit`, `408/504` to `Timeout`, `503` to `ModelUnavailable`, and context-length `400` to `ContextExceeded`.

## §5 Remaining Work

Next step is **Builder commit 3 of 3**:

- Add `adapter/claude.rs` shim wrapping existing writer Claude execution.
- Update `writer/runner.rs` to dispatch through `adapter::registry`.
- Add typed `AgentRecord` / YAML compatibility guard.
- Update `docs/V26_MASTER_PLAN_2026_05_22.md` W1 row from "2 variants" to "1 unified + 3 BackendKind enum (Ollama/vLLM/LmStudio)".
- Run the W1 acceptance checks relevant to commit 3.

## §6 Current Tree Note

After this CURRENT handoff doc is committed, the local branch should be ahead of origin by 3 commits:

1. `979589d` — commit 1 skeleton.
2. `15e07a5` — commit 2 OpenAI-compatible adapter.
3. current handoff update commit.
