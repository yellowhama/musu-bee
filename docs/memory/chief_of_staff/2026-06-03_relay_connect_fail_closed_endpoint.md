# 2026-06-03 Relay Connect Fail-Closed Endpoint

`/api/v1/relay/connect` now returns an explicit fail-closed `501` response with
schema `musu.relay_connect_unavailable.v1`. The route keeps
`relay_payload_endpoint_wired=false`, `relay_transport_wired=false`, and
`relay_default_data_path=false`, and it does not emit payload proof.

Validation:

- `npm run test:p2p` passed `37/37`.
- `npm run typecheck` passed.
- `git diff --check` passed.
- Dev HTTP `/app` returned `200`.
- Dev HTTP `/api/v1/relay/connect` returned `501`.

Fresh local P2P control-plane evidence
`.local-build\p2p-control-plane\20260603-193609-musu.pro.evidence.json`
remained `ok=false` with `fail_count=19`; live blockers include missing
KV/Upstash storage, unwired relay transport, unwired relay payload endpoint,
and missing release-grade relay route proof.

This is failure handling only, not relay payload transport implementation.
Public release remains No-Go.
