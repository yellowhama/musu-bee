# Phase 3 — install.ps1 indexer setup (2026-05-13)

> Master plan §Phase 3. TODO B.

## 문제

`install.ps1` 가 musu-bridge 의 venv 와 deps 만 세팅. fresh clone 한 사용자가
`musu-indexer sync` 호출하면 venv 없어서 fail. 사용자가 수동으로

```
cd musu-indexer
python -m venv .venv
.venv\Scripts\pip install -e .[full]
```

하라는 안내가 INSTALL.md 어디에도 없음. v17.A 사이클 시작 때도 같은 일 일어남
(이전 세션 메모: "Phase 1 of this cycle copied the binary from WSL manually").

## Fix

install.ps1 의 Step 3 (bridge venv) 끝 다음에 **Step 3b** 추가:

1. `musu-indexer/.venv` 가 없으면 생성 + `pip install -e .[full]` (mcp + watch extras).
2. Scanner binary `src/musu_indexer/bin/musu-indexer.exe` 가 없으면 **경고만 출력**:
   - `search` 명령은 여전히 작동 (SQLite 만 쿼리).
   - `sync` 는 못 함. Go build 안내 또는 release 다운로드 안내.
3. Idempotent: venv 있으면 skip. binary 있으면 `Write-Ok`.

Final summary 메시지에도 indexer 한 줄 추가 (사용자가 grep 안 해도 발견 가능).

## 검증

1. `musu-indexer/.venv` 삭제 → `install.ps1 -Service` 재실행 → venv 생성 확인.
2. `musu-indexer\.venv\Scripts\musu-indexer.exe sync` 가 작동하는지.
3. binary 없으면 Write-Warn 메시지 출력 + 계속 진행 (install fail 안 함).
4. binary 있으면 Write-Ok.

## 위험

- `pip install -e .[full]` 가 mcp + watchdog 같은 deps 받을 때 네트워크 필요.
  실패 시 install.ps1 의 `$ErrorActionPreference = "Stop"` 가 trigger 됨.
  현재 design 은 fail-fast — 의도된 것.
- v17.B Phase 1 의 ignore_globs fix 가 indexer 에 들어가 있어야 함 (이미 commit).
  fresh clone 도 그 코드 받으니 자동 적용.

## Status

- [ ] install.ps1 에 Step 3b 추가
- [ ] $IndexerDir / $IndexerVenv / $IndexerBin 변수 추가
- [ ] Scanner binary 부재 시 Write-Warn (계속 진행)
- [ ] Final 메시지에 indexer 사용법 한 줄
- [ ] 검증: indexer venv 삭제 → install.ps1 재실행 → indexer 사용 가능
- [ ] commit
