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

**GUI decision (recorded):** NO native window now. Rationale: the approval UI
(`LinkApprovalForm` at musu.pro/device) and status (`/dashboard/fleet`) already
exist in the browser; adding Tauri/egui is YAGNI at single-user / few-PCs scale.
Tray/window deferred to a future phase if demand is proven.

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
- **Deploy**: musu-pro Phase A/C changes need a musu.pro redeploy; musu-bee
  Rust changes need a packaged-runtime rebuild/reinstall.
