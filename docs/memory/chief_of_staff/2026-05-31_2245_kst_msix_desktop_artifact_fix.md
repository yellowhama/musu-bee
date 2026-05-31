# Chief of Staff Memory - MSIX Desktop Artifact Fix

Date: 2026-05-31 22:45 KST

- `scripts\windows\build-msix.ps1` now stages `musu-desktop.exe` as the MSIX application executable, keeps `musu.exe` as the CLI/app execution alias, keeps `musu-startup.exe` as the `MusuBridgeStartup` startup task, and uses a desktop-shell package description.
- `scripts\windows\verify-msix-package.ps1` now verifies the desktop application executable, runtime alias executable, startup executable, and package contents.
- `scripts\windows\audit-msix-desktop-entrypoint.ps1` now separates artifact audits from installed-package audits. Artifact-only Store bundle verification no longer fails just because an older runtime-only package is installed; `-RequireInstalledPackage` still fails closed until the fixed package is installed.
- Artifact evidence passes at `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-224328-HUGH_SECOND.store-msix-desktop-artifact.evidence.json`.
- Regenerated Store submission bundle `.local-build\msix\submission-bundles\store-reviewed-20260531-224352` verifies with `ok=true`, `fail_count=0`.
- Installed desktop-entrypoint evidence is still No-Go because `HUGH_SECOND` currently has the older runtime-only package installed. Reinstall the fixed MSIX before running `desktop-open -RequireOwnedWebView2` CPU evidence.
- Source-fresh release packaging still needs CI or a larger build machine: a full `build-msix.ps1` release build failed in `musu-rs` rustc OOM/pagefile pressure even with `CARGO_BUILD_JOBS=1`; the package-structure proof used `-SkipBuild` with existing release binaries.
