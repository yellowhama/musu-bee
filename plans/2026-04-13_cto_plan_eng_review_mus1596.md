# CTO Plan-Eng-Review — MUS-1596 (sanitized error body)

Date: 2026-04-13 KST
Packet: MUS-1596 (child of MUS-1527)
Gate intent: G1 architecture/code/security attestation before QA G2

## Scope
- Ensure user-facing `/api/chat` error responses are deterministic and sanitized.
- Prevent upstream/internal failure details from leaking in response bodies.
- Keep diagnostics server-side only.

## Data flow / failure path

```text
POST /api/chat
  -> parse JSON
    -> invalid JSON => 400 {error:"invalid request body", code:"invalid_request_body"}
  -> validate message + guards
  -> try musu-port
  -> try llm fallback
  -> both fail => 502 {error:"chat backend unavailable", code:"chat_backend_unavailable"}
  -> detailed failure context only in server logs
```

## Failure mode review
- Upstream fetch failures: client contract remains sanitized 502.
- Parser exceptions: stable 400 contract, no parser internals in response body.
- Leak vectors in body: checked for `traceback|internal|fetch failed|musu-port|127.0.0.1:1|secret-token` -> none in 502/400 bodies.
- Operational caveat: sensitive detail can still exist in server logs; must be controlled by log sink ACL/redaction policy.

## Evidence replay (CTO)
1) `npx --yes tsx --test src/app/api/chat/route.test.ts` -> pass 9, fail 0.
2) `npm run typecheck` -> `tsc --noEmit` exit 0.
3) Live runtime replay with dead upstreams:
   - `MUSU_PORT_URL=http://127.0.0.1:1 MUSU_LLM_URL=http://127.0.0.1:1 npm run dev -- --port 43003`
   - valid message -> `HTTP/1.1 502` body `{"error":"chat backend unavailable","code":"chat_backend_unavailable"}`
   - invalid JSON -> `HTTP/1.1 400` body `{"error":"invalid request body","code":"invalid_request_body"}`

## G1 verdict input
1) Architecture soundness: PASS.
2) Code quality/trust boundaries: PASS for sanitized client boundary.
3) Coverage: PASS (targeted route tests cover leak checks and bad JSON path).
4) Security considerations: PASS with explicit residual ops risk on log sinks.
