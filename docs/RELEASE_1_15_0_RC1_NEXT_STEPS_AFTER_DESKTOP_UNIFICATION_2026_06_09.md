# MUSU 1.15.0-rc.1 — Next Steps After Desktop Unification

Date: 2026-06-09
Repos: musu-bee `fix/audit-findings-2026-06-08` (pushed), musu-pro `main` (NOT pushed)

## Where we are (this session's outcome)

`musu login` now works end-to-end on **live** musu.pro (verified: a real device
approved, token written, node registered). The device-flow blocker that gated
the entire one-machine MUSU.PRO E2E is gone. On top of that:

- **Onboarding** is discoverable: installers + SetupWizard lead with `musu up`;
  `musu up` auto-starts device-flow when unlogged (TTY/json-guarded).
- **Desktop unification Phase 1**: `musu-startup open` folds bridge + login into
  one sequence; service/logon boot stays bridge-only; `run_login` decomposed; no
  Tauri (browser is the UI).
- **musu-pro migration** consolidated: web console input paused → MUSU Desktop is
  the sole local executor; `MUSU_SITE_DISABLED` is now an env toggle.

## The remaining critical path (ordered)

These are all owner-gated (production / outside-this-checkout / secrets):

1. **musu-pro `main` push + production redeploy** 🔴 — `main` has the onboarding
   (Phase A/C) + migration (`df7e259`) commits, NOT yet pushed. The live
   musu.pro install.ps1 still lacks `musu up` (confirmed), so these are not yet
   live. Pushing + `vercel --prod` makes them live. **Production gate.** Suggest
   preview-first (`vercel` without `--prod`) to validate, then promote.
   - Verify after deploy: `https://musu.pro/install.ps1` contains `musu up`;
     `POST /api/v1/auth/device` still returns 200 (the migration's bridge-surface
     410 must NOT block the auth/device path — see the code-audit pass).

2. **MSIX Tauri shell → `musu-startup.exe open`** — the user-launch Application
   (`musu-desktop.exe`, the Tauri shell) lives OUTSIDE `F:/workspace/musu-bee`
   (no `src-tauri/` here). It must spawn `musu-startup.exe open` on user launch
   so the unified sequence (incl. device-flow) runs. The `windows.startupTask`
   correctly stays argless (= Service / bridge-only). Until this is wired, the
   desktop unification only works via CLI `musu up`, not via the app icon.

3. **musu-bee packaged-runtime rebuild + reinstall** — Phase B (`musu up`
   auto-login) and desktop unification (`musu-startup open`) ship in the Rust
   binary; the currently installed package predates them (and still has the
   Yellowhama identity, not blossompark from B4). Rebuild via build-msix.ps1
   with the real Store identity, reinstall, then re-verify `musu up` →
   auto-device-flow → connected.

4. **one-machine E2E proof, end to end** — with the above, run the one-machine
   work-order smoke without `-AllowUnverified`: musu.pro remote input → local
   Desktop claim → bridge task → server delivery ack → result. Capture post-run
   60s idle-CPU evidence.

## Deferred (not blocking the above)

- SetupWizard `/device?code=` prefill (Phase 2 front), status panel, tray/window
  (Phase 3) — only if demand is proven.
- TS SDK phase 2+ (graceful-200 routes need an `onError` option).
- H2 node identity (TOFU/PoP) before any multi-owner / untrusted-peer.
- M3/W12 adapter unification (wire codex/gemini into the writer hot path).
- Store submission (Entra ID tenant + Submission API creds).

## Release status

Public release remains **No-Go**. The auth/onboarding path is now live and the
desktop "one app" sequence is implemented, but: production deploy of musu-pro
main + Tauri-shell wiring + packaged rebuild are pending, and two-machine
route/CPU evidence, hosted P2P/relay proof, support mailbox, and Store evidence
remain open.
