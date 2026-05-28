# Store / MSIX Packaging Guide for `musu`

This guide records the current packaging path for Windows Store / MSIX work.

It is intentionally separate from the legacy direct-download installer path.

## Purpose

The goal is to make `musu` testable and packageable as a packaged desktop app with package identity, execution alias, and startup task support.

Current packaging assumptions:

- `musu.exe` is the CLI / user-facing entrypoint.
- `musu-startup.exe` is packaged alongside it and is the packaged startup-task executable.
- `~/.musu/` remains the runtime-state root for now.
- Store / MSIX builds must not rely on:
  - `install.ps1`
  - binary self-copy into `~/.musu/bin`
  - raw Scheduled Task registration
  - MUSU-managed self-update

Windows packaged builds now have two explicit startup contracts:

- `local-sideload-manual`
  - installable via local sideload
  - no restricted startup capability
  - no auto-start success requirement
  - operator starts the bridge manually with packaged `musu.exe bridge`
- `store-reviewed-immediate-registration`
  - manifest requests `ImmediateRegistration=true`
  - declares `Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe`
  - intended for Microsoft-reviewed Store distribution, not local sideload proof

## Scripts

### 0. Run the full local workflow

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-msix-workflow.ps1 `
  -StartupContract local-sideload-manual
```

What it does:

1. Builds or refreshes the MSIX artifact.
2. Verifies package contents and manifest.
3. Runs the packaged startup smoke unless `-SkipSmoke` is passed.
4. Checks sideload readiness on the current machine.
5. Checks for legacy direct-download startup conflicts on the machine.
6. Optionally attempts install with `-AttemptInstall`.
7. Optionally verifies installed state with `-VerifyInstalled`.

Useful switches:

- `-SkipBuild`: reuse current Rust binaries.
- `-SkipSmoke`: skip runtime smoke and only validate package structure.
- `-AttemptInstall`: call `install-msix.ps1` at the end.
- `-MachineTrust`: pass machine-level trust through to the install step.
- `-VerifyInstalled`: call the installed-package verifier after install.
- `-StartupContract <...>`: choose `local-sideload-manual` or `store-reviewed-immediate-registration`.

For the external Store-reviewed approval path, use:

- [`docs/STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md`](STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md)

### 1. Build an MSIX staging folder and package

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\build-msix.ps1 `
  -StartupContract local-sideload-manual `
  -GenerateCert `
  -InstallCert
```

What it does:

1. Builds `musu.exe` from `musu-rs`.
2. Builds `musu-startup.exe` from `musu-rs`.
3. Stages both binaries into a contract-specific folder under `.local-build\msix\stage\`.
4. Uses `winapp manifest generate` to create default MSIX assets.
5. Rewrites the manifest to add:
  - `windows.appExecutionAlias` for `musu.exe`
  - `windows.startupTask` for `musu-startup.exe`
  - `runFullTrust`
6. Reuses `.local-build\msix\output\Yellowhama.MUSU_cert.pfx` when present so local rebuilds do not churn the signing thumbprint.
7. Packs the staged directory into a contract-specific artifact:
  - `musu_<version>_<arch>_local-sideload-manual.msix`
  - `musu_<version>_<arch>_store-reviewed-immediate-registration.msix`

Useful options:

- `-CertPath <path>`: sign with an existing certificate.
- `-GenerateCert`: generate a development certificate only if no reusable local `.pfx` is already present.
- `-InstallCert`: install that development certificate locally.
- `-StartupContract store-reviewed-immediate-registration`: emit the restricted-capability Store-reviewed manifest shape.
- `-DryRun`: print the flow without mutating the filesystem.

### 1.1. Prepare a Store-reviewed submission bundle

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\prepare-store-submission-bundle.ps1
```

What it does:

1. Verifies the latest `store-reviewed-immediate-registration` artifact.
2. Copies the Store-reviewed `.msix` and signing `.cer` into a timestamped bundle directory.
3. Copies the restricted-capability checklist, packaging guide, and Windows pivot doc into that bundle.
4. Writes:
   - `verify-store-reviewed.txt`
   - `submission-notes.txt`
   - `bundle.json`

This is the handoff packet for Partner Center submission.

### 2. Create package identity without a full MSIX install

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\create-debug-identity.ps1
```

This uses `winapp create-debug-identity` against the staged `musu.exe` and manifest so the packaged runtime path can be exercised without going through a full Store submission loop.

Prerequisite:

- Windows Developer Mode must be enabled.
- If it is off, `winapp create-debug-identity` fails before identity registration.
- Settings path: `Settings > Privacy & security > For developers > Developer Mode`

### 3. Install the generated MSIX locally

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-msix.ps1
```

What it does:

1. Auto-discovers the latest generated `.msix` and `.pfx` under `.local-build\msix\output` unless explicit paths are passed.
2. Reads the package identity from the MSIX manifest, so the final `Get-AppxPackage` lookup is not hardcoded to one package name.
3. Imports the generated development certificate into `CurrentUser\TrustedPeople` by default.
4. Exports the public cert and adds it to `CurrentUser\Root`.
5. Refuses to silently reuse an already-installed package with the same identity/version when the artifact was rebuilt in place.
6. Attempts `Add-AppxPackage` on the generated `.msix`.

Useful options:

- `-PackagePath <path>`: install a specific `.msix`.
- `-CertPath <path>`: use a specific signing certificate.
- `-ReplaceExisting`: remove an already-installed package with the same identity before reinstalling the new `.msix`.
- `-DryRun`: print the install/certificate flow without mutating package or certificate state.
- `-SkipCertInstall`: skip certificate import and only attempt package install.

Use `-ReplaceExisting` when the manifest/package contract changed but the version is still the same (for example, `1.13.0.0` rebuilt with a different startup-task declaration).

For the normal admin validation path, prefer the one-shot wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1
```

That wrapper runs:

1. `check-msix-sideload-readiness.ps1`
2. `install-msix.ps1 -MachineTrust -ReplaceExisting`
3. `verify-installed-msix-package.ps1 -CheckAlias`
4. `check-packaged-startup-state.ps1 -AssertReady`

If machine-level trust is required and the current session is not elevated, the wrapper now requests a UAC elevation automatically and continues the install/verify flow in the elevated child PowerShell.
- `-MachineTrust`: install trust into `LocalMachine` stores instead of `CurrentUser`. This requires an elevated PowerShell session.

Known limitation on this machine:

- The package was created successfully.
- `Add-AppxPackage` still failed with `0x800B0109` until stronger trust was present.
- That strongly suggests the final sideload path may require elevated trust installation into machine-level certificate stores on some systems.
- The helper script now surfaces that failure mode explicitly and points at `-MachineTrust` instead of failing opaquely.

### 4. Smoke-test the packaged startup binary without a full MSIX install

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-packaged-startup.ps1
```

What it does:

1. Creates a temporary `MUSU_HOME` under `.local-build\startup-smoke`.
2. Launches `musu-rs\target\debug\musu-startup.exe` with:
   - `MUSU_DISTRIBUTION=store-msix` implied by the binary itself
   - `BRIDGE_HOST=127.0.0.1`
   - `BRIDGE_PORT=0`
3. Verifies `musu-startup.exe` bootstraps `bridge.env` with a fresh 64-hex token when none exists yet.
4. Waits for `services\bridge.json` to appear under that `MUSU_HOME`.
5. Polls the discovered loopback address until `/health` returns `200`.
6. Verifies `/api/fleet/node-status` reports the same dynamically assigned address.
7. Stops the process unless `-KeepRunning` is passed.

This is the fastest local verification path for the packaged startup contract before a real MSIX sideload / Store submission loop.

### 5. Verify the packaged artifact end-to-end

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1
```

What it does:

1. Opens the latest generated `.msix`.
2. Verifies the package contains `musu.exe` and `musu-startup.exe`.
3. Verifies the manifest still includes:
   - `windows.appExecutionAlias` for `musu.exe`
   - `windows.startupTask` for `musu-startup.exe`
   - `runFullTrust`
4. Runs `smoke-packaged-startup.ps1` unless `-SkipSmoke` is passed.

This is the current best “artifact-level” verification path before a true sideload / Store submission loop.

### 6. Check sideload readiness on the current machine

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\check-msix-sideload-readiness.ps1
```

What it checks:

1. Whether the latest `.msix` and `.pfx` exist.
2. Whether `winapp` is installed.
3. Whether the current PowerShell session is elevated.
4. Whether Windows Developer Mode is enabled.
5. Whether the signing certificate is already trusted in:
   - `CurrentUser\TrustedPeople`
   - `CurrentUser\Root`
   - `LocalMachine\TrustedPeople`
   - `LocalMachine\Root`
6. Whether the package identity already appears installed.

This is the current preflight for the remaining sideload blocker: machine-level trust and actual `Add-AppxPackage` readiness.

### 7. Detect legacy direct-download startup conflicts

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\check-msix-legacy-conflicts.ps1
```

What it checks:

1. Startup-folder helpers left by older Windows bootstrap paths.
2. Scheduled Tasks such as `musu-bridge` or `\Musu\musud`.
3. Legacy `~/.musu/bin` binaries that can still be invoked directly.
4. PATH entries that shadow the packaged WindowsApps alias.

Why this matters:

- A machine with old direct-download startup artifacts is not a clean Store/MSIX validation environment.
- Packaged startup-task failures or successes are harder to interpret if legacy startup paths are still present.

### 8. Verify an installed package after sideload succeeds

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-installed-msix-package.ps1
```

What it checks:

1. The package is installed for the current user.
2. The installed `AppxManifest.xml` still contains:
   - `MusuBridgeStartup`
   - `musu.exe` appExecutionAlias
   - `Enabled=true`
3. The installed location contains:
   - `musu.exe`
   - `musu-startup.exe`
4. A Start menu entry exists for `MUSU`.
5. Optionally, `-CheckAlias` confirms `musu.exe` resolves through `Get-Command`.
6. If a current artifact is available, the installed startup contract is compared against that artifact so stale same-version installs are obvious.

This is the post-sideload verifier for the installed-package layer. It does not prove automatic startup by itself; that still needs a real startupTask / logon validation step.

### 9. Query packaged startup-task state through the package itself

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\check-packaged-startup-state.ps1
```

What it does:

1. Launches `C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\musu.exe` by absolute path, so PATH shadowing does not matter.
2. Runs `musu package-status` inside the packaged app context.
3. Prints the package identity / distribution mode / WinRT startup-task state reported by the package itself.

This is the fastest way to confirm that the installed app is actually running with package identity before doing a full logoff/logon startup proof.

Use `-AssertReady` only for the **Store-reviewed auto-start** contract. It fails unless the package reports:

- `has_package_identity = true`
- `startup_task_state = enabled` or `enabled-by-policy`
- Windows persisted startup registration shows `UserEnabledStartupOnce > 0`

If the startup task is still not primed, the checker performs one warmup launch through `shell:AppsFolder\<PackageFamily>!MUSU` and then queries the state again. This is intentionally stricter than a plain `enabled` check because Windows can report `StartupTaskState = enabled` while `UserEnabledStartupOnce` is still `0`, which means logon startup has not actually been armed yet.

For the **local sideload / manual bridge** contract, do not use `-AssertReady` as a success gate. The correct success condition is:

- package identity works
- the packaged binaries are present
- the operator can run the bridge manually with:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" bridge
```

### 10. Verify the real post-logon startup result

Use after logging back in:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\check-post-logon-msix-startup.ps1
```

What it does:

1. Queries `musu package-status` through the WindowsApps alias.
2. Reads `~/.musu/services/startup-marker.json` to determine whether `musu-startup.exe` actually launched.
3. Reads Windows' persisted startup registration under `AppModel\SystemAppData\<PackageFamily>\MusuBridgeStartup`.
4. Reads `~/.musu/services/bridge.json` when present to discover the actual loopback bridge address.
5. Checks `/health` against that address.

Use `-AssertHealthyStartup` after logon to fail unless:

- the packaged app reports package identity
- the startup task state is `enabled` or `enabled-by-policy`
- the startup marker exists
- the bridge answers `200` on `/health`

Useful verdicts:

- `startup-registered-awaiting-logon`: Windows persisted the startup registration, but no post-logon launch has been observed yet.
- `startup-not-yet-observed`: no startup marker and no persisted startup registration evidence.
- `startup-launched-bridge-unhealthy`: startup launched, but the bridge did not become healthy.
- `startup-healthy`: startup launched and the bridge answered `/health`.

Current evidence on this machine:

- Clean reinstall was completed after removing legacy package/runtime artifacts.
- The remaining non-package conflict is only PATH shadowing from `C:\Users\empty\.cargo\bin\musu.exe`.
- Automatic startup after logon still failed in the previous package shape.
- The local sideload path cannot rely on `Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe`, because Windows expects an SCCD-backed custom capability package contract for that path.
- The current `.msix` artifact now follows the supported local packaged-desktop shape: `Enabled=true`, `runFullTrust`, `AppListEntry=default`, and a first-launch warmup path before startup-state assertion.
- Even after the packaged app reports `startup_task_state = enabled`, `RequestEnableAsync` returns `enabled -> enabled`, AppsFolder activation succeeds, and `UserEnabledStartupOnce` still remains `0` on this machine.

Interpretation:

- The earlier package contract was insufficient because the app was hidden from the app list (`AppListEntry=none`) and the verifier overstated readiness.
- After fixing those issues, the remaining blocker is now platform-level: local sideload still does not arm logon startup even after real packaged activation.
- The only documented Windows path that removes the "launch once" requirement is `ImmediateRegistration`, which in turn depends on the restricted startup custom capability.
- That means MUSU now treats these as separate product contracts:
  - `local-sideload-manual`
  - `store-reviewed-immediate-registration`

Store / platform caveat:

- `desktop:StartupTask` supports `rescap5:ImmediateRegistration`, but Microsoft documents that it requires the `Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe` custom capability.
- Microsoft’s custom capability model uses SCCD authorization during install. A plain local sideload package without that capability authorization cannot rely on this path.
- For local validation, the supported contract is “package launch enables startup” rather than “startup is enabled immediately on install”.
- On this machine, even real AppsFolder activation did not move `UserEnabledStartupOnce` off `0`, so local sideload still cannot be treated as proof that post-logon startup will fire.

Implementation note:

- The MSIX helper scripts now share package/archive inspection code through `scripts/windows/msix-common.ps1` so identity parsing and repo-root discovery do not drift across install/verify/preflight flows.

## Current gaps

This is not the final Store-ready endpoint yet.

Known remaining work:

- Startup-task activation is manifest-based, but the product still needs full end-to-end operator validation on a packaged install.
- `runFullTrust` is a restricted capability and Store submission review must account for that.
- A full Microsoft Store submission path still needs:
  - package verification
  - Store metadata
  - final signing/submission workflow

## References

- `docs/STORE_MSIX_AUDIT_2026_05_27.md`
- `docs/STORE_MSIX_EXECUTION_PLAN_2026_05_27.md`
- `docs/STORE_MSIX_THERMO_AUDIT_2026_05_27.md`
- `docs/STORE_MSIX_QUAL_CRITIQUE_2026_05_27.md`
- `docs/PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md`
