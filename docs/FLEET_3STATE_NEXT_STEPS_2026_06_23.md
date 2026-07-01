# Fleet 3-State + Uninstall Lifecycle — Next Steps (2026-06-23)

Status snapshot after the A (uninstall.ps1 release) + B (F-2/F-3/G-1) work block.
This is a forward-looking handoff doc: what shipped, what's blocked on real
hardware, and the prioritized next moves.

## 2026-06-26 Supersession Note

The latest branch work is `feat/v33-residual-finalize` rc.21 audit hotfix, not
the older rc.9/`feat/f3-relay-fleet-state` landing plan below. The core 3-state
invariants still stand, with one correction now promoted to the formal contract:
`relay` is a yellow display/freshness state only and is not delegated-work
routing. New source gates now also reject/filter remote-unusable registry rows
and add owner-scoped stale-row cleanup.

Current hard blockers before telling the main PC to use the one-line install:
hosted `desktop-latest` still publishes rc.20 assets, and live cloud registry
still contains `hugh-main public_url=http://127.0.0.1:13397`.

## Shipped this block (verified)

| Item | What | Verification | Push state |
|------|------|--------------|------------|
| A | `Uninstall-MUSU.ps1` uploaded to `desktop-latest` release | `https://musu.pro/uninstall.ps1` → 200, 10364 bytes, text/plain | release asset live; source header comment fix on `chore/uninstall-ps1-comment-uc-shipped` (pending main push) |
| F-2 | relay poller comment/log accuracy (default-ON, not opt-in) — 5 lines | `cargo check --lib` clean | `feat/f3-relay-fleet-state` (pending push) |
| F-3 | relay-reachable 3rd fleet state, end-to-end (Option A) | Critic 3 HIGH resolved + Auditor SHIP + re-audit + thermo-nuclear APPROVE; 14 fleet + 20 services tests | `feat/f3-relay-fleet-state` (pending push) |
| G-1 | PID-aware `discover()` (ghost-node root fix) | 2 new tests, asymmetry-vs-cleanup_stale documented | `feat/f3-relay-fleet-state` (pending push) |

F-1 (LAN-IP auto publish/bind) and U-C (cloud self-deregister) shipped in prior
blocks (merged + production). G-2 (legacy `~/.musu` reconcile) and G-3
(post-install autostart) were found ALREADY FIXED during scouting — no-op.

## Blocked on user / real hardware (cannot self-complete)

1. **Two-machine fleet 3-state E2E** — show a peer flip `direct → relay →
   offline` on the live installed cockpit. Needs: rc.9 build + both-machine
   reinstall, then force a direct-probe failure (block the LAN bind / NAT-split)
   while keeping the registry heartbeat fresh, and confirm the cockpit shows
   yellow "relay" as a display-only state. The peer must not be counted in
   `online_nodes` or treated as work-targetable until relay transport is proven.
   Boundary unit tests stand in until this runs.
2. **Full uninstall lifecycle E2E** — packaged-MSIX install → uninstall (cockpit
   button + `Uninstall-MUSU.ps1`) → reinstall, confirming U-A/U-B/U-C + Method A
   all converge on real machines.

## Recommended next moves (priority order)

### P0 — land this block
- Push `feat/f3-relay-fleet-state` (F-2 + F-3 + G-1) and
  `chore/uninstall-ps1-comment-uc-shipped` to main under one Const VII approval
  (batched). No production/server deploy needed — all changes are
  musu-rs/cockpit/page (the web page is static-built; no server route changed).
- rc.9 build + both-machine reinstall to unblock the two E2Es above.

### P1 — pre-existing breakage surfaced by F-3 (NOT introduced here)
These were found while repointing the fleet page off the phantom `/api/machines`.
They are independent follow-ups, each its own small sub-WS:
- **AddPcWizard pairing path** — calls `/api/agents` + `/api/admin/pair/accept`;
  musu-rs serves `/api/pair/accept` (no `/api/admin/` prefix, no `/api/agents`).
  Pairing from the web wizard is likely broken. Verify against the cockpit
  `/api/pair/*` path and repoint or remove.
- **`/m/[id]` machine detail page** — still on the phantom
  `/api/machines/{id}` shape + GPU capacity fields that `FleetNodeStatus` does
  not carry. Either repoint to `/api/fleet/status` filtered by node, or make the
  fleet cards non-navigating until it's fixed (currently cards link to a broken
  detail page).

### P2 — deferred hardening (carried from prior blocks)
- W-4: 2-machine relay E2E (overlaps the F-3 E2E above — do together).
- W-7: server-side `source_node_id` auth binding (relay defense-in-depth).
- U-C item (b): persist `node_name` at join + name cross-check on the
  fallback-to-persisted-IP path (residual; cross-account already impossible).
- B-7: login env/안내 정합. B-3b: SaaS route gate.
- Brain bonding follow-up: package/run proof for hidden `musu-brain` sidecar,
  `~/.musu/brain` data root, task-completion ingest, token ACL verification, and
  cockpit recall/capture UX.

## Key invariants future work must not break
- Fleet status renders on THREE surfaces (web page / CLI / cockpit shell
  `main.js`). Any new node-status concept MUST update all three from the same
  `healthy` + `reachable_via` wire fields. The cockpit shell (`main.js`,
  `nodeFleetState()`) is the one most easily forgotten — it is the surface users
  actually see in the packaged MSIX.
- `healthy == false` means "direct probe failed", NOT "offline". Offline =
  `healthy == false && reachable_via != relay`.
- `RELAY_FRESH_SECS` (300s) must stay a small multiple of the registry heartbeat
  TTL (120s, `cloud/mod.rs`). If the TTL changes, re-derive this so a
  registry-expired node still goes offline promptly.
- `discover()` treats `pid=None` as alive; `cleanup_stale()` treats it as stale.
  This asymmetry is intentional (read vs GC) and test-locked — do not "harmonize".

## Stale-doc warning
`docs/CONNECTION_REDESIGN_MASTER_PLAN_2026_06_20.md`'s "Headscale Tailnet
adoption" conclusion is REVERSED and must not be cited as current direction.
The confirmed path is self-hosted WAN relay completion; Headscale/Tailscale
hard-dependency was dropped (self-contained-product violation + Tailscale
NoState daemon failures). The 401 cross-machine bug's real fix was C-1 token
unification, not Headscale. See `CONNECTION_COMPLETION_MASTER_PLAN_2026_06_20.md`
for the live plan.
