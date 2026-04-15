# CTO Plan-Eng-Review — MUS-1595 (max message size reject)

Date: 2026-04-13 KST
Owner lane: FE (MUS-1527 child)
Status: G1 FAIL pending reproducible runtime evidence and packet isolation

## Scope under review
- Enforce max message-size guard before upstream calls.
- Deterministic reject contract for oversized payloads.
- Boundary tests (at-limit pass / over-limit reject).

## Architecture check

```text
Client POST /api/chat
  -> JSON parse
  -> message type check
  -> max chars check (MUSU_CHAT_MAX_MESSAGE_CHARS)
      -> if over: 413 {error, code, maxChars, actualChars}
  -> rate limit check
  -> musu-port attempt
  -> llm fallback attempt
  -> 502 sanitized backend unavailable
```

Assessment:
- Data flow is structurally correct for fail-fast oversized payload handling.
- Env parsing is deterministic (`Number` -> finite check -> floor -> min 1).

## Failure modes reviewed
- Invalid JSON body: expected stable 400 path (already covered by existing tests).
- Oversized payload: should reject without upstream fetch.
- Missing runtime listener during curl proof: must fail gate until deterministic setup is provided.
- Scope bleed risk: trust-boundary/rate-limit changes in same touched test surface can invalidate packet-local acceptance.

## G1 checklist outcome (current)
1. Architecture soundness: PASS (for max-size guard itself).
2. Code quality and trust boundaries: FAIL (scope-mixed active diff blocks packet-local approval).
3. Test coverage: PASS (target test replay green).
4. Security considerations: FAIL (runtime evidence non-reproducible; cannot attest external behavior).

## Required evidence to re-open G1
1. Deterministic runtime setup command (start service + env) and immediate curl transcript in same execution window.
2. Packet-local diff isolation for MUS-1595 (or explicit reattachment to sibling packet and clean re-request).
3. Replayed proof outputs:
   - `pnpm exec tsx --test src/app/api/chat/route.test.ts`
   - `pnpm exec tsc --noEmit`
   - runtime curl 413 proof with fresh headers/body files.
