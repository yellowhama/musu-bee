# MUS-1555 CTO Engineering Review (2026-04-12)

## Scope
- Parent issue: MUS-1555 (`CTO: Fallback ship — wire /api/chat to working LLM (Option A)`)
- FE child lane: MUS-1527
- QA child lane: MUS-1558

## Evidence Inputs
- Code:
  - `musu-bee/src/app/api/chat/route.ts`
  - `musu-bee/src/lib/chatRateLimit.ts`
  - `musu-bee/src/app/api/chat/route.test.ts`
- Runtime artifact bundle:
  - `artifacts/mus1527-evidence-2026-04-11/*`
- Reproduced command:
  - `cd musu-bee && npx --yes tsx --test src/app/api/chat/route.test.ts`
  - Result: pass=2, fail=0

## Architecture Snapshot

```text
User UI (useChat.ts)
   |
   | POST /api/chat
   v
Next route: src/app/api/chat/route.ts
   |
   |-- tryMusuPort:       POST {MUSU_PORT_URL}/chat
   |      |-- on 4xx class -> try OpenAI-compatible on same base
   |
   |-- fallback:          GET {MUSU_LLM_URL}/v1/models
   |                      POST {MUSU_LLM_URL}/v1/chat/completions
   v
JSON response {text} or {error}
```

## Failure Mode Analysis
1. Client identity spoof path
- Rate-limit key currently trusts inbound forwarding headers directly.
- Risk: bypassing per-client throttling by rotating fake header values.

2. Timeout stacking / SLO breach
- Current timeout budget is per hop (30s each) with sequential attempts.
- Worst-case can exceed user-visible 30s target.

3. Unbounded input size
- Message body is validated for type/non-empty only.
- Risk: oversized payload forwarding and expensive downstream requests.

4. Error detail reflection
- Upstream/internal error messages are returned to client.
- Risk: internal topology/error signature leakage.

## G1 Gate Decision
- Verdict: `G1: FAIL`
- Blocking criteria before PASS:
  1. Trusted client identity strategy for rate limiting.
  2. Hard max message size + deterministic rejection.
  3. Enforced end-to-end timeout budget aligned with <=30s UX target.
  4. Sanitized user-facing error contract.
  5. New tests for all four constraints.

## Required FE Evidence Bundle (MUS-1527)
- Diff of touched files only.
- Test output (existing + newly added tests).
- One success-path curl transcript.
- One guarded-failure transcript (rate-limit or oversize payload).
- Timeout policy statement with explicit constants and rationale.

## QA G2 Policy (MUS-1558)
- QA may prepare harness now.
- No `G2: PASS` until parent MUS-1555 receives explicit CTO `G1: PASS`.
