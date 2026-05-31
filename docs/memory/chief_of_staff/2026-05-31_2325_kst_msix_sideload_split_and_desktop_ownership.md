# CoS Memory — MSIX Sideload Split and Desktop Ownership

Date: 2026-05-31 23:25 KST

MUSU 1.15.0-rc.1 desktop-entrypoint evidence is now split by package contract:

- Store-reviewed artifact proof uses `store-reviewed-immediate-registration`
  without `-RequireInstalledPackage`; it confirms the Partner Center artifact
  launches `musu-desktop.exe`, keeps `musu.exe` as the CLI alias, keeps
  `musu-startup.exe` as the startup task, and carries the Store-only restricted
  startup capability.
- Local install proof uses `local-sideload-manual -RequireInstalledPackage`;
  this is the correct primary/second-PC install and runtime CPU test path until
  the Microsoft Store-signed package is available.
- Store-reviewed restricted-capability MSIX is not ordinary sideload evidence.
  `install-msix.ps1` and `install-and-verify-msix.ps1` refuse it by default
  unless `-AllowRestrictedCapabilitySideload` is explicitly supplied.

Evidence:

- `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.local-sideload-installed.evidence.json`
  passed with installed application executable `musu-desktop.exe`, alias
  `musu.exe`, startup task `musu-startup.exe`, and
  `startup_contract_matches_artifact=true`.
- `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.store-reviewed-contract-mismatch.evidence.json`
  failed as intended because the local-sideload installed package does not have
  the Store-only non-user-configurable startup capability.

Code hardening:

- `write-release-go-no-go.ps1` now requires both Store-reviewed artifact proof
  and local-sideload installed proof for `msix_desktop_entrypoint_verified`.
- `verify-final-operator-gate-packet.ps1` checks that bundled go/no-go scripts
  retain this split.
- `audit-msix-desktop-entrypoint.ps1` records startup contract fields and fails
  installed audits when artifact/installed startup contracts differ.
- `measure-musu-idle-cpu.ps1` and `audit-musu-process-ownership.ps1` include
  `musu-desktop` as a MUSU root process, so packaged WebView2 children are
  attributed correctly.
- `musu up` now attempts to terminate a live but unhealthy registered bridge PID
  before spawning a replacement bridge.

Validation:

- `cargo check -j 1` passed in `musu-rs`.
- `rustfmt --edition 2024 --check src\bridge\services.rs src\install\cli_commands.rs` passed.
- Local process ownership audit passed with `musu_runtime=1`,
  `desktop_shell=1`, `owned_node=0`, `owned_webview2=6`,
  `machine_wide_node=2`, `machine_wide_webview2=19`, and bridge `/health`
  HTTP 200.
- A clean committed `desktop-open` CPU diagnostic passed at
  `.local-build\runtime-idle-cpu\musu-idle-cpu-20260531-235500.json` with
  `git_dirty=false`, two MUSU roots, six MUSU-owned WebView2 helpers, zero owned
  Node helpers, max one-core CPU `musu=0.03` and `webview2=0.03`, and total
  working set `363.45MB`. Final release still requires the same evidence on the
  second PC.

Release decision:

`msix_desktop_entrypoint_verified` is no longer the main blocker in local
diagnostics. Public desktop release remains No-Go because single-machine smoke
evidence is stale for the current code, clean two-machine runtime idle CPU
evidence is missing, multi-device route evidence still fails, support inbox
delivery is unrecorded, Store/Microsoft approval is unrecorded, and source-fresh
build reliability is unresolved due local rustc/LLVM OOM/pagefile pressure.
