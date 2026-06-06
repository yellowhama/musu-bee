# MUSU 1.15.0-rc.1 Current HEAD Qualitative Code Audit and Next Steps

Generated: 2026-06-06 18:15 KST

HEAD: `52d325d43b691c6e1b56404e34cfd2ba85257311`

## Executive Finding

No high or medium code defect was found in the audited local-runtime,
control-plane, security, polling, relay, and release-gate surfaces.

The current state is not public-release-ready, but the failure is correctly
classified. The local packaged MUSU Desktop is working as a local program on
`HUGH_SECOND`; the remaining blockers are external proof and intentionally
unimplemented release relay transport gates.

## Product Spec State

The current product boundary is:

1. MUSU Desktop is the local executor and resource owner on each device.
2. MUSU.PRO is remote user input, project/company room, AI meeting room,
   presence, rendezvous, path selection, relay fallback coordination, and
   evidence/control plane.
3. MUSU.PRO may help a user submit work from elsewhere, but the actual work is
   performed by the owner-scoped local MUSU runtime.
4. Device-to-device work should prefer direct P2P after web-assisted bootstrap.
5. Path priority remains `lan -> tailscale -> direct_quic -> relay`.
6. Hosted relay is fallback-only and non-default.
7. The preview store-forward queue is useful for diagnostics and fallback
   experiments, but it is not release-grade relay transport.
8. Release relay proof requires actual `quic_relay_tunnel` payload movement,
   `quic_tls_1_3` transport proof, owner-scoped relay route evidence, and
   relay payload delivery proof.
9. `localhost:3001` is optional developer/operator dashboard behavior, not the
   packaged desktop runtime contract.

This matches the intended "web input, local execution" model.

## Current Audit Results

Validation passed on current HEAD:

- `npm run typecheck`: pass
- `npm run test:p2p`: `111/111`
- local API auth contract: `ok=true`, `fail_count=0`
- operator API security contract: `ok=true`, `fail_count=0`
- secret storage contract: `ok=true`, `fail_count=0`
- frontend polling contract: `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`, no direct interval hits, no
  visibility listener hits outside shared pollers
- Rust background-loop contract: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `unaudited_spawn_hit_count=0`,
  `network_watcher_primitive_hit_count=0`
- P2P store-forward relay contract: `ok=true`, `fail_count=0`
- process ownership audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=true`, `case_count=66`,
  `failed_case_count=0`

Process ownership on `HUGH_SECOND` is healthy:

- packaged desktop active: `true`
- MUSU runtime process count: `1`
- MUSU desktop shell process count: `1`
- owned Node helpers: `0`
- owned WebView2 helpers: `6`
- bridge registry PID belongs to packaged WindowsApps runtime
- bridge health: HTTP `200` at `127.0.0.1:4751`

This supports the conclusion that the current connection-refused
`localhost:3001` symptom is not a packaged desktop failure. The packaged local
bridge is healthy; the workspace dashboard port is separate.

## Release Gate State

`write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json` at
`2026-06-06T18:13:07+09:00` reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `public_metadata_checked=true`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `manifest_git.commit=52d325d43b691c6e1b56404e34cfd2ba85257311`
- `manifest_git.dirty=false`

`audit-desktop-release-readiness.ps1 -Json` reported:

- `runtime_package_ready=true`
- `msix_desktop_entrypoint_ready=true`
- `desktop_shell_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `public_desktop_release_ready=false`
- `fail_count=1`

The sole readiness failure is the missing/failed multi-device proof.

## MUSU.PRO P2P Status

`show-musu-pro-p2p-env-status.ps1 -Json` at
`2026-06-06T18:11:24+09:00` reported `ok=false`.

Important blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `source_relay_transport_kind_not_release_grade`
- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

This is the correct fail-closed posture. It prevents a websocket descriptor,
environment flag, or preview queue from being counted as release relay
transport.

## Qualitative Evaluation

The local packaged desktop path is now materially stronger than the earlier
localhost-dashboard model. MUSU can be treated as a local desktop program with
a packaged bridge and native desktop shell; `localhost:3001` is no longer a
release dependency.

The codebase is conservative in the right places. Auth, owner scope, secret
handling, polling, background loops, process identity, and P2P evidence gates
are all guarded by source audits and tests. The release verifier also rejects
the important false positives: dev-dashboard single-machine evidence,
non-release relay transport kinds, relay route evidence without transport
proof, and relay delivery proof using preview transport.

Residual risk is not hidden local execution behavior on this machine. It is
the missing external proof chain:

- no successful current second-PC route;
- no second-machine CPU/matrix evidence;
- no logged-in live MUSU.PRO runtime evidence;
- no production KV/Upstash relay storage;
- no implemented `quic_relay_tunnel` runtime;
- no release payload endpoint;
- no relay transport proof or payload delivery proof;
- no support mailbox and Store evidence.

Public release should remain No-Go until those are proven.

## Next Steps

1. Install the same current build on a second Windows PC.
2. Capture and import second-PC MSIX, single-machine, idle CPU, runtime matrix,
   route explain, and route evidence using the current return archive flow.
3. Prove a successful current-build route, not only a safe failed route
   attempt to `192.168.1.192:8949`.
4. Log in the packaged runtime with the WindowsApps alias and rerun live
   MUSU.PRO P2P evidence.
5. Configure KV/Upstash storage for production relay lease/proof stores and
   redeploy/reload MUSU.PRO.
6. Implement the local release `quic_relay_tunnel` runtime before setting
   `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true`.
7. Implement the distinct release relay payload endpoint before setting
   `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
8. Record owner-scoped release-grade relay route evidence with
   `relay_route_transport_proof_valid_count > 0` and
   `relay_payload_delivery_proof_valid_count > 0`.
9. Verify `musu@musu.pro` support delivery and complete Store/Partner Center
   evidence.
10. Rerun full go/no-go and regenerate final operator packets only after every
    gate above clears.

## Canonical References

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_GATE_RECHECK_2026_06_06.md`
- `docs\evidence\external-gates\1.15.0-rc.1\20260606-180122-HUGH_SECOND.external-gates.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-180311-musu.pro.evidence.json`
- `docs\MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md`
- `docs\PRODUCT_CHARTER\NETWORK_BOUNDARY_SPEC.md`
- `docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
