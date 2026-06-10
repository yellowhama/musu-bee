# MUSU — Whole-product critique & re-alignment (2026-06-11)

Three adversarial critiques (desktop app · musu.pro site · the integration between
them), run in parallel, then synthesized. This SUPERSEDES the track ordering in
`ROADMAP_2026_06_10_POST_DESKTOP_E2E.md` — the roadmap optimized for "ship the
cockpit + Store"; the critiques found the product has a hole the roadmap didn't
rank: **right now nobody can give the fleet any work.**

## The one finding all three critiques reached

**There is no working input path in the product today.**
- The web console input path was paused by the migration: `BRIDGE_SURFACE_ENABLED
  = false` 410s the console surfaces (musu-pro `src/lib/bridge-surface.ts:3`).
- The desktop cockpit's order box is a **disabled stub** (musu-bee
  `src-tauri-shell/index.html` order-box; styled `cursor:not-allowed`).
- So: web can't submit work (410), desktop can't submit work (stub). The
  migration shipped the *removal* (web console) before the *replacement*
  (cockpit orders). This is a self-inflicted capability regression and it is the
  product's most urgent problem — "connect your computers and give them work"
  currently delivers neither verb.

## Per-area verdicts

**Desktop app** — *structure right, surface dishonest, not yet worth opening.*
The connecting/fleet/empty/diagnostics split and the device-flow screen are real
wins. But the app shows strictly LESS than the website (online/offline dots only;
no "what each machine is doing"), and fakes its headline feature with a dead order
box. The one thing only a local app can show — *this PC's own bridge activity* —
is exactly what it doesn't show. Plus: `open_dashboard` is dead IPC surface;
5s-poll spawns two `musu.exe` + a full process-table snapshot forever; the
"Local Only" (bridge up, no cloud login) state is wrongly forced into the
device-flow screen, contradicting the self-contained-product thesis.

**musu.pro site** — *three products stacked; prune ~half.*
(a) a sharp desktop-first marketing landing, (b) a dead-on-arrival web fleet
console — five overlapping surfaces (dashboard/home/workspace/screen/tasks), all
410'd, with nav + FAQ still claiming they work, and (c) a marketplace + community
+ insights + wiki commerce stack from an abandoned "platform" vision, live on prod
serving empty states. The site sits one env var (`MUSU_SITE_DISABLED` default
true) away from showing a "product is being replaced" page. Pricing block is
triplicated and self-contradictory ("actually free" vs $9/mo for the dead
dashboard).

**Integration** — *coordination plane clean, data plane unbuilt & misdescribed.*
Device-flow + node registry + cockpit-reads-registry are genuinely wired and
correctly bounded (web = phone book). BUT "P2P-first, relay-on-failure" is
`#[allow(dead_code)]` — the real data path is bridge→bridge HTTP-bearer to a
registry-advertised `public_url` with `peer_identity_verified=false`. And
`SITE_DISABLED`'s enforcer (`proxy.ts`) is imported by nothing (no `middleware.ts`)
— it's dead code; the only real pause is `bridge-surface`. Cockpit failure modes
collapse auth/network/empty all into "empty list."

## Re-aligned priority (this replaces the roadmap order)

**P0 — Close the input gap (the product can't be used without this).**
1. **Cockpit order submission OR keep web console alive until it exists.** Pick
   one; do not leave the window where neither surface can give an order. Fastest:
   a minimal "run this on <machine>" in the cockpit wired to the existing
   task-delegate path (`musu route` already POSTs `/api/tasks/delegate`).
2. **Remove the disabled order box** if orders don't ship same-change — an honest
   empty cockpit beats a fake input. (If P0.1 ships, this is moot.)

**P1 — Make the desktop app worth opening.**
3. **Show THIS PC's own activity** (running sessions/idle) from the local bridge —
   the one thing the website can't show. Zero new server work.
4. **Fix the "Local Only" gate** so a cloud-disconnected user still sees their
   machine (self-contained thesis).
5. **Fix poll cost**: cheap steady-state (bridge /health + nodes); run
   doctor/process-snapshot only when the diagnostics drawer is open; back off when
   the window is hidden.
6. **Drop dead `open_dashboard`** from the IPC handler.

**P2 — Prune the site to its honest job (marketing + auth + device + docs + ONE status view).**
7. **Cut scope sprawl**: `market*`, `community*`, `products*`, `insights`, `wiki`
   (+ their services/repos). Unrelated to "connect your computers."
8. **Collapse 5 consoles → 1**: delete `/home` (dead redirect), merge
   `tasks`/`workspace` into `dashboard` tabs, keep `screen` if real. With the
   desktop app becoming the cockpit, decide if the web needs a fleet console at
   all or just a read-only status page.
9. **Fix the switches**: flip `MUSU_SITE_DISABLED` default to false (fail-open
   marketing site); either wire `BRIDGE_SURFACE_ENABLED` real or strip the dead
   console nav until it is.
10. **Reconcile landing copy**: desktop-first hero (demote CLI to mac/linux),
    single pricing block, honest "local execution + cloud coordination" framing
    (not "zero cloud").

**P3 — Integration hygiene.**
11. **Delete or wire `proxy.ts`/`SITE_DISABLED`** (orphaned gate misleads).
12. **Stop calling the data path "P2P/relay"** in docs/copy until the route
    selector lands; document the real path (registry-addressed HTTP-bearer,
    unverified peer) and prioritize **peer identity verification** as the real
    security boundary.
13. **`musu nodes --json` envelope**: distinguish not_logged_in / token_expired /
    cloud_unreachable / empty; derive `last_seen` liveness in the cockpit.
14. **Disambiguate the three "fleet" concepts** by name; retire the unused web
    `/fleet` page or rename.

**Deferred (was roadmap-high, now correctly lower):**
- A1 Store submit (owner) — still valuable (kills cert wall) but it ships a
  product that can't take orders; do P0 first or in parallel.
- B0 real-time feed thesis grill — still gates the *fleet-wide* feed (P1.3 is
  this-PC only, no grill needed).
- C2 mac/linux CLI 404, C3 cli_commands split — unchanged, low.

## Why this reorders the roadmap

The 2026-06-10 roadmap led with "A1 Store + B1 cockpit." But B1 shipped a cockpit
that can't give orders, and the migration killed the web path that could — so the
top-line product promise ("give your computers work") is currently undeliverable
on BOTH surfaces. Shipping it to the Store (A1) would publish a product whose
headline verb doesn't work. **Input path first, then make-it-worth-opening, then
prune the site, then integration hygiene.** Store + fleet-wide feed come after the
product can actually be used.
