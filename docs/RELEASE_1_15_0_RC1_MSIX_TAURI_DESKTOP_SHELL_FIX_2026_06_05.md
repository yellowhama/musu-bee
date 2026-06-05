# MUSU 1.15.0-rc.1 MSIX Tauri Desktop Shell Fix

Recorded: 2026-06-05 KST  
Machine: HUGH_SECOND  
Commit: `1fb15a0346141dc3742f70591dc4d8b6a6171cf9`

## Symptom

The installed MUSU Desktop opened a localhost connection-refused page instead
of the local runtime shell. The local bridge was not the failing component:
packaged runtime repair and smoke tests showed the bridge was reachable and the
packaged runtime does not require a fixed `127.0.0.1:3000` or
`127.0.0.1:3001` dashboard.

## Root Cause

`scripts\windows\build-msix.ps1` built the desktop executable with direct
`cargo build` from `musu-bee\src-tauri`. That path can bypass the Tauri CLI
production build contract that runs `beforeBuildCommand` and embeds
`frontendDist`. The MSIX still passed the old desktop-entrypoint audits because
those audits only checked that the package launched `musu-desktop.exe`; they did
not check whether the packaged desktop executable was built through the Tauri
asset pipeline.

## Fix

- `scripts\windows\build-msix.ps1` now builds the desktop executable with
  `npm run tauri -- build --no-bundle`.
- `scripts\windows\audit-desktop-release-readiness.ps1` now fails if the MSIX
  build contract regresses to a direct Tauri-directory cargo build.

## Verification

- `npm run tauri -- build --no-bundle`: passed; direct release executable
  rendered `Runtime Control`.
- `scripts\windows\run-msix-workflow.ps1 -Configuration release
  -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled
  -ReplaceExisting`: passed.
- Installed AppX entry `Yellowhama.MUSU_ygcjq669as2b6!MUSU`: launched
  `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6\musu-desktop.exe`
  and rendered the local runtime shell with bridge URL
  `http://127.0.0.1:11000`.
- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-172814-HUGH_SECOND.evidence.json`
  verified `ok=true`, `dashboard_required=false`,
  `single_machine_surface=local-bridge-only`, and
  `cli_route_checked=true`.
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-172846-HUGH_SECOND.desktop-open.evidence.json`
  captured clean git state, packaged WindowsApps runtime, MUSU CPU `0%`,
  WebView2 max one-core CPU `0.13%`, hot process count `0`, and working set
  `358.49MB`.

## Remaining Release Blockers

This fixes the installed desktop localhost refusal on HUGH_SECOND. Public
release remains blocked by the already-known gates: second-PC CPU/multidevice
evidence, hosted `musu.pro` P2P control-plane proof, support mailbox proof, and
Store/Partner Center release evidence.
