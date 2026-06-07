# Release 1.15.0-rc.1 Process, Startup, and Desktop Single-Instance Recheck

Date: 2026-06-07 KST

Scope: MUSU Desktop local runtime, process ownership, startup single-instance
reuse, desktop repeated activation, and release hardening evidence on
`HUGH_SECOND`.

## Summary

Current packaged MUSU Desktop still satisfies the local process/startup
hardening contracts on `HUGH_SECOND`.

- Process ownership audit: `ok=true`, `fail_count=0`
- Startup single-instance audit: `ok=true`, `fail_count=0`
- Desktop repeated activation audit: `ok=true`, `fail_count=0`
- P2P store-forward/relay contract audit: `ok=true`, `fail_count=0`
- Rust background loop contract audit: `ok=true`, `fail_count=0`

This is one-machine local runtime evidence. It does not replace the required
second-PC CPU/matrix/route evidence and does not change the hosted MUSU.PRO
P2P/relay release blockers.

## Evidence

Promoted release evidence:

- `docs\evidence\process-ownership\1.15.0-rc.1\20260607-115103-HUGH_SECOND.process-ownership.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-115104-HUGH_SECOND.startup-single-instance.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-115104-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-115149-HUGH_SECOND.desktop-single-instance.json`

Source commit:

- `c9129327884eefe016e7776442a96d3eb8643831`

## Process Ownership

`audit-musu-process-ownership.ps1 -Json` reported:

- `ok=true`
- `fail_count=0`
- packaged runtime process count: `1`
- packaged desktop shell process count: `1`
- owned Node helper count: `0`
- owned WebView2 helper count: `6`
- repo-related orphan helper count: `0`
- bridge registry PID: `34860`
- bridge registry address: `127.0.0.1:14361`
- bridge `/health`: HTTP `200`
- bridge PID belongs to the packaged WindowsApps runtime
- desktop shell belongs to the packaged WindowsApps runtime

Interpretation: machine-wide Node/WebView2 processes exist, but MUSU-owned
helpers are inside the release budget and no repo-related orphan helper is
attributed to MUSU.

## Startup Single Instance

`audit-musu-startup-single-instance.ps1 -Json` ran three packaged
`musu up --json` invocations.

Result:

- `ok=true`
- `fail_count=0`
- runtime count before: `1`
- runtime count after: `1`
- observed bridge PID count: `1`
- repeated spawn count: `0`
- failed invocation count: `0`
- every invocation reused bridge PID `34860`
- nested process ownership audit passed

Interpretation: repeated local runtime startup reuses the running packaged
bridge instead of spawning duplicate runtimes.

## Desktop Single Instance

`audit-musu-desktop-single-instance.ps1 -Json` activated the packaged app three
times via AppUserModelId `Yellowhama.MUSU_ygcjq669as2b6!MUSU`.

Result:

- `ok=true`
- `git_dirty=false`
- `fail_count=0`
- desktop shell count before: `1`
- desktop shell count after: `1`
- new desktop shell count: `0`
- activation failure count: `0`
- every activation kept desktop PID `24144`

Interpretation: repeated desktop activation reuses the existing packaged
desktop shell instead of opening duplicate app processes.

## P2P and Background Loop Contract Recheck

P2P relay source contract:

- `audit-p2p-store-forward-relay-contract.ps1 -Json`
- `ok=true`
- `fail_count=0`

The current source still keeps the preview store-forward queue separate from
release-grade relay transport. `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED` and
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED` remain false because the real
`quic_relay_tunnel` payload transport is not implemented. This is intentional:
the release gate must not treat the preview queue as release-grade relay
payload transport.

Rust background loop contract:

- `audit-rust-background-loop-contract.ps1 -Json`
- `ok=true`
- `fail_count=0`
- `unaudited_loop_hit_count=0`
- `unaudited_spawn_hit_count=0`

The clipboard, mDNS, relay payload poller, cloud heartbeat, planner, task
runner, and route-evidence submission surfaces remain covered by opt-in gates,
bounded waits, backoff, or cancellation-aware loops.

## Release Meaning

This recheck strengthens the local desktop hardening evidence:

- normal packaged runtime ownership is stable;
- `musu up` startup is single-instance;
- packaged desktop activation is single-instance;
- background loop source contracts still pass.

Public release remains No-Go because the following are still not proven:

- real second-PC multi-device evidence;
- desktop-open idle CPU and five-state runtime CPU matrix on at least two
  machines;
- hosted MUSU.PRO release-grade P2P relay transport proof;
- support mailbox delivery;
- Microsoft Store submission/certification evidence.
