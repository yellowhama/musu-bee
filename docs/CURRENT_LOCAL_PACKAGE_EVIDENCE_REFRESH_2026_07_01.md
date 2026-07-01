# Current Local Package Evidence Refresh (2026-07-01)

## Verdict

MUSU remains **NO-GO** for the full product spec and public desktop release.

This refresh closes the stale local package evidence lanes created by the W6
relay preview contract alignment work. It does not close the remaining
physical, external, Store, design, P2P, relay, or V34 release gates.

Latest clean go/no-go snapshot:

- Source: `.local-build/go-no-go/latest.json`
- Generated: `2026-07-01T03:56:21.0049347+09:00`
- Commit: `b516fae25b0e6b92d7f61992ec3df2562ebcff7e`
- Git dirty: `false`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=0`

The blockers are:

- `multi-device`
- `private-mesh-packaged-release-proof`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `store-public-metadata`
- `store-release`
- `p2p-control-plane`
- `design-approval`
- `relay-transport`
- `v34-stale-self-heal`

## What Changed

No runtime code was changed in this refresh. The work added fresh evidence for
the current commit lineage after `docs: align W6 relay preview contract`.

Evidence commits:

- `9574e11b125847120f409a550ad115560f21edc9`
  `test: refresh local package evidence`
- `b516fae25b0e6b92d7f61992ec3df2562ebcff7e`
  `test: refresh runtime CPU route evidence`

The W6 relay preview contract remains scoped as preview store-forward fallback
only. The successful targeted route probe in this refresh still uses direct LAN
HTTP bearer transport; it is targetability evidence, not release-grade transport
evidence.

## Evidence Recorded

Local package evidence:

- `docs/evidence/single-machine/1.15.0-rc.22/20260701-033720-HUGH_SECOND.evidence.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260701-033720-HUGH_SECOND.verification.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260701-033720-HUGH_SECOND.summary.md`
- `docs/evidence/process-ownership/1.15.0-rc.22/20260701-033657-HUGH_SECOND.process-ownership.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-033657-HUGH_SECOND.startup-single-instance.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-033657-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-033657-HUGH_SECOND.desktop-single-instance.json`

Runtime CPU and targeted route evidence:

- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.startup-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.runtime-started.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.dashboard-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.desktop-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.post-route.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.post-route.route-evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-034606-HUGH_SECOND.target-route.verification.json`

Notable facts from the route sample:

- Target: `hugh-main`
- Selected route: LAN candidate `192.168.1.192:4387`
- Expected token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260701_034606`
- Route kind: `lan`
- Transport: `http`
- Encryption: `none_http_bearer`
- `peer_identity_verified=false`

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product readiness is still false. | Clean go/no-go on `b516fae25b0e6b92d7f61992ec3df2562ebcff7e` reports `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, and `blockers=10`. | Do not claim completion or public desktop readiness. | Close the remaining physical/external/release gates. |
| NO-GO | Runtime CPU release evidence is still one-machine only. | `runtime_cpu_scenario_matrix_valid_machine_count=1`; current passing matrix is on `HUGH_SECOND`. | Local package health is good, but the release gate requires the second physical PC. | Run/import the current second-PC kit on `hugh-main`. |
| NO-GO | Targeted route probe proves direct work targetability, not release-grade route transport. | Route is `lan`, `http`, `none_http_bearer`, and `peer_identity_verified=false`. | It is useful operational evidence but cannot satisfy `multi-device` or `relay-transport`. | Implement/prove identity-bound encrypted transport and direct-blocked relay proof. |
| NO-GO | Public metadata and Store readiness remain external blockers. | `store-public-metadata` and `store-release` remain in go/no-go blockers. | Repo-local evidence cannot close DNS/TLS, Partner Center, or Store-signed install proof. | Repair apex DNS/TLS and complete Store submission/certification evidence. |
| HIGH | Local stale-source evidence invalidations are closed. | `single_machine_verified`, `process_ownership_verified`, `startup_single_instance_verified`, `desktop_single_instance_verified`, and `runtime_cpu_second_pc_route_attempt_verified` are true in the latest gate. | The current package no longer fails for stale local evidence after W6 docs/test changes. | Keep future source/doc changes paired with clean evidence recapture. |
| HIGH | Relay terminology remains correctly fail-closed. | W6 preview uses `http_store_forward_preview`; go/no-go still carries `relay-transport`. | Preview store-forward cannot be mistaken for release relay completion. | Build real `quic_relay_tunnel` release transport before changing product claims. |

## Code Audit

Focused audit scope for this refresh:

- The committed changes in this batch are generated evidence files only.
- No secret/token value was committed.
- The latest go/no-go snapshot is clean at the evidence commit, so the gate is
  not being evaluated over a dirty worktree.
- The verifier behavior is conservative: local package lanes pass, while the
  release blockers remain explicit.
- The route evidence remains honestly labeled as direct LAN HTTP bearer with no
  verified peer identity.

No new release-blocking code regression was found in this refresh. The product
is blocked by missing release evidence or implementation, not by the local
evidence scripts added here.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3578 files` and `3908 symbols`.
- `musu indexer search --query "wiki/1200"` returns `docs/WIKI.md`.
- `musu indexer search --query "CURRENT_LOCAL_PACKAGE_EVIDENCE_REFRESH"`
  returns this report.
- `musu indexer search --query "20260701-034606"` returns the runtime CPU
  matrix evidence and this report.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  posted 3 sources for this report, the wiki entry, and the roadmap snippet.
- `/v1/process` reported `processed=3`, `recovered=0`.
- `/v1/query` for
  `wiki/1200 current local package evidence refresh report` returned 5 results
  with top title `wiki/1200 current local package evidence refresh report`.

## Product Spec Updates

- Current rc.22 `HUGH_SECOND` local package evidence is fresh after the W6 relay
  preview contract alignment.
- Current local single-machine, process ownership, startup single-instance,
  desktop single-instance, and targeted post-route CPU evidence pass.
- Current CPU matrix has one valid machine: `HUGH_SECOND`.
- Current route targetability to `hugh-main` works over direct LAN, but remains
  non-release-grade transport.
- W6 remains preview-only relay fallback. Release relay still requires real
  tunnel transport, route-bound proof, payload delivery proof, and a
  direct-blocked two-PC run.

## Next Steps

1. Run/import the current second-PC kit on `hugh-main` to close the two-machine
   CPU and package proof lanes.
2. Record Private Mesh packaged release proof archive from current two-PC
   packaged evidence.
3. Repair `https://musu.pro` apex DNS/TLS and rerun public metadata verifier.
4. Complete Partner Center/Microsoft Store certification and Store-signed
   install/launch proof.
5. Obtain explicit design approval and update PR #34 with the approval URL.
6. Implement/prove release-grade P2P transport and real relay transport.
7. Run the V34 stale self-heal physical proof flow.
8. Rerun `write-release-go-no-go.ps1 -Json`; only claim completion when it has
   zero blockers and a clean manifest.
