# MUSU 1.15.0-rc.1 P2P Relay Transport Gate Hardening

Date: 2026-06-03 08:29 KST

## Summary

The `musu.pro` P2P release gate now rejects lease-only relay evidence.

Before this pass, `verify-p2p-control-plane-evidence.ps1` required live
owner-scoped relay lease storage, but it did not require proof that relay
payload transport was actually wired. That created a false-positive risk: after
KV/Upstash storage was configured, the P2P gate could appear complete while the
relay/tunnel data path was still only a policy/control-plane placeholder.

The verifier now requires both:

- `relay_status.relay_transport_wired=true`
- `relay_leases.relay_transport_wired=true`

`show-musu-pro-p2p-env-status.ps1` also reports the same fields and adds the
blocker `live_evidence_relay_transport_not_wired` when the latest live evidence
does not prove relay payload transport.

## Code Audit

Changed scripts:

- `scripts\windows\verify-p2p-control-plane-evidence.ps1`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`
- `scripts\windows\write-release-go-no-go.ps1`

Audit result:

- lease control-plane proof and payload transport proof are now separate gate
  requirements
- valid synthetic P2P evidence must set relay transport true in both relay
  status and relay lease query output
- a new regression fixture, `p2p-bad-relay-transport`, proves that lease-only
  relay evidence fails
- the hosted environment status report exposes relay transport as a first-class
  blocker instead of burying it inside P2P implementation notes
- the go/no-go blocker text now says live P2P evidence must prove both
  `relay_default_data_path=false` and `relay_transport_wired=true`

This is the correct public-release behavior. `musu.pro` can be the account,
rendezvous, path-selection, and relay lease control plane, but public P2P
readiness must not pass until the payload transport path is implemented and
proven.

## Validation

- PowerShell parser: changed scripts parse
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=18`, `failed_case_count=0`
- live P2P verifier against
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-070018-musu.pro.evidence.json`:
  `ok=false`, `fail_count=8`
- new live P2P verifier failures include:
  `relay status transport wired=false` and
  `relay leases transport wired=false`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`: `ok=false` with
  blockers:
  - `missing_kv_rest_api_url_or_upstash_redis_rest_url`
  - `missing_kv_rest_api_token_or_upstash_redis_rest_token`
  - `live_evidence_p2p_relay_lease_kv_not_configured`
  - `live_evidence_relay_transport_not_wired`
- dirty-tree `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json` at
  2026-06-03 08:28 KST still reports public No-Go
- clean post-commit go/no-go reports
  `manifest_git.dirty=false`, `ready_for_public_desktop_release=false`,
  `local_artifacts_ready=false`, `single_machine_verified=true`,
  `msix_install_verified=true`, `msix_desktop_entrypoint_verified=true`,
  `public_metadata_ok=true`, `p2p_control_plane_verified=false`,
  `p2p_fail_count=8`, and `p2p_relay_transport_wired=false`
- clean blocker list is `runtime-package`, `multi-device`,
  `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`, `support-mailbox`,
  `store-release`, and `p2p-control-plane`

## Qualitative Status

Current completion is better defined, not closer to public release by itself.

What is solid:

- local primary evidence remains good from the latest current-package pass
- desktop-open CPU and runtime matrix are quiet on `HUGH_SECOND`
- `musu.pro` auth and lease endpoint wiring are reachable
- P2P evidence now exposes storage and transport blockers explicitly

What remains open:

- configure production KV/Upstash storage for `musu.pro`
- implement actual relay payload transport before setting
  `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`
- record fresh live P2P evidence where owner scope, release-grade storage,
  `relay_default_data_path=false`, and relay transport all verify
- rerun second-PC route/CPU/matrix evidence
- record `musu@musu.pro` mailbox evidence
- complete Partner Center/Store evidence

This pass closes a release-gate integrity problem: the product can no longer
claim hosted P2P readiness from relay lease storage alone.
