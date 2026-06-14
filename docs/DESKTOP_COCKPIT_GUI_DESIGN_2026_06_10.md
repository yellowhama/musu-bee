# MUSU Desktop — Fleet Cockpit GUI: Plan, Feature-Design, Wireframes

**Date**: 2026-06-10
**Status**: Design (pre-implementation). Supersedes the current diagnostic-launcher
shell (`musu-bee/src-tauri-shell/`). Grounds the v978 GUI direction
(memory `decision-musu-desktop-gui-direction`) in real data sources.

## 1. The gap this closes

Today the desktop app loads `src-tauri-shell/index.html` — an **engineer
diagnostic launcher**: a status grid (Bridge / Debug Dashboard / Package /
Connection / Runtime Profile / **Process Ownership**) plus `Start Runtime` /
`Open Debug Dashboard` / `Copy Diagnostics` buttons. That is the *opposite* of
the agreed direction:

- **Agreed (memory `decision-musu-desktop-gui-direction`)**: a *fleet cockpit* —
  "see your computers, give orders" — with the plumbing (connection path, ports,
  process ownership, tokens) HIDDEN. "The user just wants it to work."
- **Current**: plumbing is the *entire* screen.

So the GUI direction was decided but never built. This doc plans the build.

## 2. Positioning (the one-liner that drives every screen decision)

> Other AI desktops connect to *their company's* servers. MUSU connects to
> *your computers*. Open MUSU → see your machines → give them work.

Implication: the cockpit is the **primary** surface. musu.pro web is the fallback
for machines that can't install the app. Everything a normal user needs happens
in-app; diagnostics live behind a "Having trouble?" disclosure for developers.

## 3. Data sources (verified — what we can actually show)

| Need | Source | Status |
|---|---|---|
| This PC's connection/bridge state | Tauri `desktop_status()` command (`src-tauri/src/lib.rs:131`) | ✅ exists |
| The fleet (list of my machines) | `GET /api/home/nodes` → `RegistryNode[]` (`musu-pro`) | ✅ exists |
| Per-node: name, last_seen, group, MAC/broadcast (WoL) | `RegistryNode` fields | ✅ exists |
| **Per-node: currently-running task** | — | ⚠️ **NOT in RegistryNode**; needs tasks API or P2P status. **Out of MVP scope.** |
| Wake a sleeping node | `POST /api/v1/nodes/[id]/wol` | ✅ exists |
| Task logs | `/api/bridge/tasks/[id]/logs` | ✅ exists (later) |
| Sending an order to a machine | P2P relay / work-order (rendezvous via musu.pro, exec is P2P) | exists server-side; wiring TBD |

**Honesty constraint baked into the design:** the v978 mockup showed
"컴터1 ▶ 리팩터링 중" (live task per node). `RegistryNode` does NOT carry that.
So MVP shows **online/offline + last-seen**, not live task state. Don't draw a
screen we can't populate. Live-task is a Phase 2 once a node-status/tasks feed
exists.

## 4. Feature design — three phases (each shippable)

### Phase 1 — Fleet at a glance (MVP, this is the cockpit's spine)
- On launch: cockpit window (NOT the diagnostic grid). Shows **my machines** as a
  list/cards: name, ● online / ○ offline (from `last_seen`), "this PC" badge,
  machine_group heading.
- Empty state (only this PC, or none yet): "This is your only machine. Install
  MUSU on another PC to build your fleet" + the musu.pro link.
- Connection of THIS pc: a single ● in the header ("Connected to musu.pro"),
  driven by `desktop_status()`. No bridge/port/process detail on the surface.
- "Having trouble?" disclosure (collapsed): the OLD diagnostic grid lives here,
  verbatim — bridge status, process ownership, Copy Diagnostics. Nothing is lost,
  it's just demoted. (This is also where `Start Runtime` goes — and per spec §11
  it must NOT be a top-level button until the double-bridge race 2b is fixed.)

### Phase 2 — Give an order
- A command box: "What should they do?" → natural-language order + a target picker
  (which machine / any idle). Sends via the work-order / relay path.
- Per-node live state (▶ running task / idle) — requires the node-status feed that
  doesn't exist yet; build the feed first, then light up the rows.

### Phase 3 — Manage
- Per-node actions: wake (WoL, API exists), open logs, remove node.
- Recent orders / history.

## 5. Wireframes (ASCII — Phase 1 first)

### 5.1 Launch / steady state (connected, fleet visible)
```
┌─ MUSU ────────────────────────────────────────────┐
│  M  MUSU                          ● Connected      │  ← single connection dot
│     your computers                  (musu.pro)     │     (desktop_status)
│ ───────────────────────────────────────────────── │
│  YOUR MACHINES                                     │
│                                                    │
│   ● hugh_second          this PC                   │  ← online, "this PC" badge
│   ● desktop-01           seen just now             │
│   ○ laptop-cafe          seen 2h ago               │  ← offline (last_seen)
│                                                    │
│   ┌──────────────────────────────────────────┐    │
│   │  What should they do?              [Send] │    │  ← Phase 2 (stub in P1)
│   └──────────────────────────────────────────┘    │
│                                                    │
│   ▾ Having trouble?                                │  ← collapsed diagnostics
└────────────────────────────────────────────────────┘
```

### 5.2 Empty state (only this PC)
```
┌─ MUSU ────────────────────────────────────────────┐
│  M  MUSU                          ● Connected      │
│ ───────────────────────────────────────────────── │
│            This is your only machine.              │
│   Install MUSU on another PC to build your fleet.  │
│            [ Get MUSU for another PC → ]           │  ← musu.pro link
│                                                    │
│   ▾ Having trouble?                                │
└────────────────────────────────────────────────────┘
```

### 5.3 Not connected (device-flow in progress / failed)
```
┌─ MUSU ────────────────────────────────────────────┐
│  M  MUSU                          ◐ Connecting…    │
│ ───────────────────────────────────────────────── │
│   Approve this computer to connect:                │
│        ┌─────────────────────┐                     │
│        │   code:  3AF4-F9E2  │   [ Approve in… ]   │  ← opens musu.pro/device
│        └─────────────────────┘                     │
│   Waiting for approval…                            │
└────────────────────────────────────────────────────┘
```
(Reads `startup-marker.json` — which the shell does NOT read today; wiring this is
part of Phase 1. A silently-failed device-flow is currently invisible to the GUI;
this screen fixes that, per critic INFO 2c / spec §11.)

### 5.4 "Having trouble?" expanded (the old diagnostic grid, demoted)
```
│  ▴ Having trouble?                                 │
│    Bridge        ● running   :auto                 │
│    Connection    ● logged in                       │
│    Process       1 runtime                         │
│    [ Copy diagnostics ]  [ Open debug dashboard ]  │
```

## 6. Build approach

- Replace `src-tauri-shell/{index.html,main.js,styles.css}` with the cockpit.
  Same `build-tauri-shell.mjs` pipeline (static HTML/JS/CSS → `out/` → Tauri).
  No framework needed for Phase 1 (vanilla, matches current shell).
- New Tauri command(s): `list_fleet()` proxying `GET /api/home/nodes` with the
  saved account token (so the webview doesn't need cookies), and
  `read_startup_marker()` for screen 5.3. `desktop_status()` already covers the
  connection dot + the diagnostics drawer.
- Keep `desktop_status`/`open_dashboard`; move `start_runtime` invocation behind
  the diagnostics drawer AND gate it (spec §11 2b) before exposing.

## 7. Non-goals (Phase 1)

- No live per-node task display (no data source yet).
- No in-app terminal / output streaming.
- No connection-path / relay / latency display — that's plumbing, stays hidden
  forever per the positioning (only surfaces in diagnostics if a dev expands it).

## 8. Decisions (locked 2026-06-10)

- **Phase 1 scope**: "see machines online/offline + connection dot + diagnostics
  drawer" is the MVP. Order box (Phase 2) ships later. Coding deferred — keep
  refining design first (this section onward).
- **Visual style**: keep the current shell's dark/amber (`src-tauri-shell/styles.css`
  — `#0a0a0a`/`#FFD166` family). Reuse, don't restyle.
- **Framework**: a SMALL framework (not vanilla) — the cockpit will grow
  (fleet list → orders → per-node state → history), and reactive list-rendering
  off a polled `list_fleet()` is painful in vanilla. See §10 for the choice.

## 9. Real-time node state — the feed that doesn't exist yet (design)

The cockpit's actual value is "see what each machine is doing," but `RegistryNode`
only carries registration metadata (`node_name`, `last_seen`, `public_url`, …) —
no live activity. Designing this feed IS the refinement; without it Phase 1 is
just an online/offline list.

**What "doing" means, by tier (build cheapest-first):**

1. **Reachability (Phase 1, free):** ● online / ○ offline from `last_seen`
   freshness. Already have it. No new data.
2. **Liveness + load (Phase 2a, cheap):** each node's bridge already knows its own
   running sessions (the bridge dispatches to the local `claude` CLI). Surface a
   tiny per-node heartbeat: `{busy: bool, active_sessions: n, last_activity}`.
   Two wiring options —
   - **(A) via musu.pro (rendezvous-consistent):** node's `register_node` /
     heartbeat already pings musu.pro on a TTL; extend that payload with
     `active_sessions`. Cockpit reads it from `/api/home/nodes` (one poll, no P2P).
     Cheapest; musu.pro stays a phone book, not a data path. **Preferred.**
   - **(B) via P2P:** cockpit asks each node directly. Truer to "web is fallback"
     but needs the P2P transport wired into the GUI and N round-trips. Defer.
3. **Actual task title (Phase 2b):** "▶ refactoring" requires the order system to
   tag sessions with a human label at dispatch. Only meaningful once orders (§4
   Phase 2) exist. Until then show "busy (2 sessions)", not a fake task name.

**Design rule (honesty):** the row shows the *highest tier we actually have data
for*. P1 = online/offline. Don't render "▶ refactoring" until 2b's labeled-order
data is real. The v978 mockup's task line is a Phase-2b aspiration, explicitly
NOT Phase 1.

**Decision needed before Phase 2a:** does the node heartbeat to musu.pro get
extended with `active_sessions` (option A), or do we keep musu.pro activity-blind
and go P2P (option B)? This is a thesis-level call (phone-book vs data-path) —
worth a Phase -1 grill, not a snap choice.

## 10. Framework choice (small, reactive, static-exportable)

Constraints: must build to static HTML/JS/CSS that `build-tauri-shell.mjs` drops
in `out/` (Tauri loads `frontendDist: "../out"`); must be small; must do reactive
list rendering well; dark/amber theme reuse.

- **Preact + htm (no build step) or Preact + Vite** — ~4KB runtime, JSX-ish,
  trivial to static-export, no heavy toolchain. **Leading candidate.**
- **Svelte** — great for this, compiles away, but adds a real build pipeline to a
  repo whose shell is currently a 3-file static drop.
- **Solid** — similar tradeoff to Svelte.
- **NOT** React/Next — too heavy for a tray-cockpit; we already have Next on the
  web side, don't duplicate it in the shell.

Recommendation: **Preact + Vite**, static `build` output into `out/`, swap
`build-tauri-shell.mjs` to run the Vite build instead of copying the 3 files.
Confirm before implementing.

## 11. Refined build plan (when coding starts)

1. Scaffold Preact+Vite in `musu-bee/src-tauri-shell/` (or a sibling), static
   export to `out/`. Update `build-tauri-shell.mjs` + `beforeBuildCommand`.
2. New Tauri commands: `list_fleet()` (proxy `GET /api/home/nodes` with the saved
   account token) and `read_startup_marker()` (screen 5.3). Keep `desktop_status`.
3. Build screens in order: 5.1 fleet list → 5.2 empty → 5.3 connecting → 5.4
   diagnostics drawer (port the old grid in verbatim).
4. Gate/relocate `start_runtime` into the drawer; do NOT surface it until the
   double-bridge race (spec §11 2b) is fixed.
5. Phase 2 (orders) and Phase 2a (heartbeat feed) are separate efforts after §9's
   thesis decision.
