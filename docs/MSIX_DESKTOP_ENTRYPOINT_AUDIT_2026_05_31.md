# MUSU MSIX Desktop Entrypoint Audit

**Wiki ID**: wiki/526
**Date**: 2026-05-31
**Scope**: why `desktop-open -RequireOwnedWebView2` evidence failed after Store/MSIX activation, and what must change before Microsoft Store submission.

## Verdict

2026-05-31 23:25 KST update: the desktop-entrypoint boundary is now split into
two explicit checks:

1. Store-reviewed artifact check: the Partner Center package artifact must
   launch `musu-desktop.exe`, keep `musu.exe` as the CLI alias, keep
   `musu-startup.exe` as the startup task, and include the restricted startup
   contract expected for Store review.
2. Local install check: ordinary primary/second-PC sideload evidence must use
   the `local-sideload-manual` MSIX and prove the installed package launches
   `musu-desktop.exe`.

The fixed local-sideload package is now installed on `HUGH_SECOND` and passes
`audit-msix-desktop-entrypoint.ps1 -StartupContract local-sideload-manual
-RequireInstalledPackage`.

The Store-reviewed restricted-capability package is intentionally **not**
ordinary sideload evidence. It declares
`Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe`; `install-msix.ps1`
now refuses to sideload it by default because local `Add-AppxPackage` can fail
after removing the currently installed package. A Store-reviewed
`-RequireInstalledPackage` audit correctly fails on `HUGH_SECOND` because the
installed local-sideload contract does not include the Store-only restricted
startup capability.

Current decision: **desktop-entrypoint packaging and local install proof are
fixed, but public release remains No-Go** until clean runtime CPU evidence,
source-fresh package build reliability, real multi-device route evidence,
support inbox delivery, and Microsoft Store certification/restricted-capability
approval are recorded.

## Evidence

Recorded evidence:

- `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-214327-HUGH_SECOND.store-msix-runtime-only.evidence.json`
- `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-224328-HUGH_SECOND.store-msix-desktop-artifact.evidence.json`
- `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.local-sideload-installed.evidence.json`
- `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.store-reviewed-contract-mismatch.evidence.json`

Current fixed artifact:

- `.local-build\msix\output\musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix`
- Application executable: `musu-desktop.exe`
- CLI alias executable: `musu.exe`
- Startup task executable: `musu-startup.exe`
- Package contains `musu-desktop.exe`: yes
- Artifact audit: `ok=true`, `fail_count=0`
- Store submission bundle verifier: `ok=true`, `fail_count=0` for `.local-build\msix\submission-bundles\store-reviewed-20260531-224352`

Installed local-sideload package now passing:

- `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Installed application executable: `musu-desktop.exe`
- Installed package contains `musu-desktop.exe`: yes
- Installed description: `MUSU desktop shell for the local AI operations runtime`
- Start-menu app id: `Yellowhama.MUSU_ygcjq669as2b6!MUSU`
- Local-sideload installed audit: `ok=true`, `fail_count=0`

Store-reviewed local install caveat:

- Store-reviewed artifact has `StartupImmediateRegistration=true`
- Store-reviewed artifact has
  `HasNonUserConfigurableStartupCapability=true`
- Installed local-sideload package has no restricted startup capability
- Store-reviewed `-RequireInstalledPackage` audit on this machine:
  `ok=false`, `fail_count=1`, reason: installed startup contract does not
  match the audited artifact
- Default sideload command now refuses Store-reviewed restricted-capability
  packages unless `-AllowRestrictedCapabilitySideload` is explicitly supplied

Build note: a source-fresh `build-msix.ps1` release build attempt on
`HUGH_SECOND` failed in `musu-rs` release compilation with rustc OOM/pagefile
pressure even with `CARGO_BUILD_JOBS=1`. The packaging structure was verified
with `build-msix.ps1 -SkipBuild` using existing release binaries; a CI/build
machine still needs to produce a clean source-fresh package before submission.

## Product Spec Lock

The public Store package must be a desktop app package:

- Start-menu activation launches `musu-desktop.exe`.
- The package still includes `musu.exe` for the CLI/WindowsApps alias.
- The package still includes `musu-startup.exe` for the startup task.
- The package description must describe MUSU Desktop, not only a packaged CLI/bridge runtime.
- `desktop-open` runtime CPU evidence must show at least one MUSU-owned WebView2 process.

The old installed runtime-only MSIX cannot close:

- `msix_desktop_entrypoint_verified`
- `runtime_idle_cpu_verified` for `desktop-open -RequireOwnedWebView2`
- public Store submission readiness

The fixed local-sideload install can close the local installed desktop
entrypoint portion of `msix_desktop_entrypoint_verified`; the Store-reviewed
portion remains artifact/Partner Center evidence until Microsoft signs and
distributes the restricted-capability package.

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
- startup contract equivalence between artifact and installed package when
  `-RequireInstalledPackage` is used

Release tooling now fails closed:

- `audit-desktop-release-readiness.ps1` reports `msix_desktop_entrypoint_ready=false` when the installed MSIX launches `musu.exe`.
- `write-release-go-no-go.ps1` reports `msix_desktop_entrypoint_verified=true`
  only when the Store-reviewed artifact audit passes and the
  `local-sideload-manual` installed-package audit passes.
- `verify-store-submission-bundle.ps1` rejects Store bundles whose MSIX artifact does not launch the desktop shell; the regenerated bundle now passes this artifact-level check.
- final operator packet/status scripts now include the MSIX desktop entrypoint gate.

Current go/no-go truth:

- `single_machine_verified=true`
- `msix_install_verified=true`
- Store-reviewed artifact MSIX desktop entrypoint audit: `true`
- local-sideload installed-package MSIX desktop entrypoint audit: `true`
- Store-reviewed installed-package audit on a local sideload machine:
  intentionally `false` unless the Store-signed restricted-capability package
  is actually installed
- `msix_desktop_entrypoint_verified=true` in the local diagnostic go/no-go
  split, but public release remains blocked by other gates
- `runtime_idle_cpu_verified=false`
- `multi_device_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`

## Next Steps

1. Produce a source-fresh release package on a machine that can complete the `musu-rs` release build without OOM/pagefile failure.
2. Use the fixed `local-sideload-manual` MSIX for primary/second-PC install and
   runtime CPU evidence until the Store-signed package is available.
3. Run local install proof:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-msix-desktop-entrypoint.ps1 -StartupContract local-sideload-manual -ExpectedApplicationExecutable musu-desktop.exe -RequireInstalledPackage -Json
   ```
4. Run Store artifact proof:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-msix-desktop-entrypoint.ps1 -StartupContract store-reviewed-immediate-registration -ExpectedApplicationExecutable musu-desktop.exe -Json
   ```
5. Only after local install proof passes, rerun:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json
   ```
6. Regenerate the final operator packet and operator action pack after installed desktop-entrypoint and runtime CPU evidence pass.

## Qualitative Impact

This is a material release blocker that is now mostly retired for local
validation. The remaining risk is not the desktop entrypoint itself; it is
source-fresh release build reliability, the restricted-capability Store review
path, and clean two-machine WebView2/idle CPU evidence after installation.
