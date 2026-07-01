# Local Package Refresh After Brain Pin Update (2026-07-01)

## Summary

This refresh rebuilt and reinstalled the local `1.15.0-rc.22` MSIX after the
brain sidecar pin moved from `eb0c0ec2b83a9226f431012bc8c7b2267a3c0d14` to
`0b47c430e94fa504029c9b754dea70055beeee6e`.

The product remains **NO-GO**. The local package on `HUGH_SECOND` is healthy
again, but the release still lacks two-machine and external release evidence.

## Product Spec Delta

- `musu-bee/src-tauri/musu-brain.pin.json` now pins
  `github.com/yellowhama/musu-brain` at
  `0b47c430e94fa504029c9b754dea70055beeee6e`.
- The pinned brain commit time is `2026-07-01T16:52:30+09:00`.
- `F:\musu_2nd_brain` was clean and matched `origin/main` at that commit.
- The diff from the prior pin `eb0c0ec2b83a9226f431012bc8c7b2267a3c0d14` to
  `0b47c430e94fa504029c9b754dea70055beeee6e` only touched Claude Code hook
  helper files:
  - `clients/claude-code/feed-memory.mjs`
  - `clients/claude-code/install-hooks.sh`
- `build-msix.ps1 -NoBump -PreflightOnly` failed until the pin was updated,
  which proves the brain pin coherence gate is active.
- The package build then succeeded and produced
  `.local-build/msix/output/musu_1.15.0.22_x64_local-sideload-manual.msix`.
- `install-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting`
  installed package
  `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.

## Evidence Captured

Local package evidence on `HUGH_SECOND`:

- MSIX install:
  `docs/evidence/msix-install/1.15.0-rc.22/20260701-182634-HUGH_SECOND.evidence.json`
- brain product proof:
  `docs/evidence/brain-product/1.15.0-rc.22/20260701-183101-HUGH_SECOND.brain-product-proof.json`
- brain product verification:
  `docs/evidence/brain-product/1.15.0-rc.22/20260701-183101-HUGH_SECOND.brain-product-verification.json`
- single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-182634-HUGH_SECOND.evidence.json`
- single-machine verification:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-182634-HUGH_SECOND.verification.json`
- process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260701-182634-HUGH_SECOND.process-ownership.json`
- startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-182634-HUGH_SECOND.startup-single-instance.json`
- startup nested process ownership:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-182634-HUGH_SECOND.startup-single-instance.process-ownership.json`
- desktop single-instance:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-182634-HUGH_SECOND.desktop-single-instance.json`
- desktop-open idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260701-182634-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-183437-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- runtime CPU matrix verification with allowed failed route probe:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-183437-HUGH_SECOND.runtime-cpu-scenario-matrix-verification.json`

## Verification

- `build-msix.ps1 -NoBump -PreflightOnly`: passed after the pin update.
- `build-msix.ps1 -NoBump`: passed; sidecar build info reported
  `github.com/yellowhama/musu-brain@0b47c430e94fa504029c9b754dea70055beeee6e`.
- MSIX install evidence verifier: `ok=true`, `fail_count=0`.
- brain product proof: `ok=true`, `fail_count=0`; product brain root is
  `C:\Users\empty\.musu\brain`.
- single-machine smoke verifier: `ok=true`, `fail_count=0`.
- process ownership audit: `ok=true`, `fail_count=0`.
- startup single-instance audit: `ok=true`, `fail_count=0`.
- desktop single-instance audit: `ok=true`, `fail_count=0`.
- idle CPU evidence was recaptured from a clean git state with both
  `-IncludeNode` and `-IncludeWebView2`; final evidence has `ok=true` and
  `git_dirty=false`.
- runtime CPU matrix was captured from a clean git state; the target-aware
  verifier passed only with `-AllowFailedPostRouteProbe`,
  `-ExpectedPostRouteTarget hugh-main`, `-RejectSelfPostRouteTarget`, and
  `-RejectLocalPostRouteTarget`.
- Clean go/no-go at `2026-07-01T18:49:50.0962676+09:00`:
  - `full_product_spec_ready=false`
  - `ready_for_public_desktop_release=false`
  - `blockers=10`
  - `manifest_git.dirty=false`
  - `brain_product_verified=true`
  - `single_machine_verified=true`
  - `process_ownership_verified=true`
  - `startup_single_instance_verified=true`
  - `desktop_single_instance_verified=true`
  - `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
  - `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1 [HUGH_SECOND]`
  - `runtime_cpu_scenario_matrix_valid_machine_count=0/2`

## Code Audit

| Severity | Finding | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Strict runtime CPU matrix is still not release-grade. | Full go/no-go reports `runtime_cpu_scenario_matrix_valid_machine_count=0/2`; the accepted diagnostic verifier required `-AllowFailedPostRouteProbe`. | Route-attempt CPU is proven, but successful post-route delegated work is not. | Rebuild/install the same source on `hugh-main`, clear stale remote tasks, then capture a successful target-bound post-route matrix on both PCs. |
| NO-GO | Two-machine idle CPU is incomplete. | Full go/no-go reports `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`. | Local CPU is good, but release requires the second physical PC. | Capture/import `hugh-main` desktop-open idle CPU with Node and WebView2 budgets. |
| HIGH | Brain pin coherence gate is doing the right thing. | Preflight failed before the pin update and passed after `musu-brain.pin.json` moved to `0b47c430...`. | Prevents shipping a package with a different external chip than the product manifest claims. | Keep this as a hard preflight gate. |
| HIGH | Hidden brain local product lane is healthy after rebuild. | `20260701-183101-HUGH_SECOND.brain-product-verification.json` passed with real task and capture recall. | The motherboard+chip path is locally proven on the new package. | Recapture the same proof after any source or pin change. |
| MED | The new brain pin is low product-risk but still source-significant. | The brain diff from `eb0c0ec` to `0b47c43` only changed Claude Code hook helper files, not Go runtime code. | The package binary was rebuilt, but no brain serving behavior should have changed from that diff. | Keep the pin/current HEAD relationship documented so future agents do not mistake the failed preflight for a runtime bug. |

## Remaining Blockers

Clean go/no-go still reports these 10 blocker areas:

1. `multi-device`: real second-PC multi-device evidence has not been recorded.
2. `private-mesh-packaged-release-proof`: packaged desktop Private Mesh proof
   archive has not been verified.
3. `runtime-idle-cpu`: only `1/2` required machines pass.
4. `runtime-cpu-scenario-matrix`: strict matrix requires successful post-route
   probe on `2/2` machines.
5. `store-public-metadata`: `https://musu.pro` privacy/support/public config
   metadata is blocked by DNS/TLS mismatch.
6. `store-release`: Partner Center reservation/submission/certification
   evidence is missing.
7. `p2p-control-plane`: live release-grade relay lease, route metadata,
   transport proof, and payload delivery proof are missing.
8. `design-approval`: explicit design approval evidence is still pending.
9. `relay-transport`: real delegated-work relay transport proof is missing.
10. `v34-stale-self-heal`: stale self-heal proof is missing.

## Next Steps

1. Publish or otherwise install the rebuilt current package on `hugh-main`.
2. Restart or clean stale `hugh-main` route task state before the next
   release CPU capture.
3. Capture/import `hugh-main` idle CPU with `-IncludeNode`,
   `-IncludeWebView2`, and `-RequireOwnedWebView2`.
4. Capture a strict successful target-bound runtime CPU matrix on both PCs.
5. Repair `musu.pro` DNS/TLS/public metadata.
6. Record Private Mesh packaged proof, Store release evidence, live P2P
   control-plane proof, real relay transport proof, design approval, and V34
   stale self-heal proof.

## Indexing

This report, the updated spec/wiki files, the brain pin file, and the new
local evidence files should be indexed under both the code index and product
brain after commit.

