# Plan 08. Governance Review Surface Position

## 목표

approval / escalation / morning review / board review를 `MUSU-AS-MCP`에서 어떤 read/action surface로 다룰지 고정한다.

## 입력

- `/home/hugh51/musu_corp/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/ROOT_PRODUCTIZATION_BACKLOG.md`
- `/home/hugh51/musu-functions/MUSU-AS-MCP/GOVERNANCE_REVIEW_SURFACE_POSITION.md`

## 범위

- read surface 후보
- action surface 후보
- source owner / consumer surface 분리

## 제외 범위

- 실제 MCP tool 구현
- desktop backport

## 구현 작업

1. governance/review surface의 owner와 consumer를 분리한다.
2. `MUSU-AS-MCP`가 가져갈 수 있는 read/action 후보를 적는다.
3. 이후 tool family 분해 후보로 연결한다.

## 검증

- 문서 기준으로 `MUSU-AS-MCP`가 owner가 아니라 consumer라는 점이 분명하다.

## 완료 기준

- governance/review surface의 위치가 `MUSU-WORKS`와 충돌 없이 설명된다.
