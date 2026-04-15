# Paperclip Company Operating Model

## 목적

`musu-functions` 루트 프로젝트를 Paperclip에서 "실제 회사"처럼 돌리기 위한 최소 운영 구조를 고정한다.

이번 정리는 두 가지 문제를 해결하기 위해 만들었다.

1. CEO와 Founding Engineer 두 명만으로는 CEO가 전략, backlog, unblock, lane review, 기술 packet 관리까지 전부 떠안게 된다.
2. stale heartbeat run과 execution lock이 쌓이면 CEO가 root 운영보다 cleanup에 끌려 들어간다.

## 공식 문서 기준

이번 구조는 Paperclip 공식 문서의 아래 원칙을 따른다.

- agent는 단순 스크립트가 아니라 `identity + reporting structure + capabilities + adapter config + budget`를 가진 회사 구성원이다.
- non-CEO agent는 정확히 한 명의 manager에게 보고한다.
- heartbeat는 짧은 실행 창이며, stuck `running` state는 heartbeat-runs를 보고 정리해야 한다.
- process adapter는 absolute instruction path와 reasonable timeout을 쓰는 것이 권장된다.
- Codex adapter는 Paperclip skill을 자동 주입한다.

참고 링크:

- `https://www.mintlify.com/paperclipai/paperclip/concepts/agents`
- `https://docs.paperclip.ing/start/core-concepts`
- `https://www.mintlify.com/paperclipai/paperclip/agents/process-adapter`

## 현재 org chart

- `CEO 2`
  - root goal, org design, strategy, blocker resolution
- `CTO`
  - lane 2 / lane 3 technical ownership
  - manages:
    - `Founding Engineer`
    - `QA Lead`
- `Chief of Staff`
  - root backlog sync
  - stale-run hygiene
  - board-readable resume order

## 역할 규칙

### CEO

- `MUS-25` 같은 root program drive를 소유한다.
- 직접 구현보다 goal quality, org shape, sequencing, escalation을 우선한다.
- 아래 skill을 반드시 상황에 맞게 쓴다.
  - `paperclip-operator`
  - `para-memory-files`
  - `plan-ceo-review`
  - `plan-eng-review`
  - `review`
  - `retro`

### CTO

- lane 2 / lane 3의 acceptance와 다음 engineer packet을 고정한다.
- architecture, proof boundary, QA handoff를 담당한다.
- `Pencil Dev`, `.pen`, desktop shell, MCP-based design artifact가 걸린 packet에서는 아래 skill을 우선 사용한다.
  - `paperclipai/paperclip/pencil-dev-design-workflow`
  - `paperclipai/paperclip/pencil-design`

### Chief of Staff

- 로컬 문서와 live board가 어긋나면 이쪽이 먼저 정렬한다.
- stale execution run, queued run, owner mismatch를 정리한다.
- 디자인 evidence packet(`.pen`, screenshot, Pencil MCP`)을 닫을 때는 아래 skill을 공식 경로로 사용한다.
  - `paperclipai/paperclip/pencil-dev-design-workflow`
  - `paperclipai/paperclip/pencil-design`

### Founding Engineer

- 구현, proof command, integration test, honest escalation을 담당한다.
- unclear architecture는 manager에게 다시 올린다.
- 디자인 handoff가 코드 구현과 연결될 때는 Pencil skill output을 proof artifact로 재사용한다.

### QA Lead

- proof claim과 실제 execution path가 맞는지 본다.
- findings-first 코멘트를 남긴다.

## 런타임 보강 사항

- CEO와 Founding Engineer의 `timeoutSec`를 `1800`으로 고정했다.
- CEO와 Founding Engineer의 `search=true`, `modelReasoningEffort=high`를 반영했다.
- 새 agent 3명도 동일하게 `codex_local + wrapper + high reasoning + timeout` 조합으로 생성했다.
- company-level instruction bundle과 `AGENT_HOME` workspace bundle 양쪽에 `HEARTBEAT.md`, `SOUL.md`, `TOOLS.md`를 채웠다.

## 현재 root issue ownership

- `MUS-25`: CEO
- `MUS-27`: CTO
- `MUS-28`: CTO
- `MUS-29`: Chief of Staff
- `MUS-44`: Chief of Staff packet
- `MUS-45`: QA packet
- `MUS-46`: CTO packet

## 운영 규칙

- CEO는 root goal과 manager tree를 소유하고, lane implementation packet은 manager에게 위임한다.
- manager는 packet을 더 잘게 쪼개서 engineer/qa에 넘긴다.
- QA sign-off 없이 risky packet을 `done`으로 닫지 않는다.
- stale `running` heartbeat는 즉시 확인하고 필요하면 cancel한다.
