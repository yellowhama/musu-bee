# V25-OPS master plan — V24 정성평가 발견 5개를 운영 자산으로 박기

**Wiki ID**: wiki/501 (master) + wiki/502..506 (W1..W5 plans/closures)
**Date**: 2026-05-21
**Branch**: `v24/rust-cleanup` 유지 (V25-OPS 자체가 V24 운영 마무리)
**Phase -1 strategic gate**: **EXEMPT** — thesis = "V24 retrospective 5 findings 을 재사용 가능한 artifact 로 codify". 사양 변경 0, 새 dep 0, 새 architecture 0. `MODE_Agent_Team.md` Phase -1 exemption clause (`pure refactor/cleanup` + `no thesis extension`) 부합.
**Approval**: user approved via ExitPlanMode 2026-05-21.

---

## §1 Context

V24 Rust-cleanup 완료 (R0..R8 + R3/R4/R5/R6 SHIP). 정성평가 doc (`docs/V24_QUAL_EVAL_2026_05_21.md`)에서 5개 발견 정리됨:

1. **Phase 0 Researcher가 scope cutter** — R3 stdio MCP 발견 + R4 HTTP-first 폐기 + session/spy dead path drop. frame correction 2건 catch.
2. **LOC 추정 일관 1.5–7× under** — Critic이 plan에 빠진 cross-cutting 추가 요구 → Builder가 3 call site 동시 수정. 다음 plan부터 **estimate ×2 곱** 권장.
3. **Dual-audit ROI 검증** — R6 만 dual (devops + security) 적용 → 7 HIGH. R3/R4 single 평균 1 HIGH. **install/migration/auth-touching/one-way blast radius** 에만 dual.
4. **Phase -1 panel YELLOW reshape 효과** — big-bang 4-6주 down → R-fast/R-cleanup phased. R8 (4060Ti) 이 R3/R4 전에 통과한 게 핵심.
5. **Python 25,885 LOC dead code working tree 잔존** — operator R10 manual gate. visibility 부족 (top-level README 아직 Python 가리킴, 각 Python module dir 자체 README 없음, deprecation 배너 0).

이 5개가 지금은 `V24_QUAL_EVAL` prose 안에만 있다. V26 master plan 작성 시 자동 적용되도록 **3개 durable channel** 로 박는다:

A. **Memory feedback 메모 3개** (`~/.claude/projects/C--Users-empty/memory/feedback-*.md`) — orchestrator 자동 적용
B. **Repo-local `docs/PLAN_TEMPLATE.md`** — Planner Phase 1 시작점
C. **Operator-visible deprecation banners + R10 runbook completeness** — operator manual gate 결정 쉬워짐

---

## §2 What this master plan does

- **Now**: 이 master plan doc 1개만 작성 (wiki/501 = `docs/V25_OPS_MASTER_PLAN_2026_05_21.md`)
- **Per W (W1..W5 sequential)**: /loop + agent-team 으로 진입 시 그 sub-WS detail plan 작성 → Critic → Builder → Auditor → Scribe → 다음 W

**Out of scope (operator manual)**:
- R10 Python 실제 deletion (V25-OPS는 runbook만 보강)
- R9 cross-machine (operator decision per §A.1.1)
- #436 main-merge 실행 (V25-OPS-W4 가 brief 만 작성)
- §9.12 operator-attested attestation 작성 자체 (W4 는 HOW-TO 만)

---

## §3 Sub-WS list (5 W, all LOW blast radius, all single-Auditor)

| W | Title | Builder | Auditor | LOC est ×2 | Prereq |
|---|---|---|---|---|---|
| **W1** | `docs/PLAN_TEMPLATE.md` + 3 memory feedback 메모 (`feedback-phase0-scope-cutter.md`, `feedback-loc-estimate-x2.md`, `feedback-dual-audit-trigger-narrow.md`) | `technical-writer` | `quality-engineer` | 400 → **800** | — |
| **W2** | Python deprecation 배너: top-level README + 5 module README (`musu-{bridge,core,control,indexer,writer}/README.md`) | `technical-writer` | `quality-engineer` | 350 → **700** | W1 (template 참조) |
| **W3** | R10 runbook completeness — facade.rs/mod.rs 정확한 line number + SHA pin + `cargo check` verification step + recovery dry-run | `technical-writer` | `quality-engineer` | 150 → **300** | W2 |
| **W4** | §9.12 operator-attested HOW-TO + #436 main-merge operator brief (2 doc) | `technical-writer` | `quality-engineer` | 250 → **500** | W3 |
| **W5** | V25-OPS 자체 closure HTML + retrospective consolidation | `technical-writer` | `quality-engineer` | 350 → **700** | W4 |

**Total**: ~3,000 LOC markdown/HTML. ~5 /loop 일 (orchestrator wall-clock). 새 Rust/TS 코드 0 LOC.

---

## §4 Sub-WS detail (master 수준)

### §4.1 W1 — PLAN_TEMPLATE.md + 3 memory feedback notes

- **JTBD**: V26 master plan kick-off 때 Planner가 `PLAN_TEMPLATE.md` copy → 자동으로 §LOC-estimate (×2 곱 explicit), §dual-audit-trigger (4 조건 명문화), §Phase-0-frame-correction-check (Researcher 가 frame 손댈 수 있다는 명시) 가 들어감. orchestrator는 memory 메모 3개로 자동 응용.
- Template skeleton: V24 R5/R6 plan들의 공통 §1 Scope IN/OUT, §1.1 Locked decisions, §10 Critic Findings, §11 Auditor Findings 패턴을 골격으로.
- Memory 메모 format: 기존 `feedback-strategic-critic-gate.md` 패턴 따라가기 (Rule + **Why:** + **How to apply:** + `[[cross-links]]`).

### §4.2 W2 — Python deprecation banners

- top-level `README.md` 의 Modules table 에 "Python (deprecated, awaiting R10)" 컬럼 추가 + Rust path 우선 표기
- 5개 module 디렉터리 (`musu-bridge/`, `musu-core/`, `musu-control/`, `musu-indexer/`, `musu-writer/`) 각각에 `README.md` 신규 — 동일한 deprecation 배너 + 대체 Rust subcommand 안내
- 인라인 복제 선택: 한 banner 파일 link 하면 single dir grep 시 cross-link follow 안 함 → 5개 inline 복제

### §4.3 W3 — R10 runbook completeness

- 현재 `V24_CLOSURE_2026_05_21.html` §4.1 line 126–152 는 85% 완성. 빠진 부분:
  - Step 3 "Edit `musu-rs/src/bridge/mod.rs` to drop `.fallback(facade::proxy)`" — 정확한 line number 없음
  - `musu-rs/src/bridge/facade.rs` 파일 deletion 명시 누락
  - `cargo check && cargo test --release` 실행 명령 보강
  - `git revert HEAD` dry-run step (recovery verification)
- W3 commit SHA 를 runbook 안에 명시 (line number stability 보장). operator는 그 SHA 기준 follow.

### §4.4 W4 — §9.12 attestation HOW-TO + #436 main-merge brief

- **doc A**: `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` — operator 가 §9.12 attestation block 어디에 (wiki/500 `V24_CLOSURE_2026_05_21.html` §5), 어떻게 (operator authors text, operator commits with their own auth, orchestrator absent) 작성하는지. 빈 stub 만 제공, 채움 금지.
- **doc B**: `docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` — V23.3 + V23.4 Tier-1 + V24 묶음. 각 branch 의 commit range 변수 표기 (operator confirm time 에 확정). closure docs cross-link. operator 결심 → main merge 자체는 V25-OPS scope 밖.
- W4 Auditor 의 가장 중요한 check: doc A 가 orchestrator-prefillable 형태로 작성됐는지. Goodhart firewall preserved 인지.

### §4.5 W5 — V25-OPS closure HTML

- `docs/V25_OPS_CLOSURE_2026_05_21.html` (wiki/506) — V25-OPS 5 W 결과 정리 + Phase -1 EXEMPT 이유 기록 + V24 retrospective doc (`V24_QUAL_EVAL_2026_05_21.md`) cross-link + 3 memory 메모 + PLAN_TEMPLATE + R10 runbook completeness + 5 banner + 2 W4 brief 전체 인덱스
- HTML per [[feedback-scribe-html-only]]
- 이 closure 가 V26 master plan 의 PRIOR ARTIFACTS 진입점

---

## §5 Sequence + /loop autonomous gates

**Strict sequential**: W1 → W2 → W3 → W4 → W5.

**왜 sequential** (LOW blast 인데도): W2 banner 는 W1 template format 참조; W3 line number 는 W2 banner 에서 가리키는 commit SHA 기준; W4 brief 는 W3 runbook complete 가정; W5 closure 는 W1..W4 다 인용.

**/loop autonomous behavior** ([[feedback-autonomous-loop]] 적용):
- 각 W 의 Phase 1 Planner → 1.5 Critic → 3 Builder → 5 Auditor → 7 Scribe → 8 Push 자동 진행
- Const VII push gate 는 W 단위 batched approval ([[feedback-const-vii-batched-approval]]) — user 가 W1 OK 하면 W2 까지 자동 push, drift 발견 시 추가 확인
- **Operator gate (halt /loop)**:
  - W4 끝나고 W5 시작 전: brief 가 operator 의 immediate review 를 trigger 하는지 vs 후일 처리 인지 결정
  - W5 closure push 후: V25-OPS 종료. R10/R9/#436 실행은 separate operator session

---

## §6 Constitution gates

| Gate | Triggers? | Note |
|---|---|---|
| Const III (schema) | NO | SQL/migration 작업 0 |
| Const VI (perf) | NO | perf claim 0 |
| Const VII (push) | YES — per-W or batched | W1 OK 면 W2 자동, 이후 batch |
| Phase -1 strategic | EXEMPT | §1 "thesis = codify, no extension" |

---

## §7 Wiki ID reservations

- wiki/501 = this master plan
- wiki/502, 502c = W1 plan + closure
- wiki/503, 503c = W2 plan + closure
- wiki/504, 504c = W3 plan + closure
- wiki/505, 505c = W4 plan + closure (doc A + doc B 묶음)
- wiki/506 = W5 closure (closure-only, no separate plan)
- next free: wiki/507

---

## §8 Risks + mitigations

| # | Risk | Mitigation |
|---|---|---|
| RV1 | Yak-shaving — writer 가 PLAN_TEMPLATE 에 "while we're at it" expansions | /loop W1 wall-clock cap 1 day. 초과 시 block-on-user prompt |
| RV2 | Banner copy 가 R6 README 변경 drift | W2 Auditor 가 R6 closure 와 banner wording diff |
| RV3 | R10 line numbers 가 mid-loop facade.rs 수정으로 drift | W3 closure 가 runbook 안에 commit SHA 박음 → line stability 보장 |
| RV4 | §9.12 attestation template 가 orchestrator-prefilled | W4 Auditor explicit check: empty stubs only |
| RV5 | #436 brief 가 commit range drift | brief 가 branch+commit-range 를 변수로 표기, operator confirm time 에 확정 |
| RV6 | V25-OPS 자체가 5 W 로 잘게 잘려서 over-engineering | each W LOW blast + single Auditor + ×2 LOC estimate 통일로 over-budget 감지 쉬움 |

---

## §9 Critical files (read-only references for all W)

- `docs/V24_QUAL_EVAL_2026_05_21.md` — 5 finding source. 모든 W가 인용
- `docs/V24_CLOSURE_2026_05_21.html` — W3 §4.1 보강, W5 cross-link
- `docs/V24_RUST_BIG_BANG_MASTER_PLAN_2026_05_20.md` — W1 PLAN_TEMPLATE 의 골격 source (§0, §4, §5, §7 패턴)
- `docs/V24_R5_WRITER_RS_PLAN_2026_05_20.md` + `V24_R6_INSTALLER_RS_PLAN_2026_05_20.md` — W1 §10 Critic Findings + §11 Auditor Findings 표 sample
- `README.md` — W2 top-level edit target
- `musu-rs/src/bridge/mod.rs` + `musu-rs/src/bridge/facade.rs` — W3 line number extraction (read-only)
- `~/.claude/projects/C--Users-empty/memory/feedback-strategic-critic-gate.md` — W1 memory 메모 format reference
- `~/.claude/projects/C--Users-empty/memory/MEMORY.md` — W1 끝에 3 entry 추가

---

## §10 Channel to V26 / next master plan

V25-OPS 결과 3 channel 이 V26 시작 시 자동 effective:

1. `~/.claude/projects/.../memory/feedback-phase0-scope-cutter.md` + `feedback-loc-estimate-x2.md` + `feedback-dual-audit-trigger-narrow.md` — orchestrator auto-loads MEMORY.md 마다, 새 master plan Phase -1/Phase 0/Phase 1 에 자동 적용
2. `docs/PLAN_TEMPLATE.md` — Planner Phase 1 시작 시 copy
3. README.md 배너 + R10 runbook + W4 brief — operator 결심 (R10 실행, #436 merge) 채널

---

## §11 Verification

- 각 W 끝나고: 해당 `docs/V25_OPS_W{N}_*.md` plan + closure 가 commit됨. branch 그대로 (`v24/rust-cleanup`).
- W1 끝: `~/.claude/projects/C--Users-empty/memory/feedback-{phase0-scope-cutter,loc-estimate-x2,dual-audit-trigger-narrow}.md` 3 파일 존재 + `MEMORY.md` index 3 줄 추가됨. `docs/PLAN_TEMPLATE.md` 존재.
- W2 끝: `git diff` 가 `README.md` + 5개 `musu-*/README.md` 변경 보여줌. `grep -r "deprecated.*R10" musu-bridge/ musu-core/ musu-control/ musu-indexer/ musu-writer/ README.md` 6 hit.
- W3 끝: `V24_CLOSURE_2026_05_21.html` §4.1 line count 증가, commit SHA reference 포함. `musu-rs/src/bridge/facade.rs` 의 정확한 line 인용.
- W4 끝: 2 new doc (`V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md`, `V25_OPS_W4_MAIN_MERGE_BRIEF_436.md`) commit. operator gate emit.
- W5 끝: `docs/V25_OPS_CLOSURE_2026_05_21.html` (wiki/506) commit + push 완료. V25-OPS 종료.

---

## §12 What does NOT change

- `v24/rust-cleanup` branch 유지 (W1..W5 다 그 위에)
- Python 25,885 LOC 코드 자체 (operator R10 manual)
- `MODE_Agent_Team.md` (~/.claude global) 수정 X — dual-audit / Phase -1 이미 명시
- V24_CLOSURE_2026_05_21.html §1..§3 유지 (W3 는 §4.1 만 보강)
- V24 closure 의 §9.12 operator-attested gate self (operator manual)
- musu-rs Rust 코드 0 변경 (W3 가 line number 읽기만, 수정 0)
- musu-bee TS 코드 0 변경
- CHANGELOG.md [1.14.0] entry (V24 이미 committed; V25-OPS 는 1.14.1 patch entry 추가는 W5 에서 결정)

---

## §13 Subagent invocation map (각 W 진입 시)

Per `MODE_Agent_Team.md`:

- **Phase 0 Researcher**: `Explore` (parallel 1-2). `deep-research-agent` 는 W1 만 (memory format research). 나머지 W 는 read-only `Explore` 충분.
- **Phase 1 Planner**: `Plan` agent — sub-WS detail plan 작성
- **Phase 1.5 Critic**: `system-architect` — plan adversarial review. HIGH 발견 시 plan revise → re-Critic.
- **Phase 3 Builder**: `technical-writer` (모든 W 가 doc 작업)
- **Phase 5 Auditor**: `quality-engineer` single (no dual — 어느 W 도 blast HIGH 아님)
- **Phase 7 Scribe**: `technical-writer` — closure doc (HTML for W5, markdown for W1-W4 plans, markdown closure for W1-W4)
- 각 W detail plan 안에 §10 Critic Findings (resolved) + §11 Auditor Findings 표 prefilled

각 W 가 끝나면 /loop heartbeat decision tree (`MODE_Agent_Team.md` §"/loop Heartbeat") 가 다음 W 진입 결정.

---

## §14 References

- `docs/V24_QUAL_EVAL_2026_05_21.md` — V25-OPS source of truth (5 findings)
- `docs/V24_CLOSURE_2026_05_21.html` — V24 master closure (wiki/500)
- `docs/V24_RUST_BIG_BANG_MASTER_PLAN_2026_05_20.md` — wiki/490 frame
- `docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md` — 4-layer thesis lock (untouched in V25-OPS)
- `CHANGELOG.md` [1.14.0] V24 entry
- Memory: [[feedback-no-python]], [[feedback-self-contained-product]], [[feedback-strategic-critic-gate]], [[feedback-no-yagni-architecture]], [[feedback-plan-stage-auditor]], [[feedback-const-vii-batched-approval]], [[feedback-scribe-html-only]], [[feedback-autonomous-loop]]
- Existing tasks: #553 (master commit), #554..#558 (W1..W5)
