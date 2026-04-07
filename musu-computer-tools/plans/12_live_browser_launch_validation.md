# 12. Live Browser Launch Validation

## 목표

실제 Windows browser launch와 WSL-side probe를 이용해 split-host browser boundary의 live evidence를 확보한다.

## 참조 문서

- `WINDOWS_BROWSER_LAUNCH_RUNBOOK.md`
- `WINDOWS_BROWSER_CDP_STANDARD.md`
- `plans/10_split_host_browser_boundary.md`

## 이번 단계 범위

- Windows-side browser bootstrap 실행
- WSL-side `probe-browser-cdp.sh` 재검증
- 결과를 evidence 문서로 남김

## 제외 범위

- 장기 browser service productization
- remote/non-localhost browser exposure

## 구현 작업 목록

1. launch runbook 기준 actual launch 실행
2. WSL probe evidence 저장
3. 성공/실패 모두 현재 상태와 TODO에 반영

## 검증 방법

- `/json/version`, `/json/list` 기준 reachable 여부를 확인한다.
- unreachable이면 launch/runbook/host binding 중 어느 축인지 분리한다.

## 완료 기준

- live browser validation evidence가 존재한다.
