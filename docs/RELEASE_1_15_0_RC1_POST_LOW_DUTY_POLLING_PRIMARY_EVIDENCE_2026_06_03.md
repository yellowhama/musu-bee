# 1.15.0-rc.1 Post Low-Duty Polling Primary Evidence

**Date**: 2026-06-03 03:25 KST  
**Wiki ID**: wiki/581  
**Scope**: current-head MSIX rebuild/install, mDNS regression check, primary local runtime evidence

## Summary

After the low-duty polling default-timeout source change, the local-sideload
MSIX was rebuilt and replaced on `HUGH_SECOND`. Primary local evidence is
current again for the single-machine path.

Current evidence was captured from clean commit:

- `335f2836473137e2fae06f1f8ce0b0fc198678a9`

The initial `-MachineTrust` install path waited for elevation and was stopped.
The current-user replace install then succeeded because the signing certificate
was already trusted.

## mDNS Regression

Current source mDNS regression passed:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 peer::mdns::tests::`
  passed 3/3
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- debug `musu discover --timeout 2` with mDNS opt-in env vars unset produced no
  `Failed to send`, `ff02::fb`, `10065`, or `closed channel`

The live discover run logged IPv6 and Tailscale disabled-by-default messages,
disabled 9 virtual/VPN interfaces, and sent mDNS only on physical `이더넷 2`.

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-031050-HUGH_SECOND.evidence.json`
- dashboard task: `cd4eff5c-ba1e-450e-b1ba-c7e25c11a6bf`
- bridge: `http://127.0.0.1:14748`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260603_0310`
- CLI route checked: `true`

Desktop single-instance:

- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-031229-HUGH_SECOND.desktop-single-instance.json`
- `ok=true`
- final desktop shell count: `1`
- repeated activation count: `3`

Process ownership:

- `docs\evidence\process-ownership\1.15.0-rc.1\20260603-031234-HUGH_SECOND.process-ownership.json`
- `ok=true`
- MUSU runtime: `1`
- desktop shell: `1`
- MUSU-owned Node: `0`
- MUSU-owned WebView2: `6`
- machine-wide Node: `18`
- machine-wide WebView2: `12`
- orphan repo helpers: `0`

Desktop-open CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-031248-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- sample: `60.06s`
- max one-core CPU: MUSU `0.03`, Node `0.05`, WebView2 `0.6`
- working set: `499.66MB`
- hot processes: `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-031911-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_031911`
- scenarios: `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`
- max one-core CPU by scenario:
  - runtime-started: MUSU `0`, Node `0.03`, WebView2 `0.03`
  - dashboard-open: MUSU `0`, Node `0.03`, WebView2 `0.1`
  - desktop-open: MUSU `0`, Node `0`, WebView2 `0`
  - post-route: MUSU `0`, Node `0.03`, WebView2 `0.1`
- hot processes: `0` in every scenario

## Go/No-Go

Clean go/no-go after this evidence reported:

- `ready=false`
- `single_machine_verified=true`
- runtime idle CPU: `1/2`
- runtime CPU matrix: `1/2`
- process ownership: `true`
- desktop single-instance: `true`
- multi-device: `false`
- P2P control-plane: `false`
- support mailbox: `false`
- Store release: `false`
- manifest dirty: `false`

Public release remains No-Go. The remaining release blockers are second-PC
CPU/matrix/route evidence, live owner-scoped `musu.pro` P2P KV/Upstash relay
lease evidence, release-grade transport proof, `musu@musu.pro` mailbox
evidence, and Partner Center/Store evidence.

