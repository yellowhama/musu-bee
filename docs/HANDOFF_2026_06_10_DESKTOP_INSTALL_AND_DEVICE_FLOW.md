# Handoff — Desktop install path + device-flow (2026-06-10)

**For the next agent.** This is where to start. Read this, then GOAL.md rows
v975–v980 and `DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md` §10.

## TL;DR of where things stand

- **musu.pro device-flow login: server-side LIVE and verified.** Start + poll
  (POST body) + approve all work against production musu.pro. The cross-repo
  poll-contract bug (client POSTs body, server only took GET query) is fixed and
  live-verified (202 pending on POST+body).
- **Desktop app: code complete, NOT proven end-to-end on a real PC.** The Tauri
  shell launches `musu-startup open` (device-flow fires from the GUI), and the
  MSIX is rebuilt. But nobody has installed the .msix on a real machine and run
  the full launch→approve→connect loop. **This is the #1 next task.**
- **musu.pro install path: Windows now downloads the .msix desktop app**, hosted
  on a public fixed-tag GitHub release. Committed but **NOT deployed to prod yet**
  (production deploy is owner-gated).
- mac/linux are still CLI-only, and the CLI binary download is currently broken
  for anonymous users (see Known Debt).

## What shipped this session (commits)

musu-bee, branch `fix/audit-findings-2026-06-08`:
- `61ed33b5` — extract login family to `musu-rs/src/install/cli_commands/device_login.rs` (thermo blocker). Pure move; `pub use` re-exports keep call sites working. **Login code is no longer in cli_commands.rs.**
- `75b91d26` — Tauri shell (`musu-bee/src-tauri/src/lib.rs`) `spawn_runtime_autostart` now spawns `musu-startup.exe open` fire-and-forget (was `musu up --json`, which `--json`-guards device-flow OFF). Added `musu_startup_path()` + `sibling_exe_for_current_exe()`. 16 tests pass.
- `40eec73c`, `b33fe900` — doc sync (ARCHITECTURE stale banner, ONBOARDING, GOAL, spec §10).

musu-pro, branch `main` (these are committed but **NOT pushed / NOT prod-deployed**):
- `8644484` — device route POST disambiguates body shape (device_code = poll, else = start); shared `pollByDeviceCode()`. **Deployed to prod + live-verified** (this one was deployed; the ones below are not).
- `82bda51` — Windows install = .msix download button; swept ~10 stale private-repo links to public musu-bee.
- Earlier `df7e259`/`b055eee`/`3296fed` (migration + onboarding Phase A/C) — already on prod from earlier this session.

GitHub release (public): `github.com/yellowhama/musu-bee` tag `desktop-latest`
(prerelease) — assets `musu-desktop-x64.msix` (26.5MB) + `blossompark.musu_cert.pfx`.
Anonymous download verified HTTP 200.

## Verification status (honest)

| Thing | Status |
|---|---|
| musu.pro home/start/poll/device | ✅ live 200/202 |
| POST+body poll (Rust contract) | ✅ live-verified 202 pending |
| device_login extraction | ✅ cargo check + 4 tests |
| Tauri rewiring | ✅ cargo check + 16 tests (unit; runtime double-spawn NOT tested) |
| MSIX build + sign | ✅ artifact exists, signed |
| **Real-PC install → launch → approve → connect** | ❌ **NOT done** (owner-gated; cert-trust barrier) |
| musu-pro site changes on prod | ❌ committed, not deployed |
| anonymous .msix download | ✅ HTTP 200 |
| mac/linux CLI install (anonymous) | ❌ broken (Known Debt) |

## NEXT TASKS, ranked

1. **Prove the desktop E2E on a real PC (highest priority).** Owner-driven because
   it changes the running machine and needs admin (cert trust). Steps:
   - Trust cert: `Import-Certificate -FilePath "<repo>\.local-build\msix\output\blossompark.musu_cert.pfx" -CertStoreLocation Cert:\LocalMachine\TrustedPeople` (admin). Or download the cert from the public release.
   - Install: `Add-AppxPackage -Path "...\musu_1.15.0.0_x64_local-sideload-manual.msix"`
   - Launch MUSU from Start menu → expect `musu-startup open` to fire device-flow → browser opens musu.pro/device?code=... → approve → node connects.
   - If it works, "device-flow login is LIVE" finally holds for the desktop path, not just server-side.
2. **Deploy the musu-pro site changes (`82bda51`) to prod.** Owner-gated. Preview
   first (Vercel builds fine — local build only fails on sandbox Google-Fonts fetch).
   After deploy, confirm the Windows download button on musu.pro pulls the .msix.
3. **Decide the Tauri gate semantics (audit MEDIUM).** `runtime_start_gate` drops
   right after the fire-and-forget spawn, leaving a narrow window where the manual
   `start_runtime` Tauri command (`lib.rs:~208`, still uses `musu up --json`) can
   double-spawn before `musu-startup`'s bridge registers its pid. Port-bind
   backstops an actual double-bridge, but the UI shows "offline" during the window.
   Either hold the gate until the bridge registers, or treat a recent handoff as
   in-progress. Confirm the bridge port is fixed (not dynamic) — open question.
4. **cockpit GUI is design-only.** Positioning (v978, memory
   `decision-musu-desktop-gui-direction`) promises an in-app fleet cockpit, but the
   shell still loads the web UI. This is a separate, larger piece — scope it
   (Phase -1 grill recommended before building) rather than drifting.

## KNOWN DEBT (don't rediscover these)

- **CLI binary download is broken for anonymous users.** `public/install.ps1` and
  `install.sh` have `$Repo="yellowhama/Musu"` (capital M, **PRIVATE**). The CLI
  binaries (musu-linux/macos/windows) live only on that private repo's v1.8.0
  release → 404 for anonymous mac/linux users. NOT fixed because public musu-bee
  has no current CLI release (only desktop-latest + stale v0.2.3); flipping `$Repo`
  would serve v0.2.3, worse. **Fix = publish CLI binaries to a public release**
  (mirror the CI that builds v1.8.0 to a public repo, or make Musu public).
- **Self-signed sideload MSIX = poor Windows UX.** Until the app is published to
  the Microsoft Store (ID `9NJ645MQ04T3` is reserved but NOT published — verified
  apps.microsoft.com returns 410), users must manually trust the cert. The Store
  path is the real fix; the .msix download is an interim bridge.
- **cli_commands.rs is still ~6214 lines.** The login extraction relieved the
  thermo blocker symbolically but the file is still a giant catch-all. Route/relay/
  room families are the next extraction candidates (thermo flagged them).
- **mac/linux have no desktop app** — CLI only, by design for now.
- **Local index not refreshed this session.** `scripts/auto-index.sh` needs `flock`
  (absent on Windows Git Bash) and a built `musu-indexer/musu-scanner` (not present
  in this checkout). Re-run from a Linux/cron host, or build the Go scanner first.
  Not a blocker — it only refreshes the local search DB (`.musu_dev.db`).

## Repo map (so you don't put things in the wrong place)

- `github.com/yellowhama/musu-bee` — **PUBLIC**. Rust runtime (`musu-rs`) + Tauri
  shell (`musu-bee/src-tauri`). Our code. Has the `desktop-latest` .msix release.
- `github.com/yellowhama/Musu` — **PRIVATE**. Old public-release channel; has the
  v1.8.0 CLI binaries. Don't link users here (404).
- `github.com/yellowhama/musu-pro` — **PRIVATE**. The musu.pro site (Vercel project
  `vibecode-town`, prod = musu.pro). Deploy via `vercel --prod` from
  `F:\Aisaak\Projects\musu-pro` (NOT git-push; production is owner-gated).

## Pointers

- Spec + roadmap: `docs/DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md` (§10 is current).
- GOAL log: `docs/GOAL.md` rows v975–v980.
- Memory: `decision-musu-desktop-gui-direction`, `reference-musu-device-flow-blocker`, `reference-musu-store-identity`, `decision-musu-backend-rust`.
- Architecture: `docs/ARCHITECTURE.md` has a STALE banner (Python era) — real backend is Rust in `musu-rs/`.
