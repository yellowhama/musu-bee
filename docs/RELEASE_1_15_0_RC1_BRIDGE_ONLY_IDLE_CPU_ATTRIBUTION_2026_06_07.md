# Release 1.15.0-rc.1 Bridge-Only Idle CPU Attribution

**Wiki ID**: wiki/955
**Generated**: 2026-06-07 KST
**Evidence source commit**: `eab3dc2ff2fdde503f56d23c887db333f929455d`

## Summary

After closing the packaged desktop shell, the local bridge was kept alive with
the WindowsApps `musu.exe` alias and sampled for 60 seconds in `bridge-only`
mode.

This evidence isolates the packaged bridge runtime from desktop/WebView2 UI
processes. It proves the bridge itself is not currently the idle busy-loop CPU
source on `HUGH_SECOND`.

## Pre-Sample Process State

Before sampling, process attribution reported:

- bridge runtime: `1`
- desktop shell: `0`
- owned Node helpers: `0`
- owned WebView2 helpers: `0`
- orphan repo helpers: `0`
- bridge health: `HTTP 200` at `127.0.0.1:14361`

## Evidence

New evidence file:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-105020-HUGH_SECOND.bridge-only.evidence.json`

Key result:

- `ok=true`
- `git_dirty=false`
- scenario: `bridge-only`
- sample duration: `60.05s`
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

The bridge/runtime loop is quiet in isolation:

- no Node helper was owned by MUSU;
- no WebView2 helper was owned by MUSU;
- no desktop shell was running;
- the only sampled MUSU process was the packaged bridge;
- bridge CPU stayed at `0` of one logical core for the full 60s sample.

Current evidence therefore points away from the bridge readiness/health loop as
the observed idle CPU source. Remaining local CPU attribution work should focus
on UI/WebView2 surfaces, explicit desktop activation states, post-route
behavior, and second-PC evidence.

## Product Boundary

This evidence is for the local packaged MUSU Desktop runtime. It does not make
`localhost:3001` part of the release contract.

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, AI meeting room, presence, rendezvous, path selection,
relay fallback, and evidence/control plane.

## Remaining Work

This closes only the single-machine bridge-only CPU attribution slice.
Public release still requires:

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
- indexed files: `2895`
- indexed symbols: `2790`
- duration: `17851 ms`
- wiki: `wiki/956`
