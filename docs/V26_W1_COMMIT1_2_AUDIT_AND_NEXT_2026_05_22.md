# V26-W1 Commit 1-2 Audit + Next Steps

**Date**: 2026-05-22
**Branch**: `v26/distributed-actor`
**Scope**: W1 Rust adapter trait + OpenAI-compatible adapter through commit 2
**Related wiki**: `wiki/509` plan; this is an interim audit note, not the W1 closure

---

## §1 What Changed

Three pushed commits established the W1 base:

| Commit | Purpose |
|---|---|
| `979589d` | Commit 1: `Adapter` trait, `AdapterContext`, `AdapterResult`, `AdapterError`, registry skeleton, Cargo deps |
| `15e07a5` | Commit 2: OpenAI-compatible adapter for Ollama/vLLM/LM Studio using reqwest + wiremock tests |
| `ac6783a` | Current handoff doc recording recovery and commit 1-2 state |

Post-push audit found one spec/dependency drift: the original plan expected `async-openai = 0.38.2`, but the implementation correctly used direct `reqwest` JSON parsing to handle vLLM tool-call response variance. The dependency was removed and the W1 spec was revised.

---

## §2 Qualitative Evaluation

**Overall**: good foundation, not W1-complete yet.

The adapter trait shape is sound for downstream work: it already includes deadline, cancel, and `extra` fields that W12/W13 would otherwise force into a breaking change. The error taxonomy is intentionally small and matches the Python adapter parity target closely enough for future fallback-chain logic.

The OpenAI-compatible adapter made the right tradeoff by choosing direct JSON parsing over a strict SDK response model. For MUSU's target providers, backend compatibility matters more than SDK convenience: Ollama, vLLM, and LM Studio all claim OpenAI-compatible HTTP, but differ in edge details. The current parser keeps strict top-level validation while allowing flexible tool-call payloads.

The main weakness is that this is still not integrated into `writer/runner.rs`; registry dispatch exists, but the production writer path does not call it yet. Real backend smoke is also not executed. So this is a good Commit 2, not a finished W1.

---

## §3 Code Audit

### Findings

| ID | Sev | Finding | Evidence | Required Action |
|---|---|---|---|---|
| A1 | MED | Spec/dependency drift: plan said `async-openai`, implementation used reqwest | `openai_compat.rs` uses `reqwest::Client`; `Cargo.toml` still had `async-openai` before audit | Fixed: removed dependency and revised W1 spec D7/RV1 |
| A2 | MED | Not wired into production writer path yet | `registry.rs` dispatches openai compat, but `writer/runner.rs` still owns the real execution path | Commit 3 must add claude shim + runner dispatch |
| A3 | LOW | Real Ollama/vLLM/LM Studio smoke not executed | Tests use wiremock only | Keep as W1 closure/operator smoke, not Commit 2 gate |
| A4 | LOW | Test count differs from plan wording | Six test functions cover 3 backend loops for happy/rate/context plus vLLM tool-call/fail-fast | Closure should report effective case coverage rather than raw function count |

### No Critical Issues Found

No syntax errors, no obvious secret exposure, no DB/schema mutation, and no production external network call in tests. Default bearer token is `musu-local-noauth`, avoiding `sk-` false positives.

---

## §4 Verification

Last clean gates before this audit:

- `RUSTFLAGS='-D warnings' cargo build --manifest-path musu-rs\Cargo.toml` — pass
- `RUSTFLAGS='-D warnings' cargo test --manifest-path musu-rs\Cargo.toml --bin musu adapter -- --nocapture` — pass, 10 adapter tests
- `cargo clippy --manifest-path musu-rs\Cargo.toml -- -D warnings` — pass

Post-audit dependency cleanup verification:

- `cargo metadata --manifest-path musu-rs\Cargo.toml --locked --no-deps` — pass; `async-openai` absent from package dependencies.
- `RUSTFLAGS='-D warnings' CARGO_INCREMENTAL=0 cargo test --manifest-path musu-rs\Cargo.toml --bin musu adapter -- --nocapture` — pass, 10 adapter tests.
- `CARGO_INCREMENTAL=0 cargo clippy --manifest-path musu-rs\Cargo.toml -- -D warnings` — pass.

Full `cargo build` previously stalled once on Windows rustc during dependency graph rebuild; the bin-scoped adapter test rebuilt and executed the changed code successfully.

---

## §5 Next Step Plan

**Builder commit 3 of 3**:

1. Add `musu-rs/src/adapter/claude.rs` shim around existing `writer/claude.rs` execution.
2. Update `writer/runner.rs` to route through `adapter::registry::dispatch`.
3. Add typed `AgentRecord` with YAML backward-compat guard.
4. Update `docs/V26_MASTER_PLAN_2026_05_22.md` W1 row from "local + remote variant" framing to "1 unified adapter + 3 BackendKind enum".
5. Re-run W1 gates:
   - `cargo build`
   - `cargo clippy -- -D warnings`
   - `cargo test --bin musu adapter`
   - targeted writer/claude regression
6. Then run W1 Auditor and create `docs/V26_W1_CLOSURE_2026_05_22.md` (`wiki/509c`).

---

## §6 Indexing Notes

After this doc lands:

- Re-run `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`.
- Query for `V26-W1`, `OpenAI-compatible adapter`, `reqwest direct`, and `async-openai removed`.
- Add a compact external llm-wiki page so non-repo agent memory knows the W1 state.
