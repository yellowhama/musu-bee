# MUSU 1.15.0-rc.1 Current HEAD Desktop-Open CPU Evidence

Date: 2026-06-06

## Summary

Fresh `desktop-open` idle CPU evidence was captured for current clean HEAD
`2387db2dea5fc983d0d3104b41037642b9939ccc` on `HUGH_SECOND`.

This confirms the installed MUSU Desktop runtime is not spinning a local CPU
busy loop while the desktop shell is open. It does not complete second-PC,
multi-device, or hosted MUSU.PRO P2P release evidence.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-071122-HUGH_SECOND.desktop-open.evidence.json`

## Evidence Values

The sample ran for `60.04s` with `git_dirty=false`.

- operator machine: `HUGH_SECOND`
- scenario: `desktop-open`
- logical processors: `12`
- max allowed one-core CPU: `5%`
- MUSU-owned process count after sample: `8`
- MUSU runtime/shell process count after sample: `2`
- owned WebView2 helper count: `6`
- owned Node helper count: `0`
- total working set after sample: `363.83MB`
- total private memory after sample: `193.95MB`
- hot process count: `0`
- resource budget violations: none

Max one-core CPU by role:

- MUSU: `0`
- Node: `0`
- WebView2: `0.08`
- other: `0`

Process counts by role:

- MUSU: `2`
- Node: `0`
- WebView2: `6`
- other: `0`

## Audit

Pre-sample process attribution passed with MUSU process ownership checks true.
The machine still had unrelated machine-wide Node and WebView2 processes, but
the evidence scoped owned MUSU processes separately:

- bridge runtime registry PID: `4204`
- desktop shell PID: `13940`
- owned WebView2 helpers: `6`
- owned Node helpers: `0`
- orphan repo helpers: `0`

Rechecked audit gates:

- Rust background-loop contract: `ok=true`, `fail_count=0`
- frontend polling contract: `ok=true`, `fail_count=0`
- process ownership audit: `ok=true`, `fail_count=0`
- startup single-instance audit: `ok=true`, `fail_count=0`

Desktop release readiness still fails only on the external second-PC evidence
area. The latest stale second-PC smoke evidence has no route success, missing
route explain/command data, no HTTP bearer route, and no peer identity. That is
an evidence/deployment gap, not a new local code issue.

## Qualitative Assessment

No high or medium code issue was found in this pass. No code was changed for
this evidence refresh.

The local runtime behavior looks healthy for one-machine desktop-open use:
owned CPU stayed effectively idle, WebView2 remained inside the established
helper count budget, no owned Node helper was left running, and total memory
was below the release budget.

The release risk is not local CPU at this point. The remaining risk is proof:
the same current build still has to be installed on a second Windows PC for
multi-device route, second-PC CPU, and second-PC matrix evidence, and hosted
MUSU.PRO still needs production P2P/relay proof.

## Current Release State

Go/no-go with public metadata skipped remains:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU valid machines: `1/2` with `HUGH_SECOND`
- runtime CPU scenario matrix valid machines: `1/2`
- targeted second-PC route CPU diagnostic: `true`
- `p2p_store_forward_relay_contract_verified=true`
- `p2p_control_plane_verified=false`

Expected blockers:

- real second-PC multi-device route evidence
- second-PC `desktop-open` idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- public metadata recheck when not skipped
- support mailbox proof
- Partner Center / Microsoft Store proof
- hosted MUSU.PRO P2P control-plane and release relay proof

## Spec Impact

The product boundary is unchanged:

- MUSU Desktop is the installed local executor on each device.
- MUSU.PRO is the remote input, project/company room, presence, rendezvous,
  path-selection, relay-fallback, and evidence control plane.
- MUSU.PRO can make P2P bootstrap easier, but local programs still perform the
  work and should prefer direct P2P mesh after rendezvous.
- Hosted relay is fallback-only and not the default data path.

This evidence proves local desktop-open resource behavior for `HUGH_SECOND`;
it does not substitute for hosted P2P proof or for evidence from another
machine.

## Next Steps

1. Install the same current MUSU build on the second Windows PC.
2. Capture second-PC single-machine, `desktop-open` idle CPU, and runtime CPU
   matrix evidence with scoped process metadata.
3. Capture successful two-machine route evidence or a release-acceptable route
   failure diagnostic with explicit route explanation.
4. Provision hosted owner-scoped KV/Upstash and P2P control-plane auth for
   MUSU.PRO.
5. Implement the distinct release relay tunnel payload path and emit
   `musu.relay_transport_proof.v1` only from actual payload transit.
6. Re-run go/no-go without `-SkipPublicMetadata`, then refresh final operator
   packet/action pack only after the external gates are real.
