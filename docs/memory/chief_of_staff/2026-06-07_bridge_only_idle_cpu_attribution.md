# 2026-06-07 Bridge-Only Idle CPU Attribution

Bridge-only CPU attribution was captured on `HUGH_SECOND` from clean commit
`eab3dc2ff2fdde503f56d23c887db333f929455d`.

## Evidence

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-105020-HUGH_SECOND.bridge-only.evidence.json`
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

The packaged bridge runtime is not the idle busy-loop source in isolation. The
next local attribution slices are runtime-started after a clean evidence commit,
desktop-open/WebView2 comparison, and post-route CPU on the second machine.
