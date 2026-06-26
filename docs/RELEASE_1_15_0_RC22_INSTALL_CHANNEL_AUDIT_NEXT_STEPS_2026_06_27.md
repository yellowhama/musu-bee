# Release 1.15.0-rc.22 Install Channel Audit and Next Steps (2026-06-27)

Scope: follow-up on `feat/v33-residual-finalize` after brain ingest token ACL hardening. The goal was to make the public install channel deliver the packaged desktop that contains the new brain token custody code.

## What Changed

- Bumped the desktop release channel from `1.15.0-rc.21` to `1.15.0-rc.22` (`MSIX 1.15.0.22`) across `VERSION`, Cargo manifests/locks, Tauri config, package metadata, `publicRelease.ts`, and `Install-MUSU.ps1`.
- Updated `musu-brain.pin.json` from brain revision `f7678af71d281a10df64c79e4eda6bc77ef8a719` to clean `F:\musu_2nd_brain` HEAD `2f036728a9e6d5840634666d7442be87d302f083`.
- Published `desktop-latest` assets for rc.22:
  - `musu-desktop-x64.msix` length `40686791`
  - `musu.appinstaller` length `768`
  - `Install-MUSU.ps1` length `16587`
- Added release cache-busting to the public desktop URLs (`?rc=1.15.0.22`) because GitHub release asset metadata updated immediately after `--clobber`, while stable public download URLs temporarily served old rc.21 content.
- Updated generated `.appinstaller` `Uri` and `MainPackage Uri` to include `?rc=1.15.0.22`.
- Updated `Install-MUSU.ps1` to download `musu.appinstaller?rc=<expectedPackageVersion>` after it verifies `musu.pro/api/public-config`.
- Hardened `Install-MUSU.ps1` for Windows PowerShell 5.1 execution by enabling TLS 1.2 before network calls and bracing the appinstaller URL variables (`${ReleaseBase}/${AppInstallerFileName}?rc=${expectedPackageVersion}`), preventing `?rc=` from being parsed as part of the variable name.
- Relaxed `audit-appinstaller-contract.ps1` to validate the `MainPackage Uri` path leaf (`.msix`) while allowing query strings.
- Added public `https://musu.pro/fleet-proof.ps1` as the repo-free proof wrapper for a physical second PC. It validates the hosted installer, runs hosted fleet repair, checks installed MSIX version, verifies bridge/node remote-usability, gates the brain token ACL when requested, and can require a direct peer such as `hugh_second`.
- Extended `verify-musu-pro-install-channel.ps1` to verify live `/fleet-proof.ps1` schema, expected package version, install/repair URLs, direct-peer guard, and brain-token gate.
- Deployed `musu.pro` production via Vercel deployment `dpl_ALoaFRtPhb18RkfEc6WmaDJUFijR`, aliased to `https://musu.pro`.

## Audit Findings

| Severity | Finding | Evidence | Next |
|---|---|---|---|
| INFO | rc.22 public install channel is live. | `verify-musu-pro-install-channel.ps1 -Json` passed with `ok=true`, `failure_count=0`; `/api/health`, `/api/public-config`, `/install.ps1`, `/repair-fleet.ps1`, and desktop canary publish `1.15.0-rc.22`. | Keep this verifier as the public release gate. |
| INFO | Hosted installer script now validates through the actual `irm/iex` path. | Windows PowerShell 5.1 exposed that the unbraced appinstaller URL string dropped the `?rc=1.15.0.22` cache buster. The script now enables TLS 1.2 and uses braced variables; `desktop-latest` was republished with hosted `Install-MUSU.ps1` length `16587`. | Keep remote `https://musu.pro/install.ps1 -ValidateReleaseOnly` as the pre-install smoke test. |
| INFO | Brain pin mismatch gate worked. | The first full MSIX build compiled for 23m, then failed because pin `f7678af7` did not match `F:\musu_2nd_brain` HEAD `2f03672`. After pin update, sidecar build reported `musubrain@2f03672...`. | Keep the fail-closed pin gate; add a cheap preflight before long Rust release builds. |
| MED | Stable GitHub release asset URLs can serve stale content right after `--clobber`. | GitHub API asset metadata showed rc.22 size, while `releases/download/desktop-latest/musu-desktop-x64.msix` returned old rc.21 length until queried with `?rc=1.15.0.22`. | Keep version query cache-busting in public URLs and appinstaller manifest. |
| INFO | Second PC rc.22 packaged first-run proof is now complete. | `Add-AppxPackage -AppInstallerFile .local-build\msix\output\musu.appinstaller` updated `hugh_second` from `1.15.0.21` to `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`; launching the package started `musu.exe` and `musu-desktop.exe` from the rc.22 WindowsApps path. `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json` passed with `installed_package_version=1.15.0.22`, `expected_package_version=1.15.0.22`, `brain_token_present=true`, `bridge_bind_addr=0.0.0.0:11105`, and `advertised_public_url=http://192.168.1.154:11105`. | Keep this verifier as the local packaged proof gate. |
| MED | Physical `hugh-main` proof is still missing. | Current completed package proof is from `hugh_second`; `hugh-main` still appears as unhealthy peer `192.168.1.192:9497` with `version=unknown`. | Install rc.22 on `hugh-main`, run repair, then prove non-loopback direct route. |
| INFO | Fleet audit no longer allows stale installed packages. | Before the second update, the verifier failed with `installed_package_version=1.15.0.21`, `expected_package_version=1.15.0.22`; after the rc.22 install, the same default audit passes. Stale package diagnostics require explicit `-ExpectedPackageVersion <old>` or `-AllowInstalledPackageVersionMismatch`. | Keep this as a release evidence gate. |
| INFO | Physical main proof now has a repo-free full wrapper. | `/fleet-proof.ps1` emits `musu.fleet_node_proof.v1` and includes `ExpectedNodeName`, `ExpectedDirectPeerName`, `RequireBrainToken`, hosted install validation, and hosted repair evidence. | Deploy the route, then run it on `hugh-main` after install/first launch. |
| LOW | Release build feedback loop is too slow. | First release build used `release`, `opt-level=3`, thin LTO, `codegen-units=1`, and memory-safe 1-job mode; `musu-rs` finished in `23m 02s`. `build-msix.ps1 -NoBump -PreflightOnly` now verifies version coherence + brain pin in a few seconds before the long build path. | Run `-PreflightOnly` before full release builds; separately evaluate whether release LTO/profile settings should stay this strict for every RC cut. |
| LOW | Existing desktop crate warning remains. | `musu-desktop` build reports `unused_mut` at `src/lib.rs:1539`. | Clean up in a separate low-risk hygiene commit. |

## Verification Snapshot

Passed:

- `scripts/windows/build-msix.ps1 -NoBump` after pin correction.
- `scripts/windows/build-msix.ps1 -NoBump -PreflightOnly` passed and reported `Musu Brain repo pin OK before release build`.
- `scripts/windows/build-msix.ps1 -NoBump -SkipBuild` after cache-busted appinstaller URI change.
- Local `scripts/windows/Install-MUSU.ps1 -ValidateReleaseOnly` after TLS 1.2 + braced URL hardening.
- `scripts/windows/publish-desktop-latest-assets.ps1 -DryRun`.
- `scripts/windows/publish-desktop-latest-assets.ps1 -ConfirmUpload`, including the republished hardened installer script.
- Desktop release canary `musu.desktop_release_canary.v6` with all checks passing for rc.22.
- Local `npm run build`.
- Vercel production deploy `dpl_ALoaFRtPhb18RkfEc6WmaDJUFijR`.
- `scripts/windows/verify-musu-pro-install-channel.ps1 -Json`.
- `scripts/windows/verify-fleet-audit-contract.ps1 -SelfTestRemoteUsable -Json`.
- `scripts/windows/verify-fleet-audit-contract.ps1 -ExpectedPackageVersion 1.15.0.21 -Json` as a compatibility check for the previously installed rc.21 package.
- `Add-AppxPackage -AppInstallerFile .local-build\msix\output\musu.appinstaller` after stopping the running rc.21 package, updating `hugh_second` to `1.15.0.22`.
- Packaged rc.22 launch via AppsFolder AUMID, starting both `musu.exe` and `musu-desktop.exe` from `C:\Program Files\WindowsApps\blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- `scripts/windows/verify-fleet-audit-contract.ps1 -Json` after rc.22 update.
- `scripts/windows/verify-fleet-audit-contract.ps1 -RequireBrainToken -Json` after rc.22 first launch.
- PowerShell parser checks for modified Windows scripts.
- `git diff --check`.

Expected remaining gap:

- `hugh-main` physical install/repair/direct-route proof is not captured yet.

Observed warnings:

- Vercel install reported `9 vulnerabilities` from `npm audit` (`2 low`, `5 moderate`, `2 high`). This was not triaged in this release-channel pass.
- Next.js warns that the `middleware` file convention is deprecated in favor of `proxy`.

## Product Spec Updates

- Public desktop release URLs are no longer just "fixed filename under `desktop-latest`"; they are fixed release asset names plus a version query cache buster.
- App Installer manifests must carry the same version query on both the root `Uri` and `MainPackage Uri` for public install/update readiness.
- `Install-MUSU.ps1` must verify `musu.pro/api/public-config` before downloading appinstaller, enable TLS 1.2 for legacy Windows PowerShell hosts, then fetch the appinstaller with a braced expected package-version query.
- `/fleet-proof.ps1` is the release-grade remote PC proof surface. `repair-fleet.ps1` is still the URL repair/check primitive; it is not by itself enough to prove installed version, brain token custody, or two-machine direct routing.
- Fleet audit release proof must prove the installed MSIX package version matches the current repo release package version. Stale installed packages may be inspected only with the explicit `-ExpectedPackageVersion <old>` or `-AllowInstalledPackageVersionMismatch` diagnostic path.
- Packaged first-run proof requires the brain ingest token file to exist and have a restricted ACL; for rc.22 on `hugh_second`, `~/.musu/brain/runtime/musu-ingest.token` exists and is owner-only.
- Brain sidecar coherence is currently `product_version + VCS revision + clean build info`, not native `musu-brain --version`.
- `desktop-latest` HTTP 200 is not release readiness. Readiness requires version/hash/content-length canary plus live `musu.pro` install-channel verification.

## Next Steps

1. Install/launch rc.22 on `hugh-main`:
   `irm https://musu.pro/install.ps1 | iex`
2. Launch MUSU once on `hugh-main`, then run:
   `& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -ExpectedNodeName hugh-main -ExpectedDirectPeerName hugh_second -RequireBrainToken -Json`
3. Attach the resulting `musu.fleet_node_proof.v1` JSON as the physical two-machine direct-route proof.
4. Before giving the one-line install command to another PC, run:
   `powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing https://musu.pro/install.ps1).Content)) -ValidateReleaseOnly"`
5. Before each full release build, run:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\build-msix.ps1 -NoBump -PreflightOnly`
6. Resolve PR #34 design-gate with explicit approval evidence.
