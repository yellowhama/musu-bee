# Next Steps — Lightweight Control Plane Follow-up (2026-04-09)

## 목적

이번 next step은 “새 기능 추가”가 아니라 아래 3개 acceptance debt를 닫는 것이다.

1. `musu-bee` billing migration closeout
2. chat fallback contract 명문화
3. Paperclip local board recovery runbook

---

## Step 1 — Billing Migration Closeout

### 목표

- Stripe 제거와 Paddle 단일화가 테스트/타입/빌드 기준으로 모두 닫히게 한다.

### 해야 할 일

- stale `.next` generated route/type artifact 정리
- clean `typecheck` replay
- 필요 시 `build` replay
- 남은 Stripe 참조 전수 점검

### 완료 기준

- `npm run test:webhooks` pass
- `npm run typecheck` pass
- deleted Stripe route를 가리키는 generated artifact 없음

---

## Step 2 — Chat Fallback Contract

### 목표

- `musu-port -> raw LLM fallback`이 조용한 hidden behavior가 아니라 명시된 제품 계약이 되게 한다.

### 해야 할 일

- fallback이 켜지는 조건 문서화
- fallback 사용 시 telemetry/trace 규칙 정의
- UI/response surface에 fallback 여부 표시 정책 정의
- 비용/latency/security tradeoff note 추가

### 완료 기준

- fallback semantics가 문서로 고정된다.
- “사용자는 지금 agent path인지 LLM fallback path인지 알 수 있다”가 보장된다.

---

## Step 3 — Paperclip Local Recovery Runbook

### 목표

- 로컬 board가 죽었을 때 누가 봐도 5분 안에 recovery path를 밟을 수 있게 한다.

### 해야 할 일

- `/api/health` 점검 절차
- dev server 재기동 절차
- known failure signature 정리
  - syntax error
  - port/listen failure
  - dev watch zombie
- recovery 후 smoke checks 정의

### 완료 기준

- board failure가 “사람 기억”이 아니라 runbook으로 복구된다.

---

## Suggested Ownership

- `CTO`
  - Step 2 contract 승인
- `Founding Engineer`
  - Step 1 closeout 실행
  - Step 3 local recovery path 정리
- `QA Lead`
  - Step 1 acceptance replay
  - Step 2 fallback-visible behavior 검증
- `Chief of Staff`
  - 각 step을 issue packet으로 분해하고 root board에 연결

---

## Suggested Order

1. Billing migration closeout
2. Paperclip local recovery runbook
3. Chat fallback contract

이 순서가 맞다. 현재 실제 blocking risk는 기능 부족보다 acceptance/recovery debt가 더 크기 때문이다.
