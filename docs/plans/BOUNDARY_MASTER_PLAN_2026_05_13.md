# Master Plan — Windows/WSL Boundary Settlement (2026-05-13)

> 이번 세션의 실제 시간 손실을 만든 근본 원인: **같은 logical repo 가
> Windows 와 WSL 양쪽에 다른 상태로 존재**, 어느 쪽이 truth 인지 명확하지 않음.
> 그리고 도구가 어느 쪽 file system 을 보는지 자체가 매번 달라짐.
>
> Master plan 의 목표: 어떤 도구가 어떤 경로를 보는지 한 번 결정하고, 그
> 규칙을 enforce 할 수 있는 가벼운 장치를 두는 것. K8s 도입이 아니라 boundary 명확화.

---

## 0. 현황 진단 (2026-05-13)

### A. 두 worktree 가 다른 상태

| 항목 | `C:\dev\musu-bee` (Windows) | `~/musu-functions` (WSL) |
|---|---|---|
| HEAD | `e9e2780` (v16.E, 최신 main) | `e1ecc123` (4 commits 뒤짐, handoff doc) |
| Branch | `main` | `feat/bw-sync-v5-2026-05-12` |
| Remote | `origin` → github | `forgejo` + `github` |
| Uncommitted | `scripts/start-bridge.ps1` (install 부산물, 무시 가능) | `docs/PRODUCT_CHARTER/FLEET_LAYER_*` 2개 + `uv.lock` + 4 dotfile artifact |
| 의도된 역할 | **Source of truth** (clone, push) | dev 도구 host (`.venv`, `dev.db`, `activity.log`) — 부산물 누적 |

### B. 도구가 어디 보는지

| 도구 | 현재 root | 문제 |
|---|---|---|
| `musu-indexer` (WSL binary) | `~/musu-functions` (옛 코드) | 신규 코드를 못 봄. MCP 서버 2개가 ad-hoc trigger 로 sync 충돌 |
| `.musu_dev.db` (인덱스 DB) | WSL `~/musu-functions/.musu_dev.db` (673MB) + WSL `~/llm-wiki/.musu_dev.db` (24MB) | 두 곳, 어느 게 권위인지 불명 |
| `~/.musu/` (bridge 데이터) | `C:\Users\empty\.musu` (Windows side) | 우리 install.ps1 가 만든 곳. 옳음. |
| `musu-bridge` (Scheduled Task) | Windows 의 `C:\dev\musu-bee\musu-bridge` 코드 | 옳음. 다만 admin 권한 부족으로 stop 불가 |
| `llm-wiki` | WSL `~/llm-wiki` | 다른 worktree 의 동시 작업물 (untracked 60+ files) — 건드리면 안 됨 |
| `musu-functions/musu-indexer/.venv` | WSL Python 3.12 venv + Linux Go binary | Windows 이주 시 재빌드 필요 |

### C. 이번 세션에 실제로 깨진 곳

| 증상 | 진짜 원인 | boundary 와의 관계 |
|---|---|---|
| install.ps1 PS 5.1 parse fail | UTF-8 BOM 없음 | direct |
| seed_agents stderr → terminating error | PS 5.1 `$ErrorActionPreference=Stop` | direct |
| `NODE_ENV=production` Windows 미지원 | Unix-only shell syntax | direct |
| `musu-bee build complete` 거짓말 | try/catch + `2>$null` | direct |
| Scheduled Task stop 불가 | LogonType=Interactive 가 admin 필요 | indirect (Windows native 운영) |
| indexer DB lock | 동시 sync 3개 + MCP 서버 2개 | direct (어디서 도는지 불명) |
| WSL repo 옛 코드 | 두 worktree 미동기 | **이번 plan 의 핵심** |
| 새 코드가 indexer 에 안 들어감 | indexer root = WSL 옛 코드 | **이번 plan 의 핵심** |

---

## 1. 결정 — boundary 규칙

세 줄로 끝나는 규칙. 이걸 모든 도구가 따라야 함.

### 규칙 1. Source of truth = `C:\dev\musu-bee` (Windows native)

- git clone 한 곳. `origin` = github.
- v16 이후 모든 코드 변경은 여기서. push 도 여기서.
- WSL 측 `~/musu-functions` 는 **부산물 host** (venv, dev.db, log). 코드 변경 source 아님.

### 규칙 2. 도구는 `C:\dev\musu-bee` 또는 `/mnt/c/dev/musu-bee` 를 본다

- **Windows 도구**: PowerShell, install.ps1, Scheduled Task — 모두 `C:\dev\musu-bee`.
- **WSL 도구**: musu-indexer, bash 스크립트 — 모두 `/mnt/c/dev/musu-bee` (같은 file system, WSL bridge).
- 어떤 도구도 `~/musu-functions/` 를 코드 source 로 삼지 않는다. (이미 거기서 도는 MCP 서버 2개는 새 root 로 재시작.)

### 규칙 3. 변경이 한 곳에만 land 한다

- 새 commit 은 Windows clone 에서만. push 는 main 으로.
- WSL 측 working tree 는 **read-only mirror** 로 취급 (git pull 하더라도 별 branch, 정보용).
- 옛 WSL repo 의 `feat/bw-sync-v5` branch 와 uncommitted 문서는 사용자의 별 작업 — **건드리지 않는다**. 위치만 기록.

---

## 2. 마스터 플랜 — 6 phase

각 phase 는 진입 시 자기 디테일 plan 문서를 만든다. 끝나면 그 문서가 closure.

### Phase 0 — WSL working tree 의 fleet 문서를 Windows clone 으로 회수 (~20분)

**왜 phase 0 인가**: 사용자가 별 세션에서 WSL working tree (`~/musu-functions/docs/PRODUCT_CHARTER/`) 에 fleet 문서 2개 신규 + `SSOT_1PAGE` / `README.md` 2개 modified 를 만들었다고 보고했음. 그런데 그 변경물이 **어디에도 commit 되지 않았고** github main 으로 land 할 경로가 없는 상태. boundary plan 진입 전에 그 작업물을 truth source (Windows main) 로 옮기는 게 boundary 규칙의 **첫 실행 예시**.

**대상 파일** (WSL → Windows clone):
- `docs/PRODUCT_CHARTER/FLEET_LAYER_POSITIONING_SPEC_2026-05-13.md` (untracked, 7314B)
- `docs/PRODUCT_CHARTER/FLEET_LAYER_NEXT_STEPS_2026-05-13.md` (untracked, 2875B)
- `docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md` (modified)
- `docs/PRODUCT_CHARTER/README.md` (modified)

WSL 측 `musu-bridge/uv.lock` 도 untracked 지만 — uv 도구 부산물 / 코드 변경 아님. 회수 제외, WSL 에 그대로 둠.

**산출물**:
- Windows clone main branch 에 4 파일 commit + push
- `docs/plans/PHASE0_FLEET_DOCS_RECOVERY_2026_05_13.md` (회수 절차 + diff 검증 결과)

**검증**:
- `git log origin/main -1` 가 새 commit
- `npx tsc --noEmit` clean (문서만 변경이라 영향 없어야 함)
- WSL 측 working tree 의 4 파일 그대로 보존 (사용자가 일시 backup 으로 본인 일정에 push 안 한 상태일 수 있음 — 함부로 delete 안 함)

### Phase 1 — Indexer 를 Windows 로 이주 (~45분)

**목표**: musu-indexer 가 `C:\dev\musu-bee` 를 root 로 보고, Windows 에서 직접 실행 가능.

**산출물**:
- `C:\dev\musu-indexer\` (또는 `C:\dev\musu-bee\musu-indexer\`) 에 Python venv
- `musu-scanner.exe` (Windows binary — `work/validation/...musu-indexer.exe` 있는 걸로 봐서 빌드 가능)
- `C:\dev\musu-bee\.musu-indexer.json` 이 Windows-friendly path 만 사용
- Windows PowerShell 에서 `musu-indexer sync` 작동
- 디테일 plan: `docs/plans/PHASE1_INDEXER_WINDOWS_2026_05_13.md`

**검증**:
- `musu-indexer search "cross-env"` 가 `60364ee` commit 코드를 찾음
- `musu-indexer recent` 가 우리 변경 파일 보임

### Phase 2 — Indexer 충돌 정리 (~15분)

**목표**: 기존 WSL MCP 서버 2개 (PID 1730725 HTTP / 3852401 stdio) 가 옛 root 로 도는 걸 멈추거나 새 root 로 재시작.

**산출물**:
- 옛 MCP 서버 stop 또는 root 재설정
- DB lock 해소 (`.musu_dev.db-wal` flush)
- 디테일 plan: `docs/plans/PHASE2_INDEXER_CLEANUP_2026_05_13.md`

**검증**:
- `pgrep musu-indexer` 가 새 Windows 인스턴스만 표시
- DB lock 없이 sync 실행

### Phase 3 — Scheduled Task LogonType S4U 전환 (~15분)

**목표**: bridge 가 admin 권한 없이 stop/start 가능하도록.

**산출물**:
- `install.ps1` 의 `New-ScheduledTaskPrincipal -LogonType Interactive` → `S4U`
- 기존 task 재등록
- `INSTALL.md` Windows troubleshooting 에 reasoning 추가
- 디테일 plan: `docs/plans/PHASE3_SCHEDULED_TASK_S4U_2026_05_13.md`

**검증**:
- `Stop-ScheduledTask -TaskName musu-bridge` 가 admin 없이 작동
- 새 코드 reload 위한 stop → start cycle 성공

### Phase 4 — Boundary doc + CLAUDE.md update (~20분)

**목표**: 새 Claude/사용자 세션이 boundary 를 즉시 이해.

**산출물**:
- `C:\dev\musu-bee\docs\BOUNDARY.md` (이 master plan 의 §1 규칙 + Phase 1~3 결과 요약)
- `C:\dev\musu-bee\CLAUDE.md` 에 boundary section 추가 (Claude Code 가 새 세션마다 자동 로드)
- `~/.claude/projects/-home-hugh51/memory/MEMORY.md` 에 boundary 결정 entry
- 디테일 plan: `docs/plans/PHASE4_BOUNDARY_DOCS_2026_05_13.md`

**검증**:
- 새 cmd 창에서 Claude 시작 → BOUNDARY.md 가 context 로 들어감

### Phase 5 — Closure + wiki 312 (~15분)

**목표**: 사이클 종결.

**산출물**:
- wiki `312_BOUNDARY_SETTLEMENT_2026_05_13.md` (5 phase 결과 요약 + future-self 교훈)
- 3 commit (Phase 3 install.ps1 + Phase 4 BOUNDARY/CLAUDE.md + Phase 5 wiki) → push to github main
- `docs/plans/PHASE5_CLOSURE_2026_05_13.md`

**검증**:
- github HEAD 가 Phase 결과 반영
- `musu-indexer search "boundary"` 가 새 BOUNDARY.md hit

---

## 3. 진행 규칙

1. 각 phase 진입 시 디테일 plan 작성 → 사용자에게 보임 → 진행.
2. 깨지면 plan 문서에 발견 + fix 기록 (이번 v16.A 처럼).
3. master plan (이 문서) 은 phase 종결 시마다 status 갱신.

## 4. 명시적으로 안 하는 것 (out of scope)

- **K8s 도입** — 위 문제 어느 것도 K8s 가 풀지 않음. 새 복잡도만 추가.
- **WSL 폐기** — Linux 도구 (rg, bash, git config) 가 여전히 유용. boundary 만 명확히.
- **WSL `~/musu-functions` 정리** — 사용자의 다른 작업 (FLEET_LAYER 문서, feat/bw-sync-v5 branch) 존중. 이 plan 이 건드리지 않는다.
- **musu-bee dev server 실행 검증** — Phase 1~5 가 다 끝나도 next dev / production runtime 의 더 깊은 이슈는 별 사이클.

## 5. 시간 추정

| Phase | 추정 | 누적 |
|---|---|---|
| 0. WSL fleet 문서 회수 | 20분 | 20분 |
| 1. Indexer Windows 이주 | 45분 | 65분 |
| 2. 충돌 정리 | 15분 | 80분 |
| 3. Scheduled Task S4U | 15분 | 95분 |
| 4. BOUNDARY doc | 20분 | 115분 |
| 5. Closure + wiki | 15분 | 130분 |

총 ~2.2 시간. v16.A 한 사이클 비슷한 규모 + Phase 0.

## 6. Status

- [x] Phase 0 — WSL fleet 문서 회수 (`9b62fd1` pushed)
- [ ] Phase 1 — Indexer Windows 이주
- [ ] Phase 2 — Indexer 충돌 정리
- [ ] Phase 3 — Scheduled Task S4U
- [ ] Phase 4 — BOUNDARY doc
- [ ] Phase 5 — Closure
