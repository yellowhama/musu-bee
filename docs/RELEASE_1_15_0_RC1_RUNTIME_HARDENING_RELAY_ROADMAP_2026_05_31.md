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
- 2026-06-01 20:43 KST current primary evidence after the dashboard/node
  polling source change: single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-203715-HUGH_SECOND.evidence.json`
  passes; primary `desktop-open` CPU evidence
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-203537-HUGH_SECOND.desktop-open.evidence.json`
  passes from clean git with 60.061s sample and no hot processes; primary
  4-state matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-203835-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passes from clean git with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_203835`.
- Current hardening note: the first 20:35 desktop-open sample found CPU inside
  budget but also found old packaged `musu-desktop.exe` shells still present
  from repeated manual launches. The matrix was rerun after closing stale
  shells and showed the expected `musu=2`, repo Node `1`, WebView2 `6` desktop
  profile. This keeps "packaged desktop single-instance/window reactivation"
  as an explicit follow-up separate from bridge `musu up` reuse.
- 2026-06-02 packaged desktop single-instance update: the follow-up is now a
  formal release gate. `scripts\windows\audit-musu-desktop-single-instance.ps1`
  writes `musu.desktop_single_instance_audit.v1`, and
  `write-release-go-no-go.ps1` reports `desktop_single_instance_verified`.
  Current installed package still fails: evidence
  `.local-build\desktop-single-instance\musu-desktop-single-instance-20260602-005439-HUGH_SECOND.json`
  shows repeated Start-menu activation expanded one `musu-desktop.exe` shell
  to four (`new_desktop_shell=3`). Source has the Tauri single-instance plugin,
  but the release gate remains open until a fresh MSIX build/install passes the
  packaged activation audit.
- 2026-06-01 21:17 KST final primary evidence after deploy workflow
  hardening: single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-211031-HUGH_SECOND.evidence.json`
  passes; primary `desktop-open` CPU evidence
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-211132-HUGH_SECOND.desktop-open.evidence.json`
  passes from clean commit `a0184e89851d7ac99e1162a301f9219104a4df04` with
  MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`,
  `node=0`, `webview2=0.23`, working set `506.71MB`, and no hot processes;
  primary 4-state matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-211252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passes with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_211252`.
- Public-site deployment hardening is complete for the latest branding/scroll
  change: stuck Vercel run `26753317276` for `96303af3` was canceled, commit
  `65950384` added workflow timeouts and `vercel deploy --prebuilt --yes`,
  Vercel production run `26753908889` succeeded, `Tests` run `26753908911`
  succeeded, and live `musu.pro` QA passed on `/`, `/landing`, `/pricing`, and
  `/install` across desktop/mobile.
- 2026-06-01 21:41 KST P2P control-plane live evidence: added
  `record-p2p-control-plane-evidence.ps1` and
  `verify-p2p-control-plane-evidence.ps1`, and wired the verifier into
  go/no-go. Current evidence
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260601-214149-musu.pro.evidence.json`
  fails as expected because the live relay lease query is not owner-scoped:
  `ok=false`, `owner_scope_verified=false`, and the live error remains
  `p2p_control_auth_not_configured`. This converts the production P2P env
  issue from a note into a release blocker.
- 2026-06-01 23:45 KST source-current primary runtime evidence: after the
  final public-site/deploy source change, single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-231612-HUGH_SECOND.evidence.json`
  passes; primary `desktop-open` CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-231939-HUGH_SECOND.desktop-open.evidence.json`
  passes with MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU
  `musu=0`, `node=0`, `webview2=0.1`, working set `510.13MB`, and no hot
  processes; primary 4-state matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-233638-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passes with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_233638`.
  The operator-reported primary busy-loop is not reproduced in current
  evidence, but the runtime gates remain `1/2` until second-PC CPU and matrix
  evidence are imported.

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
- no duplicate `musu-desktop.exe` shells after repeated packaged
  Start-menu/AppsFolder activation
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

Current 2026-06-01 implementation update:

- Rendezvous, route-evidence storage/query, HTTPS fingerprint pinning, and
  fail-closed relay lease policy endpoints are implemented.
- Runtime forwarding now creates a rendezvous session, can use returned target
  candidates, writes/submits route evidence, and requests a relay lease after
  terminal direct-route failure when a session/account token exists.
- `musu relay leases --json` now queries relay lease audit records from the
  operator CLI and reports `owner_scope_verified`.
- P2P control auth now accepts `MUSU_P2P_CONTROL_TOKEN_SHA256S` /
  `MUSU_P2P_CONTROL_TOKEN_SHA256`, so production can accept the logged-in
  runtime token by storing only its SHA-256 hash. Production still needs that
  env configured and live-verified before relay lease evidence is trusted.
- This is still not release-grade P2P. Relay payload transport is not wired,
  `relay_default_data_path=false`, and QUIC/TLS route evidence remains the
  accepted release target.
- Frontend polling hardening update: direct `setInterval(` usage has been
  removed from `musu-bee/src`. Workflow run status, remote screen refresh,
  agents surface refresh, and onboarding research polling now use the shared
  `useLowDutyPolling` hook with cancellation, hidden-tab throttling, in-flight
  suppression, and backoff. `runtime-polling-contract.test.ts` guards this
  against regression. This reduces frontend busy-loop candidates, but release
  still requires fresh 60s CPU evidence on two machines.

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
   Hardware probes called from that heartbeat must remain low-duty and cached:
   current `peer::hardware` metadata uses process-local caching, Windows native
   Win32 RAM/CPU probes, and timeout-bounded fallback probes for remaining
   external commands.
5. Keep desktop `Start Runtime` bounded. The Tauri shell now runs
   `musu up --json` through temp-file stdout/stderr capture with a 45s timeout,
   so inherited bridge child handles cannot keep the UI busy forever.
6. Keep the `musu doctor --json` background features section current. It now
   reports mDNS, clipboard, cloud heartbeat, file watcher, and planner opt-ins.
7. Add a Windows StartupTask cold-boot idle check.

### P1: Build `musu.pro` assisted peer path

1. Treat existing cloud node registration as registry v0. **Done as baseline.**
2. Add rendezvous/route-evidence DTOs and tests in the Next API or dedicated service. **Done for rendezvous, route evidence, and relay lease policy.**
3. Fix production P2P control auth. **Code support for SHA-256 runtime-token allowlisting exists through `MUSU_P2P_CONTROL_TOKEN_SHA256S`; open work is Vercel production env configuration plus live `musu relay leases --json` verification.**
4. Add bridge client diagnostics. **`musu relay status`, `musu relay leases`, and `musu route --explain` exist; `musu relay connect` / `musu relay route` remain pending because relay transport is not wired.**
5. Add route path selection: manual/cached peer -> control-plane candidate -> relay fallback lease request. **Direct candidate selection and runtime lease request exist; relay payload fallback remains pending.**
6. Record route evidence with path type and timings. **Runtime and CLI route evidence write `musu.route_evidence.v1`, but release-grade QUIC/TLS proof is still missing.**

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
| Single-machine Windows local beta | ~92% | ~88% | Functionality is proven, local process/startup ownership passes, and current primary desktop-open CPU evidence is clean; second-PC CPU evidence remains open. |
| Store/operator-gate infrastructure | ~90% | ~96% | Evidence tooling now includes runtime idle CPU, process ownership, startup single-instance, MSIX desktop-entrypoint gates, second-PC return CPU matrix capture, and a passing regenerated Store submission bundle artifact. |
| Public desktop release readiness | ~68% | ~64% | MSIX install/desktop-entrypoint, public site deployment, primary idle CPU evidence, and primary CPU matrix are much stronger, but second-PC desktop CPU, real route proof, support mailbox, Store approval, relay/QUIC evidence, and production P2P control auth remain open. |
| Full desktop GUI product maturity | ~55-60% | ~50% | Tauri shell remains launcher/status only, and runtime resource polish is not yet product-grade. |
| Multi-device product maturity | ~45% | ~48% | Direct second-PC install evidence exists and the `musu.pro` rendezvous/route-evidence/relay-lease control plane is wired in code, but live production relay lease queries currently fail on P2P control auth; release-grade QUIC/TLS route proof and relay payload transport do not exist yet. |

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
- production P2P control auth no longer returns `p2p_control_auth_not_configured`
  for `musu relay leases --json`

## 2026-06-01 Desktop Start Runtime Hardening Update

`musu-bee/src-tauri/src/lib.rs` now avoids `Command::output()` for
`musu up --json`. The desktop shell captures stdout/stderr through temp files,
sets `stdin` to null, waits with 200ms sleeps, and returns a visible timeout
message after 45s. This closes a desktop-specific busy state where a long-lived
bridge child can inherit stdout/stderr handles and keep the command result from
settling.

Validation:

- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed
  3/3 tests.
- The added unit test proves command output capture without direct output pipes.
- A source search found no `.output()`/`wait_with_output` path left in
  `musu-bee/src-tauri/src/lib.rs`.

Process diagnostic note: a 2026-06-01 17:53 KST process ownership audit on
`HUGH_SECOND` observed 16 machine-wide Node.js processes, but MUSU-owned Node
helpers and repo-related orphan helpers were both 0. The audit failed only
because no MUSU runtime was running and `~/.musu/services/bridge.json` pointed
at a dead bridge PID, so it must not be used as release evidence.

## 2026-06-01 Stale Bridge Registry Cleanup Update

The desktop shell now treats a dead bridge registry PID as stale state before
it probes health. `desktop_status` parses `~/.musu/services/bridge.json`,
checks the recorded PID on Windows through
`OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`, deletes the registry file when
the PID is dead, and returns an offline status with no `bridge_url`. This means
the shell no longer keeps pointing at an obsolete `127.0.0.1:<port>` after a
bridge crash or manual process cleanup.

Validation:

- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed
  5/5 Tauri shell tests.
- Tests cover stale registry removal before health probing and live registry
  URL preservation.

Release interpretation:

This improves failure handling and process ownership hygiene, but it is not a
release substitute for the packaged desktop Start Runtime click audit, live
process ownership evidence, or two-machine 60s CPU evidence.

## 2026-06-01 Doctor Background Profile Update

`musu doctor --json` now reports a `background` object with the runtime
resource-affecting feature profile:

- `mdns`, `mdns_ipv6`, `mdns_tailscale`, and `mdns_virtual_interfaces`
- `clipboard_sync`
- `cloud_registration`, `cloud_heartbeat_interval_sec`, and
  `cloud_heartbeat_floor_sec`
- `file_sync`, `file_serve_root_count`, and `file_serve_writable`
- `planner`

Doctor marks the background profile `ok` when optional hot-loop-prone features
are off and `warn` when opt-ins are enabled. Live `HUGH_SECOND` verification
reported the intended Store-candidate idle profile: mDNS off, clipboard off,
file sync off, planner off, cloud registration on, heartbeat `300s`, and
heartbeat floor `60s`.

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib
  cli_commands::tests::doctor_background -- --nocapture` passed 3/3 tests.
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- `musu doctor --json` and text `musu doctor` both expose the background
  profile.

## 2026-06-01 Planner Loop Budget Hardening Update

The optional autonomous planner loop is still disabled by default, but it now
has explicit idle-safety bounds when an operator opts into it:

- `MUSU_PLANNER_INTERVAL_SEC` is floored at 60s. Misconfigurations such as
  `MUSU_PLANNER_INTERVAL_SEC=0` can no longer turn the planner into a tight
  loop.
- `MUSU_PLANNER_COMMAND_TIMEOUT_SEC` defaults to 20s and is clamped to the
  5s..120s range.
- The planner crawler command now runs through `tokio::process::Command` with
  `stdin=null`, piped output, `kill_on_drop(true)`, and a timeout instead of
  blocking the async runtime on `std::process::Command::output()`.
- `musu doctor --json` now reports `planner_interval_sec`,
  `planner_interval_floor_sec`, `planner_command_timeout_sec`,
  `planner_command_timeout_floor_sec`, and
  `planner_command_timeout_ceiling_sec`.

Live verification with deliberately bad env values
`MUSU_ENABLE_PLANNER=1`, `MUSU_PLANNER_INTERVAL_SEC=0`, and
`MUSU_PLANNER_COMMAND_TIMEOUT_SEC=9999` reported
`planner_interval_sec=60`, `planner_command_timeout_sec=120`, and
`background.status=warn`.

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib
  brain::planner::tests -- --nocapture` passed 2/2 tests.
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib
  cli_commands::tests::doctor_background -- --nocapture` passed 4/4 tests.
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- `git diff --check` passed.

## 2026-06-01 Frontend Polling Follow-up Update

The frontend busy-loop audit found two remaining hand-written refresh loops
outside the shared polling contract:

- `musu-bee/src/components/dashboard/DashboardClient.tsx`
- `musu-bee/src/components/NodePanel.tsx`

Both now use `useLowDutyPolling`, so the dashboard agents/tasks/watchdog/runs
refresh and the node panel nodes/registry/discovery refresh get the same
AbortController cancellation, in-flight suppression, hidden-tab throttling, and
failure backoff as the rest of the hardened runtime UI. The dashboard and node
panel no longer own local `document.visibilitychange` timer loops.

Validation:

- `npx tsx --test src/app/runtime-polling-contract.test.ts` passed 6/6 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- `rg -n "setInterval\(" musu-bee\src` returned no matches.
- `git diff --check` passed.

Release interpretation:

This further reduces frontend busy-loop risk, but it is a source change. Treat
the prior CPU evidence as stale for release gating until primary and second-PC
60s CPU samples plus the four-state runtime matrix are refreshed from a clean
commit.

## 2026-06-01 Hardware Probe Timeout Hardening Update

The logged-in cloud heartbeat calls `gather_hardware_info()` before registering
capability metadata with `musu.pro`. That path is low-duty, but it previously
used timeout-less process probes on some platforms:

- Windows RAM/CPU probes through PowerShell and WMIC.
- macOS RAM/CPU probes through `sysctl`.
- GPU VRAM probe through `nvidia-smi`.

`musu-rs/src/peer/hardware.rs` now routes those probes through
`command_stdout_with_timeout()`:

- `stdin` is closed.
- stdout is captured only after the child exits.
- stderr is discarded.
- the probe is killed and ignored after 5s.
- fallback hardware metadata is returned when a probe is missing, fails, or
  times out.

This is runtime hardening, not new release evidence. It removes another class
of background worker stall from the logged-in `musu.pro` heartbeat, but public
release still needs clean/current CPU evidence on two machines.

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib
  peer::hardware::tests -- --nocapture` passed 2/2 Windows tests.
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed.
- `git diff --check` passed.

## 2026-06-01 Deploy Workflow and Final Evidence Update

The `musu.pro` deploy path was hardened after a stuck Vercel production run:

- `Deploy musu-bee to Vercel` run `26753317276` for commit `96303af3` was
  canceled after staying in progress without useful logs.
- Commit `65950384` added a 20-minute job timeout, 10-minute deploy-step
  timeout, and switched the deployment command to `vercel deploy --prebuilt
  --yes`.
- Replacement Vercel production run `26753908889` passed, and `Tests` run
  `26753908911` passed.
- Live `https://musu.pro` QA passed on `/`, `/landing`, `/pricing`, and
  `/install` for desktop and mobile: scroll movement works, no horizontal
  overflow was observed, the favicon-header logo renders, the public scroll
  root exists, and the emerald accent is `#24C8DB`.

Final primary evidence was then refreshed:

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-211031-HUGH_SECOND.evidence.json`.
- Primary `desktop-open` CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-211132-HUGH_SECOND.desktop-open.evidence.json`,
  with max one-core CPU `musu=0`, `node=0`, `webview2=0.23`.
- Primary 4-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-211252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`,
  with token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_211252`.

Release interpretation:

- The operator-reported busy-loop is still not reproduced on current primary
  evidence.
- The hard release block is now evidence coverage, not a confirmed current
  primary CPU regression: second-PC CPU/matrix, release-grade multi-device
  route, production P2P env/live verification, `musu@musu.pro`, Store evidence,
  and relay/tunnel transport remain open.

## 2026-06-01 P2P Control-Plane Live Gate Update

The hosted P2P control-plane now has a release evidence contract instead of
only ad hoc CLI diagnostics.

New scripts:

- `scripts\windows\record-p2p-control-plane-evidence.ps1`
- `scripts\windows\verify-p2p-control-plane-evidence.ps1`

The recorder runs:

- `musu relay status --json`
- `musu relay leases --json`

Passing evidence requires:

- logged-in `musu.pro` relay status
- bridge path selection, rendezvous sessions, route-evidence client, relay
  lease control-plane, and runtime relay fallback lease requests wired
- `release_grade_transport_required=quic_tls_1_3`
- `relay_default_data_path=false`
- relay lease query `ok=true`
- `owner_scope_verified=true`
- `owner_scoped=true`

Current live evidence:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260601-214149-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260601-214149-musu.pro.verification.json`
- result: `ok=false`
- failure: relay lease query is logged in but not accepted by production auth;
  `owner_scope_verified=false`, `owner_scoped=false`, and the live error is
  `p2p_control_auth_not_configured` with no accepted auth modes.

Deployment implication:

- This is now a live `musu.pro` production env/deploy task. The desktop app
  can only prove the hosted control-plane once production scoped auth is
  configured (`MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent), the production
  environment is deployed/reloaded, and the recorder passes without
  `-AllowUnverified`.

Release interpretation:

- `write-release-go-no-go.ps1` now reports
  `p2p_control_plane_verified=false` and adds a `p2p-control-plane` blocker.
- The next operational action is to configure production
  `MUSU_P2P_CONTROL_TOKEN_SHA256S` from
  `scripts\windows\show-p2p-control-token-hash.ps1 -Json`, redeploy/recheck if
  needed, then record passing live evidence.
- Clean go/no-go on P2P gate commit
  `a6e41609d1c9ceaaf13ce73119f25e62471bfb5b` also reports
  `single_machine=false`, runtime idle CPU `0/2`, and runtime CPU scenario
  matrix `0/2` because release scripts changed after the last primary runtime
  evidence. Refresh primary smoke/CPU/matrix on the final commit before using
  second-PC evidence to close the two-machine runtime gates.
- Primary evidence was refreshed after that reset. Clean go/no-go on
  `5b8650f084a0df9cf5cabde77af31dd11b366c0a` reports
  `single_machine=true`, runtime idle CPU `1/2`, runtime CPU scenario matrix
  `1/2`, `manifest_dirty=false`, and `ready=false`. The refreshed
  production-dashboard desktop-open CPU sample peaks at `webview2=0.13` of one
  logical core with `469.28MB` working set, so the primary busy-loop report is
  still not reproduced on current evidence. Second-PC CPU/matrix remains open.

## 2026-06-02 Tauri Single-Instance and Site Deploy Update

Packaged desktop repeated activation is now confirmed against the currently
installed local-sideload package. Launching
`shell:AppsFolder\Yellowhama.MUSU_ygcjq669as2b6!MUSU` twice while one shell was
already open left three `musu-desktop.exe` processes on `HUGH_SECOND`. This is
not the same as the earlier bridge `musu up` single-instance gate; it is a
desktop shell/window reactivation gap.

Source hardening:

- `musu-bee/src-tauri/Cargo.toml` now depends on
  `tauri-plugin-single-instance = 2.4.2`.
- `musu-bee/src-tauri/src/lib.rs` registers the plugin and focuses the existing
  `main` WebView window on repeat activation.
- Local validation passed
  `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` with 5/5
  tests.

Release interpretation:

- The installed package is still old and should be treated as failing the new
  desktop repeated-activation expectation.
- Build/install a fresh MSIX before rerunning CPU or packaged desktop evidence.
- Add packaged desktop repeated-activation evidence before accepting
  `desktop-open` CPU samples as final release evidence.

Public-site follow-up:

- The website logo now renders the favicon mark itself instead of the wordmark.
- `.musu-public-scroll-root` now has explicit width, auto height, `100svh` /
  `100dvh` min-height, `overflow-y:auto`, touch panning, and stable scroll
  gutter rules.
- The homepage `Open App` CTA also uses the emerald `#24C8DB` point color.
- Local validation passed `npm run typecheck`, public-site Playwright 8/8, and
  `npm run build`.
- This deployed to `musu.pro` in commit
  `0ed3673a27b058ad1fc5d050434bf8435cb21e5d`. GitHub deploy run
  `26764307713`, Tests run `26764309477`, and E2E run `26764310368` passed.
  Production Playwright QA also passed 8/8 on `/`, `/landing`, `/pricing`, and
  `/install`.

## 2026-06-02 Fresh MSIX Primary Evidence Update

The fresh release MSIX now builds and installs on `HUGH_SECOND`, so the earlier
local OOM/pagefile blocker is no longer current on this machine.

Current primary evidence:

- Packaged desktop repeated activation:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-014803-HUGH_SECOND.evidence.json`,
  repeat count `3`, baseline desktop shell `0`, after `1`, new desktop shell
  `1`.
- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.evidence.json`,
  task `3e96b141-6aa5-4d39-a29b-450f15eed8b3`, bridge
  `http://127.0.0.1:6907`, output `MUSU_RELEASE_SMOKE_OK_20260602_015326`.
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-015358-HUGH_SECOND.desktop-open.evidence.json`,
  hot process count `0`, max one-core CPU `musu=0.03`, `node=0.68`,
  `webview2=0.7`, working set `537.79MB`.
- Four-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-015510-HUGH_SECOND.runtime-cpu-scenario-matrix.json`,
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_015510`.
- Process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-020031-HUGH_SECOND.evidence.json`,
  runtime `1`, desktop shell `1`, owned Node `0`, owned WebView2 `6`,
  machine-wide Node `18`, orphan repo helpers `0`.

Release interpretation:

- The primary installed package no longer reproduces desktop shell duplication
  after repeated activation.
- The primary busy-loop report is still not reproduced by current source-fresh
  evidence.
- This does not reduce the two-machine requirement. Second-PC desktop-open CPU
  and second-PC matrix evidence remain required.
- The website scroll/logo/accent fix is already deployed to `musu.pro`. The
  remaining hosted task is production P2P control-plane auth/env verification,
  not another website UI deploy.

## 2026-06-02 CLI Pipe Handle and Live Site Verification Update

The direct Windows CLI pipeline is now part of the release hardening contract.
The observed pattern was:

```powershell
musu up --json | ConvertFrom-Json
```

When `musu up` had to spawn a fresh long-lived bridge, the bridge could inherit
the caller stdout pipe and keep the PowerShell pipeline open after the parent
CLI emitted JSON and exited.

Source hardening:

- `spawn_bridge_process()` still redirects bridge stdout/stderr to
  `~/.musu/logs/bridge.log`.
- On Windows, the short-lived parent clears inheritance on
  `STD_INPUT_HANDLE`, `STD_OUTPUT_HANDLE`, and `STD_ERROR_HANDLE` before
  spawning the bridge.
- The bridge child is launched with `DETACHED_PROCESS`,
  `CREATE_NEW_PROCESS_GROUP`, and `CREATE_NO_WINDOW`.

Validation:

- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `git diff --check`
- fresh debug-binary pipe test returned instead of hanging:
  `ok=true`, `bridge_started=true`, bridge PID `37284`, bridge status `ok`,
  bridge URL `http://127.0.0.1:5692`, dashboard status `warn`

Release interpretation:

- This fixes the direct CLI pipe hang class in source and primary debug
  runtime evidence.
- The next release-grade step is to include this source in a fresh MSIX and
  run the same command through the packaged WindowsApps alias.
- Live `https://musu.pro` was rechecked on `/`, `/landing`, `/pricing`, and
  `/install` across desktop/mobile and passed scroll/logo/emerald QA. The
  website deploy question is closed for this UI scope.
- Clean go/no-go after the source fix reports `manifest_dirty=false` but
  `single_machine_verified=false`, runtime idle CPU `0/2`, and runtime CPU
  matrix `0/2`, because this Rust source fix postdates the latest fresh MSIX
  primary evidence.
- Public release remains No-Go until second-PC CPU/matrix, release-grade
  multi-device route proof, production P2P control-plane auth/env evidence,
  `musu@musu.pro` delivery proof, and Store evidence pass.

## 2026-06-02 Packaged CLI/Runtime Refresh

Fresh package evidence after the CLI pipe fix:

- packaged WindowsApps CLI pipe:
  `docs\evidence\cli-pipe\1.15.0-rc.1\20260602-032728-HUGH_SECOND.packaged-cli-pipe.evidence.json`,
  `returned_without_hang=true`, duration `7544ms`
- primary desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-033412-HUGH_SECOND.desktop-open.evidence.json`,
  max one-core CPU `musu=0`, `node=0`, `webview2=0.23`, hot process count
  `0`, working set `445.87MB`
- primary 4-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-033636-HUGH_SECOND.runtime-cpu-scenario-matrix.json`,
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_033636`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-033257-HUGH_SECOND.process-ownership.json`,
  runtime `1`, desktop shell `1`, owned Node `0`, owned WebView2 `6`,
  machine-wide Node `19`, orphan repo helpers `0`

Roadmap adjustment:

- Treat primary Windows package hardening as currently acceptable for beta
  evidence.
- Keep second-PC CPU/matrix as the next runtime gate; the busy-loop report is
  not closed until another machine confirms it.
- Keep the P2P control-plane task as production env/auth, not public website
  UI deployment. Latest live evidence still fails with
  `p2p_control_auth_not_configured`.

## 2026-06-02 P2P Auth Deploy and KV Storage Blocker Update

The `musu.pro` production deployment path now has the runtime token hash
allowlist wired:

- commit: `3be37e54a30bbd0bee95e9b2e22ce27d0450846c`
- successful production workflow_dispatch deploy: `26776054030`
- successful Tests run after the workflow change: `26775836294`
- final workflow validation commit: `9a3ec52df102d36075f245bdab526dc57fb99e08`
- final production deploy run: `26776909275`, success, aliased
  `https://musu.pro`
- final Tests run: `26776909221`, success
- current live evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-041225-musu.pro.evidence.json`

Important status change:

- Old blocker: `p2p_control_auth_not_configured`.
- Current blocker: `p2p_relay_lease_kv_not_configured`.

This means the hosted API now gets past auth and reaches the relay lease store.
The endpoint still fails closed because production lacks Vercel KV / Upstash
Redis credentials (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) or an equivalent
explicit persistent file store path.

Workflow hardening:

- `.github/workflows/deploy-musu-bee.yml` now syncs optional P2P production env
  values before `vercel pull`: control-token hash, KV URL/token, relay enabled
  flag, relay transport-wired flag, relay URL, entitlement, max records, and
  TTL.
- Missing values are skipped by name; secret values are not printed.
- Current GitHub repo secrets do not include `KV_REST_API_URL` or
  `KV_REST_API_TOKEN`, and repo variables are empty, so this is still an
  operator/infra provisioning task.

Next relay/control-plane gate:

1. Provision Vercel KV / Upstash Redis for `musu.pro`.
2. Add `KV_REST_API_URL` and `KV_REST_API_TOKEN` to GitHub repository secrets
   or directly to Vercel production env.
3. Run the deploy workflow again so production reloads with the env.
4. Rerun `record-p2p-control-plane-evidence.ps1` without `-AllowUnverified`.
5. Require `owner_scope_verified=true`, `relay leases ok=true`, and
   `relay_default_data_path=false`.

## 2026-06-02 Fresh mDNS Runtime Evidence Refresh

After the mDNS disconnected-receiver hardening commit
`39a9adf9833acb4324c46c646001c8c1ab622bfa`, the primary Windows package and
runtime evidence were refreshed:

- Fresh `local-sideload-manual` MSIX build/install passed for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-070642-HUGH_SECOND.evidence.json`
  passed with dashboard task `9968e62c-5f42-43ce-86ac-7b9a57a0d120`, bridge
  `http://127.0.0.1:12438`, and CLI route checked.
- Desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-070807-HUGH_SECOND.desktop-open.evidence.json`
  passed from clean git state with MUSU `2`, repo Node `1`, owned WebView2 `6`,
  hot `0`, max one-core CPU `musu=0`, `node=0.05`, `webview2=0.26`, and
  working set `534.5MB`.
- Runtime CPU matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-070927-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_070927`; all four
  scenarios stayed under the 5% one-core threshold with hot `0`.

Audit result:

- The busy-loop report is not reproduced on `HUGH_SECOND` after the mDNS
  receiver fix.
- The issue is not globally closed because release gates still require a second
  valid Windows machine.
- Current go/no-go remains No-Go: runtime idle CPU `1/2 [HUGH_SECOND]`, runtime
  CPU matrix `1/2 [HUGH_SECOND]`, multi-device false, support mailbox false,
  Store false, and P2P control-plane false because production relay lease KV is
  not configured.

## 2026-06-02 Health Poll Backoff Hardening

`musu up` bridge startup wait and auto-update post-swap `/health` polling now
use capped backoff: 250ms, 500ms, 1s, then 2s max. This replaces fixed 500ms
retry cadence in the remaining local Rust health-polling paths while preserving
their existing deadlines.

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 health_poll_delay`
  passed 2/2 targeted tests.
- `git diff --check` passed.

Roadmap impact:

- This reduces a local busy-loop candidate but does not close the CPU gate.
- Because runtime Rust source changed, fresh MSIX primary evidence is required
  before current HEAD can claim primary runtime CPU/matrix validity again.
- The next runtime proof remains: fresh primary package evidence, then
  second-PC runtime idle CPU and four-state matrix evidence.
- P2P relay/control-plane remains separate: provision production KV/Upstash,
  rerun live owner-scoped relay lease evidence, then complete relay payload or
  direct QUIC/TLS route proof.

## 2026-06-02 Health Poll Primary Evidence Refresh

After the health-poll backoff change, a fresh release MSIX build/install passed
again on `HUGH_SECOND` for `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.

Fresh primary evidence from clean commit
`1990b60b7e0b9f093c62bc48fa9b101a3f035c1b`:

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-104113-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-104113-HUGH_SECOND.process-ownership.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-104202-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-104113-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-104331-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Runtime result:

- desktop-open CPU: `git_dirty=false`, hot `0`, MUSU `0`, Node `0.03`,
  WebView2 `0.18`, working set `501.1MB`
- matrix: `git_dirty=false`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_104331`, max WebView2 `0.31`
- process ownership: runtime `1`, desktop `1`, owned Node `0`, owned WebView2
  `6`

Roadmap status:

- Primary busy-loop is not reproduced after the health-poll backoff change.
- Runtime CPU and matrix gates remain `1/2`; the second Windows PC is still the
  next evidence step.

## 2026-06-02 File Sync Watcher Storm Hardening

The optional file sync path now has explicit storm protection:

- bounded watcher event queue: `1024`
- max batch size: `256` events
- max batch collection window: `2s`
- same-path event coalescing before peer push/delete work
- `50ms` yield after batch-cap pressure

This keeps file sync aligned with the resource-budget rule for background
workers. It remains off unless shared roots are configured, but when enabled it
can no longer collect an unbounded event stream before yielding. Validation
passed cargo fmt, targeted `install::sync` unit test, and `git diff --check`.
Fresh runtime evidence is still required after commit because this is Rust
runtime source.

## 2026-06-02 Post File-Sync Primary Evidence Refresh

After the file sync watcher storm hardening commit, the primary release MSIX was
rebuilt, installed, and revalidated on `HUGH_SECOND`.

Fresh primary evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-171420-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-171538-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-171659-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-171500-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-171500-HUGH_SECOND.process-ownership.json`

Runtime result:

- desktop-open CPU: 60.048s sample, MUSU `0`, repo Node `0.03`, WebView2
  `0.57`, working set `496.62MB`, hot `0`
- runtime matrix: token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_171659`, all four
  scenarios passed under 5%-of-one-core
- process ownership: runtime `1`, desktop `1`, MUSU-owned Node `0`, MUSU-owned
  WebView2 `7`, machine-wide Node `18`

Roadmap status:

- Primary busy-loop is not reproduced after the file sync watcher storm
  hardening.
- Runtime CPU and matrix gates remain `1/2`; the second Windows PC is still the
  next evidence step.
- P2P/relay public claims remain blocked on live `musu.pro` owner-scoped
  control-plane evidence and release-grade two-machine route proof.

## 2026-06-02 Second-PC Runtime Cleanup Hardening

The second-PC release wrapper now has an explicit cleanup phase:

- `run-second-pc-release-check.ps1` writes
  `.local-build\runtime-cleanup\*.runtime-cleanup.json`
- schema: `musu.second_pc_runtime_cleanup.v1`
- cleanup runs in `finally`
- cleanup calls packaged `musu down --json --timeout-sec 5`
- cleanup stops packaged `musu-desktop.exe` shells opened by the evidence run
- cleanup JSON is included in the second-PC return zip
- top-level wrapper `ok=true` now requires cleanup success

Parser validation passed for the wrapper, multidevice kit generator, operator
action-pack generator, and action-pack verifier. Release evidence verifier
regression passed 13/13. A short local wrapper smoke on
`HUGH_SECOND` proved the cleanup path even though the known dev alias shadowing
caused MSIX install evidence capture to fail first:
`.local-build\runtime-cleanup\20260602-185052-HUGH_SECOND.runtime-cleanup.json`
reported `ok=true`, `stop_exit_code=0`, and remaining desktop shell count `0`.

## 2026-06-02 19:26 KST Stop/Desktop Cleanup Command Update

`musu stop` / `musu down` now keep bridge-only cleanup as the default, but add
an explicit desktop shell cleanup mode for operator/evidence runs:

```powershell
musu down --json --timeout-sec 5 --include-desktop
```

`musu.stop_report.v1` now records the desktop cleanup attempt, before/after
desktop PIDs, requested terminations, and desktop cleanup errors. The second-PC
release wrapper now uses this option before its PowerShell packaged-desktop
fallback, so cleanup evidence is visible in both `musu.stop_report.v1` and
`musu.second_pc_runtime_cleanup.v1`.

This moves process cleanup closer to the product runtime instead of relying
only on wrapper-specific PowerShell cleanup. It does not close release gates by
itself; a current packaged MSIX evidence refresh is required after the Rust
source change.

Roadmap impact:

- This improves second-PC process ownership and operator cleanup.
- It does not close the second-PC release gate.
- The next real second-PC run must return cleanup, runtime idle CPU, runtime
  CPU matrix, process attribution, and route evidence together.

## 2026-06-02 Runtime Stop/Down Command Hardening

Process ownership now has an operator cleanup command:

- `musu stop`
- `musu down`
- `--json` schema `musu.stop_report.v1`

The command stops only the registered bridge PID from
`~\.musu\services\bridge.json`, and only if the PID belongs to a MUSU runtime
binary. It refuses non-MUSU PIDs, removes stale bridge registry records, and
waits for PID exit with bounded backoff.

Validation passed cargo fmt, `cargo check --bin musu`, targeted
`install::cli_commands` tests, `cargo build --bin musu`, and a temporary-home
CLI smoke where `up --json` started bridge PID `37292` and `down --json`
stopped it with `registry_deregistered=true`.

Roadmap impact:

- This closes the missing operator-side bridge cleanup command.
- It reduces the chance of evidence/operator runs leaving stale bridge
  processes behind.
- It does not close release gates and makes current primary MSIX evidence stale
  until the package/evidence is rebuilt and refreshed after commit.

## 2026-06-02 Post Stop/Down Primary Evidence Refresh

The runtime stop/down command has now been included in a rebuilt and installed
primary release MSIX on `HUGH_SECOND`.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-183133-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-183056-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-183056-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-183056-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-183240-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Runtime result:

- packaged `musu down --json` cleanly stopped the registered bridge and
  deregistered it
- desktop-open CPU: clean 60.04s sample, MUSU `0`, repo Node `0.03`, WebView2
  `0`, working set `497.57MB`, hot `0`
- runtime matrix: token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_183240`, all four
  scenarios passed under 5%-of-one-core
- process ownership: runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `6`, machine-wide Node `18`

Roadmap status:

- Primary busy-loop is not reproduced after the stop/down source change.
- Runtime CPU and matrix gates remain `1/2`; the second Windows PC is still the
  next evidence step.
- P2P/relay public claims remain blocked on live `musu.pro` owner-scoped
  control-plane evidence and release-grade two-machine route proof.

## 2026-06-02 Stop/Desktop Cleanup Evidence Refresh

Post-commit local-sideload MSIX evidence is restored on `HUGH_SECOND` after
`musu down --include-desktop` was added:

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-195058-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-195129-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-195140-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-200531-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The fresh desktop-open CPU sample reports MUSU `0`, WebView2 `0.39`, owned Node
`0`, working set `362.27MB`, and hot process count `0`. The matrix route token
is `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_200531`. Packaged cleanup stopped the
bridge and one desktop shell with `desktop_pids_after=[]`.

Current hardening verdict: primary busy-loop evidence is not reproduced on the
current packaged build, but public release remains No-Go until the same CPU and
matrix proof returns from a real second PC, multi-device route evidence passes,
the live `musu.pro` P2P control plane is owner-scope verified, and support/Store
external evidence is recorded.

## 2026-06-02 Desktop Runtime Autostart Hardening

The runtime-start contract moved from "operator must manually run `musu up`" to
"desktop activation starts or reuses the bridge runtime." The Tauri shell now
spawns one background autostart attempt during setup only when bridge health is
missing or failed.

The command path also now prefers the packaged sibling `musu.exe` next to
`musu-desktop.exe`, avoiding developer PATH alias shadowing. Source validation
passed the Tauri shell unit suite 7/7. The next required gate is packaged MSIX
evidence showing desktop activation leaves runtime `1`, desktop `1`, no MUSU
owned Node leak, and idle CPU under budget.

## 2026-06-02 Post Desktop Autostart Evidence Refresh

The packaged MSIX evidence now proves the desktop runtime-start contract on
`HUGH_SECOND`:

- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-203833-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-203858-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-204112-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Process ownership passed without manual `musu up`: runtime `1`, desktop `1`,
owned Node `0`, owned WebView2 `6`, bridge `127.0.0.1:14805` HTTP 200. The
desktop-open CPU sample reports MUSU `0`, WebView2 `0.42`, working set
`364.02MB`, and hot process count `0`. The matrix route token is
`MUSU_CPU_SCENARIO_ROUTE_OK_20260602_204112`.

Current hardening verdict: the desktop-shell-only gap is closed locally, and
busy-loop is still not reproduced. The next release-critical runtime step is
the same current evidence on a real second PC.

## 2026-06-02 Cloud Hardware Probe Idle Hardening

The logged-in `musu.pro` cloud heartbeat now uses process-cached hardware
metadata instead of gathering hardware from scratch on every heartbeat cycle.

Runtime changes:

- `musu-rs/src/peer/hardware.rs` added `gather_hardware_info_cached()` with a
  `OnceLock`.
- `musu-rs/src/bridge/mod.rs` uses cached hardware metadata in the low-duty
  cloud registration loop.
- Windows total-memory and CPU-brand detection now use Win32
  `GlobalMemoryStatusEx` and registry `RegGetValueW`, avoiding default
  PowerShell/WMIC process creation.
- `nvidia-smi` GPU VRAM detection remains available but is reached through the
  cached metadata path, so recurring cloud heartbeat cycles do not repeatedly
  spawn it.

Validation passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml peer::hardware --lib -- --test-threads=1`
  3/3

Release meaning: this reduces one logged-in idle/background CPU candidate, but
does not close public release gates. Because runtime source changed, current
primary packaged evidence is stale until the MSIX is rebuilt/installed and
fresh primary smoke/process/CPU/matrix evidence is recorded.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CLOUD_HARDWARE_PROBE_IDLE_HARDENING_2026_06_02.md`

## 2026-06-02 Post Cloud Hardware Probe Primary Evidence

Fresh packaged primary evidence is restored for commit `9fff34aa` after the
cloud hardware probe idle hardening.

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-213655-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-213436-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-213706-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The desktop-open sample shows MUSU `0`, Node `0`, WebView2 `0.49`, working set
`363.18MB`, and no hot processes. The matrix passes all four scenarios with
route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_213706`.

Hardening verdict: primary idle remains within budget after the hardware probe
source change; second-PC CPU/matrix evidence is still the required next release
gate.

## 2026-06-03 Post Fleet SSE Primary Evidence Refresh

After Fleet SSE lifecycle hardening, the current local-sideload MSIX was rebuilt
and primary runtime evidence was restored on `HUGH_SECOND`.

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-073941-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-074231-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-074415-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Desktop-open CPU reports MUSU `0`, Node `0.05`, WebView2 `0.16`, working set
`500.12MB`, and hot `0`. The runtime matrix passes runtime-started,
dashboard-open, desktop-open, and post-route with route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_074415`.

Clean go/no-go on `0428c200` is back to `local_artifacts_ready=true` and
`single_machine_verified=true`; runtime idle CPU and matrix are each `1/2`
because second-PC evidence is still missing.

Hardening verdict: the Fleet SSE source change did not introduce a primary
busy-loop regression. The next release-critical runtime step remains the same
current CPU/matrix proof on a real second Windows PC.

## 2026-06-04 Control Plane/Product Split Update

The product direction is now explicitly split:

- local MUSU programs are the executors; they own local files, shell/browser/app
  automation, local bridge/runtime, and P2P mesh traffic
- `musu.pro` is the web coordination plane; it accepts user work orders,
  maintains project rooms, brokers rendezvous, records route/session evidence,
  and issues relay fallback only after direct paths fail
- `musu.pro` must not become the default execution server or default data path
- `localhost` dashboards are local operator/dev surfaces; when a user needs to
  submit work from another device or place, the product entrypoint should be the
  real `musu.pro` website
- web-originated commands are control-plane envelopes only: work order,
  acceptance, status, route offers, audit records, and relay requests; local
  MUSU programs still perform the actual work

Project rooms are the intended web UX for multiple local MUSU agents working on
the same project. A room should hold user work orders, agent presence,
discussion threads, decisions, task handoffs, transcripts, audit history, and
route/session status. Company/project rooms can act like shared meeting rooms
for local agents assigned to the same project, but execution remains bound to a
specific local node. When an AI accepts work in the room, the matching local MUSU
program performs the work on its own machine or coordinates with peers over the
P2P mesh.

The preferred connection flow is web-assisted bootstrap followed by P2P work:
`musu.pro` helps peers discover each other, exchange signed route offers, and
fall back to relay leases when direct routes fail. After a viable peer path is
established, the local programs should talk through the P2P mesh while
`musu.pro` remains the room/audit/rendezvous plane.

The rendezvous contract now returns this fixed path order so clients do not
invent conflicting priorities:

```json
["lan", "tailscale", "direct_quic", "relay"]
```

Release meaning:

- the web can make connection and coordination easier, but it is not proof of a
  working local runtime
- real P2P/multi-device evidence requires the same current MUSU build installed
  and running on the other Windows PC
- until that second PC is available, the only evidence that can be advanced
  locally is one-machine packaged smoke, process ownership, idle CPU, and the
  runtime CPU scenario matrix
- because recent source commits changed the local dashboard gate and rendezvous
  contract, fresh one-machine evidence must be recaptured on the current build
  before second-PC evidence is treated as the remaining runtime blocker

## 2026-06-04 Current One-Machine Evidence and Handoff Refresh

Fresh one-machine evidence is restored on `HUGH_SECOND` after relay payload
proof hardening and runtime CPU route-probe retry hardening.

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-062335-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-060949-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-061059-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The current runtime matrix includes retry/backoff evidence for the post-route
probe so a transient hosted route rate limit is recorded as attempts instead of
silently losing the scenario context.

The second-PC kit and operator artifacts were regenerated from current source:

- kit:
  `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260604-063002.zip`
- final operator gate packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-063025.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-063024.zip`

Both final packet verification and operator action pack verification pass with
`ok=true` and `fail_count=0`.

Roadmap status:

- current local runtime/package evidence is one-machine ready on `HUGH_SECOND`
- public release remains No-Go because runtime CPU and matrix gates are still
  `1/2`; the same build must run on a real second Windows PC
- `musu.pro` should be treated as the web coordination plane, not as the local
  runtime host
- live P2P remains blocked until production KV/Upstash, owner-scoped relay lease
  evidence, relay payload delivery proof, and release-grade route evidence pass

## 2026-06-04 Runtime CPU Attribution Gate

The idle CPU gate now requires explicit PID/role attribution in
`musu.runtime_idle_cpu_evidence.v1`.

`scripts\windows\measure-musu-idle-cpu.ps1` writes
`cpu_attribution.schema=musu.runtime_idle_cpu_attribution.v1` with:

- sample counts by role: `musu`, `node`, `webview2`, `other`
- total CPU seconds by role
- max one-core CPU percent by role
- top CPU process rows with PID, role, parent PID, ownership classification,
  command-line hash, and redacted command-line hint
- required-role checks for MUSU runtime and owned WebView2 in `desktop-open`
  evidence

`scripts\windows\write-release-go-no-go.ps1` now rejects runtime idle CPU
evidence that omits this attribution summary or its top-process fields. This
makes the operator-reported 20% CPU symptom auditable by process role instead
of only by aggregate pass/fail.

Fresh primary attribution evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-064426-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`, `git_dirty=false`, sample `60.06s`
- observed roles: `musu`, `node`, `webview2`
- max one-core CPU by role: MUSU `0.16`, repo-related Node `0.57`, WebView2
  `0.05`
- owned process profile: MUSU `2`, repo-related Node `1`, owned WebView2 `6`,
  total working set `523.65MB`, hot processes `0`

Roadmap status: primary one-machine idle CPU remains within budget with
process-level attribution. The public release gate still requires the same
attribution-backed `desktop-open` CPU evidence from a real second Windows PC.

## 2026-06-04 Post-Attribution Handoff Refresh

After adding the CPU attribution requirement, the current one-machine smoke and
handoff artifacts were refreshed again from clean git commit
`4fe71b93d5b7854b6a1b750bd64454a92dbddfda`.

Fresh single-machine evidence:

- `docs\evidence\single-machine\1.15.0-rc.1\20260604-064815-HUGH_SECOND.evidence.json`
- verified `true`
- dashboard task id `9a8302da-8e79-4747-a2f3-17cea580da1a`
- bridge URL `http://127.0.0.1:10503`
- CLI route checked `true`

Verifier status:

- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `22/22` cases,
  `failed_case_count=0`
- `write-release-go-no-go.ps1 -SkipPublicMetadata -Json`:
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `msix_install_verified=true`, `multi_device_verified=false`,
  `runtime_idle_cpu_verified=false`, `runtime_cpu_scenario_matrix_verified=false`,
  `manifest_git.dirty=false`

The remaining runtime false values are expected on one machine because the
release gate requires second-PC evidence for both desktop-open idle CPU and the
runtime CPU scenario matrix.

Regenerated handoff artifacts:

- multi-device kit:
  `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260604-065234.zip`
- final operator gate packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-065325.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-065348.zip`

`verify-final-operator-gate-packet.ps1` and `verify-operator-action-pack.ps1`
both report `ok=true` and `fail_count=0`. The nested second-PC kit contains the
updated `measure-musu-idle-cpu.ps1` with `cpu_attribution`,
`musu.runtime_idle_cpu_attribution.v1`, and `top_processes`.

Live `musu.pro` P2P environment recheck at `2026-06-04T06:54:28+09:00` remains
blocked by:

- missing `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL`
- missing `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN`
- `p2p_relay_lease_kv_not_configured`
- relay payload transport not wired
- relay route evidence not proven

Next release work:

1. Install the current MUSU build on a real second Windows PC and run the
   regenerated second-PC transfer kit.
2. Import second-PC install, idle CPU, runtime matrix, and multi-device route
   evidence into this repo.
3. Provision production KV/Upstash for `musu.pro`, deploy, and recapture
   owner-scoped P2P control-plane evidence.
4. Implement and prove relay payload transport before claiming release-grade
   `route_kind=relay`.

## 2026-06-04 Runtime Matrix CPU Attribution Gate

The five-state runtime CPU scenario matrix now preserves and verifies the same
PID/role attribution shape as the primary idle CPU evidence.

Root cause fixed: `measure-musu-idle-cpu.ps1` already emitted
`cpu_attribution`, but `measure-musu-runtime-cpu-scenarios.ps1` summarized each
scenario without carrying that field forward. The matrix could prove aggregate
role CPU and process counts, but it could not show the top PID rows for
`startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
`post-route`.

Current gate behavior:

- each scenario measurement includes `cpu_sample_count`
- each scenario measurement includes `cpu_attribution`
- `verify-runtime-cpu-scenario-matrix.ps1` rejects missing
  `musu.runtime_idle_cpu_attribution.v1`
- the verifier checks role sample counts, CPU totals by role, max CPU by role,
  MUSU role presence, desktop-open WebView2 role presence, `top_processes`, and
  top-process PID/role/CPU fields
- `test-release-evidence-verifiers.ps1` now includes
  `runtime matrix rejects missing CPU attribution`

Fresh primary matrix evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-070330-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-070330-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-070330-HUGH_SECOND.summary.md`
- `ok=true`, `fail_count=0`, `git_dirty=false`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_070330`
- max one-core CPU by scenario:
  - `startup-open`: MUSU `0.05`, Node `0.75`, WebView2 `0.05`
  - `runtime-started`: MUSU `0.05`, Node `0.70`, WebView2 `0.03`
  - `dashboard-open`: MUSU `0.18`, Node `0.78`, WebView2 `0.05`
  - `desktop-open`: MUSU `0.13`, Node `1.01`, WebView2 `0.10`
  - `post-route`: MUSU `0.13`, Node `1.07`, WebView2 `0.18`

Roadmap status: primary one-machine matrix evidence is again current and now
has PID/role attribution for every required scenario. Public release still
requires the same current matrix evidence from a real second Windows PC.

## 2026-06-04 Matrix Attribution Handoff Refresh

After the runtime matrix attribution gate and evidence refresh, the operator
handoff artifacts were regenerated from clean git commit
`4f89db8ecc4b42295eb2872bcc702e760f5c4682`.

- multi-device kit:
  `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260604-071712.zip`
- final operator gate packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-071728.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-071749.zip`

`verify-final-operator-gate-packet.ps1` and `verify-operator-action-pack.ps1`
both reported `ok=true` and `fail_count=0`. The nested second-PC kit README now
states that runtime matrix scenario measurements must preserve
`cpu_attribution`, `musu.runtime_idle_cpu_attribution.v1`, and `top_processes`.

## 2026-06-04 Relay Payload Delivery Proof DTO Alignment

The hosted route-evidence API already accepts
`relay_payload_delivery_proof` when a relay fallback claims
`payload_transport_proven=true`. The Rust route-evidence submission DTO did not
carry that field, which would block the runtime from attaching target-side
delivery proof once a real relay payload drain succeeds.

Source contract update:

- `musu-rs/src/cloud/mod.rs` now defines
  `RouteRelayPayloadDeliveryProof`
- `musu-rs/src/cloud/mod.rs::RouteEvidence` now serializes optional
  `relay_payload_delivery_proof`
- `musu-rs/src/bridge/route_evidence.rs` now preserves optional
  `RouteRelayPayloadDeliveryProof` in local route evidence and maps it into the
  cloud DTO used by `submit_route_evidence`
- existing CLI/bridge route evidence generation keeps
  `relay_payload_delivery_proof=None` until real target-side relay delivery is
  available

Validation:

- `cargo fmt --manifest-path musu-rs\Cargo.toml`
- `git diff --check`
- `cargo test --manifest-path musu-rs\Cargo.toml --lib -j 1 route_evidence`
  passed 12/12 focused tests
- an earlier full `cargo test ... route_evidence` attempt failed before test
  execution because the running `target\debug\musu.exe` was locked by Windows
  (`os error 5`), not because of a compile or assertion failure

Roadmap status: this does not make relay transport release-grade and does not
close the live `musu.pro` P2P gate. It removes a Rust/API contract mismatch so
future relay fallback evidence can include stored payload delivery proof
alongside the relay transport proof.

## 2026-06-04 Relay Payload Drain Delivery Proof

The target-side relay payload drain now exposes the delivery proof needed by the
route-evidence contract:

- `RelayPayloadDrainItem` includes optional `delivery_proof`
- delivered payload metadata is converted into
  `musu.relay_payload_delivery_proof.v1`
- a drain item is only counted as delivered when the delivery response includes
  a delivered payload record with `delivered_at`
- missing delivery proof is reported as
  `relay_payload_delivery_proof_missing` instead of silently counting as
  evidence-grade delivery

Validation:

- `cargo fmt --manifest-path musu-rs\Cargo.toml`
- `git diff --check`
- `cargo test --manifest-path musu-rs\Cargo.toml --lib -j 1 relay_payload`
  passed 23/23 focused tests
- `cargo test --manifest-path musu-rs\Cargo.toml --lib -j 1 route_evidence`
  passed 12/12 focused tests

Roadmap status: request-driven target drains can now return the exact
payload-delivery proof shape that hosted route evidence expects. Public P2P
release remains blocked until the production relay payload/transport path is
actually proven with release-grade QUIC/TLS relay transport and stored
owner-scoped evidence.

## 2026-06-04 Relay Payload Delivery Proof Release Gate

The P2P control-plane verifier now rejects a hosted relay route-evidence query
that claims `relay_transport_proven=true` without a per-record
`relay_payload_delivery_proof`.

Gate update:

- `verify-p2p-control-plane-evidence.ps1` requires returned relay success
  records to include `musu.relay_payload_delivery_proof.v1`
- the proof must include payload id, session id, lease id, source/target node
  ids, tunnel id, payload hash, positive payload byte count, and a parseable
  `delivered_at`
- source/target node ids must match the route evidence record when present
- session id and relay fallback lease id must match the proof when present
- `write-release-go-no-go.ps1` now surfaces
  `p2p_relay_payload_delivery_proof_valid_count`
- `record-p2p-control-plane-evidence.ps1` includes the verifier's valid proof
  count in the operator summary/result

Validation:

- PowerShell parser checks passed for the touched release scripts
- `git diff --check`
- `test-release-evidence-verifiers.ps1 -Json` passed 24/24 regression cases,
  including the new negative case:
  `p2p rejects relay route evidence without payload delivery proof`

Roadmap status: this makes the release gate match the new Rust delivery-proof
contract. It still does not prove live `musu.pro` relay transport; production
P2P remains No-Go until owner-scoped relay transport and route evidence produce
at least one valid payload delivery proof.

## 2026-06-04 Primary Evidence Refresh After Relay Proof Gate

Primary-machine release evidence was refreshed after the relay payload delivery
proof gate changes:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-081248-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-081313-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-081601-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Observed CPU/resource result:

- desktop-open idle CPU passed for `60.064s`: MUSU `0.29`, repo Node `0.73`,
  owned WebView2 `0.08`, working set `542.72MB`, hot process count `0`
- runtime matrix passed all five scenarios:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`
- post-route probe succeeded with token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_081601`
- matrix per-role peaks stayed under one-core `5%`: startup-open
  MUSU `0.23` / Node `0.78` / WebView2 `0`; runtime-started
  MUSU `0.21` / Node `0.65` / WebView2 `0.03`; dashboard-open
  MUSU `0` / Node `0.03` / WebView2 `0.10`; desktop-open
  MUSU `0` / Node `0.03` / WebView2 `0.05`; post-route
  MUSU `0` / Node `0` / WebView2 `0.05`

Clean go/no-go on commit `34fa1cf46fe15c698515570483ce5e7065526e8e`
reported `single_machine_verified=true`, runtime idle CPU valid machines
`1/2` (`HUGH_SECOND`), runtime CPU scenario matrix valid machines `1/2`
(`HUGH_SECOND`), and public release still No-Go on second-PC runtime evidence,
multi-device route evidence, hosted `musu.pro` P2P control-plane proof,
support mailbox, Store public metadata, and Store release evidence.

## 2026-06-04 Live P2P Control-Plane Recheck After Primary Evidence Refresh

Fresh live `musu.pro` P2P evidence was recorded:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-082740-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-082740-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-082740-musu.pro.summary.md`

Result:

- verifier `ok=false`, `fail_count=27`
- GitHub secret-name status has `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- GitHub secret/variable names still lack
  `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
  `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`
- live relay lease query still fails with `p2p_relay_lease_kv_not_configured`
- relay status/leases report transport not wired
- relay route evidence count is `0`
- `relay_payload_transport_proven=false`
- `relay_payload_delivery_proof_valid_count=0`

`show-musu-pro-p2p-env-status.ps1` now mirrors the stricter release gate by
surfacing `relay_payload_delivery_proof_valid_count`,
`relay_payload_delivery_proof_required_count`, and
`relay_payload_delivery_proof_invalid_count` in its evidence summary. It also
adds `live_evidence_relay_payload_delivery_proof_missing` plus next steps that
require per-record `relay_payload_delivery_proof` before the hosted P2P gate can
pass.

Roadmap status: production P2P remains No-Go. The next external action is still
KV/Upstash provisioning and deployment; after that, release requires actual
owner-scoped relay route evidence with payload transport proof and at least one
valid payload delivery proof.

## 2026-06-04 External Recheck Relay Proof Output

The operator-facing external gate recheck and final handoff status now mirror
the stricter hosted P2P proof gate.

Output changes:

- `record-p2p-control-plane-evidence.ps1` now returns
  `relay_route_evidence_count`
- `record-external-release-gate-recheck.ps1` now promotes
  `p2p_relay_route_evidence_count`,
  `p2p_relay_payload_transport_proven`, and
  `p2p_relay_payload_delivery_proof_valid_count` to top-level JSON and summary
  output
- external recheck now adds explicit blockers for
  `p2p_relay_payload_transport_not_proven` and
  `p2p_relay_payload_delivery_proof_missing`
- `show-final-release-handoff-status.ps1` now includes owner scope, route
  evidence count, payload transport proof, and delivery proof count in its
  `gates` snapshot

Roadmap status: this aligns the operator checklist with the local-first web
coordination model. MUSU programs still do the work locally; `musu.pro` is the
login/rendezvous/fallback coordination and proof surface. Public release remains
No-Go until real second-PC evidence and live hosted relay delivery proof exist.

Clean evidence after commit `1e1fc43cf0da04c4b71621e1b8329496d2c6b810`:

- external gate recheck:
  `docs\evidence\external-gates\1.15.0-rc.1\20260604-084033-HUGH_SECOND.external-gates.evidence.json`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-084136-musu.pro.evidence.json`
- result: `local_artifacts_ready=true`, `single_machine_verified=true`,
  runtime idle CPU `1/2`, runtime CPU matrix `1/2`,
  `second_pc_reachable=false`, `p2p_env_ok=false`, `p2p_evidence_ok=false`,
  route evidence count `0`, payload transport proof `false`, delivery proof
  valid count `0`

## 2026-06-04 Relay Payload Drain Route Evidence

Target-side relay payload drain now carries delivery proof into route evidence.

Runtime change:

- `record_relay_payload_delivery_route_evidence(...)` builds explicit
  `route_kind=relay` records instead of deriving route kind from an endpoint
  address
- relay delivery route evidence records `payload_transited_musu_infra=true`
  and attaches `relay_payload_delivery_proof`
- after a target drain accepts a relay payload locally and confirms delivery,
  it writes local route evidence and attempts bounded submit to `musu.pro`
- drain item output now includes route-evidence recorded/submitted state and
  failure class

Roadmap status: this closes the runtime proof-chain gap between target-side
payload delivery and hosted route evidence. It remains non-release-grade until
real QUIC/TLS relay transport proof and production proof stores are configured.

## 2026-06-04 Web Input / Local Executor and CLI Wait Hardening

The product roadmap is now locked to a local-executor model:

- `musu.pro` is the web input, project room, rendezvous, fallback coordination,
  and evidence plane
- local MUSU programs do the actual work on each machine
- web-originated commands are envelopes for work orders, acceptance, status,
  route offers, audit records, and relay requests
- `localhost` dashboards are local operator/dev surfaces; remote ordering
  should enter through the real `https://musu.pro` website
- after web-assisted rendezvous, the preferred data path is direct P2P mesh;
  relay remains fallback and must be proof-backed

This pass also closes a CLI busy-loop candidate: `musu route --wait` now has
`--wait-timeout-sec`, defaults to `300s`, caps at `3600s`, timeout-bounds each
status request, sleeps between polls, and records `remote_task_wait_timeout`
instead of waiting forever.

The Rust background-loop contract audit now release-gates the CLI bridge
readiness and route wait contracts explicitly. Validation passed:

- `cargo fmt --check`
- `cargo test --lib route_wait_timeout_is_bounded`
- Rust background-loop audit `ok=true`, `fail_count=0`
- `git diff --check`

Dirty-tree go/no-go after this source change reports
`ready_for_public_desktop_release=false`, `local_artifacts_ready=true`,
`single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, `manifest_git.dirty=true`, and blocker count `7`.

Release meaning: this is roadmap and busy-loop hardening, not multi-device
completion. A real second Windows PC still needs the current MUSU build
installed before P2P mesh proof and two-machine CPU evidence can close.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CLI_ROUTE_WAIT_WEB_INPUT_ROADMAP_2026_06_04.md`

## 2026-06-04 Chat SSE Retry Cap and Local-Executor Clarification

The local-executor roadmap remains unchanged but is now more explicit:

- `musu.pro` is the remote input, project-room, rendezvous, path-selection,
  relay-fallback coordination, and evidence plane
- local MUSU programs own execution, local files, app/browser/shell automation,
  bridge/runtime work, and P2P mesh traffic
- `localhost` dashboards are not cloud access; they are local operator/dev
  surfaces that only work while the local runtime/dashboard is running
- MUSU nodes may use `musu.pro` to find each other and negotiate routes, then
  prefer direct P2P mesh traffic after pairing
- a company/project-room surface can coordinate multiple AI workers, but the
  execution and sensitive local actions remain on each user's machine
- current validation is still one-machine until the current MUSU build is
  installed on a second Windows PC

Busy-loop hardening update: the chat task SSE stream now has a retry-count cap.
Before this pass, it had capped delay and stale reconnect cleanup but no maximum
attempt count. `useChat` now has `SSE_MAX_RETRIES=5`, `reconnectAttempts`, and
`resetReconnectState()`, and failed streams stop after the cap.

Validation passed:

- `npm run test:runtime-polling` `14/14`
- frontend polling audit `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Clean go/no-go on `e92e0e558d2336237b7eca70d59c8ce35f764229` reports
`local_artifacts_ready=true`, `msix_install_verified=true`,
`single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU matrix
`0/2`, `manifest_git.dirty=false`, and blocker count `7`.

Release meaning: this closes another frontend idle-loop candidate but changes
runtime frontend source. Fresh MSIX/smoke/CPU/matrix evidence is required
before current source can reclaim one-machine release gates. Public release
remains No-Go on second-PC runtime/multi-device evidence, live owner-scoped
`musu.pro` relay proof, support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CHAT_SSE_RETRY_CAP_HARDENING_2026_06_04.md`

## 2026-06-04 Post Chat SSE Primary Evidence and Handoff Refresh

Primary evidence was refreshed after the chat SSE retry-cap source change:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-121733-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-122357-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-124137-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-123317-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Clean go/no-go on `d2c29ef95c07e0a1d299289abe3f95358f4424dd` reports
`local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle CPU
`1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
`manifest_git.dirty=false`, and blocker count `6`.

Current handoff artifacts:

- `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-124445.zip`
- `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-124456.zip`
- `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-124456\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-124456.zip`

Release meaning: the one-machine runtime evidence is restored after the
frontend busy-loop hardening. Public release remains blocked by second-PC
runtime/multi-device evidence, live owner-scoped `musu.pro` relay proof,
support mailbox evidence, and Store evidence.

Canonical reports:

- `docs\RELEASE_1_15_0_RC1_POST_CHAT_SSE_RETRY_CAP_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`
- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_AFTER_CHAT_SSE_EVIDENCE_2026_06_04.md`

## 2026-06-04 Single-Machine Dashboard URL Discovery

The local-executor/web-input split now has release-smoke enforcement for the
local dashboard URL:

- `localhost` dashboards remain local operator/dev surfaces
- `musu.pro` remains the real web input/project-room/rendezvous/fallback/evidence
  surface
- the single-machine smoke discovers the packaged dashboard URL from runtime
  `dashboard.reachable_url` instead of assuming dev port `3000`
- single-machine evidence now records `dashboard_base_url_source` and
  `dashboard_reachable_url`
- the evidence verifier requires runtime URL discovery and rejects
  `http://127.0.0.1:3000` as the release default

Current evidence:

- `docs\evidence\single-machine\1.15.0-rc.1\20260604-130301-HUGH_SECOND.evidence.json`
- dashboard `http://127.0.0.1:3001`
- dashboard source `musu up.dashboard.reachable_url`

Clean go/no-go on `918f81d4` reports `single_machine_verified=true`, runtime
idle CPU `1/2`, runtime CPU matrix `1/2`, `manifest_git.dirty=false`, and six
remaining blockers. Public release remains No-Go on second-PC runtime/multi-
device evidence, live owner-scoped `musu.pro` relay proof, support mailbox
evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SINGLE_MACHINE_DASHBOARD_URL_DISCOVERY_2026_06_04.md`

## 2026-06-04 Multi-Device Route Explain Evidence

The second-PC route smoke now records path-selection diagnostics before
executing a route:

- `smoke-multidevice-beta.ps1` records `musu.route_explain.v1`
- the multi-device verifier separates route explain from the executing route
  command
- passing multi-device evidence must include selected candidate diagnostics,
  delegate endpoint, path priority `lan,tailscale,direct_quic,relay`,
  release transport requirement `quic_tls_1_3`, and fallback-only relay policy
- the second-PC kit README now describes both `musu.route_explain.v1` and
  `musu.route_evidence.v1`

The current local diagnostic still shows the configured `HUGH-MAIN` route as
LAN over `http_bearer` with `peer_identity_verified=false` and
`encryption=none_http_bearer`; that remains useful for debugging but is not
release-grade evidence.

Current handoff artifacts after this update:

- `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-132819.zip`
- `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-132834.zip`
- `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-132834\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-132834.zip`

Clean go/no-go on `4ed47213` remains No-Go with `single_machine_verified=true`,
runtime idle CPU `1/2`, runtime CPU matrix `1/2`, `manifest_git.dirty=false`,
and six remaining blockers.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MULTIDEVICE_ROUTE_EXPLAIN_EVIDENCE_2026_06_04.md`

## 2026-06-04 MUSU.PRO Control Plane Roadmap and Control SSE Audit

The product roadmap is now explicitly locked to the local-executor model:

- `localhost` and `127.0.0.1` dashboards are local-only operator/developer
  surfaces, not cloud dashboard access
- `musu.pro` is the real web input, project room, company meeting room,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane
- local MUSU programs receive authenticated work orders from `musu.pro`, then
  do the actual work on each device
- local programs own file access, shell/app/browser automation, local bridge
  execution, and P2P mesh traffic
- `musu.pro` can coordinate discovery and relay fallback, but it must not become
  the default data path or execution server
- project rooms can let AI workers attached to the same project coordinate
  decisions, handoffs, and meeting notes while the local machines execute work

This matches the Codex/GitHub-style product shape: cloud identity, repository
or project context, work orders, presence, and coordination; local execution and
machine-to-machine transport.

Release implication: current validation is still one-machine for local runtime,
dashboard URL discovery, idle CPU, route explain diagnostics, and control-plane
contract checks. Multi-device proof requires installing and running the same
current MUSU build on a second Windows PC.

Background-loop hardening update: the Rust background-loop contract audit now
explicitly covers `musu-rs\src\control\http_server.rs` by checking the control
SSE heartbeat interval, heartbeat event, and interval-stream mapping. This is a
gate/audit change only; Rust runtime source was not modified, so current
packaged one-machine evidence does not need a fresh MSIX rebuild for this
change.

Release freshness follow-up: single-machine, runtime CPU matrix, and go/no-go
freshness classifiers now treat `musu-bee/docs/*` as documentation/status-only,
matching root `docs/*`. App-level product docs should not invalidate packaged
runtime evidence.

Validation passed:

- PowerShell parser check for `audit-rust-background-loop-contract.ps1`
- Rust background-loop audit `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MUSU_PRO_CONTROL_PLANE_ROADMAP_AND_CONTROL_SSE_AUDIT_2026_06_04.md`

## 2026-06-04 CEO Dispatch SSE Cleanup Hardening

The CEO dispatch chat stream now has explicit active `EventSource` lifecycle
cleanup:

- `CeoChatClient` stores active run streams in `runStreamsRef`
- starting a stream closes any previous stream for the same run id
- terminal messages close and unregister the stream
- SSE errors close and unregister the stream and mark still-streaming runs as
  errored
- component unmount closes all active run streams and clears the map

The frontend polling contract audit now checks shared bounded EventSource
retry/visibility cadence and CEO dispatch stream tracking, registration,
unregistration, unmount cleanup, error cleanup, and no direct interval polling.
The runtime polling test suite now includes
`CEO dispatch run streams are explicitly closed`.

Validation passed:

- `npm run test:runtime-polling` `15/15`
- frontend polling audit `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- `npm run typecheck`
- `npm run build`

Release meaning: this closes another frontend SSE/background-loop cleanup
candidate. Because frontend runtime source changed, current packaged
single-machine smoke, idle CPU, and runtime CPU matrix evidence must be
refreshed after commit before this HEAD can reclaim current-source release
gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CEO_DISPATCH_SSE_CLEANUP_HARDENING_2026_06_04.md`

## 2026-06-04 Post CEO Dispatch SSE Primary Evidence Refresh

Fresh primary-machine evidence was restored after the CEO dispatch SSE cleanup
hardening:

- strict MSIX install evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-140415-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-140717-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-141753-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-141924-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The desktop-open CPU evidence was captured from clean commit `f96e5cca` with
`git_dirty=false`, MUSU `0`, Node `0.03`, WebView2 `0.16`, hot `0`, owned
WebView2 `6`, and working set `485.51MB`. The five-state matrix passed
verifier `ok=true`, `fail_count=0`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260604_141924`, all scenarios `git_dirty=false`,
all scenarios hot `0`, and max CPU MUSU `0`, Node `0.05`, WebView2 `0.23`.

Clean go/no-go after refresh reports `local_artifacts_ready=true`,
`single_machine_verified=true`, `msix_install_verified=true`, runtime idle CPU
valid machines `1`, runtime CPU matrix valid machines `1`,
`manifest_git.dirty=false`, and six remaining blockers: second-PC
multi-device, second-PC CPU/matrix, hosted `musu.pro` P2P relay proof, support
mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_CEO_DISPATCH_SSE_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 Current Operator Handoff Pack After CEO Dispatch Evidence

The current final operator packet and action pack were regenerated after the
fresh primary-machine evidence refresh:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-143204.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-143217.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-143217\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-143217.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-143217\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-143217.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-143204`

Final packet and action pack verification both passed with `ok=true`,
`fail_count=0`. Final handoff status reports `packet_verified=true`,
`action_pack_verified=true`, `single_machine_verified=true`, runtime idle CPU
valid machines `1`, runtime CPU matrix valid machines `1`, P2P relay route
evidence count `0`, relay payload proof `false`, delivery proof valid count
`0`, and blocker count `6`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_AFTER_CEO_DISPATCH_EVIDENCE_2026_06_04.md`

## 2026-06-04 MUSU.PRO Work-Order Context Hardening

The web-input/local-executor roadmap is now represented in the task forwarding
contract, not just in docs.

`/api/tasks/forward` accepts bounded `company_id`, `project_id`, `room_id`,
`work_order_id`, and `origin` metadata and forwards it to the local bridge. For
`musu.pro` hosts, omitted `origin` defaults to `musu.pro`; local dashboard calls
default to `local_dashboard`.

The Rust bridge accepts the same fields in `/api/tasks/delegate`, records only
bounded identifiers in audit notes, and keeps prompt/cwd content out of the
audit note. `ForwardedTask` carries the context through direct peer forwarding
and relay payload preview serialization. MCP `delegate_task` now exposes the
same fields, so web/API/MCP delegation share the same work-order vocabulary.

Validation passed:

- `npm run test:routes` `14/14`
- `npx tsx --test src/app/api/tasks/forward/route.test.ts` `2/2`
- `npm run typecheck`
- `cargo fmt`
- `cargo check --bin musu`
- targeted Rust audit/context/relay payload tests `3/3`

Release impact: source changed, so current packaged primary evidence is stale
until the MSIX/single-machine/CPU evidence is refreshed for this HEAD. This
does not implement release-grade relay transport; it hardens the web work-order
to local execution boundary.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MUSU_PRO_WORK_ORDER_CONTEXT_HARDENING_2026_06_04.md`
