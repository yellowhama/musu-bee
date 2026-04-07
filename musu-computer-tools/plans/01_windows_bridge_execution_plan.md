# Windows Bridge Execution Plan

## 목표

`musu-computer-tools` 안에서 Windows native action을 다룰 때 아래 세 가지를 표준화한다.

1. 현재 세션에서 direct interop가 가능한지 자동 판별한다.
2. direct interop가 막혀 있으면 Windows resident helper로 위임한다.
3. helper도 없으면 사람이 Windows에서 한 번만 실행하면 되는 launcher로 마감한다.

## 구현 범위

### Track 1. Entry Point 정리

- `scripts/windows-bridge/run-musu-port-smoke.ps1`
  - `musu-computer-tools` 기준 canonical Windows entrypoint
  - 내부에서 sibling repo인 `musu-port/scripts/run-windows-smoke.ps1` 호출
- `scripts/windows-bridge/run-musu-port-smoke.cmd`
  - Windows Explorer / `cmd.exe`에서 바로 실행 가능한 wrapper

### Track 2. WSL-side Automation

- `scripts/windows-bridge/lib.sh`
  - repo/runtime path 계산
  - Linux path -> Windows path 변환
  - queue/result path 계산
- `scripts/windows-bridge/probe-interop.sh`
  - direct `.exe` 호출 가능 여부 확인
  - `winexec.sh` bridge 가능 여부 확인
  - helper heartbeat 확인
  - 추천 실행 mode(`direct|helper|manual`) 출력
- `scripts/windows-bridge/enqueue-powershell.sh`
  - PowerShell file request를 queue에 기록
  - result JSON이 생길 때까지 대기
- `scripts/windows-bridge/run-musu-port-smoke.sh`
  - probe 결과에 따라 direct/helper/manual 경로 자동 선택

### Track 3. Windows Resident Helper

- `scripts/windows-bridge/windows-bridge-helper.ps1`
  - queue 디렉터리 poll
  - `powershell_file` request 실행
  - result JSON + log 파일 작성
  - heartbeat 파일 갱신
- `scripts/windows-bridge/start-helper.cmd`
  - helper를 Windows에서 한 번에 띄우는 entrypoint

### Track 4. 운영 문서

- `WINDOWS_BRIDGE_STANDARD.md`
  - blocked session 대응 표준
  - 추천 실행 순서
  - runtime artifact 위치
- `README.md`
  - bridge flow 링크
- `WINDOWS_INTEROP_HANDOFF_2026-04-01.md`
  - 새 artefact 위치 반영

## 런타임 계약

### Runtime Root

- hidden runtime dir: `.windows-bridge/`
- 하위 디렉터리:
  - `queue/`
  - `processing/`
  - `results/`
  - `logs/`
  - `state/`

### Request Contract

`powershell_file` request JSON:

- `id`
- `kind`
- `display_name`
- `script_path`
- `working_directory`
- `arguments`
- `wsl_distro`
- `created_at`

### Result Contract

- `request_id`
- `status`
- `exit_code`
- `started_at`
- `completed_at`
- `duration_ms`
- `log_path_windows`
- `script_path_windows`
- `working_directory_windows`
- `summary`

## 완료 기준

- WSL에서 `probe-interop.sh`가 direct/helper/manual 상태를 명확히 출력한다.
- Windows helper가 request file 하나를 처리하고 result JSON을 남긴다.
- `run-musu-port-smoke.sh`가 helper offline일 때 Windows launcher 경로를 안내한다.
- Windows 사용자는 `run-musu-port-smoke.cmd`만으로 smoke를 실행할 수 있다.
- README와 handoff 문서만 읽어도 다음 세션이 바로 이어진다.

## 이번 환경의 검증 한계

- 현재 Codex snap 세션에서는 direct `.exe` 실행이 실패한다.
- 따라서 helper 실제 기동과 최종 Windows smoke 성공 JSON은 Windows shell에서 남겨야 한다.
- 이 계획의 이번 턴 완료선은 "구조/스크립트/문서/queue contract 고정"이다.
