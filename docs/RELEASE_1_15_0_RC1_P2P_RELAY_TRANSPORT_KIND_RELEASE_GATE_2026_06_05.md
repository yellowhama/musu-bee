# Release 1.15.0-rc.1 P2P Relay Transport Kind Release Gate

Date: 2026-06-05

## Summary

This change tightens the `musu.pro` P2P release evidence gate so the preview
store-forward queue or websocket descriptor cannot be counted as release-grade
relay transport.

2026-06-06 clarification: relay tunnel kind and encryption/proof are separate
release fields. The release relay tunnel kind is `quic_relay_tunnel`;
`quic_tls_1_3` is the release encryption/proof requirement.

The product direction is unchanged: local MUSU programs execute work on each
device, `musu.pro` coordinates input/rendezvous/evidence, direct P2P remains
preferred, and relay is Connect/Pro fallback only after direct paths fail.

## Source Changes

- `routeEvidenceStore.ts` now revalidates release-grade relay query results
  against the relay transport proof kind `quic_relay_tunnel`.
- `verify-p2p-control-plane-evidence.ps1` now requires
  `relay_transport.relay_transport_kind` to match the release relay kind
  `quic_relay_tunnel` and separately requires release encryption/proof
  `quic_tls_1_3`.
- `test-release-evidence-verifiers.ps1` now has a negative fixture:
  `p2p rejects non-release relay transport kind`.
- `audit-p2p-store-forward-relay-contract.ps1` now gates both protections.

## Validation

- PowerShell parser check: pass.
- `npm run test:p2p`: pass, `84/84`.
- `npm run typecheck`: pass.
- `powershell -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json -FailOnProblem`: pass, `ok=true`, `fail_count=0`.
- `powershell -File scripts\windows\test-release-evidence-verifiers.ps1 -Json`: pass, `case_count=42`, `failed_case_count=0`.
- `git diff --check`: pass.

## Live P2P Status

The existing hosted evidence remains No-Go, now with an explicit release-kind
failure:

- evidence path: `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.evidence.json`
- verifier result: `ok=false`, `fail_count=30`
- new relevant failure: `relay transport kind is 'websocket_tunnel', expected release-grade quic_relay_tunnel`

This is expected. It prevents queue/websocket fallback plumbing from being
treated as the release tunnel. Public P2P release still requires production
KV/Upstash, real release connect/payload relay transport, owner-scoped relay
route evidence, and relay payload delivery proof.

## Release Impact

This is server/control-plane evidence hardening only. It does not close
second-PC CPU/matrix evidence, live hosted P2P release proof, support mailbox,
or Store certification gates.
