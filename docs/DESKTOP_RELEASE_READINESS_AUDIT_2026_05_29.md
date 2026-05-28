# MUSU Desktop Release Readiness Audit

**Wiki ID**: wiki/520
**Date**: 2026-05-29
**Scope**: release-grade desktop/app infrastructure for `1.15.0-rc.1`.

## Verdict

Public desktop release readiness is **not closed**.

Current split:

- Runtime/MSIX package path: **ready for Partner Center submission attempt**
- Single-machine smoke path: **verified**
- Tauri GUI shell: **not release-ready**
- Multi-device release claim: **not verified**

This means MUSU can proceed as a **runtime-package beta / Store submission candidate**, but it should not be marketed as a finished GUI desktop app until the Tauri shell build contract is fixed and the user's second-PC test passes.

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
desktop_shell_ready: False
multi_device_verified: False
public_desktop_release_ready: False
fail_count: 3
```

Blocking checks:

1. `Tauri frontendDist` fails because `musu-bee/out` does not exist.
2. `Tauri build command` fails because `beforeBuildCommand` resolves to `next build`, while `next.config.mjs` does not emit a static `out/` export.
3. `second-PC execution` fails because the multi-device runbook explicitly records second-PC validation as pending.

Passing foundation checks:

- repo `VERSION` is `1.15.0-rc.1`
- `musu-bee/package.json` and `package-lock.json` now match `VERSION`
- `src-tauri/tauri.conf.json` now matches `VERSION`
- Tauri identifier is no longer `com.tauri.dev`
- Tauri CSP is explicit
- Tauri window uses native decorations and opaque background
- `src-tauri/Cargo.toml` version and metadata are no longer scaffold placeholders
- local-sideload MSIX exists
- Store-reviewed MSIX exists
- Store submission bundle exists
- single-machine and multi-device smoke scripts exist

Additional verification run after metadata update:

```powershell
cd musu-bee
npm run typecheck

cd ..
cargo check --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1
```

Both passed on 2026-05-29. Tauri `cargo check` generated `musu-bee/src-tauri/Cargo.lock`, which should stay tracked for repeatable desktop-shell builds.

## Desktop Shell Decision

Do **not** call the current Tauri shell release-grade.

Reason:

The Next app is a server-backed dashboard with many `/api/*` routes and force-dynamic pages. The current Tauri config expects a static `../out` frontend, but the configured build command only runs `next build`. No `out/` artifact exists.

Acceptable paths:

1. **Keep first Store release as Rust packaged runtime** and use the dashboard in browser for beta.
2. **Build a real Tauri shell** that either embeds a static launch surface and starts/opens the local dashboard deliberately, or packages a supported local web server/runtime contract.
3. **Convert a bounded subset of the dashboard to static export** only if the API-dependent surfaces are explicitly split out.

Path 1 is the least risky for the current Partner Center submission. Paths 2 and 3 are product work, not a certification checkbox.

## Current Release Language

Allowed:

> MUSU 1.15.0-rc.1 is single-machine Windows beta ready. The Store-reviewed MSIX runtime package is regenerated and ready for submission attempt.

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
