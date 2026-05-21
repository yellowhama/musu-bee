# Plan template

이 파일은 master plan + sub-WS detail plan 두 형식의 skeleton 을 한 곳에 모은다. 새 master plan 또는 sub-WS plan 작성 시 해당 H1 섹션을 copy 해서 사용.

이 template 은 **V-agnostic** (특정 master plan / 특정 sub-WS / 특정 module 이름 박지 않음). 사례 (V24 등) 는 callout 박스로만 mention.

References:
- `~/.claude/MODE_Agent_Team.md` — Phase -1 strategic gate, Phase 0 Researcher, Critic/Builder/Auditor 흐름, dual-audit trigger 정의
- `[[feedback-phase0-scope-cutter]]` — Phase 0 Researcher 의 scope cutter 역할
- `[[feedback-loc-estimate-x2]]` — LOC estimate ×2 floor 규칙
- `[[feedback-dual-audit-trigger-narrow]]` — dual-audit 4 조건 narrow trigger
- `[[feedback-strategic-critic-gate]]` — Phase -1 panel YELLOW reshape 패턴
- `[[feedback-scribe-html-only]]` — Phase 7 closure HTML 규칙

---

# Master Plan Skeleton

```markdown
# V[NN]-[CODENAME] master plan — [1-line thesis]

**Wiki ID**: wiki/[NNN] (master) + wiki/[NNN+1]..[NNN+M] (sub-WS plans/closures)
**Date**: YYYY-MM-DD
**Branch**: [branch name; keep same branch within master OR cut new — justify]
**Phase -1 strategic gate**: [REQUIRED | EXEMPT — 사유 명시]
**Approval**: [user gate timestamp + ExitPlanMode 등]

---

## §0 Strategic Gate Findings (Phase -1)

Phase -1 (if required): `business-panel-experts` debate mode (Christensen + Taleb + Kim&Mauborgne + Drucker minimum). 결과 verdict 박기. **panel verdict = GREEN | YELLOW | RED** 셋 중 하나 explicit.

- **GREEN**: thesis sound, Phase 0 진입.
- **YELLOW**: thesis 살아있지만 ≥1 HIGH 요구 reshape. plan body 의 §2 / §5 / §9 sub-WS list / acceptance reshape, then 진입.
- **RED**: thesis 자체 fail. plan drafting HALT, user 결정 대기.

| # | Expert | Severity | Claim | Recommendation |
|---|---|---|---|---|

Phase -1 EXEMPT 시 이 §0 에 사유 한 줄 명시. 예: "thesis = codify retrospective findings, 사양 변경 0, 새 dep 0 → MODE_Agent_Team.md 'pure refactor/cleanup' exemption 부합".

---

## §1 Thesis lock + Scope

Thesis 1-2 문장. 사용자 의도와 product positioning 명시.

**IN**:
- ...

**Out of scope (operator manual)**:
- (예: 기존 subsystem 의 cleanup / deletion 등 operator 가 직접 결심 필요한 항목. **operator manual gate** 으로 표기. 본 master plan 의 sub-WS 들은 그 항목 *준비* 만 하고 실행 자체는 operator)
- ...

**Out of scope (deferred / next master plan)**:
- ...

> Callout: 본 section 의 "Out of scope (operator manual)" subsection 은 finding 5 (dead-code visibility) 의 generic codification. 각 master plan 이 자기 사례 (예: 옛 subsystem 의 bulk delete) 를 row 로 instantiate. 본 template 은 V-agnostic.

---

## §2 Sub-WS table

| Phase | Sub-WS | Wiki | Module | Scope | Risk | LOC est ×2 | Existing infra |
|---|---|---|---|---|---|---|---|
| ... | ... | wiki/... | ... | ... | LOW/MED/HIGH | first-draft → ×2 | ... |

> LOC est ×2 column header **literal "×2"** (Unicode U+00D7). first-draft 의 두 배 floor. 예외: pure-refactor 또는 < 150 LOC sub-WS 만 ×1. [[feedback-loc-estimate-x2]] 참조.

---

## §3 Sequence + parallelization

Strict sequential vs parallel 정당화. /loop autonomous gates 위치 (operator gate 어디서 stop).

---

## §4 Constitution gates predicted

| Gate | Triggers? | Note |
|---|---|---|
| Const III (schema) | YES/NO | ... |
| Const VI (perf) | YES/NO | ... |
| Const VII (push) | YES — per-W or batched | ... |
| Phase -1 strategic | REQUIRED/EXEMPT | ... |

---

## §5 Sub-WS detail specs

| Sub-WS | Wiki | Scope | Risk | LOC est ×2 | Critic | Auditor | Dual? |
|---|---|---|---|---|---|---|---|

**Critic / Auditor 컬럼**: 단일 default 는 `system-architect` Critic + `quality-engineer` Auditor. Auditor 가 **dual** 인지 (`security-engineer` + `quality-engineer` 또는 `devops-architect` + `security-engineer` 등) 의 결정 = 다음 4 조건 중 ANY 1 매치 시:

1. **Auth / secrets / crypto code** touched (token generation/validation, encryption, OAuth, HMAC)
2. **Schema migration** to production (new tables / NULL columns / index drop / triggers)
3. **Installer / service registration / OS-level write** (systemd, launchd, SCM, registry, file perms 0600)
4. **Any other one-way blast radius** (catch-all: irreversible by `git revert` alone)

1-3 은 4 의 common-case instances. "Dual?" 컬럼에 매치된 조건 ID (1 / 2 / 3 / 4) 명시. 매치 0 면 single Auditor. [[feedback-dual-audit-trigger-narrow]] 참조.

---

## §6 Wiki ID reservations

- wiki/[NNN] = this master plan
- wiki/[NNN+1], [NNN+1]c = sub-WS 1 plan + closure
- ... (sub-WS 마다 2 ID = plan + closure)
- next free after master: wiki/[NNN+M+1]

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|

---

## §8 Phase 0 frame correction check

Phase 0 Researcher (`Explore` + `deep-research-agent`) 가 spec verifier 아니라 **scope cutter** 역할. Researcher prompt 에 "If plan assumes X but ground truth says Y, return HIGH finding with explicit 'reframe plan §N from X to Y'" 명시.

Researcher 결과 가 "plan assumption confirmed" 만이면 seed question 너무 narrow → 재실행.

Researcher 의 frame correction (있을 시) → Phase 1 Planner 가 detail plan §1.1 Locked decisions 표에 "F[N]: old → new / Source = Phase 0 finding" row 로 박음. [[feedback-phase0-scope-cutter]] 참조.

---

## §9 Acceptance criteria

≥10 items. 각 testable. 마지막 row 는 **ungameable / operator-attested**:

1. ...
2. ...
3. ...
4. ...
5. ...
6. ...
7. ...
8. ...
9. ...
10. **Operator-attested**: master plan 의 close criterion 중 한 개 이상은 orchestrator-fillable 아닌 operator-authored attestation (Goodhart firewall). 작성 자체를 orchestrator 가 prefill 하지 말 것 — Auditor explicit check.

---

## §10 Channel to next master plan

V[NN+1] master plan 의 PRIOR ARTIFACTS 진입점:
- 본 master plan
- sub-WS closure docs
- 본 master 가 만든 신규 memory feedback / decision 메모 (있다면)
- ...

---

## §11 References

- ...
- `~/.claude/MODE_Agent_Team.md`
- `~/.claude/projects/.../memory/MEMORY.md` 의 활성 feedback / decision 메모
- 이전 master plan + closure docs
```

---

# Sub-WS Detail Plan Skeleton

```markdown
# V[NN]-[Code] W[N] — [sub-WS title] (detail plan)

**Wiki ID**: wiki/[NNN] (this plan) + wiki/[NNN]c (closure, post-Build)
**Date**: YYYY-MM-DD
**Branch**: [same as master, 또는 다르면 사유]
**Master plan**: `docs/V[NN]_*_MASTER_PLAN_*.md` (wiki/[master]) §[N] sub-WS row
**Estimate** (plan-as-spec): artifacts [first-draft] → **[×2] LOC** (master ceiling 내 reserve 확보)
**Builder**: [subagent type — backend-architect / frontend-architect / devops-architect / refactoring-expert / python-expert / technical-writer]
**Critic**: `system-architect` (default) 또는 `security-engineer` (auth-heavy)
**Auditor**: `quality-engineer` (single default) 또는 dual — dual 적용 시 조건 ID 명시 (1=auth, 2=migration, 3=install/OS-write, 4=one-way blast)

---

## §1 Scope

**IN**: bulleted list of file touches + actions.

**OUT** (이 sub-WS 가 절대 손대지 않음): bulleted. 최소 5 항목. yak-shaving 방지.

---

## §1.1 Locked decisions

| ID | Decision | Source |
|---|---|---|
| D1 | ... | ... |
| F1 (Phase 0 frame correction) | old=X / new=Y | Phase 0 Researcher finding ID |

> Phase 0 Researcher 의 frame correction (있을 시) 은 F[N] ID 로 row 추가. [[feedback-phase0-scope-cutter]].

---

## §2 Stack / Dependencies

Crate / lib / framework 표 또는 N/A (doc-only).

---

## §3 Module touch list

| # | Path | Action | LOC est ×2 | Notes |
|---|---|---|---|---|

> first-draft → ×2 두 숫자 모두 표기 ([[feedback-loc-estimate-x2]]). Total 합산 base + ×2 둘 다 명시. master = ceiling, detail = floor.

---

## §4 Schema delta

Const III 적용 시 schema version 명시. 아니면 N/A.

---

## §5 Order of operations

Builder execution sequence (numbered). atomic publish (single git commit) timing 명시. 실패 시 rollback 경로 (`git restore`).

---

## §6 Acceptance criteria

≥8 items. 각 testable. file:line pointer 가능하면 박음. grep / wc / parse 같은 mechanical check 권장.

마지막 row 는 Const VII gate (single commit + push) 형태.

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|

---

## §8 Critic seed

`system-architect` Critic (또는 `security-engineer`) 이 challenge 할 만한 점 5-8 bullets. **모두 question mark 로 끝남**. plan body 안에 pre-resolve / 답 적어놓기 금지. (Critic 의 challenge 를 biases.)

---

## §10 Critic Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|

Critic phase 후 populated. 0 HIGH 시 1 placeholder row: `| — | — | — | (no HIGH findings; MED/LOW noted in handoff) | n/a |` 유지. 헤더 절대 삭제 X.

---

## §11 Auditor Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|

Phase 5 Auditor 후 populated. 동일 placeholder 규칙.

---

## §12 References

- master plan
- 이전 sub-WS closure docs (있을 시)
- 관련 memory 메모
- 관련 product spec docs
```

---

# Usage notes

- Master 와 sub-WS 둘 다 §10/§11 헤더 유지 (empty 시 placeholder row).
- LOC est column literal "×2" (Unicode U+00D7) 둘 다.
- Phase -1 EXEMPT 면 master §0 에 사유. EXEMPT 사유 = thesis extension 없음 (사양 변경 0, 새 language 0, 새 외부 dep 0, 새 heavy infra 0). MODE_Agent_Team.md Phase -1 가 "Skipped for: sub-WS detail plans operating within an already-cleared master, single-sub-WS hotfixes, pure refactor/cleanup, V23.4-F-B2-style residual security fixes" 조건.
- Dual-audit trigger 4 조건 — 1-3 = common instances, 4 = catch-all. "4 distinct" 로 표현 금지.
- Phase 0 Researcher 의 frame correction = sub-WS detail §1.1 의 F[N] row. plan body 의 thesis 자체가 잘못된 frame 일 수 있다는 가정.
- Phase 7 Scribe closure HTML per [[feedback-scribe-html-only]]. master plan + sub-WS detail plan + Critic/Auditor finding 표 는 모두 markdown 유지.

> Callout (example, V24): V24 master plan 의 §0 Phase -1 panel 가 YELLOW 반환 → big-bang 4-6주 down 을 R-fast / R-cleanup phased 로 reshape. sub-WS LOC estimate 가 1.5-7× under 였던 사례 (R5 4.95×, R6 6.97×). R6 만 dual-audit (install + auth 2 조건 매치) 적용해서 7 HIGH catch. 사례 detail 은 `docs/V24_QUAL_EVAL_2026_05_21.md`. 본 template 은 그 학습을 generic 으로 박은 형태.
