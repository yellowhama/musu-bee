# MUSU Roadmap — after the desktop E2E (2026-06-10)

**Where we are:** Windows desktop install → device-flow → connect is PROVEN on a
real PC (hugh_second connected via the installed MSIX this session). musu.pro
ships the .msix download. Server-side and desktop login paths both verified.

**What this roadmap orders:** the remaining work, by dependency and user impact,
with the gates that block each. The organizing question per item is "what does
this unblock, and what blocks it."

---

## The state of play (so the order makes sense)

| Done | Open |
|---|---|
| Desktop E2E on real PC ✅ | MS Store publish (kills the cert wall) |
| musu.pro install rework + deploy ✅ | Cockpit GUI (designed, 0% built) |
| device-flow poll-fix (live) ✅ | 2b double-bridge race (latent) |
| Tauri `musu-startup open` wiring ✅ | mac/linux CLI download broken (404) |
| MSIX build + public release ✅ | cli_commands.rs 6214-line monolith |
| login extraction, doc sync ✅ | mac/linux desktop app (none) |

**The one fact that shapes everything:** the self-signed sideload MSIX works for
*us* (we trust the cert as admin) but is effectively un-installable for a normal
user — the "this app may harm your computer" wall + admin cert-trust is a hard
stop. So **the highest-leverage next move is whatever removes that wall**, i.e.
the Microsoft Store path. Everything else is improvement on a product real users
still can't install one-click.

---

## Tracks (parallel where independent, gated where not)

### Track A — Make Windows install real for normal users (HIGHEST leverage)
The cert wall is THE adoption blocker. Two sub-paths, do A1 first.

- **A1. MS Store submission.** App ID `9NJ645MQ04T3` is reserved but NOT published
  (apps.microsoft.com → 410). Submit the `store-reviewed-immediate-registration`
  MSIX variant (already built: `musu_1.15.0.0_x64_store-reviewed-…msix`) to
  Partner Center. Store re-signs → no cert wall, one-click install, auto-update.
  - **Gate:** owner (Partner Center account + submission). Needs the real Store
    identity values (memory `reference-musu-store-identity`; sensitive ones in
    `.env`). Review takes days.
  - **Unblocks:** swapping the musu.pro download button from the self-signed
    `desktop-latest` release to a "Get it from Microsoft Store" link (A2).
- **A2. Site → Store button.** Once A1 is live, replace the `.msix` download +
  cert-dance copy in `SetupWizard.tsx`/`page.tsx`/`InstallCommand.tsx`/docs with
  a Store badge/link. The honest cert-preview copy stays as a "developer build"
  fallback only.
  - **Gate:** A1 published (need the live `apps.microsoft.com/detail/…` URL).

### Track B — Cockpit GUI (the product-identity promise)
Designed in `DESKTOP_COCKPIT_GUI_DESIGN_2026_06_10.md`. Independent of Track A
(can build in parallel), but has its own internal gate (B0).

- **B0. Thesis grill: real-time node-state feed (Phase -1).** Before building
  anything past the online/offline list, decide §9's call: extend the node→musu.pro
  heartbeat with `active_sessions` (option A, keeps musu.pro a phone-book) vs go
  P2P (option B). This is thesis-level (phone-book vs data-path) — run a
  business-panel grill per the strategic-critic gate. **Blocks B2.**
- **B1. Cockpit Phase 1 (fleet at a glance).** Preact+Vite, dark/amber reuse,
  static-export into `out/`. Screens: fleet list (online/offline from `last_seen`),
  empty state, connecting state (reads `startup-marker.json` — new), diagnostics
  drawer (old grid demoted). New Tauri cmds `list_fleet()` + `read_startup_marker()`.
  - **Gate:** none to start (data sources exist). Does NOT need B0.
  - **Constraint:** must NOT surface a runtime-start button until C1 (2b fix).
- **B2. Cockpit Phase 2 (orders + live node state).** Order box + per-node
  busy/active_sessions rows. **Blocked by B0** (the feed) and the order/relay
  wiring.

### Track C — Correctness & debt (small, do alongside)
- **C1. Fix the 2b double-bridge race.** Hold `runtime_start_gate` until
  `bridge_is_healthy`, OR route `start_runtime` + autostart through one
  `musu-startup open` entry point. Latent today (no caller), but **must land
  before B1 exposes any start control.** Small, well-scoped.
  - **Gate:** none. **Blocks** exposing start in B1/B2.
- **C2. Publish CLI binaries to a public release.** mac/linux `install.sh`/`.ps1`
  point `$Repo` at the PRIVATE `Musu` repo → 404 for anonymous users. Mirror the
  v1.8.0-style CLI build to a public release (or make `Musu` public), then point
  the scripts there. **Unblocks mac/linux install** (currently broken).
  - **Gate:** owner (repo visibility / CI). Independent of A and B.
- **C3. cli_commands.rs extraction round 2.** 6214 lines; thermo flagged
  route/relay/room families as the next extractions (same pattern as the
  device_login move). Pure refactor, no behavior change. Do when touching that
  file anyway; not urgent.

---

## Ordered plan (what to actually do, in sequence)

**Sequencing logic:** Track A (Store) is highest user-leverage and is owner-gated,
so kick it off FIRST (it runs in the background during review). C1 is a tiny
prerequisite for cockpit start-controls, do it early. B1 is the visible product
win and needs nothing — build it while A reviews. B0 grill gates B2. C2 unblocks a
whole platform (mac/linux) and is independent — slot it whenever owner can.

1. **A1 — submit to MS Store** (owner kicks off; runs for days in review).
2. **C1 — fix 2b race** (small, removes the only blocker on cockpit start-controls).
3. **B1 — build cockpit Phase 1** (parallel to A1 review; the visible win).
4. **A2 — site → Store button** (when A1 publishes).
5. **B0 — thesis grill on the node-state feed** (before B2).
6. **B2 — cockpit orders + live state** (after B0 + order wiring).
7. **C2 — public CLI release for mac/linux** (independent; whenever owner can).
8. **C3 — cli_commands.rs round-2 extraction** (opportunistic).

**Owner-gated (can't be done autonomously):** A1 (Partner Center submit), A2's
go-live trigger, C2's repo/CI decision, B0's thesis call. Everything else (C1, B1,
C3) is buildable now.

**Critical path to "a normal user installs one-click and sees their fleet":**
A1 → A2 (one-click install) + B1 (sees fleet) — these two land the core promise.
B2 (gives orders, sees live work) completes it.

---

## Immediate next action

Pick the entry point:
- **Build now (no gate):** C1 (2b fix) → B1 (cockpit Phase 1). Visible progress
  without waiting on anyone.
- **Owner kicks off:** A1 (Store submit) so review runs in the background.
- **Thesis first:** B0 grill if we want the feed decision settled before any
  cockpit work.
