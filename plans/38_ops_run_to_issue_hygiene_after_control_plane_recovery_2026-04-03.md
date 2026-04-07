# Ops: Run-to-Issue Hygiene After Control-Plane Recovery

## 목표

Paperclip restart 이후 남은 `issueId: null` queued/running run과 stale sample drift를 정리해 자율운영의 run-to-issue discipline을 복구한다.

## 현재 Truth

- control plane은 `status=ok`, `version=2026.325.0`으로 복구됐다.
- restart 시 orphaned heartbeat run이 자동 수거됐다.
- 그러나 live-runs sample에는 여전히 `issueId: null` run이 남아 있다.
- 이 상태는 execution은 가능하지만 governance truth가 흐린 상태다.

## 대상 모듈 / 파일

- Paperclip live API
- `/home/hugh51/musu-functions/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/TODO_EXECUTION_BOARD.md`
- `/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/LIVE_STATE_2026-04-03.md`

## 범위

1. `issueId: null` run을 분류한다.
2. stale/duplicate/on-demand residue를 정리한다.
3. cleanup 이후 live-runs truth를 문서와 board에 반영한다.

## 제외 범위

- product module code 수정
- new feature implementation
- issue hierarchy redesign

## 구현 작업 목록

1. current live-runs / heartbeat-runs snapshot 수집
2. issue-bound run과 non-issue run 분류
3. cancel/reap/document only 중 어떤 처리인지 결정
4. cleanup 결과를 board/doc에 반영

## 검증 명령

- `curl -s http://127.0.0.1:3100/api/health`
- `curl -s 'http://127.0.0.1:3100/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/live-runs?minCount=8'`
- 필요한 경우 `heartbeat-runs` detail query

## 기대 Artifact / Evidence

- cleanup before/after snapshot
- remaining non-issue run explanation
- updated board/doc truth

## 리스크 / 보류 항목

- 일부 on-demand run은 즉시 cancel보다 설명 분리가 맞을 수 있다.
- restart 직후 sample window에는 이미 끝난 run이 남아 보일 수 있다.

## 완료 기준

- live automation sample이 현재 governance truth를 반영한다.
- `issueId: null` run이 남아 있으면 왜 남는지 설명 가능하다.

## 다음 Handoff

- product waves는 hygiene debt와 분리된 상태로 계속 진행한다.
