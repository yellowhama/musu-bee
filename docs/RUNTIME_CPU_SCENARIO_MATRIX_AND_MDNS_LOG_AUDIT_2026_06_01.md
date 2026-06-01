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
`-DashboardUrl` is not supplied, the matrix runner uses the URL discovered from
`musu up --json` (`reachable_url`, then `dev_url`, then `start_url`) and launches
it before sampling. If `dashboard-open` is run without a prior `runtime-started`
entry, it performs its own bounded `musu up --json` discovery first. This keeps
the dashboard-open state aligned with the operator's busy-loop report instead of
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

Parser validation:

- `measure-musu-runtime-cpu-scenarios.ps1 parser ok`
- `measure-musu-idle-cpu.ps1 parser ok`

## Next Steps

1. Run the full 60s scenario matrix on the primary PC with the packaged desktop
   actually open and `-RunRouteProbe` enabled:
   `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route`.
2. Run the second-PC release wrapper again so returned evidence includes the
   fixed mDNS behavior and the required 60s `desktop-open` CPU evidence.
3. Import the second-PC return archive and rerun go/no-go; the CPU gate should
   remain blocked until it sees two valid machines.
4. Finish real P2P release evidence through the `musu.pro` rendezvous/control
   plane with transport-verified peer identity and hardened encryption.
5. Record `musu@musu.pro` support inbox delivery evidence and Partner
   Center/Microsoft Store evidence.
