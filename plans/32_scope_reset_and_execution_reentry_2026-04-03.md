# Scope Reset And Execution Re-entry

## 목표

이전 root closeout tranche를 역사 기록으로 유지하면서, `musu-functions`의 실제 repo completion 작업을 다시 열 수 있는 현재 기준선을 만든다.

## 현재 Truth

- lane 1, lane 2, lane 3, wave-3 closeout 문서는 모두 존재한다.
- Paperclip control plane은 다시 살아 있고 `version=2026.325.0`으로 health가 올라온다.
- 그러나 live automation에는 `issueId: null` run이 남아 있고, 기존 terminal-close 문서가 현재 roadmap처럼 읽히는 drift가 있다.
- 따라서 지금 필요한 첫 packet은 새 기능 구현이 아니라 scope reset과 execution queue reopen이다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/TODO_EXECUTION_BOARD.md`
- `/home/hugh51/musu-functions/plans/README.md`
- 필요 시 `/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/*.md`

## 범위

1. root roadmap를 "terminal closeout"이 아니라 "repo completion" 기준으로 다시 쓴다.
2. live automation 상태를 현재 truth로 요약한다.
3. 다음 구현 파동과 세부 플랜 생성 순서를 고정한다.
4. run hygiene를 어떤 후속 packet에서 닫을지 명시한다.

## 제외 범위

- `musu-port` 코드 수정
- `musu-connects` wire-level transport 구현
- `MUSU-CRT` runtime attach 구현
- `MUSU-WORKS` runtime consumer 구현
- Paperclip issue 생성/재배치 그 자체

## 구현 작업 목록

1. root master plan 재작성
   - completion definition
   - current baseline
   - remaining waves
   - detail-plan protocol
2. root planning rules 재작성
   - master plan과 detail plan의 관계를 명문화
3. root board 재정렬
   - current in-progress
   - next queue
   - live automation snapshot
4. root current state drift 제거
   - old terminal-close snapshot을 현재 계획 기준으로 치환

## 검증 명령

- `curl -s http://127.0.0.1:3100/api/health`
- `curl -s 'http://127.0.0.1:3100/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/live-runs?minCount=8'`
- `sed -n '1,220p' /home/hugh51/musu-functions/MASTER_PLAN.md`
- `sed -n '1,220p' /home/hugh51/musu-functions/TODO_EXECUTION_BOARD.md`

## 기대 Artifact / Evidence

- 루트 문서 네 개가 같은 현재 truth를 말한다.
- 첫 다음 큐가 문서로 고정된다.
- 자율운영 상태가 `running`인지 `degraded`인지가 아니라, 어떤 debt를 가진 `running`인지까지 명시된다.

## 리스크 / 보류 항목

- Paperclip run hygiene는 아직 닫히지 않았다.
- root project가 과거 closeout 상태라 다음 구현 packet을 어디서 다시 열지 결정이 필요하다.
- autonomy recovery는 됐지만 clean-state automation이라고 부르기엔 아직 이르다.

## 완료 기준

- root master plan이 현재 repo completion 방향으로 재정렬된다.
- root board가 더 이상 `none / terminal closed`만 말하지 않는다.
- 다음 세부 플랜 순서가 문서로 명확해진다.

## 다음 Handoff

- 다음 packet은 `musu-port` operator ingress closure detail plan이다.
- run hygiene follow-up은 별도 ops packet으로 분리하되, product completion wave와 섞지 않는다.
