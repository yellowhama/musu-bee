# Second-PC MSIX Install Operator Runbook

**Date**: 2026-05-31  
**Release**: `1.15.0-rc.1`  
**Purpose**: record real Windows second-PC MSIX install evidence for MUSU. This closes only the MSIX install evidence gate. It does not by itself close the real multi-device route gate, support mailbox gate, runtime idle CPU gate, or Microsoft Store approval gate. As of the late 2026-05-31 desktop-entrypoint fix, the Store-reviewed artifact launches `musu-desktop.exe`, and local install/runtime evidence should use the fixed `local-sideload-manual` MSIX. Do not use the Store-reviewed restricted-capability MSIX as ordinary sideload evidence unless intentionally testing with `-AllowRestrictedCapabilitySideload`.

## Current Files

Use the latest verified action pack from the release repo:

```text
F:\workspace\musu-bee\.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip
```

Current generated pack at the time of this runbook:

```text
F:\workspace\musu-bee\.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260531-154623.zip
```

## What Not To Do

- Do not copy the whole `F:\workspace\musu-bee` repo to the second PC.
- Do not fabricate, hand-edit, or rename evidence JSON files.
- Do not run the second-PC evidence on the primary PC.
- Do not enable `MUSU_ENABLE_MDNS` for this release check unless a separate mDNS regression run is being tested.
- Do not treat this as public release approval. Public release still needs the remaining external gates.

## Second PC Requirements

- A real second Windows PC.
- PowerShell.
- Ability to run an elevated PowerShell if certificate trust needs `-MachineTrust`.
- No MUSU source repo required.
- No workspace Next dashboard required. The packaged MUSU runtime is the local
  executor; `localhost:3001` is only an optional developer/operator dashboard.

## Step 1 - Copy The Action Pack To The Second PC

Copy this file from the primary release PC to the second PC:

```text
F:\workspace\musu-bee\.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip
```

Put it somewhere simple, for example:

```text
C:\MUSU-second-pc\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip
```

## Step 2 - Extract The Second-PC Kit

Run these commands on the second PC:

```powershell
New-Item -ItemType Directory -Force -Path C:\MUSU-second-pc | Out-Null
cd C:\MUSU-second-pc

Unblock-File .\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip -ErrorAction SilentlyContinue
Expand-Archive .\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip -DestinationPath .\action-pack -Force

cd .\action-pack\second-pc
Expand-Archive .\MUSU-second-PC-transfer-*.zip -DestinationPath .\transfer -Force

cd .\transfer
Expand-Archive .\musu-multidevice-*.zip -DestinationPath .\kit -Force

cd .\kit
```

You should now be in:

```text
C:\MUSU-second-pc\action-pack\second-pc\transfer\kit
```

That folder must contain:

```text
README_MULTI_DEVICE_TEST_KIT.md
.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix
.local-build\msix\output\Yellowhama.MUSU_cert.cer
scripts\windows\run-second-pc-release-check.ps1
scripts\windows\capture-msix-install-evidence.ps1
scripts\windows\collect-second-pc-handoff.ps1
scripts\windows\measure-musu-runtime-cpu-scenarios.ps1
scripts\windows\verify-runtime-cpu-scenario-matrix.ps1
```

## Step 3 - Run The One-Command Second-PC Check

First try normal PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\run-second-pc-release-check.ps1
```

If certificate trust or MSIX install fails, open **PowerShell as Administrator**, go back to the same kit folder, and run:

```powershell
cd C:\MUSU-second-pc\action-pack\second-pc\transfer\kit
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\run-second-pc-release-check.ps1 -MachineTrust
```

The check should use the installed WindowsApps `musu.exe` package. If
`musu up --json` reports `dashboard.required=false`, that is valid for this
release check. Do not start `npm run dev`, `npm start`, or a local
`localhost:3001` dashboard just to satisfy this second-PC evidence run.

## Step 4 - Confirm Success On The Second PC

The run is successful when it creates a return archive:

```text
.local-build\second-pc-return\*.zip
```

It should also create these internal evidence files:

```text
.local-build\msix-install\*.evidence.json
.local-build\runtime-idle-cpu\*.evidence.json
.local-build\runtime-cpu-scenarios\*.runtime-cpu-scenario-matrix.json
.local-build\second-pc-handoff\*.handoff.json
.local-build\second-pc-release-check\*.release-check.json
```

Do not edit these files.

The runtime CPU evidence is part of the public desktop release gate. The
wrapper opens MUSU Desktop and measures 60 seconds of `desktop-open` idle state
with owned WebView2 required. If you are only diagnosing an install issue, you
can run the wrapper with `-SkipRuntimeIdleCpu`, but that skipped run cannot close
the runtime idle CPU gate.

The wrapper also captures a diagnostic CPU scenario matrix for
`startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
`post-route`. In packaged bridge-only runs, `dashboard-open` measures packaged
runtime state when no dashboard URL is exposed. That matrix helps identify
which state causes idle CPU pressure. It is now verified as a separate go/no-go
attribution gate, but it still does not replace the two-machine 60s
`desktop-open` runtime idle CPU evidence.

## Step 5 - Bring The Return ZIP Back To The Primary Repo

Copy only this returned ZIP from the second PC:

```text
C:\MUSU-second-pc\action-pack\second-pc\transfer\kit\.local-build\second-pc-return\*.zip
```

Put it on the primary release PC under:

```text
F:\workspace\musu-bee\.local-build\second-pc-return\
```

Example:

```powershell
New-Item -ItemType Directory -Force -Path F:\workspace\musu-bee\.local-build\second-pc-return | Out-Null
```

## Step 6 - Import And Record The MSIX Install Evidence

Run this on the primary release PC from the repo root:

```powershell
cd F:\workspace\musu-bee
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP_NAME>.zip -RecordMsixInstall -RequireReleaseGateEvidence -Json
```

Expected result:

- the returned MSIX install evidence verifies
- the returned runtime idle CPU evidence is imported under `.local-build\runtime-idle-cpu\`
- the returned runtime CPU scenario matrix is imported under `.local-build\runtime-cpu-scenarios\`
- the import fails if runtime idle CPU, runtime CPU matrix, release-check, or
  process attribution evidence is missing from the return archive
- the MSIX install gate is recorded under `docs\evidence\msix-install\1.15.0-rc.1\`
- the command prints the primary-side multi-device route commands for the next gate

## Step 7 - Check Release Status

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1 -Json
```

After this runbook succeeds, expected state is:

```text
msix_install_verified=true
runtime_idle_cpu_verified=true
multi_device_verified=false
ready_for_public_desktop_release=false
```

That is correct if the primary CPU sample is already present. The next release
gate is the real second-PC multi-device route smoke using the
`suggested_remote_addrs` from the returned handoff.

## Failure Notes

If install fails with certificate trust, rerun from elevated PowerShell using `-MachineTrust`.

If PowerShell blocks scripts, keep using:

```powershell
-ExecutionPolicy Bypass
```

If the return ZIP is missing, check:

```text
.local-build\second-pc-release-check\*.release-check.json
```

If the primary import fails, do not edit evidence manually. Keep the returned ZIP and rerun the importer with the exact path.
