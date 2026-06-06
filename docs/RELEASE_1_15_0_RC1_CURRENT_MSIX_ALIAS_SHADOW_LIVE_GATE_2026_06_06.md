# MUSU 1.15.0-rc.1 Current MSIX Alias Shadow Live Gate

**Wiki ID**: wiki/825
**Date**: 2026-06-06

## Summary

`write-release-go-no-go.ps1` now runs the current Windows MSIX legacy-conflict
check instead of trusting only stale install evidence. This closes a real
operator confusion path where Start Menu / MUSU Desktop can run the packaged
runtime while a terminal `musu` command resolves to a developer binary.

On `HUGH_SECOND`, live inspection found:

- `where.exe musu`
  - `C:\Users\empty\.cargo\bin\musu.exe`
  - `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `musu --version`: `musu 1.15.0-dev`
- explicit WindowsApps alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe --version`
  returns `musu 1.15.0-rc.1`
- currently running MUSU processes are packaged:
  - `musu.exe bridge` from
    `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
  - `musu-desktop.exe` from the same package

## Change

Updated `scripts/windows/write-release-go-no-go.ps1`:

- runs `scripts/windows/check-msix-legacy-conflicts.ps1 -Json`
- exposes:
  - `msix_current_legacy_conflicts_ok`
  - `msix_current_legacy_conflicts`
- adds blocker `msix-current-legacy-conflicts` when active startup helpers,
  scheduled tasks, legacy bins, or PATH alias shadowing exist
- adds the live check to the manual internal release gates

Updated `scripts/windows/test-release-evidence-verifiers.ps1`:

- adds source-contract case
  `go-no-go blocks on current MSIX legacy conflicts`

## Current Evidence

Live conflict check:

- `scripts/windows/check-msix-legacy-conflicts.ps1 -Json`
- `ok=false`
- `alias_shadowing_count=1`
- `first_alias_path=C:\Users\empty\.cargo\bin\musu.exe`
- remediation:
  move `C:\Users\empty\AppData\Local\Microsoft\WindowsApps` before the
  shadowing PATH entry, or invoke the packaged app explicitly with the
  WindowsApps alias

Dirty-tree go/no-go summary after the change:

- `ready=false`
- `msix_install_verified=true`
- `msix_current_legacy_conflicts_ok=false`
- `alias_shadowing_count=1`
- new blocker:
  `msix-current-legacy-conflicts`

## CPU Diagnostic

The current `desktop-open` CPU diagnostic did not reproduce the reported
20-percent busy-loop.

Command:

```powershell
.\scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -IncludeNode -IncludeWebView2 -RequireOwnedWebView2 -Json
```

Evidence:

- `.local-build\runtime-idle-cpu\musu-idle-cpu-20260606-112220.json`
- `ok=true`
- `sample_seconds=60.057`
- process counts:
  - `musu=2`
  - `node=0`
  - `webview2=6`
  - `other=0`
- subrole counts:
  - `bridge_runtime=1`
  - `desktop_shell=1`
  - `webview2_helper=6`
- max one-core CPU:
  - MUSU: `0.03`
  - Node: `0.0`
  - WebView2: `0.08`

This is diagnostic evidence only. It was captured while release-gate script
changes were dirty, so it must not be treated as final clean release evidence.

## Validation

Passed:

- PowerShell parser check for changed scripts
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=60`, `failed_case_count=0`
- `scripts/windows/check-msix-legacy-conflicts.ps1 -Json`:
  detects current alias shadowing
- dirty-tree go/no-go summary exposes
  `msix_current_legacy_conflicts_ok=false`
- `scripts/windows/audit-frontend-polling-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts/windows/audit-rust-background-loop-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`

## Qualitative Audit

No high or medium issue was found in the changed code surface.

The issue found was release-gate accuracy: old MSIX install evidence can be
clean while the current machine PATH later starts resolving `musu` to a
developer binary. That is enough to recreate the user's confusion between
MUSU Desktop, local bridge, localhost dashboard, and dev commands.

The product boundary remains:

- MUSU Desktop is the local program and local executor.
- The packaged WindowsApps alias is the release CLI/runtime identity.
- Developer `musu 1.15.0-dev` binaries are diagnostic only.
- MUSU.PRO remains the remote input, room, rendezvous, path-selection, relay
  fallback, and evidence/control plane.
- Localhost dashboard availability is not the product boundary and must not be
  used to prove remote product readiness.

## Remaining Release Blockers

Current release remains No-Go on:

- current alias shadowing on `HUGH_SECOND`
- fresh clean single-machine evidence after this gate change
- two-machine multi-device route evidence
- second-machine idle CPU and runtime CPU matrix evidence
- hosted MUSU.PRO release-grade P2P/relay route proof
- `musu@musu.pro` support mailbox delivery evidence
- Partner Center / Store release evidence

