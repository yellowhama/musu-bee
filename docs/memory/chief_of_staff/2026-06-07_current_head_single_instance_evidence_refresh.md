# 2026-06-07 Current-HEAD Single-Instance Evidence Refresh

## Decision

After adding single-instance freshness gates, refresh the primary-machine
startup and desktop single-instance evidence from a current-HEAD local-sideload
MSIX install.

## Change

- Rebuilt and reinstalled local-sideload MSIX from
  `4dd6a8445b3a196009eb8dc4f3af6ebc91f04974`.
- Captured desktop single-instance evidence:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-002403-HUGH_SECOND.desktop-single-instance.json`.
- Captured startup single-instance evidence:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-002452-HUGH_SECOND.startup-single-instance.json`.
- Captured nested process ownership evidence:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-002452-HUGH_SECOND.startup-single-instance.process-ownership.json`.

## Validation

- MSIX workflow: build, package, smoke, install, and installed contract checks
  passed.
- Desktop single-instance: `ok=true`, `git_dirty=false`, shell count stayed
  `1`.
- Startup single-instance: `ok=true`, runtime count stayed `1`, observed bridge
  PID count `1`, repeated spawn count `0`.
- Dirty-tree go/no-go: startup and desktop single-instance verified, blocker
  count `8` with only the temporary `git` blocker added to the remaining
  release blockers.

## Product Spec Update

MUSU Desktop is still the local executor. MUSU.PRO can coordinate remote input
and room/meeting control, but local single-instance safety must be proven on
each installed Windows device.

## Audit Result

No high/medium issue was found. Public release remains No-Go on second-PC
route/CPU/matrix evidence, two-machine CPU counts, hosted MUSU.PRO P2P/relay
proof, support mailbox proof, and Store proof.
