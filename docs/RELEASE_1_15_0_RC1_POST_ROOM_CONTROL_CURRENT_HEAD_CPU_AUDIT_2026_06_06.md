# MUSU 1.15.0-rc.1 Post Room-Control Current HEAD CPU Audit

Date: 2026-06-06

## Summary

Fresh `desktop-open` idle CPU and process ownership evidence was captured for
current clean HEAD `ade5b64f012c14a8de6f2c0fa99065de5db45f64` on
`HUGH_SECOND` after the room control strict metadata hardening commit.

The installed MUSU Desktop runtime is not reproducing a local busy loop in the
sampled one-machine desktop-open state. This does not close second-PC,
multi-device, hosted MUSU.PRO P2P, support mailbox, or Store release gates.

Evidence:

- CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-080201-HUGH_SECOND.desktop-open.evidence.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260606-080350-HUGH_SECOND.process-ownership.json`

## Evidence Values

The CPU sample ran for `60.045s` with `git_dirty=false`.

- operator machine: `HUGH_SECOND`
- scenario: `desktop-open`
- logical processors: `12`
- max allowed one-core CPU: `5%`
- process count after sample: `8`
- MUSU runtime/shell process count: `2`
- bridge runtime count: `1`
- desktop shell count: `1`
- owned WebView2 helpers: `6`
- owned Node helpers: `0`
- total working set after sample: `363.79MB`
- total private memory after sample: `193.86MB`
- hot process count: `0`
- resource budget violations: none

Max one-core CPU by role:

- MUSU: `0`
- Node: `0`
- WebView2: `0.18`
- other: `0`

Max one-core CPU by subrole:

- bridge runtime: `0`
- desktop shell: `0`
- Node helper: `0`
- WebView2 helper: `0.18`

Process ownership passed:

- `ok=true`
- `fail_count=0`
- packaged runtime process count: `1`
- non-packaged runtime process count: `0`
- non-packaged desktop shell count: `0`
- machine-wide Node processes: `18` diagnostic only
- machine-wide WebView2 processes: `18` diagnostic only
- orphan repo helpers: `0`
- bridge registry PID: `4204`
- bridge registry address: `127.0.0.1:3622`
- bridge health: `HTTP 200`

## Code Audit

No source code was changed for this evidence refresh. The current audit pass
found no high or medium issue.

Audits rechecked:

- Rust background-loop contract: `ok=true`, `fail_count=0`,
  unaudited loops `0`, unaudited spawns `0`
- frontend polling contract: `ok=true`, `fail_count=0`,
  low-duty polling call sites `29`, signal gaps `0`, direct intervals `0`,
  direct visibility listeners `0`
- P2P store-forward relay contract: `ok=true`, `fail_count=0`,
  `check_count=64`
- process ownership audit: `ok=true`, `fail_count=0`

Qualitative result:

- local desktop-open CPU behavior looks healthy on `HUGH_SECOND`
- the localhost/dashboard confusion is not a local runtime CPU problem
- machine-wide Node/WebView2 noise is separated from MUSU-owned helpers
- no new background loop, direct frontend interval, relay payload default path,
  or process ownership regression was found

## Product Spec Impact

The product boundary is unchanged:

- MUSU Desktop is the installed local executor and resource owner on each
  device.
- MUSU.PRO accepts remote user input and coordinates project/company rooms,
  presence, rendezvous, path selection, relay-fallback policy, and evidence.
- MUSU.PRO can make device discovery and P2P bootstrap easier, but local MUSU
  programs perform the work.
- Direct P2P mesh remains the preferred path after bootstrap.
- Hosted relay remains fallback-only and cannot become the default data path
  without separate release tunnel payload transport and proof.

This evidence proves one-machine local resource behavior. It does not prove
second-PC routing, hosted P2P control-plane readiness, or release relay tunnel
payload transport.

## Current Release Posture

The public desktop release remains No-Go until the external gates are real:

- second Windows PC install and route evidence
- second-PC `desktop-open` idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted owner-scoped MUSU.PRO P2P control-plane proof
- release-grade relay tunnel payload transport proof
- public metadata recheck
- support mailbox proof
- Partner Center / Microsoft Store proof

## Next Steps

1. Keep the current one-machine HUGH_SECOND evidence as the local CPU baseline.
2. Install the same current MUSU build on the second Windows PC.
3. Capture second-PC single-machine, `desktop-open` idle CPU, and runtime CPU
   matrix evidence with scoped process metadata.
4. Capture successful two-machine route evidence, or a release-acceptable
   failed-route diagnostic with explicit route explanation.
5. Configure hosted owner-scoped P2P control auth and KV/Upstash relay lease
   storage on MUSU.PRO.
6. Implement the distinct release relay tunnel payload path and only emit
   `musu.relay_transport_proof.v1` from actual payload transit.
7. Re-run go/no-go without public metadata skip after the second-PC and hosted
   gates exist.
