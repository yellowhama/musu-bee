# MUSU 1.15.0-rc.1 Current P2P Control-Plane Code Audit and Next Steps

Generated: 2026-06-06 05:00 KST

## Executive Assessment

Current local desktop/runtime evidence is healthy for one machine, but public
desktop release is still No-Go.

The product boundary is correct and should stay explicit:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is remote input, project/company room coordination, rendezvous,
  path selection, relay-fallback policy, and evidence/control coordination.
- MUSU.PRO should help devices find each other and coordinate ownership; after
  that, work should execute locally and prefer direct P2P mesh paths.
- Hosted relay remains fallback-only and non-default until release-grade relay
  tunnel payload transport and proof are implemented.

Qualitatively, the architecture is now safer than the earlier localhost
dashboard assumption: the local program no longer depends on a repo dashboard at
`127.0.0.1:3001`, and packaged bridge-only runtime evidence is accepted only
when it proves installed WindowsApps identity. The weak point is not local CPU
or local desktop startup on HUGH_SECOND. The weak point is missing real
multi-device evidence and missing live `musu.pro` owner-scoped relay proof.

## Current Gate Snapshot

Clean go/no-go on `eb8484ff4ab29a8db6c7f5b5f6841f7e246dd438` with public
metadata skipped reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=false`

Open public-release blockers:

- real second-PC multi-device evidence has not been recorded
- runtime idle CPU evidence must pass on at least 2 machines
- runtime CPU scenario matrix evidence must pass on at least 2 machines
- public privacy/support metadata verification was skipped in this recheck
- `musu@musu.pro` delivery is not operator-verified
- Microsoft Store/Partner Center release evidence is not recorded
- live `https://musu.pro` P2P control-plane evidence does not yet prove
  owner-scoped release-grade relay storage, transport, route evidence, and
  delivery proof

## P2P/MUSU.PRO Status

`show-musu-pro-p2p-env-status.ps1 -Json` currently reports `ok=false`.

Source/runtime interpretation:

- store-forward queue fallback is implemented and audited
- release payload preflight is implemented and fail-closed
- real release relay payload endpoint remains intentionally not implemented
- current relay transport kind is still not release-grade
- live KV/Upstash relay lease storage env is missing
- live relay route proof is missing
- live relay payload delivery proof is missing

This is the correct release posture. It prevents the preview queue or a
websocket descriptor from being mislabeled as release-grade relay transport.

## Code Audit

No high or medium issue was found in the audited surfaces.

Audited high-risk surfaces:

- owner-scoped P2P auth and room/rendezvous state
- relay lease fallback policy
- non-release store-forward payload queue
- release `/api/v1/relay/payload` preflight
- route evidence release-grade filtering
- relay payload target drain and delivery proof recording
- Rust background loop, watcher, and poller contracts
- release evidence verifiers and go/no-go output

Validation passed:

- `npm run test:p2p`: `90/90`
- `npm run typecheck`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`, unaudited loop/spawn/network watcher hits `0`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=51`, `failed_case_count=0`
- `cargo test --lib relay_payload`: `24/24`
- `cargo check --bin musu`
- `git diff --check`

Residual risks are evidence and deployment gaps, not newly found code defects:

- no successful current-build second-PC route evidence
- no second machine idle CPU/matrix evidence
- no production KV/Upstash relay lease proof
- no release-grade relay tunnel payload transport
- no live relay payload delivery proof
- no support mailbox or Store release evidence

## Product Spec Update

The current product spec should be read as:

1. Local program first: each device must run MUSU Desktop/bridge locally and
   execute local work locally.
2. Web input/control plane: MUSU.PRO can accept remote user input and route it
   to the correct owner-scoped local runtime.
3. Meeting room/project room: MUSU.PRO may host project/company room state so
   the AIs attached to the same project can coordinate.
4. Web-assisted P2P bootstrap: MUSU.PRO can exchange presence, NAT/candidate
   metadata, relay fallback descriptors, and route evidence so devices can
   connect more easily.
5. P2P preferred path: after rendezvous/path selection, direct P2P mesh should
   be preferred for actual device-to-device work.
6. Relay fallback: hosted relay is fallback-only, non-default, owner-scoped, and
   release-blocked until release-grade relay tunnel transport and proof exist.
7. Truthful degraded state: web/API surfaces must label missing or stale local
   runtime state as degraded/offline/fallback instead of presenting fake health.

## Next Steps

1. Install this current build on a real second Windows PC.
2. Run the current second-PC release kit and import it with the strict runtime
   CPU subrole contract.
3. Capture successful multi-device direct-route evidence, not only a failed
   HUGH-MAIN route CPU diagnostic.
4. Configure production `musu.pro` P2P control auth plus KV/Upstash relay lease
   storage, deploy/reload, and rerun live P2P control-plane evidence.
5. Decide the release relay tunnel implementation path:
   `quic_relay_tunnel` with `quic_tls_1_3` proof, separate from the preview
   websocket/store-forward queue.
6. Record live owner-scoped relay route evidence with relay payload transport
   proof and per-record `relay_payload_delivery_proof`.
7. Verify `musu@musu.pro`, complete Store/Partner Center evidence, rerun full
   go/no-go without skipping public metadata, and prepare final operator packet.

## Canonical References

- `docs\RELEASE_1_15_0_RC1_POST_DEGRADED_GATE_PRIMARY_EVIDENCE_REFRESH_2026_06_06.md`
- `docs\MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md`
- `docs\PRODUCT_CHARTER\NETWORK_BOUNDARY_SPEC.md`
- `docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
