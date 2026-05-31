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
single_machine_verified: True
multi_device_verified: False
public_desktop_release_ready: False
fail_count: 1
```

Blocking checks:

1. `second-PC execution` fails because no verified multi-device evidence JSON exists under `docs\evidence\multidevice\1.15.0-rc.1\*.evidence.json` or `.local-build\multi-device`.

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
- release candidate manifest script exists
- single-machine and multi-device smoke scripts exist
- single-machine evidence verifier and recorder exist
- multi-device test kit builder exists
- final operator gate packet builder exists
- final operator gate packet verifier exists
- final operator evidence completion runner exists
- final release handoff status script exists
- MSIX install evidence capture/verifier/recorder scripts exist
- multi-device evidence verifier exists
- multi-device evidence recorder exists
- Store public metadata verifier exists
- Store release evidence verifier/recorder exists
- release go/no-go preflight exists
- Store public metadata Playwright CI smoke exists
- Store metadata basics exist: `/privacy`, `/support`, and `STORE_SUBMISSION_METADATA_2026_05_29.md`

Additional verification run after metadata update:

```powershell
cd musu-bee
npm run typecheck
npm run build
npm run build:tauri-shell
npm run tauri:build

cd ..
cargo check --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1
```

These passed on 2026-05-29. Tauri `cargo check` generated `musu-bee/src-tauri/Cargo.lock`, which should stay tracked for repeatable desktop-shell builds.

2026-05-29 Store metadata update:

- `npm run build` passed and prerendered `/privacy` and `/support` as static routes.
- `scripts\windows\audit-desktop-release-readiness.ps1` now includes Store metadata checks for privacy route, support route, and Partner Center metadata doc.
- `scripts\windows\verify-store-public-metadata.ps1 -BaseUrl http://127.0.0.1:3015 -Json` passed against local `next start`.
- `scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json` now passes against production.
- `scripts\windows\write-release-go-no-go.ps1 -Json` reports `local_artifacts_ready=true` and `ready_for_public_desktop_release=false`.
- `scripts\windows\audit-desktop-release-readiness.ps1 -Json` now reports `single_machine_verified=true` from committed evidence under `docs\evidence\single-machine\1.15.0-rc.1`.
- Remaining go/no-go blockers are clean/current MSIX install evidence, second-PC evidence, `musu@musu.pro` delivery verification, and Store release approval evidence; support mailbox verification now has `verify-support-mailbox-evidence.ps1` and `record-support-mailbox-verification.ps1` with version/token/sender/timestamp checks, MSIX install verification has `capture-msix-install-evidence.ps1`, `verify-msix-install-evidence.ps1`, and `record-msix-install-evidence.ps1` with version/operator/timestamp/capture-check validation, and Store release approval now has `verify-store-release-evidence.ps1` and `record-store-release-verification.ps1` with mandatory explicit product-name reservation evidence.
- `write-release-go-no-go.ps1` now lists `musu@musu.pro` inbox delivery in `manual_external_gates`, matching the actual blocker and the final handoff operator steps.
- `write-release-go-no-go.ps1` no longer has the legacy `-AssumeSupportMailboxVerified` bypass; support readiness must come from recorded evidence.
- `write-release-go-no-go.ps1 -SkipPublicMetadata` now remains a diagnostic/offline path only: skipping live privacy/support metadata verification adds a blocker, not only a warning.
- `write-release-go-no-go.ps1` now treats a dirty git worktree as a blocker, so release readiness cannot become true until the release manifest is regenerated from committed state and reports `manifest_git.dirty=false`.
- `scripts\windows\prepare-final-operator-gate-packet.ps1 -IncludeDesktopShell -Json` generates a stamped packet and updates the stable alias `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`, bundling the remaining manual gate runbook, multi-device kit, support mailbox template, packet build metadata, MSIX install recorder/verifier scripts, second-PC handoff collector, Store release recorder/verifier scripts, final release handoff status script, final packet verifier, final evidence completion runner, and checksums. The generator refuses dirty git state before packet creation.
- `scripts\windows\verify-final-operator-gate-packet.ps1 -PacketPath .local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip -Json` passed with `ok=true`, `fail_count=0`, `kit_count=1`; the verifier now fails if the packet README omits the MSIX install blocker, Store release approval blocker, `record-msix-install-evidence.ps1`, `collect-second-pc-handoff.ps1`, `record-store-release-verification.ps1`, `show-final-release-handoff-status.ps1`, Store evidence parameters including `-StoreProductNameReservedAt`, `-FailOnNotReady` in the final completion command, packet build metadata with clean git state, the dirty-git blocker rule in the bundled go/no-go script and packet verifier, the MSIX evidence version/capture-check/timestamp/operator gate, the multi-device evidence schema/version/timestamp/operator/endpoint gate, the support evidence version/token/sender gate, or the Store explicit reservation/timestamp safety gate.
- `scripts\windows\verify-multidevice-evidence.ps1` now requires `musu.multidevice_smoke_evidence.v1`, current-version evidence when `-ExpectedVersion` is supplied, valid `started_at`/`completed_at`, acceptable evidence age, and operator machine metadata. The release audit passes the repo `VERSION` into that verifier.
- `scripts\windows\complete-final-operator-gates.ps1` can now record MSIX install and Store approval evidence in the same final command as multi-device and support evidence. Smoke verification wrote Store evidence only to `.local-build\store-release-complete-smoke`, so it did not satisfy or fake the real go/no-go Store release gate.
- `scripts\windows\show-final-release-handoff-status.ps1` is evidence-non-recording and summarizes the latest go/no-go, packet verification, evidence search roots, and remaining operator commands in one screen.
- CI/deploy repair: Node 22+ is required for `node:sqlite`, GitHub JavaScript actions are forced onto Node 24 runtime, deleted Python and `musu-port` references were removed from GitHub Actions, Linux Rust CI installs Wayland/PipeWire/GBM native dependencies, likely legacy required check names were preserved, and `npm run test:e2e:ci` now runs Store metadata smoke tests for `/privacy` and `/support`.

Tauri build update:

- `npm run tauri:build` built the release application binary at `src-tauri/target/release/musu-desktop.exe`.
- `npm run tauri:build` produced `src-tauri/target/release/bundle/msi/MUSU_1.15.0_x64_en-US.msi`.
- `npm run tauri:build` produced `src-tauri/target/release/bundle/nsis/MUSU_1.15.0_x64-setup.exe`.
- The first bundle attempt found a real Windows packaging rule: MSI rejects prerelease identifiers like `1.15.0-rc.1`.
- `tauri.conf.json` now uses numeric bundle version `1.15.0` while the repo/package/Cargo release version remains `1.15.0-rc.1`.
- Static shell render evidence was captured with Playwright at `.local-build\tauri-shell-1280x800.png`; file-mode rendering correctly shows IPC unavailable because it is outside the Tauri runtime.

Release manifest update:

- `scripts\windows\write-release-candidate-manifest.ps1` writes `.local-build\release-candidates\1.15.0-rc.1\release-candidate-manifest.json`.
- The companion `SHA256SUMS.txt` records the current release artifact hashes.
- Private `.pfx` signing material is excluded unless the operator explicitly passes `-IncludePrivateArtifacts`.

## Desktop Shell Decision

Do **not** call the current Tauri shell the full release-grade dashboard GUI.

Reason:

The main Next app is a server-backed dashboard with many `/api/*` routes and force-dynamic pages. The Tauri shell now uses a separate static launcher/status surface instead of trying to export the whole dashboard.

Acceptable paths:

1. **Keep first Store release as Rust packaged runtime** and use the dashboard in browser for beta.
2. **Use the Tauri static launcher/status shell** as a desktop entry surface for runtime status, `musu up`, and dashboard handoff.
3. **Convert a bounded subset of the dashboard to static export** only if the API-dependent surfaces are explicitly split out.

Path 1 is still the least risky for the current Partner Center submission. Path 2 is now viable as a basic desktop entry surface. Path 3 remains product work, not a certification checkbox.

2026-05-31 addendum:

Path 1 is no longer acceptable as the public **MUSU Desktop** Store submission unless the product promise is explicitly reduced to a packaged runtime/CLI utility. The current Store-reviewed MSIX launches `musu.exe`, does not contain `musu-desktop.exe`, and describes itself as `MUSU packaged CLI and bridge runtime`. See `MSIX_DESKTOP_ENTRYPOINT_AUDIT_2026_05_31.md` (wiki/526). Public desktop release readiness now requires `msix_desktop_entrypoint_verified=true`.

## Current Release Language

Allowed:

> MUSU 1.15.0-rc.1 is single-machine Windows beta ready. The current MSIX runtime package installs and verifies, but it is not the public desktop app package until it launches `musu-desktop.exe`.

Allowed:

> MUSU includes a basic Tauri runtime launcher/status shell that builds and bundles on Windows.

Not allowed:

> MUSU 1.15.0-rc.1 is a finished release-grade desktop GUI app.

Not allowed yet:

> MUSU 1.15.0-rc.1 is full multi-device release ready.

## Next Gates

P0:

- Run the user's second-PC smoke using `scripts\windows\smoke-multidevice-beta.ps1`.
- Rebuild the Store/MSIX package so Start-menu activation launches `musu-desktop.exe`, then pass `scripts\windows\audit-msix-desktop-entrypoint.ps1 -RequireInstalledPackage -Json`.
- Capture and record second-PC MSIX install evidence with `scripts\windows\capture-msix-install-evidence.ps1` and `scripts\windows\record-msix-install-evidence.ps1`.
- Validate the returned JSON with `scripts\windows\verify-multidevice-evidence.ps1`.
- Verify `musu@musu.pro` delivery and record it with `scripts\windows\record-support-mailbox-verification.ps1`.
- For operator handoff, generate the combined final-gate packet with `scripts\windows\prepare-final-operator-gate-packet.ps1 -IncludeDesktopShell`.
- Verify the packet before handoff with `scripts\windows\verify-final-operator-gate-packet.ps1`.
- Use `scripts\windows\show-final-release-handoff-status.ps1` before handoff and after each returned evidence file to confirm the current remaining blockers.
- After external evidence is available, run `scripts\windows\complete-final-operator-gates.ps1` to record MSIX install, multi-device, support mailbox, and Store release evidence, regenerate the manifest, and run final go/no-go in one step.
- Submit the Store-reviewed MSIX bundle only after `verify-store-submission-bundle.ps1` passes the desktop-entrypoint audit, then record Microsoft certification/restricted-capability result with `scripts\windows\record-store-release-verification.ps1`.

P1:

- Decide the desktop GUI path: runtime package + browser dashboard, true Tauri launcher, or static subset.
- If Tauri is kept, replace the current `frontendDist=../out` / `npm run build` mismatch with a tested build contract.

P2:

- Add screenshot-based desktop shell verification once the GUI shell exists.
- Keep clean-machine install proof evidence-gated for every public desktop release candidate.
