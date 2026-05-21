# V25-OPS W2 closure — Python deprecation banners

**Wiki ID**: wiki/503c
**Date**: 2026-05-21
**Branch**: `v24/rust-cleanup`
**Plan**: `docs/V25_OPS_W2_DEPRECATION_BANNERS_2026_05_21.md` (wiki/503)
**Master**: `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W2 + §4.2
**Commit**: 310855c on `v24/rust-cleanup`
**Status**: **SHIP-OK** (0 HIGH / 0 MED / 2 LOW / 2 INFO Auditor; 모든 prior Critic HIGH C1+C2 해소 + MED C3-C5 해소)

---

## §1 What shipped

7 file touch in single commit 310855c:

| # | Path | Action | LOC | Notes |
|---|---|---|---|---|
| 1 | `README.md` | edit | +25 / −0 (net Status column 추가 + 5 Rust row) | Modules table reshape per Critic C3 D8 |
| 2 | `musu-bridge/README.md` | new | 22 | banner + migration |
| 3 | `musu-core/README.md` | new | 24 | banner + migration |
| 4 | `musu-control/README.md` | new | 24 | banner + INSTALL.md historical-only note (D10) |
| 5 | `musu-indexer/README.md` | edit (prepend + wrap) | 73 (banner 22 + legacy 51) | banner prepend + 기존 body 를 `## Legacy Python surface (R10-pending deletion)` heading 으로 wrap, 52-line audit trail 보존 (Critic C1 D6b) |
| 6 | `musu-writer/README.md` | new | 24 | banner + migration |
| 7 | `docs/V25_OPS_W2_DEPRECATION_BANNERS_2026_05_21.md` | plan doc | 181 | this plan |

**Net artifact LOC**: 5 module README sum 140 + README.md +25 ≈ **165 LOC**. master §3 W2 ceiling = 350 → 700. floor = 200 → 400. 실제 shipped 가 둘 다 under — doc-only sub-WS 가 ×2 multiplier 보다 적게 ship 가능 indicator (Auditor A3 INFO).

---

## §2 Phase chain summary

| Phase | Agent | Output | Findings |
|---|---|---|---|
| 0 (Researcher) | `Explore` | README state + 5 module pyproject + banner pattern + R10 list match | 5 module README absence + musu-indexer/README.md exists |
| 1 (Planner) | orchestrator-direct | W2 detail plan draft v1 | §1 IN/OUT, §1.1 D1-D6, §3 LOC, §6 10-item acceptance, §8 Critic seed |
| 1.5 (Critic) | `system-architect` | 10 findings: 2 HIGH + 3 MED + 2 LOW + 3 INFO | C1 musu-indexer body, C2 closure link depth, C3 table asymmetry, C4 cross-ref invariant, C5 pyproject touch vector, C6 banner clarity, C7 INSTALL.md, C8 LOC reconciliation, C9/C10 accepted |
| 1.5 → 1 (revise) | orchestrator-direct | Plan v2 with D6b/D7/D8/D9/D10 + §3 reconciliation + §6.6b/c/d/e + §10 12 row Critic findings | 2 HIGH + 3 MED + 2 LOW + 3 INFO 모두 plan body 반영 |
| 3 (Builder) | orchestrator-direct | 5 module README + README.md edit + plan v2 §11 prep; self-grep §6 all pass | Self-grep 확인: Deprecated 5 hit, Active (Rust subcommand) 5 hit, ../docs/V24_CLOSURE 5 hit, Legacy Python surface heading musu-indexer L25, Cross-ref invariant comment 5 hit, Python diff 0 |
| 5 (Auditor) | `quality-engineer` (single, dual-audit 면제) | 0 HIGH + 0 MED + 2 LOW + 2 INFO | A1 musu-indexer 4 textual deltas, A2 banner 4-line + HTML comment vs 5-line spec, A3 LOC over-estimate, A4 banner byte-consistency. 모든 Critic HIGH 명시 해소 확인 |
| 7 (Scribe) | orchestrator-direct (this doc) | W2 closure markdown wiki/503c | — |

---

## §3 5 V24 findings codification — W2 contribution

W1 codified findings 1-3 + #4 (memory + PLAN_TEMPLATE). W2 codifies finding **5** (Python dead code visibility) via channel C (operator-visible banners):

| Channel | W1 (memory + template) | W2 (banners + README) | W3-5 (next) |
|---|---|---|---|
| A. orchestrator memory | ✅ 3 new feedback memo | (n/a) | (n/a) |
| B. PLAN_TEMPLATE.md | ✅ V-agnostic generic | (n/a) | (n/a) |
| C. operator-visible | (n/a) | ✅ 5 module README banner + README.md Status column | W3 R10 runbook completeness, W4 operator brief, W5 closure |

**Finding 5 (Python dead code visibility) now resolved** for operator:
- top-level `README.md` Modules table shows "Deprecated (R10-pending)" explicit (5 rows)
- 5 Python module dir 각자 자체 `README.md` 에 first-screen banner
- 각 banner 가 V24 closure §4.1 R10 runbook 으로 link (relative depth `../docs/`)
- 각 banner 가 정확한 Rust subcommand 대체 명시
- Cross-ref invariant HTML comment 가 future R10 list 수정자 에게 "5 module README 동시 update" 알림

---

## §4 Critic HIGH 명시 해소 (Auditor HANDOFF NOTES 인용)

**C1 HIGH (musu-indexer/README.md body handling)** — RESOLVED:
- D6b spec: (a) banner prepend, (b) `## Legacy Python surface (R10-pending deletion)` heading wrap, (c) 52-line audit trail 보존
- Shipped: musu-indexer/README.md L1 cross-ref comment, L3 title, L5-8 banner, L12-22 migration table, L23 horizontal rule, L25 Legacy heading, L27 "Do not follow" caveat, L29-73 wrapped legacy body
- Verification: §6.6b grep — `python -m venv` at L42 (banner 아래), `Legacy Python surface` heading at L25 (banner 아래, `python -m venv` 위)

**C2 HIGH (V24 closure link relative depth)** — RESOLVED:
- D7 spec: sub-dir = `../docs/V24_CLOSURE_2026_05_21.html`, top README = `docs/V24_CLOSURE_2026_05_21.html`, banner 에 local-render note
- Shipped: 5 module README 모두 `../docs/V24_CLOSURE_2026_05_21.html` literal 1 hit (relative depth `../` 정확). top README `docs/V24_CLOSURE_2026_05_21.html` (no `../`). 각 banner L8 에 `(open locally for rendered view, or view raw on GitHub)` parenthetical

**C3 MED (Modules table 13-row asymmetry)** — RESOLVED:
- D8 spec: Status column 추가 (`Active` / `Deprecated (R10-pending)` / `Active (Rust subcommand)`)
- Shipped: README.md L31 header 4 column with Status. 5x Deprecated + 5x Active (Rust subcommand) + 3x Active. 13 rows total.

**C4 MED (R10 list cross-doc invariant)** — RESOLVED:
- spec: 각 module README 첫 줄 HTML comment 로 V24_CLOSURE §4.1 reference
- Shipped: 5 module README 모두 L1 `<!-- Cross-ref invariant: this banner matches V24_CLOSURE §4.1 R10 deletion list. If you modify R10 list, update all 5 module READMEs. -->`

**C5 MED (pyproject.toml touch vector)** — RESOLVED:
- D9 spec: pyproject.toml field touch 금지 명시
- Shipped: `git diff --stat HEAD~1 HEAD -- '*.py' 'pyproject.toml' '**/pyproject.toml'` empty. zero touches.

C6-C10 (LOW + INFO) 도 모두 verified resolved (Auditor 표 참조).

---

## §5 Auditor finding 추가 disclosure

**A1 LOW (musu-indexer 4 minor textual deltas)**: Builder 가 Critic C1 의 literal "preserve 52 lines as-is" 보다 약간 적극적으로 — past tense 4 곳 ('ship→shipped', 'lives→lived' 등), sub-heading 한 단계 demotion, L73 Rust path preservation addendum — within C1 intent (audit trail purpose enhanced by past-tense framing). 비차단.

**A2 LOW (banner 4-line + HTML comment vs 5-line spec)**: Builder 가 Critic C6 의 literal "5-line blockquote" 보다 다른 layout — 4-line blockquote + L1 HTML comment for cross-ref invariant. 5 content element (DEPRECATED + replacement + closure link + local-render note + cross-ref invariant) 모두 있음. HTML comment = build-time metadata, blockquote = operator-facing prose 분리. design 적으로 더 정합.

**A3 INFO (LOC over-estimate)**: 본 W2 가 doc-only 인데 ×2 multiplier 적용 → 큰 폭으로 under-shipped (165 actual vs 400 floor). [[feedback-loc-estimate-x2]] 메모 의 exception clause 를 "doc-only sub-WS ×1.5 OK" 로 확장 검토 후보. W5 closure 에서 V25-OPS 전체 retrospective 할 때 평가.

**A4 INFO (banner byte-consistency)**: 5 banner L5 byte-identical, L6-7 per-module differentiated (D2 inline duplication 원칙). closure trace 만.

---

## §6 Self-application validation

W2 자체가 본 sub-WS 가 codify 한 룰의 두 번째 적용 대상.

| Rule (from W1 + V24 retrospective) | W2 적용 | 통과? |
|---|---|---|
| Phase 0 scope cutter | Researcher 가 musu-indexer/README.md 실존 발견 (52 line live Python doc). plan v1 D6 가정 (single "신규 작성" path) 위배 → Critic C1 HIGH escalate → plan v2 D6b revised | ✓ (frame correction 의 second instance) |
| LOC ×2 | W2 plan estimate 350 → 700 ceiling, 실제 ship 165 LOC → over-conservative 발견 → A3 INFO 로 memo refinement 후보 | ✓ (×2 가 safety margin 으로 정상 작동, 단 doc-only 는 더 narrow gap OK) |
| Dual-audit narrow trigger | W2 4 조건 0 매치 (doc-only, no install/migration/auth/one-way) → single Auditor → Auditor 6 finding 모두 LOW + INFO | ✓ (dual 적용했어도 추가 catch 0 예상) |
| Phase -1 EXEMPT | V25-OPS master 전체가 EXEMPT, sub-WS 도 EXEMPT (V-agnostic 일반 룰) | ✓ |
| Out of scope (operator manual) | §1 OUT 의 R10 deletion 실행 + INSTALL.md (musu-control 한 정 historical-only mention) operator-gated 명시 | ✓ |

W1 의 PLAN_TEMPLATE.md sub-WS template §1.1 F1 row pattern 도 W2 plan §1.1 에 정확히 적용됨 (F1: markdown-only no Python code per [[feedback-no-python]]).

---

## §7 Next sub-WS

W3 (wiki/504) — R10 runbook completeness. Prereq: W2 commit clean (✓ 310855c).
- W3 scope: V24_CLOSURE_2026_05_21.html §4.1 line 126-152 R10 runbook 의 85% completeness 를 100% 로. facade.rs/mod.rs 정확한 line number + SHA pin + cargo check verification + git revert dry-run.
- W3 Critic 가 R10 list 수정 시 W2 banner (5 module) 영향 받음 — Cross-ref invariant HTML comment (C4) 가 정확히 그 case 대비.

W2 의 dual-audit trigger memo self-application 결과: W3 도 dual-audit 면제 가능성 high (HTML doc edit + line number citation, no install/migration/auth/one-way blast). W3 detail plan 의 §1.0 Critic/Auditor row 에서 명시.

---

## §8 References

- `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W2 + §4.2
- `docs/V25_OPS_W2_DEPRECATION_BANNERS_2026_05_21.md` (wiki/503) — plan v2 with §10 + §11 findings populated
- `docs/V25_OPS_W1_CLOSURE_2026_05_21.md` (wiki/502c) — W1 closure precedent (markdown sub-WS closure)
- `docs/V25_OPS_W1_PLAN_TEMPLATE_AND_MEMORY_2026_05_21.md` (wiki/502) — W1 plan format reference
- `docs/PLAN_TEMPLATE.md` — V-agnostic skeleton (W1 output, W2 self-application)
- `docs/V24_QUAL_EVAL_2026_05_21.md` — 5 finding source (Finding 5 visibility)
- `docs/V24_CLOSURE_2026_05_21.html` §4.1 — R10 runbook 5 module list canonical source
- `README.md` — Modules table edit target
- 5 module READMEs: `musu-bridge/README.md`, `musu-core/README.md`, `musu-control/README.md`, `musu-indexer/README.md`, `musu-writer/README.md`
- Memory: [[feedback-no-python]] (F1 source), [[feedback-phase0-scope-cutter]] (Researcher frame correction validation), [[feedback-loc-estimate-x2]] (A3 INFO refinement candidate), [[feedback-dual-audit-trigger-narrow]] (W2 single-Auditor 정당화), [[feedback-autonomous-loop]] (/loop autonomous)
