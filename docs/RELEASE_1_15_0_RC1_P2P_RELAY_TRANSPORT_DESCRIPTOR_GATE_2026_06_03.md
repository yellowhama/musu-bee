# 1.15.0-rc.1 P2P Relay Transport Descriptor Gate

**Wiki ID**: wiki/610
**Date**: 2026-06-03 12:47 KST
**Commit state**: uncommitted source changes during validation

## Summary

The hosted P2P relay gate now has a separate relay transport
descriptor/preflight artifact. This does not implement relay/tunnel payload
transport. It makes that missing data-plane proof explicit and machine
verifiable instead of letting lease-only evidence look close to release-ready.

New server/API surface:

- `GET /api/v1/p2p/relay/transport`
- schema `musu.p2p_relay_transport.v1`
- authenticated with the existing P2P control-plane bearer token contract
- owner-scoped response, without exposing the token-derived owner key
- `relay_default_data_path=false`
- `payload_transit_requires_lease=true`
- release transport requirement `quic_tls_1_3`
- fail-closed blockers for disabled relay, missing transport flag, missing or
  non-`wss://` relay URL, missing Connect/Pro entitlement, and non-release-grade
  relay lease storage

New CLI and evidence surface:

- `musu relay transport --json`
- schema `musu.relay_transport.v1`
- `record-p2p-control-plane-evidence.ps1` now captures `relay_transport`
- `verify-p2p-control-plane-evidence.ps1` now requires the transport descriptor
  in addition to relay status, relay leases, and relay route evidence

## Release Meaning

The P2P control-plane evidence now fails unless all of these are true:

- `relay_status.relay_transport_wired=true`
- `relay_transport.ok=true`
- `relay_transport.relay_transport_descriptor_wired=true`
- `relay_transport.relay_transport_wired=true`
- `relay_transport.relay_url` starts with `wss://`
- `relay_transport.payload_transit_requires_lease=true`
- `relay_transport.relay_default_data_path=false`
- `relay_transport.relay_lease_store_release_grade=true`
- `relay_leases.relay_transport_wired=true`
- `relay_route_evidence.relay_transport_proven=true`
- relay route evidence count is greater than zero

This explicitly keeps `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` from being sufficient.
The release still needs an actual relay route that carried payload and was
stored as owner-scoped release-grade route evidence.

## Existing Live Evidence

Existing live evidence
`docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.evidence.json`
was re-verified with the new verifier and correctly failed:

- `ok=false`
- `fail_count=31`
- `relay_transport_descriptor_wired=false`
- `relay_transport_preflight_ok=false`
- `relay_transport_url=""`
- `relay_lease_store_backend=unconfigured`
- `relay_route_evidence_count=0`
- `relay_payload_transport_proven=false`

No fresh live P2P capture was recorded in this pass because the debug
`cargo build --bin musu` link step was stopped after more than six minutes with
no output. Source compilation was still validated with `cargo check`.

## Post-Deploy Endpoint Probe

After commit `654b9dcb` deployed to Vercel, a direct authenticated request to
`https://musu.pro/api/v1/p2p/relay/transport` confirmed the new endpoint is live
and fails closed:

- schema `musu.p2p_relay_transport.v1`
- `ok=false`
- `owner_scoped=true`
- `relay_transport_descriptor_wired=true`
- `relay_transport_wired=false`
- `relay_default_data_path=false`
- `relay_url=""`
- `relay_lease_store_backend=unconfigured`
- `relay_lease_store_release_grade=false`
- blockers: `relay_disabled`, `relay_transport_not_wired`,
  `relay_url_not_configured`, `connect_pro_entitlement_required`,
  `relay_lease_store_not_configured`, and
  `relay_lease_store_not_release_grade`

This is a live endpoint probe, not a full `musu.p2p_control_plane_live_evidence.v1`
capture.

## Validation

Passed:

- `npm run test:p2p` (`34/34`)
- `npm run typecheck`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- PowerShell parser validation for modified release scripts
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json` (`20/20`)
- `verify-p2p-control-plane-evidence.ps1` re-verification of existing live
  evidence failed closed with `fail_count=31`
- direct post-deploy endpoint probe confirmed
  `relay_transport_descriptor_wired=true` and `ok=false`
- `git diff --check`

Not completed:

- debug `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
  did not finish before it was terminated
- no fresh MSIX/smoke/CPU/matrix evidence was recorded after this source change

## Release Status

Public release remains No-Go. This source change makes the previous primary
evidence stale for a future clean commit until the package is rebuilt and
current-HEAD single-machine, desktop-open CPU, and five-state runtime CPU matrix
evidence are refreshed again. Remaining public blockers still include
second-PC/two-machine CPU evidence, actual hosted P2P relay payload proof,
support mailbox evidence, and Store evidence.
