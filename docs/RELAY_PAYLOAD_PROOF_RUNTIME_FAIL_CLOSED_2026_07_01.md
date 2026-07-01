# Relay Payload Proof Runtime Fail-Closed - 2026-07-01

## Summary

Code audit found a release-proof contract gap in
`musu-bee/src/app/api/v1/relay/payload/route.ts`: the endpoint could accept
lease-bound release payload proof metadata and return
`release_payload_accepted=true` plus `payload_transported=true` even while
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`.

That did not close the release gate because `relay_transport_wired=false` and
the proof store was still non-release-grade in local tests, but it was still a
bad product contract. Release proof metadata must not outrun the actual local
`quic_relay_tunnel` runtime.

## Change

- `releasePayloadProofAccepted(...)` now fails closed when
  `relayTunnelRuntimeImplemented()` is false.
- A valid release proof request now returns HTTP `409` with
  `error=release_relay_tunnel_runtime_not_implemented`,
  `release_payload_accepted=false`, `payload_transported=false`, and does not
  write to the relay transport proof store.
- The existing accepted path remains present for the future runtime
  implementation, but it is unreachable until the runtime marker is backed by a
  real release relay tunnel byte path.
- `scripts/windows/test-release-evidence-verifiers.ps1` synthetic MSIX install
  evidence now includes the current brain packaging contract:
  `brain_full_trust_process=true`, `brain_executable=musu-brain.exe`, and the
  nested `brain exe` / `installed brain fullTrust process` checks.

## Verification

- `npm exec -- tsx --test src/app/api/v1/relay/payload/route.test.ts`
  passed: `10/10`.
- `npm run test:p2p` passed: `133/133`.
- `npm run typecheck` passed.
- `git diff --check` passed.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` passed:
  `219/219` cases, `failed_case_count=0`.
- `scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json` still reports
  `ok=false` with `source_release_relay_tunnel_runtime_not_implemented`.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3699` files and `3949` symbols.
- `musu-brain.exe ingest` processed 7 changed files: this report, roadmap,
  wiki, wiki index, relay payload route, relay payload route test, and
  `scripts/windows/test-release-evidence-verifiers.ps1`.
- `musu-brain.exe process` reported `processed: 7`.
- Recall check `wiki/1220 relay payload proof runtime fail closed` returned this
  report and the roadmap entry. Recall check `release payload accepted false
  payload transported false relay tunnel runtime` returned this report.

## Product Status

This is release-safety hardening, not relay-transport completion. The product
remains NO-GO on `relay-transport` and `p2p-control-plane` until the local
runtime moves payload bytes through an actual `quic_relay_tunnel` path, emits
MUSU-bound `quic_tls_1_3` transport proof, records payload delivery proof, and
passes live owner-scoped P2P evidence.

## Next Step

Implement the local release relay tunnel runtime behind
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true` only after the code path can prove real
byte transit and bound transport/delivery proof. Do not set the marker for a
preview store-forward queue or metadata-only proof path.
