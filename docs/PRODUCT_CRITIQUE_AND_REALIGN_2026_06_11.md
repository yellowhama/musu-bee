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
7. **Cut scope sprawl** — ✅ DONE 2026-06-11. Deleted `market*`, `community*`,
   `products/[slug]*` routes + `listings`/`posts` services/repos/types/APIs +
   nav/MCP/rss/sitemap refs. tsc clean. **Kept `wiki` and `insights/[id]`** —
   investigation showed both are load-bearing for the fleet console (wiki renders
   in ConsoleShell from connected-node markdown; insights is the dashboard's
   AI-artifact viewer), not marketplace sprawl. (insights carries a stored-XSS
   liability via dangerouslySetInnerHTML — flagged for a separate security fix.)
8. **Collapse 5 consoles → 1** — DEFERRED (not safe to do now). `/home` is the
   console's primary entry point (Header logo, MobileTabBar, Sidebar,
   CommandPalette all route to it; it redirects to /dashboard), so deleting it
   means rewiring all console nav. AND dashboard/workspace/screen/tasks are ALL
   currently 410'd behind `BRIDGE_SURFACE_ENABLED=false` — they're dead screens,
   so merging them has little upside and real breakage risk. **Do the console
   collapse together with the bridge-surface revival**, not before. Until then the
   dead console nav stays (it 410s gracefully).
9. **Fix the switches** — ✅ PARTIAL: flipped `MUSU_SITE_DISABLED` default to
   false (fail-open marketing site). `BRIDGE_SURFACE_ENABLED` stays false
   deliberately (web console input paused, Desktop is executor); stripping the
   dead console nav is bundled into #8's deferred console-collapse.
10. **Reconcile landing copy**: desktop-first hero (demote CLI to mac/linux),
    single pricing block, honest "local execution + cloud coordination" framing
    (not "zero cloud").

**P3 — Integration hygiene.**
11. **`proxy.ts`/`SITE_DISABLED`** — ✅ INVESTIGATED; the integration critique was
    WRONG here. It claimed `proxy.ts` is orphaned dead code ("no middleware.ts, no
    importer"). But this is a **Next.js 16** app, and Next 16 renamed the
    middleware convention `middleware.ts`→`proxy.ts` (`export function middleware`
    → `export function proxy`). So `src/proxy.ts` (with `export async function
    proxy` + `export const config`) IS the live middleware — Next auto-detects it.
    It does CSP nonce, Supabase auth refresh, legacy redirects, AND the
    SITE_DISABLED gate. **Do NOT delete it.** Because it's live, `SITE_DISABLED`
    genuinely gates the site — which makes flipping its default to `false` (P2.9)
    *more* important, not less (a live gate defaulting to "disabled" is a real
    foot-gun, now fixed).
12. **Stop calling the data path "P2P/relay"** — ✅ DONE. Landing copy (page.tsx)
    softened: "P2P QUIC Encryption / Military-grade tunnel" → "Direct
    machine-to-machine / authenticated bridge"; "Zero cloud dependency, code never
    leaves" FAQ → honest "AI runs on your machines (local execution); musu.pro is a
    coordination layer that never executes code or stores files"; "P2P QUIC
    Tunnels" card + "P2P encrypted" chip reworded. The real data path today is
    registry-addressed HTTP-bearer with `peer_identity_verified=false`; the
    `#[allow(dead_code)]` P2P/relay route selector is not wired. **Open security
    work (not copy): peer identity verification** is the real boundary to harden —
    tracked separately, not in this re-align.
13. **`musu nodes --json` envelope** — ✅ DONE. run_nodes no longer bails on a
    fetch error; it emits a classified envelope (`not_logged_in` /
    `token_expired` / `cloud_unreachable`). The cockpit's list_fleet maps these:
    not_logged_in → connecting screen, token_expired → "Sign in again",
    cloud_unreachable → "musu.pro unreachable" + shows THIS PC only (never a
    silent empty list). `last_seen` liveness derivation already lands in P1.
14. **Disambiguate the three "fleet" concepts** — DEFERRED (naming cleanup, low
    risk/low urgency): cockpit fleet = cloud node registry; web `/fleet` page =
    a single bridge's paired-machine capacity view (not in the desktop bundle);
    they share the word "fleet". Rename when the web `/fleet` is next touched.

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

---

## Review round 2 (thermo-nuclear + critic on the P0–P3 implementation, 2026-06-11)

After P0–P3 shipped, a maintainability review + an adversarial "did-it-fix-it"
critique went over the actual code. Both converged on the same warning: **P0 and
P1 each shipped a new on-screen lie — the exact sin the re-align set out to kill.**
Fixed in this round:

- **HIGH (P0 success-lie) — FIXED.** `run_route` returned `Ok(())` (exit 0) even on
  a non-2xx delegate response (incl. a 409 dedup), and `submit_order` keys success
  off the exit code → the cockpit showed "order sent" while nothing queued. Now
  `run_route` bails (non-zero exit) when `route_result == Failed`, so a rejected
  order surfaces as a failure in the cockpit instead of a false "sent".
- **HIGH (P1 activity-lie) — FIXED.** "working · N active" was derived from
  `active_runtime_loop_candidate_count`, which counts ENABLED BACKGROUND SUBSYSTEMS
  (mDNS, clipboard, cloud_heartbeat = token-present), not running tasks — so every
  logged-in idle machine read "working · 1". Removed; this-PC now shows honest
  "online" until the bridge exposes a real running-task count (Phase 2a). Don't
  paint activity we can't measure.
- **STRONG (P0 arg parsing) — FIXED.** An order starting with `-`/`--` was misparsed
  by clap as a flag. submit_order now puts flags first, a `--` separator, then the
  text as the trailing positional.
- **STRONG (P3 error classification) — FIXED.** run_nodes classified token_expired
  via a floating `.contains(" 401")` that a response body could trip. Now matches
  the stable prefix `"failed with HTTP 401"`/`403`.
- **MED (P2 dangling refs) — FIXED.** login page copy ("Your listings. Your posts.")
  and a JsonLd SEO `url: /products/<slug>` survived the route cut (tsc can't catch
  string/SEO refs). Reworded login; pointed JsonLd url at /how-it-works.

Confirmed correct by both reviewers (no change needed):
- P0 input path is genuinely end-to-end on the LOCAL bridge (POST /api/tasks/delegate
  → real spawn/forward), NOT the 410'd web surface. Happy path works.
- P2 cut is clean (no dangling imports; deletions complete).
- P3 envelope error states ARE reachable (logged_in = local token-file presence, so
  an expired token still enters the connected path → cloud 401 → token_expired).
- proxy.ts is live Next-16 middleware (both confirm the earlier "dead code" claim
  was wrong).

Net after round 2: P0/P1's headline verbs now tell the truth on the failure path,
not just the happy path. Remaining (lower priority): P1.5 poll-cost only half-landed
(doctor + process-table snapshot still run every 15s tick, not gated on the
diagnostics drawer being open) — split a cheap status path from the expensive
doctor/process pass when convenient.
