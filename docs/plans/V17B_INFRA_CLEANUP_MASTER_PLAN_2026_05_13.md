# Master Plan — v17.B Infra Cleanup + v17.A Closure (2026-05-13)

> v17.A 사이클 끝나고 의도적으로 미뤘던 infra TODO B/C/D + v17.A closure
> (wiki entry + MEMORY) 를 한 번에 묶어서 처리하는 사이클.
> TODO E (HN/Reddit) + TODO F (Mac install) 는 외부 의존이라 별 사이클로 미룸.
>
> 작업 시작 시점 HEAD: `a6f97fb` (workspace migration commit).
> 작업 위치: `F:\workspace\musu-bee` (마이그레이션 완료된 신 위치).

## 0. Scope

### 포함

| ID | 영역 | severity | 작업 한 줄 요약 |
|---|---|---|---|
| TODO B | `scripts/install.ps1` | infra | indexer venv + Go scanner 셋업을 install.ps1 에 추가. fresh clone 한 사용자가 indexer 곧바로 사용 가능. |
| TODO C | `musu-indexer/src/musu_indexer/workspace.py` (+ optional Go scanner) | infra | **재진단됨**: 진짜 버그는 Python 측 `DEFAULT_IGNORE_GLOBS` 의 `node_modules/**` 패턴이 fnmatch 로 nested `musu-bee/node_modules/x` 를 못 거른다는 것. 결과: DB 의 **13109/14030 (93%) 가 node_modules 항목**. Fix = 패턴 `**/node_modules/**` 형태로 보강 + Path.match() 사용 일관화. Go scanner 의 hardcoded map 은 walk 시간 절약 목적이지 결과 누설 원인 아님 (`index` 명령은 list 만 받으니 무관). |
| TODO D | `scripts/restart-bridge.ps1` + `install.ps1` | infra | admin 없이 작동하는 bridge restart wrapper. `Stop-ScheduledTask` + `taskkill /F` fallback + `Start-ScheduledTask`. PHASE3 settlement 의 옵션 3. |
| v17.A closure | `llm-wiki` + `~/.claude/memory/` | docs | wiki 313 entry (v17.A 6 findings 종합) + MEMORY entry 3개 (TOCTOU 패턴 / controlled textarea trailing newline / useRef stale-check pattern). |

### 제외

- **TODO E** — HN/Reddit launch. marketing이라 코드 사이클 아님.
- **TODO F** — Mac install verify. macOS 머신 없음.
- **PHASE3 옵션 4** (Windows service via `sc.exe`) — install.ps1 큰 변경이라 별 사이클.

## 1. 사이클 구조 — 5 phase

각 phase 진입 시 detail plan doc 작성. 끝나면 commit + 다음 phase 진입.

### Phase 1 — Go scanner ignore flag (TODO C) (~60분)

가장 코드 가치 높음. Python 측 ignore_globs 가 작동 안 한다는 게 indexer noise 의 직접 원인.

**산출물**

- `indexer_src/main.go`:
  - `-ignore` flag 추가 (comma-separated glob list). `flag` 패키지 사용.
  - hardcoded `ignore` map 을 `-ignore` 인자로 받은 list + 최소 default (`.git`, `node_modules`) 로 교체.
  - 두 walk site (`doScan` line 95, `doScanDirs` line 230) 둘 다 동일한 ignore set 사용.
  - directory name 만 보는 현재 방식 유지 (glob full-path matching 은 v17.C 후보). 즉 `*.tar.gz` 같은 file glob 은 여전히 Python 측만.
- Go scanner re-build: `cd indexer_src && go build -o ../src/musu_indexer/bin/musu-indexer.exe .` (Windows). Linux/Mac 바이너리는 release artifact 라 이번 사이클 skip.
- `src/musu_indexer/core.py`:
  - scanner invocation site (`subprocess.Popen` at line 780) 가 workspace 의 `effective_ignore_globs` 에서 directory-name-only 항목 추출해서 `-ignore=<csv>` 로 전달.
  - directory-only 항목 추출 로직: pattern 이 `**/<name>/**`, `<name>/`, `<name>/**` 패턴이면 `<name>` 만 떼서 전달. 나머지 (`*.tar.gz` 등) 는 Python fnmatch 가 계속 처리.
- 새 pytest: `musu-indexer/tests/test_scanner_ignore.py`:
  - workspace 에 `ignore_globs: ["foo/**"]` 설정 → `foo/x.md` 가 scan 결과에서 빠지는지.
  - default 만 있을 때 `.git/x.md` 가 빠지는지 (regression).

**검증**: 새 test 통과 + 기존 musu-indexer pytest 가 깨지지 않음 + 실제로 `.musu_dev.db` 사이즈 비교 (sync 한 번 → 옛 binary 보다 작아져야).

**detail plan**: `docs/plans/V17B_PHASE1_SCANNER_IGNORE_2026_05_13.md` (작성 시점에 detail 추가)

### Phase 2 — Bridge restart wrapper (TODO D) (~45분)

운영자 불편 줄이기. 새 코드 reload 가 logout-logon 없이 됨.

**산출물**

- `scripts/restart-bridge.ps1` 신규:
  ```
  Stop-ScheduledTask -TaskName musu-bridge  (admin 불필요)
  sleep 2
  if still running: taskkill /F /PID $pid  (admin 필요 — 안내만)
  Start-ScheduledTask -TaskName musu-bridge
  wait until /health returns 200, max 15s
  ```
- `install.ps1` 에 한 줄: "Restart bridge: `powershell scripts\restart-bridge.ps1`" 출력.
- README + INSTALL.md 에 reload 절차 한 줄 update.
- `.gitignore` 에 `start-bridge.ps1` 이미 추가됐듯이 — restart-bridge.ps1 은 tracked (auto-gen 아님, 사용자가 직접 호출).

**검증**:
1. bridge 실행 중 → `restart-bridge.ps1` 실행 → 15초 안에 새 process PID 로 health 200.
2. taskkill 이 admin 필요한 케이스: 안내 메시지 표시 + exit code 1 반환.

**detail plan**: `docs/plans/V17B_PHASE2_BRIDGE_RESTART_2026_05_13.md`

### Phase 3 — install.ps1 indexer setup (TODO B) (~45분)

fresh install 사용자가 indexer 곧바로 사용 가능하게.

**산출물**

- `install.ps1` 에 새 step (Step 4.5 정도): indexer venv 셋업
  - `python -m venv musu-indexer\.venv`
  - `pip install -e musu-indexer`
  - `musu-indexer.exe` 가 `src/musu_indexer/bin/` 에 이미 있는지 확인. 없으면 안내 (Go build 또는 release 다운로드).
  - idempotent: venv 있으면 skip (existing pattern 따름).
- 새 step 의 출력 메시지 — bridge 셋업 패턴 따라 `Write-Ok` / `Write-Info`.
- `install.ps1` 의 final 안내 메시지 에 indexer 사용법 한 줄 추가.

**검증**:
1. 깨끗한 venv 없는 상태에서 `install.ps1 -Service` 실행 → indexer venv 생성됨 + `musu-indexer.exe --help` 작동.
2. 이미 venv 있는 상태 → skip 로그 출력만, 변경 없음.

**detail plan**: `docs/plans/V17B_PHASE3_INSTALL_INDEXER_2026_05_13.md`

### Phase 4 — v17.A closure: wiki + MEMORY (~30분)

가치 보존. 다음 세션 / 다른 머신 / 미래 의 자신 위해.

**산출물**

- **wiki entry**: `F:\workspace\llm-wiki\companies\global\313_V17A_SPRINT_CONTRACT_AUDIT_CLOSURE_2026_05_13.md`
  - v17.A 6 finding 종합 (F4 TOCTOU / F5 updated_at / F7 validation / F10 cancellation / F12 textarea UX / F13 swipe target). 각 finding 의 패턴 (재사용 가치 있는 것) 강조.
  - workspace migration (C: → F:) + 2 cleanup pass 도 같은 entry 안에. 사이클 한 개로 봄.
  - wiki master commit + push 도 이 phase 에서. dirty (modified 5 / deleted 5 / untracked 30+) 는 user 의 별 작업이라 손대지 않음. 새 313 entry 만 추가하고 그것만 commit.
- **MEMORY entry 3개** (`C:\Users\empty\.claude\projects\C--Users-empty\memory\`):
  - `pattern-toctou-atomic-update.md` (feedback type) — select-then-write 대신 conditional UPDATE + rowcount 분기.
  - `pattern-controlled-textarea-trailing-newline.md` (feedback type) — controlled textarea 에서 trailing-empty 보존, submit 시 trim.
  - `pattern-useref-stale-check.md` (feedback type) — async fetch 에서 task switch race 방지하는 useRef capture + closure.
  - MEMORY.md index 에 3개 entry 추가.

**검증**:
- wiki 313 entry 가 main wiki 안에 있고 commit + push 완료.
- MEMORY.md index 가 3개 새 entry 가리킴.

**detail plan**: `docs/plans/V17B_PHASE4_CLOSURE_2026_05_13.md`

### Phase 5 — v17.B closure (~20분)

이번 사이클 자체 closure.

**산출물**

- master plan status table 갱신.
- wiki entry `314_V17B_INFRA_CLOSURE_2026_05_13.md` (TODO B/C/D 마무리 종합).
- main repo commits (Phase 1, 2, 3 각 1 commit) push.
- HEAD: ~ `???` (작업 결과).

## 2. 시간 추정

| Phase | 추정 | 누적 |
|---|---|---|
| 1. Scanner ignore flag | 60분 | 60분 |
| 2. Bridge restart wrapper | 45분 | 105분 |
| 3. install.ps1 indexer step | 45분 | 150분 |
| 4. v17.A closure | 30분 | 180분 |
| 5. v17.B closure | 20분 | 200분 |

총 약 3시간 20분. v16 / v17.A 사이클들과 비슷한 규모.

## 3. 위험

- **TODO C Go re-build dependency** (확인됨 — 이 머신에 Go 없음): Phase 1 의 첫 step 으로 `winget install GoLang.Go` (Step 1.0). 그 다음 scanner 코드 변경 + build. winget 실패 시 fallback = 코드만 작성하고 binary 는 user 가 다른 머신에서 build 후 commit.
- **TODO B 의 `musu-indexer.exe` 부재 처리**: fresh clone 에는 binary 없는 게 정상 (gitignore 됨). Phase 3 는 binary 부재 시 "Go 로 빌드하세요" 안내 + warning + 계속 진행 (fail 안 함).
- **Phase 2 의 taskkill admin 요구**: scheduled task 의 child process 가 Interactive logon 으로 시작됐으면 taskkill /F 도 admin 필요할 수 있음. 일단 시도 → 실패하면 안내. logout/logon trick 도 안내.
- **Phase 4 wiki commit**: wiki dirty 상태 (이전 세션의 미커밋 작업) 가 있음. 새 entry 만 add 해서 commit (`git add 313_...md && git commit`) — dirty 다른 파일은 손대지 않음.

## 4. Status

- [ ] Phase 1 — Scanner ignore flag (TODO C)
- [ ] Phase 2 — Bridge restart wrapper (TODO D)
- [ ] Phase 3 — install.ps1 indexer setup (TODO B)
- [ ] Phase 4 — v17.A closure (wiki 313 + MEMORY)
- [ ] Phase 5 — v17.B closure (master plan status + wiki 314 + push)
