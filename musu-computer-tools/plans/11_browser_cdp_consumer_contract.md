# 11. Browser CDP Consumer Contract

## 목표

`probe-browser-cdp.sh`가 발견한 endpoint/metadata를 실제 consumer가 어떻게 읽고 다음 동작으로 이어갈지 표준 계약을 고정한다.

## 참조 문서

- `MASTER_PLAN.md`
- `CURRENT_STATE.md`
- `WINDOWS_BROWSER_CDP_STANDARD.md`
- `WINDOWS_BROWSER_ACTION_CATALOG.md`
- `BROWSER_SPLIT_HOST_INVENTORY.md`

## 이번 단계 범위

- browser probe output shape 정리
- consumer가 바로 사용 가능한 최소 필드 정의
- launch-needed / endpoint-ready 분기 기준 정의

## 제외 범위

- 실제 browser automation 구현
- Playwright/CDP action 전체 구현

## 구현 작업 목록

1. consumer contract note 작성
2. browser action catalog에 consumer-facing read surface 반영
3. README / TODO / current state 정렬

## 검증 방법

- probe 결과만으로 “지금 붙을 수 있는지 / launch가 필요한지”를 설명할 수 있다.
- 다음 phase가 live validation으로 자연스럽게 이어진다.

## 완료 기준

- browser/CDP consumer contract가 문서로 고정된다.

## 완료 (2026-04-06)

- `WINDOWS_BROWSER_ACTION_CATALOG.md` — Consumer-Facing Read Surface Contract 섹션 추가:
  - probe output schema (모든 top-level 필드 + target object 필드)
  - consumer decision logic (reachable → connect, unreachable → launch)
  - minimum required fields 정의
  - consumer script 참조
- `scripts/windows-bridge/read-cdp-consumer.sh` 신규 작성:
  - `probe-browser-cdp.sh` wrapper
  - `state: ready` / `state: launch-needed` 출력
  - `--json` flag로 machine-readable JSON 출력
  - exit 0 (reachable) / exit 1 (unreachable) 표준화
  - syntax OK, `--help` / unreachable case 검증 완료
