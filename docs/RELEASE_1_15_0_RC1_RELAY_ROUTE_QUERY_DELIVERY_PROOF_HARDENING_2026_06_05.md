# Release 1.15.0-rc.1 Relay Route Query Delivery Proof Hardening

Date: 2026-06-05T05:16+09:00

## Decision

Release-grade relay route evidence queries now revalidate the current relay
fallback, transport proof, and payload delivery proof shape before returning
stored records.

This closes a stale-evidence gap: a historical record with
`release_grade=true` and a relay transport proof must not remain visible in
`release_grade=true` queries unless it also proves the current per-payload
delivery proof contract.

## Change

`musu-bee\src\lib\routeEvidenceStore.ts` now requires current relay records to
prove all of the following when `release_grade=true` is queried:

- direct path failed and relay lease was requested/issued
- at least one non-relay route kind was attempted before fallback
- relay payload transport was attempted and proven
- release-grade `musu.relay_transport_proof.v1` is present
- `musu.relay_payload_delivery_proof.v1` is present
- delivery proof matches session, lease, source node, target node, tunnel, byte
  count, payload hash, and delivered timestamp shape

`musu-bee\src\app\api\v1\p2p\route-evidence\route.test.ts` now seeds an old
`release_grade=true` relay record that has transport proof but no delivery
proof and verifies it is excluded from release-grade queries.

`scripts\windows\audit-p2p-store-forward-relay-contract.ps1` now includes this
query revalidation as a release contract check.

## Validation

Validation passed:

- `npm run test:p2p`
  - `tests 79`
  - `pass 79`
  - `fail 0`
- `npm run typecheck`
- PowerShell parser for `audit-p2p-store-forward-relay-contract.ps1`
- `audit-p2p-store-forward-relay-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - new check `release-grade query revalidates relay delivery proof` passed
- `git diff --check`

## Release Implication

This is evidence-chain hardening for the `musu.pro` P2P control plane. It does
not implement release-grade QUIC/TLS relay transport or close the hosted P2P
gate.

Current remaining P2P blockers still include:

- `source_release_relay_connect_endpoint_not_implemented`
- `source_release_relay_payload_endpoint_not_implemented`
- missing KV/Upstash production storage env
- live relay lease evidence not configured
- relay transport not wired
- relay route not proven
- relay payload delivery proof missing in live evidence
