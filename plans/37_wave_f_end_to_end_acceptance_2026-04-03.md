# Wave F: End-to-End Acceptance

## 목표

카페 노트북, 강한 GPU 데스크탑, 보조 GPU 데스크탑 3자 시나리오를 최종 replayable acceptance chain으로 묶는다.

## 현재 Truth

- representative scenario artifact는 과거 tranche에서 한 번 닫혔다.
- 그러나 새 repo completion 기준에서는 각 module wave를 다시 연결한 final chain이 필요하다.
- 특히 `musu-port`, `musu-connects`, `MUSU-CRT`, `MUSU-WORKS`의 최신 acceptance를 한 narrative로 묶어야 한다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/work/*`
- `/home/hugh51/musu-functions/scripts/*scenario*`
- `/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/*`
- `/home/hugh51/musu-functions/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/TODO_EXECUTION_BOARD.md`

## 범위

1. 각 wave acceptance artifact를 final scenario chain으로 조합한다.
2. replay commands, expected outputs, failure modes, resume order를 한 문서로 정리한다.
3. 남은 리스크를 "미완성"이 아닌 "hardening/post-MVP" 수준으로 분리한다.

## 제외 범위

- 신규 기능 개발
- broad production scaling
- new company organization redesign

## 구현 작업 목록

1. Wave B-E artifact를 final scenario lens로 재정렬한다.
2. scenario chain-id, session-id, workload handoff evidence를 하나의 packet으로 묶는다.
3. operator review 결과와 autonomous routing evidence를 연결한다.
4. QA/review/open-risk register를 최종 closeout 형태로 적는다.

## 검증 명령

- wave별 canonical replay command 전체
- final scenario replay command set defined in the packet

## 기대 Artifact / Evidence

- final acceptance bundle
- replay runbook
- risk register
- closeout summary with exact remaining hardening items

## 리스크 / 보류 항목

- final bundle이 너무 문서 중심이면 실제 replay 가치가 떨어진다.
- chain continuity가 깨지면 acceptance narrative가 무너진다.

## 완료 기준

- representative cafe-laptop -> dual-desktop scenario가 replay 가능하다.
- module acceptance가 하나의 end-to-end narrative로 연결된다.
- 남은 open items는 post-acceptance hardening only다.

## 다음 Handoff

- root repo completion closeout 또는 post-acceptance hardening roadmap으로 넘긴다.
