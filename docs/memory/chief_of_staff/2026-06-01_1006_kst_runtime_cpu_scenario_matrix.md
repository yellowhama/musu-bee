# CoS Memory - Runtime CPU Scenario Matrix

Date: 2026-06-01 10:06 KST

The operator re-supplied the Tailscale IPv6 mDNS error class:
`mdns_sd::service_daemon`, `[ff02::fb%9]:5353`, Windows `os error 10065`, then
`sending on a closed channel`. Current source already treats this as a
default-off class through `MUSU_ENABLE_MDNS=1`, `MUSU_MDNS_ENABLE_IPV6=1`,
`MUSU_MDNS_ENABLE_TAILSCALE=1`, and
`MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`. If a default installed desktop still
emits it, check for stale installed bits or inherited opt-in environment before
assuming the source fix failed.

Added `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` for diagnostic
state attribution. It writes `musu.runtime_cpu_scenario_matrix.v1` and measures
`runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` by calling
`measure-musu-idle-cpu.ps1` with Node/WebView2 budgets. The idle sampler now
accepts the additional scenario labels `runtime-started`, `dashboard-open`, and
`startup-open`.

Implementation audit: the first smoke attempt exposed the old PowerShell pipe
capture hang pattern with `musu up --json` and a spawned bridge child. The
matrix script was changed to timeout-bounded `Start-Process` temp-file
stdout/stderr capture. Parser checks passed for both CPU scripts.

Short smoke evidence:

- command: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario runtime-started -SampleSeconds 3 -CommandTimeoutSec 45 -MusuExe .\musu-rs\target\debug\musu.exe -Json`
- output: `.local-build\runtime-cpu-scenarios\20260601-100515-HUGH_SECOND\20260601-100515-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- result: `ok=true`, MUSU process count `1`, owned Node `0`, owned WebView2 `0`, max one-core CPU `0`, working set `27.72MB`

This is diagnostic-only dirty-tree smoke. It does not close the release CPU
gate; public release still requires clean 60s `desktop-open` CPU evidence on at
least two Windows machines.
