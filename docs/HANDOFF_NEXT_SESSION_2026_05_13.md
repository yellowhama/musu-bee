# Handoff — Next Session (2026-05-13 → next)

> 이번 세션이 만든 결과 + 미해결로 남은 것 + 다음 세션이 먼저 할 일.
> 다음 Claude 세션은 이 문서부터 읽고 작업 시작한다.

---

## TL;DR (1분 안에 진입)

이번 세션 (boundary settlement cycle) 6 phase 중:
- ✅ **Phase 0–2 완료**: WSL fleet docs 회수, indexer Windows 이주, WSL indexer cleanup
- ⚠️ **Phase 3 deferred**: Scheduled Task S4U 가 admin 권한 필요 — 다른 접근 필요 (v17)
- ⏳ **Phase 4 진행 중 (이 문서)**: BOUNDARY doc + handoff
- ⏳ **Phase 5 남음**: wiki 312 closure + retrospective + commit/push

HEAD: `5822503` (Phase 1 pushed). 그 이후 install.ps1 / docs 변경은 아직 uncommitted.

---

## 1. 다음 세션 첫 단계 (즉시 진입 순서)

### TODO for next session

1. **Read** `docs/BOUNDARY.md` — boundary 규칙 3개. 익숙해진 후 진행.
2. **Pull latest** — `cd C:\dev\musu-bee && git fetch origin main && git status`. 미커밋 변경물 있으면 review.
3. **Phase 5 closure 마무리** — 만약 이번 세션이 거기서 끊겼다면:
   - 미커밋 변경 (install.ps1 주석, PHASE3 plan, BOUNDARY.md, CLAUDE.md, HANDOFF_NEXT_SESSION) commit.
   - wiki `312_BOUNDARY_SETTLEMENT_2026_05_13.md` 작성 (이번 사이클 6 phase 종합).
   - MEMORY.md 에 boundary 결정 entry.
   - `git push origin main`.
   - master plan status 마지막 phase 체크.
4. **Indexer 재sync** — `musu-indexer sync` 한 번 더. Phase 1 의 last sync 이후 변경된 파일들이 index 갱신.
5. **bridge 새 코드 reload 필요한 경우**: PHASE3 plan 의 workaround 참고 — `Unregister-ScheduledTask musu-bridge -Confirm:$false` 후 `install.ps1 -Service -Start` 다시. 또는 logout / logon.

### 다음 우선순위 작업 후보

순서대로 처리하면 합리적:

#### A. v16.C lock wiring (~30분)

v16.C 의 backend `lock_sprint_contract` 메서드 만들었지만 — orchestrator 가 Engineer agent 의 contract acceptance 를 감지해서 호출하는 wiring 미구현. `musu-core/qa_loop.py` 또는 `musu-bridge/handlers.py` 에 hook 필요.

Trigger 후보:
- Engineer agent 가 첫 file edit 시작 시
- Sprint Contract 의 `accept` 같은 명시적 endpoint
- Engineer prompt 가 `engineer_prompt_header()` 받은 직후

#### B. install.ps1 의 indexer setup step (~45분)

현재 install.ps1 는 musu-indexer 셋업 안 함. fresh install 한 사용자는 indexer 못 씀. 추가할 것:

```powershell
# Step 8: Setup musu-indexer (optional)
if (Test-Path (Join-Path $Root "musu-indexer")) {
    Write-Info "Step 8: setting up musu-indexer..."
    Set-Location (Join-Path $Root "musu-indexer")
    py -3.13 -m venv .venv
    .\.venv\Scripts\pip.exe install --quiet -e ".[full]"
    # Copy scanner binary — currently gitignored, needs to be in bin/ already
    Write-Ok "musu-indexer ready (scanner binary must exist in bin/)"
}
```

별 문제: `bin/musu-indexer.exe` 가 .gitignore 되어 있어 — 정식 release/download 또는 git tracking 필요.

#### C. v16.A.2 follow-up — indexer ignore_globs 의 Go scanner 적용 (~30분)

`.musu-indexer.json` 의 `ignore_globs` 가 Python 측에선 작동 (`should_index_path`) 하지만 Go scanner 가 그걸 안 받음. 결과: `node_modules/` 전체가 scan 되고 인덱싱됨 (1만 4천+ files). Scanner 가 config 받도록 또는 Python wrapper 가 pre-filter list 보내도록.

#### D. Phase 3 의 진짜 fix — admin 없이 bridge restart (~1시간, 별 cycle)

PHASE3 plan 의 대안 §1–4 중 선택:
1. bridge `/api/admin/reload` endpoint (server side self-restart)
2. install.ps1 `--reinstall-task` flag (한 줄 wrapper)
3. Stop-ScheduledTask + taskkill /F fallback (admin 필요 안내)
4. Windows service (sc.exe) 로 전환 (큰 변경)

#### E. v16.D — HN/Reddit launch (별 사이클)

production-ship 준비 거의 끝남. wiki 308 §D 참고.

#### F. v16.B — Mac install verify

Mac 머신 생기면. wiki 308 §B.

---

## 2. 이번 세션 발견 + 결정 정리

### 새 규칙 (CLAUDE.md / BOUNDARY.md 로 인코딩됨)

1. **Source of truth = `C:\dev\musu-bee`**. WSL repo 는 mirror.
2. **도구는 Windows path 또는 `/mnt/c/dev/musu-bee` 만 사용**. `~/musu-functions/` 의 출력을 코드 truth 로 인용 금지.
3. **변경은 Windows 측에서 commit/push**.

### 발견된 미해결 issue (P1)

| issue | 위치 | 다음 작업 |
|---|---|---|
| Scheduled Task S4U 등록이 admin 필요 | Windows 보안 정책 | Phase 3 alt 1–4 중 선택 |
| `bin/musu-indexer.exe` gitignored | `.gitignore:205` | TODO B 처리 |
| Go scanner 가 `ignore_globs` 무시 | musu-indexer scanner | TODO C 처리 |
| bridge child process 가 SIGTERM 응답 안 함 | uvicorn on Windows | Phase 3 alt 1 (HTTP reload) 가 가장 깔끔 |
| Sprint Contract lock wiring 미구현 | qa_loop.py / handlers.py | TODO A 처리 |

### 발견된 code audit findings (이전 세션 v16.C/E)

전 audit 에서 발견했지만 아직 안 fix 한 것 (다음 세션에서 PR review 처럼 처리):

| ID | 위치 | severity | 내용 |
|---|---|---|---|
| F4 | `backends/local.py:1423` | P1 | TOCTOU race in update_sprint_contract (select-then-write) |
| F5 | `migrations.py` schema | P2 | sprint_contracts 에 `updated_at` 컬럼 없음 |
| F7 | `server.py:1324–1328` | P2 | scope/criteria list 길이 제한 없음 — DoS 가능 |
| F10 | `useSprintContract.ts:106` | P2 | save() 에 cancellation guard 없음 (task switch race) |
| F12 | `SprintContractSection.tsx:319` | P2 | EditList textarea trailing-newline 이 즉시 사라짐 — UX 버그 |
| F13 | `AppShell.tsx:218` | P2 | swipe 가 canvas/tldraw 의 자체 gesture 와 충돌 가능 |

---

## 3. 환경 / 도구 상태 스냅샷

| 항목 | 상태 |
|---|---|
| `C:\dev\musu-bee` HEAD | `5822503` (Phase 1 pushed). 다음 commit 들이 unpushed: install.ps1 주석, plan docs, BOUNDARY/CLAUDE/HANDOFF |
| bridge | Scheduled Task musu-bridge, State=Ready, PID 14328 도는 중, health 200 |
| `.musu/` 데이터 | Windows `%USERPROFILE%\.musu\` — bridge.env, nodes.toml, db/ 모두 OK |
| musu-indexer | Windows venv at `C:\dev\musu-bee\musu-indexer\.venv` 작동, DB 54MB+WAL |
| WSL indexer | 모든 process killed, cron disabled, 자동 부활 없음 |
| WSL `~/musu-functions/` | branch `feat/bw-sync-v5`, 4 commits behind main, 사용자 untracked 작업 (musu-bridge/uv.lock) 보존 |
| WSL `~/llm-wiki/` | 이전 commit `5a3003e` 이후 wiki 309-311 + 00_INDEX 업데이트 commit `3d70f49` |

## 4. 시간 / cost 인상

이번 세션 (boundary cycle 까지 기준):
- ~2 시간 — boundary plan + Phase 0-3
- 4 commits to musu-bee main (Phase 0 `9b62fd1`, Phase 1 `5822503`, 그리고 미커밋 Phase 3+4 변경)
- 1 commit to llm-wiki (`3d70f49`) — 사용자 별 작업과 별개로 v16 wiki 309/310/311
- 발견된 issue 약 11개 (P1 5 + P2 6)

## 5. 다음 세션 진입 prompt 예시

```
이 머신은 Windows + WSL boundary cycle 직후 상태.
docs/BOUNDARY.md 먼저 읽고, docs/HANDOFF_NEXT_SESSION_2026_05_13.md 의
"다음 세션 첫 단계" 따라 Phase 5 closure 부터 마무리.
끝나면 TODO A (Sprint Contract lock wiring) 진입.
```

---

## 6. WSL 정리 안 한 것 (의도적)

다음 세션이 자동으로 처리하면 안 되는 것 (사용자 데이터):

- `~/musu-functions/feat/bw-sync-v5-2026-05-12` branch — 사용자 별 작업
- `~/musu-functions/docs/PRODUCT_CHARTER/FLEET_LAYER_*.md` (untracked 보존본) — fleet 작업 backup
- `~/musu-functions/musu-bridge/uv.lock` — uv 도구 부산물, indexer 무관
- `~/musu-functions/.musu_dev.db` (673MB) — 옛 인덱스, 사용자 일상 데이터 가능성
- `/tmp/crontab-backup-20260513-210559.txt` — auto-index cron 의 원상복구용 백업

위 어느 것도 **다음 세션이 사용자 명시 허락 없이 건드리면 안 됨.**
