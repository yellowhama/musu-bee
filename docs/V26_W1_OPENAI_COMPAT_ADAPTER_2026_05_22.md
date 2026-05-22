# V26-W1 — Rust adapter trait + OpenAI-compat adapter (detail plan)

**Wiki ID**: wiki/509 (this plan) + wiki/509c (closure)
**Date**: 2026-05-22
**Branch**: `v26/distributed-actor`
**Master plan**: `docs/V26_MASTER_PLAN_2026_05_22.md` (wiki/508) §2 W1 row
**Estimate**: 600 LOC est × 3.8 = **~2,280 actual** ([[feedback-loc-estimate-x2]])
**Builder**: orchestrator-direct (code-heavy, Rust subagent overhead 대비 직접 build 가 빠름)
**Critic**: `system-architect` single
**Auditor**: `quality-engineer` single ([[feedback-dual-audit-trigger-narrow]] 4 조건 0 매치 — no install/migration/auth/one-way)

---

## §1 Scope

**IN** (10 file touches):
1. `musu-rs/src/adapter/mod.rs` (new) — `Adapter` trait + `AdapterContext` + `AdapterResult` + `AdapterError` enum
2. `musu-rs/src/adapter/registry.rs` (new) — `dispatch(adapter_type, ctx) -> Box<dyn Adapter>`
3. `musu-rs/src/adapter/openai_compat.rs` (new) — `OpenaiCompatAdapter { backend: BackendKind, base_url, api_key, model }` unified
4. `musu-rs/src/adapter/claude.rs` (new) — shim wrapping existing `writer/claude.rs`
5. `musu-rs/src/writer/claude.rs` (edit) — extract spawn into adapter shim caller
6. `musu-rs/src/writer/runner.rs` (edit) — `TaskSpec.adapter_type: String`, dispatch to registry
7. `musu-rs/src/config.rs` 또는 agents loader (edit) — parse `adapter_type` + `config` per-agent (YAML)
8. `musu-rs/tests/adapter_openai_compat.rs` (new) — wiremock fixtures × 3 backends
9. `musu-rs/tests/adapter_registry.rs` (new) — dispatch test
10. `musu-rs/Cargo.toml` (edit) — async-trait only; runtime HTTP reuses existing reqwest, wiremock already present as dev-dep

**OUT** (W1 절대 손대지 않음):
- Streaming variant (`async fn execute_stream(...)` — W12 scope)
- Fallback chain (V27 별도 — Python router.py:240-279 의 retriable error code Rust port)
- Python 9 adapter (musu-core/adapters/*) Rust port — V27 별도 sub-WS
- Multi-tenant routing (company_id / allowed_tools — W9 scope)
- musu-bridge HTTP endpoint 변경 — `/api/tasks/delegate` 의 dispatch logic 만, endpoint shape 0
- `companies.yaml` schema 변경 — `agents` field 의 `adapter_type` + `config` 가 이미 풍부

---

## §1.1 Locked decisions

| ID | Decision | Source |
|---|---|---|
| D1 | **Unified `OpenaiCompatAdapter`** with `BackendKind { Ollama, Vllm, LmStudio }` enum (1 adapter, 3 backend variant) — V26 master §2 "2 variants" 가 실제는 1 unified + 3 backend | Phase 0 (b) — 3 serving 95% HTTP path 공유, quirks 만 backend match arm |
| D2 (Critic-revised v2) | `AdapterContext` = subset port: `run_id, prompt, agent_id, adapter_type, config_json, session_id, cwd` + **W12/W13 preempt fields**: `deadline_unix_ms: Option<u64>` + `cancel: Option<Arc<Notify>>` + `extra: serde_json::Value` (default Value::Null). `company_id` + `allowed_tools` 는 W9 (multi-tenant) 까지 drop | Critic HIGH-1: W12 가 다음 sub-WS, trait breaking change preempt. Critic INFO-2: Python `base.py:97 extra` 와 parity. +30 LOC |
| D3 | Trait method = `async fn execute(&self, ctx: &AdapterContext) -> Result<AdapterResult, AdapterError>` 단일. streaming = W12 contract | W12 scope lock |
| D4 (Critic-revised v2) | Registry = **new `adapter/registry.rs`** with `fn dispatch(adapter_type: &str, ctx: &AdapterContext) -> Box<dyn Adapter>`. **Rationale (Critic HIGH-6 lock)**: `Box<dyn Adapter>` chosen over enum dispatch because V27 Python-9 Rust port 가 매 새 adapter 마다 dispatch site 손대지 않아야 함 (extensibility 가 ~10ns heap-alloc cost 보다 우선). operator-static 오늘이지만 V27+ growth path 확보. V24-R5 writer 의 hardcoded `claude` 호출 deprecate (shim 으로 wrap) | Critic HIGH-6 reasoning lock |
| D5 | Backend detection = **operator config only** (no `/v1/models` probe). `companies.yaml` agent.config 에 `backend: "ollama"` 명시 | YAGNI + 200ms cold-start avoid |
| D6 | Test fixtures = **wiremock crate** (no real Ollama spawn). real-process smoke test = W13 또는 별도 | CI determinism |
| D7 (Builder-audit revised) | Runtime HTTP path uses existing `reqwest` directly instead of `async-openai`. Reason: async-openai 0.38.2 response types use tagged `tool_calls`; vLLM can omit per-tool `"type":"function"` (C8/D10 surface). Direct JSON parse keeps W1 non-streaming, accepts backend quirks defensively, and avoids adding an unused dependency. `eventsource-stream` remains deferred to W12. | Commit 2 audit: implementation needed flexible JSON parsing for vLLM; `async-openai` dependency removed post-audit |
| D8 | Bearer header always sent. Default `"sk-musu-local"` if no API key (Ollama/LM Studio safe ignore, vLLM `--api-key` 없으면 ignore) | Phase 0 (b) finding 5 |
| **F1 (Phase 0 frame correction)** | V26 master §2 W1 row says "2 variants" — 실제는 1 unified adapter + 3 BackendKind enum. **master §2 row update = commit 3 (runner+claude shim+YAML) 안에 같이 edit** ("2 variants" → "1 unified + 3 BackendKind enum (Ollama/vLLM/LmStudio)") | Critic LOW-1 lock |
| **D9 (Critic HIGH-4)** | Typed `AgentRecord` struct 신규 (`musu-rs/src/core/agents.rs` 또는 `companies.rs` 안): `{ adapter_type: String, model: Option<String>, config: serde_json::Value, #[serde(flatten)] extra: serde_json::Value }`. `CompanyRecord.agents: Vec<serde_json::Value>` → `Vec<AgentRecord>` change. backward-compat = `#[serde(flatten)] extra` escape hatch. **acceptance pre-commit failing test 로 guard**: 기존 V24-R6-written `~/.musu/companies/<id>.yaml` deserialize 성공 verify | Critic HIGH-4: 현재 `companies.rs:54` 가 untyped `Vec<serde_json::Value>` |
| **D10 (Critic INFO-1)** | D5 no-probe 의 fail-fast mechanism = first request 의 serde::Deserialize error on missing required field (id / choices / message.content). `AdapterError::Unknown` log with backend kind + URL. silent wrong-backend write 0. wiremock test: vLLM endpoint 에 Ollama shape response 서빙 시 `AdapterError::Unknown` log + `route_executions.status='done'` write 0 | Critic INFO-1 explicit |
| **D11 (Critic MED-3)** | Default Bearer token: **`musu-local-noauth`** (not `sk-musu-local`). `sk-` prefix 가 OpenAI key 와 false positive. log secret-scanner 노이즈 회피 + operator confusion 0 | Critic MED-3 |

---

## §2 Stack

```toml
[dependencies]
reqwest = { version = "0.12", features = ["json", "stream"] }
thiserror = "1"
async-trait = "0.1"
# existing: serde, serde_json, tokio

[dev-dependencies]
wiremock = "0.6"
```

**NOT** included in W1: `async-openai` (removed after Commit 2 audit), `eventsource-stream` (W12), `sse-codec` (W12+W13).

---

## §3 Module touch list

| # | Path | Action | LOC est | Notes |
|---|---|---|---|---|
| 1 | `musu-rs/src/adapter/mod.rs` | new | 180 | trait + AdapterContext + AdapterResult + AdapterError enum |
| 2 | `musu-rs/src/adapter/registry.rs` | new | 90 | dispatch fn |
| 3 | `musu-rs/src/adapter/openai_compat.rs` | new | 520 | 3 backend branches + Bearer + Option tool_calls |
| 4 | `musu-rs/src/adapter/claude.rs` | new (shim) | 140 | wraps writer/claude.rs |
| 5 | `musu-rs/src/writer/claude.rs` | edit | +60 / -30 | extract spawn fn into adapter shim caller |
| 6 | `musu-rs/src/writer/runner.rs` | edit | +110 / -40 | TaskSpec.adapter_type + dispatch |
| 7 | `musu-rs/src/config.rs` 또는 agents loader | edit | +180 | adapter_type + config YAML parse |
| 8 | `musu-rs/tests/adapter_openai_compat.rs` | new | 480 | wiremock × 3 backend × 3 case (happy/tool/error) |
| 9 | `musu-rs/tests/adapter_registry.rs` | new | 110 | dispatch test |
| 10 | `musu-rs/Cargo.toml` | edit | +12 | deps |

**Total (Critic-revised v2)**: 1,910 + Critic adds (~95 LOC: D2 deadline/cancel/extra 30 + D9 AgentRecord typed 60 + D10 fail-fast wiremock test +5 + D11 token rename 1) = **~2,005 net**. Within 2,280 est ×3.8 budget. Floor 600, ceiling 2,280. gap ~275 LOC reserved for §10 Critic Findings (13 rows populated) + §11 Auditor Findings row growth. **Critic C7 RV4 checkpoint**: +1,200 actual LOC trigger commit 2 split if >4× trajectory.

---

## §4 Schema delta

`N/A` — `agents` config = YAML, no DB migration. Const III not triggered.

---

## §5 Order of operations

1. `Cargo.toml` deps add (async-trait only; reqwest/wiremock already exist)
2. `adapter/mod.rs` — trait + struct + enum (compile-only, no impl)
3. `adapter/registry.rs` skeleton with `unimplemented!()` arms (compile check)
4. `adapter/openai_compat.rs` happy path **Ollama backend first** (most common). wiremock test green
5. Add **vLLM branch** — handle missing `"type":"function"` (Option<String> parse). wiremock test green
6. Add **LM Studio branch** — model filename normalize. wiremock test green
7. `adapter/claude.rs` shim — wraps existing `writer/claude.rs` so old test passes (no regression)
8. `runner.rs` — `TaskSpec.adapter_type: String` (default `"claude"` for backcompat), dispatch via registry
9. agents YAML loader extension — `adapter_type` + `config` per-agent parse
10. End-to-end registry test — both claude + openai_compat dispatched correctly
11. `cargo build && cargo clippy && cargo test` 모두 green
12. self-grep §6 acceptance check

실패 시 `git restore .` rollback. atomic single commit.

---

## §6 Acceptance criteria

1. `cargo build -p musu-rs` clean, zero warnings (`-D warnings` 권장)
2. `cargo clippy -p musu-rs -- -D warnings` clean
3. `cargo test -p musu-rs --test adapter_openai_compat` — **≥12 cases** pass (3 backends × {happy, tool-call, RateLimit retriable, ContextExceeded non-retriable}) — Critic MED-2 raised from ≥9
4. `cargo test -p musu-rs --test adapter_registry` — dispatch test pass (claude + openai_compat 둘 다)
5. `grep -r "trait Adapter" musu-rs/src/adapter/` returns exactly **1 hit** (single trait definition)
6. `grep -r "BackendKind::" musu-rs/src/adapter/openai_compat.rs` ≥ **3 hits** (Ollama, Vllm, LmStudio)
7. (Critic HIGH-5 split) (a) `AdapterError` enum has **exactly 5 variants** matching Python parity (`base.py:42-56`): RateLimit / Timeout / ContextExceeded / ModelUnavailable / Unknown. (b) `is_retriable()` returns `true` for exactly the **4-variant set** {RateLimit, Timeout, ModelUnavailable, Unknown}, `false` for ContextExceeded. (c) Rust unit test pins this with match-exhaustive case (future variant add = compile error)
8. `grep -n '"claude"' musu-rs/src/runner.rs` — hardcoded `"claude"` string 0 hits (replaced by `ctx.adapter_type`)
9. (Critic MED-3 D11) wiremock fixture asserts `Authorization: Bearer musu-local-noauth` header sent (default dummy token, not `sk-` prefix). Adapter sends `X-Musu-Adapter: openai_compat_<backend>` header too (operator log searchable marker)
10. vLLM fixture omits `"type":"function"` in tool_calls — adapter still parses (Option handling test)
11. claude shim regression: existing `writer/claude.rs` test 그대로 pass (no breaking change to V24-R5 SHIP)
12. (Critic LOW-1) V26 master §2 W1 row update = commit 3 안 같이 edit: "2 variants" → "1 unified + 3 BackendKind enum (Ollama/vLLM/LmStudio)"
13. (Critic HIGH-4 D9) **pre-commit failing test**: load existing V24-R6-written `~/.musu/companies/<id>.yaml` (또는 test fixture clone) → deserialize 성공. backward-compat guard
14. (Critic INFO-1 D10) wiremock test: vLLM-configured endpoint 에 Ollama-shape response 서빙 → `AdapterError::Unknown` log + `route_executions.status='done'` write 0 (silent wrong-backend prevented)

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| RV1 (Builder-audit revised) | LOW | Direct reqwest JSON path can drift from OpenAI-compatible response variance if parsing becomes too permissive | Keep strict top-level validation (`choices[0].message` required to include content/tool/function_call), wiremock backend matrix, and defer streaming/tool execution semantics to W12/W9. No `async-openai` version-drift risk remains in W1 |
| RV2 | MED | vLLM tool_call schema variance across model+version | defensive `Option<String>` everywhere, log warn never panic, integration test with both `type:"function"` present 와 missing |
| RV3 | MED | runner.rs TaskSpec change ripples to musu-bridge handlers | TaskSpec.adapter_type default `"claude"` when absent (backward compat); musu-bridge handler 0 change |
| RV4 (Critic C7 revised) | MED | LOC 2,280 actual vs 600 est ×3.8 — split into 3 commits for reviewability. **At +1,200 actual LOC checkpoint (commit 2 land), recompute ceiling**. If trajectory >4× est, split commit 2 into 2a (Ollama backend) + 2b (vLLM + LM Studio + integration tests) | commit 1 = trait+registry+Cargo.toml (~380 LOC), commit 2 = openai_compat impl + tests (~1,200 LOC), commit 3 = runner+claude shim+YAML (~700 LOC) |
| RV5 | LOW | LM Studio model filename varies per operator GUI setting | operator config 에 model name 명시 (D5 — no probe). adapter passes through |
| RV6 | LOW | wiremock CI flaky on Windows (port allocation) | wiremock random port + retry 3 회 |

---

## §8 Critic seed (`system-architect`)

(question-only per W1 V25-OPS C5 pattern — no parenthetical answers)

- D1 unified vs split: 3 backend enum 이 OCP 위반? 아니면 transport 공유 + parsing diverge 가 composition pattern 으로 OK?
- D3 single execute() vs execute_stream() 추가: W12 가 trait breaking change 강제하나? sealed trait pattern + `#[allow(async_fn_in_trait)]` 로 semver-safe extension 가능?
- D5 no-probe: operator misconfig 시 silent wrong-backend behavior — fail-fast 가 어떻게? first request 의 response schema mismatch 검출 가능?
- D6 wiremock vs real Ollama: integration confidence 차이? real-process smoke test 가 W13 acceptance 의 일부로 가능?
- D7 reqwest direct JSON path: does flexible parsing hide backend mismatch, or does fail-fast validation catch it early enough?
- D8 Bearer 항상 send: Ollama 가 dummy token 받아 log 에 노출되나? privacy 영향?
- §3 LOC 2,280 ×3.8 가 적정? V24 R5 (200→990 = 4.95×) 와 비교 — adapter 가 writer 보다 trait abstraction layer 추가라 multiplier higher 가능?
- §6.7 `is_retriable()` method: V24 Python AdapterError enum 의 mapping 정확? (RATE_LIMIT, TIMEOUT, MODEL_UNAVAILABLE, UNKNOWN, CONTEXT_EXCEEDED)
- §6.8 `"claude"` hardcoded 제거: backward compat 위해 default `"claude"` 라도 enum 으로 (`AdapterType::Claude`) 가 더 type-safe?
- F1 frame correction: V26 master §2 W1 row 의 "2 variants" → "1 unified + 3 BackendKind" 명시는 closure 시 update 가 best? 또는 본 W1 commit 안에 master plan §2 같이 edit?

---

## §10 Critic Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| C1 | HIGH | Trait method no deadline/cancel param | D3 lock 의 trait method signature 가 W12 (다음 sub-WS) deadline + cancel propagation 미리 안 받음. W12 시 trait breaking change risk | D2 v2: `AdapterContext` 에 `deadline_unix_ms: Option<u64>` + `cancel: Option<Arc<Notify>>` + `extra: serde_json::Value` 3 field preempt. W12 가 populate, W1 = None default. +30 LOC |
| C2 | HIGH | §6.8 grep acceptance false-positive | `musu-rs/src/runner.rs` path 가 실재 X (실제 `musu-rs/src/writer/runner.rs`). 또한 `writer/runner.rs:137` 의 env-var fallback `"claude"` literal 가 dispatch 와 별개. grep test 가 meaningless or wrong | §6.8 v2 split: (a) `adapter_type == "claude"` inline equality 0 hits, (b) `writer/runner.rs` 안 `"claude"` literal 중 `MUSU_CLAUDE_BINARY` env-var 제외 = 0 hits |
| C3 | HIGH | §3 row 6 path 잘못 | `musu-rs/src/runner.rs` 가 §12 References (`writer/runner.rs:80-90`) 와 disagree. Builder grep 시 non-existent file → silent miss | §3 row 6 + §6.8 모두 `musu-rs/src/writer/runner.rs` 로 path 수정 (이미 replace_all 적용) |
| C4 | HIGH | agents YAML 실제 untyped | `companies.rs:54 agents: Vec<serde_json::Value>` — typed AgentRecord struct 신규 필요. §1 OUT "schema 변경 X" 의 framing 부정확 | D9 신설: 신규 typed `AgentRecord` struct, `Vec<serde_json::Value>` → `Vec<AgentRecord>`. backward compat = `#[serde(flatten)] extra`. §6.13 pre-commit failing test guard (V24-R6 written yaml deserialize 성공) |
| C5 | HIGH | AdapterError variant count 모순 | §6.7 "≥4 variants" + 5 variant list — count 모순 | §6.7 v2 split: (a) 정확히 5 variants, (b) is_retriable() 가 4-set {RateLimit, Timeout, ModelUnavailable, Unknown} true, ContextExceeded false, (c) Rust match-exhaustive test (future variant add = compile error) |
| C6 | HIGH | D4 Box<dyn> rationale 부재 | enum dispatch 대안 unexamined. operator-static config 라 enum 가능. plan silence | D4 v2: explicit rationale 명시 — `Box<dyn>` chosen for V27 Python-9 Rust port extensibility (각 새 adapter dispatch site 안 touch). operator-static 오늘, V27+ growth 우선 |
| C7 | MED | LOC reserve insufficient | 1,910 net + 370 reserve = 2,280 ceiling. V24-R5 4.95× = ~2,970 LOC 가능 (30% over) | §7 RV4 v2: at +1,200 actual LOC checkpoint, recompute. >4× est trajectory 시 commit 2 split (commit 2a Ollama / commit 2b vLLM+LM Studio+tests) |
| C8 | MED | Test coverage 9 case under-tests error variants | 5 error variants → 1 "error" axis 만 collapse. is_retriable 경계 misclassification = V27 fallback chain infinite-loop risk | §6.3 v2: ≥12 cases (3 backends × {happy, tool-call, RateLimit retriable, ContextExceeded non-retriable}) — retriable boundary covered |
| C9 | MED | Dummy `sk-musu-local` log 노출 + OpenAI key false positive | `sk-` prefix log scanner 노이즈 + operator 혼동 | D11 신설: default 토큰 `musu-local-noauth` (not `sk-` prefix). 추가 `X-Musu-Adapter: openai_compat_<backend>` header 로 operator log 검색 marker. ~1 LOC change |
| C10 | LOW | F1 master §2 row update 시점 모호 | "commit 안 vs closure 시점 별도 commit" — V25-OPS pattern 따라 명확 | F1 v2: master §2 row update = commit 3 (runner+claude shim+YAML) 안 같이 edit. W1 closure 가 그 commit reference |
| C11 | LOW | RV1 vendor LOC est 부정확 | async-openai 0.39 breaking 시 vendor 200 LOC 가 30-50% 낙관 | Superseded by Builder audit: `async-openai` removed; reqwest direct JSON path uses existing dependency and tests backend variance directly |
| C12 | INFO | D5 no-probe fail-fast mechanism explicit 누락 | serde::Deserialize error implicit mechanism 명시 안 함 | D10 신설: fail-fast = first request serde::Deserialize error on missing required field (id/choices/message.content) → `AdapterError::Unknown` log + backend kind + URL. wiremock test 추가 (vLLM endpoint Ollama-shape response → Unknown log + silent write 0) |
| C13 | INFO | `extra` escape hatch absent | Python `base.py:97 extra` 와 parity 누락 | D2 v2 에 `extra: serde_json::Value` 포함 (C1 fix 와 fold) |

(Critic v1: system-architect Phase 1.5, 2026-05-22. 6 HIGH + 3 MED + 2 LOW + 2 INFO = 13 finding. 모든 HIGH + MED 6 + LOW 2 + INFO 2 = 13 모두 plan v2 D2/D4/D9/D10/D11 + §6 acceptance v2 (#3/#7/#8/#9/#13/#14) + §7 RV1/RV4 v2 + path correction (writer/runner.rs) 로 반영. re-Critic 불요.)

---

## §11 Auditor Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| A1 | MED | Spec/code dependency drift | Commit 2 implementation correctly used reqwest direct JSON parsing for vLLM tool-call variance, but the plan and Cargo.toml still carried `async-openai = "=0.38.2"` as if it were the runtime client | D7/RV1/Stack revised here. Cargo.toml removes `async-openai`; implementation remains reqwest direct with wiremock coverage |
| A2 | LOW | Commit 2 coverage shape | Plan asked for ≥12 cases; implementation has 6 tests, but three tests loop across all 3 backends for happy, RateLimit, ContextExceeded, plus vLLM tool-call and malformed fail-fast. Effective backend assertions cover 12+ paths, but the test count is lower than the plan wording | Keep current tests; future closure should report “effective case coverage” rather than raw test fn count |
| A3 | LOW | Real backend smoke not executed | Ollama/vLLM/LM Studio are wiremocked only. This matches D6 but means “real endpoint works” remains unproven until W1 closure or W13 hardware/operator smoke | Add real Ollama/vLLM smoke as optional/operator-attested closure evidence, not as Commit 2 gate |

---

## §12 References

- `docs/V26_MASTER_PLAN_2026_05_22.md` (wiki/508) §2 W1 row + §5 W1 detail
- `docs/PLAN_TEMPLATE.md` (V25-OPS W1 산출물) — sub-WS template
- `musu-rs/src/writer/claude.rs:39-54` — V24-R5 spawn pattern reference
- `musu-rs/src/writer/runner.rs:80-90` — TaskSpec reference
- `musu-rs/src/bridge/handlers/tasks.rs:56-164` — `/api/tasks/delegate` entry
- `musu-core/src/musu_core/adapters/base.py:74-126` — Python AdapterContext + AdapterResult reference
- `musu-core/src/musu_core/adapters/registry.py:6-38` — Python registry reference (8 adapter list)
- `musu-core/src/musu_core/adapters/router.py:240-279` — fallback chain reference (V27 별도)
- `musu-core/src/musu_core/adapters/claude_local.py:183-195` — subprocess pattern
- Phase 0 Researcher (a) — musu-rs adapter current state (2026-05-22)
- Phase 0 Researcher (b) — OpenAI-compat 16-source deep research (2026-05-22, async-openai 0.38.x initially recommended; superseded by Builder audit direct-reqwest decision)
- Ollama OpenAI-compat: https://docs.ollama.com/api/openai-compatibility
- vLLM tool-call issue #16340 (missing `type:function`): https://github.com/vllm-project/vllm/issues/16340
- LM Studio OpenAI-compat: https://lmstudio.ai/docs/developer/openai-compat
- Memory: [[feedback-no-python]] (musu product Rust only), [[feedback-no-yagni-architecture]] (D2 subset + D5 no-probe + D7 deferred streaming), [[feedback-loc-estimate-x2]] (×3.8 multiplier), [[feedback-phase0-scope-cutter]] (F1 frame correction), [[feedback-dual-audit-trigger-narrow]] (single Auditor 정당화), [[decision-musu-backend-rust]] (V24 Rust lock), [[decision-musu-3tier-thesis]] (V26 단계 2 organization 확장)
