# MUSU 1.15.0-rc.1 Current-Head Qual Audit, Spec, and Next Steps

**Wiki ID**: wiki/947
**Date**: 2026-06-07 KST
**Commit**: `078ce1c5eeb11edc00aa9a6597e6db1f5b0acc59`

## Summary

Current HEAD is locally healthy on one Windows machine, but it is still a
public-release No-Go.

The latest packaged MUSU Desktop evidence on `HUGH_SECOND` proves the local
program works as the local executor:

- MSIX install evidence is current.
- single-machine smoke passes as `local-bridge-only`.
- process ownership, startup single-instance, and desktop single-instance pass.
- 60s `desktop-open` idle CPU passes with owned WebView2 attribution.
- five-state runtime CPU matrix passes.
- targeted `HUGH-MAIN` route-attempt CPU diagnostic passes with failed route
  output explicitly allowed.

The remaining release blockers are not local dashboard failures. They are
missing physical second-machine proof, hosted MUSU.PRO P2P/relay proof, support
mailbox proof, and Store/Partner Center proof.

## Product Spec Lock

The product boundary is now explicit:

- MUSU Desktop is the local program on each device.
- MUSU Desktop executes local work, owns files/processes/browser/app
  automation, and participates in the P2P mesh.
- MUSU.PRO accepts remote user input, hosts project/company rooms, exposes
  presence/rendezvous/path selection, coordinates relay fallback, and records
  evidence.
- MUSU.PRO does not become the default execution runtime.
- MUSU.PRO does not become the default payload data path.
- After web-assisted rendezvous, devices should try `lan`, `tailscale`,
  `direct_quic`, then relay fallback.
- Relay fallback is allowed only after direct path failure and must be
  lease-bound, owner-scoped, and evidence-backed.
- `localhost:3001` is optional local/developer dashboard behavior. It is not
  the packaged MUSU Desktop runtime contract.

Project rooms on MUSU.PRO are coordination rooms for local MUSU agents working
on the same project. The room can carry user orders, agent presence,
assignments, discussion, decisions, and audit history. The actual shell,
filesystem, browser/app automation, and payload execution remain on each local
MUSU Desktop device unless an explicit relay fallback is issued and proven.

## Current Evidence

Current local evidence carried forward from the latest packaged refresh:

- MSIX install: `20260607-090353-HUGH_SECOND`
- single-machine smoke: `20260607-090436-HUGH_SECOND`
- process ownership: `20260607-090457-HUGH_SECOND`
- startup single-instance: `20260607-090512-HUGH_SECOND`
- desktop single-instance: `20260607-090550-HUGH_SECOND`
- desktop-open idle CPU: `20260607-092453-HUGH_SECOND`
- five-state CPU matrix: `20260607-091438-HUGH_SECOND`
- HUGH-MAIN target-route CPU attempt: `20260607-092030-HUGH_SECOND`

Clean go/no-go interpretation:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_control_plane_env_ready=false`
- `multi_device_verified=false`
- `manifest_git.dirty=false`

## P2P/Relay No-Go State

`show-musu-pro-p2p-env-status.ps1` still reports 12 P2P environment blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `source_relay_transport_kind_not_release_grade`
- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

Important source facts:

- release connect preflight exists and is authenticated.
- release payload preflight exists, is strict metadata-only, and remains
  fail-closed.
- Rust release relay tunnel submit/accept source hooks exist.
- those hooks still return the correct not-implemented state for real payload
  transit.
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` remains correct.
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` remains correct.
- current relay transport kind is `websocket_tunnel`, while release requires
  `quic_relay_tunnel` with `quic_tls_1_3` proof.
- preview store-forward queue remains non-release-grade.

## Code Audit

No high or medium issue was found in this pass.

What was checked:

- P2P/web API contract tests passed: `112/112`.
- TypeScript typecheck passed.
- P2P store-forward relay/source contract audit passed:
  `ok=true`, `fail_count=0`.
- Release evidence verifier regression passed: `ok=True`,
  `case_count=104`, `failed_case_count=0`.
- `git diff --check` passed.

Qualitative assessment:

- The source is conservative in the right places: release markers are still
  false until real `quic_relay_tunnel` payload movement and proof exist.
- The web API surfaces are metadata-only where they should be metadata-only.
- Candidate exchange preserves LAN/Tailscale/public/NAT/relay descriptor data
  for web-assisted P2P bootstrap without turning MUSU.PRO into a data plane.
- Local desktop evidence does not show an idle CPU busy-loop on `HUGH_SECOND`.
- Release state remains blocked for evidence/deployment reasons, not because
  the local desktop program is currently failing on this machine.

Low-severity concerns:

- The current PowerShell session can still resolve the developer
  `C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias. Release
  evidence must keep using explicit WindowsApps alias or a clean PATH.
- The latest operator handoff pack was generated from commit `981f37ac`, while
  current HEAD is `078ce1c5`; regenerate final/operator packs before physical
  second-PC handoff.
- Release relay source hooks are intentionally fail-closed and may look like
  dead code until the real tunnel runtime lands.

## Remaining Blockers

- second-machine `desktop-open` idle CPU evidence
- second-machine five-state runtime CPU matrix
- real second-PC multi-device route evidence
- live MUSU.PRO runtime login
- production KV/Upstash storage
- live owner-scoped route evidence
- release `quic_relay_tunnel` runtime
- release payload endpoint that actually accepts/transports bytes
- relay transport proof and relay payload delivery proof
- support mailbox delivery proof
- Store/Partner Center proof

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_QUAL_AUDIT_2026_06_07.md`

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed files: `2881`
- indexed symbols: `2790`
- duration: `22225 ms`
- wiki: `wiki/948`
