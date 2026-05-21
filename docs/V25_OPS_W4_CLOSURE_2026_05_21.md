# V25-OPS W4 closure — §9.12 attestation HOW-TO + #436 main-merge brief

**Wiki ID**: wiki/505c
**Date**: 2026-05-21
**Branch**: `v24/rust-cleanup`
**Plan**: `docs/V25_OPS_W4_OPERATOR_BRIEFS_2026_05_21.md` (wiki/505)
**Master**: `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W4 + §4.4
**Status**: **SHIP-OK** — Critic 7 findings (0 HIGH + 2 MED + 2 LOW + 3 INFO) all resolved, Auditor self pass with **Goodhart firewall verified preserved** (CRITICAL gate)

---

## §1 What shipped

4 file touches in upcoming single commit:

| # | Path | Action | LOC |
|---|---|---|---|
| 1 | `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` | new | ~190 |
| 2 | `docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` | new | ~140 |
| 3 | `docs/V25_OPS_W4_OPERATOR_BRIEFS_2026_05_21.md` | new (this plan) | ~280 |
| 4 | `docs/V25_OPS_W4_CLOSURE_2026_05_21.md` | new (this closure) | ~140 |

Net operator-facing artifact LOC: 190 + 140 = **330**. master §3 W4 ceiling = 250 → 500. floor 230/460, ceiling 250/500. shipped 가 ceiling 안 — doc-only under-ship pattern (W2 + W3 precedent).

---

## §2 Phase chain summary

| Phase | Agent | Output | Findings |
|---|---|---|---|
| 0 (Researcher) | `Explore` | (A) §9.12 4 stub field + 4 forbidden prefill line; (B) attestation keywords V24_CLOSURE 분포; (C) #436 4 master bundle + V23 closure file list; (D) forensic property (git authorship + terminal history + audit_log); (E) Const VII main 정의 | — (no frame correction; brief 가 명확) |
| 1 (Planner) | orchestrator-direct | W4 plan with D1-D6 + F1, §6 10-item acceptance | F1 = doc A 는 HOW-TO (사용법), template 자체 아님 — Phase 0 (A) 확인 |
| 1.5 (Critic) | self-orchestrator | 7 findings: 0 HIGH + 2 MED (C1 placeholder strict, C2 date constraint) + 2 LOW (C3 V25-OPS bundle, C4 --no-ff) + 3 INFO | 모두 Doc A/B 작성 시 반영 |
| 3 (Builder) | orchestrator-direct | Doc A (190 LOC) + Doc B (140 LOC); self-grep §6 모두 pass | **CRITICAL Goodhart firewall check**: `grep emptyermind@gmail\|F:\\Aisaak` Doc A = **0 hits** |
| 5 (Auditor) | self-orchestrator (single, dual-audit 면제) | 0 finding | §6.1-§6.8 mechanical pass + Goodhart firewall preserved |
| 7 (Scribe) | orchestrator-direct (this doc) | wiki/505c | — |

---

## §3 5 V24 findings codification — W4 contribution

**W4 = finding 5 의 가장 sensitive 절반** — Goodhart firewall preserve while making R10 operator path executable.

W1 = finding 1+2+3 + #4 (memory + template). W2 = finding 5 (visibility banner). W3 = finding 5 (runbook completeness). **W4 = finding 5 (operator authority surface — §9.12 attestation + #436 merge)**.

R10 operator decision path 가 완성된 모습 (W1 + W2 + W3 + W4):
1. operator 가 working tree 보면서 musu-bridge/ 등 deprecated 표기 발견 (W2)
2. banner click → V24_CLOSURE §4 (deletion target) (W2 cross-link)
3. §4.1 R10 runbook step-by-step (W3 100% complete)
4. R10 실행 후 §5 §9.12 attestation 작성 (**W4 doc A HOW-TO**)
5. V24 close → #436 main-merge brief 검토 (**W4 doc B brief**)
6. operator main-merge execute (operator authority)
7. V25-OPS W5 closure (V25-OPS 종료)

step 1-3, 6 = W2-W3 produced visibility/runbook. step 4-5 = W4 produced HOW-TO + brief (orchestrator absent surface). step 7 = W5 (next).

---

## §4 Critic + Auditor findings 명시 해소

**C1 MED (D2 strict placeholder vs example shape)** — RESOLVED in Doc A:
- §3 의 audit_log query template (`<COMPANY_ID>`, `<DATE>` placeholder), git config command (shape only)
- §6 operator workflow 가 placeholder values 만 — actual operator data 0

**C2 MED (date constraint)** — RESOLVED in Doc A §2 Date row:
- "R10 ship date OR earlier acceptance date (R8 ship date if R8 considered acceptance milestone) — operator choice"
- §3.4 가 추가 명확화: format `yyyy-mm-dd` strict

**C3 LOW (V25-OPS bundle)** — RESOLVED in Doc B §2 last paragraph:
- "V25-OPS 자체 (W1-W5) 는 V24 운영 마무리이므로 자연스럽게 V24 bundle 안 포함. 별도 master 로 분리 X"

**C4 LOW (merge command choice)** — RESOLVED in Doc B §5:
- default `--no-ff` (merge commit preserves branch context) + dry-run `git merge --no-commit`
- operator preference 시 `--ff-only` 옵션 명시

**C5 INFO (audit_log Windows compat)** — RESOLVED in Doc A §3.1 parenthetical:
- `$env:USERPROFILE\.musu\audit.db` Windows path
- sqlite3 CLI = Windows + WSL + bash all

**C6 INFO (LOC under-estimate)** — flagged for W5 retrospective:
- doc-only W4 actual 330 < master ceiling 500. [[feedback-loc-estimate-x2]] doc-only exception clause 확장 후보

**C7 INFO (Doc A §7 commit step)** — kept as-is:
- "commit step 11 is the load-bearing forensic act" — git authorship 가 forensic property 핵심

**Auditor SHIP-OK** — Goodhart firewall preserved (Doc A 안 실제 operator data 0 hits + 4 V24_CLOSURE line refs literal + "DO NOT" + "orchestrator" 다수 hit + Doc B closure cross-link 9 hits + commit hash 변수만 + merge template literal).

---

## §5 Self-application validation

| Rule | W4 적용 | 통과? |
|---|---|---|
| Phase 0 scope cutter | F1 = doc A 가 HOW-TO (사용법), template 자체 아님 — V24_CLOSURE §5 가 이미 template. plan §1.1 F1 row | ✓ (4th frame correction instance) |
| LOC ×2 | base 250/500. shipped 330. ceiling 안 under-ship — doc-only pattern (W2 165 + W3 140 LOC). [[feedback-loc-estimate-x2]] doc-only exception refinement candidate | ✓ |
| Dual-audit narrow trigger | W4 = doc-only, no actual auth code. *documentation about* operator authority 는 dual-audit trigger 아님 — single Auditor 정당화 명시. Auditor 가 Goodhart firewall check 를 single-pass mechanical grep 로 수행 | ✓ |
| Phase -1 EXEMPT | V25-OPS 전체 EXEMPT | ✓ |
| Out of scope (operator manual) | §1 OUT 의 "§9.12 attestation block 본문 자체 작성" + "실제 main merge 실행" + "Const VII gate 정의 변경" 모두 operator-manual | ✓ |

특히 W4 의 가장 중요한 self-application: **본 W4 가 작성하는 Doc A 자체가 V24 §9.12 의 attestation 본문이 아니라 HOW-TO** — 그것이 Goodhart firewall preserve. W4 가 orchestrator 인 채로 attestation HOW-TO 를 작성하는 게 OK (HOW-TO 가 attestation 자체가 아니므로). attestation 본문 작성은 operator 만.

---

## §6 What changed in repo

upcoming commit (this Const VII):
- `+ docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` (~190 LOC)
- `+ docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` (~140 LOC)
- `+ docs/V25_OPS_W4_OPERATOR_BRIEFS_2026_05_21.md` (~280 LOC, this plan)
- `+ docs/V25_OPS_W4_CLOSURE_2026_05_21.md` (~140 LOC, this closure)

operator 가 R10 결심 시점에 다음 file 들 sequence 로 navigation:
1. `README.md` (W2 Status column) — visual
2. `musu-bridge/README.md` (W2 banner) — module-level
3. `docs/V24_CLOSURE_2026_05_21.html` §4 + §4.1 + §4.1.1 (W2+W3) — deletion runbook complete
4. `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` (W4) — §9.12 작성법
5. `docs/V24_CLOSURE_2026_05_21.html` §5 (operator-authored) — attestation 본문
6. `docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` (W4) — #436 main-merge 결심
7. `git checkout main && git merge ...` (operator manual)

---

## §7 Next sub-WS

W5 (wiki/506) — V25-OPS 자체 closure HTML. [[feedback-scribe-html-only]] 적용: master closure 는 HTML.

W5 scope:
- V25-OPS 5 W 결과 정리 + Phase -1 EXEMPT 이유 기록
- V24 retrospective doc (`V24_QUAL_EVAL_2026_05_21.md`) cross-link
- 3 memory 메모 + PLAN_TEMPLATE + R10 runbook completeness + 5 banner + 2 W4 brief 전체 인덱스
- V26 master plan 진입점 명시
- [[feedback-loc-estimate-x2]] doc-only exception clause 확장 검토 (W2 A3 + W3 C7 + W4 C6 의 INFO finding 종합)

W5 가 dual-audit trigger 아님 (HTML doc, no install/migration/auth/one-way blast). single Auditor.

---

## §8 References

- `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W4 + §4.4
- `docs/V25_OPS_W4_OPERATOR_BRIEFS_2026_05_21.md` (wiki/505) — plan v1 (no v2 needed)
- `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` (sibling, wiki/505 group)
- `docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` (sibling, wiki/505 group)
- `docs/V25_OPS_W3_CLOSURE_2026_05_21.md` (wiki/504c) — W3 closure precedent
- `docs/V24_CLOSURE_2026_05_21.html` §5 §9.12 — attestation target (Doc A target)
- `docs/GOAL.md` L166 — #436 task definition
- Memory: [[feedback-no-python]], [[feedback-scribe-html-only]] (W5 HTML mandate), [[feedback-const-vii-batched-approval]] (W4 main 은 batched 제외), [[feedback-strategic-critic-gate]] (Goodhart firewall connection), [[feedback-phase0-scope-cutter]] (F1 frame), [[feedback-loc-estimate-x2]] (doc-only exception candidate), [[feedback-dual-audit-trigger-narrow]] (W4 single-Auditor 정당)
