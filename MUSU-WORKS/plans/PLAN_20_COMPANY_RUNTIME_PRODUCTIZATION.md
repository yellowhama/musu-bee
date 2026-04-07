# Plan 20. Company Runtime Productization

## 목표

`musu_corp`에서 검증된 회사 runtime / governance 기능을 `MUSU-WORKS`의 정식 도메인 contract 후보로 고정한다.

## 입력

- `/home/hugh51/musu_corp/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/COMPANY_CAPABILITY_REPATRIATION_MAP.md`
- `/home/hugh51/musu-functions/PRODUCTIZATION_SEQUENCE.md`

## 범위

- queue item / lane state / worker result / handoff payload
- approval / escalation / morning review / board decision
- company/project/agent runtime model과의 연결

## 제외 범위

- 실제 runtime process supervision
- BitNet/Codex process lifecycle

## 구현 작업

1. `MUSU-WORKS`가 가져갈 company runtime contract를 정리한다.
2. governance/review surface를 company ops domain으로 다시 쓴다.
3. viewer / MCP / persistence 연결 후보를 메모한다.

## 검증

- `MUSU-WORKS` 문서만 읽어도 회사 runtime/governance ownership이 보인다.

## 완료 기준

- `musu_corp` runtime 기능 중 `MUSU-WORKS` owner 영역이 문서로 고정된다.
