# WSL Interop Diagnostics And Evidence Pack

## 목표

WSL interop flake를 사람 기억이 아니라 재실행 가능한 evidence script로 고정한다.

## 배경

현재까지 반복 관측된 오류는 크게 세 가지다.

- `UtilAcceptVsock ... accept4 failed 110`
- `UtilBindVsockAnyPort ... socket failed 1`
- `/mnt/c/...cmd.exe: cannot execute: required file not found`

지금까지는 handoff 문서와 수동 메모로만 상태를 설명했다.
이번 단계에서는 현재 세션이 왜 direct/helper/manual 중 어디로 가는지
근거를 JSON evidence로 남기는 것이 목적이다.

## 이번 단계 범위

- WSL-side diagnostic script 추가
- runtime / launcher / heartbeat / probe evidence를 JSON으로 출력
- 대표 오류 시그니처 분류 기준 문서화
- runbook / handoff / README 정렬

## 제외 범위

- helper queue protocol 변경
- Windows UI automation
- `musu-connects` 통합

## 구현 작업 목록

### Track 1. Evidence Script

- `diagnose-interop.sh`
  - runtime/env snapshot
  - launcher existence snapshot
  - `/run/WSL` socket snapshot
  - direct/winexec probe 결과
  - helper status 포함

### Track 2. Failure Classification

- `direct_ok`
- `wsl_interop_callback_timeout`
- `wsl_vsock_bind_failure`
- `binfmt_or_init_visibility_failure`
- `unknown_interop_failure`

### Track 3. Documentation

- `WINDOWS_BRIDGE_STANDARD.md`
- `WINDOWS_INTEROP_HANDOFF_2026-04-01.md`
- `README.md`
- `TODO.md`

## 검증 방법

- `bash -n scripts/windows-bridge/diagnose-interop.sh`
- `scripts/windows-bridge/diagnose-interop.sh`
- 필요 시 `probe-interop.sh` / `status-helper.sh`와 결과 대조

## 완료 기준

- 현재 interop 상태를 JSON evidence 하나로 설명 가능하다
- 대표 오류 시그니처가 어떤 failure class로 묶이는지 문서로 고정된다
- 다음 세션에서도 handoff 없이 진단 출발선을 바로 재현할 수 있다
