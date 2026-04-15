# MUS-1527 Plan-Eng-Review (CTO)

Date: 2026-04-13
Packet: MUS-1527 (Switch /api/chat to working LLM path + evidence)
Child focus: MUS-1596 (sanitized error body)

## Scope
Review the chat backend failover path, trust-boundary/rate-limit behavior, and deterministic error contract.

## Architecture Path

```
Client /api/chat POST
  -> validate body + size guard + rate limit
  -> try musu-port /chat
     -> optional OpenAI-compatible fallback on 4xx contract mismatches
  -> if failure and budget remains: try MUSU_LLM_URL /v1/chat/completions
  -> on total failure: 502 {error,code} sanitized body
```

## Failure Modes Reviewed
1. Trust boundary spoofing via forwarded headers.
2. Timeout-budget drift causing long tail latency.
3. Upstream/internal leakage in user-facing error body.
4. Client bundle contamination from server-only modules.

## Repro Checks Executed
- `npx --yes tsx --test src/app/api/chat/route.test.ts` -> pass 9/fail 0
- `npm run typecheck` -> success
- Live failing-path replay with unreachable upstreams:
  - valid JSON -> 502 `chat_backend_unavailable`
  - invalid JSON -> 400 `invalid_request_body`
  - leak grep on response bodies -> no matches
- Live success-path replay:
  - `/api/chat` returned HTTP 200 and non-stub text response

## G1 Checklist
1. Architecture soundness: PASS (single budget timeout + explicit fallback chain).
2. Code quality/race/trust boundaries: PASS for packet scope; trust-header behavior covered by tests.
3. Test coverage: PASS (route tests + typecheck + runtime curls).
4. Security: PASS for response sanitization; residual risk remains in server-log redaction policy.

## Gate Position
- Recommend G1 PASS for MUS-1527 and MUS-1596 lane.
- Require QA to keep G2 residual-risk note on log sink ACL/redaction.
