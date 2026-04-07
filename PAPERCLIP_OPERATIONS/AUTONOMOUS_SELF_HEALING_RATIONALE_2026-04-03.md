# Autonomous Self-Healing Rationale

## 질문

"문제가 있으면 Paperclip 회사의 Codex agent가 알아서 고치게 하면 되지 않나?"

답은 `그렇다`이다.

단, 그냥 heartbeat를 더 많이 돌리는 방식으로는 안 되고, issue-bound execution contract가 있어야 한다.

## 왜 지금 애매했는가

현재 회사에는 이미 수정할 agent가 있다.

- `Founding Engineer`: 코드 수정
- `CTO`: 기술 판단과 sequencing
- `Chief of Staff`: ops hygiene
- `QA Lead`: 검증과 close gate

그런데 live state에는 `issueId: null` run이 남아 있었다.

이건 "고칠 agent가 없다"는 뜻이 아니다.
이건 "문제가 작업 단위로 물질화되지 않았다"는 뜻이다.

## 공식 문서 기준 이유

Paperclip 공식 문서가 말하는 구조는 아래와 같다.

1. Agent execution은 continuous daemon이 아니라 heartbeat cycle이다.
   - source: https://www.mintlify.com/paperclipai/paperclip/concepts/agents
2. Work unit은 issue다.
   - issue에는 comment, document, attachment, lifecycle이 있다.
   - source: https://docs.paperclip.ing/api/issues
3. `in_progress`는 checkout이 필요한 single-owner state다.
   - source: https://docs.paperclip.ing/api/issues
4. comment mention은 heartbeat를 트리거한다.
   - source: https://docs.paperclip.ing/api/issues
5. dashboard는 stale task와 stuck work를 감시해야 한다.
   - source: https://docs.paperclip.ing/guides/board-operator/dashboard
6. process adapter는 command/cwd/instructions/timeout이 맞아야 한다.
   - source: https://www.mintlify.com/paperclipai/paperclip/agents/process-adapter

즉 Paperclip의 설계 철학 자체가

- 문제 발견
- issue 생성
- owner 지정
- heartbeat 실행

이라는 흐름을 전제한다.

## 왜 direct heartbeat만으로는 부족한가

direct heartbeat만 반복하면 아래 문제가 생긴다.

- 어떤 문제를 해결 중인지 추적이 안 된다.
- run이 issue에 귀속되지 않는다.
- close 조건이 없다.
- QA handoff가 없다.
- root board에는 activity가 남아도 governance truth는 비게 된다.

그래서 `issueId: null` run은 "agent 부재"가 아니라 "governance 부재"의 신호다.

## 운영 결론

자동수리는 이렇게 해야 한다.

1. 문제 감지
2. 문제 분류
3. remediation issue 생성
4. plan document 첨부
5. owner agent 지정
6. comment mention 또는 heartbeat invoke
7. QA/ops close

즉 자율수리의 최소 단위는 `run`이 아니라 `issue-bound run chain`이다.

## 이번 저장소에 적용하면

- `MUS-146`
  - run-to-issue hygiene
  - owner: `Chief of Staff`
- code regression
  - `Founding Engineer`
- multi-module repair
  - `CTO`
- acceptance verification
  - `QA Lead`

이 구조면 agent를 새로 만들지 않아도 이미 있는 Codex workforce가 self-healing을 담당할 수 있다.

## 결론

지금 필요한 건 "고치는 agent 추가"가 아니다.

필요한 건 "문제를 바로 issue로 만들고, plan 붙이고, owner가 checkout해서 끝까지 닫게 하는 계약"이다.
