# Release 1.15.0-rc.1 Runtime-Started Idle CPU Attribution

**Wiki ID**: wiki/957
**Generated**: 2026-06-07 KST
**Evidence source commit**: `763a85a7880466e2bcccc72b57cdf0d5b9a660b1`

## Summary

`runtime-started` CPU attribution was captured from a clean source tree after
the bridge-only CPU attribution commit.

The result matches the bridge-only slice: with no desktop shell and no
MUSU-owned WebView2/Node helpers, the packaged bridge runtime stays at `0` CPU
over the 60s sample.

## Evidence

New evidence file:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-105940-HUGH_SECOND.runtime-started.evidence.json`

Key result:

- `ok=true`
- `git_dirty=false`
- scenario: `runtime-started`
- sample duration: `60.049s`
- bridge registry PID: `34860`
- bridge address: `127.0.0.1:14361`
- process count before/after: `1` / `1`
- process roles: MUSU `1`, Node `0`, WebView2 `0`, other `0`
- process subroles: bridge runtime `1`, desktop shell `0`, Node helper `0`,
  WebView2 helper `0`
- hot processes: `0`
- resource budget violations: `0`
- max one-core CPU by role: MUSU `0`, Node `0`, WebView2 `0`
- max one-core CPU by subrole: bridge runtime `0`, desktop shell `0`,
  Node helper `0`, WebView2 helper `0`
- total working set after sample: `18.98MB`
- total private memory after sample: `3.81MB`

## CPU Attribution Assessment

The runtime-started state does not introduce a CPU loop beyond the bridge-only
state:

- no MUSU-owned Node helper appeared;
- no MUSU-owned WebView2 helper appeared;
- no desktop shell was running;
- the only sampled process was the packaged bridge runtime;
- bridge runtime CPU stayed at `0` of one logical core.

This narrows the local idle CPU investigation. The current evidence no longer
points at bridge startup/readiness/health as the active source on
`HUGH_SECOND`. The remaining local attribution work is desktop-open/WebView2
delta, startup-open activation delta, and post-route behavior, followed by the
same evidence on a second Windows machine.

## Product Boundary

`runtime-started` evidence is local packaged MUSU Desktop runtime evidence. It
does not require a `localhost:3001` developer dashboard and does not move local
execution into MUSU.PRO.

MUSU.PRO remains remote input, project/company room, AI meeting room, presence,
rendezvous, path selection, relay fallback, and evidence/control plane.

## Remaining Work

This closes only the one-machine runtime-started CPU attribution slice. Public
release still requires:

- second-PC desktop-open idle CPU evidence;
- second-PC five-state runtime CPU matrix evidence;
- real second-PC multi-device route evidence;
- live hosted MUSU.PRO runtime login and owner-scoped storage;
- release `quic_relay_tunnel` transport proof;
- release payload delivery proof;
- support mailbox delivery proof;
- Store/Partner Center evidence.

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed files: `2899`
- indexed symbols: `2790`
- duration: `16322 ms`
- wiki: `wiki/958`
