# Release 1.15.0-rc.1 Current External Gate Snapshot

Date: 2026-06-06
Branch: `harden-relay-fallback-payload-evidence`
Commit: `0ba26d6d27a23a213240962517079d5fd817c7e8`
Scope: current full go/no-go, live public metadata, second-PC reachability, and
hosted MUSU.PRO P2P control-plane evidence.

## Summary

Current full go/no-go was rerun without `-SkipPublicMetadata`. Live public
metadata passes, current local artifacts remain valid, and public release
remains No-Go only on real external gates:

- real second-PC route evidence
- second-machine runtime idle CPU evidence
- second-machine runtime CPU scenario matrix evidence
- `musu@musu.pro` mailbox delivery verification
- Partner Center / Store release evidence
- hosted MUSU.PRO P2P control-plane release proof

This confirms the current failure is not a `localhost:3001` dashboard issue and
not evidence that MUSU should execute work on the web server.

## Evidence

- external gate evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-151336-HUGH_SECOND.external-gates.evidence.json`
- external gate summary:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-151336-HUGH_SECOND.external-gates.summary.md`
- external evidence SHA256:
  `160909268054b372f173ebc61cad9e6eb0e17107c1643cee08ceeddf416258c1`
- hosted P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-151527-musu.pro.evidence.json`
- hosted P2P summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-151527-musu.pro.summary.md`
- hosted P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-151527-musu.pro.verification.json`

## Current Go/No-Go

Passing gates:

- `public_metadata_ok=true`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_store_forward_relay_contract_verified=true`
- `manifest_git.dirty=false`

Remaining go/no-go blockers:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

Machine counts:

- runtime idle CPU: `1/2`
- runtime CPU scenario matrix: `1/2`
- targeted second-PC route-attempt CPU diagnostic: `1/1`
- hosted relay route transport proof valid count: `0`
- hosted relay payload delivery proof valid count: `0`

## Public Metadata

Public metadata was checked and passed:

- `public_metadata_checked=true`
- `public_metadata_ok=true`
- `/privacy` and `/support` are available on `https://musu.pro`
- `store-public-metadata` is no longer a blocker when public metadata is not
  intentionally skipped

## Second PC

The second-PC probe is still unreachable:

- target: `192.168.1.192:8949`
- ping succeeded: `false`
- TCP succeeded: `false`
- TCP error: `tcp_connect_timeout`

This blocks real multi-device route proof plus the second-machine runtime CPU
gates. The current targeted HUGH-MAIN failed-route CPU diagnostic remains useful
only as proof that a failed route attempt does not create a local CPU busy loop.

## Hosted P2P Control Plane

Hosted P2P evidence was recorded through the packaged WindowsApps alias:

- MUSU exe:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- MUSU exe source: `windowsapps_alias`
- base URL: `https://musu.pro`
- verification: `ok=false`
- verification fail count: `42`

Current hosted P2P facts:

- relay status logged in: `false`
- relay transport logged in: `false`
- relay leases logged in: `false`
- relay route evidence logged in: `false`
- owner scope verified: `false`
- relay lease store configured: `false`
- relay lease store release-grade: `false`
- relay transport descriptor wired: `false`
- relay transport wired: `false`
- relay connect endpoint wired: `false`
- relay payload endpoint wired: `false`
- relay route evidence count: `0`
- relay route transport proof valid count: `0`
- relay payload transport proven: `false`
- relay payload delivery proof valid count: `0`

Current P2P env blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `source_relay_transport_kind_not_release_grade`
- missing KV/Upstash REST URL and token
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

## Validation / Code Audit

Working-tree source-code audit:

- changed code files in this snapshot: none
- `git diff --check`: pass
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regressions: `ok=true`, `case_count=66`,
  `failed_case_count=0`

## Qualitative Evaluation

No high or medium code issue was found in the current release-gate and relay
evidence surface.

What is good:

- local packaged runtime evidence on `HUGH_SECOND` remains healthy
- full go/no-go now verifies live public metadata instead of carrying a skipped
  metadata blocker
- relay proof gates fail closed when release tunnel transport is missing
- preview store-forward queue remains explicitly non-release-grade
- route evidence release grading requires release-grade peer identity

Residual risks:

- release remains one-machine only until the current build runs on a second
  Windows PC
- hosted P2P remains blocked until production runtime login, owner scope, KV /
  Upstash storage, and release relay tunnel proof are present
- support mailbox and Store/Partner Center evidence are still manual external
  proofs

## Product Boundary

The product boundary is unchanged:

- MUSU Desktop is the local executor and resource owner on each device.
- MUSU.PRO accepts remote user input and coordinates project/company rooms,
  presence, rendezvous, path selection, relay fallback, and evidence.
- MUSU.PRO can bootstrap P2P connectivity, but local programs do the work.
- Direct P2P mesh remains preferred after bootstrap.
- Hosted relay is fallback-only and cannot become release-grade until actual
  `quic_relay_tunnel` payload transport plus delivery proof is recorded.

## Next Steps

Detailed next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_EXTERNAL_GATE_SNAPSHOT_2026_06_06.md`

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2662 files`
- `2758 symbols`
- `11836 ms`
