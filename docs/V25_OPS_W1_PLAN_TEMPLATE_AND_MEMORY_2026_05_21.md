# V25-OPS W1 — `PLAN_TEMPLATE.md` + 3 memory feedback notes (detail plan)

**Wiki ID**: wiki/502 (this plan) + wiki/502c (closure, post-Build)
**Date**: 2026-05-21
**Branch**: `v24/rust-cleanup`
**Master plan**: `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W1 row, §4.1
**Estimate** (plan-as-spec, Critic-revised v2): artifacts 270 → **540 LOC markdown ×2** (reconciled to master §3 W1 row via "master = ceiling, detail = floor; gap reserves for Critic/Auditor row growth")
**Builder**: `technical-writer`
**Critic**: `system-architect` (single, doc-only → not dual)
**Auditor**: `quality-engineer` (single — W1 fails all 4 dual-audit conditions: no installer, no migration, no auth, no one-way op)

---

## §1 Scope

**IN** (5 file touches):
1. `F:\workspace\musu-bee\docs\PLAN_TEMPLATE.md` (new) — master plan skeleton + sub-WS detail plan skeleton, **두 버전 한 파일에**
2. `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-phase0-scope-cutter.md` (new)
3. `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-loc-estimate-x2.md` (new)
4. `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-dual-audit-trigger-narrow.md` (new)
5. `C:\Users\empty\.claude\projects\C--Users-empty\memory\MEMORY.md` (edit, +3 lines under existing feedback group)

**OUT** (W1 가 절대 손대지 않음):
- V26 master plan **본문** 작성 (W1 은 template skeleton 만)
- `PLAN_TEMPLATE.md` 의 sub-WS table 예시 row 채우기 — skeleton 만, V25-OPS W1..W5 의 specifics 박지 말 것 (Critic MED#1)
- 각 memo body 의 `[[cross-link]]` 는 **directly-relevant 3개 이하**. 전수 link 금지 (Critic MED#1)
- `PLAN_TEMPLATE.md` 안에 V24-specific literal (V25-OPS / V24 / R5 / R6 / musu-bridge / facade.rs / "Python 25,885" 등) zero 박힘 — V-agnostic generic (Critic MED#1)
- W2 deprecation banners (W2 자체 task)
- W3 R10 runbook line numbers (W3 자체 task)
- W4 operator briefs (W4 자체 task)
- W5 closure HTML (W5 자체 task)
- R10 Python deletion 실행 (operator manual)
- `MODE_Agent_Team.md` (`~/.claude/MODE_*`) 수정 — global file 은 그대로
- musu-rs / musu-bee 소스 0 변경

---

## §1.1 Locked decisions

| ID | Decision | Source |
|---|---|---|
| D1 | `PLAN_TEMPLATE.md` 한 파일에 `# Master Plan Skeleton` + `# Sub-WS Detail Plan Skeleton` 두 H1 한꺼번에 (separate file 분리 X) | Phase 0 Researcher (b) §C — V26 Planner 가 한 곳에서 copy |
| D2 (Critic-revised) | Memory frontmatter top-level keys 정확히 3 개: `name` (kebab-case slug), `description` (one-line, quoted OK, no length lock), `metadata` (block). `metadata` block 안에 **최소** `node_type: memory` + `type: feedback`. `originSessionId` 는 신규 memo 에서 생략 가능. 다른 top-level key 금지 (YAML 2-space indent under `metadata`) | Critic HIGH#1 — ground truth: 9 reference memo 모두 4-key metadata block. 정확한 예시: feedback-strategic-critic-gate.md:1-8 |
| D3 | MEMORY.md index 3 line 추가는 single atomic edit, 기존 feedback group (현재 12 lines) 뒤에 append | Phase 0 Researcher (a) MEMORY.md L8-10 분석 |
| D4 | 4 new file + 1 edit = single git commit, Const VII per-W push gate 한 번에 통과 | master §4 |
| D5 (Critic-revised) | 각 memory body ≥ ~1.0 KB (Why + How to apply + ≥1 cross-link 충분히 carry). upper bound 없음. > 5 KB 면 review flag (informational, gate 아님). 9 reference memo 실측 distribution: 1.8 KB ~ 7.0 KB, 평균 2.8 KB | Critic HIGH#2 — actual stat across 9 feedback-*.md, plan-stage-auditor 가 7 KB 정상 |
| D6 | PLAN_TEMPLATE.md 안에 5 Finding 모두 explicit string match 가능하게 inject (grep test 통과 가능) | master §1, V24_QUAL_EVAL §1–§10 |

---

## §2 Stack

`N/A (doc-only, markdown + YAML frontmatter)`

---

## §3 Module touch list

| # | Path | Action | LOC est ×2 | Notes |
|---|---|---|---|---|
| 1 | `docs/PLAN_TEMPLATE.md` | new | 150 → **300** | master half (§0..§9) + sub-WS half (§1..§11) |
| 2 | `~/.claude/.../memory/feedback-phase0-scope-cutter.md` | new | 40 → **80** | YAML+body. 1.8-3.5 KB target |
| 3 | `~/.claude/.../memory/feedback-loc-estimate-x2.md` | new | 40 → **80** | YAML+body. 1.8-3.5 KB target |
| 4 | `~/.claude/.../memory/feedback-dual-audit-trigger-narrow.md` | new | 40 → **80** | YAML+body. 1.8-3.5 KB target |
| 5 | `~/.claude/.../memory/MEMORY.md` | edit | +3 lines | feedback group append |

**Total** (Critic-revised v2): 150 + 40 + 40 + 40 + 3 = **273 base → 546 ×2**. Master §3 W1 row (400 → 800) 는 ceiling, 본 detail 표는 floor. gap (master ceiling − detail floor) 은 §10 Critic Findings + §11 Auditor Findings row 추가 reserve (per Critic HIGH#4 resolution: master = ceiling, detail = floor).

---

## §4 Schema delta

`N/A (no DB / Const III not triggered)`

---

## §5 Order of operations

Builder execution sequence (sequential, no parallel):

1. **3 memory notes 먼저** (smallest, format-strict). YAML frontmatter + body 작성. 각 1.5-2.5 KB 목표. Phase 0 Researcher (a) 의 skeleton 그대로 사용 (이미 word-by-word draft 존재).
2. **MEMORY.md index 편집** — 위 3 memo 작성 후, MEMORY.md 의 기존 feedback group 끝 (현재 line 18 근처) 에 3 new line append. 각 line format `- [Title](file.md) — hook <~120 chars`. slug 가 file name 과 정확히 match.
3. **PLAN_TEMPLATE.md master half 작성** — §0 Strategic Gate (Phase -1 verdict 받는 자리 + GREEN/YELLOW/RED + table column 형식 hint), §1 Thesis + Scope (IN/OUT), §2 Sub-WS table (LOC est ×2 column literal), §3 Sequence, §4 Const gates, §5 Sub-WS detail specs (dual-audit trigger **4 조건 enumerated**), §7 Risks, §9 Acceptance (≥10 placeholder, last = operator-attested ungameable).
4. **PLAN_TEMPLATE.md sub-WS half 작성** — §1 Scope IN/OUT, §1.1 Locked decisions table, §2 Stack, §3 Module touch list, §4 Schema, §5 Order of operations, §6 Acceptance, §7 Risks, §8 Critic seed (Researcher 가 frame correction 적용한 적 있다는 explicit hint), §10 Critic Findings table (header only), §11 Auditor Findings table (header only).
5. **self-grep check** — Builder commit 전 5 Finding 의 explicit string anchor 5개 확인 (acceptance §6.9 와 같음):
   - "Phase 0" + "scope cut" 동시 hit
   - "×2" literal
   - "dual-audit" + 4 조건 list (`install` + `migration` + `auth` + `one-way`)
   - "Phase -1" + "YELLOW"
   - "Python" + "deprecation" + "operator manual"
6. **cross-link verify** — 각 memo body 의 `[[…]]` reference 가 (a) 기존 memo 거나 (b) 본 PR 안의 신규 memo 거나. MEMORY.md 각 line slug 가 memo file name 의 `name` field 와 정확히 match.
7. **단일 git commit** — 5 file touch 다 묶어서. Const VII per-W gate.

이유: memo format 에러 시 MEMORY.md index 줄도 invalid → memo 먼저 → index 나중. PLAN_TEMPLATE 의 sub-WS half 는 master half copy + 조정이라 master half 가 prior.

---

## §6 Acceptance criteria

1. `docs/PLAN_TEMPLATE.md` exists. Contains both H1 headers (`# Master Plan Skeleton` and `# Sub-WS Detail Plan Skeleton`). grep test: 2 H1.
2. Master half §5 contains **4 enumerated** dual-audit trigger conditions (text "install" + "migration" + "auth" + "one-way" 모두 hit, numbered list 1.-4. 형식).
3. Master §2 sub-WS table header literal "LOC est ×2" — 정확한 string (×2 ASCII 또는 unicode 둘 중 하나로 통일, sub-WS half 와 일관).
4. Master §9 Acceptance template lists ≥10 placeholder rows. 마지막 row label 에 "operator-attested" 또는 "ungameable" 문구 포함.
5. Sub-WS half contains §1, §1.1, §3, §6, §7, §8, §10, §11 (모두 section headers grep).
6. 3 memory file 각각: (a) YAML frontmatter parse 가능 — top-level 3 keys (`name`, `description`, `metadata`); `metadata` block 안에 `node_type: memory` + `type: feedback` 둘 다 존재 (Critic HIGH#1 ground truth), (b) body 에 literal `**Why:**` + `**How to apply:**` heading 둘 다 존재, (c) body ≥ 1.0 KB, > 5 KB 면 informational flag (Critic HIGH#2 distribution).
7. `MEMORY.md` 에 3 new index line 추가됨. 각 line format `- [Title](feedback-*.md) — hook` 정합. hook ≤ 120 chars. slug 가 memo file name 의 `name` field 와 byte-identical.
8. Self-consistency (Critic HIGH#3 replacement): 본 detail plan 의 §1.1 D1..D6 가 명시한 artifact section 이 PLAN_TEMPLATE.md 안에 모두 대응. line count gate 폐지 — Critic + Auditor row 추가가 정상 작동을 punish 하면 안 됨.
9. 5 Finding traceability (Critic MED#2 revised — Finding 5 generic-ized):
   - Finding 1: PLAN_TEMPLATE.md 안에 "Phase 0" near "scope" near ("cut" OR "frame correction")
   - Finding 2: literal "×2" (Unicode U+00D7) in LOC est column header
   - Finding 3: "dual-audit" + 4 condition list (1-3 = common-case instances, 4 = catch-all "one-way blast radius")
   - Finding 4: "Phase -1" + ("YELLOW" OR "panel verdict") format
   - Finding 5 (generic-ized): "operator manual gate" 문구 + "Out of scope (operator manual)" subsection. V24-specific "Python" / "musu-bridge" / "25,885" literal **금지** (Critic MED#1). V24 사례는 callout 박스로만 mention 가능 ("Example (V24): …").
10. V-agnostic check: grep PLAN_TEMPLATE.md for literal strings "V25-OPS", "V24", "R5", "R6", "musu-bridge", "facade.rs", "Python 25,885" — **zero hits** (template 은 V-agnostic).
11. Const VII gate: 5 file touch single commit. push 후 remote sync.

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| RV1-1 | HIGH | Yak-shaving — Builder 가 PLAN_TEMPLATE 에 V26 master plan 본문 작성 시작 | §1 OUT 명시 + §6.5 dual-H1 grep + §6.10 V-agnostic literal-zero grep |
| RV1-2 | HIGH | Memory frontmatter drift (top-level 3 key + metadata sub-block 정확히) → loader invalidate | D2 revised + §6.6 (a) grep test = top-level (name/description/metadata) + metadata.node_type + metadata.type |
| RV1-3 | MED | MEMORY.md index 가 duplicate slug 가짐 (기존 memo 와 collision) | §5.6 cross-link verify + 신규 slug 3개 (`feedback-phase0-scope-cutter`, `feedback-loc-estimate-x2`, `feedback-dual-audit-trigger-narrow`) 가 MEMORY.md 현재 25-entry 와 zero overlap (확인 완료) |
| RV1-4 | MED | PLAN_TEMPLATE 의 master half 만 작성, sub-WS half drop | §6.5 dual-H1 grep |
| RV1-5 | MED | PLAN_TEMPLATE 에 V24-specific literal 박힘 (Python / musu-bridge / R5 / R6 / facade.rs / 25,885) | §6.10 literal-zero grep |
| RV1-6 | LOW | "×2" 표기 drift ("x2" vs "×2" vs "*2") | §6.3 literal grep, ×2 (Unicode U+00D7) 통일 |
| RV1-7 | LOW | Self-grep step (§5.5) skip | §5.5 가 acceptance §6.9 + §6.10 과 동일 → Auditor 가 직접 실행 |
| RV1-8 | LOW | Memory description language drift (English vs Korean) | de facto English (8/9), 강제 X. Slug 가 grep-able 하면 OK |
| RV1-9 | INFO | §10/§11 Critic/Auditor table 가 empty 결과 시 어떻게 표기 | 0 HIGH 면 "no HIGH findings; X MED/LOW noted in handoff" row 1개 유지. 헤더 절대 삭제 X |
| RV1-10 | LOW | §5 step 1-6 가 unstaged working tree intermediate state 존재 인상 | step 7 single git commit 이 atomic publish, 실패 시 `git restore .` 로 rollback. remote impact 0 |

---

## §8 Critic seed (`system-architect`)

`system-architect` Critic 이 challenge 할 만한 점들 (Critic prompt 에 박을 hint):

(§8 Critic seed 는 Critic-revised v2 에서 question-only 로 reframe. 모든 bullet 은 question mark 로 끝나고, plan 본문 안에 pre-resolve 금지 — Critic HIGH#5 fix.)

- §1 OUT 항목들이 명시적으로 V26 master plan 본문 작성 + sub-WS table row pre-fill + V24-specific literal 박기 셋 다 OUT 으로 잡았나?
- §3 LOC table 컬럼 헤더가 literal "×2" (Unicode U+00D7) 인가? master §3 와 정확히 매치하나?
- §6 Acceptance 가 ungameable / operator-attested 마지막 항목을 W1 자체 acceptance 에 포함하나? 포함 안 하면 그 사유가 §10 Critic Findings 표 row 로 기록되나?
- Dual-audit trigger 가 "4 distinct conditions" 가 아니라 "1-3 = common-case instances of one-way blast (condition 4)" 형태로 표현되었나? (MODE_Agent_Team.md catch-all semantic 보존)
- Finding 4 (Phase -1 panel YELLOW) 가 PLAN_TEMPLATE master §0 의 skeleton format 자체에 GREEN/YELLOW/RED verdict slot 으로 표현되었나? (mention 만이 아니라 structure 로)
- Finding 5 가 V-agnostic generic ("Out of scope (operator manual)" subsection + 일반 rule) 로 표현되었나? V24-specific Python literal 이 본 template 본문에 박혔나?
- Dual-audit trigger self-application 이 plan 안에서 explicit reasoning 되었나? (W1 doc-only → 4 조건 모두 fail → single Auditor)
- §3 Module touch list 의 file 5 개가 master §3 W1 row 와 정합하나? LOC 합산 (273 → 546) 이 master ceiling (400 → 800) 내인가?
- §10 Critic Findings table 의 row 가 추후 0 row 결과 시에도 헤더 + 1 placeholder row ("no HIGH findings; MED/LOW in handoff") 유지하나?

---

## §10 Critic Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| C1 | HIGH | D2 frontmatter spec | "정확히 3 field" 가 9 reference memo ground truth (top-level 3 key + metadata block with node_type + type + originSessionId) 와 불일치. Loader drift risk | D2 revised v2: top-level 3 keys + metadata block with ≥ node_type/type. §6.6 (a) grep updated. originSessionId 신규 memo 에서 생략 OK |
| C2 | HIGH | D5 memo size lock | "1.5–2.5 KB" 가 실측 distribution (1.8 KB ~ 7 KB, 평균 2.8 KB) 와 불일치. 정상 길이 memo punish | D5 revised v2: body ≥ 1.0 KB, > 5 KB 면 informational flag. §6.6 (c) updated |
| C3 | HIGH | §6.8 self line-count gate | 본 plan 200→400 line gate 가 §10/§11 추가로 정상 동작이 fail trigger. Auditor row 가 정상 인 상태에서 plan 이 자기 acceptance 실패 | §6.8 폐지, self-consistency check (D1..D6 → PLAN_TEMPLATE section 대응) 로 교체 |
| C4 | HIGH | master/detail LOC mismatch | master §3 W1 (400→800) vs detail §3 (310→620) 180 LOC 차. Finding 2 ([[feedback-loc-estimate-x2]]) 자기 검증 불가 | §3 table 합산 = 273 → 546. master = ceiling, detail = floor, gap 은 §10/§11 row reserve. 본 plan 안 §3 last paragraph 에 명시. master plan 자체는 ceiling 유지 (별도 commit 불요) |
| C5 | HIGH | §8 Critic seed pre-rebuttal leak | §8 bullet 3 parenthetical 이 Critic challenge 를 pre-resolve. plan body 가 Critic findings 표를 biases | §8 v2 = question-only. parenthetical answer 모두 제거. bullet 3 의 ungameable omission justification 은 본 표 C6 row 에 이전 |
| C6 | INFO | W1 ungameable acceptance 부재 | W1 자체 acceptance §6 에 operator-attested final criterion 없음. justification 는 본 C6 row | Accepted: W1 = doc-only, reversible by `git revert`. ungameable slot 은 PLAN_TEMPLATE §9.10 가 가지고 있음 (rule's home). W1 자체에 duplicate 불필요 |
| C7 | MED | yak-shaving scope holes | §1 OUT 이 (a) sub-WS table row pre-fill (b) V24-specific literal 박기 (c) 전수 cross-link 셋 다 명시 안 함 | §1 OUT 3 항목 추가 (Critic MED#1 reco). §6.10 V-agnostic literal-zero grep 신설 |
| C8 | MED | Finding 5 V24-specific anchor | "Python + deprecation + operator manual" grep 이 V26 (no Python) 에서 dead. V-agnostic 가 아님 | §6.9 Finding 5 generic-ized: "operator manual gate" 문구 + "Out of scope (operator manual)" subsection. V24 는 callout 박스 example 로만 |
| C9 | MED | dual-audit "4 distinct" framing | 1-3 (install/migration/auth) 가 4 (one-way blast) 의 instance. PLAN_TEMPLATE 가 "4 distinct" 로 codify 시 V26 Planner 가 catch-all 잘못 해석 | 4 조건 = "1-3 are common-case instances of condition 4 (catch-all one-way blast radius)" 로 framing. PLAN_TEMPLATE 본문 + 본 plan §8 + memo `feedback-dual-audit-trigger-narrow` body 모두 동일 표현 |
| C10 | LOW | description language convention | "Researcher skeleton 영어, body 한국어 OK" 가 ground truth 와 약간 다름 (description 8/9 영어, 9/9 not enforced) | RV1-8 로 demote, "de facto English, 강제 X, slug grep-able 가능하면 OK" |
| C11 | LOW | §5 atomic publish | step 1-6 가 unstaged working tree intermediate state 인지 plan 이 명시 안 함 | §5 v2 add: "step 7 single git commit = atomic publish. 1-6 은 unstaged. 실패 시 git restore 로 rollback, remote impact 0" |
| C12 | INFO | empty §10/§11 표기 | Critic 가 0 HIGH 반환 시 §10 표를 어떻게 표기할지 plan 침묵 | RV1-9 신설 + 본 plan §10 본 자체 row 12 개 (HIGH 5 + MED 3 + LOW 2 + INFO 2) 가 실제 예시 |

(Critic v1: system-architect Phase 1.5, 2026-05-21. 5 HIGH + 3 MED + 2 LOW + 1 INFO. 모두 plan v2 에 반영. re-Critic 불필요.)

---

## §11 Auditor Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|

(empty header — populated post-Auditor)

---

## §12 References

- `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) — W1 row in §3
- `docs/V24_QUAL_EVAL_2026_05_21.md` — 5 findings source of truth
- `docs/V24_R5_WRITER_RS_PLAN_2026_05_20.md`, `V24_R6_INSTALLER_RS_PLAN_2026_05_20.md` — sub-WS detail plan §1/§1.1/§10/§11 골격 reference
- `docs/V24_RUST_BIG_BANG_MASTER_PLAN_2026_05_20.md` — master plan §0/§2/§5/§7 골격 reference
- `~/.claude/projects/C--Users-empty/memory/feedback-strategic-critic-gate.md` — memo format reference (1.7 KB sample)
- `~/.claude/projects/C--Users-empty/memory/feedback-plan-stage-auditor.md` — memo format reference (2.1 KB sample)
- `~/.claude/projects/C--Users-empty/memory/MEMORY.md` — index target
- `~/.claude/MODE_Agent_Team.md` (read-only, not modified) — Phase -1 + dual-audit triggers source
