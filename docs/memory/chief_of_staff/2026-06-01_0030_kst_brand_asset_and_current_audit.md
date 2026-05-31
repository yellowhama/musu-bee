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
- Current recorded single-machine evidence after CLI route-evidence writer work is `docs\evidence\single-machine\1.15.0-rc.1\20260601-040308-HUGH_SECOND.evidence.json` on commit `e8ac5a88c1dd9437c965f2d2e2f2c3b331596c2a`, with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_040245`, CLI output `MUSU_CLI_ROUTE_OK_20260601_040245`, dashboard task `612c8aff-616e-4227-89dc-7023a77d4830`, bridge `http://127.0.0.1:13800`, and `dashboard_task_poll_error_count=0`.
- Runtime idle CPU go/no-go now rejects stale CPU evidence when non-documentation changes exist after the evidence commit. The current primary packaged desktop-open sample is `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-040413-HUGH_SECOND.desktop-open.evidence.json` on commit `b330de8`, with `git_dirty=false`, packaged desktop, owned WebView2 `6`, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.21`, total working set `369.66MB`, and no resource-budget violations.
- The second-PC release wrapper now captures runtime idle CPU evidence by default: after MSIX install and handoff, it opens MUSU Desktop and runs the 60s `desktop-open` measurement with owned WebView2 required. The return zip includes `.local-build\runtime-idle-cpu\*.evidence.json`, and `import-second-pc-return.ps1` imports it by schema without confusing it for MSIX install evidence.
- P2P control-plane status: Rust cloud DTO/client methods exist, and bridge route selection now ranks direct candidates by path kind (`lan` -> `tailscale` -> `direct_quic`) for explicit target, GPU, and OS-hint routing. It still does not create rendezvous sessions or submit hardened route evidence.
- Route/relay diagnostic status: `musu route --explain [--json]` and `musu relay status [--json]` now expose the current gap without overclaiming. They report current `http_bearer` transport, missing identity/encryption/handshake proof, `bridge_path_selection_wired=true`, `rendezvous_session_wired=false`, and `relay_transport_wired=false`. They do not close multi-device release evidence.
- Route-attempt evidence status: `musu route --route-evidence-path <path>` now writes `musu.route_evidence.v1` from the real CLI route attempt, and `smoke-multidevice-beta.ps1` imports that file instead of synthesizing route evidence. The current evidence still records `peer_identity_verified=false` and `encryption=none_http_bearer`, so the release verifier correctly rejects it until hardened identity/encryption proof exists.
- Final go/no-go after route diagnostics from clean HEAD `0c09f0c` remains `ready_for_public_desktop_release=false`. Passing gates: local artifacts, current single-machine smoke, MSIX install, MSIX desktop entrypoint, process ownership, startup single-instance, live public metadata, and clean manifest git state. Remaining blockers: real second-PC multi-device route evidence, two-machine runtime idle CPU evidence, `musu@musu.pro` delivery verification, and Partner Center/Store release evidence.

Next operators should not claim public release readiness from this run. Collect two-machine desktop-open CPU evidence and real route evidence, then close the support inbox and Store evidence gates.
