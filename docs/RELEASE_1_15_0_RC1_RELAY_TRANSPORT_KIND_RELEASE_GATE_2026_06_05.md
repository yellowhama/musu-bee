# MUSU 1.15.0-rc.1 Relay Transport Kind Release Gate

Date: 2026-06-05
Scope: `musu.pro` P2P control-plane and relay fallback release gate

## Context

MUSU Desktop remains the local runtime surface. `musu.pro` is the web control-plane for remote user input, room/presence coordination, rendezvous, route evidence, and relay fallback orchestration. It must not become the default data path or make non-release relay descriptors look release-grade.

The source still intentionally keeps the release relay connect/payload tunnel endpoints disabled:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED = false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED = false`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED = true`
- `RELAY_TRANSPORT_KIND = "websocket_tunnel"`
- `RELEASE_GRADE_TRANSPORT_REQUIRED = "quic_tls_1_3"`

## Change

`relayTransportWired()` now requires all three release conditions:

- `MUSU_P2P_RELAY_TRANSPORT_WIRED` is enabled.
- The configured relay transport kind matches the release requirement.
- The release payload endpoint is wired.

The relay lease and transport preflight paths now expose `relay_transport_kind_not_release_grade` when the current source remains on `websocket_tunnel`.

`show-musu-pro-p2p-env-status.ps1` now reports `source_relay_transport_kind_not_release_grade`, so env flags alone cannot hide the source-level transport gap.

## Verification

Commands run on 2026-06-05:

```powershell
npm run typecheck
npm run test:p2p
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -SkipGithub -Json
git diff --check
```

Results:

- TypeScript typecheck passed.
- P2P route tests passed: 84 passed, 0 failed.
- P2P store-forward relay contract audit passed: `ok=true`, `fail_count=0`.
- Whitespace check passed.
- P2P status remains blocked as expected until a real release-grade relay tunnel exists.

## Current Blockers

The local source has the store-forward relay queue fallback wired, but public P2P release still remains blocked by:

- Release relay connect endpoint not implemented.
- Release relay payload endpoint not implemented.
- `/api/v1/relay/connect` fail-closed placeholder still active.
- Payload endpoint is queue-only and non-release-grade.
- Current relay transport kind is `websocket_tunnel`, not `quic_tls_1_3`.
- Hosted KV/Upstash-backed live evidence and release-grade relay route proof are still missing.
