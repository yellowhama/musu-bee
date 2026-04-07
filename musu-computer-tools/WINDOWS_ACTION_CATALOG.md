# Windows Action Catalog

## 목적

`musu-computer-tools`에서 bridge 위에 올라간 Windows action의 표준 계약을 한 곳에 모은다.

browser/CDP 계열은 이 문서가 아니라 아래 문서에서 따로 다룬다.

- `WINDOWS_BROWSER_ACTION_CATALOG.md`

browser bootstrap도 launch는 process-bound이지만, catalog 소속은 browser 쪽으로 유지한다.

## 공통 실행 규칙

- WSL runner는 가능한 경우 `scripts/windows-bridge/run-windows-action.sh`를 공통 entrypoint로 사용한다.
- direct mode는 `winexec.sh + powershell.exe` fast path를 사용한다.
- helper mode는 queue/result contract를 사용한다.
- manual mode는 Windows `.cmd` launcher를 사용한다.

## Request Kinds

- `powershell_file`
  - helper가 PowerShell file을 실행한다.
  - direct mode의 canonical script도 PowerShell file인 경우가 기본값이다.
- `cmd_file`
  - helper가 CMD file을 실행한다.
  - Windows one-shot launcher나 CMD wrapper가 필요한 경우 사용한다.

## Action Catalog

### `musu-port-smoke`

- 목적:
  - `musu-port` Windows smoke harness 실행
- WSL runner:
  - `scripts/windows-bridge/run-musu-port-smoke.sh`
- Windows launcher:
  - `scripts/windows-bridge/run-musu-port-smoke.cmd`
- direct script:
  - `scripts/windows-bridge/run-musu-port-smoke.ps1`
- helper script:
  - `scripts/windows-bridge/run-musu-port-smoke-helper.ps1`
- direct kind:
  - `powershell_file`
- helper kind:
  - `cmd_file`

### `musu-port-native-smoke`

- 목적:
  - Windows native built `musu-portd.exe` 대상 smoke 실행
- WSL runner:
  - `scripts/windows-bridge/run-musu-port-native-smoke.sh`
- Windows launcher:
  - `scripts/windows-bridge/run-musu-port-native-smoke.cmd`
- direct script:
  - `scripts/windows-bridge/run-musu-port-native-smoke.ps1`
- helper script:
  - `scripts/windows-bridge/run-musu-port-native-smoke.ps1`
- direct kind:
  - `powershell_file`
- helper kind:
  - `powershell_file`

### `helper-selftest`

- 목적:
  - Windows bridge PowerShell execution path의 최소 self-test
- WSL runner:
  - `scripts/windows-bridge/run-helper-selftest.sh`
- Windows launcher:
  - `scripts/windows-bridge/run-helper-selftest.cmd`
- direct script:
  - `scripts/windows-bridge/helper-selftest.ps1`
- helper script:
  - `scripts/windows-bridge/helper-selftest.ps1`
- direct kind:
  - `powershell_file`
- helper kind:
  - `powershell_file`

## 추가 패턴

새 action을 추가할 때는 아래 순서를 따른다.

1. direct PowerShell entrypoint를 만든다.
2. 필요하면 helper용 script/kind를 분리한다.
3. Windows one-shot `.cmd` launcher를 만든다.
4. WSL runner를 `run-windows-action.sh` 위에 올린다.
5. 이 문서와 `README.md`, `WINDOWS_BRIDGE_STANDARD.md`, handoff를 갱신한다.
