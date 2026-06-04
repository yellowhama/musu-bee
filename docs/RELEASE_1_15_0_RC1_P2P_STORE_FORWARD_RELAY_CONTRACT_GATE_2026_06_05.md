# Release 1.15.0-rc.1 P2P Store-Forward Relay Contract Gate

Date: 2026-06-05T03:55+09:00

## Decision

The MUSU.PRO/local-runtime roadmap is now explicit:

- MUSU desktop/runtime is the local execution plane on each device.
- `musu.pro` is the web input, project room, company meeting room, presence,
  rendezvous, path selection, fallback lease, and evidence control plane.
- Web input can order work from elsewhere, but the selected local MUSU program
  executes the work on its own machine.
- After web-assisted rendezvous, devices should use the P2P mesh path order
  `lan`, `tailscale`, `direct_quic`, then `relay`.
- Relay is fallback-only and must not become the default data path.

## Source Gate

Added `scripts/windows/audit-p2p-store-forward-relay-contract.ps1` with schema
`musu.p2p_store_forward_relay_contract.v1`.

The audit verifies that the preview store-forward queue fallback is:

- policy-marked separately from release tunnel payload transport,
- P2P-control-authenticated and owner/lease scoped,
- able to store, claim, deliver, and return delivery proof,
- non-default and non-release-grade,
- drained by Rust only after claim/status/hash/session/target validation,
- default-off and low-duty when target polling is enabled, and
- represented separately in Rust cloud DTOs and P2P status output.

The audit also checks that the missing release-grade tunnel endpoints stay
separate:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- release relay transport still requires the tunnel payload endpoint and
  release-grade route proof

## Release Gate Wiring

`write-release-go-no-go.ps1` now emits:

- `p2p_store_forward_relay_contract_verified`
- `p2p_store_forward_relay_contract_audit`

If the audit fails, go/no-go adds blocker area:

- `p2p-store-forward-relay`

`show-final-release-handoff-status.ps1` now exposes the same gate and provides
the rerun command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json
```

`audit-desktop-release-readiness.ps1` now includes the new audit script in the
release-readiness script inventory.

`verify-single-machine-evidence.ps1` and
`verify-runtime-cpu-scenario-matrix.ps1` also include the new audit plus the
operator API and secret storage audits in their status-only freshness allowlist,
so source/gate-only audit changes do not incorrectly invalidate packaged
runtime evidence.

## Validation

Passed:

- PowerShell parser for:
  - `audit-p2p-store-forward-relay-contract.ps1`
  - `write-release-go-no-go.ps1`
  - `audit-desktop-release-readiness.ps1`
  - `show-final-release-handoff-status.ps1`
  - `verify-single-machine-evidence.ps1`
  - `verify-runtime-cpu-scenario-matrix.ps1`
- P2P store-forward relay contract audit:
  - `ok=true`
  - `fail_count=0`
  - `schema=musu.p2p_store_forward_relay_contract.v1`
- Clean go/no-go summary after commit/amend:
  - `p2p_store_forward_relay_contract_verified=true`
  - `p2p_control_plane_verified=false`
  - `p2p_relay_transport_wired=false`
  - `ready_for_public_desktop_release=false`
  - `single_machine_verified=true`
  - `multi_device_verified=false`
  - `manifest_git.dirty=false`
- Final handoff status:
  - `p2p_store_forward_relay_contract_verified=true`
  - `p2p_control_plane_verified=false`
  - operator step gates do not include `p2p-store-forward-relay`
- P2P env status:
  - `ok=false`
  - `source.relay_payload_queue_fallback_implemented=true`
  - blockers remain:
    - `source_release_relay_connect_endpoint_not_implemented`
    - `source_release_relay_payload_endpoint_not_implemented`
    - `missing_kv_rest_api_url_or_upstash_redis_rest_url`
    - `missing_kv_rest_api_token_or_upstash_redis_rest_token`
    - `live_evidence_p2p_relay_lease_kv_not_configured`
    - `live_evidence_relay_transport_not_wired`
    - `live_evidence_relay_route_not_proven`
    - `live_evidence_relay_payload_delivery_proof_missing`

## Release Implication

This closes the source-contract ambiguity around store-forward queue fallback.
It does not close public release.

Still open:

- production KV/Upstash configuration for `musu.pro`
- release-grade relay connect/payload tunnel endpoints
- live owner-scoped release relay route evidence
- live relay payload transport proof and per-record delivery proof
- current-build second-PC install, route, idle CPU, and CPU matrix evidence
- support mailbox evidence
- Microsoft Store evidence

Current testing remains one-machine only. Another Windows PC must install and
run the current MUSU build before multi-device and P2P release gates can close.
