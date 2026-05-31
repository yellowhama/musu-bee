# MUSU 1.15.0-rc.1 Runtime Hardening and Relay Roadmap

**Wiki ID**: wiki/523
**Date**: 2026-05-31
**Scope**: runtime quality reassessment after real second-PC MSIX install evidence returned, a primary-side multi-device smoke hang, and operator observation that MUSU consumes idle CPU in a busy-loop pattern on more than one Windows PC.

## Verdict

MUSU is **not ready for public desktop release**.

The blocker set has changed. It is no longer accurate to say the release is blocked only by external evidence. As of this reassessment, there are three internal product-quality blockers:

1. **Idle CPU busy-loop risk**: operator observed MUSU using roughly 20% of one core while apparently idle on both the primary and second PC.
2. **Hosted relay/control-plane gap**: current two-machine flow still depends too much on direct LAN/manual endpoint routing; MUSU needs a `musu.pro` assisted path for rendezvous, peer selection, and relay/tunnel fallback.
3. **Runtime hardening gap**: background loops, process ownership, startup behavior, and resource budgets are not yet treated as release gates.

The correct current positioning is:

> Single-machine packaging and MSIX install evidence are progressing, but MUSU must pass an idle-resource and two-machine relay readiness gate before public Store launch.

## Evidence Snapshot

New evidence imported from the second PC:

- Return ZIP: `F:\Aisaak\Projects\localsend\second-pc-return\20260531-165240-HUGH-MAIN.second-pc-return.zip`
- Recorded MSIX install evidence: `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json`
- Verification: `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.verification.json`
- Summary: `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.summary.md`
- Installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Second-PC selected remote address: `192.168.1.192:8949`
- Alternative returned address: `172.27.208.1:8949`

What this closes:

- The second-PC MSIX install evidence gate is now evidence-backed locally.

What it does not close:

- Multi-device route evidence is still missing.
- Support mailbox delivery evidence is still missing.
- Partner Center/Microsoft Store release evidence is still missing.
- Formal two-machine runtime idle CPU evidence is newly required and still
  missing. A primary-side debug-runtime diagnostic sample now exists under
  `.local-build\runtime-idle-cpu\musu-idle-cpu-20260531-194854.json`, but it
  is not enough for the public gate because no owned Tauri/WebView2 desktop
  shell was present and the second PC still needs its own sample.

## Code Audit Findings

### P0-1: Idle CPU is now a release gate

The repo did not previously have a repeatable idle CPU gate. That was a real gap. A new local measurement script now exists:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -MaxOneCorePercent 5 -IncludeNode -IncludeWebView2 -FailOnHot -Json
```

The script writes `musu.runtime_idle_cpu_evidence.v1` JSON under `.local-build\runtime-idle-cpu\`. A Store/public build should pass this on a fresh boot, after opening the app, after starting the runtime, and after the second-PC route flow. The sample is invalid if no MUSU runtime process is running.

The measurement now separates MUSU, Node.js, and WebView2 by role and records
`helper_process_scope`. By default, Node/WebView2 helpers are included only when
they are owned by the MUSU process tree or are repo-related helpers; unrelated
system WebView2 processes are not counted unless the operator explicitly passes
`-IncludeUnrelatedHelpers` for a whole-machine diagnostic. On Windows this uses
native parent-process lookup instead of WMI, because WMI/CIM can hang and would
make CPU evidence unreliable. Release go/no-go now rejects runtime CPU evidence
that omits `-IncludeNode`, omits `-IncludeWebView2`, has no valid helper scope,
or cannot prove process ownership metadata for the default owned-helper scope.

`scripts\windows\write-release-go-no-go.ps1` now reports `runtime_idle_cpu_verified` and blocks public readiness until runtime idle CPU evidence passes on at least two machines with the 60s / 5%-of-one-core threshold.

Acceptance target for public beta:

- idle MUSU bridge/app process: <= 5% of one logical CPU for a 60s sample
- no unbounded process growth after repeated `musu up` / desktop start clicks
- bridge remains reachable while idle CPU is low
- second PC passes the same sample

### P0-2: Unconditional clipboard polling was too aggressive

`musu-rs/src/bridge/mod.rs` started the universal clipboard monitor on every bridge boot. The monitor itself sleeps two seconds between polls, but clipboard access is privacy-sensitive and should not be baseline background work for the Store candidate.

Change made:

- Clipboard sync is now opt-in through `MUSU_ENABLE_CLIPBOARD_SYNC=1`.
- Default Store/beta bridge startup no longer starts the clipboard polling loop.

This does not prove the reported 20% busy-loop is fixed. It removes one unjustified default background loop and tightens the product contract.

### P0-3: Cloud heartbeat loop exists, but it is not a complete relay/control plane

`musu-rs/src/bridge/mod.rs` already has a logged-in cloud registration loop that:

- registers the node to `https://musu.pro`
- gathers hardware and optional Tailscale metadata
- lists sibling nodes
- writes cached peer metadata and manual peer entries
- sleeps on a low-duty interval; default `MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC=300`, with a 60s floor, failure backoff, and jitter

This is useful, but it is not enough for the real product:

- no explicit relay session model
- no endpoint reachability negotiation
- no fallback when direct LAN/Tailscale address fails
- no user-visible peer path choice or failure reason
- no route-evidence contract tied to the loop

The loop should become a low-duty-cycle control-plane client, not a hidden best-effort background task.

### P0-4: Frontend polling needed an idle budget

The Next dashboard had several mounted view-level polling loops at 5s and 10s intervals. That is tolerable for a developer dashboard, but not for a desktop app that may sit idle in the background.

Change made:

- service health polling: 5s -> 15s, no overlap, pause when hidden
- processes polling: 5s -> 10s, no overlap, pause when hidden
- doctor card polling: 10s -> 30s, pause when hidden
- fleet dashboard polling: 10s -> 30s, pause when hidden
- device discovery polling: 10s -> 15s, pause when hidden
- main dashboard polling: 15s fixed interval -> 30s visible / 120s hidden
  recursive timeout with no overlapping refreshes
- node panel registry/discovery polling: 15s fixed interval -> 30s visible /
  120s hidden recursive timeout
- agents surface polling: 5s fixed interval -> 30s visible / 120s hidden
  recursive timeout

This does not prove the reported 20% busy-loop is fixed. It removes unnecessary foreground-style polling from the idle path and makes browser/WebView2 CPU easier to interpret.

### P0-5: `musu up` and smoke path need process ownership hardening

The primary-side multi-device smoke hung while running `musu up --json` through the repo debug binary path. That is not acceptable as a public operator path.

Required fixes:

- enforce one bridge owner per `MUSU_HOME`
- make `musu up` refuse or repair stale registry/process state deterministically
- prefer the installed MSIX alias for packaged release smoke, unless `-MusuExe` is explicitly supplied
- add bounded timeout and child-process cleanup around smoke harness invocations
- expose "already running", "started", "unhealthy", and "conflicting process" as separate states

### P1: Frontend polling must be consolidated further

The Next dashboard has many view-level polling loops at 2s, 5s, 10s, 30s, and 60s intervals. Many are scoped to mounted pages, so they are not automatically idle-background bugs, but the product has no single polling budget.

Required fixes:

- introduce a shared client polling scheduler
- keep all low-priority polling paused when tab/app is hidden
- switch hot status surfaces to SSE/WebSocket where already available
- add a browser-side poll budget audit

## `musu.pro` Relay / Control-Plane Design

The product should not depend only on "try this returned LAN `host:port`". The correct architecture is:

1. **Registry**: device login, node identity, package version, capabilities, last seen, candidate endpoints.
2. **Rendezvous**: both nodes hold an outbound authenticated control channel to `musu.pro`.
3. **Path selection**: direct LAN/Tailscale first, then hosted relay/tunnel fallback.
4. **Relay session**: short-lived session id, scoped pair of node ids, explicit operator approval, expiring bearer token.
5. **Data policy**: local/LAN traffic stays free; MUSU-hosted relay/tunnel is the paid Connect boundary.
6. **Audit**: each remote route records path type (`lan`, `tailscale`, `relay`), target node, command id, timings, failure class, and whether payload transited MUSU infrastructure.

Minimal API shape:

- `POST /api/v1/nodes/register`
- `GET /api/v1/nodes`
- `POST /api/v1/p2p/rendezvous`
- `GET /api/v1/p2p/rendezvous/:id`
- `POST /api/v1/p2p/rendezvous/:id/candidates`
- `POST /api/v1/p2p/rendezvous/:id/approve`
- `POST /api/v1/p2p/route-evidence`
- `WS /api/v1/p2p/control?node_id=...`
- `WS /api/v1/relay/connect?session_id=...&node_id=...`

Detailed control-plane API and route evidence contract:
`docs/MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md` (wiki/524).

Execution plan for the three operator-reported blockers:
`docs/MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md` (wiki/525).

Minimal client behavior:

- keep one low-duty outbound control connection when user is logged in
- send heartbeat only on interval, version change, endpoint change, or app foreground transition
- never spin when offline; exponential backoff with jitter
- explain in `musu doctor` whether the current route is direct or relayed

## Roadmap

### P0: Stop release until idle resource behavior is measured

1. Run `measure-musu-idle-cpu.ps1 -IncludeNode -IncludeWebView2` on primary and second PC with MUSU installed, app opened, runtime started, and the Tauri/WebView2 desktop shell present.
2. Fix any process above 5% of one core while idle.
3. Record passing idle CPU evidence; the release go/no-go gate now blocks until it passes.
4. Add process-count and startup-repeat checks: repeated desktop "Start Runtime" clicks must not spawn duplicate bridges.
5. Make smoke scripts fail fast if `musu up --json` does not return inside a bounded timeout.

### P0: Harden default background work

1. Keep `MUSU_ENABLE_MDNS=1` opt-in.
2. Keep `MUSU_ENABLE_CLIPBOARD_SYNC=1` opt-in.
3. Keep cloud heartbeat interval, floor, backoff, and jitter enforced by default.
4. Add a "background features" section to `musu doctor --json`.
5. Add a Windows StartupTask cold-boot idle check.

### P1: Build `musu.pro` assisted peer path

1. Treat existing cloud node registration as registry v0.
2. Add rendezvous/route-evidence DTOs and tests in the Next API or dedicated service.
3. Add bridge client commands: `musu relay status`, `musu relay connect`, `musu relay route`.
4. Add route path selection: manual peer -> cached direct endpoint -> relay fallback.
5. Record route evidence with path type and timings.

Current enforcement update: `smoke-multidevice-beta.ps1` writes
`musu.route_evidence.v1`, and `verify-multidevice-evidence.ps1` now rejects
passing route evidence unless it includes route kind, candidate address,
handshake timing, peer identity verification, hardened encryption, payload
transit truth, and success result. This deliberately prevents legacy manual
HTTP bearer routing from satisfying the public multi-device release gate.

### P2: Productize relay as MUSU Connect

1. Free: localhost/LAN/direct private network.
2. Paid: hosted relay/tunnel, external browser access, remote session resume.
3. UI: show "Direct" vs "Relayed" state.
4. Store copy: no overclaiming P2P reliability until direct and relay paths both pass evidence.

## Revised Qualitative Completion

| Surface | Previous | Current | Reason |
|---|---:|---:|---|
| Single-machine Windows local beta | ~92% | ~82% | Functionality is proven, but idle CPU and process ownership are now unverified P0 gates. |
| Store/operator-gate infrastructure | ~90% | ~88% | Evidence tooling is strong; runtime-quality gates must be added. |
| Public desktop release readiness | ~68% | ~52% | MSIX install evidence improved, but idle CPU, multi-device route, relay path, support mailbox, and Store approval remain open. |
| Full desktop GUI product maturity | ~55-60% | ~50% | Tauri shell remains launcher/status only, and runtime resource polish is not yet product-grade. |
| Multi-device product maturity | ~45% | ~38% | Direct second-PC install evidence exists, but route proof and relay fallback do not. |

## Release Decision

Current decision: **No-Go, internal and external blockers**.

Do not submit broadly or market as a reliable desktop utility until:

- `msix_install_verified=true`
- `multi_device_verified=true`
- `support_mailbox_verified=true`
- `store_release_verified=true`
- idle CPU evidence passes on primary and second PC
- repeated startup does not spawn duplicate runtimes
- `musu.pro` assisted peer routing has at least a registry/direct path proof, with relay/tunnel fallback either implemented or explicitly excluded from the launch promise
