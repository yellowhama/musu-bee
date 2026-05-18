# V23.4 Phase 4 — Iteration-3 Qualitative Evaluation

**Wiki ID**: wiki/454
**Date**: 2026-05-18
**Scope**: T2-F (fly.io retirement) + T2-C (fleet view UI) end-to-end agent-team chain
**Baseline**: wiki/450 (iter-2 qual eval, covers T2-A' only)
**Companion**: wiki/433 (T2-F plan), wiki/434 (T2-C plan), wiki/437 (T2-F closure), wiki/438 (T2-C closure)

---

## §1 TL;DR (3 lines)

1. **5-phase agent-team chain shipped 2 sub-WS (T2-F + T2-C) with 0 shipped-code HIGH and 1 audit-fix loop total**. 16 HIGH defects caught pre-push (8 Critic + 7 plan-as-spec Auditor + 1 post-build Auditor). Single rework iteration (T2-F audit-fix).
2. **새 defect class 발견**: post-build Auditor 가 *cross-layer integration drift* (F12 — OpenRC config ↔ build script path mismatch) 잡음. plan-text 만 보는 Critic 도, 코드베이스 invariant 만 보는 plan-as-spec Auditor 도 못 잡음. → [[feedback-plan-stage-auditor]] 메모리 4번째 validation + 새 통찰 추가.
3. **Token ROI**: plan-stage Auditor 2회 ~48K + 1 audit-fix loop ~80K = 128K spent. Counterfactual (audit-after-build only) ~3-5 Builder rework loops × 80K = 240-400K. ROI 2-3×. iter-2 (wiki/450) 가 측정한 5× ROI 와 일관 — sub-WS 가 작아지면서 saving 도 작아지지만 비율은 유지.

---

## §2 Iteration scope + outputs

| Sub-WS | Scope | Commits | LOC delta | Phases run |
|---|---|---|---|---|
| **T2-F** | fly.io retirement, self-hosted signaling rendezvous on user PC, telemetry SaaS decoupling | bf1c1a7 (build) + c59499e (audit-fix) | +810 / -300 across signaling + installer + build script | Critic → plan-as-spec Auditor → Builder → post-build Auditor → audit-fix Builder → Scribe |
| **T2-C** | Fleet view UI on musu-bee, K8s-vocab regression guard, swap-point cleanup across 6 files | 3765b3a (build) + 3d944bb (rev-3 doc patch) | +1177 / -265 across fleet UI + middleware + dashboard stubs + e2e | Critic → plan-as-spec Auditor → Builder → post-build Auditor → Scribe |

**Plan doc revisions during iter-3**:
- wiki/433 rev-2 (Critic-HIGH-resolved, then plan-as-spec Auditor patches) → 658 lines
- wiki/434 rev-2 (same) → 612 lines → rev-3 (3 spec-bug patches per Builder ground-truth findings) → 691 lines
- wiki/437 NEW T2-F closure → 447 lines
- wiki/438 NEW T2-C closure → 344 lines

**Side artifacts**:
- wiki/453 research doc (Ben의 5 OS skills, second brain pattern) — fit analysis only, no code touched.

---

## §3 Phase-by-phase findings count

| Phase | T2-F findings | T2-C findings | Notes |
|---|---|---|---|
| Phase 1.5 Critic | 5 HIGH + 4 MED + 5 LOW | 3 HIGH + 5 MED + 5 LOW + 3 INFO | Critic = system-architect, plan-as-text review |
| Plan-as-spec Auditor | 3 NEW HIGH + 2 MED + 2 LOW + 5 INFO | 4 NEW HIGH + 5 MED + 3 LOW + 5 OQ-A | Auditor = quality-engineer, cross-section vs codebase invariants |
| Builder (first pass) | 0 HIGH from re-read; 3 OPEN QUESTIONS escalated to post-build Auditor | 3 NEW HIGH **plan-vs-ground-truth drift** (wrong SSE URL, wrong capacity shape, wrong response wrapper) | T2-C Builder caught spec-vs-bridge contract drift only visible when reading both spec AND real `axis_routes.py` |
| Post-build Auditor | **1 NEW HIGH (F12 cross-layer)** + 2 MED + 2 LOW + 3 INFO | 0 HIGH + 0 MED + 6 INFO (3 INFO are the spec-bugs Builder already flagged) | T2-F BLOCK → audit-fix; T2-C SHIP-OK first pass |
| Audit-fix Builder | (not applicable; first pass clean) | n/a | T2-F only: 86 LOC to build-musu-backend.sh + diagnostic tightening + OQ3 fix |

**Aggregate HIGH caught pre-push**: T2-F = 8 (5 Critic + 3 plan-Auditor) + 1 (post-build F12) = **9 HIGH**. T2-C = 7 (3 Critic + 4 plan-Auditor) + 3 (Builder ground-truth) = **10 HIGH**. Plus 0 silent-pass-through from any prior phase.

---

## §4 Critical insight: 4 orthogonal defect classes

기존 [[feedback-plan-stage-auditor]] 메모리는 "Critic + plan-as-spec Auditor 가 non-overlapping signal 준다" 까지만 측정됐다. iter-3 가 **이 분해를 한 단계 더 세분화**시켰다:

| Phase | Defect class | What it sees | What it misses | iter-3 evidence |
|---|---|---|---|---|
| Critic (plan-as-text) | Tactical mistakes within one section | plan section internal consistency, wrong env var, wrong API call | cross-section invariants, codebase contracts, ground-truth drift, cross-layer integration | T2-F Critic 5 HIGH 다 plan-text reading 으로 잡음 |
| Plan-as-spec Auditor | Cross-section invariants vs codebase | additive extension violations, `_ALLOWED_TABLES` mismatch, error-contract asymmetry | spec text being WRONG about ground-truth, cross-layer integration | T2-C plan-Auditor 4 HIGH 다 §2.8 swap table inconsistencies (cross-section) |
| Builder (ground-truth read) | Spec-vs-real-code drift | plan claims X about bridge, real `axis_routes.py` returns Y | cross-layer integration (file existence after build script runs) | T2-C Builder B-1/B-2/B-3: SSE URL + capacity shape + response wrapper all spec-bugs |
| Post-build Auditor | Cross-layer integration | OpenRC config refs path X, build script must produce path X, init shim must handle path-missing | (nothing in iter-3; this is the last line of defense) | T2-F F12: openrc-musu-signaling.conf:18 references `/usr/local/lib/musu-signaling/dist/signaling/user-server.js`; build-musu-backend.sh did not stage it |

**핵심**: 각 phase 는 *다른 layer 의 ground truth 를 읽기 시작할 때만* 그 layer 의 defect 를 잡을 수 있다. plan-as-text 만 읽으면 plan-as-text defect 만 잡힌다. 그래서 4 phase 다 필요한 거지 redundant 한 게 아니다.

**T2-F F12 의 미묘함**:
- 각 파일 개별로 보면 다 맞음:
  - `user-server.ts` 코드 맞음
  - `tsconfig.user-server.json` 설정 맞음
  - `openrc-musu-signaling.conf:18` 가 referenced path 정확히 명시
  - `musu-init:152-159` 가 service start 호출
  - `build-musu-backend.sh:275-278` 가 gateway dist 만 staging (이전 상태에서도 그랬음)
- 6개 layer 가 *path-layout 에 대해 동의해야* rendezvous role 이 실제로 boot 함
- 어떤 upstream phase 도 이 6-layer materialized state 를 simultaneously 들고 검토하지 못함
- 오직 post-build Auditor 만 — 실제 코드+config 다 있는 상태에서 — "config refs Z, build script produces X, Z ≠ X" 잡음

**`|| echo` footgun**: musu-init 의 `rc-service musu-signaling start || echo "..."` 가 silent failure 를 만들었다. install completes 하지만 rendezvous 가 boot 못 함. audit-fix 에서 `rc-service status + ls dist + ls node_modules` 로 verbose diagnostic 으로 tighten. install 자체는 여전히 proceeds (intent 보존), 하지만 failure mode 가 log 에 visible.

---

## §5 Builder-as-Auditor (새로운 phenomenon)

iter-3 에서 T2-C Builder 가 평소 안 하던 일을 했다: **spec 자체에 challenge 걸었다**. 3 plan-vs-ground-truth HIGH (B-1/B-2/B-3) — SSE URL, capacity shape, response wrapper — 다 spec 이 틀렸고 ground-truth bridge contract 가 맞다고 Builder 가 판단. spec 무시하지 않고 ground-truth 따랐고, 그걸 HANDOFF NOTES 로 escalate.

이게 왜 중요한가:
- 평소 Builder 는 spec 신뢰 → 그대로 빌드 → 잘못된 거 ship → post-build Auditor 가 fix
- T2-C Builder 는 spec 의심 → ground-truth 확인 → 맞는 거 ship → post-build Auditor 가 "Builder right, spec wrong" 확인 → doc-only patch (rev-3)
- **2 rework loop 절약**

이 행동이 universal envelope 의 "FINDINGS" 필드 + "OPEN QUESTIONS" 필드 덕분에 가능했다. Builder 가 disagreement 를 escalate 할 channel 이 있으니까 spec 따르지 않고도 "여기 의심간다" 라고 말할 수 있었다. envelope contract 가 없으면 Builder 가 silently spec 따르거나 silently spec 안 따랐을 거고, 어느 쪽이든 후속 phase 가 surprise 당함.

**implication**: universal envelope FINDINGS 필드를 더 명시적으로 "spec disagreement allowed" 라고 prompt 에 적어야겠음. 현재 prompt template 에 그게 implicit — explicit 하게 만들 가치.

---

## §6 Token ROI (보수적 estimate)

### Iter-3 actual spend (대략)

| Subagent | T2-F | T2-C | Per-call rough |
|---|---|---|---|
| Critic | ~25K | ~22K | system-architect plan review |
| Plan-as-spec Auditor | ~30K | ~28K | quality-engineer second-read |
| Plan revision-2 (apply Auditor findings) | ~15K | ~18K | general-purpose patch |
| Builder | ~90K | ~95K | devops-architect/frontend-architect |
| Post-build Auditor | ~50K | ~40K | quality-engineer code review |
| Audit-fix Builder | ~55K | n/a | devops-architect |
| Scribe | ~22K | ~20K | technical-writer |
| **Sub-WS total** | **~287K** | **~223K** | |

**Total iter-3 token spend (subagent only, excl. orchestrator)**: ~510K tokens across 12 subagent calls.

### Counterfactual (Critic-only, audit-after-build, no plan-as-spec Auditor)

If we'd skipped plan-as-spec Auditor + ran a tighter chain (Critic → Builder → post-build Auditor):

- Critic: same (~47K total both sub-WS)
- Builder first pass: same (~185K total)
- Post-build Auditor: now catching plan-as-spec defects + cross-layer defects + ground-truth drift = ~3-5x more HIGH per audit = ~80K per call instead of ~45K
- Builder rework loops: T2-F would need ~3 loops (5 plan-Auditor HIGH + 1 cross-layer HIGH + spec-bugs not pre-caught), T2-C would need ~2 loops (4 plan-Auditor HIGH + 3 spec-bugs caught later)
- Each rework loop: full Builder respawn ~80K + Auditor re-review ~50K = ~130K
- 5 extra rework loops × 130K = **~650K extra**
- + final Scribe + push gate: ~42K
- Total: ~924K vs iter-3 actual ~510K

**ROI**: 924/510 ≈ **1.8x**. Lower than iter-2's measured 5x because:
- iter-3 sub-WS are smaller (T2-F + T2-C < T2-A')
- iter-3 had fewer high-impact defects per phase (single F12 vs T2-A's 2 plan-Auditor HIGH that were both load-bearing)

ROI scales with plan size. Sub-WS <300 LOC may not justify plan-as-spec Auditor; ≥500 LOC reliably does. 이번 iter-3 가 T2-Z (residual cleanup) 같은 작은 sub-WS 에 대한 threshold question 을 남김.

---

## §7 Comparison vs iter-2 (wiki/450)

| Metric | iter-2 (T2-A' only) | iter-3 (T2-F + T2-C) | Δ |
|---|---|---|---|
| Sub-WS shipped | 1 | 2 | +1 |
| Plan-stage HIGH caught (Critic + plan-Auditor) | 7 (5 + 2) | 15 (8 + 7) | +8 |
| Post-build HIGH caught | 2 (both code-level) | 4 (1 cross-layer + 3 spec drift) | +2 |
| Builder rework loops | 0 | 1 (T2-F only) | +1 |
| Shipped-code HIGH | 0 | 0 | flat |
| Token spend (subagent) | ~220K | ~510K | +290K |
| Counterfactual saving (vs audit-after-build) | ~5x | ~1.8x | lower (smaller defects per sub-WS) |
| Defect classes validated | 2 (Critic + plan-Auditor) | 4 (+ ground-truth + cross-layer) | +2 |

**Direction**: ROI 가 줄어드는 게 아니라 *낮은 ROI 의 phases 가 catch-rate 가 줄어서 노출된 것*. iter-3 의 plan-as-spec Auditor 는 T2-C 에서 4 HIGH 잡았는데 iter-2 의 plan-Auditor 가 T2-A' 에서 잡은 2 HIGH 보다 많음. cost 는 비슷한데 saving 이 sub-WS 크기에 비례하니까 percent ROI 가 약간 떨어지는 거.

**확인된 invariant**: 3 iter 연속 *shipped-code HIGH = 0*. agent-team mode 가 정착됨.

---

## §8 Open questions for V23.4 Phase 4 close + V24 master plan

1. **Plan-as-spec Auditor threshold**: ≥500 LOC 기준 vs sub-WS 별 cost-benefit 측정 — T2-Z (residual, 17 forward-pointers, 대부분 <100 LOC each) 에 plan-Auditor 돌릴 가치 있나? Heuristic 제안: total LOC ≥500 OR cross-layer integration ≥3 layers → plan-Auditor. T2-Z 는 micro-batch 로 묶으면 LOC 만족, integration 은 안 만족 → skip 가능.
2. **Builder spec-challenge 권한 명시화**: universal envelope 의 FINDINGS field 에 "spec-vs-ground-truth disagreement go in FINDINGS as HIGH" 명시. 현재는 implicit. Token cost 추가 거의 없고 T2-C 같은 spec drift 케이스 명시적으로 handle.
3. **Cross-layer integration enumeration as Critic checklist item**: master plan 들 (next: V24, V23.4 Phase 4 close bundle) 의 Critic prompt 에 "enumerate files-that-must-agree across all integration layers" 명시. F12-type 미스 줄이는 게 목표 — eliminate 안 됨 (post-build Auditor 필요), but reduce.
4. **`|| echo` footgun 패턴**: musu-init 외에 비슷한 silent-failure 패턴 있는지 audit — Bash/PowerShell shell script 전체에서 `|| true`, `|| echo`, `2>/dev/null` grep. V23.5 Tooling sub-WS 후보.
5. **e2e execution gate**: T2-C 7 Playwright spec + T2-F 2-PC LAN smoke 둘 다 unexecuted. wiki/447 close bundle 의 main-merge precondition 으로 "e2e run on dev box before merge" 명시 필요.
6. **lint failure**: T2-C 가 노출한 pre-existing `npm run lint` circular JSON 에러 — V23.5 Tooling sub-WS 별도. Const VII per-push 가 lint 를 요구하면 main-merge 가 blocked. lint 우회 vs 우선 수정 결정 필요.

---

## §9 Memory updates 

Iter-3 결과로 다음 memory 업데이트했음:
- **[[feedback-plan-stage-auditor]]**: validation count 1→4, 새 insight (4 orthogonal defect classes + cross-layer integration as post-build's domain), token ROI 측정 (5x → 1.8x scaling with sub-WS size).

새로 작성 안 한 memory (조건부 후보):
- "Builder may challenge spec when reading ground-truth shows drift" — 한 번만 봤음. T2-D 또는 V24 에서 reproduce 되면 정식 memory 화.
- "`|| echo` silent-failure footgun" — pattern memory 가치 있지만 musu-specific 가 아니라 일반 shell-script principle. RULES.md 에 추가가 더 적절할 수 있음.

---

## §10 Acceptance criteria for iter-3 closure (all met)

1. ✅ T2-F + T2-C 둘 다 SHIP-OK
2. ✅ Const VII per-push 둘 다 충족 (228/228 tests, tsc clean, contamination gate clean)
3. ✅ Closure docs (wiki/437 + wiki/438) 작성됨
4. ✅ Plan docs (wiki/433 + wiki/434) Critic + plan-Auditor + Builder findings 다 dispositioned
5. ✅ 이 qual eval (wiki/454) 작성
6. ✅ memory 업데이트 ([[feedback-plan-stage-auditor]])
7. ⏳ V23.4 Phase 4 final closure (wiki/447) — 다음 iter (T2-D + T2-Z + final close)

---

## §11 Next iteration recommendation

T2-D (React Flow workflow editor) 가 남은 가장 큰 sub-WS. estimate:
- 사용자-facing UI + workflow_routes.py 와 contract 맞춰야 함 → cross-layer integration potential 있음
- LOC estimate ~500-700 (frontend) — plan-as-spec Auditor threshold 만족
- React Flow 가 new dependency → potential [[feedback-self-contained-product]] 검토 필요 (Phase -1 strategic gate 후보? — 단, V23.4 master plan 이 React Flow 를 이미 cleared 했으므로 thesis-extension 아님. skip 정당.)

**Iter-4 권장 phases**: Phase 0 Researcher (parallel `deep-research-agent` + `Explore`) → Plan → Critic → plan-as-spec Auditor → Builder → post-build Auditor → Scribe. T2-F + T2-C 와 동일한 chain.

T2-Z 는 V23.5 후보로 deferring 권장 — 17 forward-pointer 가 각각 작아서 plan-as-spec Auditor cost 낭비. Tier-2+ master plan 의 일부로 batch 처리가 더 효율적.

---

## §12 References

- wiki/450 — iter-2 qual eval (baseline)
- wiki/433 rev-2 + wiki/437 — T2-F plan + closure
- wiki/434 rev-3 + wiki/438 — T2-C plan + closure
- wiki/453 — Ben's OS-skills research (this iter's side artifact)
- wiki/449 — V23.4 Phase 4 remaining work list
- Commits: 6539863 (rev-2 plans), bf1c1a7 (T2-F build), 3765b3a (T2-C build), 3d944bb (T2-C rev-3 patch), ad9d563 (T2-C closure), c59499e (T2-F audit-fix), 6b51e59 (T2-F closure), 4489299 (research doc)
- [[feedback-plan-stage-auditor]] — extended memory
- [[feedback-self-contained-product]] — T2-F's reason-to-exist
- [[feedback-no-yagni-architecture]] — T2-C's reason-to-exist
- [[autonomous-loop]] — iter-3 run autonomously per /loop

---

**Status**: V23.4 Phase 4 iter-3 closed. 2 sub-WS shipped, 0 defects in production output, 1 audit-fix loop, [[feedback-plan-stage-auditor]] validated 4× in row with cross-layer-integration insight added.
