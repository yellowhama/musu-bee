# Local Packaged Evidence Refresh (2026-07-01)

## Verdict

This refresh does not make the full product release-ready.

It closes the current local HUGH_SECOND packaged evidence blockers that became
stale after source/tooling changes:

- `single-machine`
- `process-ownership`
- `startup-single-instance`
- `desktop-single-instance`

Clean go/no-go after the refresh reports those four lanes as `true` and reduces
the blocker count from 15 to 11.

## Evidence Recorded

Single-machine packaged smoke:

- Commit: `2d929ec7ef5462ef974378f2afeb0296e3f34233`
- Evidence:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-153838-HUGH_SECOND.evidence.json`
- Verification:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-153838-HUGH_SECOND.verification.json`
- Summary:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-153838-HUGH_SECOND.summary.md`
- Result: packaged WindowsApps runtime, bridge-only local surface
  `http://127.0.0.1:2533`, CLI route checked, developer runtime not allowed.

Process ownership:

- Commit: `2611705c353c9fa7e14fd11fc5fe13f8d7f03f4e`
- Evidence:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260701-154029-HUGH_SECOND.process-ownership.json`
- Result: `ok=true`, `fail_count=0`, one packaged MUSU runtime, one packaged
  desktop shell, zero owned Node helpers, six owned WebView2 helpers, no
  repo-related orphan helpers.

Startup single-instance:

- Commit: `2611705c353c9fa7e14fd11fc5fe13f8d7f03f4e`
- Evidence:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-154046-HUGH_SECOND.startup-single-instance.json`
- Nested process ownership:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-154046-HUGH_SECOND.startup-single-instance.process-ownership.json`
- Result: `ok=true`, `fail_count=0`, three packaged startup invocations reused
  bridge PID `7312`, and no repeated bridge spawn occurred.

Desktop single-instance:

- Commit: `99b656658b6c7da8ec7fcdd10a09548815f883f5`
- Evidence:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-154133-HUGH_SECOND.desktop-single-instance.json`
- Result: `ok=true`, `fail_count=0`, `git_dirty=false`, three Start menu
  activations kept one packaged `musu-desktop.exe` process.

## Current Go/No-Go

Clean go/no-go generated at `2026-07-01T15:43:46.2307186+09:00`:

- `ready_for_public_desktop_release=false`
- `full_product_spec_ready=false`
- `blocker_count=11`
- `single_machine_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`

Remaining blockers:

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

## Qualitative Assessment

The local packaged baseline is healthy on HUGH_SECOND. The installed Store-MSIX
package is running from package identity, the bridge is reachable, startup
invocations are idempotent, desktop activation is single-instance, and process
ownership shows no repo/dev helper leakage into the product runtime.

The product is still not complete because all remaining blockers require either
second physical PC evidence, runtime CPU scenario evidence, Store/DNS external
state, explicit design approval, real relay transport byte transit, or V34
stale self-heal proof.

## Next Steps

1. Capture runtime idle CPU and runtime CPU scenario matrix on the current
   packaged desktop where possible.
2. Use the second PC to refresh `multi-device`, targeted post-route runtime CPU,
   and Private Mesh packaged release proof evidence.
3. Repair `musu.pro` apex DNS/TLS and rerun public metadata verification.
4. Keep `relay-transport` NO-GO until the design gate from wiki/1223 can flip
   `runtime_marker_can_be_flipped=true` with real relay byte transit proof.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3711 files` and `3949 symbols`.
- Product brain ingest under `~/.musu/brain` scope `local/musu` posted `11`
  changed report/wiki/evidence sources and `musu-brain process` reported
  `processed: 11`; a final docs-only refresh posted `4` updated docs and
  processed `4`.
- Recall for
  `wiki/1224 LOCAL_PACKAGED_EVIDENCE_REFRESH blocker_count 11 20260701-154133 desktop_single_instance_verified`
  returned this canonical report and the desktop single-instance evidence in
  the top results.
