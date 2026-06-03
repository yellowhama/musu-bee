# 2026-06-04 relay payload atomic KV mutation

Hardened hosted KV/Upstash relay payload queue mutation.

Code:

- KV append now runs through Redis Lua `EVAL`.
- KV claim now runs through Redis Lua `EVAL`.
- KV delivery now runs through Redis Lua `EVAL`.
- KV reads accept both object records and JSON string records.
- `relay_payload_store_release_grade` is true for configured KV/Upstash stores.
- Payload records still remain `release_grade=false` and
  `transport_kind=http_store_forward_preview`.

Tests:

- focused relay payload route tests passed 11/11
- `npm run test:p2p` passed 57/57
- `npm run typecheck` passed

Interpretation:

- This closes the hosted relay payload concurrent claim hardening blocker.
- This is not release-grade relay transport.
- `musu.pro` remains a control plane/fallback coordinator, not the default data
  path.
- Public release still needs QUIC/TLS relay proof, hosted proof evidence, fresh
  packaged evidence, second-PC evidence, support mailbox evidence, and Store
  evidence.
