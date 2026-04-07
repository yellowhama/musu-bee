# Detailed Plan Rules

이 폴더는 `musu-port` 구현 단계별 세부 플랜 문서를 쌓는 곳이다.

## 현재 phase 흐름

현재 `musu-port`의 세부 플랜은 아래 흐름으로 본다.

- `01` ~ `08`
  - standalone parity core
  - workspace / route / router / L4 / discovery / persistence / parity verification
- `09`
  - Linux toolchain recovery + live smoke
- `10` ~ `17`
  - Windows/WSL bilingual productization baseline
  - translator / discovery provider / data root / launcher contract / validation matrix
- `18` ~ `21`
  - AI-native service integration track
  - service classification / device profile contract / MCP service discovery / connect ingress parity

현재 마감 단계 문서군:

- `22_manual_validation_execution.md`
- `23_deferred_policy_decisions.md`
- `24_validation_automation_and_windows_bridge_handoff.md`

## 파일명 규칙

- `NN_<slug>.md`

예:

- `01_workspace_bootstrap.md`
- `02_route_contract_freeze.md`
- `03_http_ws_router.md`

## 각 문서 최소 구성

반드시 아래 항목을 포함한다.

- 목표
- 원본 참조 파일
- 이번 단계 범위
- 제외 범위
- 구현 작업 목록
- 검증 방법
- 보류 항목
- 완료 기준

## 운영 규칙

- 코드 작성 전에 해당 단계 세부 플랜을 먼저 만든다.
- 구현 중 범위가 바뀌면 세부 플랜 문서를 먼저 갱신한다.
- 단계 완료 후 결과와 남은 차이를 문서에 짧게 남긴다.
- 다음 단계는 새 문서로 분리한다.
- 상위 정렬 순서는 항상 `MASTER_PLAN.md`와 `TODO.md`를 기준으로 맞춘다.
