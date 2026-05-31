# CoS Memory: Brand Asset Audit and Current Release State

**Date**: 2026-06-01 00:30 KST
**Scope**: MUSU 1.15.0-rc.1 Store/Desktop release readiness.

Durable updates:

- The official app/favicon mark currently comes from `musu-bee/src-tauri/icons/icon.png`.
- Web references to `/images/favicon-header.png` were backed by local files but not tracked because `musu-bee/.gitignore` ignored all `public/`.
- Required public runtime images are now tracked: `musu-bee/public/images/favicon-header.png` and `musu-bee/public/agents/*.png`.
- Static logo lockups now exist under `musu-bee/public/images/logos/`: `musu-mark-512.png` plus header/display/hero transparent PNG lockups for `on-light`, `on-dark`, and `on-yellow`. Regenerate them with `scripts/windows/generate-brand-logo-assets.ps1`.
- `MusuLogo` now renders the tracked app mark plus a MUSU text wordmark instead of referencing missing `/images/logos/*` PNG assets.
- `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_NEXT_STEPS_2026_06_01.md` (wiki/527) is the latest qualitative/code-audit addendum.
- `npm run typecheck` passed after the logo/public asset fix.
- A current single-machine smoke attempt on commit `5e8d195` failed during dashboard task-status polling. The bridge stayed healthy at `http://127.0.0.1:10954`, but the dashboard became unreachable and PowerShell log-tail commands hit OOM/CLR errors. No new release evidence was recorded.
- Follow-up smoke hardening made dashboard/CLI expected strings unique per run and retries dashboard task-status polling within the task deadline. Local `.local-build` smoke evidence `20260601-003017-HUGH_SECOND` on commit `31c5ee7` passed with `dashboard_task_poll_error_count=0`.
- User-supplied `mdns_sd::service_daemon` logs showed Tailscale IPv6 link-local multicast send failures (`os error 10065`) and `closed channel` errors. mDNS now disables IPv6 interfaces by default; IPv6 mDNS requires `MUSU_MDNS_ENABLE_IPV6=1`.
- `cargo check -j 1`, `cargo build --bin musu -j 1`, and `musu discover --timeout 2` passed after the mDNS change.
- Current recorded single-machine evidence after route/relay diagnostic CLI work is `docs\evidence\single-machine\1.15.0-rc.1\20260601-030639-HUGH_SECOND.evidence.json` on commit `12f8cabaefb5722eb45941012d47848d95c9f895`, with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_030619`, CLI output `MUSU_CLI_ROUTE_OK_20260601_030619`, dashboard task `42449837-4936-4e79-82a6-d7bbeede6108`, bridge `http://127.0.0.1:14130`, and `dashboard_task_poll_error_count=0`.
- Runtime idle CPU go/no-go now rejects stale CPU evidence when non-documentation changes exist after the evidence commit. The current primary packaged desktop-open sample is `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-030838-HUGH_SECOND.desktop-open.evidence.json` on commit `e0eebac`, with `git_dirty=false`, packaged desktop, owned WebView2 `6`, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.21`, total working set `371.96MB`, and no resource-budget violations.
- The second-PC release wrapper now captures runtime idle CPU evidence by default: after MSIX install and handoff, it opens MUSU Desktop and runs the 60s `desktop-open` measurement with owned WebView2 required. The return zip includes `.local-build\runtime-idle-cpu\*.evidence.json`, and `import-second-pc-return.ps1` imports it by schema without confusing it for MSIX install evidence.
- P2P control-plane status remains: Rust cloud DTO/client methods exist, but bridge route selection still uses local/manual peer discovery and does not create rendezvous sessions or submit hardened route evidence.
- Route/relay diagnostic status: `musu route --explain [--json]` and `musu relay status [--json]` now expose the current gap without overclaiming. They report current `http_bearer` transport, missing identity/encryption/handshake proof, and unwired bridge path selection/relay transport. They do not close multi-device release evidence.

Next operators should not claim public release readiness from this run. Collect two-machine desktop-open CPU evidence and real route evidence, then close the support inbox and Store evidence gates.
