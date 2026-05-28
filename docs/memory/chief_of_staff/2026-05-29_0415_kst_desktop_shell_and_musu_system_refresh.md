# CoS Memory Note - Desktop Shell + musu-system Refresh (2026-05-29 04:15 KST)

Facts:

- `musu-bee` now has a dedicated static Tauri runtime launcher/status shell under `musu-bee/src-tauri-shell`.
- `npm run build:tauri-shell` writes `musu-bee/out/index.html` plus shell assets.
- `npm run tauri:build` now succeeds with numeric Tauri bundle version `1.15.0`, producing MSI and NSIS bundles.
- The Tauri app exposes `desktop_status`, `start_runtime`, and `open_dashboard` commands.
- `open_dashboard` is restricted to local HTTP dashboard URLs.
- Desktop readiness audit now reports `runtime_package_ready=True`, `desktop_shell_ready=True`, `multi_device_verified=False`, `public_desktop_release_ready=False`.

Decision:

- The Tauri shell is a valid basic launcher/status surface.
- It is not the full dashboard GUI and should not be marketed as such.
- Public desktop release readiness still remains blocked by the second-PC multi-device verification gate.

Adjacent ecosystem refresh:

- `yellowhama/musu-system` HEAD `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40` was rechecked.
- Split repos `musu-crawl-ai`, `musu-marketer`, and private `musu-nurikun` cloned successfully but are behind the monorepo HEAD for this audit.
- `go test ./core/... ./crawl-ai/... ./marketer/... ./nurikun/...` passed from `F:\workspace\tmp\musu-system-latest`.
- Integration decision remains: adapter/MCP/CLI/shared-contract integration later, not Rust-core merge and not first Store package bundling.

Canonical docs:

- `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md`
- `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`
