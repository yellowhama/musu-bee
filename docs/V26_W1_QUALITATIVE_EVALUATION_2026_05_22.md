# V26-W1 정성평가 - 2026-05-22

Status: `M1 cycle 종료, V26-W1 SHIP`
Workspace: `F:\workspace\musu-bee`
평가자: 자체 평가 (self-authored, LG27/LG28 adversarial precedent 적용)

---

## 0. 한 줄 요약

**8.4 / 10 — PASS (W1 chokepoint 닫힘).** V26 master plan §3 strict sequential `W1 → W7 → W12 → W9 → W13 → W10` 의 첫 번째 게이트가 정확히 의도대로 닫혔다. Agent-team 파이프라인 (Researcher → Planner → Critic → Builder → Auditor → Scribe) 6 phase 가 한 cycle 안에서 모두 작동했고, Critic 단계가 4개 HIGH (모두 build-breaker / correctness 위협) 를 plan-time 에 잡았다.

---

## 1. 우리가 closing 한 것 (이 cycle 의 가치)

V26 의 6 sub-WS 중 **W1 만 SHIP** — 나머지 5개 (W7/W12/W9/W13/W10) 는 plan-only 였고 W1 chokepoint 로 막혀 있었다. 이 cycle (M1) 이 W1 의 **Commit 3 of 3** 를 land 하면서:

1. **ClaudeAdapter shim** — 기존 claude subprocess path 를 `Adapter` trait 로 wrap. registry dispatch 에서 `"claude"` 를 인식. 단 V24-R5 hot path (subprocess command 모양, env, JobObject, send_ctrl_break, SSE event order, finalize) 는 **bit-identical 보존** (Auditor `git diff` 로 검증).
2. **Registry dispatch hooked up** — `writer/runner.rs:273` 가 narrow dispatch boundary 통해 `adapter_type` 에 따라 라우팅. `"claude"` default (3-layer 방어: TaskSpec field + handler-side `unwrap_or_else` + registry match arm).
3. **Typed `AgentRecord`** — `core/companies.rs:54` 의 `Vec<serde_json::Value>` → `Vec<AgentRecord>`. `#[serde(flatten)] extra` 로 V24-R6 yaml unknown 필드 보존. `serde_json features = ["preserve_order"]` 추가.
4. **F1 master plan 수정** — V26 master §2 W1 row Module + Scope 셀 update.
5. **Auditable artifacts** — wiki/509c closure HTML, wiki/509-c3 detail plan, SSOT/WIKI_INDEX status 갱신, 외부 wiki/313 post-Commit-3 amend.

결과: **M2 (W7 `musu peer register`) 가 spawn 가능**.

---

## 2. 잘된 부분 (Strengths)

### S1. Critic 가 4 HIGH 잡았다 — plan-time catch (+1.4)

Phase 1.5 `system-architect` Critic 이 detail plan 을 adversarially 읽고 반환한 4 HIGH:

- **C1 — 6 in-file `TaskSpec { ... }` test 리터럴**: `writer/runner.rs::tests` 의 L795/825/856/893/931/963 6 군데가 `TaskSpec` 리터럴이고, `adapter_type: String` 필드 추가하면 **6 개 동시 E0063 compile error**. Plan 이 이걸 빠뜨림. Critic catch 덕에 Builder 가 첫 `cargo build` 에서 깨지지 않고 plan-time 에 §6.1 "Test-site literal fixes" 표로 명시.
- **C2 — `pub(crate) graceful_kill`**: Plan 이 R6 reuse 로 `runner::graceful_kill` 호출한다고 했지만 그건 `async fn` private. Critic catch 덕에 plan §3 R6 에 명시적 `pub(crate)` 승격 lock. Builder 가 가서 무심코 8줄 kill logic 복제할 위험 차단 (그러면 Auditor HIGH 발생).
- **C3 — `#[serde(flatten)] extra` 의미 + `preserve_order`**: serde flatten 이 nested object 를 recursive 하게 flatten 하지 않는다는 점, 그리고 `serde_json::Map` insertion order 가 `preserve_order` feature flag 없이는 불안정하다는 점. Critic catch 덕에 `extras_nested_subtree_preserved_as_object` 명시적 sub-test 추가 + `Cargo.toml` features 추가 + doc comment 의 의미 명확화.
- **C4 — F1 row Module vs Scope cell 혼동**: V26 master plan §2 W1 row 가 6 cell (Phase | Sub-WS | Wiki | Module | Scope | Risk | LOC | Existing infra). Plan §10 이 Module cell prefix 를 Scope cell text 로 적었음. Critic catch 덕에 full row markdown 으로 명시 분리.

이 4개 HIGH 는 **plan-as-text 만 읽는 Critic 만 잡을 수 있는 종류** (Phase 0 Researcher 는 코드를 매핑하지 plan 자체를 검증하지 않고, Builder 는 plan 을 따르지 plan 의 모순을 의심하지 않음). MODE_Agent_Team 의 phase 분리가 의도대로 가치 실현.

추가로 Critic 가 던진 question seed (Critic Q6: "SSE ordering at runner.rs:258 vs :656 — non-claude dispatch error 가 misleading 'claude failed to spawn' 메시지 인쇄?") 를 Builder 가 proactively 처리 (`if spec.adapter_type == "claude"` 분기).

### S2. Narrow dispatch boundary §4.6 contract — V24-R5 hot path 절대 안 건드림 (+1.0)

가장 큰 architectural 결정. 두 surface:
- **Runner-callable**: `runner.rs:273 → claude_dispatch_spawn(inner, spec, id) → claude::spawn(&spawn_spec) → Child`. 기존 stream loop (runner.rs:325-358), admission accounting (430-468), SSE publish (258 / 656), finalize (622-657) **byte-identical**.
- **Registry-callable**: `dispatch("claude", &ctx) → ClaudeAdapter::execute(&ctx) → build_spawn_spec → claude::spawn → buffered_stdout → next_event 루프 → AdapterResult`. W9/W13 downstream tooling 용.

두 surface 다 `claude::spawn` 으로 수렴. Shim 안에 `Command::new("claude")` 리터럴 **0건** (Auditor grep 검증). M3 (W12 deadline middleware) 가 두 surface 를 unify 할 자연스러운 시점 — V26 §3 strict sequential 이 W12 를 W1 다음에 두는 이유와 정확히 일치.

대안 (wide boundary = stream loop 을 shim 안으로 옮김) 을 거부한 이유: SSE publish + admission accounting 이 `run_one` 밖으로 새면 V24-R5 의미 깨질 위험 + M3 에서 어차피 재작업해야 함. 결정이 [[feedback-no-yagni-architecture]] 의 진짜 응용.

### S3. Auditor 가 PASS 로 닫음 + Critic HIGH 명시적 addressal (+0.6)

Phase 5 `quality-engineer` Auditor 는 plan 이 아니라 실제 코드 읽음:
- 6 test-site literal grep count = 6 (C1 확인).
- `graceful_kill` 시그니처 `pub(crate) async fn` 확인 + shim 의 3개 call site (Cancelled/Timeout/IoError) 확인 + shim 안 `Command::new` / `start_kill` grep = 0 (C2 확인).
- `AgentRecord` flatten extra 가 last field 인지 + `preserve_order` Cargo.toml 에 있는지 + 3 test fn 이름 + 실행 결과 검증 (C3 확인).
- V26 master §2 W1 row 의 Module + Scope 두 셀 모두 수정 + Risk/LOC/Existing-infra unchanged (C4 확인).
- `runner.rs:359-578` stream loop 영역 byte-identical (`git diff` 로 검증).
- Const III/VII: `migrate.rs`, `db.rs`, `~/.musu/companies/*.yaml` 미수정.

3개 LOW 만 남김 (모두 M3 cleanup 트랙). 0 HIGH / 0 MEDIUM.

### S4. Critic discipline 후 Builder discovery 도 솔직 (+0.4)

Builder 가 보고한 MEDIUM 1개 (plan-out-of-scope): musu-rs 가 bin-only 였는데 integration test 가 lib 필요해서 `src/lib.rs` 추가. 단순 re-export surface (7 pub mod 줄, no logic). 그 결과 lib.rs widening 으로 pre-existing `clippy::len_without_is_empty` lint 노출 → scoped `#[allow]` + rationale. 이 discovery 를 숨기지 않고 universal envelope FINDINGS 에 명시.

또 1 LOW: pre-existing parallel-test flake (`state_machine_pending_running_failed` 가 `MUSU_TASK_MAX_GLOBAL` env-var race 로 다른 테스트와 충돌). PRE-DATES Commit 3. 플래그만 달고 V27 test 위생 cycle 로 defer.

### S5. 외부 wiki/313 + 00_INDEX + SSOT + WIKI_INDEX 모두 동기화 (+0.3)

LG37 이후 사용자 본인 wiki 갱신 패턴을 그대로 유지. wiki/313 본문이 post-Commit-3 결과 + Auditor PASS + 다음 cycle (M2 W7) 안내까지 모두 자기 완결. 외부 wiki + 내부 docs 사이 drift 없음 (Windows safe.directory 등록 후 git status 검증 가능).

---

## 3. 우려 / Watches

### W1. LOC ×3.8 estimate 가 commit 3 에서 underestimate (−0.2)

Detail plan §2 LOC est: ~660 net touch (M1 target ~750). 실제 land 한 코드:
- `adapter/claude.rs` ~250 LOC (plan 추정 ~140)
- `runner.rs` 변경 +47 추정 → 실제 더 큼 (Q6 error-message branch + claude_dispatch_spawn 본문 풀버전 + graceful_kill doc comment + 6 test sites)
- `companies.rs` AgentRecord + 신규 모듈 변경 ~80
- `lib.rs` (Builder discovery) +25
- `dedup.rs` allow + rationale +5
- 3 backward-compat 테스트 ~140
- 1 ignore smoke test ~90

합계 ~870 LOC (M1 target 750 대비 +120, ×3.8 multiplier 적용했음에도 overrun). 다음 cycle 에서 M4 (W9 LLM DAG, MED risk) + M5 (W13 MCP HTTP+SSE, HIGH risk) 의 LOC estimate 를 ×4.5 정도로 raise 하는 게 안전.

### W2. Real backend smoke 가 wiremock only — operator 미실행 (−0.2)

`tests/adapter_real_backend_smoke.rs` 가 `#[ignore]` 로 land 했지만 이 cycle 에서 사용자가 실제 Ollama 로 운영자 attestation 안 함. CI 도 cargo test 안 돌리니까 (`.github/workflows/test.yml` pytest only) wiremock 만으로 통과. **integration confidence 차이가 plan 에 명시된 RV2 risk 그대로**. M5 (W13) closure 또는 V26 close 시점에 operator 가 한 번이라도 attest 해주는 게 권장.

### W3. Auditor 3 LOW 가 모두 M3 cleanup 으로 deferred — 누적 위험 (−0.1)

3 LOW:
- shim 의 local `handle_event` / `ShimOutcome` 가 runner 의 같은 logic 을 복제 (~130 LOC). Builder rationale 는 "registry-callable surface 만 쓰는 통로니까 runner pub 표면을 넓히기 싫었다" — 합리적이지만 M3 에서 unify 안 하면 평생 duplicate.
- `build_spawn_spec` 가 `#[allow(dead_code)]` 로 hot path 가 아닌 surface. M3 에서 routing 옮기면 활용.
- `AdapterError::Unknown("cancelled by operator")` 가 `runner.rs:393` 의 literal 와 string-coupled.

3개 다 M3 backlog. M3 detail plan 작성 시 cleanup 명시 안 하면 잊혀질 위험. **M2 진입 시 첫 번째 액션 = M3 backlog 표 갱신**.

### W4. lib.rs 가 Builder discovery — Plan 이 예측 못함 (−0.1)

Detail plan 이 musu-rs 가 bin-only 인 걸 못 봤다. Builder 가 integration test 작성하다가 발견. 큰 문제는 아니지만 (re-export 만 7줄) Plan agent 의 Phase 0 Researcher seed 가 "tests pattern" 만 봤지 "Cargo.toml [lib] vs [bin] target shape" 까지는 안 봤다는 신호. 다음 cycle 의 Phase 0 prompt 에 "library/binary target inventory + integration test 의 import 경로" 명시.

### W5. Pre-existing flake 가 묻혀있음 (−0.1)

`state_machine_pending_running_failed` 가 parallel run 시 env-var race. M1 이 introduce 한 게 아니라 V24-R5 부터 있었는데 이제 발견. V27 test 위생 cycle 에서 `ENV_LOCK: Mutex` 패턴 (companies.rs 가 이미 쓰는) 으로 fix. 지금은 `--test-threads=1` 로 우회.

---

## 4. 점수 계산

| 항목 | 무게 |
|---|---|
| baseline | 7.0 |
| S1 Critic 4 HIGH plan-time catch | +1.4 |
| S2 Narrow dispatch boundary §4.6 | +1.0 |
| S3 Auditor PASS + 명시적 Critic HIGH addressal | +0.6 |
| S4 Builder discovery 솔직 | +0.4 |
| S5 외부+내부 wiki/docs 동기화 | +0.3 |
| W1 LOC ×3.8 underestimate (~870 vs ~750) | −0.2 |
| W2 real backend smoke 미실행 | −0.2 |
| W3 Auditor 3 LOW 누적 위험 | −0.1 |
| W4 lib.rs Plan miss | −0.1 |
| W5 pre-existing flake unmasked | −0.1 |
| **총** | **9.0 → cap 8.4 (self-eval LG27/LG28 precedent)** |

LG27/LG28 adversarial re-evaluation precedent: self-bias correction 0.6 차감.

**최종: 8.4 / 10 PASS**.

---

## 5. M1 cycle 이 musu /goal 큰 그림에 기여한 것

musu /goal master plan (`C:\Users\empty\.claude\plans\shimmying-plotting-hamster.md`) 의 phase roadmap:

| ID | Phase | 상태 |
|---|---|---|
| **M1** | finish W1 (Commit 3) | **SHIP this cycle** |
| M2 | W7 (`musu peer register`) | next cycle |
| M3 | W12 (deadline middleware) + X1 (audit.db cross_machine column) | |
| M4 | W9 (LLM DAG builder) | MED risk |
| M5 | W13 (MCP HTTP+SSE) + X2 (4-layer ↔ dir map) | **HIGH** |
| M6 | W10 (registry hardening) + X3 (SSOT compaction) + V26 close | **HIGH** |

M1 이 가장 작은 cycle (~870 LOC) 이지만 strict sequential 의 첫 번째 게이트. 사용자 frustration 회피 핵심 = M1 빨리 끝내고 M2+M3 batched 로 두 cycle 같이 push. M4 (W9 LLM DAG) 가 시간 + token 가장 많이 들 cycle 예상.

---

## 6. 다음 cycle 즉시 액션 (M2 진입 전)

### Const VII push (이번 cycle 의 last gate)

`V26_W1_HANDOFF_CURRENT.md` §6 의 commit + push 명령. 사용자 OK 필요. 한 번의 approval 로 [[feedback-const-vii-batched-approval]] 따라 musu-bee + llm-wiki 두 repo 모두.

### M2 진입 전 작은 청소

1. M3 backlog 표 갱신 (Auditor 3 LOW 들 — shim handle_event duplicate, build_spawn_spec dead_code, cancelled string-couple).
2. Pre-existing flake 등록 (V27 test 위생 cycle, `ENV_LOCK` 패턴 적용 target).
3. M2 cycle 의 Phase 0 prompt 에 "library/binary target inventory" 명시 (이번 cycle Builder discovery 의 lib.rs miss 반영).

---

## 7. 검증 명령 재실행 (operator 가 다시 돌릴 때)

```powershell
cd F:\workspace\musu-bee

# 1. build clean
cargo build --manifest-path musu-rs\Cargo.toml

# 2. adapter unit tests (14 expected)
$env:RUSTFLAGS = "-D warnings"; $env:CARGO_INCREMENTAL = "0"
cargo test --manifest-path musu-rs\Cargo.toml --bin musu adapter -- --nocapture

# 3. backward-compat (3 expected)
cargo test --manifest-path musu-rs\Cargo.toml --test agent_record_backward_compat -- --nocapture

# 4. writer regression (serial)
cargo test --manifest-path musu-rs\Cargo.toml --bin musu writer -- --test-threads=1

# 5. clippy
cargo clippy --manifest-path musu-rs\Cargo.toml -- -D warnings

# 6. async-openai absent
cargo metadata --manifest-path musu-rs\Cargo.toml --locked --no-deps --format-version 1 `
  | Select-String -Pattern '"async-openai"'

# 7. indexer
musu-rs\target\debug\musu.exe indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
musu-rs\target\debug\musu.exe indexer search --work-dir F:\workspace\musu-bee --query "ClaudeAdapter" --limit 3
musu-rs\target\debug\musu.exe indexer search --work-dir F:\workspace\musu-bee --query "AgentRecord" --limit 3

# 8. (operator-attested) real Ollama smoke — optional
# $env:OLLAMA_URL = "http://localhost:11434/v1"; $env:OLLAMA_MODEL = "qwen2.5-coder:7b"
# cargo test --manifest-path musu-rs\Cargo.toml --test adapter_real_backend_smoke -- --ignored --nocapture
```

이 cycle 의 captured 결과:
- cargo build clean
- adapter tests: 14 passed, 0 failed
- backward-compat tests: 3 passed
- writer regression: 14 passed (serial)
- clippy: clean
- async-openai: absent
- indexer: 1395 files / 5339 symbols; ClaudeAdapter + AgentRecord 검색 가능

---

## 8. 결론

**M1 SHIP. W1 chokepoint 닫힘. M2 (W7) 진입 가능.** Agent-team 파이프라인이 한 cycle 안에서 6 phase 모두 작동했고, Critic 단계가 4 HIGH 를 plan-time 에 잡아서 Builder time + token 절약. Auditor 가 PASS + 명시적 Critic HIGH addressal 로 확인. Const VII push 만 user approval 대기.

가장 중요한 take-away: **narrow dispatch boundary §4.6 contract** — V24-R5 hot path 절대 안 건드리고 Adapter 인터페이스 만 등록. M3 (W12) 에서 자연스럽게 unify 할 수 있는 정확히 right-sized 의 결정.
