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

## Current Product Split And Test Scope

As of 2026-06-05, keep the architecture split strict:

- `musu.pro` is the web control plane: remote user input, project rooms,
  company-room coordination, room presence, rendezvous, path selection,
  relay-fallback coordination, and release evidence.
- Local MUSU programs on each device are the execution plane: local files,
  processes, browser/app automation, agent runtime, and P2P mesh traffic.
- Web input can create a work order from another location, but the selected
  local MUSU program performs the work locally. After web-assisted rendezvous,
  devices prefer `lan`, `tailscale`, and `direct_quic` before any hosted relay.
- Current validation is still one-machine only. Multi-device work requires
  installing the current build on another Windows PC, then returning route,
  CPU, matrix, and release-grade P2P evidence.

This is why localhost/dashboard failures are not treated as a cloud execution
problem: the dashboard can be a local surface, while `musu.pro` should be the
remote control surface that hands orders to local executors.

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
- IPv6 mDNS defaults off unless `MUSU_MDNS_ENABLE_IPV6=1`; this prevents the
  Windows/Tailscale link-local IPv6 `os error 10065` send loop from becoming a
  hidden CPU/log-noise source when mDNS is explicitly enabled
- Tailscale mDNS interfaces default off unless `MUSU_MDNS_ENABLE_TAILSCALE=1`;
  Tailscale does not need LAN multicast discovery for the Store-candidate path,
  and the operator-supplied `ff02::fb%9` errors came from that adapter class
- common VPN/virtual mDNS interfaces default off unless
  `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`; current validation disabled 9
  virtual/VPN interfaces and sent only on the physical LAN adapter during
  `musu discover --timeout 2`
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
  `musu_runtime=1`, `desktop_shell=1`, `owned_node=0`, `owned_webview2=6`,
  `orphan_repo_helpers=0`, bridge registry PID alive, and bridge `/health`
  HTTP 200, despite 19 unrelated machine-wide WebView2 processes
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
- historical desktop-open diagnostic attempt
  `docs\evidence\runtime-idle-cpu-diagnostic\1.15.0-rc.1\20260531-211608-HUGH_SECOND.desktop-open-attempt.evidence.json`
  fails as intended because `-RequireOwnedWebView2` found zero MUSU-owned
  WebView2 processes after old MSIX app activation. A later dirty diagnostic
  desktop-open sample passed after `musu-desktop` root attribution and fixed
  local-sideload install, but final release evidence must still be captured
  from clean committed state on both PCs.
- MSIX desktop-entrypoint audit evidence
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-214327-HUGH_SECOND.store-msix-runtime-only.evidence.json`
  identifies the root cause: the current MSIX `<Application Executable>` is
  `musu.exe`, `musu-desktop.exe` is absent from both the artifact and installed
  package, and the package description is still runtime-only.
- `scripts\windows\audit-msix-desktop-entrypoint.ps1` now writes
  `musu.msix_desktop_entrypoint_audit.v1`; release go/no-go reports
  `msix_desktop_entrypoint_verified`, and Store bundle verification rejects
  runtime-only MSIX artifacts.
- `scripts\windows\build-msix.ps1` now stages `musu-desktop.exe` as the MSIX
  application executable, keeps `musu.exe` as the CLI alias, keeps
  `musu-startup.exe` as the startup task, and uses a desktop-shell package
  description.
- Artifact-level MSIX desktop-entrypoint evidence now passes at
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-224328-HUGH_SECOND.store-msix-desktop-artifact.evidence.json`.
  The regenerated Store submission bundle
  `.local-build\msix\submission-bundles\store-reviewed-20260531-224352`
  verifies with `ok=true`, `fail_count=0`.
- `audit-msix-desktop-entrypoint.ps1` now separates artifact audits from
  installed-package audits and verifies startup-contract equivalence when
  `-RequireInstalledPackage` is used.
- Fixed `local-sideload-manual` install evidence now passes on `HUGH_SECOND`:
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.local-sideload-installed.evidence.json`
  has `ok=true`, installed application executable `musu-desktop.exe`, runtime
  alias `musu.exe`, startup task `musu-startup.exe`, and
  `startup_contract_matches_artifact=true`.
- Store-reviewed restricted-capability MSIX is no longer treated as ordinary
  sideload evidence. `install-msix.ps1` and `install-and-verify-msix.ps1` refuse
  to sideload it by default because local `Add-AppxPackage` can fail after
  removing the current package. `-AllowRestrictedCapabilitySideload` is required
  for intentional restricted-capability sideload experiments.
- Store-reviewed `-RequireInstalledPackage` audit now correctly fails on a
  local-sideload machine because the Store artifact has
  `Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe` and
  `StartupImmediateRegistration=true`, while the local-sideload installed
  package does not. The mismatch proof is
  `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.store-reviewed-contract-mismatch.evidence.json`.
- `write-release-go-no-go.ps1` now treats `msix_desktop_entrypoint_verified` as
  the conjunction of Store-reviewed artifact proof plus local-sideload installed
  proof. It does not ask local operators to install the restricted-capability
  Store artifact before Microsoft signs/distributes it.
- `scripts\windows\audit-musu-process-ownership.ps1` and
  `measure-musu-idle-cpu.ps1` now include `musu-desktop` as a MUSU root process,
  so WebView2 children of the packaged Tauri shell are attributed correctly.
- Current local process ownership audit with the packaged desktop open passed
  with `musu_runtime=1`, `desktop_shell=1`, `owned_node=0`,
  `owned_webview2=6`, `machine_wide_node=2`, `machine_wide_webview2=19`,
  `orphan_repo_helpers=0`, bridge registry PID alive, and bridge `/health`
  HTTP 200.
- Current clean committed desktop-open evidence passed after the runtime CPU
  gate was hardened to reject stale code commits:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-014656-HUGH_SECOND.desktop-open.evidence.json`.
  It was captured from clean commit `2987f15`, with packaged
  `musu-desktop.exe`, packaged `musu.exe bridge`, owned WebView2 count `6`,
  owned Node count `0`, `max_one_core_percent_by_role.webview2=0.16`,
  `musu=0.13`, and `total_working_set_mb_after=373.38`. This proves the
  primary PC packaged desktop is quiet in the sampled state; the final release
  gate still needs the same evidence on the second PC.
- `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` now records
  `musu.runtime_cpu_scenario_matrix.v1` matrices across `runtime-started`,
  `dashboard-open`, `desktop-open`, and `post-route`. It delegates process
  attribution to `measure-musu-idle-cpu.ps1`, includes Node.js/WebView2 budgets,
  and now has a verifier-backed go/no-go gate so those four states are checked
  on two machines before release.
- The scenario matrix script uses timeout-bounded `Start-Process` temp-file
  command capture for `musu up --json` so a spawned long-lived bridge cannot
  keep a PowerShell pipeline open. A 3s local `runtime-started` smoke passed at
  `.local-build\runtime-cpu-scenarios\20260601-100515-HUGH_SECOND\20260601-100515-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  with one MUSU process, zero owned Node/WebView2 helpers, and max one-core CPU
  `0`; this is not release evidence under the new 60s/two-machine verifier.
- Current primary clean desktop-open release evidence after the scenario matrix
  commit passed at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-101541-HUGH_SECOND.desktop-open.evidence.json`
  with commit `9d39ab2f7a02aca75beaaeb5d35198d850bbad98`,
  `git_dirty=false`, one `musu-desktop`, six owned WebView2 helpers, owned
  Node `0`, max one-core CPU `musu=0` and `webview2=0.13`, working set
  `342.44MB`, and private memory `184.04MB`.
- The second-PC wrapper now returns and verifies the scenario matrix alongside
  the release CPU sample. `import-second-pc-return.ps1` imports
  `musu.runtime_cpu_scenario_matrix.v1` separately and only treats
  `.local-build\runtime-idle-cpu\` `desktop-open` evidence with
  `require_owned_webview2=true` as release CPU evidence, so scenario diagnostics
  cannot satisfy or shadow the release gate.
- `musu up` now has code to terminate a live but unhealthy registered bridge
  PID before restarting the bridge. This addresses the observed "PID alive but
  `/health` dead" class. Runtime verification is still pending because a local
  debug binary build hit rustc/LLVM OOM.
- 2026-06-02 15:00 KST reconnect hardening: dashboard relay WebSocket reconnect
  now uses capped backoff instead of fixed retry delay, and chat task SSE
  reconnect now clears pending timers, suppresses duplicate
  `EventSource.CONNECTING` attempts, and ignores stale timers with a generation
  guard. `npm run test:runtime-polling` is now a CI gate. This reduces an idle
  busy-loop candidate, but fresh MSIX CPU evidence is required because runtime
  web source changed.
- Source-fresh release packaging still needs a stronger build machine or build
  profile adjustment: a `build-msix.ps1` release build attempt on `HUGH_SECOND`
  failed in `musu-rs` rustc OOM/pagefile pressure even with
  `CARGO_BUILD_JOBS=1`, and a later `cargo build --bin musu` debug build also
  hit rustc/LLVM OOM. `cargo check -j 1` passes.

Next implementation:

- produce a source-fresh fixed MSIX on a machine that can complete the release
  build, or reduce the MSIX release build memory profile without weakening the
  runtime contract
- keep local install evidence on the `local-sideload-manual` contract until the
  Microsoft Store-signed restricted-capability package is available
- run the same real clean 60s `desktop-open` sample with
  `-RequireOwnedWebView2` on the second PC using the fixed local-sideload
  package
- run a queued-task/backlog CPU sample to prove the new event-driven admission
  path stays quiet when tasks are waiting for global/per-channel slots
- run the full scenario matrix on both PCs when investigating a reported hot
  state, then promote only clean 60s `desktop-open` samples into release
  evidence
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

- `musu route --route-evidence-path <path>` now writes
  `musu.route_evidence.v1` from the actual CLI route attempt, and
  `smoke-multidevice-beta.ps1` imports that file instead of inventing route
  evidence from script-side inference.
- Bridge runtime forwarding now uses the same shared route evidence contract:
  `/api/tasks/delegate`, `/api/companies/{id}/run`, and workflow remote steps
  write local `~/.musu/route-evidence/<task_id>.route-evidence.json` files with
  candidate address, route kind, handshake timing, total timing, result, and
  failure class.
- `verify-multidevice-evidence.ps1` now rejects passing route evidence unless it
  includes route kind, candidate address, handshake timing, peer identity
  verification, hardened encryption, payload transit truth, and success result.
- Legacy manual HTTP bearer routing is recorded honestly as unverified, so it
  does not satisfy the final public-release multi-device gate.

Next implementation:

- wire the new Rust cloud DTOs into the bridge path selector and rendezvous
  session lifecycle
- submit hardened route evidence through the `musu.pro` control-plane client
  after the local evidence file is written
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
