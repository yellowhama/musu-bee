# Wave E: MUSU-WORKS Autonomous Workload Closure

## 목표

`MUSU-WORKS`의 company/runtime contract를 실제 issue-bound autonomous workload routing과 blocker/approval/governance 흐름으로 연결한다.

## 현재 Truth

- company/project/agent/runtime contract 문서는 있다.
- preset generator와 viewer/read model도 있다.
- 하지만 현재 contract는 "잘 정리된 설계"에 가깝고, 실제 dual-machine workload routing evidence는 아직 없다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/MUSU-WORKS/AUTONOMOUS_WORKLOAD_ROUTING_AND_SAFETY.md`
- `/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_RUNTIME_CONTRACT_SHORTLIST.md`
- `/home/hugh51/musu-functions/MUSU-WORKS/PAPERCLIP.MD`
- `/home/hugh51/musu-functions/MUSU-WORKS/tools/generate_preset.py`
- `/home/hugh51/musu-functions/MUSU-WORKS/viewer/app.js`
- `/home/hugh51/musu-functions/MUSU-WORKS/mock/runtime_contract_alpha.json`

## 범위

1. runtime contract seed를 실제 workload routing/read model로 연결한다.
2. blocker, approval, escalation, morning review, board decision consumer를 runtime path에 고정한다.
3. dual-machine workload 분담 시나리오를 autonomous execution contract로 표현한다.

## 제외 범위

- Paperclip 자체 재구현
- unrelated company UI 확장
- billing/finance side systems
- generic enterprise multi-tenant scope

## 구현 작업 목록

1. 현재 runtime contract shortlist와 preset output을 비교해 누락된 execution surface를 식별한다.
2. viewer/read model에 queue/lane/worker/handoff/blocker/governance state를 반영한다.
3. approval/escalation/morning review consumer 경로를 명시적 contract로 만든다.
4. dual-GPU workload routing mock/evidence path를 준비한다.
5. 관련 docs/state/board를 갱신한다.

## 검증 명령

- `python3 /home/hugh51/musu-functions/MUSU-WORKS/tools/generate_preset.py --help`
- viewer smoke / artifact replay commands defined in the packet
- 필요한 경우 mock/runtime JSON consistency checks

## 기대 Artifact / Evidence

- runtime contract -> read model mapping evidence
- workload routing state fixture or manifest
- blocker/approval/escalation path note
- updated viewer proof

## 리스크 / 보류 항목

- execution contract를 viewer-only로 닫으면 실제 end-to-end에서 재검증이 필요하다.
- Paperclip live control plane과 product-side runtime contract를 섞으면 ownership 경계가 흐려질 수 있다.

## 완료 기준

- `MUSU-WORKS`가 실제 workload orchestration contract를 설명할 뿐 아니라 artifact로 증명한다.
- dual-GPU workload handoff가 issue/lane/worker/blocker 기준으로 읽힌다.
- final acceptance packet이 company/runtime plane 때문에 다시 열리지 않는다.

## 다음 Handoff

- 다음 packet은 final end-to-end acceptance다.
