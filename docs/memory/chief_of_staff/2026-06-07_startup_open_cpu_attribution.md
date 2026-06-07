# 2026-06-07 Startup-Open CPU Attribution

Targeted startup-open CPU attribution was captured on `HUGH_SECOND` from clean
source commit `af394058c10d9691cf9d5217ffaa4ed24e4a31f9`.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-111114-HUGH_SECOND.startup-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-111114-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- canonical report:
  `docs\RELEASE_1_15_0_RC1_STARTUP_OPEN_CPU_ATTRIBUTION_2026_06_07.md`

Result:

- `ok=true`, `git_dirty=false`, `60.039s`
- startup sample delay `2.01s`
- bridge `127.0.0.1:14361`, PID `34860`
- process roles MUSU `2`, Node `0`, WebView2 `6`
- subroles bridge runtime `1`, desktop shell `1`, Node helper `0`,
  WebView2 helper `6`
- max one-core CPU MUSU `0`, Node `0`, WebView2 `0.52`
- bridge runtime `0`, desktop shell `0`, WebView2 helper `0.52`
- hot process count `0`, resource budget violations `0`
- working set `359.53MB`
- targeted matrix verifier `ok=true`, `fail_count=0`

Assessment: startup activation does not reproduce a 20% busy-loop on this
machine. The only measurable startup CPU came from WebView2 helpers and stayed
far below the 5% one-core release budget. Remaining attribution work is
post-route behavior and second-PC evidence.
