# Fleet 3-State E2E Playbook (2026-06-23)

Reproduce the `direct → relay → offline` transition on a real installed cockpit.
This validates the F-3 relay-reachable fleet state end-to-end after PR #23
(backend + cockpit + CLI) and PR #21 (web page) land.

> Status: user-gated (requires two real machines + rc.9 install). Boundary unit
> tests (`cargo test --lib bridge::handlers::fleet`, 14 tests) stand in until this
> is run on hardware.

## Prereqs

- Two Windows machines on the SAME LAN, each with rc.9 MSIX installed + logged in
  to the same musu account (so both publish to musu.pro registry).
- rc.9 confirmed: `tauri.conf.json` + `musu-rs/Cargo.toml` both `1.15.0-rc.9`.
- Build (run on a machine where `musu.exe` is NOT running — link fails os error 5
  otherwise; see Build note below):
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/build-msix.ps1`

## The three states (what to expect on each surface)

| State | Trigger | Web page / CLI / cockpit shell |
|-------|---------|--------------------------------|
| `direct` (green "online") | direct `/api/fleet/node-status` probe succeeds | green dot, targetable, task counts shown |
| `relay` (yellow "relay") | direct probe FAILS but registry heartbeat fresh (≤300s) | yellow dot, STILL targetable, task counts hidden (probe failed) |
| `offline` (red) | direct probe fails AND heartbeat stale (>300s) or absent | red dot, NOT targetable |

All three surfaces MUST agree (FLEET_RETRY_AND_LAST_SEEN_CONTRACT §"Relay-reachable state").

## Procedure

### Step 1 — baseline: both `direct`
1. Open cockpit on machine A. Confirm machine B appears in fleet as green "online"
   (F-1 LAN-IP publish makes the LAN direct probe succeed; verified `13ab2417`).
2. CLI cross-check on A: `musu nodes --local` → B shows healthy/direct.
3. Web cross-check: open musu.pro fleet page → B shows green.

### Step 2 — force `relay`: break direct, keep heartbeat
The relay state is "direct probe failed, registry heartbeat still fresh". To induce
it WITHOUT taking B offline, block A's direct path to B while B keeps heart-beating
to the cloud registry:
- Easiest: on machine B, block inbound to the bridge LAN port via Windows Firewall
  (B still reaches the cloud registry outbound, so its heartbeat stays fresh), OR
- NAT-split the two machines (move B to a different network) so the published LAN
  IP is unreachable from A but B's outbound registry heartbeat continues.
3. Within ~30s (web/cockpit poll) machine B flips to YELLOW "relay" on A's cockpit.
4. Confirm B is STILL targetable: delegate a task A→B; it should route over the relay
   forward path (route_proof `transited:true`).
5. CLI cross-check: `musu nodes --local` on A → B shows "relay" 🟡 (NOT "offline ❌").

### Step 3 — force `offline`: let heartbeat expire
1. Stop the bridge on machine B entirely (close cockpit / `musu bridge` stop) so its
   registry heartbeat stops.
2. After the registry TTL (120s) + RELAY_FRESH_SECS window (300s) elapse, B's
   `last_seen` ages past 300s → B flips to RED "offline" on A's cockpit.
3. Confirm B is NOT targetable (order-target `<select>` excludes it; `if(!targetable) return`).

## Headless stand-in (no second machine)

Until two machines are available, the two-bridge smoke proves the route path on one
box (two independent bridge homes):

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/smoke-two-bridge-route-proof.ps1 -Json -TimeoutSec 120
```

Expect: source task `status=done`, `route_proof.result=success`,
`callback_delivered=true`. Evidence under `.local-build/two-bridge-route-proof/`.

This proves forward + callback wiring but NOT the relay-vs-direct VISUAL flip (both
bridges are loopback-reachable). The 3-state flip itself needs the real-hardware
procedure above OR the `relay_verdict()` boundary unit tests.

## Build note (PID-lock trap)

A full `cargo build`/MSIX link FAILS with `os error 5` if `target/debug/musu.exe`
(or an installed cockpit spawning it) is running. Before building: close cockpit,
confirm no `musu.exe` in Task Manager. Do NOT kill mid-run — close gracefully.
For code-only checks use `cargo check` / `cargo test --lib --no-run`.

## Pass criteria

- [ ] Step 1: B green on all three surfaces (web, CLI, cockpit).
- [ ] Step 2: B yellow "relay" on all three; A→B task still routes (transited:true).
- [ ] Step 3: B red "offline" on all three after ~300s; not targetable.
- [ ] No surface disagrees at any step (the THREE-surface invariant).
