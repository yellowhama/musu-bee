# MUSU MSIX Desktop Entrypoint Audit

**Wiki ID**: wiki/526
**Date**: 2026-05-31
**Scope**: why `desktop-open -RequireOwnedWebView2` evidence failed after Store/MSIX activation, and what must change before Microsoft Store submission.

## Verdict

The current `1.15.0.0` MSIX artifacts are **runtime-only packages**, not the public Tauri/WebView2 desktop app package.

This explains the previous CPU evidence failure: after MSIX activation, no MUSU-owned WebView2 process appeared because the installed package launches `musu.exe`, not `musu-desktop.exe`.

Current decision: **do not submit the current Store-reviewed MSIX to Partner Center as the public MUSU Desktop app**. It can remain useful as a runtime/install diagnostic artifact, but it does not satisfy the Store desktop product promise.

## Evidence

Recorded evidence:

- `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-214327-HUGH_SECOND.store-msix-runtime-only.evidence.json`

Installed package:

- `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Observed manifest facts:

- Application executable: `musu.exe`
- Expected desktop executable: `musu-desktop.exe`
- Package contains `musu.exe`: yes
- Package contains `musu-startup.exe`: yes
- Package contains `musu-desktop.exe`: no
- Description: `MUSU packaged CLI and bridge runtime`
- Start-menu app id: `Yellowhama.MUSU_ygcjq669as2b6!MUSU`

The Tauri desktop binary exists separately at:

- `musu-bee\src-tauri\target\release\musu-desktop.exe`

But it is not inside the current MSIX.

## Product Spec Lock

The public Store package must be a desktop app package:

- Start-menu activation launches `musu-desktop.exe`.
- The package still includes `musu.exe` for the CLI/WindowsApps alias.
- The package still includes `musu-startup.exe` for the startup task.
- The package description must describe MUSU Desktop, not only a packaged CLI/bridge runtime.
- `desktop-open` runtime CPU evidence must show at least one MUSU-owned WebView2 process.

The old runtime-only MSIX cannot close:

- `msix_desktop_entrypoint_verified`
- `runtime_idle_cpu_verified` for `desktop-open -RequireOwnedWebView2`
- public Store submission readiness

## Code Audit Changes

New gate:

- `scripts\windows\audit-msix-desktop-entrypoint.ps1`

The audit checks the MSIX artifact and, when requested, the installed package:

- application executable
- package contents
- CLI alias executable
- startup task executable
- package description
- installed manifest and Start-menu entry

Release tooling now fails closed:

- `audit-desktop-release-readiness.ps1` reports `msix_desktop_entrypoint_ready=false` when the MSIX launches `musu.exe`.
- `write-release-go-no-go.ps1` reports `msix_desktop_entrypoint_verified=false` and adds a blocker.
- `verify-store-submission-bundle.ps1` rejects Store bundles whose MSIX does not launch the desktop shell.
- final operator packet/status scripts now include the MSIX desktop entrypoint gate.

Current go/no-go truth:

- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=false`
- `runtime_idle_cpu_verified=false`
- `multi_device_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`

## Next Steps

1. Build a real Store/MSIX desktop package that stages `musu-desktop.exe` as the `<Application Executable=...>` value.
2. Keep `musu.exe` as the `appExecutionAlias` and `musu-startup.exe` as the startup task.
3. Include all Tauri/WebView2 runtime resources needed by the desktop shell; copying only the EXE may not be enough.
4. Rebuild both local-sideload and Store-reviewed MSIX artifacts.
5. Reinstall on the primary PC and second PC.
6. Run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-msix-desktop-entrypoint.ps1 -StartupContract store-reviewed-immediate-registration -ExpectedApplicationExecutable musu-desktop.exe -RequireInstalledPackage -Json
   ```
7. Only after that passes, rerun:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json
   ```
8. Regenerate the Store submission bundle and operator action pack only after the Store bundle verifier passes again.

## Qualitative Impact

This is a material release blocker, but it is a good catch before Partner Center submission. The runtime package, CLI alias, startup task, and second-PC install evidence are useful, but they prove only the packaged runtime path. The public desktop product still needs a real desktop MSIX boundary.
