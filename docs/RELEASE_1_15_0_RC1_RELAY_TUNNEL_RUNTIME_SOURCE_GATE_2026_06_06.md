# Release 1.15.0-rc.1 Relay Tunnel Runtime Source Gate

Date: 2026-06-06
Branch: `harden-relay-fallback-payload-evidence`
Scope: hosted P2P relay/tunnel source readiness and fake-release prevention

## Summary

The release relay tunnel runtime is now a distinct source gate:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- API status surfaces expose `relay_tunnel_runtime_implemented=false`
- P2P env status emits
  `source_release_relay_tunnel_runtime_not_implemented`
- `relayTransportWired()` now requires the runtime marker in addition to the
  env flag, release transport kind, and release payload endpoint marker

This prevents a fake public P2P pass where the policy transport kind or env flag
is changed without an actual local runtime that moves payload bytes through a
release `quic_relay_tunnel` and emits `quic_tls_1_3` transport proof.

## Code Changes

Updated:

- `musu-bee/src/lib/p2pRelayPolicy.ts`
- `musu-bee/src/app/api/v1/p2p/relay/lease/route.ts`
- `musu-bee/src/app/api/v1/p2p/relay/transport/route.ts`
- `musu-bee/src/app/api/v1/relay/connect/route.ts`
- `musu-bee/src/app/api/v1/relay/payload/route.ts`
- relay API tests
- `scripts/windows/show-musu-pro-p2p-env-status.ps1`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
- `scripts/windows/test-release-evidence-verifiers.ps1`

## Validation

- P2P tests: `108/108`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

## Qualitative Evaluation

No high or medium issue found.

This is release-gate hardening, not release relay implementation. The current
system still has the preview store-forward queue and proof recorders, but it
does not have the release `quic_relay_tunnel` runtime. Public P2P release still
requires the actual tunnel runtime, release payload endpoint, production
KV/Upstash storage, logged-in hosted evidence, route transport proof, payload
delivery proof, second-PC evidence, support mailbox evidence, and Store evidence.

## Product Boundary

MUSU Desktop remains the local executor. MUSU.PRO remains the remote input,
project/company room, rendezvous, path-selection, relay fallback, and
evidence/control plane. The web server must not become the default payload
execution path.

## Next Steps

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_TUNNEL_RUNTIME_SOURCE_GATE_2026_06_06.md`

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2665 files`
- `2759 symbols`
- `12696 ms`
