# MUSU 1.15.0-rc.1 Desktop Single-Instance Release Gate

**Wiki ID**: wiki/532
**Date**: 2026-06-02
**Scope**: packaged desktop repeated activation audit after the operator observed duplicated `musu-desktop.exe` shells from Start-menu/MSIX launches.

## Verdict

MUSU remains **No-Go for public desktop release**.

The desktop duplicate-launch class is now controlled in two layers:

1. Source hardening: the Tauri shell registers `tauri-plugin-single-instance` and focuses the existing `main` window on repeat activation.
2. Release evidence: `write-release-go-no-go.ps1` now has a separate `desktop_single_instance_verified` gate backed by `musu.desktop_single_instance_audit.v1`.

The important distinction is that the source fix is present, but the currently installed MSIX package on `HUGH_SECOND` is still the old package. It still fails the packaged desktop repeated activation audit and must not be treated as user-ready.

## Evidence

Local reproduction from the installed package:

- AppUserModelId: `Yellowhama.MUSU_ygcjq669as2b6!MUSU`
- Package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Audit script: `scripts\windows\audit-musu-desktop-single-instance.ps1`
- Evidence schema: `musu.desktop_single_instance_audit.v1`
- Latest local evidence: `.local-build\desktop-single-instance\musu-desktop-single-instance-20260602-005439-HUGH_SECOND.json`
- Result: `ok=false`, `fail_count=2`
- Repeated activation count: `3`
- Before: `1` `musu-desktop.exe`
- After repeated activation: `4` `musu-desktop.exe`
- New desktop shells: `3`
- Cleanup: extra shells were stopped and the machine was returned to one desktop shell

Go/no-go integration check:

- `ready_for_public_desktop_release=false`
- `desktop_single_instance_verified=false`
- desktop single-instance candidates: `2`
- valid machines: `0`
- blockers now include `desktop-single-instance`

Final handoff status now also points the operator to:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-desktop-single-instance.ps1 -RequireInstalledPackage -RepeatCount 3 -FailOnProblem -Json
```

## Code Audit

The new audit script resolves the installed AppUserModelId from `Get-AppxPackage`, launches the packaged app through `shell:AppsFolder\<AppUserModelId>`, records before/after `musu-desktop.exe` process snapshots, checks repeated activation count, activation failures, baseline process count, after process count, and new process count, then optionally cleans up duplicate shells.

`write-release-go-no-go.ps1` now verifies desktop single-instance evidence under:

- `docs\evidence\desktop-single-instance\<version>\*.json`
- `.local-build\desktop-single-instance\*.json`

The final operator packet and packet verifier now include the desktop single-instance script, README gate, handoff-status evidence root, and go/no-go stale-packet checks. This prevents an operator packet from claiming startup/process hardening while omitting the actual installed-desktop click path.

## Product Spec Update

Desktop single-instance is now an explicit release contract:

- repeated `musu up --json` must reuse one bridge/runtime owner
- repeated packaged Start-menu/AppsFolder activation must leave at most one `musu-desktop.exe` shell
- desktop CPU evidence must be collected only after duplicate shells are gone
- a source fix is not enough; a fresh MSIX build/install plus repeated-activation evidence is required

## Next Steps

1. Build a fresh MSIX from the current committed source after this gate lands.
2. Install that package on the primary Windows PC.
3. Run `audit-musu-desktop-single-instance.ps1 -RequireInstalledPackage -RepeatCount 3 -FailOnProblem -Json`.
4. If it passes, capture fresh process ownership, primary single-machine smoke, primary `desktop-open` CPU, and primary 4-state CPU matrix evidence.
5. Repeat the installed desktop activation audit and runtime CPU evidence on the second PC.
6. Continue the remaining release blockers: live `musu.pro` P2P control-plane auth, release-grade multi-device route proof, `musu@musu.pro` inbox delivery evidence, and Partner Center/Store evidence.

## Deployment Note

The public-site favicon logo, scroll, and emerald accent changes were already deployed to `https://musu.pro` by commit `0ed3673a`; Vercel production run `26764307713`, GitHub Tests run `26764309477`, E2E run `26764310368`, and production Playwright QA all passed. This desktop single-instance gate is a local/MSIX release artifact issue, not a public website deployment issue.
