# Runtime CPU Scenario Matrix and mDNS Log Audit

**Wiki ID**: wiki/529
**Date**: 2026-06-01
**Status**: Active diagnostic addendum for the 1.15.0-rc.1 desktop release line.

## Verdict

Public desktop release is still No-Go. The local single-machine Windows path is
strong enough for operator dogfood, but the release still needs real second-PC
route evidence, second-PC desktop-open CPU evidence, `musu@musu.pro` inbox
delivery evidence, and Microsoft Store evidence.

The operator-supplied log:

- `mdns_sd::service_daemon`
- `Tailscale`
- `[ff02::fb%9]:5353`
- `os error 10065`
- `sending on a closed channel`

matches the already-identified Windows/Tailscale IPv6 multicast failure class.
Current source should not emit this in the default Store-candidate runtime
because mDNS, IPv6 mDNS, Tailscale mDNS, and common VPN/virtual mDNS interfaces
are all opt-in.

If a current installed desktop still emits that log with no explicit opt-in,
treat it as either stale installed bits or an inherited environment override
until proven otherwise.

## Product Spec Updates

Runtime CPU evaluation now has two layers:

1. Release gate evidence remains
   `scripts\windows\measure-musu-idle-cpu.ps1` with scenario `desktop-open`,
   `-RequireOwnedWebView2`, `-IncludeNode`, `-IncludeWebView2`, clean git
   state, and a 60s sample on at least two Windows machines.
2. State attribution now has its own go/no-go gate:
   `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` records the matrix
   and `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` requires a
   clean/current 60s matrix on two machines with `runtime-started`,
   `dashboard-open`, `desktop-open`, `post-route`, and a successful post-route
   probe.

The new matrix evidence schema is `musu.runtime_cpu_scenario_matrix.v1`.
As of 2026-06-02 09:25 KST, the matrix verifier is fail-closed for resource
budget fields as well as CPU fields: each scenario must carry process counts,
working set, private memory, and `resource_budget_violations`, and the verifier
exits nonzero when `ok=false`.

Supported matrix scenarios:

- `startup-open`
- `runtime-started`
- `dashboard-open`
- `desktop-open`
- `post-route`

The base idle sampler accepts the same diagnostic scenario labels in addition
to the existing `bridge-only` and `diagnostic` labels.

The matrix script still does not replace the public release CPU gate. It exists
beside the two-machine 60s `desktop-open` evidence so a future busy-loop report
can be attributed to startup activation, runtime start, dashboard/desktop
opening, or post-route state before release is allowed.

Current verifier behavior rejects a no-op `startup-open` scenario. The scenario
must launch the packaged desktop app and begin sampling within 3s of activation,
so a stale already-open desktop state cannot satisfy the startup busy-loop gate.

Current verifier behavior also rejects a no-op `dashboard-open` scenario. If
`-DashboardUrl` is not supplied, the matrix runner now uses only the
`reachable_url` discovered from `musu up --json`; it no longer falls back to
unverified `dev_url` or `start_url`. If `dashboard-open` is run without a prior
`runtime-started` entry, it performs its own bounded `musu up --json` discovery
first. Operators can still pass an explicit `-DashboardUrl`, but the verifier
requires that the URL was actually launched before sampling. This keeps the
dashboard-open state aligned with the operator's busy-loop report instead of
measuring the same runtime-started state twice.

Second-PC returns now carry both layers:

- `run-second-pc-release-check.ps1` still captures the release-grade
  `.local-build\runtime-idle-cpu\*.desktop-open.evidence.json` sample by
  default.
- The same wrapper now also captures
  `.local-build\runtime-cpu-scenarios\*.runtime-cpu-scenario-matrix.json` unless
  `-SkipRuntimeCpuScenarioMatrix` is used, and it runs the route probe by
  default so `post-route` is a real post-route state.
- `import-second-pc-return.ps1` imports the matrix under
  `.local-build\runtime-cpu-scenarios\` while selecting release CPU evidence
  only from `.local-build\runtime-idle-cpu\`, so diagnostic matrix samples
  cannot accidentally replace the release gate sample.

## Code Audit Notes

The first implementation attempt revealed a real PowerShell harness risk:
capturing `musu up --json` through a pipeline can hang because the long-lived
bridge child can keep stdout handles open. The matrix script now uses
timeout-bounded `Start-Process` with temp-file stdout/stderr capture, matching
the safer pattern used by the release smoke harness.

Additional audit points:

- The script passes PowerShell parser validation.
- The idle sampler still owns release-gate resource checks; the matrix wrapper
  delegates to it rather than duplicating CPU attribution logic.
- `desktop-open` matrix runs require a real packaged desktop session to be
  meaningful; otherwise `-RequireOwnedWebView2` will correctly fail.
- `post-route` matrix runs must include a successful local route probe. This is
  CPU-state proof only; real multi-device release evidence still requires
  transport-verified peer identity, hardened encryption, route result, and
  payload path.
- `post-route` probe success now requires the exact per-run expected token, not
  only any historical `MUSU_CPU_SCENARIO_ROUTE_OK_*` output.
- Manual matrix commands must pass multiple scenarios as a comma-separated
  value, for example
  `-Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route`. A
  space-separated `-Scenario runtime-started dashboard-open ...` invocation was
  observed under `powershell -File` to bind only the first scenario, so operator
  packet/runbook commands now use the comma form and the runner normalizes
  comma-separated input.
- The short local smoke was run from a dirty tree and only sampled 3s, so it is
  not release evidence under the new verifier.

## Current Evidence

Short functional smoke:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario runtime-started -SampleSeconds 3 -CommandTimeoutSec 45 -MusuExe .\musu-rs\target\debug\musu.exe -Json
```

Result:

- schema: `musu.runtime_cpu_scenario_matrix.v1`
- machine: `HUGH_SECOND`
- matrix path:
  `.local-build\runtime-cpu-scenarios\20260601-100515-HUGH_SECOND\20260601-100515-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `runtime-started` measurement: `ok=true`
- sampled MUSU processes: `1`
- sampled owned Node processes: `0`
- sampled owned WebView2 processes: `0`
- max one-core CPU: `musu=0`, `node=0`, `webview2=0`
- working set after sample: `27.72MB`

Dashboard-open harness smoke after gate tightening:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario dashboard-open -SampleSeconds 3 -CommandTimeoutSec 90 -MusuExe .\musu-rs\target\debug\musu.exe -Json
```

Result:

- matrix path:
  `.local-build\runtime-cpu-scenarios\20260601-143309-HUGH_SECOND\20260601-143309-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `dashboard-open` preparation action: `Start-Process DashboardUrl`
- `dashboard-open` discovery action: `musu up --json`
- dashboard URL source: `musu_up_dashboard_open`
- dashboard URL: `http://127.0.0.1:3000/app`
- measurement: `ok=true`, 3.018s sample, MUSU process count `1`,
  owned Node `0`, owned WebView2 `0`, max one-core CPU `0`
- release status: not release evidence because the tree was dirty and the
  sample duration was 3s

Current release-grade primary matrix:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -CommandTimeoutSec 180 -MusuExe .\musu-rs\target\debug\musu.exe -DashboardUrl http://127.0.0.1:3001/app -OpenDesktopApp -RunRouteProbe -FailOnHot -Json
```

Result:

- matrix evidence:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-154503-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- source commit in matrix:
  `68d183e0d285b3578b75e5c243a64855e64683bd`; later evidence/doc commits are
  accepted by the verifier as documentation/evidence-only deltas
- verifier result: `ok=true`, `fail_count=0`
- `runtime-started`: MUSU `2`, repo Node `1`, owned WebView2 `6`; max one-core
  CPU `musu=0`, `node=0`, `webview2=0.05`; working set `521.97MB`
- `dashboard-open`: MUSU `2`, repo Node `1`, owned WebView2 `6`; launched
  `http://127.0.0.1:3001/app`; max one-core CPU `musu=0`, `node=0`,
  `webview2=0.05`; working set `521.29MB`
- `desktop-open`: MUSU `3`, repo Node `1`, owned WebView2 `7`; max one-core CPU
  `musu=0`, `node=0.03`, `webview2=0.05`; working set `620.41MB`
- `post-route`: route probe returned
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_154503`; MUSU `3`, repo Node `1`, owned
  WebView2 `7`; max one-core CPU `musu=0`, `node=0`, `webview2=0.16`; working
  set `619.79MB`
- release status: primary matrix is now valid, but the matrix gate remains
  `1/2` until a second Windows PC returns the same clean/current 4-state matrix

Current primary `desktop-open` runtime-idle CPU evidence was also refreshed
after the matrix evidence commit:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-160102-HUGH_SECOND.desktop-open.evidence.json`
- source commit:
  `34827ff4ecfdfe655e543b2635474308bb1ca53c`
- result: `ok=true`, `git_dirty=false`, 60.047s sample
- process counts: MUSU `2`, repo Node `1`, owned WebView2 `6`
- max one-core CPU: `musu=0`, `node=0`, `webview2=0.08`
- memory: working set `504.02MB`, private memory `330.43MB`
- note: Node.js is now intentionally attributed through command-line metadata;
  the `node` process is the local Next production dashboard on port `3001`

2026-06-01 20:43 KST source-fresh primary evidence after dashboard/node polling
hardening and the public-site common-shell accent follow-up:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-203715-HUGH_SECOND.evidence.json`
  with dashboard task `4345c783-ddc2-4f7c-9328-6a721e7b3f1c`, bridge
  `http://127.0.0.1:4752`, and CLI route checked.
- primary `desktop-open` CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-203537-HUGH_SECOND.desktop-open.evidence.json`
  from clean commit `9f9e35ac0eefe1eb647cc62c13f6fb156b1ed62d`, 60.061s
  sample, `git_dirty=false`, repo Node `1`, owned WebView2 `8`, max one-core
  CPU `musu=0`, `node=0.03`, `webview2=0.05`, working set `655.4MB`, private
  memory `457.63MB`, and no hot processes.
- audit note: that first desktop-open sample intentionally measured the app as
  found and exposed accumulated old `musu-desktop.exe` shells from repeated
  manual launches. CPU was still inside the beta budget, but packaged desktop
  window single-instance/reactivation remains a hardening task.
- primary 4-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-203835-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  from clean commit `f89a67f9d45c98d6bd131fea330d6a4bc7633aa2`, verifier
  `ok=true`, `fail_count=0`.
- matrix detail:
  `runtime-started` sampled MUSU `1`, repo Node `1`, WebView2 `0`, max
  one-core CPU `musu=0.05`; `dashboard-open` sampled MUSU `1`, repo Node `1`,
  WebView2 `0`, max CPU `0`; `desktop-open` sampled MUSU `2`, repo Node `1`,
  WebView2 `6`, max CPU `node=0.18`, `webview2=0.18`; `post-route` sampled
  MUSU `2`, repo Node `1`, WebView2 `6`, max CPU `webview2=0.16`.
- route probe token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_203835`.
- release status: primary evidence is back to one valid machine for both CPU
  gates, but public release still requires the second-PC `desktop-open` CPU
  sample and second-PC 4-state matrix before the runtime gates close.

2026-06-01 21:17 KST final primary evidence after deploy workflow hardening:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-211031-HUGH_SECOND.evidence.json`
  with dashboard task `6a339c65-4d1a-46f3-894a-5a50cc69cd0e`, bridge
  `http://127.0.0.1:4752`, dashboard output
  `MUSU_RELEASE_SMOKE_OK_20260601_211010`, and CLI route checked.
- primary `desktop-open` CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-211132-HUGH_SECOND.desktop-open.evidence.json`
  from clean commit `a0184e89851d7ac99e1162a301f9219104a4df04`, 60.059s
  sample, `git_dirty=false`, MUSU `2`, repo Node `1`, owned WebView2 `6`,
  max one-core CPU `musu=0`, `node=0`, `webview2=0.23`, working set
  `506.71MB`, private memory `329.62MB`, and no hot processes.
- primary 4-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-211252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  from clean commit `a0184e89851d7ac99e1162a301f9219104a4df04`, verifier
  `ok=true`, `fail_count=0`.
- matrix detail:
  `runtime-started` sampled MUSU `1`, repo Node `1`, WebView2 `0`, max
  one-core CPU `node=0.03`; `dashboard-open` sampled MUSU `1`, repo Node `1`,
  WebView2 `0`, max CPU `musu=0.03`, `node=0.05`; `desktop-open` sampled
  MUSU `2`, repo Node `1`, WebView2 `6`, max CPU `node=0.08`,
  `webview2=0.23`; `post-route` sampled MUSU `2`, repo Node `1`, WebView2
  `6`, max CPU `webview2=0.08`.
- route probe token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_211252`.
- release status: current primary still shows no 20%-of-one-core busy-loop,
  but the runtime gates remain `1/2` until the second PC returns matching
  clean/current `desktop-open` CPU and 4-state matrix evidence.

2026-06-01 17:38 KST frontend polling hardening update:

- `musu-bee/src` no longer contains direct `setInterval(` usage.
- Workflow run status polling, remote screen device refresh, agents surface
  refresh, and onboarding research polling now use `useLowDutyPolling`.
- The shared poller gives those paths hidden-tab throttling, failure backoff,
  in-flight request suppression, and AbortController cancellation on unmount or
  route change.
- Regression guard:
  `musu-bee/src/app/runtime-polling-contract.test.ts`.
- Validation:
  `rg -n "setInterval\(" musu-bee\src -S` returned no matches,
  `npx tsx --test src/app/runtime-polling-contract.test.ts` passed 4/4,
  `npm run typecheck` passed, and `npm run build` passed.
- Release status: this is root-cause hardening, not new CPU evidence. The next
  release proof still needs clean/current 60s primary and second-PC samples
  after this commit is built/deployed/packaged.

2026-06-01 17:51 KST Tauri desktop start-runtime hardening update:

- `musu-bee/src-tauri/src/lib.rs` no longer uses direct `Command::output()` for
  `musu up --json`.
- The desktop `Start Runtime` command now captures stdout/stderr through temp
  files, sets `stdin` to null, waits with 200ms sleeps, and returns a timeout
  message after 45s instead of staying busy indefinitely.
- This specifically addresses the same inherited-output-handle risk already
  found in the PowerShell harness audit: long-lived bridge children must not be
  able to keep the runtime-start command result unsettled.
- Validation:
  `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed 3/3
  Tauri shell tests, including command output capture without `.output()` pipes;
  `rg -n "\.output\(\)|wait_with_output" musu-bee\src-tauri\src\lib.rs -S`
  found no direct output-pipe wait in the desktop shell.
- Diagnostic process ownership audit at 2026-06-01 17:53 KST saw 16
  machine-wide Node.js processes, all non-MUSU Codex/MCP/npx helpers. It
  reported MUSU-owned Node `0` and repo-related orphan helpers `0`, but failed
  as release evidence because MUSU was not running and the bridge registry PID
  was dead.

2026-06-01 18:07 KST stale bridge registry cleanup update:

- `desktop_status` now parses `~/.musu/services/bridge.json` before bridge
  health probing.
- If the registry contains a Windows PID that no longer exists, the desktop
  shell removes the stale `bridge.json`, returns `bridge_url=null`, and reports
  the stale registry cleanup in `bridge_detail`.
- This prevents stale `127.0.0.1:<port>` registry entries from confusing the
  desktop shell after bridge crashes or manual process cleanup.
- Validation:
  `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed 5/5
  Tauri shell tests, including stale cleanup and live registry URL preservation.
- Release status: this is failure-handling hardening only. The next release
  proof still needs live packaged Start Runtime click evidence and clean/current
  two-machine CPU samples.

2026-06-01 18:35 KST doctor background profile update:

- `musu doctor --json` now exposes a `background` object for resource-affecting
  background features.
- It reports mDNS, IPv6 mDNS, Tailscale mDNS, VPN/virtual mDNS interfaces,
  clipboard sync, cloud registration, cloud heartbeat interval/floor, file
  watcher roots/writable state, and planner status.
- Live `HUGH_SECOND` output reported `background.status=ok`, mDNS off,
  clipboard off, file sync off, planner off, cloud registration on,
  `cloud_heartbeat_interval_sec=300`, and `cloud_heartbeat_floor_sec=60`.
- Validation:
  targeted doctor background tests passed 3/3, `cargo build --bin musu` passed,
  `git diff --check` passed, and both JSON/text doctor output expose the
  background profile.
- Release status: this makes the idle evidence background profile explicit. It
  does not replace the required clean/current two-machine 60s CPU samples.

2026-06-01 18:56 KST planner loop budget hardening update:

- The optional `MUSU_ENABLE_PLANNER=1` loop now floors
  `MUSU_PLANNER_INTERVAL_SEC` at 60s, so a `0` or very small value cannot create
  a busy loop.
- Planner crawler execution now uses timeout-bounded `tokio::process::Command`
  with `stdin=null`, piped output, `kill_on_drop(true)`, and
  `MUSU_PLANNER_COMMAND_TIMEOUT_SEC` clamped to 5s..120s.
- `musu doctor --json` reports the effective planner interval and crawler
  timeout budget. Live `HUGH_SECOND` verification with
  `MUSU_ENABLE_PLANNER=1`, `MUSU_PLANNER_INTERVAL_SEC=0`, and
  `MUSU_PLANNER_COMMAND_TIMEOUT_SEC=9999` returned
  `planner_interval_sec=60`, `planner_command_timeout_sec=120`, and
  `background.status=warn`.
- Validation:
  planner unit tests passed 2/2, doctor background tests passed 4/4,
  `cargo build --bin musu -j 1` passed, and `git diff --check` passed.
- Release status: this closes a background-loop hardening gap for an optional
  feature. It still does not replace the required clean/current two-machine 60s
  CPU samples.

2026-06-01 19:19 KST hardware probe timeout hardening update:

- The logged-in `musu.pro` cloud heartbeat still gathers hardware metadata, but
  `peer::hardware` no longer uses timeout-less PowerShell/WMIC/sysctl/nvidia-smi
  process calls.
- Windows PowerShell/WMIC, macOS `sysctl`, and `nvidia-smi` probes now use
  `command_stdout_with_timeout()` with `stdin=null`, stderr discarded, and a 5s
  timeout. Missing, failing, or timed-out probes fall back instead of blocking
  the background heartbeat path.
- Validation:
  `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib
  peer::hardware::tests -- --nocapture` passed 2/2 Windows tests,
  `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed,
  `cargo fmt --check` passed, and `git diff --check` passed.
- Release status: this removes another background stall candidate. It is not
  substitute CPU evidence; the gate remains 60s clean/current primary plus
  second-PC samples.

2026-06-01 19:27 KST post-push go/no-go update:

- Commit `4f099bf` passed GitHub `Tests` run `26749151136`.
- A clean post-push go/no-go summary reports `ready=false`,
  `single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU scenario
  matrix `0/2`, public metadata ok, MSIX install ok, support false, Store false,
  and `manifest_dirty=false`.
- Interpretation: the latest hardening commit invalidated prior primary CPU and
  smoke evidence by source commit freshness. Refresh primary smoke,
  `desktop-open` CPU, and the 4-state CPU scenario matrix before treating the
  next second-PC return as capable of closing the two-machine gates.

2026-06-01 19:50 KST primary evidence refresh:

- Single-machine smoke passed at
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-194130-HUGH_SECOND.evidence.json`
  with dashboard task `60cb73e5-ea3c-42c8-bcd6-41f09e618a16`, bridge
  `http://127.0.0.1:4752`, and CLI route checked.
- Primary packaged `desktop-open` idle CPU evidence passed at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-194410-HUGH_SECOND.desktop-open.evidence.json`:
  `git_dirty=false`, 60.056s, MUSU `2`, repo Node `1`, owned WebView2 `6`,
  max one-core CPU `musu=0`, `node=0.03`, `webview2=0.08`, working set
  `506.72MB`, private memory `328.53MB`, no resource violations.
- Primary 4-state runtime CPU scenario matrix passed at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-194528-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` all
  passed 60s clean samples; route probe token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_194528` succeeded.
- Go/no-go now reports primary runtime gates back to `1/2`: single-machine true,
  runtime idle CPU valid machines `[HUGH_SECOND]`, runtime matrix valid machines
  `1`, public metadata ok, MSIX install ok, support false, Store false, and
  public release No-Go.

2026-06-01 20:10 KST frontend polling follow-up:

- The remaining custom dashboard refresh loops found in the frontend audit were
  moved under the shared cancellable `useLowDutyPolling` contract.
- `DashboardClient.tsx` now uses the shared poller for agents/tasks/watchdog
  and run/cost refresh instead of a local visibility/timer loop.
- `NodePanel.tsx` now uses the shared poller for nodes, cloud registry, and
  discovered-node refresh instead of a local visibility/timer loop.
- `runtime-polling-contract.test.ts` now guards six surfaces, including the
  dashboard and node panel.
- Validation:
  `npx tsx --test src/app/runtime-polling-contract.test.ts` passed 6/6,
  `npm run typecheck` passed, `npm run build` passed, `git diff --check`
  passed, and `rg -n "setInterval\(" musu-bee\src` returned no matches.
- Release status: this removes more frontend busy-loop candidates, but it is a
  source change and therefore requires fresh clean/current CPU evidence before
  the release gates can count it.

2026-06-01 20:17 KST post-commit go/no-go:

- Commit `a1082dec` is clean (`manifest_dirty=false`).
- Go/no-go reports `ready=false`, `single_machine_verified=false`, runtime idle
  CPU `0/2`, runtime CPU scenario matrix `0/2`, multi-device false, support
  false, and Store false.
- Public metadata, MSIX install, MSIX desktop entrypoint, process ownership, and
  startup single-instance gates still pass.
- Interpretation: this is expected source-freshness behavior after the frontend
  polling source change. Refresh primary smoke/CPU/matrix evidence before
  expecting second-PC import to close the two-machine runtime gates.

Parser validation:

- `measure-musu-runtime-cpu-scenarios.ps1 parser ok`
- `measure-musu-idle-cpu.ps1 parser ok`

2026-06-01 23:45 KST source-current primary evidence refresh:

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-231612-HUGH_SECOND.evidence.json`
  passed with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_231552`,
  dashboard task `900260dc-d0d1-4ac6-9503-0001b4a2f451`, bridge
  `http://127.0.0.1:4752`, and CLI route checked.
- Primary `desktop-open` CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-231939-HUGH_SECOND.desktop-open.evidence.json`
  passed from clean source commit `afd1ceab2db2b234c6c4d9f50a5a165830bfae65`
  with 60.058s sample, MUSU `2`, repo Node `1`, owned WebView2 `6`, max
  one-core CPU `musu=0`, `node=0`, `webview2=0.1`, working set `510.13MB`,
  and no hot processes.
- Primary 4-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-233638-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed from clean source commit `5434b4caf0c5e0f5a8dd345e775cb45259e4ebbd`
  with `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route`
  all sampled for 60s from clean git. The verifier passed with
  `fail_count=0`; `dashboard-open` launched `http://127.0.0.1:3001/app`;
  route probe token was `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_233638`.
- Node audit note: machine-wide Node.js was high because Codex/MCP/npx helper
  processes were running. The matrix intentionally counted only one
  repo-related Node, the local Next dashboard on port `3001`; MUSU-owned Node
  remains zero in process ownership audits.

## Next Steps

1. Run the second-PC release wrapper again so returned evidence includes the
   fixed mDNS behavior and the required 60s `desktop-open` CPU evidence.
2. Import the second-PC return archive and rerun go/no-go; the CPU gate should
   remain blocked until it sees two valid machines.
3. Finish real P2P release evidence through the `musu.pro` rendezvous/control
   plane with transport-verified peer identity and hardened encryption.
4. Record `musu@musu.pro` support inbox delivery evidence and Partner
   Center/Microsoft Store evidence.
