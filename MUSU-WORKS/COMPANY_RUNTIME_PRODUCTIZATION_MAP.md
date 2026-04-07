# MUSU-WORKS Company Runtime Productization Map

## 목적

`musu_corp`에서 먼저 검증된 회사 runtime/govnernance 기능 중, `MUSU-WORKS`가 정식 owner가 되어야 할 항목을 고정한다.

## `MUSU-WORKS`가 가져갈 것

### 1. company / project / agent runtime model

- company
- project
- agent attachment
- session / lane ownership

이유:

- 이 구조는 회사/프로젝트 운영 모델 자체이기 때문이다.

### 2. queue / lane / worker result contract

- queue item schema
- lane state surface
- worker result surface
- handoff payload contract

이유:

- 단순 infra가 아니라 회사 운영의 실행 상태 모델이다.

### 3. governance / review surface

- approval
- escalation
- morning review
- board decision

이유:

- company ops와 governance domain에 직접 속한다.

### 4. memory / review / audit connection

- company memory
- review packets
- governance reports

이유:

- 회사 상태를 축적하고 판단하는 domain layer다.

## `MUSU-WORKS`가 직접 안 가져갈 것

- resident BitNet server process lifecycle
- Codex process spawn/runtime execution detail
- generic watchdog process supervision

이건 루트 runtime capability 또는 다른 infra context가 맡고, `MUSU-WORKS`는 그 결과 상태를 읽는 쪽이 맞다.

## 즉시 다음 단계

1. queue/lane/worker contracts를 `MUSU-WORKS` canonical contract 후보로 내린다.
2. approval/escalation/morning review를 company ops surface로 다시 정리한다.
3. 이후 mock/viewer/MCP surface에 연결한다.
