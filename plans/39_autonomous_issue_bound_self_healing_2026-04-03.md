# Autonomous Issue-Bound Self-Healing

## 목표

문제가 생기면 "사람이 보고 직접 지시"하는 대신, 기존 Codex agent들이 issue-bound remediation packet을 자동으로 만들고 스스로 수정까지 진행하게 하는 운영 계약을 고정한다.

## 현재 Truth

- 현재 회사에는 이미 수정 가능한 agent가 있다.
  - `Founding Engineer`: 코드 수정
  - `CTO`: 기술 판단, packet sequencing
  - `QA Lead`: 검증/재현/close gate
  - `Chief of Staff`: 운영 hygiene, queue 정리
- 문제는 "수정 agent 부재"가 아니라 "문제를 issue로 물질화하지 않은 heartbeat/run"이 남는다는 점이다.
- 실제 live state에서도 `issueId: null` queued run이 관측된다.

## 웹 리서치 기반 운영 원칙

공식 Paperclip 문서 기준:

1. agent는 연속 프로세스가 아니라 discrete heartbeat 단위로 실행된다.
   - source: https://www.mintlify.com/paperclipai/paperclip/concepts/agents
2. issue는 Paperclip의 작업 단위이며, plan/comment/document를 붙일 수 있다.
   - source: https://docs.paperclip.ing/api/issues
3. `in_progress`는 checkout이 필요한 single-owner state다.
   - source: https://docs.paperclip.ing/api/issues
4. issue comment의 `@AgentName` mention은 heartbeat를 트리거한다.
   - source: https://docs.paperclip.ing/api/issues
5. process adapter는 absolute path, reasonable timeout, resolvable command가 중요하다.
   - source: https://www.mintlify.com/paperclipai/paperclip/agents/process-adapter
6. stale task와 stuck agent는 dashboard/run history 기준으로 운영자가 봐야 한다.
   - source: https://docs.paperclip.ing/guides/board-operator/dashboard

## 결론

문제가 있으면 agent가 알아서 고치게 할 수 있다.

하지만 전제는 반드시 아래 순서를 지키는 것이다.

1. 문제를 감지한다.
2. 문제를 issue로 만든다.
3. plan document를 붙인다.
4. owner agent를 단일 지정한다.
5. comment mention 또는 heartbeat invoke로 시작한다.
6. QA/ops packet이 close를 검증한다.

즉 self-healing의 단위는 "heartbeat"가 아니라 "issue-bound heartbeat chain"이다.

## 범위

1. `issueId: null` remediation rule 정의
2. code bug / ops hygiene / config drift 분기 규칙 정의
3. 자동 수리 packet 생성 규칙 정의
4. close 조건과 handoff 규칙 정의

## 제외 범위

- 새 agent 타입 개발
- Paperclip 자체 기능 수정
- 무제한 자율 수정 허용

## 실행 모델

### 1. Detection

- source:
  - dashboard stale task
  - live-runs / heartbeat-runs
  - failed smoke / failed test / failed replay
  - doc-state drift

### 2. Classification

- `ops_hygiene`
  - `issueId: null`
  - stale queued/running run
  - duplicate heartbeat residue
- `code_fix`
  - failing test
  - broken harness
  - acceptance artifact regression
- `config_fix`
  - adapter path
  - timeout / cwd / instruction path drift
- `qa_only`
  - 재현과 판단만 필요할 때

### 3. Materialize

- remediation은 무조건 새 issue 또는 기존 issue child로 만든다.
- issue에는 아래가 있어야 한다.
  - parent
  - goal/project
  - assignee
  - plan document
  - acceptance

### 4. Execute

- `Chief of Staff`
  - `ops_hygiene` owner
- `Founding Engineer`
  - `code_fix` owner
- `CTO`
  - multi-module or sequencing owner
- `QA Lead`
  - repro / verification / gate owner

### 5. Close

- close는 아래를 같이 남겨야 한다.
  - evidence path
  - replay command
  - 남은 risk
  - 다음 handoff

## 자동 수리 규칙

1. `issueId: null` run을 발견하면 direct heartbeat 재호출부터 하지 않는다.
2. 먼저 hygiene issue를 만든다.
3. plan document를 붙인다.
4. `@Chief of Staff`로 시작시킨다.
5. code regression이면 child issue를 `Founding Engineer`에게 위임한다.
6. QA packet이 있으면 `QA Lead`가 replay와 close gate를 맡는다.

## 완료 기준

- 문제 발견 시 issue-bound remediation chain으로 항상 흘러간다.
- `null issue` run이 다시 생겨도 "누가 고칠지 없는 상태"가 아니라 "ops hygiene packet으로 들어가는 상태"가 된다.

## 다음 Handoff

- `MUS-146`는 이 문서를 근거로 run-to-issue hygiene를 닫는다.
- 이후 반복적으로 생기는 문제는 같은 protocol로 packet화한다.
