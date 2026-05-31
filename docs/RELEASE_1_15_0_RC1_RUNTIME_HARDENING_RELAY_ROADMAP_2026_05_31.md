# MUSU 1.15.0-rc.1 Runtime Hardening and Relay Roadmap

**Wiki ID**: wiki/523
**Date**: 2026-05-31
**Scope**: runtime quality reassessment after real second-PC MSIX install evidence returned, a primary-side multi-device smoke hang, and operator observation that MUSU consumes idle CPU in a busy-loop pattern on more than one Windows PC.

## Verdict

MUSU is **not ready for public desktop release**.

The blocker set has changed. It is no longer accurate to say the release is blocked only by external evidence. As of this reassessment, there are four internal product-quality blockers:

1. **Idle CPU busy-loop risk**: operator observed MUSU using roughly 20% of one core while apparently idle on both the primary and second PC.
2. **Hosted relay/control-plane gap**: current two-machine flow still depends too much on direct LAN/manual endpoint routing; MUSU needs a `musu.pro` assisted path for rendezvous, peer selection, and relay/tunnel fallback.
3. **Runtime hardening gap**: background loops, process ownership, startup behavior, and resource budgets are not yet treated as release gates.
4. **MSIX/source-fresh packaging gap**: the regenerated Store artifact and fixed local-sideload installed package now launch `musu-desktop.exe`, but source-fresh release packaging still hit local rustc OOM/pagefile pressure and final clean two-machine desktop/WebView2 evidence is missing.

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
- MSIX desktop-entrypoint evidence now exists under
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-214327-HUGH_SECOND.store-msix-runtime-only.evidence.json`
  for the old runtime-only package and
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-224328-HUGH_SECOND.store-msix-desktop-artifact.evidence.json`
  for the regenerated artifact. The regenerated artifact passes with
  `musu-desktop.exe` as the application executable, `musu.exe` as the CLI
  alias, `musu-startup.exe` as the startup task, and a desktop-shell
  description.
- Local-sideload installed desktop-entrypoint evidence now passes at
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.local-sideload-installed.evidence.json`.
  Store-reviewed restricted-capability `-RequireInstalledPackage` evidence
  correctly fails on local sideload installs at
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.store-reviewed-contract-mismatch.evidence.json`.
- Store submission bundle verification now passes for
  `.local-build\msix\submission-bundles\store-reviewed-20260531-224352`
  with `ok=true`, `fail_count=0`.
- A source-fresh `build-msix.ps1` release build attempt on `HUGH_SECOND`
  failed in `musu-rs` rustc OOM/pagefile pressure even with
  `CARGO_BUILD_JOBS=1`; the passing package-structure check used
  `build-msix.ps1 -SkipBuild` and existing release binaries.
- Current process ownership audit evidence exists locally under
  `.local-build\process-ownership\musu-process-ownership-20260531-232247.json`.
  It passed with one MUSU runtime, one desktop shell, zero MUSU-owned Node
  helpers, six MUSU-owned WebView2 helpers, two machine-wide Node processes, 19
  machine-wide WebView2 processes, zero repo-related orphan helpers, bridge
  registry PID alive, and bridge `/health` HTTP 200.
- Startup single-instance evidence now exists under
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260531-203635-HUGH_SECOND.evidence.json`.
  Three consecutive `musu up --json` calls reused bridge PID 31208, left one
  MUSU runtime process, and passed nested process ownership.

## Code Audit Findings

### P0-1: Idle CPU is now a release gate

The repo did not previously have a repeatable idle CPU gate. That was a real gap. A new local measurement script now exists:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json
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
cannot prove process ownership metadata for the default owned-helper scope, is
not captured from clean git, omits memory/resource-budget totals, or does not
use the `desktop-open` scenario with `-RequireOwnedWebView2`.

`scripts\windows\write-release-go-no-go.ps1` now reports `runtime_idle_cpu_verified` and blocks public readiness until runtime idle CPU/resource-budget evidence passes on at least two machines with the 60s / 5%-of-one-core threshold, owned WebView2 present, owned process count <= 16, owned WebView2 process count <= 8, and total owned working set <= 1024MB.

`scripts\windows\build-msix.ps1` now stages `musu-desktop.exe` as the MSIX
application executable, keeps `musu.exe` as the CLI alias, keeps
`musu-startup.exe` as the startup task, and writes a desktop-shell package
description. `scripts\windows\audit-msix-desktop-entrypoint.ps1` now reports
whether the MSIX Start-menu application launches `musu-desktop.exe`.
`write-release-go-no-go.ps1` reports `msix_desktop_entrypoint_verified`;
`verify-store-submission-bundle.ps1` rejects bundles that still package only
the runtime CLI, while artifact-only audits no longer fail just because an old
installed package is present. The installed-package gate must pass before any
`desktop-open -RequireOwnedWebView2` CPU evidence can be meaningful.

Acceptance target for public beta:

- idle MUSU bridge/app process: <= 5% of one logical CPU for a 60s sample
- desktop-open sample must include at least one MUSU-owned WebView2 process
- owned process count <= 16, owned WebView2 process count <= 8, total owned
  working set <= 1024MB
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

- `musu-bee/src/lib/useLowDutyPolling.ts` is now the shared low-duty client
  polling helper for desktop-safe dashboard refreshes.
- The helper uses one recursive timeout instead of fixed `setInterval`,
  prevents overlapping requests, aborts in-flight fetches on unmount, pauses
  low-priority work while the document is hidden, and backs off failed polling
  up to a capped delay.
- Device discovery, service health, process list, node mesh list, node panel,
  doctor card, fleet pages, company/machine detail pages, tasks/approvals/goals/
  projects/issues/costs panels, inbox polling, tasks SSE fallback polling, and
  canvas company/message-flow polling now use the shared helper or the same
  non-overlapping recursive pattern.
- Fleet/company/machine pages now use 30s safety-net polling and rely on
  existing EventSource wakeups for immediate updates instead of 5s fixed
  refreshes.

This does not prove the reported 20% busy-loop is fixed. It removes unnecessary foreground-style polling from the idle path and makes browser/WebView2 CPU easier to interpret.

### P0-5: Task admission wait no longer polls at 50ms

`musu-rs/src/writer/runner.rs` previously woke capped pending tasks every 50ms
while waiting for global/per-channel admission. That is not always an idle-path
bug, but it is still a needless periodic wakeup under backlog.

Change made:

- Admission now waits on `tokio::sync::Notify` and wakes when a running task
  releases a slot.
- A 1s safety recheck remains so a missed wake cannot strand a pending task.
- Release uses both `notify_waiters()` and `notify_one()` so channel-specific
  waiters get a broad wake while a permit is still available if no waiter was
  registered at that instant.

This reduces background scheduler wakeups during queued task pressure. It still
needs runtime evidence under a real backlog scenario before it can be called a
complete CPU fix.

### P0-6: `musu up` and smoke path need process ownership hardening

The primary-side multi-device smoke hung while running `musu up --json` through the repo debug binary path. That is not acceptable as a public operator path.

The first ownership gate is now implemented:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-process-ownership.ps1 -FailOnProblem -Json
```

It writes `musu.process_ownership_audit.v1` evidence under
`.local-build\process-ownership\`, uses native Windows parent-process lookup,
counts Node.js/WebView2 as MUSU-owned only when they descend from the MUSU
runtime, rejects repo-related orphan helpers, and verifies that the bridge
registry PID is alive and healthy. This directly addresses the operator concern
that many Node/WebView2 processes are visible system-wide: the release gate now
separates machine-wide helper inventory from MUSU-owned helper responsibility.

Current result on `HUGH_SECOND`: pass. The machine had 13 WebView2 processes and
one Node process visible, but none were MUSU-owned or repo-related orphans. The
only MUSU runtime was `musu.exe` PID 31208 and the registry
`C:\Users\empty\.musu\services\bridge.json` pointed to that live process.

The first repeated-startup gate is also implemented:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-startup-single-instance.ps1 -RepeatCount 3 -FailOnProblem -Json
```

It writes `musu.startup_single_instance_audit.v1` evidence, calls `musu up
--json` repeatedly with a timeout, verifies one stable bridge PID, rejects
repeated bridge spawning after the first call, and embeds the process ownership
audit. Current result on `HUGH_SECOND`: pass with PID 31208 reused across all
three calls.

Required fixes:

- enforce one bridge owner per `MUSU_HOME`
- make `musu up` refuse or repair stale registry/process state deterministically
- prefer the installed MSIX alias for packaged release smoke, unless `-MusuExe` is explicitly supplied
- add bounded timeout and child-process cleanup around smoke harness invocations
- expose "already running", "started", "unhealthy", and "conflicting process" as separate states

### P1: Frontend polling must be audited against one product budget

The worst Store-desktop polling paths now share one low-duty helper, but the
repo still has specialized live surfaces such as workflow run status,
onboarding progress, task fallback polling, and search debounces. Many are
scoped to active pages or active work, so they are not automatically idle bugs,
but the product still needs one budget and audit.

Required fixes:

- keep moving low-priority surfaces to `useLowDutyPolling`
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

### P0: Fix the MSIX desktop package boundary

1. Keep `musu-desktop.exe` as the MSIX `<Application Executable>`.
2. Keep `musu.exe` as the WindowsApps execution alias.
3. Keep `musu-startup.exe` as the `MusuBridgeStartup` startup task.
4. Produce a source-fresh fixed MSIX on CI or a larger build machine, or reduce
   the MSIX release build memory profile without changing the runtime contract.
5. Reinstall local-sideload and Store-reviewed MSIX artifacts on primary and
   second PC.
6. Require `audit-msix-desktop-entrypoint.ps1 -RequireInstalledPackage -Json`
   to pass before Store submission or `desktop-open` CPU evidence.

### P0: Stop release until idle resource behavior is measured

1. Run `measure-musu-idle-cpu.ps1 -IncludeNode -IncludeWebView2` on primary and second PC with MUSU installed, app opened, runtime started, and the Tauri/WebView2 desktop shell present.
2. Fix any process above 5% of one core while idle.
3. Record passing idle CPU evidence; the release go/no-go gate now blocks until it passes.
4. Keep `audit-musu-process-ownership.ps1 -FailOnProblem -Json` in the release
   gate. Repeated desktop "Start Runtime" clicks must not spawn duplicate
   bridges, repo-owned orphan Node helpers, or MUSU-owned WebView2 growth beyond
   the configured budget.
5. Make smoke scripts fail fast if `musu up --json` does not return inside a bounded timeout.

### P0: Harden default background work

1. Keep `MUSU_ENABLE_MDNS=1` opt-in.
2. Keep IPv6 mDNS disabled unless `MUSU_MDNS_ENABLE_IPV6=1`; Windows/Tailscale
   link-local IPv6 mDNS can repeat `os error 10065` sends and `closed channel`
   noise.
3. Keep `MUSU_ENABLE_CLIPBOARD_SYNC=1` opt-in.
4. Keep cloud heartbeat interval, floor, backoff, and jitter enforced by default.
5. Add a "background features" section to `musu doctor --json`.
6. Add a Windows StartupTask cold-boot idle check.

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
| Single-machine Windows local beta | ~92% | ~85% | Functionality is proven and local process/startup ownership now passes; packaged desktop/WebView2 idle CPU is still unproven. |
| Store/operator-gate infrastructure | ~90% | ~95% | Evidence tooling now includes runtime idle CPU, process ownership, startup single-instance, MSIX desktop-entrypoint gates, and a passing regenerated Store submission bundle artifact. |
| Public desktop release readiness | ~68% | ~55% | MSIX artifact packaging is fixed, but installed desktop evidence, source-fresh release packaging, idle CPU, multi-device route, relay path, support mailbox, and Store approval remain open. |
| Full desktop GUI product maturity | ~55-60% | ~50% | Tauri shell remains launcher/status only, and runtime resource polish is not yet product-grade. |
| Multi-device product maturity | ~45% | ~38% | Direct second-PC install evidence exists, but route proof and relay fallback do not. |

## Release Decision

Current decision: **No-Go, internal and external blockers**.

Do not submit broadly or market as a reliable desktop utility until:

- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `multi_device_verified=true`
- `support_mailbox_verified=true`
- `store_release_verified=true`
- idle CPU evidence passes on primary and second PC
- process ownership and startup single-instance evidence pass; repeated startup does not spawn duplicate runtimes
- `musu.pro` assisted peer routing has at least a registry/direct path proof, with relay/tunnel fallback either implemented or explicitly excluded from the launch promise
