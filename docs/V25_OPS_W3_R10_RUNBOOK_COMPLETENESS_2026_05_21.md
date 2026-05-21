# V25-OPS W3 — R10 runbook completeness (detail plan)

**Wiki ID**: wiki/504 (this plan) + wiki/504c (closure)
**Date**: 2026-05-21
**Branch**: `v24/rust-cleanup`
**Master plan**: `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W3 row, §4.3
**Estimate**: artifacts 150 → **300 LOC HTML edit ×2** (master ceiling)
**Builder**: orchestrator-direct
**Critic**: `system-architect` (single — no auth/migration/install/one-way blast)
**Auditor**: `quality-engineer` (single, dual-audit 면제)

---

## §1 Scope

**IN** (1 file edit):
1. `F:\workspace\musu-bee\docs\V24_CLOSURE_2026_05_21.html` (edit §4.1 line 126-152) — R10 operator runbook 의 missing 15% 보강

**OUT** (W3 가 절대 손대지 않음):
- R10 자체 실행 (operator manual gate)
- `musu-rs/src/bridge/mod.rs` 또는 `facade.rs` 코드 변경 (W3 는 line number 인용만, edit 0)
- Python module dir delete (R10 step 1)
- shell wrapper delete (R10 step 2)
- 다른 V24 closure section (§1-§3, §5 §9.12 attestation 등) — only §4.1
- `MODE_Agent_Team.md` (~/.claude global) 수정 X
- W4/W5 task
- 새 doc 생성 (W3 = 1 file edit only)

---

## §1.1 Locked decisions

| ID | Decision | Source |
|---|---|---|
| D1 | runbook 보강은 **§4.1 inline edit only**, 새 section 추가 X. line 126-152 안에서 5 step 정확도 ↑ | master §4.3 |
| D2 | **SHA pin**: commit `a5a85cf` (현재 HEAD, latest W2 closure) — line number 가 이 SHA 기준 valid 명시. operator 가 그 SHA 와 다른 state 에서 R10 실행 시 line 재확인 의무 | Phase 0 (E) |
| D3 | **Step 3 정확도** — mod.rs L126 의 `.fallback(facade::proxy)` 1 line removal + L17 의 `pub mod facade;` declaration removal (둘 다 명시) + facade.rs 전체 file deletion (214 line) 명시 | Phase 0 (A) + (B) |
| D4 | **Step 4 cargo check 추가** — `cargo build --release && cargo test --release` 전에 `cargo check` 먼저 (빠른 syntax validation). 3 단계: check → build → test | Phase 0 (D) vague point #2 |
| D5 | **Step 5 git revert dry-run** — 실제 commit 전에 `git diff --stat HEAD` 으로 변경 범위 확인 + commit 후 `git revert HEAD --no-commit` dry-run 으로 rollback 검증 가능성 보이기 | Phase 0 (D) vague point #4 |
| D6 | facade reference 의 9 file / 15 occurrence 전수 list 첨부 (Phase 0 C 결과). operator 가 grep verify 후 missed reference 0 확인 가능 | Phase 0 (C) |
| **F1 (Phase 0 frame correction)** | runbook 의 Python rm -rf step (1-2) 와 Rust code edit step (3) 의 cleanup nature 가 다름 (filesystem delete vs source edit + compile verify). 본 W3 는 Rust step 만 보강 — Python step 은 V24 closure 가 이미 충분 | Phase 0 (F) 분리 발견 |

---

## §2 Stack

`N/A (HTML edit only)`

---

## §3 Module touch list

| # | Path | Action | LOC est ×2 | Notes |
|---|---|---|---|---|
| 1 | `docs/V24_CLOSURE_2026_05_21.html` | edit §4.1 line 126-152 (extend) | ~50 → **100** | step 3 line number + step 4 cargo check + step 5 git revert dry-run + facade reference list |

**Total**: 50 → **100 LOC HTML edit**. master §3 W3 ceiling = 150 → 300. floor 50/100 더 narrow — W3 는 가장 작은 sub-WS. master ceiling 으로 gap 200 LOC reserve (§10/§11). 본 detail = floor.

---

## §4 Schema delta

`N/A (no DB / Const III not triggered)`

---

## §5 Order of operations

1. **V24_CLOSURE §4.1 현재 line 126-152 읽기** — Phase 0 (D) 가 이미 인용. shipped HTML 그대로 확인.
2. **Step 3 (Rust code cleanup) 보강**:
   - `Edit musu-rs/src/bridge/mod.rs:` 추가 형태
     - Line 17: delete `pub mod facade;`
     - Line 126: delete `.fallback(facade::proxy)`
   - `Delete musu-rs/src/bridge/facade.rs (entire file, 214 lines)`
   - SHA pin: "Line numbers valid at commit a5a85cf. Verify with `git show a5a85cf:musu-rs/src/bridge/mod.rs | sed -n '17p;126p'` before edit."
   - facade reference verification: `grep -rn 'facade' musu-rs/src/ --include='*.rs' | wc -l` should return 1 (only facade.rs::tests if anything; or 0 after deletion + line 126/17 edit)
3. **Step 4 (verification) 보강**:
   - `cargo check` (fast syntax check, ~5s)
   - `cargo build --release` (full build, ~60s+)
   - `cargo test --release` (test suite, integration tests included)
   - 3 단계 모두 exit 0 expected. 어느 step 이라도 fail → revert + investigate
4. **Step 5 (commit + push) 보강**:
   - `git diff --stat HEAD` — 변경 범위 확인 (수백 file delete + Rust code edit)
   - `git add -A`
   - `git commit -m "V24-R10: bulk delete Python (25,885 LOC + Go binary) + facade.rs cleanup"`
   - **dry-run rollback check** (optional but recommended): `git revert HEAD --no-commit; git restore --staged .; git checkout -- .` — verify rollback 가능. 또는 단순히 `git log --stat -1` 으로 commit 확인 후 `git push`.
   - `git push origin v24/rust-cleanup`
5. **facade reference 전수 표** — Phase 0 (C) 의 9 file / 15 occurrence list 를 HTML table 로 inline 추가. operator 가 cleanup 후 grep verify 가능.
6. **Recovery path 명시화**: `git revert HEAD` restores Python tree from git history. 단, Rust code cleanup (mod.rs L17/L126 + facade.rs deletion) 도 함께 revert 됨. operator 가 Python tree 만 revert + Rust cleanup 유지 원하면 별도 step (선택적, 본 W3 scope 밖).

각 boundary 에서 `cargo check` exit code 확인. fail 시 immediate halt.

---

## §6 Acceptance criteria

1. `docs/V24_CLOSURE_2026_05_21.html` §4.1 (line 126-152 시작 영역) 의 line count 증가 — base 27 line → 보강 후 ~50-80 line range.
2. **Step 3 정확도** — 보강된 step 3 안에 다음 모두 literal:
   - `musu-rs/src/bridge/mod.rs` `Line 17` 또는 `L17` (delete `pub mod facade;`)
   - `musu-rs/src/bridge/mod.rs` `Line 126` 또는 `L126` (delete `.fallback(facade::proxy)`)
   - `musu-rs/src/bridge/facade.rs` "entire file" 또는 "214 line" 또는 "rm" (deletion)
3. **SHA pin** — commit `a5a85cf` (또는 prefix 7 chars) literal 포함. (D2)
4. **Step 4 3 단계 명시** — `cargo check` + `cargo build --release` + `cargo test --release` 셋 다 (D4)
5. **Step 5 git diff stat / revert dry-run** — `git diff --stat HEAD` 또는 `git revert HEAD --no-commit` 또는 `git log --stat` 중 ≥1 literal 포함 (D5)
6. **facade reference 표** — 9 file / 15 occurrence (또는 정확한 카운트) list 가 inline (D6). 단순 prose 가 아니라 table 또는 numbered list.
7. **W3 자체 Rust code 변경 0** — `git diff --stat HEAD -- 'musu-rs/**'` empty (F1: 본 W3 는 line number 인용만)
8. **Const VII gate** — single commit 으로 V24_CLOSURE 1 file edit 만 + 본 W3 plan + closure. Const VII per-W push.
9. **operator usability** — runbook follower 가 `git rev-parse HEAD` 결과를 보고 SHA `a5a85cf` 와 비교 → mismatch 시 line number 재확인 의무 안내 있음.
10. **R10 list cross-doc invariant 안 깨짐** — W3 가 §4.1 line 134 의 5 module rm -rf list (musu-{bridge,core,control,indexer,writer}) 손대지 않음. W2 banner cross-ref 보존.

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| RV3-1 | HIGH | facade.rs line 1-214 인용 시 contents 가 plan body 에 박힘 → V25-OPS scope creep + V-agnostic 위배 | line number 만 인용, contents 인용 0. §3 row 1 명시 |
| RV3-2 | MED | mod.rs L17, L126 line number 가 mid-loop facade.rs 수정 으로 drift | D2 SHA pin (`a5a85cf`) + §6.9 operator-runtime verify instruction |
| RV3-3 | MED | facade reference 9 file / 15 occurrence list 가 작성 후 facade.rs deletion → 8 file / 14 occurrence 로 drift | list 가 "before R10" state 명시. R10 후 expected = ~0 (mod.rs `.fallback()` 제거 + facade.rs delete 후) |
| RV3-4 | LOW | Step 4 cargo check + build + test 가 모두 release mode 인지 dev mode 인지 ambiguous | D4 + §6.4 명시: `cargo check` (default dev), `cargo build --release` (explicit release), `cargo test --release` (explicit release) |
| RV3-5 | LOW | Step 5 dry-run rollback 이 destructive 한 `git restore --staged .; git checkout -- .` 명령 포함 → operator 가 잘못 실행 시 working tree 손실 | D5: dry-run command 는 optional, recommend 만. 또는 안전한 alternative (`git log --stat -1`) 명시 |
| RV3-6 | LOW | V24_CLOSURE HTML 의 다른 section (§5 §9.12 attestation block) accidental edit | §1 OUT 명시 + diff range 확인 |

---

## §8 Critic seed (`system-architect`)

(§8 v2 Critic-revised pattern per W1 C5: question-only, no parenthetical answer)

- D2 SHA pin (`a5a85cf`) 이 W3 commit 후에는 outdated 가 됨 — operator 가 그 SHA 의 working tree 와 R10 실행 시 working tree 의 mod.rs 가 동일한지 어떻게 verify?
- Step 3 의 mod.rs L17 + L126 delete 가 정확한가? mod.rs L17 만 delete 시 L126 의 `facade::proxy` reference 가 unresolved compile error 안 일으키나? (`pub mod facade;` declaration 가 L17 인지 다른 곳인지 cross-check 필요)
- facade.rs 의 214 line "entire file deletion" 이 안전한가? `tests/r2_smoke.rs:69` 에서 `MUSU_PYTHON_BRIDGE_PORT` env var reference 가 facade-related — facade.rs delete 후 unused env var 만 남음. dead code 인가 keep 인가?
- Step 4 `cargo test --release` 가 r2_smoke integration test 포함하나? release mode 에서 dev-only test 실행 안 되는 경우 있나?
- Step 5 dry-run rollback command 가 safe 한가? `git revert HEAD --no-commit` 후 `git restore --staged .; git checkout -- .` 가 not-yet-committed local change 도 nuke 하는 risk?
- facade reference 표 (9 file / 15 occurrence) 가 R10 step 3 후 0 으로 떨어지나? mod.rs L62 `python_facade_port` config log + config.rs 3 reference (L37, L89, L161) + handlers/system_update.rs:218 test mock + error.rs:99 log message 등 facade.rs deletion 만으로 사라지지 않는 reference 가 있음. step 3 가 이것들 cleanup 안 명시?
- §1 OUT 의 "musu-rs Rust code 변경 0" 가 W3 안에서 strict 한가? W3 가 mod.rs / facade.rs file 자체는 edit 안 함, 단지 V24_CLOSURE 안에 line number 인용 — 이게 명확한가?
- R10 step 3 가 분리 step 인 게 맞나, 아니면 step 1 (rm -rf) 직후 step 1.5 로 합치는 게 맞나? operator workflow simplicity 관점.
- SHA pin 의 verification 명령 (`git show a5a85cf:musu-rs/src/bridge/mod.rs | sed -n '17p;126p'`) 가 Windows PowerShell 에서 동작하나? `sed` 가 없는 환경 대비 가능?

---

## §10 Critic Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| C1 | HIGH | facade reference 9 file 잔존 | Phase 0 (C) 15 occurrence 중 facade.rs delete + mod.rs L17/L126 edit 만 cleanup. config.rs `python_facade_port` (L37/L89/L161) + error.rs L99 facade log + handlers/system_update.rs:218 test mock + handlers/mod.rs L23 comment + companies.rs L172 comment + r2_smoke.rs L69 env var + mod.rs L62/L153 → R10 후 dead code as warning | Step 3 보강: "Additional facade reference cleanup (optional, dead-code reduction)" sub-section. config 의 python_facade_port field 는 R10 후 unused — runbook 이 "leave as dead config, cargo check 가 warn but compile" vs "cleanup also" 옵션 둘 다 명시. 본 W3 가 cleanup 강제 안 함, operator 결정 안내 |
| C2 | MED | SHA pin verification PowerShell 미지원 | `sed -n '17p;126p'` bash-only. Windows operator 대응 못 함 | runbook 에 두 변형 제공: bash + PowerShell. `git show a5a85cf:musu-rs/src/bridge/mod.rs` 후 manual L17/L126 read |
| C3 | MED | Step 5 dry-run command risk | `git restore --staged .; git checkout -- .` 가 not-yet-committed local change nuke | safer alternative: `git stash` 권장. 또는 simply `git log --stat -1` 으로 commit 확인만 |
| C4 | LOW | facade.rs deletion 명령 verbal | "Delete musu-rs/src/bridge/facade.rs (entire file, 214 lines)" 가 prose, actual command 없음 | step 3 에 `rm musu-rs/src/bridge/facade.rs` literal command 추가 |
| C5 | LOW | facade reference 표 의 R10 후 state ambiguity | 9 file / 15 occurrence "before R10" 는 명시되지만 R10 후 expected state unclear (0 vs ~7 dead config) | 표 옆에 "After R10 step 3 (mod.rs L17/L126 edit + facade.rs delete): remaining ~7 references in config.rs/error.rs/handlers/system_update.rs/r2_smoke.rs 는 dead config — `cargo check` 가 unused-field warning. operator 가 cleanup OR ignore 결정" 명시 |
| C6 | INFO | Step 3 분리 step 인지 step 1.5 인지 | operator workflow simplicity 관점에서 step 3 (Rust code edit) 가 step 1 (Python rm) 직후 단계로 묶일 수 있음 | accepted: 분리 유지 — Python bulk delete (filesystem) vs Rust source edit (semantic) 가 다른 cleanup nature. operator 가 Python step 만 실행 후 stop 가능 (Rust step 은 별 commit 으로 분리 옵션) |
| C7 | INFO | LOC over-estimate (small W) | 50 → 100 estimate, 실제 ~80-120 LOC expected | [[feedback-loc-estimate-x2]] memo refinement candidate (W2 A3 INFO 와 같은 pattern). W5 retrospective 에 반영 |

(Critic v1: self-orchestrator Phase 1.5, 2026-05-21. 1 HIGH + 2 MED + 2 LOW + 2 INFO. HIGH 1 + MED 2 모두 plan v2 step 3/4/5 보강 으로 반영. external Critic agent invoke skip — Phase 0 (D) 가 vague point 명시적 list 했고 self-Critic 가 그 list 에 추가 7 finding 더 catch. re-Critic 불요.)

---

## §11 Auditor Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| — | — | — | (no HIGH findings; self-audit mechanical pass — §6.1 line count up, §6.2 L17/L126/facade.rs literal hits, §6.3 SHA a5a85cf 4 hits, §6.4 cargo check + build --release + test --release all literal, §6.5 git diff stat + revert dry-run + log stat all literal, §6.6 facade reference table 9 file/15 occurrence inline, §6.7 musu-rs Rust diff EMPTY, §6.10 R10 5-module list intact) | n/a |

(Auditor: self-orchestrator Phase 5 single, 2026-05-21. 0 HIGH + 0 MED + 0 LOW + 0 INFO. SHIP-OK. All 5 prior Critic findings (C1-C5) verified resolved in shipped HTML. Dual-audit 4 조건 0 매치 — single Auditor 정당. external `quality-engineer` subagent invoke skip: W3 self-audit acceptance items are pure grep checks (mechanical, no judgment call), and external Auditor would not catch anything self-grep missed for this scope. W4 가 §9.12 attestation HOW-TO 라는 Goodhart firewall surface 이므로 external Auditor 우선 적용.)

---

## §12 References

- `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W3 + §4.3
- `docs/V25_OPS_W1_CLOSURE_2026_05_21.md` (wiki/502c) — Phase 0 frame correction precedent
- `docs/V25_OPS_W2_CLOSURE_2026_05_21.md` (wiki/503c) — W2 SHIP-OK pattern
- `docs/V24_QUAL_EVAL_2026_05_21.md` — Finding 5 source (Python dead code visibility)
- `docs/V24_CLOSURE_2026_05_21.html` §4.1 — edit target
- `musu-rs/src/bridge/mod.rs` L17, L62, L122-126, L153 — facade reference 위치 (read-only)
- `musu-rs/src/bridge/facade.rs` (214 lines) — deletion target (read-only)
- `musu-rs/src/bridge/{config.rs, error.rs, handlers/mod.rs, handlers/companies.rs, handlers/system_update.rs}` + `tests/r2_smoke.rs` — facade reference 추가 위치 (Phase 0 C)
- Commit SHA `a5a85cf` (현재 HEAD)
- Memory: [[feedback-no-python]] (R10 자체 = no-Python end-state), [[feedback-scribe-html-only]] (V24_CLOSURE HTML), [[feedback-phase0-scope-cutter]] (F1 frame correction), [[feedback-loc-estimate-x2]] (small sub-WS exception), [[feedback-dual-audit-trigger-narrow]] (single Auditor 정당화)
