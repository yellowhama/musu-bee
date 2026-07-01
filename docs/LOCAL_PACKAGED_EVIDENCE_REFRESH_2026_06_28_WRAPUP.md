# Local Packaged Evidence Refresh Wrap-Up (2026-06-28)

## Result

MUSU remains **NO-GO** against the full product spec.

Clean wrap-up go/no-go:

- Source: `.local-build/go-no-go/after-58df8e0b-wrapup-clean.json`
- Generated: `2026-06-28T23:21:19.6978900+09:00`
- Commit: `58df8e0b6d8f8afcc7cdf5fd3baec83a39b3b2c8`
- `manifest_git.dirty=false`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=11`
- `warnings=0`
- Full-product lanes complete: `5/9`
- Full-product incomplete lanes: `design_approval`, `relay_transport`,
  `v34_stale_self_heal`, `store_distribution`

## What Changed

- Updated `musu-bee/src-tauri/musu-brain.pin.json` to the current clean
  `F:\musu_2nd_brain` HEAD
  `63bf5bb9729c96d1c507ba13e7ec1a338cdf2c02`.
- Rebuilt Tauri sidecars; the Musu Brain sidecar build info passed the release
  package check for `musubrain@63bf5bb9729c96d1c507ba13e7ec1a338cdf2c02`.
- Repackaged and reinstalled the local sideload MSIX
  `musu_1.15.0.22_x64_local-sideload-manual.msix`.
- Fixed `repair-packaged-local-runtime-state.ps1` so an empty helper record
  cannot crash orphan-helper cleanup when `-StopRepoOrphanHelpers` is used.
- Repaired the packaged runtime on `HUGH_SECOND`; bridge came up from the
  WindowsApps package at `0.0.0.0:3845` with advertised LAN URL
  `http://192.168.1.154:3845`.

## Evidence Added

- MSIX install:
  `docs/evidence/msix-install/1.15.0-rc.22/20260628-231247-HUGH_SECOND.evidence.json`
- MSIX install verification:
  `docs/evidence/msix-install/1.15.0-rc.22/20260628-231247-HUGH_SECOND.verification.json`
- Single-machine packaged smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-231344-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-231344-HUGH_SECOND.verification.json`
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-231440-HUGH_SECOND.process-ownership.json`
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-231459-HUGH_SECOND.startup-single-instance.json`
- Startup nested process ownership:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-231459-HUGH_SECOND.startup-single-instance.process-ownership.json`
- Desktop repeated activation:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-231520-HUGH_SECOND.desktop-single-instance.json`
- Runtime idle CPU attempt:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-231633-HUGH_SECOND.desktop-open.evidence.json`

## Code Audit

No new release blocker was found in the source touched today.

- Version coherence now correctly fails when the local brain repo moves ahead of
  the pinned sidecar revision. This is strict but desirable for release builds.
- The packaged repair script fix is narrowly scoped to malformed/empty helper
  records. It does not change runtime behavior or cleanup policy; it prevents a
  null helper record from aborting a valid packaged repair run.
- The installed package identity, WindowsApps alias, startup task, Start menu
  entry, process ownership, startup single-instance, desktop single-instance,
  and single-machine route smoke all verified on `HUGH_SECOND`.
- The new idle CPU attempt itself reports `ok=true` and `git_dirty=false`, but
  go/no-go does not count it as a valid runtime-idle machine because it was
  captured without `-RequireOwnedWebView2`, `-IncludeNode`, and
  `-IncludeWebView2`. The stricter gate behavior is correct.
- No attempt was made to overclaim direct HTTP bearer routing as release-grade
  transport. Existing direct route proof still has `encryption=none_http_bearer`
  and `release_grade_transport=false`.

## Remaining Blockers

The clean wrap-up gate reports 11 blockers:

- `multi-device`
- `private-mesh-packaged-release-proof`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `runtime-cpu-second-pc-route-attempt`
- `store-public-metadata`
- `store-release`
- `p2p-control-plane`
- `design-approval`
- `relay-transport`
- `v34-stale-self-heal`

Qualitative assessment: the local packaged install/runtime path is much
healthier than the product as a whole. The remaining release blockers are real
product blockers, not wording problems: second physical machine evidence,
two-machine CPU/matrix evidence, apex DNS/TLS, Store approval, live relay
control-plane/transport proof, explicit design approval, and V34 physical stale
self-heal proof.

## Next

1. Re-run runtime idle CPU with the release-required flags:
   `-RequireOwnedWebView2 -IncludeNode -IncludeWebView2`.
2. Re-run the runtime CPU scenario matrix with
   `-RunRouteProbe -RouteTarget hugh-main -AllowFailedRouteProbe`.
3. Run/import the current second-PC kit on `hugh-main`.
4. Repair apex `musu.pro` DNS/TLS, then rerun public metadata verification.
5. Implement/prove release-grade relay transport instead of HTTP bearer direct
   routing.
6. Record explicit design approval, Store evidence, and V34 physical stale
   self-heal proof.
