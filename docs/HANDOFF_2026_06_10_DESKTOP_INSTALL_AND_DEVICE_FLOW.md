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

> **UPDATE 2026-06-10: #1 below is DONE** — the desktop E2E was proven on a real
> PC (hugh_second installed the MSIX after trusting the cert, launched MUSU,
> device-flow fired, approved at musu.pro, node connected; token + bridge.json
> written). The full ordered plan now lives in
> **`ROADMAP_2026_06_10_POST_DESKTOP_E2E.md`** — read that for sequencing. The
> items below remain accurate as context.

1. **(DONE) Prove the desktop E2E on a real PC.** Owner-driven because
   it changes the running machine and needs admin (cert trust). Steps:
   - Trust cert: `Import-Certificate -FilePath "<repo>\.local-build\msix\output\blossompark.musu_cert.pfx" -CertStoreLocation Cert:\LocalMachine\TrustedPeople` (admin). Or download the cert from the public release.
   - Install: `Add-AppxPackage -Path "...\musu_1.15.0.0_x64_local-sideload-manual.msix"`
   - Launch MUSU from Start menu → expect `musu-startup open` to fire device-flow → browser opens musu.pro/device?code=... → approve → node connects.
   - If it works, "device-flow login is LIVE" finally holds for the desktop path, not just server-side.
   - NOTE: pre-release install is NOT one-click — the site now says so honestly
     (developer-preview cert-trust step). The cert dance is the real first-PC
     blocker; the Microsoft Store build (no cert step) is the actual fix.
2. **(DONE) Deploy musu-pro site to prod** — Phase A/C + install rework are LIVE
   on musu.pro (auto-deployed on push, `dpl_4PAYo`/`musu-j8tc5po26`). The
   critic-fix commit `8faed09` (honest cert copy + URL constant) is committed but
   **not yet pushed/deployed** — push musu-pro main to ship it.
3. **Tauri double-bridge race — DEFERRED, currently LATENT (critic 2b).** After
   `spawn_runtime_autostart` hands off `musu-startup open`, the gate drops before
   the bridge registers; the manual `start_runtime` (`lib.rs:~208`, `musu up
   --json`) could then double-spawn. The `AddrInUse` backstop does NOT save us
   because `BRIDGE_PORT` defaults to `0` (OS-dynamic) — two binds to `:0` both
   succeed. **It is latent because `start_runtime` has NO caller in the loaded web
   UI (verified: no `invoke("start_runtime")`).** It goes live the moment the
   cockpit wires a "start" button. **Do not add a start button to the cockpit
   without first** either holding `runtime_start_gate` until `bridge_is_healthy`,
   or routing both paths through the single `musu-startup open` entry point.
4. **cockpit GUI is design-only.** Positioning (v978, memory
   `decision-musu-desktop-gui-direction`) promises an in-app fleet cockpit, but the
   shell still loads the web UI. Site copy says "connects this PC" (true) but the
   aspirational "see your fleet in-app" must wait for the cockpit (critic MEDIUM 4).
   Separate, larger piece — scope it (Phase -1 grill recommended) rather than
   drifting. When you build it: it must read `startup-marker.json` to surface
   waiting→connected→failed (a silently-failed device-flow is currently invisible
   to the GUI), and it must NOT add a runtime-start button without fixing #3.

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
