# Plan 67 — CEO Queue Topology Surgery (2026-04-08)

## 목표

`CEO 2` queue에서 blocked tactical issue를 제거하고, CEO를 다시 root sequencing / governance owner 위치로 되돌린다.

이번 packet의 목표는 두 가지다.

1. CEO에 잘못 걸려 있는 blocked tactical packet을 실제 실행 owner에게 재배치한다.
2. CEO는 parent packet, sequencing, escalation, board-quality 판단만 남기도록 queue topology를 정리한다.

## 현재 truth

기준 시각: `2026-04-08 KST`

CEO (`5dffee24-ee3f-4b75-89c8-11608fe7e186`)에 남아 있는 open blocked issue:

- `MUS-1016` — board action aggregator
- `MUS-994` — Vercel production deploy parent
- `MUS-995` — multi-machine E2E validation parent
- `MUS-1046` — Vercel env-var / production wiring
- `MUS-1024` — deploy updated musu-portd to 5070Ti
- `MUS-1015` — Vercel deployment execution child

문제는 이 issue들이 CEO가 직접 풀 tactical/infra/delivery packet이라는 점이다.

실제 owner 분류:

- Chief of Staff
  - board action aggregation
  - escalation routing
  - blocked owner follow-up
- CTO
  - infra / production wiring / environment readiness
  - cross-machine deployment unblock
- Founding Engineer
  - concrete implementation / deploy execution

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/plans/67_ceo_queue_topology_surgery_2026-04-08.md`
- `/home/hugh51/musu-functions/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/TODO_EXECUTION_BOARD.md`
- live Paperclip issues
  - `MUS-1016`
  - `MUS-994`
  - `MUS-995`
  - `MUS-1046`
  - `MUS-1024`
  - `MUS-1015`

## 범위

- CEO-assigned blocked tactical queue만 재배치
- issue title/description 자체는 보존
- assignee와 routing comment를 정리

## 제외 범위

- issue 내용 재작성
- blocked 상태 해소 자체
- 새 infra / deploy 구현

## 구현 작업 목록

1. `Plan 67` 생성
2. `MUS-1109` 아래 child queue-surgery packet 생성 및 plan 부착
3. 아래 reassignment 적용
   - `MUS-1016` → Chief of Staff
   - `MUS-994` → Founding Engineer
   - `MUS-1015` → Founding Engineer
   - `MUS-995` → CTO
   - `MUS-1024` → CTO
   - `MUS-1046` → CTO
4. 각 이슈에 owner rationale comment 기록
5. CEO queue 재조회 후 blocked tactical residue가 남는지 검증
6. root docs 동기화

## 검증 명령

```bash
curl -sS 'http://127.0.0.1:3100/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/issues?assigneeAgentId=5dffee24-ee3f-4b75-89c8-11608fe7e186&status=todo,in_progress,blocked&limit=50'
```

## 기대 artifact / evidence

- `Plan 67` 문서
- child queue-surgery packet
- reassignment comment evidence
- post-surgery CEO queue snapshot

## 리스크 / 보류 항목

- 일부 issue는 project/goal linkage가 오래된 상태라 owner 이동만으로 완전히 깨끗해지지 않을 수 있다.
- stale `executionRunId`가 남아 있을 수 있으므로 active run 여부와 별개로 status class 중심으로 본다.
- board-action 성격과 implementation 성격이 섞인 parent는 owner를 명확히 한 뒤 후속 packet에서 세분화해야 한다.

## 완료 기준

- CEO queue에서 blocked tactical issue가 제거된다.
- CEO는 root parent packet과 sequencing 책임만 남긴다.
- root docs와 live Paperclip state가 같은 queue truth를 말한다.

## 다음 handoff 또는 TODO 연결

- 다음 packet은 `68_ceo_validation_and_rollout_2026-04-08.md`
- 그 packet에서 CEO heartbeat 동작과 queue truth 정합성을 검증한다.
