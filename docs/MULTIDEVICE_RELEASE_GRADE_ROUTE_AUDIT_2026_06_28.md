# MUSU Multi-device Release-grade Route Audit (2026-06-28)

## Answer

MUSU is not complete against the full product spec yet.

The two physical machines can currently see each other and can complete a direct
LAN delegated task, but the release-grade multi-device verifier still rejects
the route evidence. The rejection is correct: the current installed bridges are
serving HTTP, not release-grade `quic_tls_1_3`, and the route evidence lacks
verified peer identity material.

## Boundary

- Source machine: `HUGH_SECOND` / `hugh_second`
- Target machine: `hugh-main`
- Package: `1.15.0.22` (`1.15.0-rc.22`)
- Public proof channel: `https://musu.pro/fleet-proof.ps1`
- Local route evidence path:
  `.local-build/multi-device/musu-multidevice-smoke-20260628-192637.json`
- Local route evidence SHA256:
  `A98A398336592FC13164812F787C3080FF17E7D2DB7810C340422128137FB9A2`
- Local route attempt sidecar SHA256:
  `B0D220221CAE5DC1F8A00502A8D9BE906077DD0A9771AB815FBAD8E5C14D6634`

The local `.local-build` evidence files are diagnostic only and are not
committed here because the captured command output contains sensitive-marker
strings. This document records the non-secret result, hashes, and blocker
classification.

## What Passed

The operator-supplied `hugh-main` public proof generated at
`2026-06-27T01:02:01.8191155Z` passed:

- `schema=musu.fleet_node_proof.v1`
- `ok=true`
- `fail_count=0`
- expected node `hugh-main`
- expected direct peer `hugh_second`
- package version `1.15.0.22`
- `online_nodes=2`
- `direct_healthy_nodes=2`
- brain token ACL restricted

A fresh `HUGH_SECOND` route smoke against `hugh-main` also completed the actual
task route:

- remote address `192.168.1.192:4387`
- remote name `hugh-main`
- route kind `lan`
- task output contained `MUSU_REMOTE_ROUTE_OK`
- route result `success`
- `handshake_ms=25`
- `total_attempt_ms=10064`

This proves direct LAN work targetability, not full release-grade multi-device
transport.

## What Failed

`scripts/windows/verify-multidevice-evidence.ps1` rejected the fresh smoke with
`ok=false` and `fail_count=6`.

Failed checks:

- route peer identity verified: `peer_identity_verified=false`
- route peer identity method: missing
- route peer public key: missing
- route encryption hardened: legacy/unproven `none_http_bearer`
- route encryption release-grade: not `quic_tls_1_3`
- route transport proof: missing or not `musu_quic_tls_transport`

Live health probing confirmed the installed bridge transport shape:

- `https://192.168.1.192:4387/health`: TLS connection failed
- `https://127.0.0.1:1695/health`: TLS connection failed
- `http://192.168.1.192:4387/health`: HTTP 200
- `http://127.0.0.1:1695/health`: HTTP 200

## Code Audit

The inspected code is fail-closed and matches the evidence:

- `musu-rs/src/bridge/config.rs` keeps bridge TLS behind `MUSU_TLS`; default is
  off.
- `musu-rs/src/bridge/services.rs` advertises `https://` only when
  `cfg.tls_enabled` is true.
- `musu-rs/src/bridge/mod.rs` can serve TLS when enabled and generated certs are
  available.
- `musu-rs/src/bridge/handlers/forward.rs` records fingerprint-pinned transport
  proof only for HTTPS candidates with advertised fingerprint material.
- `musu-rs/src/bridge/route_evidence.rs` reserves release-grade proof for
  `quic_tls_1_3` verified by `musu_quic_tls_transport`.
- `musu-bee/src/app/fleet-proof.ps1/route.ts` checks package identity, direct
  fleet health, cloud URL usability, and brain token ACL, but it does not prove
  `quic_tls_1_3` delegated-work transport.
- `scripts/windows/verify-multidevice-evidence.ps1` correctly rejects HTTP
  bearer route evidence for release-grade multi-device proof.
- `musu-bee/src/lib/p2pRelayPolicy.ts` and
  `musu-rs/src/bridge/rendezvous.rs` still keep release relay runtime false or
  not implemented, so relay cannot close this lane.

No code regression was found in these inspected surfaces. The problem is an
unfinished release transport path, not a verifier false negative.

## Product Status

| Area | Status | Evidence | Claim Allowed |
|---|---|---|---|
| Public install/proof channel | Pass for rc.22 | `fleet-proof.ps1` on `hugh-main` passed | Installed package and direct fleet health are valid |
| Two-PC direct fleet health | Pass | `online_nodes=2`, `direct_healthy_nodes=2` | The machines see each other directly |
| Direct LAN delegated work | Pass, legacy transport | `MUSU_REMOTE_ROUTE_OK`, route result `success` | Direct work targetability over current LAN path |
| Release-grade multi-device route | No-go | verifier `fail_count=6`; `none_http_bearer`; no peer identity; no `quic_tls_1_3` | Full product multi-device completion cannot be claimed |
| Release relay delegated work | No-go | relay runtime not implemented, storage/live proof missing | Relay cannot be sold as a task transport |

## 2026-06-28 Public Proof Hardening

The public `fleet-proof.ps1` wrapper now separates fleet-health proof from
release-grade delegated-work proof:

- default mode continues to prove install channel, installed package version,
  remote-usable fleet URL, direct-only online count, expected direct peer, and
  brain token ACL.
- `-RequireReleaseGradeRoute` executes `musu route --adapter echo --wait` to the
  expected direct peer and requires `musu.route_evidence.v1` with
  `peer_identity_verified=true`, non-empty `peer_identity_method`, non-empty
  `peer_public_key`, `encryption=quic_tls_1_3`, and
  `transport_verified_by=musu_quic_tls_transport`.
- If the current rc.22 HTTP bearer route is used with
  `-RequireReleaseGradeRoute`, the wrapper should fail. That failure is correct
  and prevents a green fleet-health proof from being mistaken for the full
  product multi-device transport gate.

## Next Steps

1. Decide and implement the actual release-grade direct route transport path:
   either wire the existing bridge route to a `quic_tls_1_3` transport proof or
   intentionally change the product/verifier contract. Do not relax the verifier
   without a product decision.
2. Make the packaged runtime start the chosen hardened transport by default for
   release proof runs; current `fleet-proof.ps1` and `repair-fleet.ps1` stop at
   LAN-usable HTTP.
3. Rebuild/reinstall on both physical machines, rerun the targeted multi-device
   smoke, and require `verify-multidevice-evidence.ps1` to pass with
   `fail_count=0`.
4. Keep relay separate: implement the release relay tunnel runtime, configure
   release-grade KV/Upstash storage, and record live route/transport/delivery
   proof before claiming relay task routing.
5. Rerun `write-release-go-no-go.ps1 -Json` only after committing the accepted
   evidence. Completion remains false until the go/no-go has zero blockers.

## Confidence

- High: two-PC direct fleet health and legacy LAN task routing are working.
- High: release-grade multi-device route proof is not complete.
- High: the verifier rejection is correct for the current evidence.
- Medium: enabling bridge TLS may be useful for an interim hardened path, but it
  is not identical to the current `quic_tls_1_3` release contract.
