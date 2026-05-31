# MUSU Runtime Stabilization Execution Plan

**Wiki ID**: wiki/525
**Date**: 2026-05-31
**Status**: Active P0 execution plan for the three operator-reported blockers.

## Why This Exists

The current product is not blocked only by Microsoft Store evidence. Four
runtime-product issues must be treated as release blockers before public desktop
launch:

1. idle busy-loop / unexpected CPU while MUSU is open
2. missing `musu.pro` assisted P2P rendezvous and relay-control path
3. insufficient desktop hardening for long-running user machines
4. Store/MSIX packaging currently activating the runtime CLI instead of the Tauri desktop shell

This plan defines how the work will be executed and how each item becomes
evidence-backed instead of opinion-backed.

## Track A - Idle Busy-Loop and CPU Budget

Goal: identify the exact hot process and remove unbounded background work.

Execution order:

1. Capture 60s samples with `measure-musu-idle-cpu.ps1` in four scenarios:
   fresh boot, desktop opened, runtime started, and after a second-PC route
   attempt.
2. Keep MUSU, Node.js, and WebView2 separated in the evidence so a hot desktop
   shell, bridge, dev server, or helper process cannot hide behind aggregate CPU.
3. Treat a sample as invalid if no MUSU runtime process is running.
4. Fix loops in this order: frontend polling, clipboard/mDNS watchers,
   health-check retries, bridge readiness waits, cloud heartbeat, telemetry/log
   flushes.
5. Public-release acceptance stays: two Windows machines, 60s each, no MUSU /
   Node.js / WebView2 process above 5% of one logical CPU while idle.

Already applied:

- clipboard polling defaults off unless `MUSU_ENABLE_CLIPBOARD_SYNC=1`
- mDNS defaults off unless `MUSU_ENABLE_MDNS=1`
- cloud heartbeat defaults to 300s with 60s floor, backoff, and jitter
- major dashboard polling loops were slowed and paused while hidden
- CPU evidence now separates MUSU, Node.js, and WebView2 process roles
- CPU evidence now uses native Windows parent-process lookup instead of WMI so
  WebView2/Node helpers can be attributed to MUSU without hanging the sampler
- the release go/no-go check now rejects runtime CPU evidence that omits
  Node.js/WebView2 budget flags or cannot prove helper process ownership in the
  default owned-helper scope
- the release go/no-go check now requires runtime CPU evidence to record the
  `desktop-open` scenario, `-RequireOwnedWebView2`, clean git state, owned
  process count budget, owned WebView2 count budget, total working set, private
  memory total, and memory totals by role
- dashboard/frontend polling now has a shared `useLowDutyPolling` helper that
  prevents overlapping requests, aborts in-flight fetches on unmount, pauses
  low-priority polling while hidden, and backs off failures; device discovery,
  service health, processes, nodes, doctor status, fleet pages, company/machine
  pages, tasks/approvals/goals/projects/issues/costs panels, inbox polling, and
  canvas data/flow polling use it or the same recursive timeout pattern
- fleet/company/machine pages now use 30s safety-net polling and existing SSE
  wakeups instead of 5s fixed intervals
- `musu-rs/src/writer/runner.rs` task admission now waits on `Notify` instead
  of waking capped pending tasks every 50ms, with a 1s safety recheck for
  missed notifications
- `scripts\windows\audit-musu-process-ownership.ps1` now records
  `musu.process_ownership_audit.v1` evidence and distinguishes MUSU-owned
  Node/WebView2 helpers from unrelated machine-wide processes
- release go/no-go now reports `process_ownership_verified` and blocks if the
  process ownership audit is missing or failing
- current local process ownership audit on `HUGH_SECOND` passed with
  `musu_runtime=1`, `owned_node=0`, `owned_webview2=0`,
  `orphan_repo_helpers=0`, bridge registry PID alive, and bridge `/health`
  HTTP 200, despite 13 unrelated machine-wide WebView2 processes
- `scripts\windows\audit-musu-startup-single-instance.ps1` now records
  `musu.startup_single_instance_audit.v1`, calls `musu up --json` repeatedly,
  verifies one stable bridge PID, and embeds the process ownership audit
- release go/no-go now reports `startup_single_instance_verified` and blocks if
  repeated startup evidence is missing or failing
- current local startup audit on `HUGH_SECOND` passed with three repeated calls
  reusing bridge PID 31208, `after_musu_runtime=1`, `repeated_spawn_count=0`,
  and nested process ownership passing
- primary bridge-only 60s diagnostic sample passed at
  `docs\evidence\runtime-idle-cpu-diagnostic\1.15.0-rc.1\20260531-211448-HUGH_SECOND.bridge-only.evidence.json`:
  `max_one_core_percent_by_role.musu=0.03`, `total_working_set_mb_after=27.7`,
  `owned_node=0`, and `owned_webview2=0`. This proves the bridge-only runtime is
  not the current hot loop, but it is not final release evidence.
- desktop-open diagnostic attempt
  `docs\evidence\runtime-idle-cpu-diagnostic\1.15.0-rc.1\20260531-211608-HUGH_SECOND.desktop-open-attempt.evidence.json`
  fails as intended because `-RequireOwnedWebView2` found zero MUSU-owned
  WebView2 processes after MSIX app activation.
- MSIX desktop-entrypoint audit evidence
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-214327-HUGH_SECOND.store-msix-runtime-only.evidence.json`
  identifies the root cause: the current MSIX `<Application Executable>` is
  `musu.exe`, `musu-desktop.exe` is absent from both the artifact and installed
  package, and the package description is still runtime-only.
- `scripts\windows\audit-msix-desktop-entrypoint.ps1` now writes
  `musu.msix_desktop_entrypoint_audit.v1`; release go/no-go reports
  `msix_desktop_entrypoint_verified`, and Store bundle verification rejects
  runtime-only MSIX artifacts.

Next implementation:

- fix packaged desktop activation/ownership by building a real desktop MSIX
  where Start-menu activation launches `musu-desktop.exe`, while `musu.exe`
  remains the CLI alias and `musu-startup.exe` remains the startup task
- after `audit-msix-desktop-entrypoint.ps1 -RequireInstalledPackage -Json`
  passes, run real 60s `desktop-open` samples with `-RequireOwnedWebView2` on
  both PCs
- run a queued-task/backlog CPU sample to prove the new event-driven admission
  path stays quiet when tasks are waiting for global/per-channel slots
- extend startup-repeat coverage from repeated `musu up` to desktop Start
  Runtime clicks and Store StartupTask/manual-launch collisions
- fix the exact hot loop shown by those samples

## Track B - `musu.pro` Assisted P2P

Goal: make `musu.pro` a control plane, not the default payload path.

Execution order:

1. Keep direct local routes first: LAN, user-managed overlay such as Tailscale,
   then direct QUIC where available.
2. Use `musu.pro` for registry, rendezvous, endpoint candidate exchange, route
   approval, and route evidence.
3. Add hosted relay/tunnel fallback only after direct route evidence is stable.
4. Keep hosted relay/tunnel behind Connect/Pro policy because user payloads
   transit MUSU infrastructure.
5. Record route evidence for every multi-device release claim.

Current enforcement change:

- `smoke-multidevice-beta.ps1` now writes `route_evidence`.
- `verify-multidevice-evidence.ps1` now rejects passing route evidence unless it
  includes route kind, candidate address, handshake timing, peer identity
  verification, hardened encryption, payload transit truth, and success result.
- Legacy manual HTTP bearer routing is recorded honestly as unverified, so it
  does not satisfy the final public-release multi-device gate.

Next implementation:

- wire the new Rust cloud DTOs into the bridge path selector
- add `musu route --explain` or equivalent diagnostic output
- implement direct QUIC/TLS identity proof before allowing route evidence to pass
- implement relay session creation after direct route proof is stable

## Track C - Desktop Hardening and Optimization

Goal: make MUSU safe to leave running on a user's Windows desktop.

Execution order:

1. Define expected process ownership: desktop shell, bridge/runtime, WebView2,
   and any intentional Node.js helper.
2. Prevent duplicate runtime startup from repeated `musu up`, desktop start
   clicks, or Store StartupTask plus manual launch.
3. Enforce resource budgets: idle CPU, memory baseline, WebView2 process count,
   file/network watcher count, and cloud heartbeat duty cycle.
4. Harden command execution: allowlist remote command surfaces, verify peer
   identity, require local API auth, and write audit logs for P2P commands.
5. Harden failure handling: bounded retries, reconnect backoff, cancellation,
   degraded-mode visibility, and relay fallback status.

Release gates that must remain false until evidence exists:

- `msix_desktop_entrypoint_verified`
- `runtime_idle_cpu_verified`
- `process_ownership_verified`
- `startup_single_instance_verified`
- `multi_device_verified`
- `support_mailbox_verified`
- `store_release_verified`

The public desktop release decision remains No-Go until all four are true and
the worktree/manifest are clean.

## Practical Answer to "How We Handle the Three"

1. We measure first, then fix the loop shown by the evidence. No more guessing
   whether WebView2, Node.js, bridge, mDNS, or frontend polling is responsible.
2. We promote `musu.pro` from registry-only into a low-duty P2P control plane:
   rendezvous, path selection, relay policy, and route evidence.
3. We make the release tooling fail closed. A demo that happens to work once is
   not accepted unless process ownership, CPU, identity, encryption, and route
   evidence are all present.
