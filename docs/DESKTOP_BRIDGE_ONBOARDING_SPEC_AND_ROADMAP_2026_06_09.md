# MUSU Desktop = The Local Bridge — Onboarding Spec & Roadmap

**Date**: 2026-06-09
**Status**: Spec + roadmap. Device-flow login is LIVE (proven this session:
`hugh_second` connected to musu.pro via `musu login`). This doc defines the
product spec for completing the Desktop app as the full local↔cloud bridge and
the roadmap to near-one-click onboarding.

## 1. Architecture (confirmed) — why the Desktop app exists

```
[user PC: terminal / claude CLI]  ←→  [Desktop app (bridge)]  ←→  [musu.pro site]
       execution happens here          the LOCAL BRIDGE              coordination plane
```

The browser (musu.pro) is sandboxed: it **cannot** run a terminal, write files,
or install software on the visitor's PC. That is a fundamental web security
boundary, not a MUSU limitation. Yet MUSU's thesis is **local execution** — AI
runs on the user's own machine (their `claude` CLI, their files, their env, their
cost), not on a cloud VM (the Manus/Devin/e2b model).

**The Desktop app resolves this tension.** It is the user-PC-side agent that:
- runs the local `bridge` (already implemented: `musu-startup.rs` →
  `ensure_bridge_token` → `bridge::run()`),
- receives musu.pro's authenticated coordination (work orders, room events),
- dispatches them to the local `claude` CLI,
- and is the **device-flow subject** — the thing that obtains and stores the
  account token in `~/.musu/token` (which the browser can never do).

This is exactly why device authorization flow (RFC 8628) is the right pattern:
the token must land on the user's machine, so the user's CLI/Desktop must
originate the code; the browser only approves.

## 2. The gap (current state)

`musu-startup.rs` today only does `bridge::run()`. It does **not**:
- detect "not logged in" on boot,
- auto-start device-flow (issue a code + surface the approve URL),
- complete the connection without the user manually typing `musu login`.

So today's other-PC onboarding is: copy-paste install → **manually run
`musu login`** → approve in browser. The middle step is undiscoverable. The
Desktop app is "half a bridge" — it carries traffic but doesn't self-connect.

## 3. Target spec — "app launch + approve click"

Desired flow on another PC:

```
1. musu.pro SetupWizard shows the install one-liner  →  user copy-pastes
2. Desktop app launches (or `musu up` runs)
3. App detects NO account token  →  auto-starts device-flow:
     "Approve this device at https://musu.pro/device?code=ABC123"
     (also deep-links / opens the browser if a GUI context)
4. User clicks Approve in musu.pro (already signed in)
5. App polls, receives the token, writes ~/.musu/token, registers the node
6. Connected. 🎉
```

Manual terminal commands after install: **zero**. Clicks: **one (approve)**.
This is the realistic floor — "fully one-click in the browser" is physically
impossible (browser can't place the token on the PC).

## 4. Hard constraints (what the design must respect)

- **Token lands on the user PC only.** The browser/wizard can NOT mint or place
  `~/.musu/token`. The device code must originate from the user's CLI/Desktop;
  the wizard can only show "approve the code your app printed" + a deep link.
- **No interactive hang in non-interactive contexts.** Auto device-flow on boot
  must be guarded: only when interactive (TTY / GUI), NEVER in `--json`,
  service/systemd/ScheduledTask, or CI — a 900s blocking poll on a headless
  boot is a severe regression.
- **Piped installers (`irm|iex`, `curl|bash`) have no TTY** (stdin is the pipe).
  They cannot run interactive login. The installer must PRINT clear next steps
  (or hand off to the Desktop GUI), not embed a hanging `musu login`.
- **Idempotent.** Re-launching when already logged in must be a no-op (don't
  re-trigger device-flow if `~/.musu/token` is valid).

## 5. Roadmap (ordered by risk, each independently shippable)

**Phase 1 — Discoverability (lowest risk, no behavior change):**
- install.ps1 / install.sh end by printing "Next: run `musu login` (or launch
  MUSU Desktop) to connect to musu.pro." Today they only mention `musu bridge`.

**Phase 2 — Auto device-flow on interactive boot (the core gap):**
- In `musu up` (and the Desktop launch path), after ensuring the bridge: detect
  missing account token; if interactive (TTY/GUI) and not `--json`, auto-run the
  existing `run_login` flow (print code + approve URL, poll, save token,
  register node). Reuse `run_login` — do not reimplement. Guard all
  non-interactive paths to skip and just print guidance.

**Phase 3 — Desktop GUI surface (best UX):**
- The Desktop app shows the device code + an "Open approval page" button (deep
  link to `https://musu.pro/device?code=...`) and a live "waiting → connected"
  status, so the user never sees a terminal. (The Tauri shell is currently a
  launcher/status surface per the Store doc — this extends it minimally.)

**Phase 4 — SetupWizard alignment (web side, musu-pro repo):**
- Add a "Sign in" step between Install and Connect that explains: "Your app will
  show a code — approve it here." The wizard already polls for connection in
  StepConnect; this just frames the approval so users aren't lost.

## 6. Const gates / rollback / scope cut

- **Const gate**: Phase 2 touches the boot path (`musu up` / Desktop launch) —
  bridge behavior must stay byte-identical for the already-logged-in and
  non-interactive cases. Production deploy of musu-pro SetupWizard (Phase 4) is
  a separate deploy gate.
- **Rollback**: each phase is additive; Phase 2's auto-login is behind an
  interactivity guard, so disabling = remove the guarded call.
- **Scope cut**: do NOT build cloud-VM execution (that breaks the local-execution
  thesis). Do NOT try to make the browser place the token. Keep Phase 2 to
  reusing `run_login` behind a TTY/GUI guard.

## 7. Spec deltas to other docs (to propagate)

- `ONBOARDING.md`: replace the manual `musu login` step with "launch Desktop /
  `musu up` → approve the shown code" once Phase 2 lands.
- `ARCHITECTURE.md`: state Desktop app = local bridge + device-flow subject.
- P2P control-plane spec: note device-flow is the node's auth bootstrap.

## 8. Implementation status (2026-06-09)

Two tracks landed on `fix/audit-findings-2026-06-08`:

**CLI-smoothing (onboarding discoverability):**
- Phase A (musu-pro `b055eee`): install.ps1/.sh "Get started" now leads with
  `musu up` for sign-in (was bridge/doctor only).
- Phase B (musu-bee `c2487700`): `musu up` auto-starts device-flow when no
  account token, guarded by `not-logged-in AND !--json AND TTY`. Service boot
  uses `bridge::run()` directly so it is never affected.
- Phase C (musu-pro `3296fed`): SetupWizard step 2 uses `musu up` + sign-in
  framing.

**Desktop unification (the "one app" goal) — Phase 1 (musu-bee `977a201c`):**
- `musu-startup` (the Desktop app) now distinguishes user launch
  (`musu-startup open`) from service/logon boot (bare / `--service`). Only the
  user-launch path runs the unified sequence: ensure bridge → check token →
  (if missing) device-flow that `open_url()`s the approval page → bridge stays
  up in foreground while device-flow runs as a detached task. Service boot is
  bridge-only (preserves the no-headless-device-flow guard).
- `run_login` decomposed into `DeviceFlow` + `initiate_device_flow` +
  `poll_and_finalize(quiet)` + `run_desktop_login`; CLI `run_login` unchanged.
- **No native GUI added** (no Tauri) — browser `/device` + dashboard are the UI.

**GUI decision (SUPERSEDED 2026-06-10):** The earlier "NO native window, browser
is the UI" call has been reversed by product direction. See §10.

> ~~NO native window now. Rationale: the approval UI (`LinkApprovalForm` at
> musu.pro/device) and status (`/dashboard/fleet`) already exist in the browser;
> adding Tauri/egui is YAGNI at single-user / few-PCs scale.~~ — superseded.

Why reversed: the product's identity is "other AI desktops connect to *their*
company's servers; MUSU connects to *your* computers." Like Claude/Codex
Desktop, everything should happen **inside the desktop app** — see your fleet,
give orders — not in a separate browser tab. The browser (musu.pro) becomes the
*fallback* surface for machines that can't install the desktop app, not the
primary one. This is not GUI-for-GUI's-sake: it is the product's core framing.

## 9. Remaining work (NOT done this session)

- **MSIX packaging wiring (separate — desktop shell not in this checkout):** the
  user-launch Application (`musu-desktop.exe`, the Tauri shell, lives outside
  `F:/workspace/musu-bee` — no `src-tauri/` here) must invoke
  `musu-startup.exe open` on user launch. The `windows.startupTask` correctly
  stays argless (= Service / bridge-only). `build-msix.ps1` Application/alias/
  startup mapping is unchanged; only the Tauri shell's spawn args need the
  `open` token.
- **SetupWizard `/device?code=` prefill** (Phase 2, musu-pro front): have
  `LinkApprovalForm` read the `code` query param so the deep link pre-fills.
- **Phase 2 status panel / Phase 3 tray** — deferred.

## 10. Session update 2026-06-10 (what changed since §8)

**READ THIS FIRST if you are a new agent picking up desktop work.** Three things
moved; do not re-derive them from the older sections.

1. **GUI direction REVERSED (see §8 supersede note).** The desktop app IS getting
   a native shell: **tray-resident + opens into a "fleet cockpit" window.** It is
   the primary surface (everything happens in-app: see your computers, give
   orders); musu.pro web is the *fallback* for machines without the desktop app.
   Full direction recorded in memory `decision-musu-desktop-gui-direction`.
   The plumbing (connection path LAN/Tailscale/relay, latency, tokens,
   device-flow stages) stays HIDDEN — "the user just wants it to work." Surface a
   problem only when there is one, paired with a fix button.

2. **device-flow poll contract FIXED (live).** A cross-repo bug was found and
   fixed: the musu-rs client polls via `POST /api/v1/auth/device` with
   `{device_code}` in the BODY (H-2: secret must not be in the query string), but
   the musu.pro server only accepted the legacy `GET ?device_code=`. A POST poll
   was misread as a fresh START, so login could never complete. Fixed in
   musu-pro `8644484`: POST now disambiguates by body shape (device_code = poll,
   else = start), poll logic shared with the deprecated GET. **Deployed + live-
   verified**: POST+body poll returns 202 `{status:"pending"}` (was 200 start).
   New clients MUST POST; the GET form is deprecated-but-kept.

3. **login family EXTRACTED.** The login code (`DeviceFlow`,
   `initiate_device_flow`, `poll_and_finalize`, `run_login`, `run_desktop_login`,
   logout/whoami + tests) moved OUT of the 6481-line `cli_commands.rs` into
   `install/cli_commands/device_login.rs` (a child module; `pub use` re-exports
   keep call sites unchanged). musu-bee `61ed33b5`. If you are looking for login
   code, it is NO LONGER in cli_commands.rs — look in device_login.rs.

**Deploy status (updated):**
- musu-pro Phase A/C + migration: ✅ DEPLOYED to musu.pro (`dpl_4Py9...`).
- musu-pro poll-fix: ✅ DEPLOYED + verified (`dpl_4PAYo...`).
- musu-bee Rust changes (Phase B + Phase 1 desktop-unification + login extract):
  ⏳ still need a packaged-runtime rebuild/reinstall to take effect on a real PC.

**[3] MSIX Tauri shell wiring — DONE 2026-06-10.** Correction: the Tauri shell
is NOT outside this checkout (§9 was wrong) — it lives at
`musu-bee/musu-bee/src-tauri/` (a separate Cargo crate `musu-desktop`). Found the
real gap: on launch the shell ran `musu.exe up --json`, and `--json` is exactly
the non-interactive guard that SKIPS device-flow — so the "desktop unification"
device-flow never fired from the GUI. Fixed in `src-tauri/src/lib.rs`:
`spawn_runtime_autostart` now spawns `musu-startup.exe open` fire-and-forget
(detached: musu-startup holds the bridge in its own foreground and runs
device-flow as a detached task, so waiting on it with a 45s timeout would block
the GUI thread for the whole 900s poll). Added `musu_startup_path()` +
`sibling_exe_for_current_exe()` (resolves `musu-startup.exe` next to the desktop
binary, same packaging layout as `musu.exe`). Legacy `musu up --json` kept as a
fallback when `musu-startup.exe` is missing (non-packaged dev runs). The MSIX
`windows.startupTask` STAYS argless (= Service / bridge-only) — only the desktop-
window launch path uses `open`, so logon/service boot never triggers interactive
device-flow. `build-msix.ps1` already maps all three exes (Application=
musu-desktop.exe, runtime alias=musu.exe, startupTask=musu-startup.exe) — NO
change needed there. Verified: `cargo check` + `cargo test` in src-tauri exit 0,
16 tests pass incl. the two new startup-sibling tests.

**[2] musu-bee packaged-runtime REBUILD — DONE 2026-06-10 (install pending).**
`scripts/windows/build-msix.ps1 -GenerateCert` ran a full release build —
`cargo build --release --bin musu --bin musu-startup` + `npm run tauri -- build
--no-bundle` (musu-desktop.exe with this session's rewired `spawn_runtime_
autostart`) — then `winapp pack` + a self-signed cert. Output:
`.local-build/msix/output/musu_1.15.0.0_x64_local-sideload-manual.msix` (26.5MB,
signed), cert `blossompark.musu_cert.pfx`. Identity verified = `blossompark.musu`
/ `CN=74D9382E...` (Store app 9NJ645MQ04T3). This is the LOCAL SIDELOAD package
(self-signed); the Store re-signs on ingestion. **REINSTALL on a real PC is a
separate manual step** (`Add-AppxPackage`, after trusting the cert) and was NOT
done here — it changes the running machine, so it is owner-driven. Artifacts live
under `.local-build/` (gitignored — never committed).

**Still open (next):**
- **[2-install] Sideload onto a real PC + one-machine E2E** — install the .msix,
  launch MUSU Desktop, confirm `musu-startup open` fires device-flow, approve at
  musu.pro, see the node connect. Owner-driven.
- **SetupWizard `/device?code=` prefill** (musu-pro front) — minor, deferred.
- **§10.1 cockpit GUI** — the native fleet-cockpit window (this session's GUI
  direction) is design-only so far; the shell currently still loads the web UI.
  Building the cockpit is a separate, larger piece.

## 11. Thermo-nuclear + critic review (2026-06-10)

A maintainability review (refactoring-expert) and an adversarial critic
(system-architect) went over the session's code. Thermo: **no blockers**, code is
clean. Critic: **RESHAPE_NEEDED** — three real findings. What was fixed this pass
and what remains:

**Fixed this pass:**
- **(critic HIGH 1b) Client looped 15 min on a non-retryable poll error.**
  `musu-rs/src/cloud/mod.rs` `poll_device_token` treated EVERY non-success
  (400/429/5xx) as "pending" and re-polled until the 900s expiry. Now: 202 +
  408/429/5xx are retryable (`Ok(None)`), every other 4xx (esp. 400 malformed) is
  terminal (`Err` → login fails fast). The server already distinguished these;
  the client was flattening them.
- **(critic HIGH 3a) Site copy understated the cert-trust step.** The self-signed
  MSIX cannot be "double-click, no terminal" — Windows blocks it until the cert is
  trusted (admin). `SetupWizard.tsx` now states "developer preview", makes cert
  trust a first-class numbered step with the exact `Import-Certificate` command +
  a cert download link, and reserves "no terminal" for *after* setup. The Store
  build (no cert step) is named as the real fix.
- **(thermo STRONG) Download URL duplicated 4×; page.tsx had a double download
  CTA.** Hoisted to `musu-pro/src/lib/constants/install.ts`
  (`DESKTOP_DOWNLOAD_URL` / `CERT_DOWNLOAD_URL` / `CLI_INSTALL_COMMAND`), imported
  everywhere; removed the redundant hero CTA so `<InstallCommand>` is the single
  source.

**Fixed (C1, 2026-06-11):**
- **(critic HIGH→MEDIUM 2b) Double-bridge race under a dynamic port — FIXED.**
  Both bridge-start paths now funnel through one entry point: a new
  `spawn_musu_startup_open()` helper that the manual `start_runtime` command AND
  `spawn_runtime_autostart` both call. `start_runtime` no longer runs its own
  `musu up --json` — that separate spawner was the race's second half, and with
  `BRIDGE_PORT=0` (OS-dynamic) the `AddrInUse` backstop never tripped. One entry
  point means musu-startup's own token/bridge idempotency guards prevent a second
  bridge. Bonus: `start_runtime` is now fire-and-forget (returns "runtime starting"
  immediately) instead of blocking the UI for up to 45s on a synchronous `musu up`.
  The legacy `musu up --json` fallback in autostart was also removed (the other
  half of the race); if `musu-startup.exe` is absent (dev builds) the app logs and
  the operator runs `musu up` manually. Unused `START_RUNTIME_TIMEOUT` removed.
  Verified: `cargo check` exit 0, no warnings. **The cockpit may now safely surface
  a start control** — the B1 constraint is lifted.
- **(critic MEDIUM 4) "Open MUSU and see your fleet" over-promises** vs a shell
  that still loads the web UI (no in-app fleet view yet). The onboarding copy that
  says "connects this PC" is accurate; the aspirational "see your fleet in-app" must
  wait for the cockpit. Tighten copy if it drifts further before the cockpit ships.
- **(critic LOW 1a) Poll/start disambiguation is by `device_code` key-presence,
  not an explicit `action` discriminator.** Robust today; add a discriminator only
  if the start payload ever needs a field named `device_code`.
