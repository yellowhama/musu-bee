# Master Plan — v17.A Sprint Contract + Audit Cleanup (2026-05-13)

> v16 사이클 끝난 시점 (HEAD `f4a5cbf`) 에서 미해결로 남은 11개 작업 중,
> Sprint Contract 영역과 P1/P2 audit findings 만 묶어서 처리하는 사이클.
> TODO B/C/D (infra) 는 v17.B 로, E/F (외부) 는 별 cycle.

## 0. Scope

### 포함

| ID | 위치 | severity | 작업 |
|---|---|---|---|
| TODO A | `qa_loop.py` / `handlers.py` | P1 | Sprint Contract lock wiring — Engineer accept 시 `lock_sprint_contract` 호출 |
| F4 | `backends/local.py:1423` | P1 | `update_sprint_contract` TOCTOU race fix (select-then-write → conditional UPDATE) |
| F5 | `migrations.py` | P2 | `sprint_contracts.updated_at` 컬럼 추가 (migration v26) |
| F7 | `server.py:1324` | P2 | `SprintContractUpdateRequest` 의 list length / item length 제한 (DoS 차단) |
| F10 | `useSprintContract.ts:106` | P2 | `save()` 에 cancellation guard (task switch race) |
| F12 | `SprintContractSection.tsx:319` | P2 | EditList trailing-newline 사라짐 UX 버그 |
| F13 | `AppShell.tsx:218` | P2 | swipe gesture 가 textarea/canvas 안에서 시작 시 disable |

### 제외 (v17.B 또는 별 cycle)

- TODO B — install.ps1 의 indexer setup step (infra)
- TODO C — Go scanner 가 `ignore_globs` 무시 (infra)
- TODO D — bridge restart admin 없이 (infra)
- TODO E — HN/Reddit launch (marketing)
- TODO F — Mac install verify (머신 없음)

## 1. 사이클 구조 — 4 phase

각 phase 는 진입 시 detail plan 작성. 끝나면 그게 closure.

### Phase 1 — TOCTOU race fix (F4) + lock wiring (TODO A) (~45분)

같은 area (sprint contract concurrency) 라 묶음.

**산출물**:
- `backends/local.py:update_sprint_contract` 가 atomic UPDATE 사용 (`UPDATE ... WHERE id=? AND locked=0`) + rowcount 검증으로 LookupError/PermissionError 구분
- `handlers.py` 또는 `qa_loop.py` 에 Engineer accept 시점 hook → `lock_sprint_contract` 호출
- 기존 pytest 7개 통과 보장 + 새 race test 1개
- detail plan `docs/plans/PHASE1_LOCK_RACE_2026_05_13.md`

**검증**: pytest 8/8 pass, typecheck clean.

### Phase 2 — Bridge schema + validation (F5 + F7) (~30분)

서버 side hardening 묶음.

**산출물**:
- migration v26: `sprint_contracts.updated_at REAL NOT NULL DEFAULT 0`
- `update_sprint_contract` 가 `updated_at = ?` 갱신
- `SprintContractUpdateRequest` 에 list `max_length=50`, item `max_length=2000` 제약
- DTO 응답에 `updated_at` 포함
- pytest 추가: oversized body 가 422, updated_at 가 update 후 변경
- detail plan `docs/plans/PHASE2_SCHEMA_VALIDATION_2026_05_13.md`

**검증**: pytest 9/9 pass.

### Phase 3 — UI bug fixes (F10 + F12 + F13) (~45분)

3 frontend findings 묶음.

**산출물**:
- `useSprintContract.ts`: `save()` 에 `taskIdRef` capture + stale check (taskId 가 fetch 도중 바뀌면 setContract 무시)
- `SprintContractSection.tsx` EditList: 입력 중에는 trailing-empty 보존, save submit 직전에 filter. 별도 internal state 로 raw text 보유
- `AppShell.tsx` swipe handler: `e.target.closest('textarea, input, [contenteditable]')` 면 swipe 무시
- detail plan `docs/plans/PHASE3_UI_FIXES_2026_05_13.md`

**검증**: typecheck clean, `npm run build` clean.

### Phase 4 — Closure (~15분)

- master plan status 갱신
- wiki 313 (v17.A closure)
- MEMORY entry
- 3 commit (Phase 1, Phase 2, Phase 3) push to main
- detail plan `docs/plans/PHASE4_CLOSURE_2026_05_13.md`

## 2. 시간 추정

| Phase | 추정 | 누적 |
|---|---|---|
| 1. TOCTOU + lock wiring | 45분 | 45분 |
| 2. Schema + validation | 30분 | 75분 |
| 3. UI fixes | 45분 | 120분 |
| 4. Closure | 15분 | 135분 |

총 ~2시간 15분. v16.A.2/C/E 사이클과 비슷한 규모.

## 3. 위험

- **lock wiring 의 hook 위치 결정** — qa_loop.py 가 가장 합리적이지만, Engineer agent 가 어떻게 accept 신호 보내는지 코드 확인 후 결정. 첫 step 에서 spike.
- **migration v26 backward compat** — `updated_at REAL DEFAULT 0` 으로 추가, 기존 row 는 0 default. `get_sprint_contract_for_task` 가 `updated_at` 안 보는 옛 row 도 처리 가능해야 함.
- **EditList state 분리** — controlled component 의 raw text vs parsed list 동기화. 무한 루프 위험.

## 4. Status

- [x] Phase 1 — TOCTOU race + lock wiring (10 pytest pass)
- [x] Phase 2 — schema updated_at + validation limits (14 pytest pass)
- [x] Phase 3 — UI fixes (typecheck + build clean)
- [x] Phase 4 — closure
