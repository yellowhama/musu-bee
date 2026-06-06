# MUSU 1.15.0-rc.1 Current-HEAD Local Desktop Evidence Refresh

Date: 2026-06-07 05:52 KST

## Summary

Current HEAD `2b9ff2e1415aaf857bae2a1d3a6a9d6d77174b4e` was rechecked on
`HUGH_SECOND` using the installed packaged MUSU Desktop runtime
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.

The local desktop program is working as the release contract expects:

- `localhost:3001` is not the packaged desktop runtime contract.
- MUSU Desktop runs local work through the packaged local bridge at
  `http://127.0.0.1:1158`.
- MUSU.PRO remains the remote input, project/company room, AI meeting room,
  rendezvous, path-selection, relay-fallback, and evidence/control plane.
- Local MUSU programs do the actual execution and should use MUSU.PRO only to
  connect, coordinate, and prove routing/relay behavior.

Public release remains No-Go because the second-PC, hosted P2P/relay, support
mailbox, and Store gates are still open.

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260607-054358-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-054358-HUGH_SECOND.verification.json`
- result: `ok=true`, `fail_count=0`
- surface: `local-bridge-only`
- dashboard required: `false`
- bridge: `http://127.0.0.1:1158`
- CLI route checked: `true`

Process ownership and single-instance evidence:

- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260607-053318-HUGH_SECOND.process-ownership.json`
- startup single-instance:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-053336-HUGH_SECOND.startup-single-instance.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-053413-HUGH_SECOND.desktop-single-instance.json`
- result: packaged runtime `1`, packaged desktop shell `1`, owned Node helpers
  `0`, owned WebView2 helpers `6`, bridge health `HTTP 200`
- repeated `musu.exe` startup reused bridge PID `39876`
- repeated desktop activation reused `musu-desktop` PID `31040`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-053429-HUGH_SECOND.desktop-open.evidence.json`
- result: `ok=true`, `git_dirty=false`, `60.036s`
- hot process count: `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.05`
- working set: `362.33MB`

Five-state runtime CPU matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-053555-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-053555-HUGH_SECOND.verification.json`
- result: `ok=true`, `fail_count=0`, `git_dirty=false`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- successful local post-route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_053555`
- hot process count: `0` in all scenarios
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.13`
- max working set: `363.73MB`

## Go/No-Go

Dirty-tree go/no-go after promoting evidence to docs reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- runtime idle CPU valid machines: `1` (`HUGH_SECOND`)
- runtime CPU matrix valid machines: `1` (`HUGH_SECOND`)
- `multi_device_verified=false`
- `p2p_control_plane_verified=false`
- temporary `git` blocker present until this evidence/doc update is committed

Remaining release blockers:

- real second-PC multi-device evidence
- second machine runtime idle CPU and runtime CPU matrix evidence
- targeted second-PC route-attempt CPU evidence from clean git state
- live hosted MUSU.PRO P2P/relay proof
- production KV/Upstash storage configuration
- production runtime login
- release `quic_relay_tunnel` runtime implementation
- release relay payload endpoint implementation
- relay route metadata/transport proof/payload delivery proof
- `musu@musu.pro` support mailbox delivery evidence
- Partner Center/Store submission, certification, and restricted capability
  evidence

P2P env status remains No-Go with the expected 12 blockers:

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

## Qualitative Audit

No high/medium code issue was found in this pass.

Reasoning:

- This update does not change runtime code.
- Current local packaged runtime evidence proves the reported
  `ERR_CONNECTION_REFUSED` on `localhost:3001` is not a packaged MUSU Desktop
  runtime failure.
- The bridge-only packaged surface is intentional for the local desktop
  program.
- CPU evidence does not reproduce an idle busy-loop on `HUGH_SECOND`.
- The release gate remains correctly fail-closed on 2-machine, hosted
  P2P/relay, support mailbox, and Store proof.

Residual risks:

- The installed package is still one-machine evidence only.
- The dirty targeted `HUGH-MAIN` route-attempt CPU diagnostic captured after
  docs evidence creation is not release evidence and was not promoted.
- Actual `quic_relay_tunnel` payload movement is still not implemented.

## Next Steps

1. Commit this current-head local evidence refresh so the temporary git blocker
   disappears.
2. From a clean tree, rerun targeted `HUGH-MAIN` route-attempt CPU evidence if
   that diagnostic gate must be restored before the second PC is available.
3. Install/run the current MUSU Desktop package on the second machine and
   capture real second-PC smoke, route, idle CPU, and five-state matrix
   evidence.
4. Configure production KV/Upstash storage and runtime login for MUSU.PRO P2P.
5. Implement and prove release `quic_relay_tunnel` runtime and relay payload
   endpoint.
6. Record support mailbox delivery evidence and Store/Partner Center proof.
