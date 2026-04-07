# Paperclip Autonomy Plan 2026-04-03

## 목적

`musu-connects` 관련 실행을 root program gate 체인과 일치시키고, blocked -> next action이 수동 babysitting 없이 이어지게 만든다.

## 현재 상태

- `musu-connects` project-local packet (`MUS-17/18/19/21`)은 모두 `done`.
- active lane는 root project(`musu-functions root`)의 lane-2 chain으로 이동.
  - remediation parent: `MUS-49` (`done`)
  - active remediation subpacket: `MUS-52` (`in_progress`)
  - CTO risk gate: `MUS-53` (`todo`)
  - QA gate: `MUS-45` (`todo`)
  - parent lane: `MUS-27` (`blocked`)
- lane-3 gate는 `MUS-48`/`MUS-28`에서 hold 중.

## 운영 원칙

1. Live API를 source-of-truth로 사용하고, 같은 heartbeat 안에서 로컬 docs를 즉시 동기화한다.
2. blocked issue에는 항상 다음 실행 주체/커맨드/산출물을 포함한 unblock note를 남긴다.
3. Gate verdict가 나오면 parent issue와 후속 lane 상태를 즉시 재분류한다.

## 필요한 루프

### 1) Engineering remediation loop (`MUS-49`)

목적:

- lane-2 QA bounce 기준을 subpacket(`MUS-52`)에서 코드/artifact/문서로 닫고 evidence bundle 게시

완료 기준:

- positive + blocked scenario command 재현 성공
- proof/runtime evidence artifact 경로가 모두 존재

### 2) CTO + QA gate loop (`MUS-53`, `MUS-45`)

목적:

- CTO risk gate와 findings-first QA 재감사로 Gate A PASS/FAIL verdict 확정

완료 기준:

- Sev-1/Sev-2 unresolved = 0 이면 PASS
- verdict를 `MUS-27` 상태 전환 결정에 연결

### 3) Sequencing loop (`MUS-27`, `MUS-28`, `MUS-48`)

목적:

- Gate A 결과를 lane-2/lane-3 상태에 반영하고 resume order를 유지

완료 기준:

- Gate A PASS 시 lane-3 hold 해제 path 명시
- Gate A FAIL 시 작은 remediation packet 신규 분해 + owner 지정

## cadence

- Founding Engineer routine: `*/15 * * * *`
- CEO review routine: `*/30 * * * *`

## 성공 기준

- root gate chain(`MUS-52` -> `MUS-53` -> `MUS-45` -> `MUS-27` -> `MUS-28`/`MUS-58`)이 board와 docs 모두에서 같은 상태를 보인다.
- blocked 이슈마다 실행 가능한 next action note가 남아 있다.
- 다음 heartbeat에서 "무엇을 해야 하는가"가 사람 개입 없이 읽힌다.
