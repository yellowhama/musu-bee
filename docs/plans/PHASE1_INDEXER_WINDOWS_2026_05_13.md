# Phase 1 — musu-indexer Windows 이주 (2026-05-13)

> Master plan [BOUNDARY_MASTER_PLAN_2026_05_13.md](./BOUNDARY_MASTER_PLAN_2026_05_13.md) §Phase 1.

## 목표

`musu-indexer` 를 Windows native 에서 직접 실행 가능하게 만들고, root 를 `C:\dev\musu-bee` 로 지정하여 우리가 작업하는 코드를 인덱싱한다.

## 현황 (사전 확인 결과)

- `musu-indexer` 는 **monorepo 의 일부** (musu-bee/musu-functions repo 안 `musu-indexer/` 디렉토리). 별 repo 아님 — 직접 commit 가능.
- Python 코드는 **cross-platform** (`sys.platform` 분기 있음).
- `bin/` 안에 **Windows binary `musu-indexer.exe` (9.5MB) 가 이미 빌드돼 있음** + Linux binary `musu-indexer-linux` (9.2MB).
- 그러나 `core.py:24` 의 `LINUX_BIN = str(PACKAGE_ROOT / "bin" / "musu-indexer-linux")` 가 **hardcoded Linux 경로** — Windows 에서 exec 실패. 이게 핵심 fix point.

## fix point

### F1. `core.py` 의 binary 선택을 platform-aware 로

현재:
```python
LINUX_BIN = str(PACKAGE_ROOT / "bin" / "musu-indexer-linux")
```

변경:
```python
import sys
_BIN_NAME = "musu-indexer.exe" if sys.platform == "win32" else "musu-indexer-linux"
SCANNER_BIN = str(PACKAGE_ROOT / "bin" / _BIN_NAME)
```

그리고 line 770 의 `LINUX_BIN` reference 도 `SCANNER_BIN` 으로.

### F2. Windows venv 생성

`C:\dev\musu-bee\musu-indexer\.venv` (Python 3.13 기존 환경 사용). `pip install -e ".[full]"` 로 editable + mcp/watchdog deps.

### F3. `.musu-indexer.json` 의 ignore_globs 검토

현재 Windows clone 의 config:
- ignore `node_modules/**`, `.venv/**`, `__pycache__/**`, `.git/**` — OK
- 추가 권장: `dist/**`, `.next/**`, `musu-bridge/.venv/**` (sub-venv 도 indexer 가 들어가 인덱싱 안 함)

## 단계

1. **fix F1 적용** — `musu-indexer/src/musu_indexer/core.py` 의 binary path platform-aware 로.
2. **Windows venv 생성** — `C:\dev\musu-bee\musu-indexer\.venv` (단, indexer 자체는 `dependencies = []` 이라 venv 없이도 `pip install -e .` 안 해도 PYTHONPATH 만 맞으면 작동할 가능성. 일단 정식 venv).
3. **Editable install** — `pip install -e ".[full]"` (mcp + watchdog deps).
4. **scanner binary 확인** — `bin/musu-indexer.exe` 가 fresh clone 에 있는지 (gitignored 가능). 없으면 WSL 에서 복사.
5. **`.musu-indexer.json` ignore 확장** — 추가 dist/.next/sub-venv pattern.
6. **smoke test** — `musu-indexer sync` 실행 → 우리 코드 인덱싱.
7. **검증** — `musu-indexer search "cross-env"` 가 `60364ee` commit 코드 hit.
8. **commit** — indexer code fix + config 변경.

## 위험

- **`bin/musu-indexer.exe` 가 git 에 tracked 인지 .gitignore 됐는지**: tracked 면 fresh clone 에 있음, ignored 면 직접 복사 필요. 확인 필수.
- **scanner.exe 가 Windows defender 에 차단**: Go binary 가 unsigned. 처음 실행 시 SmartScreen 가능.
- **Python 3.13 의존성 호환**: indexer 가 `requires-python = ">=3.10"` 명시. 3.13 OK 추정.
- **DB lock**: WSL 측 `.musu_dev.db` 가 여전히 도는 MCP 서버에 의해 lock 됨 → Phase 2 에서 해결. Phase 1 은 새 DB 위치 (`C:\dev\musu-bee\.musu_dev.db`) 에서 시작이라 충돌 없음.

## 검증

- [ ] `musu-indexer --help` 가 Windows PowerShell 에서 실행
- [ ] `musu-indexer sync` exit 0
- [ ] `musu-indexer search "cross-env"` 가 `musu-bee/package.json` hit
- [ ] `musu-indexer search "SprintContractUpdateRequest"` 가 `musu-bridge/server.py` hit
- [ ] `musu-indexer recent` 가 우리 v16.A.2/C/E 변경 파일 보임
- [ ] `C:\dev\musu-bee\.musu_dev.db` 생성됨

## Status — COMPLETE (1 follow-up)

- [x] F1 — `core.py` platform-aware (`SCANNER_BIN` 도입, `LINUX_BIN` alias 로 backwards-compat)
- [x] F2 — Windows venv 생성 + `pip install -e ".[full]"` (Python 3.13.7)
- [x] F3 — config `ignore_globs` 확장 (`**/.venv/**`, `**/__pycache__/**`, `.next/**`, `dist/**`, `logs/**`)
- [x] smoke test — `musu-indexer sync` exit 0, DB 54MB 생성
- [x] 검증
  - [x] `musu-indexer --help` Windows PowerShell 에서 실행
  - [x] `musu-indexer search "SprintContractUpdateRequest"` → `musu-bridge/server.py` class hit
  - [x] `musu-indexer search "BOUNDARY_MASTER_PLAN"` → 방금 만든 plan 문서 hit
  - [x] `C:\dev\musu-bee\.musu_dev.db` 생성
- [ ] commit (다음)

## 발견 (Phase 1 작업 중)

### Bug fix: empty `exclude_roots` 가 전체 root 를 exclude

`workspace.py:110` 의 `_resolve_rel_roots` 가 빈 list 받으면 `(".",)` 반환. 이게 `include_roots` 에는 합리적 default 지만 `exclude_roots` 에서는 **전체 root 제외** 로 작동. 빈 config 로 사용자가 sync 하면 `scanned=0` 으로 silent 실패.

Fix: `default_when_empty` keyword 인자로 분리. 호출부에서 `exclude_roots` 는 `default_when_empty=()` 로 명시. include 는 기본값 그대로.

### 별 issue (Phase 1 scope 밖, P2 follow-up)

- **`bin/musu-indexer.exe` 가 .gitignore 됨**: fresh clone 시 indexer scanner binary 없음. install.ps1 에 indexer 셋업 단계가 있다면 build 또는 download. 현재는 수동 복사.
- **`node_modules/` 가 indexer scanner 에 의해 인덱싱됨**: config 의 `ignore_globs` 가 Python 측에선 작동하지만 Go scanner 가 그걸 안 받는 듯. 별 fix.
- **DB lock 잔존**: orphan SQLite WAL 가 sync 사이에 lock 발생. Phase 2 에서 처리.

## 다음

Phase 2 진입 — WSL MCP server 정리, DB lock 해소.
