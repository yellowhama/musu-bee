# MUSU 1.15.0-rc.1 P2P Env Blockers Go/No-Go Surface

**Date**: 2026-06-07 03:32 KST
**Wiki ID**: wiki/915
**Machine**: `HUGH_SECOND`

## Summary

The release go/no-go report now carries the full P2P env status summary and
blocker list from `show-musu-pro-p2p-env-status.ps1`.

Before this change, the public release gate only showed the broad
`p2p-control-plane` blocker. That was technically correct, but it hid the
actionable root cause split:

- source release relay payload endpoint is still not implemented
- source release relay tunnel runtime is still not implemented
- preview store-forward payload queue is intentionally non-release-grade
- source relay transport kind is still not release-grade
- live runtime login/storage/proof evidence is still missing

## Implementation

Updated `scripts\windows\write-release-go-no-go.ps1`:

- invokes `show-musu-pro-p2p-env-status.ps1 -Json`
- passes the selected latest P2P evidence path into the env status reporter
- records `p2p_control_plane_env_ready`
- records `p2p_control_plane_env_blockers`
- records `p2p_control_plane_env_status`
- appends a short `P2P env blockers:` summary to the `p2p-control-plane`
  blocker message
- prints the env readiness and blocker list in non-JSON go/no-go output

Updated `scripts\windows\test-release-evidence-verifiers.ps1`:

- added source-contract regression
  `go-no-go surfaces P2P env status blockers`

## Validation

- PowerShell parser checks passed for `write-release-go-no-go.ps1` and
  `test-release-evidence-verifiers.ps1`.
- `git diff --check` passed.
- Release evidence verifier regression passed with `ok=true`,
  `case_count=96`, and `failed_case_count=0`.
- Dirty-tree go/no-go smoke stayed fail-closed with
  `ready_for_public_desktop_release=false`, `manifest_git.dirty=true`,
  `p2p_control_plane_env_ready=false`, `12` P2P env blockers, and blockers
  `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `support-mailbox`, `store-release`, `p2p-control-plane`, and `git`.
- MUSU local indexer refreshed `2799 files`, `2776 symbols`, in `18256 ms`
  using:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

## Current Live/Source Status

`show-musu-pro-p2p-env-status.ps1 -Json` currently reports `ok=false`.

Important blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `source_relay_transport_kind_not_release_grade`
- missing KV/Upstash URL/token names
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

This confirms the P2P blocker is not just a deployment secret issue. The
release relay tunnel runtime and release payload transport proof are still real
implementation blockers.

## Qualitative Audit

No high or medium issue was found in this scoped status-surface change.

The change does not loosen P2P release criteria. It makes the No-Go reason more
specific while keeping relay proof fail-closed. It also keeps the product
boundary intact: MUSU Desktop remains the local executor; MUSU.PRO remains the
remote input, room, rendezvous, path-selection, relay-fallback, and evidence
control plane.

## Release Status

Public release remains No-Go until:

- real second-PC route/CPU/matrix evidence passes
- hosted MUSU.PRO P2P control-plane evidence verifies owner scope, storage, and
  release-grade relay proof
- release relay tunnel payload transport emits QUIC/TLS proof
- support mailbox evidence passes
- Store/Partner Center evidence passes
