# Plan 65 — CEO Operating Model Hardening (2026-04-08)

## 목표

`CEO 2`를 "좋은 지시문을 가진 수동 관리자"가 아니라, `musu-functions` 루트 프로그램을 실제로 굴리는 자율 운영자 상태로 전환한다.

이번 packet의 목표는 세 가지다.

1. CEO 런타임 설정을 핵심 운영 에이전트 수준으로 정상화한다.
2. CEO queue를 blocked board-action 저장소가 아니라 sequencing / governance 책임 큐로 재배치한다.
3. 이 구조를 문서, TODO, live Paperclip issue/plan으로 동일하게 고정한다.

## 현재 truth

기준 시각: `2026-04-08 KST`

- CEO agent: `CEO 2` (`5dffee24-ee3f-4b75-89c8-11608fe7e186`)
- status: `paused`
- `pausedAt`: `2026-04-08T07:30:01.473Z`
- `lastHeartbeatAt`: `2026-04-08T07:03:52.641Z`
- `adapterType=claude_local`, model=`claude-sonnet-4-6`
- `runtimeConfig.heartbeat`는 현재 `intervalSec=1800`만 존재한다.
- `adapterConfig`에는 `cwd`가 없다.
- permissions는 충분하다.
  - `canCreateAgents=true`
  - `canAssignTasks=true`
- instructions bundle은 강하다.
  - active issues 확인
  - error-state agent 확인
  - active issue가 없으면 `TODO_EXECUTION_BOARD.md`를 읽고 새 issue 생성
- 그러나 현재 CEO queue는 blocked tactical/board-action issue가 과다하다.
  - `MUS-1016`
  - `MUS-994`
  - `MUS-995`
  - `MUS-1046`
  - `MUS-1024`
  - `MUS-1015`
- 즉 현재 상태는 `프롬프트/지시문: 충분`, `권한: 충분`, `런타임 설정: 부족`, `작업 큐 설계: 부족`이다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/TODO_EXECUTION_BOARD.md`
- `/home/hugh51/musu-functions/plans/65_ceo_operating_model_hardening_2026-04-08.md`
- `/home/hugh51/.paperclip/instances/default/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/agents/5dffee24-ee3f-4b75-89c8-11608fe7e186/instructions/AGENTS.md`
- live Paperclip company state
  - `GET /api/agents/{agentId}`
  - `GET /api/companies/{companyId}/issues`
  - `POST /api/companies/{companyId}/issues`
  - `PUT /api/issues/{issueId}/documents/plan`

## 범위

- CEO 운영 모델을 root program 선행 과제로 재정의
- CEO 런타임 설정 표준화
- CEO assignment queue 재설계
- 이 변경을 root docs + Paperclip execution objects에 반영

## 제외 범위

- `musu-bee`, `musu-port`, `musu-connects`, `MUSU-CRT`, `MUSU-WORKS`의 직접 구현
- Vercel token, hardware procurement, external credential provisioning 자체 해결
- 이미 열린 보안 reconciliation packet(`MUS-1104`, `MUS-1105`)의 직접 구현

## 구현 작업 목록

1. Master packet 고정
   - root truth를 이 packet 기준으로 재정렬한다.
   - `MASTER_PLAN.md`, `CURRENT_STATE.md`, `TODO_EXECUTION_BOARD.md`에 동일한 우선순위를 반영한다.
2. Packet A — CEO runtime normalization
   - 예상 상세 plan: `66_ceo_runtime_normalization_2026-04-08.md`
   - 목표:
     - CEO `unpause`
     - `adapterConfig.cwd=/home/hugh51/musu-functions` 부여
     - heartbeat config를 다른 핵심 agent 수준으로 맞춘다.
       - `enabled`
       - `wakeOnDemand`
       - `cooldownSec`
       - `maxConcurrentRuns=1`
3. Packet B — CEO queue topology surgery
   - 예상 상세 plan: `67_ceo_queue_topology_surgery_2026-04-08.md`
   - 목표:
     - blocked board-action / credential / hardware issue를 CEO에서 분리
     - CEO는 sequencing, escalation, packet opening, close contract 확인에 집중
     - Chief of Staff / CTO / Founding Engineer ownership을 재배치
4. Packet C — validation and rollout
   - 예상 상세 plan: `68_ceo_validation_and_rollout_2026-04-08.md`
   - 목표:
     - CEO가 실제로 heartbeat 가능한 상태인지 검증
     - queue에 actionable work만 남았는지 검증
     - root board / live issue / issue plan document가 같은 truth인지 검증

## 검증 명령

```bash
curl -sS 'http://127.0.0.1:3100/api/health'
curl -sS 'http://127.0.0.1:3100/api/agents/5dffee24-ee3f-4b75-89c8-11608fe7e186'
curl -sS 'http://127.0.0.1:3100/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/issues?assigneeAgentId=5dffee24-ee3f-4b75-89c8-11608fe7e186&status=todo,in_progress,blocked&limit=50'
curl -sS 'http://127.0.0.1:3100/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/projects'
curl -sS 'http://127.0.0.1:3100/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/goals'
```

## 기대 artifact / evidence

- 새 root detail plan 문서
- 루트 문서 3종의 동기화된 우선순위
- CEO 운영 모델 hardening parent issue
- parent issue의 live `plan` document
- 후속 packet queue와 assignee 설계가 반영된 TODO

## 리스크 / 보류 항목

- CEO runtime mutation API shape가 문서화되어 있지 않을 수 있다.
- 일부 blocked issue는 ownership 이동보다 board human action이 먼저 필요할 수 있다.
- CEO를 너무 빨리 resume하면 다시 blocked queue에 빨려 들어갈 수 있다.
- 따라서 runtime normalization과 queue surgery는 분리 packet으로 진행해야 한다.

## 완료 기준

- root 문서가 모두 CEO operating-model hardening을 최우선 packet으로 가리킨다.
- live Paperclip에 parent issue와 plan document가 생성된다.
- 다음 detailed packet(`66`, `67`, `68`)이 순서와 acceptance를 가진 queue로 고정된다.

## 다음 handoff 또는 TODO 연결

- parent issue 생성 후 Chief of Staff에게 프로그램 운영 ownership을 둔다.
- 다음 실행 packet은 `66_ceo_runtime_normalization_2026-04-08.md` 작성으로 시작한다.
- Packet A가 끝나면 같은 규칙으로 `CURRENT_STATE.md`와 `TODO_EXECUTION_BOARD.md`를 재동기화한다.
