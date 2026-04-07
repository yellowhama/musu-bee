# PLAN 21. Company Runtime Contract Shortlist

## 목표

`musu_corp`에서 운영 검증된 회사 runtime/govnernance object를 `MUSU-WORKS` 정식 contract shortlist로 고정한다.

## 참조 문서

- `COMPANY_RUNTIME_PRODUCTIZATION_MAP.md`
- `MUSU_CORP_TO_MUSU_WORKS_MIGRATION_MAP.md`
- `INDEXER_MEMORY_WIRING.md`
- `/home/hugh51/musu_corp/QUEUE_ITEM_SCHEMA.md`
- `/home/hugh51/musu_corp/work/reports/morning-review.md`

## 이번 단계 범위

- queue item
- lane state
- worker result
- handoff payload
- approval / escalation / morning review / board decision

## 제외 범위

- resident worker process lifecycle
- watchdog low-level process supervision
- BitNet/Codex spawn detail

## 구현 작업 목록

1. `MUSU-WORKS` ownership 대상 contract object 정리
2. infra ownership과 works ownership 경계 분리
3. 다음 read model / mock / MCP consumer 연결 포인트 식별

## 검증 방법

- contract object가 문서상 분리돼 있다
- 루트 runtime capability와 `MUSU-WORKS` 경계가 충돌하지 않는다
- 이후 mock/viewer/MCP surface가 이 shortlist를 참조할 수 있다

## 완료 기준

- `MUSU-WORKS`가 직접 소유할 회사 runtime object가 명확하다
- 다음 단계로 governance review read model 정리가 자연스럽게 이어진다
