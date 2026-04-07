# Helper Lifecycle Productization

## 목표

resident Windows helper를 사람이 현재 상태를 기억하며 운영하는 방식에서 벗어나,
명시적인 lifecycle command와 상태 surface로 제품화한다.

## 배경

현재 상태:

- `start-helper.cmd`는 존재한다.
- helper heartbeat 파일도 존재한다.
- 하지만 `status/stop/restart`가 표준 command로 고정되어 있지 않다.
- one-shot helper 검증 뒤 stale heartbeat가 남을 수 있어 운영 판단이 흔들릴 수 있다.

## 이번 단계 범위

- Windows helper lifecycle control script 추가
- `start/status/stop/restart` CMD wrapper 추가
- WSL에서 heartbeat/queue 상태를 읽는 status script 추가
- runbook / README / TODO / handoff 정렬

## 제외 범위

- queue protocol 확장
- 새 Windows action 추가
- interop diagnostic evidence pack

## 구현 작업 목록

### Track 1. Windows Lifecycle Surface

- `helper-lifecycle.ps1`
  - `start`
  - `status`
  - `stop`
  - `restart`
- stale heartbeat cleanup 포함
- helper PID live check 포함

### Track 2. CMD Entry Points

- `start-helper.cmd`
- `status-helper.cmd`
- `stop-helper.cmd`
- `restart-helper.cmd`

### Track 3. WSL Status Surface

- `status-helper.sh`
  - heartbeat 존재 여부
  - heartbeat age
  - queue / processing / results / logs count
  - recommended action

### Track 4. Documentation

- `README.md`
- `WINDOWS_BRIDGE_STANDARD.md`
- `WINDOWS_INTEROP_HANDOFF_2026-04-01.md`
- `TODO.md`

## 검증 방법

- `bash -n scripts/windows-bridge/*.sh`
- `scripts/windows-bridge/status-helper.sh`
- Windows shell에서 `status-helper.cmd`
- Windows shell에서 `stop-helper.cmd`, `start-helper.cmd`, `restart-helper.cmd`

## 완료 기준

- helper의 현재 상태를 WSL과 Windows에서 각각 빠르게 확인 가능하다
- stale heartbeat가 남아도 운영자가 `status/stop/start/restart`로 복구 가능하다
- runbook이 helper lifecycle을 직접 설명한다
