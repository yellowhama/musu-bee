# V25-OPS W4 — §9.12 attestation HOW-TO + #436 main-merge brief (detail plan)

**Wiki ID**: wiki/505 (this plan) + wiki/505c (closure)
**Date**: 2026-05-21
**Branch**: `v24/rust-cleanup`
**Master plan**: `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W4 row, §4.4
**Estimate**: artifacts 250 → **500 LOC markdown ×2** (master ceiling)
**Builder**: orchestrator-direct
**Critic**: `system-architect` (single — no auth code, no migration, no install, no irreversible op. §9.12 HOW-TO 는 *documentation about* operator authority, 실제 auth code 변경 0)
**Auditor**: `quality-engineer` (single — same 4 conditions 0 match). **Auditor 의 가장 중요한 check: doc A 가 orchestrator-prefillable 형태로 작성됐는지 (Goodhart firewall preserved)**.

---

## §1 Scope

**IN** (2 new doc):
1. `F:\workspace\musu-bee\docs\V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` (new) — operator 가 V24 closure §9.12 attestation block 어디에 / 어떻게 작성하는지. 4 forbidden prefill line 명시. audit_log + git log query template.
2. `F:\workspace\musu-bee\docs\V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` (new) — V23.3 + V23.4 Tier-1 + V23.5 + V24 묶음을 main 으로 merge 할 때 operator 가 보는 brief. closure docs cross-link, branch + commit-range variable, merge command outline.

**OUT** (W4 가 절대 손대지 않음):
- §9.12 attestation block 본문 자체 작성 (orchestrator absent surface — Goodhart firewall preserve)
- `docs/V24_CLOSURE_2026_05_21.html` §5 (attestation block 본문) 의 stub field 채움
- 실제 main merge 실행 (operator manual gate — operator authority)
- V23/V24 closure docs (wiki/396, wiki/447, wiki/485+, wiki/500) 본문 수정
- Const VII gate 정의 변경 — V24 가 이미 batched approval pattern lock
- `GOAL.md` #436 task entry 수정 — operator-domain
- W3 의 R10 runbook (이미 W3 가 완성)
- W5 task

---

## §1.1 Locked decisions

| ID | Decision | Source |
|---|---|---|
| D1 | Doc A (`GOODHART_ATTESTATION_HOWTO.md`) 는 V24_CLOSURE §5 의 stub field 4 개 (`Task 1/2/3 details` L218-220, `Reproducibility attestation` L223, `Operator signature` L225, `Date` L226) 를 **target field** 로 명시. 각 field 당 operator-fill 방법 (audit_log query, git log query, terminal history reference) + orchestrator-no-prefill 의무 | Phase 0 (A) |
| D2 | Doc A 의 모든 example query (audit_log, git log) 는 **placeholder** (`<COMPANY_ID>`, `<DATE>`) 만 사용. 실제 operator data 박지 말 것 — 그 자체가 prefill | Phase 0 (D) forensic property |
| D3 | Doc B (`MAIN_MERGE_BRIEF_436.md`) 는 **commit range 를 변수로 표기**. operator 가 merge time 에 `git rev-parse` 로 확정. 본 W4 가 commit hash 박지 말 것 — V25-OPS-W5 closure 까지 commit 추가될 수 있음 | Phase 0 (C) #436 backlog |
| D4 | Doc B 는 closure docs cross-link 만 — `V23_3_FINAL_CLOSURE_2026_05_17.md` (wiki/396), `V23_4_PHASE4_FINAL_CLOSURE_2026_05_19.html` (wiki/447), `V23_5_FINAL_CLOSURE_*` (wiki/485+), `V24_CLOSURE_2026_05_21.html` (wiki/500). 본문 인용 X | Phase 0 (C) |
| D5 | Doc B 의 merge command 는 **template** (`git checkout main && git merge --no-ff <branch>` 패턴). operator 가 branch 이름 확정 후 실행. dry-run step (`git merge --no-commit`) 명시 | Phase 0 (E) Const VII per-push |
| D6 | Doc A 의 attestation 의 date constraint = "R10 ship date ±7 days". 본 W4 가 R10 ship date 알 수 없음 (operator manual gate) — placeholder `<R10_SHIP_DATE>` 만 | Phase 0 (D) recommendation |
| **F1 (Phase 0 frame correction)** | initial brief 가 doc A 를 "attestation template" 이라 표현 가능 — but V24_CLOSURE §5 가 이미 template. doc A 는 **HOW-TO** (template 사용법), template 자체 X. 차이 명확. | Phase 0 (A) — V24_CLOSURE L212-227 이 이미 stub template |

---

## §2 Stack

`N/A (markdown-only doc work)`

---

## §3 Module touch list

| # | Path | Action | LOC est ×2 | Notes |
|---|---|---|---|---|
| 1 | `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` | new | 130 → **260** | §1 what is §9.12 + §2 4 stub field 명시 + §3 operator-fill method (per field) + §4 orchestrator-no-prefill 의무 + §5 forensic property + §6 example operator workflow |
| 2 | `docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` | new | 100 → **200** | §1 what is #436 + §2 묶음 4 master plan (V23.3/V23.4/V23.5/V24) + §3 closure docs cross-link + §4 branch + commit range variables + §5 merge command template + §6 post-merge verification |

**Total**: 230 → **460 LOC markdown**. master §3 W4 ceiling = 250 → 500. floor 230/460, ceiling 250/500 — gap 40 LOC reserve (§10/§11). doc-only 라 actual 더 적을 가능성 ([[feedback-loc-estimate-x2]] doc-only exception candidate, W2 + W3 A3/C7 INFO precedent).

---

## §4 Schema delta

`N/A`

---

## §5 Order of operations

1. **Doc A (`GOODHART_ATTESTATION_HOWTO.md`) 작성**:
   - §1 short intro: §9.12 가 무엇인지, 왜 ungameable (Goodhart firewall)
   - §2 4 target fields enumerated with V24_CLOSURE line refs (L218, L219, L220, L225) — but data X
   - §3 per-field HOW-TO: audit_log query template, git log template, terminal history reference, date format
   - §4 orchestrator-no-prefill rules (explicit "DO NOT" list)
   - §5 forensic property explanation
   - §6 operator workflow example (placeholder values)
2. **Doc B (`MAIN_MERGE_BRIEF_436.md`) 작성**:
   - §1 #436 task definition (per GOAL.md L166)
   - §2 4 master plan bundle: V23.3 / V23.4 Tier-1 / V23.5 / V24 — short summary per master
   - §3 closure docs links (wiki/396, wiki/447, wiki/485+, wiki/500) — relative paths
   - §4 branch + commit range as variables (`<V23_3_HEAD>`, `<V23_4_HEAD>`, etc.) — operator confirm at merge time
   - §5 merge command template: `git checkout main && git merge --no-commit <branch>` + dry-run preview
   - §6 post-merge verification: smoke test V24 R8 + audit_log row sanity
3. **self-grep §6 acceptance** — placeholder check (no real operator data leaked into either doc)
4. **plan §10 Critic findings table populate** (self-Critic — W3 pattern)
5. **Const VII single commit** with both docs + W4 plan

---

## §6 Acceptance criteria

1. `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` exists. Contains §1-§6 section structure as designed.
2. Doc A 안에 V24_CLOSURE 4 target field line numbers explicit literal: `L218` + `L219` + `L220` + `L225` (또는 `Line 218` 등) 모두 명시.
3. Doc A 안에 **"DO NOT"** + **"orchestrator"** 키워드 모두 1 hit 이상 — orchestrator-no-prefill rule explicit.
4. Doc A 의 audit_log query example 가 placeholder (`<COMPANY_ID>`, `<DATE>`, `<OPERATOR_HOSTNAME>` 등) 만. **실제 operator 정보 (`emptyermind@gmail.com`, `F:\Aisaak\Projects\land-os` 같은 path) zero 박힘** — Auditor strict check.
5. Doc B (`MAIN_MERGE_BRIEF_436.md`) exists. Contains §1-§6 section structure.
6. Doc B 안에 4 closure doc cross-link 모두 literal: `V23_3_FINAL_CLOSURE_2026_05_17.md` + `V23_4_PHASE4_FINAL_CLOSURE_2026_05_19.html` + `V23_5_FINAL_CLOSURE_*` + `V24_CLOSURE_2026_05_21.html`. wiki ID (wiki/396, wiki/447, wiki/485+, wiki/500) 도 명시.
7. Doc B 안의 commit hash 는 **변수** 만 (`<V23_3_HEAD>`, `<V23_4_TIER1_HEAD>`, `<V23_5_HEAD>`, `<V24_HEAD>`). 실제 7-char hash 박지 말 것 — V25-OPS W5 까지 commit 추가될 가능성.
8. Doc B 의 merge command template 가 `git merge --no-commit` (dry-run) + 본 commit 둘 다 명시.
9. 두 doc 모두 V24-specific reference 가 callout 으로 적절히 처리 — 본문에 operator personal data 0 박힘.
10. Const VII single commit: 두 doc + W4 plan + W4 closure (또는 plan + closure 별 commit). batched per [[feedback-const-vii-batched-approval]].

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| RV4-1 | HIGH | Doc A 가 attestation 본문 example 을 너무 구체적으로 = orchestrator-prefill 시작 | §6.4 Auditor strict check + D2 placeholder only |
| RV4-2 | HIGH | Doc B 가 commit hash 박음 → V25-OPS W5 까지 commit 추가 시 stale | D3 + §6.7 variable only |
| RV4-3 | MED | Doc A 의 audit_log query 가 actual SQL 잘못 = operator 가 따라할 때 syntax error | sqlite SQL syntax verify (`select ... where actor_ip != 'testclient' order by timestamp desc limit 10`) — V24_CLOSURE 가 이미 정확한 표현 reference |
| RV4-4 | MED | Doc B 의 merge command template 가 `--no-ff` vs `--ff-only` ambiguous | D5 `--no-ff` + `--no-commit` (dry-run 가능) 명시 |
| RV4-5 | LOW | 두 doc 의 cross-link 가 broken (V23.5 closure 파일 name 미확정) | Phase 0 (C) 가 `V23_5_FINAL_CLOSURE_*` glob 사용 — operator confirm at merge time |
| RV4-6 | LOW | Doc A 의 date ±7 days constraint 가 operator 에게 가시성 부족 (one-line) | §6.6 explicit + format example (`yyyy-mm-dd`) |
| RV4-7 | LOW | Doc B 가 V25-OPS 자체를 main merge bundle 에 포함 시 — 그러면 V25-OPS W5 closure 후 #436 trigger | accepted: V25-OPS 가 V24 운영 마무리 → V24 bundle 안에 자연스럽게 포함. 명시. |

---

## §8 Critic seed

- D2 placeholder-only 가 strict 한가? operator 가 "이 placeholder 가 어떤 format 인지 모르겠다" 할 때 example data 가 필요? trade-off?
- §9.12 의 ungameability 가 정말 git authorship + terminal history 둘 다 require 인가? Phase 0 (A) line 229 가 정확히 그렇게 표현?
- Doc B 가 V25-OPS 자체를 #436 bundle 에 포함하나? V25-OPS W5 closure 가 #436 trigger 인가? 또는 V25-OPS 가 V24 운영 마무리이므로 자연스럽게 V24 bundle 안?
- Doc A 의 §4 "DO NOT" list 가 enumerated 인가, narrative 인가? Critic 권장 = enumerated (mechanical check 가능).
- Doc B 의 merge command 가 `--no-ff` 인 게 맞나? operator preference 가 fast-forward 일 수도 — choice 명시.
- §9.12 attestation 의 date 가 R10 ship date ±7 days constraint 인 게 맞나? operator 가 R10 안 한 상태에서 attestation 할 수도 — 그러면 date constraint different.
- Doc A 의 audit_log query 가 PowerShell 에서 sqlite3 호출 형태 보장? Windows operator 가 따라할 수 있어야.

---

## §10 Critic Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| C1 | MED | D2 strict placeholder vs example shape | operator 가 placeholder 만 보고 format 이해 어려움 risk | clarify: "example shape (data type)" 는 prefill 아님 — actual operator data (email/path/hostname) 만 prefill 금지. Doc A §3 의 audit_log query template + git config command 둘 다 shape only, no real data |
| C2 | MED | §9.12 date constraint | initial brief = "R10 ship date ±7 days" 지만 operator 가 R8 acceptance 기준 attestation 가능 | Doc A §2 Date row revised: "R10 ship date OR earlier acceptance date (R8 ship date if R8 considered acceptance milestone) — operator choice" |
| C3 | LOW | V25-OPS bundle inclusion | V25-OPS 자체가 #436 bundle 에 포함되나? V25-OPS 가 V24 운영 마무리 → V24 bundle 안 자연포함 | Doc B §2 last paragraph 명시: "V25-OPS 자체 (W1-W5) 는 V24 운영 마무리이므로 자연스럽게 V24 bundle 안 포함" |
| C4 | LOW | merge command --no-ff vs --ff-only | operator preference 차이 | Doc B §5 default = `--no-ff` (merge commit preserves context), operator preference 시 `--ff-only` 옵션 명시 |
| C5 | INFO | audit_log query Windows compat | operator 가 PowerShell 에서 sqlite3 호출 시 syntax 차이 | Doc A §3.1 parenthetical: `$env:USERPROFILE\.musu\audit.db` Windows path, sqlite3 CLI 가 Windows + WSL + bash 모두 동작 |
| C6 | INFO | LOC under-estimate possible | doc-only W4 가 master ceiling 500 보다 적게 ship 가능 (W2 + W3 pattern) | W5 closure 의 retrospective 에서 [[feedback-loc-estimate-x2]] doc-only exception clause 확장 검토 |
| C7 | INFO | Doc A §7 commit step 11 | "commit step 11 is the load-bearing forensic act" 명시 — git authorship 가 forensic property 의 핵심 | accepted, no change |

(Critic v1: self-orchestrator Phase 1.5, 2026-05-21. 0 HIGH + 2 MED + 2 LOW + 3 INFO. MED 2 + LOW 2 모두 Doc A/B 작성 시 반영. external Critic agent skip: W4 가 doc-only + Goodhart firewall check 가 mechanical grep, judgment call 영역 적음. re-Critic 불요.)

---

## §11 Auditor Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| — | — | — | (no HIGH findings; self-audit mechanical pass — CRITICAL Goodhart firewall check: grep `emptyermind@gmail\|F:\\Aisaak` in Doc A = **0 hits** (zero orchestrator-prefilled operator data). §6.2 V24_CLOSURE 4 line refs (L218/L219/L220/L225) 4 hits. §6.3 "DO NOT" 7 hits + "orchestrator" 16 hits (rule explicit). §6.6 Doc B closure docs cross-link 9 hits (V23_3_FINAL_CLOSURE / V23_4_PHASE4_FINAL_CLOSURE / V23_5_FINAL_CLOSURE / V24_CLOSURE all literal). §6.7 commit hash variables (`<V23_3_HEAD>` / `V23_3_HEAD=$(...)` 2 hits) only. §6.8 merge command template `git merge --no-commit` + `--no-ff` + `--ff-only` all literal.) | n/a |

(Auditor: self-orchestrator Phase 5 single, 2026-05-21. 0 HIGH + 0 MED + 0 LOW + 0 INFO. SHIP-OK with Goodhart firewall verified preserved. Dual-audit 4 조건 0 매치 (doc-only, no actual auth/migration/install/one-way blast). Doc A 자체가 attestation document 의 HOW-TO 라 *documentation about* operator authority 이지 실제 auth code 아님 — single Auditor 정당.)

---

## §12 References

- `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W4 + §4.4
- `docs/V24_CLOSURE_2026_05_21.html` §5 §9.12 attestation block (L212-229)
- `docs/GOAL.md` L166, L170, L252 — #436 backlog
- `docs/V23_3_FINAL_CLOSURE_2026_05_17.md` (wiki/396)
- `docs/V23_4_PHASE4_FINAL_CLOSURE_2026_05_19.html` (wiki/447)
- `docs/V23_5_FINAL_CLOSURE_*` (wiki/485+)
- `docs/PLAN_TEMPLATE.md` §5 master + sub-WS Const VII gate
- Memory: [[feedback-no-python]], [[feedback-scribe-html-only]], [[feedback-const-vii-batched-approval]], [[feedback-strategic-critic-gate]] (Goodhart firewall connection), [[feedback-phase0-scope-cutter]] (F1 frame correction), [[feedback-loc-estimate-x2]] (doc-only ×2 over-estimate)
