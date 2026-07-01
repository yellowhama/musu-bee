# P2P Store-Forward Relay Audit Coverage Refresh - 2026-07-01

## Summary

Clean go/no-go on commit `58b73147649cb730917e0b3602740d740d4579de`
reported `p2p-store-forward-relay` as a blocker even though the latest source
implementation and route tests were already enforcing the safer relay payload
proof contract.

The root cause was not a runtime relay implementation. It was stale source-audit
coverage in `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`: the
audit still required the old test name
`accepts lease-bound release payload proof metadata without storing raw payload
bytes`, while the product contract now requires fail-closed behavior when
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`.

## Change

`audit-p2p-store-forward-relay-contract.ps1` now requires the current release
payload test contract:

- `rejects lease-bound release payload proof metadata while release tunnel
  runtime is unwired`
- `release_relay_tunnel_runtime_not_implemented`
- `release_payload_proof_ready`
- `assert.equal(proofs.length, 0)`

This keeps the audit strict: the release payload endpoint must reject
metadata-only proof claims while the tunnel runtime is absent and must not write
relay transport proof records in that state.

## Verification

- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json` passed:
  `ok=true`, `fail_count=0`.
- `npm exec -- tsx --test src/app/api/v1/relay/payload/route.test.ts` passed:
  `10/10`.
- `npm run test:p2p` passed: `133/133`.
- `npm run typecheck` passed.
- `git diff --check` passed.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` passed:
  `219/219` cases, `failed_case_count=0`.
- Clean `scripts/windows/write-release-go-no-go.ps1 -ScriptTimeoutSeconds 180
  -Json` on commit `011bf42d95ad24d799332329f15cfcc9a6bd11b4` reports
  `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
  `warnings=0`, and `blockers=10`. `p2p-store-forward-relay` is no longer in
  the blocker list.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3700` files and `3949` symbols.
- `musu-brain.exe ingest/process` processed 5 changed files: this report,
  roadmap, wiki, wiki index, and
  `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`.
- Recall check `wiki/1221 p2p store forward relay audit coverage refresh`
  returned this report, the roadmap entry, and the audit script source.
- Recall check `p2p-store-forward-relay blockers 10 011bf42d` returned the
  blocker-removal context.

## Product Status

This closes the stale source-audit blocker shape for
`p2p-store-forward-relay`. It does not implement the real release relay
transport. The product remains NO-GO until the remaining physical, external, and
runtime gates pass, especially real `quic_relay_tunnel` byte transit with bound
transport and payload-delivery proof.
