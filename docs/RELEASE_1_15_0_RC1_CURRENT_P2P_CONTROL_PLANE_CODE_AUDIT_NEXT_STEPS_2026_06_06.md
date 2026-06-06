# MUSU 1.15.0-rc.1 Current Code Audit, Product Spec, and Next Steps

Generated: 2026-06-06 17:50 KST

HEAD: `c879a849f403aadefdd071a012aaa4cd304cbf24`

## Findings

No high or medium code defect was found in the audited source surfaces.

The current public desktop release is still No-Go. The blocker is not the
local packaged desktop runtime, and it is not `localhost:3001`. The remaining
release failures are external proof gaps and one intentionally missing
release-grade relay implementation:

- no successful current two-machine multi-device route evidence
- runtime idle CPU evidence is valid on `1/2` required machines
- runtime CPU scenario matrix evidence is valid on `1/2` required machines
- live `https://musu.pro` P2P control-plane evidence is not verified
- production runtime is not logged in for the latest hosted P2P evidence
- production KV/Upstash relay lease storage env is missing
- release relay payload endpoint remains `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- local release relay tunnel runtime remains `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- relay transport kind remains preview/non-release `websocket_tunnel`, not `quic_relay_tunnel`
- no live owner-scoped relay route transport proof
- no live relay payload delivery proof
- support mailbox and Store/Partner Center evidence are not complete

## Product Spec State

The product boundary is now explicit and should remain the release contract:

1. MUSU Desktop is the local executor on each device.
2. MUSU.PRO is remote input, project/company room coordination, AI meeting
   room state, presence, rendezvous, path selection, relay fallback policy,
   and evidence/control plane.
3. A user may submit work from another place through MUSU.PRO, but actual
   execution remains on the owner-scoped local MUSU runtime.
4. MUSU.PRO may bootstrap device discovery and make peer connection easier,
   then devices should prefer direct P2P mesh paths.
5. Path priority remains `lan -> tailscale -> direct_quic -> relay`.
6. Hosted relay is fallback-only and non-default. It cannot be considered
   release-grade until a real `quic_relay_tunnel` moves payload bytes and emits
   `quic_tls_1_3` relay transport proof plus payload delivery proof.
7. Preview store-forward queue behavior is useful for diagnostics and fallback
   experiments, but it must stay non-release-grade.

## Current Evidence Snapshot

Clean go/no-go at `2026-06-06T17:48:59+09:00` reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `public_metadata_checked=true`
- `public_metadata_ok=true`
- `multi_device_verified=false`
- `manifest_git.commit=c879a849f403aadefdd071a012aaa4cd304cbf24`
- `manifest_git.dirty=false`

Latest local packaged evidence remains valid:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-171011-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-170759-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-171154-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-171403-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted failed HUGH-MAIN route-attempt CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-173706-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The targeted HUGH-MAIN diagnostic is useful but not a successful two-machine
proof. It shows the current packaged desktop remains under resource budget
after a failed route attempt to `http://192.168.1.192:8949/api/tasks/delegate`.

## P2P Control-Plane Status

`show-musu-pro-p2p-env-status.ps1 -Json` at `2026-06-06T17:47:17+09:00`
reported `ok=false`.

Important status fields:

- source relay connect endpoint implemented: `true`
- release payload preflight endpoint implemented: `true`
- store-forward queue endpoint implemented: `true`
- release relay payload endpoint implemented: `false`
- release relay tunnel runtime implemented: `false`
- relay payload queue fallback implemented: `true`
- relay transport kind: `websocket_tunnel`
- required release relay transport kind: `quic_relay_tunnel`
- required transport proof: `quic_tls_1_3`
- GitHub/Vercel storage env missing:
  `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL`,
  `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`
- latest live P2P evidence error class: `p2p_runtime_not_logged_in`
- relay route evidence count: `0`
- relay route transport proof valid count: `0`
- relay payload delivery proof valid count: `0`

This is a correct fail-closed state. It prevents env flags, a websocket
descriptor, or the preview queue from masquerading as release relay transport.

## Validation

Validation passed:

- `npm run test:p2p`: `111/111`
- `npm run typecheck`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- Rust background-loop audit unaudited loop/spawn/network watcher hits: `0`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=66`, `failed_case_count=0`
- `scripts\windows\write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json`
  completed and confirmed clean git, public metadata pass, local artifact pass,
  single-machine pass, and public release No-Go

## Qualitative Evaluation

The current system is in a better shape than the earlier localhost-dashboard
mental model. Packaged MUSU Desktop is validated as a local program with
bridge-only local evidence and WindowsApps identity, and the web dashboard is
not a hidden runtime dependency.

The codebase is deliberately conservative around hosted P2P. That is the
right release posture: the preview store-forward queue can prove metadata flow
and fallback mechanics, but it cannot close the release relay tunnel gate. The
remaining risky area is not a hidden busy loop or local startup defect on
`HUGH_SECOND`; it is the absence of real second-PC proof and the absence of
production release-grade relay tunnel proof.

Qualitative readiness:

- local single-machine desktop/runtime: strong for `HUGH_SECOND`
- idle CPU and runtime matrix: promising, but not release-complete until a
  second machine supplies matching evidence
- MUSU.PRO control-plane direction: correct
- MUSU.PRO release proof: incomplete
- release relay implementation: intentionally not complete
- public desktop release: No-Go

## Next Steps

1. Install the current build on a real second Windows PC and import the return
   archive with strict runtime CPU subrole contracts.
2. Capture successful current-build multi-device route evidence, including
   route explain/path-selection evidence and release-grade transport proof.
3. Capture second-machine `desktop-open` idle CPU and five-scenario runtime CPU
   matrix evidence.
4. Log in the packaged runtime against `https://musu.pro` and rerun hosted P2P
   evidence.
5. Provision KV/Upstash relay lease storage in production and redeploy/reload
   MUSU.PRO.
6. Implement the real `quic_relay_tunnel` runtime and keep
   `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` until payload bytes actually move
   over that tunnel.
7. Implement the distinct release relay payload endpoint and keep
   `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` until it emits release proof.
8. Record owner-scoped relay route evidence with nonzero
   `relay_route_transport_proof_valid_count` and
   `relay_payload_delivery_proof_valid_count`.
9. Verify `musu@musu.pro` mailbox delivery and complete Store/Partner Center
   evidence.
10. Rerun full go/no-go and final operator packet generation only after those
    external gates are complete.

## Canonical References

- `docs\MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md`
- `docs\PRODUCT_CHARTER\NETWORK_BOUNDARY_SPEC.md`
- `docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs\RELEASE_1_15_0_RC1_CURRENT_DESKTOP_CLEAN_START_EVIDENCE_AUDIT_NEXT_STEPS_2026_06_06.md`
- `docs\RELEASE_1_15_0_RC1_CURRENT_TARGETED_SECOND_PC_ROUTE_ATTEMPT_CPU_2026_06_06.md`
