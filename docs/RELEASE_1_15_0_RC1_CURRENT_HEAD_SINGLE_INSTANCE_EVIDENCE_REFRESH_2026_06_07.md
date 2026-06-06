# MUSU 1.15.0-rc.1 Current-HEAD Single-Instance Evidence Refresh

**Date**: 2026-06-07 00:25 KST
**Commit under test**: `4dd6a8445b3a196009eb8dc4f3af6ebc91f04974`
**Machine**: `HUGH_SECOND`

## Summary

The local-sideload MSIX was rebuilt, reinstalled, and verified from current
HEAD. Fresh startup and desktop single-instance evidence now passes the new
current-HEAD freshness gate on the primary machine.

This closes the reopened local startup/desktop single-instance blockers for
`HUGH_SECOND`. It does not close second-PC, runtime CPU 2/2, hosted
MUSU.PRO P2P/relay, support mailbox, or Store evidence gates.

## Current-HEAD MSIX Rebuild And Install

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- Rust release runtime build: pass
- Tauri desktop shell build: pass
- MSIX packaging: pass
- packaged startup smoke: pass
- sideload readiness: pass
- legacy persisted startup conflicts: pass
- install/replace existing package: pass
- installed package contract verification: pass
- packaged runtime identity verification: pass

Package:

- `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- size: `26215018`
- last write: `2026-06-07T00:18:39+09:00`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- explicit WindowsApps alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

Note: the current Codex process PATH still resolves
`C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias. Release
commands in this session must keep using the explicit WindowsApps alias. The
persisted release conflict check remains OK.

## Fresh Evidence

Desktop single-instance:

- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-002403-HUGH_SECOND.desktop-single-instance.json`
- schema: `musu.desktop_single_instance_audit.v1`
- `ok=true`
- `git_commit=4dd6a8445b3a196009eb8dc4f3af6ebc91f04974`
- `git_dirty=false`
- `fail_count=0`
- `before_desktop_shell=1`
- `after_desktop_shell=1`
- `new_desktop_shell=0`
- `activation_failure_count=0`
- AppUserModelId: `Yellowhama.MUSU_ygcjq669as2b6!MUSU`

Startup single-instance:

- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-002452-HUGH_SECOND.startup-single-instance.json`
- schema: `musu.startup_single_instance_audit.v1`
- `ok=true`
- `git_commit=4dd6a8445b3a196009eb8dc4f3af6ebc91f04974`
- `fail_count=0`
- `before_musu_runtime=1`
- `after_musu_runtime=1`
- `observed_bridge_pid_count=1`
- `repeated_spawn_count=0`
- `failed_invocation_count=0`

Nested process ownership:

- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-002452-HUGH_SECOND.startup-single-instance.process-ownership.json`
- schema: `musu.process_ownership_audit.v1`
- `ok=true`
- `git_commit=4dd6a8445b3a196009eb8dc4f3af6ebc91f04974`
- `fail_count=0`

## Go/No-Go Impact

Dirty-tree go/no-go after the evidence refresh:

- `ready=false`
- `dirty=true`
- `blocker_count=8`
- blockers:
  `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `runtime-cpu-second-pc-route-attempt`, `support-mailbox`, `store-release`,
  `p2p-control-plane`, `git`
- `startup_single_instance_verified=true`
- `startup_valid_machine_count=1`
- startup `expected git commit`: `pass`
- `desktop_single_instance_verified=true`
- `desktop_valid_machine_count=1`
- desktop `expected git commit`: `pass`

After commit, the temporary `git` blocker should drop and the release should
remain No-Go on seven external/runtime gates.

## Qualitative Audit

No high or medium issue was found.

The evidence is scoped correctly: it proves the current primary-machine
packaged local program reuses one desktop shell and one bridge/runtime across
repeated activations/startup calls. It does not prove the second machine,
two-machine CPU budgets, real route behavior, or live hosted MUSU.PRO relay
proof.

## Product Spec Update

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, AI meeting room, rendezvous, path-selection, relay
policy, and evidence/control plane.

Single-instance evidence must be captured per installed Windows device. A
MUSU.PRO room or web work-order can coordinate local programs, but it cannot
replace local packaged startup/desktop single-instance proof.
