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

Supported matrix scenarios:

- `runtime-started`
- `dashboard-open`
- `desktop-open`
- `post-route`

The base idle sampler now also accepts diagnostic scenario labels
`runtime-started`, `dashboard-open`, and `startup-open`, in addition to the
existing `bridge-only`, `desktop-open`, `post-route`, and `diagnostic` labels.

The matrix script still does not replace the public release CPU gate. It exists
beside the two-machine 60s `desktop-open` evidence so a future busy-loop report
can be attributed to the runtime start, dashboard/desktop opening, or post-route
state before release is allowed.

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
  `-Scenario runtime-started,dashboard-open,desktop-open,post-route`. A
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
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -CommandTimeoutSec 180 -MusuExe .\musu-rs\target\debug\musu.exe -DashboardUrl http://127.0.0.1:3001/app -OpenDesktopApp -RunRouteProbe -FailOnHot -Json
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

Parser validation:

- `measure-musu-runtime-cpu-scenarios.ps1 parser ok`
- `measure-musu-idle-cpu.ps1 parser ok`

## Next Steps

1. Run the second-PC release wrapper again so returned evidence includes the
   fixed mDNS behavior and the required 60s `desktop-open` CPU evidence.
2. Import the second-PC return archive and rerun go/no-go; the CPU gate should
   remain blocked until it sees two valid machines.
3. Finish real P2P release evidence through the `musu.pro` rendezvous/control
   plane with transport-verified peer identity and hardened encryption.
4. Record `musu@musu.pro` support inbox delivery evidence and Partner
   Center/Microsoft Store evidence.
