# Windows Action Catalog Expansion

## 목표

Windows bridge를 smoke 전용 구현에서 재사용 가능한 action catalog로 확장한다.

## 배경

현재 bridge 위에는 주로 `musu-port` smoke 계열 action만 올라가 있다.
generic runner는 이미 존재하지만, catalog와 신규 action 예제가 부족해
추가 action을 붙일 때마다 구조를 다시 읽어야 한다.

## 이번 단계 범위

- Windows action catalog 문서 추가
- request kind / execution mode / launcher 기준 정리
- smoke 외 action 1개를 generic runner 위에 추가
- README / runbook / handoff / TODO 정렬

## 제외 범위

- queue protocol 대규모 변경
- 새로운 helper request kind 추가
- spec/index sync automation

## 구현 작업 목록

### Track 1. Catalog Documentation

- `WINDOWS_ACTION_CATALOG.md`
  - action id
  - direct/helper/manual 지원 여부
  - direct/helper kind
  - WSL runner
  - Windows launcher

### Track 2. New Catalog Action

- `run-helper-selftest.sh`
  - generic runner 기반 WSL action
- `run-helper-selftest.cmd`
  - Windows one-shot launcher

### Track 3. Validation

- direct `run-helper-selftest.sh --force-direct`
- helper `run-helper-selftest.sh --force-helper`
- `run-helper-selftest.cmd`를 `Start-Process -Wait` 경로로 종료 코드 검증

## 완료 기준

- smoke 외 action이 catalog와 함께 bridge 위에 올라간다
- 새 action 추가 패턴이 문서화돼 있다
- 다음 action 확장이 복붙이 아니라 catalog 기반 작업이 된다
