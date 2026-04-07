# MUSU-WORKS

## 제품 정의

`MUSU-WORKS`는 MUSU 안의 `회사 -> 프로젝트` 모델을 별도 작업공간에서 재현하고 고정하는 프로젝트다.

핵심 개념:

1. `회사`
   - AI Agents를 운영/관리하는 단위
   - capability, policy, worker pool, memory, 운영 규칙을 가진다
2. `프로젝트`
   - 특정 회사의 capability를 이용해 실제 작업을 수행하는 단위
   - task, deliverable, context, audit trail이 여기서 쌓인다

즉 `회사`는 운영면이고, `프로젝트`는 실행면이다.

## 현재 목적

- MUSU의 회사/프로젝트 모델을 문서와 구조로 먼저 재현
- 회사와 프로젝트 사이 계약면을 고정
- 이후 runtime, persistence, UI, MCP surface까지 연결 가능한 baseline 만들기

## 문서

- [MASTER_PLAN.md](/home/hugh51/musu-functions/MUSU-WORKS/MASTER_PLAN.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/MUSU-WORKS/CURRENT_STATE.md)
- [VISION.md](/home/hugh51/musu-functions/MUSU-WORKS/VISION.md)
- [AUTONOMOUS_WORKLOAD_ROUTING_AND_SAFETY.md](/home/hugh51/musu-functions/MUSU-WORKS/AUTONOMOUS_WORKLOAD_ROUTING_AND_SAFETY.md)
- [plans/README.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/README.md)
- [plans/PLAN_00_BASELINE.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_00_BASELINE.md)

## 운영 원칙

- 먼저 회사/프로젝트 모델을 문서로 고정한다.
- 그 다음 persistence, UI, MCP, runtime 순으로 내린다.
- 최종 앱에 바로 넣기 전에 여기서 계약면을 분명히 만든다.
