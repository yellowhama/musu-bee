# Fleet 3-State E2E Playbook (2026-06-23, V33-정정 2026-06-26)

Reproduce the `direct → relay → offline` transition on a real installed cockpit.
This validates the F-3 relay-reachable fleet state end-to-end after PR #23
(backend + cockpit + CLI) and PR #21 (web page) land.

> Status: `direct`/`online` 양방향 실증 완료 (2026-06-26, 양쪽 rc.20: hugh_second ↔
> hugh-main 둘 다 healthy/direct, cross-machine authed 401 없음 — 핸드오프
> `HANDOFF_2026_06_26_REINSTALL_RESILIENCE_V29_V31.md` 참조). 남은 user-gated 부분은
> `relay`/`offline` **표시(display) flip**뿐. Boundary + probe→fallback 통합 단위테스트
> (`cargo test --lib bridge::handlers::fleet`)가 표시 판정을 커버.

> ⚠️ **중요 — "표시 flip" ≠ "실제 relay 라우팅" (V33 정정)**: 이 3-state는 fleet status의
> **표시/판정 레이어**일 뿐이다. 실제 task 라우팅(`router.rs::select_peer_for_route`,
> L170-171)은 **relay를 선택하지 않는다 — relay/QUIC 터널 transport가 아직 미구현**이기
> 때문. 따라서 노랑("relay") 상태는 "registry heartbeat가 신선해서 곧 복구될 것으로 **표시**"
> 한다는 의미이지, 그 상태에서 delegate한 task가 relay 경로로 forward된다는 뜻이 **아니다**.
> direct 경로가 복구되기 전까지 실제 forward는 안 간다. relay transport 실구현은 별도 후속
> (V34 큐잉). 이 플레이북은 **표시 전이**를 검증한다.

## Prereqs

- Two Windows machines on the SAME LAN, each with the current rc MSIX installed +
  logged in to the same musu account (so both publish to musu.pro registry).
  실증 시점 양쪽 rc.20.
- 버전 확인: `tauri.conf.json` + `musu-rs/Cargo.toml` + `VERSION` 일치(현재 `1.15.0-rc.20`).
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
4. Confirm B is **표시상** STILL targetable (yellow dot, not red): the UI marks it
   targetable because heartbeat is fresh. ⚠️ **단, 실제 delegate가 relay로 forward되는지는
   검증하지 말 것** — relay transport 미구현(router.rs:170)이라 direct 복구 전까지 forward는
   안 간다. delegate A→B를 시도하면 direct 경로 실패로 실패하거나 큐잉될 수 있다(정상). 여기서
   검증하는 것은 **노랑 표시 전이**이지 relay forward 동작이 아니다.
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

- [x] Step 1: B green on all three surfaces (web, CLI, cockpit). **실증 완료 2026-06-26**
      (양쪽 rc.20, hugh_second ↔ hugh-main 양방향 direct/healthy).
- [ ] Step 2: B yellow "relay" **표시** on all three; targetable로 **표시**됨(노랑 dot).
      ⚠️ transited:true relay forward는 검증 대상 아님(relay transport 미구현 — 위 ⚠️ 참조).
- [ ] Step 3: B red "offline" on all three after ~300s; not targetable.
- [ ] No surface disagrees at any step (the THREE-surface invariant).

## 후속 큐잉 (이 플레이북 범위 밖)

- **relay transport 실구현 (V34?)**: `router.rs::select_peer_for_route`가 direct 실패 시 relay
  경로를 실제 선택하도록 + QUIC relay 터널(`relay_transport_wired`) 연결. 이게 되면 Step 2의
  "transited:true relay forward"가 비로소 검증 가능해진다. 현재는 표시 레이어만 존재.
