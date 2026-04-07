# Plan 05. Company Capability Repatriation

## 목표

- `musu_corp`에서 검증된 기능을 `musu-functions`의 어디로 다시 넣을지 제품 관점으로 고정한다.

## 대상 프로젝트

- `musu-functions` 루트
- `MUSU-WORKS`
- `MUSU-AS-MCP`
- `musu-port`
- `musu-connects`

## 참조 문서

- `/home/hugh51/musu-functions/DOGFOODING_PRODUCT_MODEL.md`
- `/home/hugh51/musu-functions/CURRENT_STATE.md`
- `/home/hugh51/musu_corp/CURRENT_STATE.md`

## 이번 단계 범위

- capability shortlist
- candidate destination context
- priority ordering

## 제외 범위

- 실제 구현/이동
- 회사 템플릿화

## 구현 작업 목록

1. queue/supervisor/watchdog/control CLI를 후보 capability로 고정한다.
2. 각 후보의 target context를 지정한다.
3. 루트 TODO 보드에 우선순위를 넣는다.

## 검증 방법

- “회사에서 먼저 검증하고 제품으로 환원한다”는 흐름이 문서상으로 일관돼야 한다.

## 보류 항목

- 각 모듈 내부 구현 계획은 모듈 마스터 플랜에서 이어간다.

## 완료 기준

- `musu-functions` 루트에서 다음 제품 우선순위를 바로 읽을 수 있다.
