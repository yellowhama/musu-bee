# REPORT — Lightweight Control Plane Follow-up Qualitative Eval & Code Audit (2026-04-09)

## Scope

이번 보고는 아래 범위를 기준으로 작성한다.

- 최신 lightweight control plane planning tranche
  - `plans/83_lightweight_control_plane_execution_master_2026-04-09.md`
  - `plans/84_idle_budget_and_heavy_work_blacklist_2026-04-09.md`
  - `plans/85_event_driven_refresh_and_sampling_2026-04-09.md`
  - `plans/86_core_worker_ui_boundary_enforcement_2026-04-09.md`
  - `plans/87_cto_lcp_approval_2026-04-09.md`
- Paperclip delegation state
  - `MUS-1227`
  - `MUS-1228`
  - `MUS-1229`
- 현재 working tree에서 확인된 active code delta
  - `musu-bee` billing/chat path

---

## Executive Summary

정성 평가 결론은 다음과 같다.

- 방향성은 맞다. MUSU를 “가벼운 control plane”으로 규정한 판단은 현재 제품 포지션과 정확히 맞물린다.
- 이번 tranche는 구현을 밀어붙이지 않고 **budget / blacklist / polling inventory / boundary contract**를 먼저 고정하도록 잘 잘렸다.
- Paperclip 위임 구조도 적절하다. CTO/Founding Engineer/QA Lead/Chief of Staff로 역할을 쪼갠 것은 합리적이다.
- 현재 코드 리스크는 lightweight plan 자체보다 `musu-bee`의 **Stripe → Paddle 전환 중간 상태**와 **stale Next generated types** 쪽에 더 크다.

즉, 계획/운영 면은 전진했고, 코드 면은 billing migration acceptance를 한 번 더 닫아야 한다.

---

## What Changed This Session

### 1. Planning / governance

- lightweight control plane master/detail packet이 루트 계획 체계에 들어갔다.
- CTO approval 문서가 추가됐다.
- Paperclip 루트 프로젝트에 assign-ready issue 3개가 생성됐다.

### 2. Control plane recovery

- 로컬 Paperclip board가 한때 부팅 불능 상태였다.
- 원인은 reference workspace `paperclip-main`의 `heartbeat.ts` 문법 오류 1건이었다.
- 해당 오류를 로컬에서 수정해 board API를 다시 살렸다.

### 3. Index refresh

- code index refreshed:
  - repo id: `local/musu-functions-35ec71f9`
  - result: `2780 symbols`
  - changed: `9`, new: `28`, deleted: `4`
- docs index refreshed:
  - repo id: `local/musu-functions`
  - result: `4057 sections`
  - changed: `9`, new: `120`, deleted: `120`

---

## Validation Run

### Passed

- `cd /home/hugh51/musu-functions/musu-bee && npm run test:webhooks`
  - result: `pass (9/9)`

### Failed

- `cd /home/hugh51/musu-functions/musu-bee && npm run typecheck`
  - result: `fail`
  - failure:
    - `.next/types/validator.ts`가 삭제된 Stripe route를 계속 참조함
    - `../../src/app/api/webhooks/stripe/route.js` not found

이 실패는 현재 판단상 **코드 로직 오류라기보다 generated type artifact stale state**에 가깝다. 다만 acceptance 관점에서는 그대로 두면 안 된다.

---

## Code Audit Findings

### Finding A — Billing migration is logically coherent, but acceptance is not closed

관찰:

- `musu-bee`는 Stripe dependency/route 제거 + Paddle 중심 state model 통합을 진행 중이다.
- `SubscriptionState`가 `customerId / subscriptionId / provider / _processedEventIds` 구조로 정리됐다.
- Paddle webhook tests는 모두 통과했다.

판단:

- 방향은 맞다.
- 하지만 generated artifacts와 route registry까지 같이 닫지 않으면 “테스트는 pass인데 typecheck는 fail” 상태가 남는다.

리스크 수준:

- **medium**

필요 조치:

- stale `.next` types를 재생성하거나 clean build acceptance를 별도 packet으로 닫아야 한다.

### Finding B — Chat fallback improves resilience, but changes product semantics

관찰:

- `musu-bee/src/app/api/chat/route.ts`는 `musu-port` 실패 시 `MUSU_LLM_URL` OpenAI-compatible fallback을 시도한다.
- `useChat.ts`도 WS 부재 시 `/api/chat` HTTP fallback을 수행한다.

장점:

- local control plane이 잠깐 죽어도 UI가 완전히 멈추지 않는다.

리스크:

- fallback이 조용히 LLM endpoint로 넘어가면 비용/응답성/권한/감사 의미가 달라질 수 있다.
- “MUSU agent와 대화 중인지, raw LLM fallback인지”가 사용자에게 충분히 구분되지 않을 수 있다.

리스크 수준:

- **medium**

필요 조치:

- fallback 사용 조건, telemetry, UI surface labeling을 명문화해야 한다.

### Finding C — Paperclip remains an operational dependency for delegation

관찰:

- CEO handoff issue 생성 직전에 로컬 board가 죽어 있었다.
- 원인은 외부 reference workspace source syntax error였다.

판단:

- 제품 코어와는 별개지만, 현재 운영 체계상 Paperclip는 실제 delegation control plane이다.
- 따라서 “board recovery runbook”이 없으면 문서/계획은 있어도 실행 orchestration이 끊긴다.

리스크 수준:

- **medium-high**

필요 조치:

- Paperclip local recovery runbook과 health gate를 루트 운영 문서에 추가해야 한다.

### Finding D — Lightweight control plane tranche itself is well scoped

관찰:

- `plans/83~87`은 구현 금지 / 문서 우선 / 역할 분리 / evidence 요구를 명확히 적었다.

판단:

- 이 tranche는 과하지 않다.
- 오히려 지금 MUSU 단계에서는 가장 맞는 정리 방식이다.

리스크 수준:

- **low**

---

## Qualitative Evaluation

### Strengths

- 제품 철학과 운영 규율이 일치한다.
- “MUSU는 보조 운영층”이라는 원칙이 문서/보드/위임 이슈까지 일관되게 내려갔다.
- CTO approval까지 들어가 있어 delegation quality가 높다.

### Weaknesses

- 실행계 문서는 좋아졌지만, 실제 code acceptance는 `musu-bee` billing migration 때문에 아직 흔들린다.
- generated artifacts cleanup/build hygiene가 루트 관점에서 아직 느슨하다.
- board dependency가 운영적으로 중요해졌는데 recovery discipline 문서가 약하다.

### Overall Score

- 전략/문서/운영 구조: `8.7/10`
- 현재 코드 상태 안정성: `7.0/10`
- 전체 readiness: `7.8/10`

---

## Problems Requiring Explicit Follow-up

1. `musu-bee` billing migration acceptance close
   - stale `.next` route types cleanup
   - clean typecheck/build replay
2. chat fallback semantics spec
   - fallback gate
   - telemetry
   - UI labeling
3. Paperclip board recovery runbook
   - health check
   - restart path
   - failure signatures

---

## Recommended Next Step

다음 tranche는 기능 추가가 아니라 아래 3개를 닫는 문서/실행 패킷이어야 한다.

1. billing migration closeout
2. chat fallback contract
3. Paperclip local board recovery runbook

해당 next-step packet은:

- `/home/hugh51/musu-functions/docs/NEXT_STEPS_2026-04-09_lightweight_control_plane_followup.md`

로 연결한다.
