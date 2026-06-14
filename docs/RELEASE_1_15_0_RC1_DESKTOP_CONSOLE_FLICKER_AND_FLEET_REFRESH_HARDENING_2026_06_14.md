# Release 1.15.0-rc.1 Desktop Console Flicker And Fleet Refresh Hardening

Date: 2026-06-14

## Problem

The desktop cockpit could still create visible Windows console flashes even after
the GUI entrypoint itself was console-free.

Three independent causes were confirmed:

- External agent MCP processes launched via `npx.cmd` can create transient
  console windows unless wrapped by a hidden Windows subsystem runner.
- MUSU desktop fleet refresh used to spawn `musu.exe nodes --json --local` from
  the GUI refresh loop. Even with `CREATE_NO_WINDOW`, a high-frequency UI poll
  should not depend on a console-subsystem child process when the same bridge
  data is already available over the local authenticated bridge API.
- The cockpit's private-mesh status poll still used `musu.exe mesh status
  --json`. That command is still allowed as an explicit status check, but it
  must not run from a short 15-second UI refresh loop.

## Product Standard

The desktop cockpit must behave like a single polished device, not like a CLI
launcher:

- The fleet list refreshes without spawning child CLI processes.
- Long-running desktop child commands remain hidden on Windows.
- Bridge-local reads use the bridge's authenticated HTTP API.
- Malformed local bridge tokens fail closed instead of becoming HTTP headers.
- If a connected/local bridge yields an empty transient fleet response, the
  cockpit still shows the current machine instead of a blank fleet.
- Offline or unreadable peers degrade to empty/error states without fabricated
  stale timestamps.
- Private-mesh status is cached and deduplicated so a passive cockpit screen
  does not keep launching CLI status checks.

## Implementation

`musu-bee/src-tauri/src/lib.rs` now reads fleet state directly from the live
bridge:

- `list_fleet()` reads the registered local bridge URL from the bridge registry.
- It reads `MUSU_BRIDGE_TOKEN` from env or `~/.musu/bridge.env`.
- It calls `GET /api/fleet/status` with `Authorization: Bearer <token>`.
- It projects the bridge dashboard's `this_node` and `peers` directly into
  desktop `FleetNode` rows.
- It returns an empty fleet when the bridge URL, token, or local bridge is not
  ready, preserving the cockpit's connecting/degraded UX.
- The cockpit treats that empty fleet as `this machine` when the bridge state is
  otherwise known to be usable, so the user can still give local work.

The bearer header boundary is explicit:

- Empty tokens are rejected.
- CR, LF, DEL, and other control characters are rejected.
- Only a trimmed token is formatted into the `Authorization` header.

`musu-bee/src-tauri-shell/cockpit-contract.test.ts` now guards the desktop
process contract:

- `start_login`, `spawn_musu_startup_open`, and `run_command_with_timeout` must
  spawn through `no_window`.
- Windows builds must keep `CREATE_NO_WINDOW`.
- `list_fleet()` must not call `run_command_with_timeout()` or
  `musu_command_path()`.
- `list_fleet()` must use `http_get_with_bearer(..., "/api/fleet/status", ...)`.
- Bearer header construction must reject control characters.
- Connected fleet rendering must fall back to the current machine when
  `list_fleet()` returns an empty array.
- Private-mesh status refresh must be cached, reuse an in-flight request, and
  force refresh only after explicit proof/release/callback actions.

`musu-bee/src-tauri-shell/main.js` now throttles `private_mesh_status`:

- The cockpit keeps a five-minute private mesh status cache.
- Concurrent callers reuse the same in-flight request.
- Explicit mesh proof, proof release, and callback proof completion force a
  refresh because those are user-visible state transitions.

## Operator Mitigation Applied

Outside the repository, the local Codex/Claude MCP configuration was changed to
wrap `npx` MCP servers with:

`C:\Users\empty\.codex\bin\mcp-hidden-runner.exe`

The active stale Claude Code process tree that was still running an MSIX build
was stopped. That process tree was a plausible reason terminal windows kept
appearing even after Codex itself was closed.

## Verification

Run from `F:\workspace\musu-bee\musu-bee`:

```powershell
npm run test:tauri-shell
```

Result: 41 passed.

Run from `F:\workspace\musu-bee\musu-bee\src-tauri`:

```powershell
cargo test bearer_authorization_header --quiet
cargo check --quiet
```

Result: bearer header tests passed; `cargo check` passed.

Packaged artifact build, without installing on the machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\build-msix.ps1 `
  -GenerateCert `
  -Version "1.15.0.0" `
  -OutputDir ".local-build\msix\output-console-flicker-hardening"
```

Result: local-sideload MSIX built and signed:

- `.local-build\msix\output-console-flicker-hardening\musu_1.15.0.0_x64_local-sideload-manual.msix`
- `.local-build\msix\output-console-flicker-hardening\musu-desktop-x64.msix`
- `.local-build\msix\output-console-flicker-hardening\musu.appinstaller`

Artifact verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1 `
  -PackagePath ".local-build\msix\output-console-flicker-hardening\musu_1.15.0.0_x64_local-sideload-manual.msix" `
  -StartupContract local-sideload-manual `
  -SkipSmoke

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-msix-desktop-entrypoint.ps1 `
  -PackagePath ".local-build\msix\output-console-flicker-hardening\musu_1.15.0.0_x64_local-sideload-manual.msix" `
  -StartupContract local-sideload-manual `
  -ExpectedApplicationExecutable "musu-desktop.exe" `
  -Json

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-appinstaller-contract.ps1 `
  -OutputDir ".local-build\msix\output-console-flicker-hardening"
```

Results:

- `verify-msix-package.ps1`: passed; package contains `musu-desktop.exe`,
  `musu.exe`, `musu-startup.exe`; application executable is
  `musu-desktop.exe`; alias executable is `musu.exe`; startup executable is
  `musu-startup.exe`.
- `audit-msix-desktop-entrypoint.ps1`: `ok=true`, `fail_count=0`; Start-menu
  artifact entrypoint is the desktop shell, not the runtime CLI.
- `audit-appinstaller-contract.ps1`: passed; `.appinstaller` is well-formed,
  BOM-free, and `MainPackage` identity fields match the packaged MSIX.

Hashes:

- `AD04AF5F029DB11C021E8CE5FE17C7029E528CE2FE2ACBA6B6E09C4D6E453159`
  `.local-build\msix\output-console-flicker-hardening\musu_1.15.0.0_x64_local-sideload-manual.msix`
- `AD04AF5F029DB11C021E8CE5FE17C7029E528CE2FE2ACBA6B6E09C4D6E453159`
  `.local-build\msix\output-console-flicker-hardening\musu-desktop-x64.msix`
- `4CC4BCF59CD7F4A3325664E8CF2389CF132F6C28F348405321ABD8D68D125D34`
  `.local-build\msix\output-console-flicker-hardening\musu.appinstaller`
- `DB9083FD642E90B025985BAD56DE07575922B66248CBAC38C64C25E42301CA52`
  `musu-bee\out\main.js`
- `9F3FD58FF198BD327EC70A70D7DE80E04273AE08B7524B5DA4AF88672029F8FA`
  `musu-bee\src-tauri\target\release\musu-desktop.exe`
- `4284DDA8D616BB725E318B32E46CD0B5246AFC0D5B92A08C0515DE9EABC359FB`
  `musu-rs\target\release\musu.exe`
- `A97041A03FF42EC332C8622E56B626E3330121C19256E95646B9D959FFBD423C`
  `musu-rs\target\release\musu-startup.exe`

Installed runtime verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\build-msix.ps1 `
  -SkipBuild `
  -Version "1.15.0.2" `
  -OutputDir ".local-build\msix\output-console-flicker-hardening-throttled" `
  -CertPath ".local-build\msix\output\blossompark.musu_cert.pfx"

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-msix.ps1 `
  -PackagePath ".local-build\msix\output-console-flicker-hardening-throttled\musu_1.15.0.2_x64_local-sideload-manual.msix" `
  -CertPath ".local-build\msix\output\blossompark.musu_cert.pfx" `
  -StartupContract local-sideload-manual `
  -SkipCertInstall

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-installed-msix-package.ps1 `
  -StartupContract local-sideload-manual `
  -CheckAlias

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-msix-desktop-entrypoint.ps1 `
  -PackagePath ".local-build\msix\output-console-flicker-hardening-throttled\musu_1.15.0.2_x64_local-sideload-manual.msix" `
  -StartupContract local-sideload-manual `
  -ExpectedApplicationExecutable "musu-desktop.exe" `
  -RequireInstalledPackage `
  -Json
```

Results:

- `verify-installed-msix-package.ps1`: passed for
  `blossompark.musu_1.15.0.2_x64__f5h38pf4yt4gc`; alias check passed; no legacy,
  alias, or startup conflicts were reported.
- `audit-msix-desktop-entrypoint.ps1`: `ok=true`, `fail_count=0`; installed
  Start-menu entry is `musu-desktop.exe`, installed CLI alias is `musu.exe`, and
  startup task executable is `musu-startup.exe`.
- `Get-AppxPackage blossompark.musu`: version `1.15.0.2`,
  `SignatureKind=Developer`, `Status=Ok`.

Runtime sampling after launching the installed Start-menu entry
`shell:AppsFolder\blossompark.musu_f5h38pf4yt4gc!MUSU`:

```text
started_at=2026-06-14T23:43:12.6338916+09:00
duration_seconds=60
unique_musu_processes=2
nodes_processes=0
mesh_status_processes=0
other_child_cli_processes=0
```

Unique observed processes:

```text
musu-desktop.exe
musu.exe startup open
```

Installed-runtime gate status: passed. The tested package no longer creates
recurring `musu.exe nodes`, `musu.exe mesh status`, or other transient child CLI
processes during passive cockpit refresh.
