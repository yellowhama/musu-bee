# 2026-06-07 Runtime-Started Idle CPU Attribution

Runtime-started CPU attribution was captured on `HUGH_SECOND` from clean commit
`763a85a7880466e2bcccc72b57cdf0d5b9a660b1`.

## Evidence

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-105940-HUGH_SECOND.runtime-started.evidence.json`
- `ok=true`
- `git_dirty=false`
- bridge: `127.0.0.1:14361`, PID `34860`
- process roles: MUSU `1`, Node `0`, WebView2 `0`
- process subroles: bridge runtime `1`, desktop shell `0`, Node helper `0`,
  WebView2 helper `0`
- hot processes: `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0`
- working set after sample: `18.98MB`

## Assessment

The runtime-started slice matches bridge-only: packaged bridge runtime is quiet
with no owned Node/WebView2 helpers. Remaining local attribution work is
desktop-open/WebView2 delta, startup-open activation delta, and post-route
behavior.
