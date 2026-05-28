# MUSU Desktop Release Readiness Audit

**Wiki ID**: wiki/520
**Date**: 2026-05-29
**Scope**: release-grade desktop/app infrastructure for `1.15.0-rc.1`.

## Verdict

Public desktop release readiness is **not closed**.

Current split:

- Runtime/MSIX package path: **ready for Partner Center submission attempt**
- Single-machine smoke path: **verified**
- Tauri static launcher/status shell: **buildable and bundleable**
- Multi-device release claim: **not verified**

This means MUSU can proceed as a **runtime-package beta / Store submission candidate** and now has a basic Tauri desktop entry surface. It still should not be marketed as full multi-device release-ready until the user's second-PC test passes. The Tauri shell is a runtime launcher/status surface, not the full dashboard product.

## Audit Command

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-desktop-release-readiness.ps1
```

Machine-readable:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-desktop-release-readiness.ps1 -Json
```

CI/blocking mode:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-desktop-release-readiness.ps1 -FailOnBlocking
```

## Latest Result

```text
runtime_package_ready: True
desktop_shell_ready: True
multi_device_verified: False
public_desktop_release_ready: False
fail_count: 1
```

Blocking checks:

1. `second-PC execution` fails because the multi-device runbook explicitly records second-PC validation as pending.

Passing foundation checks:

- repo `VERSION` is `1.15.0-rc.1`
- `musu-bee/package.json` and `package-lock.json` now match `VERSION`
- `src-tauri/tauri.conf.json` uses numeric Windows bundle version `1.15.0` for release `1.15.0-rc.1`
- Tauri identifier is no longer `com.tauri.dev`
- Tauri CSP is explicit
- Tauri window uses native decorations and opaque background
- `src-tauri/Cargo.toml` version and metadata are no longer scaffold placeholders
- dedicated Tauri shell source exists under `musu-bee/src-tauri-shell`
- `npm run build:tauri-shell` emits `musu-bee/out/index.html`
- Tauri IPC is enabled with `withGlobalTauri=true`
- desktop commands exist for `desktop_status`, `start_runtime`, and `open_dashboard`
- local-sideload MSIX exists
- Store-reviewed MSIX exists
- Store submission bundle exists
- single-machine and multi-device smoke scripts exist
- multi-device test kit builder exists

Additional verification run after metadata update:

```powershell
cd musu-bee
npm run typecheck
npm run build:tauri-shell
npm run tauri:build

cd ..
cargo check --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1
```

These passed on 2026-05-29. Tauri `cargo check` generated `musu-bee/src-tauri/Cargo.lock`, which should stay tracked for repeatable desktop-shell builds.

Tauri build update:

- `npm run tauri:build` built the release application binary at `src-tauri/target/release/musu-desktop.exe`.
- `npm run tauri:build` produced `src-tauri/target/release/bundle/msi/MUSU_1.15.0_x64_en-US.msi`.
- `npm run tauri:build` produced `src-tauri/target/release/bundle/nsis/MUSU_1.15.0_x64-setup.exe`.
- The first bundle attempt found a real Windows packaging rule: MSI rejects prerelease identifiers like `1.15.0-rc.1`.
- `tauri.conf.json` now uses numeric bundle version `1.15.0` while the repo/package/Cargo release version remains `1.15.0-rc.1`.
- Static shell render evidence was captured with Playwright at `.local-build\tauri-shell-1280x800.png`; file-mode rendering correctly shows IPC unavailable because it is outside the Tauri runtime.

## Desktop Shell Decision

Do **not** call the current Tauri shell the full release-grade dashboard GUI.

Reason:

The main Next app is a server-backed dashboard with many `/api/*` routes and force-dynamic pages. The Tauri shell now uses a separate static launcher/status surface instead of trying to export the whole dashboard.

Acceptable paths:

1. **Keep first Store release as Rust packaged runtime** and use the dashboard in browser for beta.
2. **Use the Tauri static launcher/status shell** as a desktop entry surface for runtime status, `musu up`, and dashboard handoff.
3. **Convert a bounded subset of the dashboard to static export** only if the API-dependent surfaces are explicitly split out.

Path 1 is still the least risky for the current Partner Center submission. Path 2 is now viable as a basic desktop entry surface. Path 3 remains product work, not a certification checkbox.

## Current Release Language

Allowed:

> MUSU 1.15.0-rc.1 is single-machine Windows beta ready. The Store-reviewed MSIX runtime package is regenerated and ready for submission attempt.

Allowed:

> MUSU includes a basic Tauri runtime launcher/status shell that builds and bundles on Windows.

Not allowed:

> MUSU 1.15.0-rc.1 is a finished release-grade desktop GUI app.

Not allowed yet:

> MUSU 1.15.0-rc.1 is full multi-device release ready.

## Next Gates

P0:

- Run the user's second-PC smoke using `scripts\windows\smoke-multidevice-beta.ps1`.
- Submit the Store-reviewed MSIX bundle and record Microsoft certification/restricted-capability result.

P1:

- Decide the desktop GUI path: runtime package + browser dashboard, true Tauri launcher, or static subset.
- If Tauri is kept, replace the current `frontendDist=../out` / `npm run build` mismatch with a tested build contract.

P2:

- Add screenshot-based desktop shell verification once the GUI shell exists.
- Add clean-machine install proof, not just repo-local package proof.
