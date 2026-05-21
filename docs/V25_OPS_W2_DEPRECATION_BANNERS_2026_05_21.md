# V25-OPS W2 — Python deprecation banners (detail plan)

**Wiki ID**: wiki/503 (this plan) + wiki/503c (closure)
**Date**: 2026-05-21
**Branch**: `v24/rust-cleanup`
**Master plan**: `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W2 row, §4.2
**Estimate**: artifacts 350 → **700 LOC markdown ×2**
**Builder**: orchestrator-direct (technical-writer subagent 가 markdown-only doc 작업에 unnecessary overhead)
**Critic**: `system-architect` (single — no auth/migration/install/one-way blast)
**Auditor**: `quality-engineer` (single, dual-audit 면제)

---

## §1 Scope

**IN** (7 file touches):
1. `F:\workspace\musu-bee\README.md` (edit) — Modules table (L27-38) Python row 들에 deprecation 표기 + Rust subcommand 대체 명시
2. `F:\workspace\musu-bee\musu-bridge\README.md` (new) — deprecation 배너
3. `F:\workspace\musu-bee\musu-core\README.md` (new)
4. `F:\workspace\musu-bee\musu-control\README.md` (new)
5. `F:\workspace\musu-bee\musu-indexer\README.md` (new) — 주의: musu-indexer 의 pyproject.toml L9 가 `readme="README.md"` 라는 라인을 가짐 (Phase 0 finding) → 이 file 이미 존재하는지 검증 + 존재시 banner prepend / 미존재 시 신규 작성
6. `F:\workspace\musu-bee\musu-writer\README.md` (new)
7. (검증용, 코드 변경 0) `F:\workspace\musu-bee\docs\V25_OPS_W1_PLAN_TEMPLATE_AND_MEMORY_2026_05_21.md` — W2 reference 추가 옵션, 가능하면 생략

**OUT** (W2 가 절대 손대지 않음):
- Python 코드 (`__init__.py` 에 `warnings.warn` 추가 등) — [[feedback-no-python]] 위반. **markdown only**
- 5 Python module dir 의 다른 file (pyproject.toml, .py 등) — 변경 0
- **`pyproject.toml`** 의 어느 field 도 touch 금지 (특히 musu-indexer/pyproject.toml:9 `readme="README.md"` field 그대로). published-package metadata 변경 부수효과 = R10 deletion 이 처리 (Critic C5)
- **musu-control/INSTALL.md** — W2 scope 밖. R10 deletion 시 같이 삭제. banner 가 reference 만 함 (Critic C7)
- `MODE_Agent_Team.md` (~/.claude global) — 변경 0
- W3/W4/W5 task
- R10 실제 deletion (operator manual)
- 5 module 의 R10 시 cleanup 외 step (W3 의 일)
- Rust binary path (`musu bridge` 등) 자체 검증 — W2 는 단순히 배너 + 표 update, Rust subcommand 작동 검증은 V24-R8 closure 가 이미 했음

---

## §1.1 Locked decisions

| ID | Decision | Source |
|---|---|---|
| D1 | Banner format = **markdown blockquote** `> ⚠️ **DEPRECATED** (V24 R10 pending)`. HTML blockquote (closure doc style) 사용 X — Python module README 는 GitHub render 우선 | Phase 0 Researcher (F) 권장안 1 |
| D2 | 5 module README **inline 복제** (각자 독립 file). cross-link 1 개만 master closure (wiki/500) 로 | master §4.2 + Phase 0 (D) |
| D3 | Banner 안에 **Rust subcommand 대체 명시** ("Use `musu bridge` instead" 등) | Phase 0 (C) ground truth |
| D4 | R10 실행 시 deletion target 임을 명시 (`rm -rf` 대상) + V24 closure §4 link | Phase 0 (E) |
| D5 | README.md top-level Modules 표 (L27-38) 의 Python row 5 개 "What" cell 에 `(⚠️ Deprecated R10-pending; Rust: musu <cmd>)` suffix 추가. Language column 의 "Python" 그대로 (R10 후 row 자체 삭제) | Phase 0 (A) finding + 권장 1 |
| D6 | musu-indexer 의 README.md 가 이미 존재할 가능성 확인 → exist 면 banner prepend, 미존재 면 신규 작성 (다른 4 module 과 동일) | Phase 0 (B) note about pyproject readme field |
| **D6b (Critic-revised C1)** | **musu-indexer/README.md 실제 존재** (52 line Python live doc). Builder 가 다음 처리: (a) 신규 banner blockquote prepend, (b) 기존 body 를 `## Legacy Python surface (R10-pending deletion)` heading 으로 wrap, (c) heading 뒤에 기존 52 line 그대로 보존 (history audit trail) | Critic C1 HIGH: prepend-only 시 banner 뒤에 live Python 설명 = 내부 모순 |
| **D7 (Critic-revised C2)** | V24 closure link path = **`../docs/V24_CLOSURE_2026_05_21.html`** (sub-dir 기준 relative depth `..` exact). top-level `README.md` 에서는 `docs/V24_CLOSURE_2026_05_21.html`. Banner body 에 `(open locally for rendered view, or view raw on GitHub)` 메모 | Critic C2 HIGH: GitHub `.html` blob 가 source code render, banner 의 R10 runbook link 잘못 |
| **D8 (Critic-revised C3)** | top-level `README.md` Modules 표 = **Status column 추가** (`Active` / `Deprecated (R10-pending)` / `Active (Rust subcommand)`). Status column 으로 13 row 의 semantic 명확. row 추가 vs cell update 둘 다 — Status column 이 unified | Critic C3 MED: 5 Rust row 추가 시 musu-relay / musu-bee / musu-ai-detector 의 absence 가 모호 |
| **D9 (Critic-revised C5)** | `pyproject.toml` 의 어느 field 도 touch 금지. musu-indexer/pyproject.toml:9 `readme="README.md"` field 그대로. published-package metadata semantic 변경 = R10 deletion 이 처리 | Critic C5 MED: F1 redundancy 보완 |
| **D10 (Critic-revised C7)** | musu-control/INSTALL.md 그대로 두기. banner body 에 한 줄 `See INSTALL.md only for historical reference; install path is now \`musu install\` (Rust)` | Critic C7 LOW: 일관된 operator-facing visibility |
| **F1 (Phase 0 frame correction)** | 초기 plan brief 에 `__init__.py warnings.warn` 같은 Python 코드 추가 가능성 언급. [[feedback-no-python]] 위반 → **markdown only**, Python source 변경 0 | Phase 0 (F) Researcher 권장 2 challenged: violates feedback-no-python memory rule |

---

## §2 Stack

`N/A (markdown-only doc work)`

---

## §3 Module touch list

| # | Path | Action | LOC est ×2 | Notes |
|---|---|---|---|---|
| 1 | `README.md` | edit | +50 → **+100** (5 row + Rust counterpart row 추가 가능) | Modules table L27-38 |
| 2 | `musu-bridge/README.md` | new | 30 → **60** | banner + Rust mapping (`musu bridge` for HTTP, native handlers replace Python facade) |
| 3 | `musu-core/README.md` | new | 30 → **60** | banner + Rust mapping (`musu core` — companies/agents/audit/adapters) |
| 4 | `musu-control/README.md` | new | 30 → **60** | banner + Rust mapping (`musu control` MCP stdio) |
| 5 | `musu-indexer/README.md` | new OR prepend | 30 → **60** | banner + Rust mapping (`musu indexer` FTS5) |
| 6 | `musu-writer/README.md` | new | 30 → **60** | banner + Rust mapping (`musu writer` task exec) |
| 7 | `docs/V25_OPS_W2_DEPRECATION_BANNERS_2026_05_21.md` | this plan | (already authored) | — |

**Total**: 200 base → **400 ×2** (master §3 W2 budget 350 → 700 ceiling 내). 본 detail 표는 **floor**, master §3 W2 row 는 **ceiling**. gap (300 LOC) 는 §10 Critic Findings + §11 Auditor Findings row 추가 reserve (W1 precedent per [[feedback-loc-estimate-x2]]). 5 module README 가 nearly identical template — per module 의 Rust subcommand 차이 + musu-indexer 만 D6b legacy heading wrap.

---

## §4 Schema delta

`N/A`

---

## §5 Order of operations

1. **musu-indexer/README.md 존재 여부 확인** (D6) — `ls` 또는 `Read` 시도. 없으면 다른 4 module 과 동일 패턴 신규 작성. 있으면 banner 만 prepend.
2. **5 module README 작성/edit** — 동일 template skeleton 사용:
   - 1 line title (module name)
   - 1 paragraph banner (`> ⚠️ **DEPRECATED** (V24 R10 pending)` 포함)
   - 2 paragraph context (이 module 의 옛 role + Rust 대체 subcommand + V24 closure link)
3. **README.md top-level Modules 표 update** — Python row 5 개의 "What" cell 에 deprecation suffix 추가. Rust 대체 row 5 개 신규 추가 (`musu bridge`, `musu core`, `musu control`, `musu indexer`, `musu writer`) — Language: Rust.
4. **self-grep §6 acceptance** — 모든 banner 가 정확한 string anchor 포함 (`DEPRECATED`, `R10`, `musu` subcommand 이름)
5. **single git commit** — 6 file touch (README.md edit + 5 module README) 묶음

실패 시 `git restore` rollback.

---

## §6 Acceptance criteria

1. `README.md` L27-38 Modules table 에 **Status column 추가** (4번째 column, after "Language"). Python row 5 개 status = `Deprecated (R10-pending)`. Non-deprecated 3 row (musu-relay, musu-bee, musu-ai-detector) status = `Active`. Rust subcommand 신규 row 5 개 status = `Active (Rust subcommand)`. grep test: 'Deprecated (R10-pending)' 5 hit + 'Active (Rust subcommand)' 5 hit + 'Active' (4th column 단독, not in Deprecated/Rust) 3 hit. (D8 per Critic C3)
2. `README.md` Modules table 에 Rust subcommand 신규 row 5 개 (`musu bridge`, `musu core`, `musu control`, `musu indexer`, `musu writer`) 추가. Language column "Rust". (D5 + D8)
3. 5 module dir 각각 `README.md` 존재. `ls musu-{bridge,core,control,indexer,writer}/README.md` 모두 hit.
4. 각 module README 첫 5 line 안에 `> ⚠️ **DEPRECATED**` literal + `R10` literal 포함.
5. 각 module README 안에 그 module 의 Rust 대체 subcommand 명시 (`musu bridge` / `musu core` / `musu control` / `musu indexer` / `musu writer`) — 정확한 매핑 (Phase 0 C 표 따라가기).
6. 각 module README 안에 V24 closure link **`../docs/V24_CLOSURE_2026_05_21.html`** literal (sub-dir 의 정확한 relative depth) 포함. grep test: 각 module README 에 정확히 1 hit, bare `docs/V24_CLOSURE_2026_05_21.html` (without `../`) zero hit. (D7 per Critic C2)
6b. (Critic C1) musu-indexer/README.md 검사: `python -m venv` literal 이 banner 줄 (DEPRECATED 줄) BELOW 에 있음 + `## Legacy Python surface` heading 이 banner BELOW + `python -m venv` ABOVE 에 있음.
6c. (Critic C4) 각 5 module README 의 첫 줄 또는 banner 직후에 HTML comment `<!-- Cross-ref invariant: matches V24_CLOSURE §4.1 R10 deletion list. -->` 포함.
6d. (Critic C7) musu-control/README.md banner body 에 INSTALL.md historical-only 한 줄 명시.
7. Python 코드 변경 0: `git diff --stat HEAD~ -- '*.py' 'pyproject.toml'` 0 line change. **D9 추가** — `pyproject.toml` 의 어느 field 도 touch 금지 (특히 musu-indexer/pyproject.toml:9 readme field 그대로).
8. 모든 6 file touch (1 README edit + 5 new) single git commit. Const VII per-W gate.
9. R10 runbook `rm -rf` 5 module list 와 본 W2 banner 5 module 정확히 매치 (`musu-{bridge,core,control,indexer,writer}`).
10. (×2 self-application) 본 plan doc 의 §10/§11 Critic + Auditor row 추가 후에도 master ceiling (350 → 700) 내.

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| RV2-1 | HIGH | Builder 가 [[feedback-no-python]] 무시하고 `__init__.py` 에 Python deprecation warning 추가 | F1 Locked decision + §1 OUT 명시 + §6.7 Python source 변경 0 check |
| RV2-2 | MED | musu-indexer/README.md 이미 존재 (D6) 시 기존 내용 destruct | §5 step 1 에서 `Read` 시도, 있으면 prepend 만 |
| RV2-3 | MED | 5 module README 가 byte-identical 변형 안 됨 (Rust subcommand 매핑 차이) | Phase 0 (C) 표 byte-by-byte 따라가기 |
| RV2-4 | LOW | top-level README Modules 표 의 Python row 의 다른 column (Language) 도 함께 update 필요한지 ambiguous | D5 명시: Language column "Python" 유지 (R10 후 row 자체 delete) |
| RV2-5 | LOW | Banner 안의 V24 closure link 가 relative path vs absolute | relative path (`docs/V24_CLOSURE_2026_05_21.html`) GitHub render fit |
| RV2-6 | LOW | 5 module README size 가 너무 작아서 (~30 line) "stub" 처럼 보임 | acceptable — deprecation 배너 + context 한 단락 + Rust mapping 한 단락 = 30 line 적정 |

---

## §8 Critic seed (system-architect)

- §1.1 F1 (Phase 0 frame correction) 가 [[feedback-no-python]] 적용 explicit? Builder 가 무시할 수 있나?
- 5 module banner 가 byte-identical 인가 differentiated 인가? per-module differentiated 가 맞나 (Rust subcommand 명 차이) 아니면 single banner template 으로 통일하나?
- README.md Modules 표 update 가 row 추가 vs cell update 둘 다 하나? 또는 한쪽만?
- musu-indexer/README.md 이미 존재 시 handling (§5 step 1) plan 안에 명시 충분한가?
- §6.9 R10 runbook 5 module list 와 정확히 매치 확인이 mechanical check 가능한가?
- Banner 의 V24 closure link 가 absolute (`/docs/V24_*`) vs relative (`../docs/V24_*` from `musu-bridge/`) — 어느 쪽이 GitHub + local 둘 다 동작?
- Const VII single commit 가 6 file touch (1 edit + 5 new) 묶음 — drift 없이 atomic 가능한가?

---

## §10 Critic Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| C1 | HIGH | musu-indexer/README.md body handling | 기존 52 line live Python doc (L18-23 `python -m venv` install, L36-43 `musu-indexer sync\|search\|recent\|mcp` CLI surface). prepend-only 시 banner 뒤에 live Python 설명 = 내부 모순, operator 오인 가능 | D6b new: banner prepend + 기존 body 를 `## Legacy Python surface (R10-pending deletion)` heading 으로 wrap. §6 acceptance: `python -m venv` 가 banner 줄 ABOVE 에 없음 + Legacy heading ABOVE 에 있음 |
| C2 | HIGH | V24 closure link path | Bare `docs/V24_CLOSURE_2026_05_21.html` 가 sub-dir README 에서 broken (relative depth `..` 누락) + GitHub blob 이 .html source 로 render | D7 new: sub-dir = `../docs/V24_CLOSURE_2026_05_21.html`, top-level README = `docs/V24_CLOSURE_2026_05_21.html`. Banner 안에 `(open locally for rendered view, or view raw on GitHub)` 메모 |
| C3 | MED | Modules table 13-row asymmetry | 8 existing + 5 Rust = 13 row. musu-relay/musu-bee/musu-ai-detector 가 Rust 미 추가 → 모호 ("이것들도 deprecated?") | D8 new: Status column 추가 (`Active` / `Deprecated (R10-pending)` / `Active (Rust subcommand)`) |
| C4 | MED | R10 list cross-doc invariant | §6.9 매치 check 가 one-shot. W3 가 R10 deletion list 수정 시 banner 5 module drift silent | §6.9b new + 각 module README 첫 줄에 HTML comment `<!-- Cross-ref invariant: this banner matches V24_CLOSURE §4.1 R10 deletion list. If you modify R10 list, update all 5 module READMEs. -->` |
| C5 | MED | pyproject.toml touch vector | §1 OUT 가 `pyproject.toml` field touch 명시 안 함. Builder 가 'aligning' 명목으로 musu-indexer/pyproject.toml:9 readme field 만질 가능성 | D9 new + §1 OUT 명시 추가 |
| C6 | LOW | Banner format clarity | D1 single-line literal vs §5 step 2 "한 단락" vs RV2-6 "한 단락 + 한 단락" — block 구조 모호 | D1 clarified: 5-line multi-line markdown blockquote (DEPRECATED line + Rust replacement + V24 closure link + local-render note + cross-ref invariant link) |
| C7 | LOW | musu-control/INSTALL.md 잔존 | musu-control 에 live Python install doc (uvx, pip install -e .) 존재. README banner + INSTALL.md 분리 시 후자 stale-doc pocket | D10 new: banner body 에 INSTALL.md historical-only 한 줄 |
| C8 | LOW | Master/detail LOC reconciliation | §3 last paragraph 가 W1 precedent (master=ceiling, detail=floor, gap=§10/§11 reserve) 명시 안 함 | §3 last paragraph 추가 (위에) |
| C9 | INFO | Const VII single-commit OK | 6 file touch in one commit acceptable for doc-only | accepted, no change |
| C10 | INFO | F1 redundancy intentional | 4x cover ([[feedback-no-python]]) 가 load-bearing invariant 의 정확한 cost/benefit | accepted, no change |

(Critic v1: system-architect Phase 1.5, 2026-05-21. 2 HIGH + 3 MED + 2 LOW + 3 INFO. HIGH 2 + MED 4 모두 plan v2 D6b/D7/D8/D9/D10 + §3 reconciliation + §6 추가 acceptance 로 반영. re-Critic 불요.)

---

## §11 Auditor Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| A1 | LOW | musu-indexer legacy body 4 textual deltas | Critic C1 spec 가 "preserve 52 lines as-is" 인데 Builder 가 tense edits ('ship→shipped' L48, 'lives→lived' L71), sub-heading demotion (##→### Install/Workspace/CLI/DB), L73 Rust path preservation addendum 추가 | Accepted: Builder-discretionary improvements within C1 intent. audit trail purpose 유지 + past-tense framing 강화. closure doc 에 명시 |
| A2 | LOW | Banner 5-line spec vs 4-line + HTML comment | Critic C6 resolution literal "5-line multi-line blockquote" 이었으나 Builder 가 4-line blockquote + L1 HTML comment 로 cross-ref invariant 처리. 5 content element (DEPRECATED + replacement + closure link + local-render note + cross-ref invariant) 모두 있음 | Accepted: Builder interpretation 가 build-time metadata 와 operator-facing prose 분리 — 더 좋은 design choice. closure doc 에 future banner-editor 가 구조 이해 가능하게 기록 |
| A3 | INFO | LOC ×2 over-estimate for doc-only | W2 net artifact LOC 153 (5 module README 140 + README.md edit 25 − overlap). detail floor 400 / master ceiling 700 둘 다 큰 폭으로 under. ×2 multiplier 가 doc-only sub-WS 에는 over-conservative | candidate refinement: [[feedback-loc-estimate-x2]] 메모 의 exception clause ("pure-refactor or <150 LOC sub-WS 만 ×1") 를 "doc-only sub-WS 도 ×1.5 OK" 로 확장 고려. W5 closure 에 검토 후보로 기록, 본 W2 에서 action 안 함 |
| A4 | INFO | 5 banner byte-consistency | 5 module README 의 L5 blockquote opener byte-identical (`> ⚠️ **DEPRECATED** (V24 R10 pending)`). L6-7 per-module 차이 (specific Rust subcommand). musu-control 가 L10 INSTALL.md 한 줄 추가 (D10). D2 inline duplication 원칙 정확히 따름 | accepted, no change. closure doc trace 만 |

(Auditor: quality-engineer Phase 5 single, 2026-05-21. 0 HIGH + 0 MED + 2 LOW + 2 INFO. SHIP-OK. 모든 prior Critic finding 명시 해소 확인 — HANDOFF NOTES 참조. Dual-audit 4 조건 0 매치 (doc-only, no install/migration/auth/one-way blast) — single Auditor 정당.)

---

## §12 References

- `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W2 + §4.2
- `docs/V25_OPS_W1_PLAN_TEMPLATE_AND_MEMORY_2026_05_21.md` (wiki/502) — W1 plan format reference
- `docs/V25_OPS_W1_CLOSURE_2026_05_21.md` (wiki/502c) — W1 closure format reference
- `docs/V24_QUAL_EVAL_2026_05_21.md` §10 — Finding 5 (Python dead code visibility) source
- `docs/V24_CLOSURE_2026_05_21.html` §4.1 — R10 runbook with exact 5 module deletion list
- `docs/V24_RUST_BIG_BANG_MASTER_PLAN_2026_05_20.md` — Rust subcommand mapping (`musu bridge|control|writer|indexer|core`)
- `README.md` L27-38 — Modules table edit target
- Phase 0 Researcher finding (Explore agent, 2026-05-21) — README state + 5 module pyproject layout + banner pattern recommendation
- Memory: [[feedback-no-python]] (F1 frame correction source), [[feedback-scribe-html-only]] (markdown for sub-WS closure), [[feedback-autonomous-loop]] (/loop autonomous)
