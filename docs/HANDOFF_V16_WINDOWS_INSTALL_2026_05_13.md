# Handoff — v16.A Windows install.ps1 검증 (2026-05-13)

> 다음 Claude 세션이 **Windows native PowerShell** 에서 새로 시작될 때 이 문서부터 읽고 작업 진입한다.

---

## TL;DR (1분 안에 진입)

1. 이 머신 = Windows. 지금까지 작업은 WSL/Linux 안에서 했음. **install.ps1 가 Windows native 에서 처음 돌아가는지 검증** 이 v16.A 의 목표.
2. fresh dir 에서 git clone → install.ps1 -Service -Start → bridge 가 http://127.0.0.1:8070/health 200 답하면 PASS.
3. 깨지는 곳마다 hotfix → commit → push to `github/main`.
4. 끝나면 wiki 309 (v16.A closure) 작성 + INSTALL.md Windows troubleshooting 보강.

---

## 1. Context — 직전 세션이 한 일

v15 사이클 9 commits 완료, github.com/yellowhama/musu-bee/main HEAD = `5f8a077c` (v15 closure).

핵심 산출:
- `scripts/install.ps1` (280 lines) — Windows native installer. **이게 검증 대상.**
- `scripts/launchd/com.musu.bridge.plist.example` — macOS LaunchAgent template (사용자 Mac 없음, deferred to v17)
- `scripts/install.sh` — Linux/macOS, Step 7 가 `case "${OSTYPE}"` 으로 fork
- `INSTALL.md` — 3-way fork (Linux/WSL / macOS / Windows)
- `README.md` — install one-liner per platform

v15 의 wiki 보고:
- wiki 305: v14 closure (LLM-aware)
- wiki 306: v15 closure (production ship + 3-platform install)
- wiki 307: v15 audit (8.7/10, security P0 0건)
- wiki 308: v16 master plan candidates (A~E)
- 다음 = 이 문서 (v16.A)

---

## 2. 검증 절차 (실 머신에서 돌릴 정확한 명령)

### 2.1 사전 조건

- Windows 10 또는 11
- PowerShell 5.1+ (preinstalled) 또는 PowerShell 7 (pwsh)
- 인터넷 연결 (winget / git / pip 다운로드용)

### 2.2 prerequisites 확인

```powershell
# PowerShell 버전
$PSVersionTable.PSVersion

# 필수 도구
python --version            # 3.12+ 필요
node --version              # 20+ 필요
git --version

# 없으면 winget 으로:
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

설치 후 새 PowerShell 창 열어야 PATH 적용됨.

### 2.3 fresh clone + install (정식 시나리오)

```powershell
# 깨끗한 디렉토리에서 처음부터
cd C:\dev
git clone https://github.com/yellowhama/musu-bee.git
cd musu-bee

# 자동 설치 + 서비스 등록 + 즉시 시작
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start
```

### 2.4 기대 흐름

스크립트가 다음 메시지를 순서대로 찍어야 함:

```
[install] === musu-bridge install (Windows) ===
[install]     repo: C:\dev\musu-bee
[install]     musu: C:\Users\<you>\.musu

[install]     Step 1: Python 3.12 found
[install]     Step 2: C:\Users\<you>\.musu already exists  (또는 created)
[install]     Step 3: creating venv...
[install] OK  venv created: C:\dev\musu-bee\musu-bridge\.venv
[install]            installing musu-core...
[install] OK  musu-core installed
[install]            installing musu-bridge...
[install] OK  musu-bridge installed
[install]     Step 4: creating bridge.env...
[install] OK  bridge.env created (token auto-generated)
[install] !   To enable musu.pro peer discovery, set MUSU_TOKEN in ...
[install]     Step 5: detecting node identity...
[install] OK  nodes.toml initialized (self=<hostname>, gpu=..., ts=...)
[install]     Step 5b: seeding agents...
[install] OK  agents seeded with auto-detected CLI
[install]     Step 6: building musu-bee (first time)...
[install] OK  musu-bee build complete
[install]     Step 7: registering musu-bridge Scheduled Task...
[install] OK  Scheduled Task 'musu-bridge' registered (auto-start on logon)

[install] OK  === install complete ===

[install]     Starting bridge...
[install] OK  bridge is running ✓
[install] OK  worker is running ✓        (또는 worker health check failed)
[install] OK  agents ready: <N> agents seeded
[install] OK  AI CLI: <claude|gemini|codex> detected
```

### 2.5 검증 — 진짜 작동하는지

새 PowerShell 창에서:

```powershell
# 1. Bridge health
Invoke-WebRequest http://127.0.0.1:8070/health -UseBasicParsing | Select-Object StatusCode, Content
# 기대: StatusCode = 200, Content 에 {"status":"ok",...}

# 2. Scheduled Task 등록 확인
Get-ScheduledTask -TaskName musu-bridge | Format-Table TaskName, State

# 3. 데이터 파일 생성 확인
Get-Item "$env:USERPROFILE\.musu\bridge.env"
Get-Item "$env:USERPROFILE\.musu\nodes.toml"
Get-Item "$env:USERPROFILE\.musu\musu.db" -ErrorAction SilentlyContinue

# 4. venv Python 확인
& "C:\dev\musu-bee\musu-bridge\.venv\Scripts\python.exe" --version
```

각 단계가 작동하면 v16.A PASS.

---

## 3. 깨질 만한 곳 (예측 + hotfix 안내)

각 위험별로 **증상 → 원인 → fix** 정리. 발견 시 commit + push.

### 3.1 Microsoft Defender SmartScreen 차단

**증상**: install.ps1 실행 시 "이 파일을 실행할 수 없습니다" 또는 "확인되지 않은 게시자".

**원인**: 인터넷에서 다운받은 .ps1 가 Zone.Identifier 마크 가짐.

**Fix**: 사용자에게 한 줄 안내 + INSTALL.md 에 추가
```powershell
Unblock-File -Path scripts\install.ps1
```

### 3.2 `icacls` syntax 오류

**증상**: `icacls : INVALID PARAMETER` 또는 `/grant:r` 인식 안 됨.

**원인**: PowerShell variable expansion (`${env:USERNAME}`) 안에 `:` 가 들어가서 PS 가 type cast 로 해석할 가능성.

**현재 코드** (`install.ps1` line 50):
```powershell
icacls $MusuHome /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" | Out-Null
```

**Hotfix 옵션**:
```powershell
$user = $env:USERNAME
icacls $MusuHome /inheritance:r /grant:r "${user}:(OI)(CI)F" | Out-Null
```

또는 backtick escape:
```powershell
icacls $MusuHome /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
```

### 3.3 `Register-ScheduledTask` 실패

**증상**: `New-ScheduledTaskPrincipal : The user name or password is incorrect.` 또는 `Access denied.`

**원인**: `-LogonType Interactive` 가 비인증 사용자에서 작동 안 할 수 있음. domain account 환경에선 다른 LogonType 필요.

**현재 코드** (line 195-200):
```powershell
$action    = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "..."
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
```

**Hotfix**: `-LogonType S4U` (no password) 또는 `Limited` 시도. 또는 admin 권한 elevation 필요한 경우 명시.

### 3.4 venv 생성 실패 — Python launcher 차이

**증상**: `python -m venv $Venv` 가 "permission denied" 또는 "no module named venv".

**원인**: Windows store 의 Python (`python` alias) 은 venv 모듈 다를 수 있음. `py -3.12` 가 더 안전.

**현재 코드** (line 64):
```powershell
& python -m venv $Venv
```

**Hotfix**:
```powershell
# Try py launcher first, fall back to python
$pyCmd = Get-Command py -ErrorAction SilentlyContinue
if ($pyCmd) {
    & py -3.12 -m venv $Venv
} else {
    & python -m venv $Venv
}
```

### 3.5 `node_identity.py` Windows GPU 감지 실패

**증상**: nodes.toml 에 `gpu = ""` 항상 빈 값.

**원인**: `nvidia-smi` 가 PATH 에 없거나 Linux-specific lspci 호출이 Windows 에서 실패.

**Fix**: musu-bridge/node_identity.py 의 GPU 감지 로직 확인 후 Windows path 추가 (WMI: `Get-CimInstance Win32_VideoController`).

이건 별도 commit 으로 musu-bridge/node_identity.py 에 hotfix.

### 3.6 pnpm 없음 → musu-bee build 실패

**증상**: `Step 6: building musu-bee (first time)... musu-bee build failed — UI unavailable`

**원인**: install.ps1 line 165 는 `pnpm` 또는 `npm` 둘 다 시도하지만 `corepack enable` 없이는 pnpm 작동 안 함.

**Hotfix**: install.ps1 에 `corepack enable` 한 줄 추가, 또는 사용자에게 `npm install -g pnpm` 안내.

### 3.7 here-string variable expansion 문제

**증상**: `nodes.toml` 의 hostname 자리에 literal `$nodeName` 텍스트.

**원인**: PowerShell here-string `@" ... "@` 는 expansion 함 (vs `@' ... '@`). 현재 코드 `@" ... "@` 쓰고 있어서 OK. 검증 필요.

### 3.8 venv Python path 다름 (Windows)

**증상**: bridge 시작 실패 — `python.exe not found`.

**원인**: Linux venv = `.venv/bin/python`. Windows venv = `.venv\Scripts\python.exe`. 

**현재 코드 확인** (line 16):
```powershell
$venvPython = Join-Path $Venv "Scripts\python.exe"
```

올바름. 다만 start-bridge.ps1 도 같은 path 써야 함 — 확인:
```powershell
# install.ps1 line 178-194 에서 start-bridge.ps1 자동 생성
& (Join-Path `$Venv "Scripts\python.exe") -m server
```
이 부분 escape 가 정확한지 (백틱 `\`` 가 변수 expansion 막아서 string literal 로 저장되는지) 검증 필요.

### 3.9 server.py 가 Windows path 다루는지

**증상**: bridge 시작은 됐는데 `~/.musu/bridge.env` load 실패.

**원인**: musu-core/config 에서 `Path.home() / ".musu" / "bridge.env"` 가 Windows 에서 `C:\Users\<you>\.musu\bridge.env` 로 작동해야 함. 일반적으로 pathlib 이 cross-platform 이지만 일부 hardcode `$HOME` 사용처가 있을 수 있음.

**검증**: 
```powershell
& "C:\dev\musu-bee\musu-bridge\.venv\Scripts\python.exe" -c "from musu_core.config import get_config; print(get_config().db_path)"
```
출력이 `C:\Users\<you>\.musu\musu.db` 같은 형식이면 OK.

---

## 4. Hotfix workflow

이슈 발견할 때마다:

```powershell
# 1. fix
notepad scripts\install.ps1    # 또는 다른 에디터

# 2. 다시 install 시도 (idempotent — 기존 venv/db 보존)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start

# 3. 작동하면 commit + push
cd C:\dev\musu-bee
git add scripts\install.ps1
git commit -m "fix(install): <issue summary> (v16.A)"
git push origin main
```

`rtk` 는 Windows 에 없을 수 있음 — `git` 직접.

---

## 5. v16.A 끝났을 때 산출물

1. **install.ps1 hotfix commits** (개수만큼) — `feat(install)` 또는 `fix(install)` 접두사
2. **INSTALL.md Windows 섹션 보강** — 발견된 troubleshooting 추가
3. **wiki 309 작성** — `309_V16A_WINDOWS_INSTALL_VERIFY_2026_05_13.md`
   - 어디서 깨졌는가
   - 무엇을 fix 했는가
   - 다음 머신에서도 같은 issue 가능성
4. **MEMORY.md v16.A entry**
5. **PowerShell session 캡처** — 가능하면 성공 시 health check 출력 stdout

---

## 6. 이후 (v16.B~E)

v16.A 끝나면 wiki 308 의 다음:
- **B (Mac install)**: 사용자 Mac 없음 → v17 deferred
- **D (HN/Reddit launch)**: 이게 v16.A 의 진짜 가치 unlock 시점. install 검증 완료 = 외부 광고 거짓말 안 됨
- **C (Sprint Contract write-side)**: 별도 사이클 가능
- **E (mobile interactions)**: 별도 사이클 가능

v16.A 의 산출이 production-ship 의 마지막 P0. 끝나면 HN launch 진입 가능.

---

## 7. 정보 빠르게 보기

| 항목 | 값 |
|---|---|
| repo | https://github.com/yellowhama/musu-bee |
| HEAD (시작 시) | `5f8a077c` (v15 closure) |
| install.ps1 | `scripts/install.ps1`, 280 lines |
| 핵심 검증 명령 | `Invoke-WebRequest http://127.0.0.1:8070/health -UseBasicParsing` |
| 기존 wiki | `~/llm-wiki/wiki/305..308_*.md` (WSL 측 경로) |
| Windows 측 wiki 접근 | `\\wsl$\Ubuntu\home\hugh51\llm-wiki\wiki\` |
| Linux 측 musu-functions | `/home/hugh51/musu-functions/` (WSL) |
| Windows 측 musu-functions | `\\wsl$\Ubuntu\home\hugh51\musu-functions\` 또는 fresh `C:\dev\musu-bee\` |
| Memory file | `\\wsl$\Ubuntu\home\hugh51\.claude\projects\-home-hugh51\memory\MEMORY.md` |
| wiki 308 (v16 master plan) | `wiki/308_V16_MASTER_PLAN_CANDIDATES_2026_05_13.md` 의 §A |

---

## 8. WSL 측 작업과 동기화

새 PowerShell Claude 세션이 musu-functions 코드 수정하면:
- **fresh clone** (`C:\dev\musu-bee`) 의 경우 → push 해서 github 에 land → WSL 측에서 `git pull github main` 하면 sync
- **WSL bind mount** (`\\wsl$\Ubuntu\home\hugh51\musu-functions`) 작업 시 → 둘 다 같은 파일. git 작업은 한 쪽에서만.

권장: **fresh clone 사용** — install.ps1 검증 자체가 깨끗한 시작 가정.

---

## 9. 만약 install.ps1 이 첫 시도에 그냥 잘 돌면?

축하 — 위험 8개 다 안 깨진 경우. 그래도:
1. health endpoint + Scheduled Task + `.musu/` 파일 모두 검증 (위 2.5)
2. PowerShell 7 (pwsh) 에서도 같은 명령 작동하는지 1번 더 확인
3. **로그아웃 → 재로그인 → Scheduled Task 가 진짜 auto-start** 확인 — 이게 `-Service` 의 진짜 의미
4. wiki 309 에 "검증 통과, hotfix 0건" closure 작성
5. v16.D (HN launch) 진입

---

이 문서 1번 읽고 진입. 막히면 wiki 305~308 reference.
