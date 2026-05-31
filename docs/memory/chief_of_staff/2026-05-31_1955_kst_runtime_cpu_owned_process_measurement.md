# 2026-05-31 19:55 KST - Runtime CPU Owned-Process Measurement Hardening

Durable decisions:

- Runtime idle CPU evidence must not count every machine-wide WebView2/Node.js
  process as MUSU CPU by default. The default scope is now MUSU descendants plus
  repo-related helpers; `-IncludeUnrelatedHelpers` is reserved for diagnostic
  whole-machine sweeps.
- `measure-musu-idle-cpu.ps1` uses native Windows parent-process lookup instead
  of WMI/CIM because WMI timed out on HUGH_SECOND and would make idle evidence
  unreliable.
- `write-release-go-no-go.ps1` rejects runtime CPU evidence that omits
  `-IncludeNode`, omits `-IncludeWebView2`, lacks a valid helper scope, times
  out process metadata, or cannot prove helper ownership in the default scope.
- Dashboard, NodePanel, and agents-surface polling now use non-overlapping
  recursive timeouts with 30s visible / 120s hidden cadence.
- A HUGH_SECOND debug-runtime 60s diagnostic sample passed at
  `.local-build\runtime-idle-cpu\musu-idle-cpu-20260531-194854.json`, but this
  is not final public-release evidence because packaged desktop/WebView2 and
  second-PC samples are still required.
