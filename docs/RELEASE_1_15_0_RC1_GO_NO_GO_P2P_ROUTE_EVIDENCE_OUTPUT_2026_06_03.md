# MUSU 1.15.0-rc.1 Go/No-Go P2P Route Evidence Output - 2026-06-03

## Summary

`write-release-go-no-go.ps1` now exposes the hosted P2P relay route evidence
state directly in the release go/no-go result.

The P2P verifier already required release-grade relay route evidence, but the
top-level go/no-go blocker still described only relay lease queries and relay
transport. This pass aligns the go/no-go output with the stricter P2P verifier
contract.

## Changed Behavior

The go/no-go JSON result now includes:

- `p2p_owner_scope_verified`
- `p2p_relay_lease_store_release_grade`
- `p2p_relay_transport_wired`
- `p2p_relay_route_evidence_ok`
- `p2p_relay_route_evidence_count`
- `p2p_relay_payload_transport_proven`

The non-JSON output prints the same fields.

The `p2p-control-plane` blocker now states that live hosted P2P evidence must
verify all of the following:

- owner-scoped release-grade relay lease storage
- `relay_default_data_path=false`
- `relay_transport_wired=true`
- owner-scoped release-grade relay route evidence
- `relay_payload_transport_proven=true`
- relay route evidence `count > 0`

## Current Output

Current dirty-tree go/no-go output after this script change reports:

- `p2p_control_plane_verified=false`
- `p2p_owner_scope_verified=false`
- `p2p_relay_lease_store_release_grade=false`
- `p2p_relay_transport_wired=false`
- `p2p_relay_route_evidence_ok=false`
- `p2p_relay_route_evidence_count=0`
- `p2p_relay_payload_transport_proven=false`

The blocker text now explicitly names release-grade relay route evidence and
payload proof instead of stopping at relay lease/transport readiness.

## Validation

- PowerShell parser passed for `write-release-go-no-go.ps1`.
- `git diff --check` passed.
- JSON go/no-go output includes all new P2P summary fields.
- Non-JSON go/no-go output prints the same P2P summary fields.
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json` passed
  `19/19`.

## Release Interpretation

This is release-gate output hardening. It does not complete hosted P2P.

The live hosted P2P blocker remains unchanged in substance: `musu.pro` still
needs release-grade KV/Upstash-backed owner-scoped relay lease storage, real
relay/tunnel payload transport, and owner-scoped release-grade relay route
evidence proving payload transit.

