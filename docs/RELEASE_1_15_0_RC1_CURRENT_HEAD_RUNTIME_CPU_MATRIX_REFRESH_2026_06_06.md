# MUSU 1.15.0-rc.1 Current HEAD Runtime CPU Matrix Refresh

**Wiki ID**: wiki/815
**Date**: 2026-06-06

## Summary

Fresh current-HEAD runtime CPU scenario evidence was captured on `HUGH_SECOND`
from a clean git state at commit
`ac1e67a4dd8f610a6f09ff61d3107f556e2ac5e5`.

This closes the local one-machine matrix refresh for the installed packaged
MUSU Desktop runtime. It does not close public release readiness because the
second Windows PC, hosted MUSU.PRO P2P login/control-plane proof, support
mailbox proof, and Store proof are still external gates.

## Evidence

Full runtime CPU scenario matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.verification.json`
- verifier result: `ok=true`, `fail_count=0`
- git commit: `ac1e67a4dd8f610a6f09ff61d3107f556e2ac5e5`
- `git_dirty=false`
- operator machine: `HUGH_SECOND`

Scenario summary:

| Scenario | Sample | Hot | MUSU CPU | Node CPU | WebView2 CPU | Owned processes | WebView2 count | Working set | Private memory |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `startup-open` | 60.033s | 0 | 0 | 0 | 0.05 | 8 | 6 | 363.95MB | 194.04MB |
| `runtime-started` | 60.036s | 0 | 0 | 0 | 0.10 | 8 | 6 | 363.94MB | 194.00MB |
| `dashboard-open` | 60.037s | 0 | 0 | 0 | 0.16 | 8 | 6 | 363.93MB | 194.00MB |
| `desktop-open` | 60.037s | 0 | 0 | 0 | 0.08 | 8 | 6 | 363.88MB | 193.89MB |
| `post-route` | 60.043s | 0 | 0 | 0 | 0.08 | 8 | 6 | 364.10MB | 189.60MB |

Targeted HUGH-MAIN route-attempt CPU diagnostic:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.target-route.verification.json`
- verifier result: `ok=true`, `fail_count=0`
- git commit: `ac1e67a4dd8f610a6f09ff61d3107f556e2ac5e5`
- `git_dirty=false`
- target: `HUGH-MAIN`
- route probe: `ok=false`, `failure_allowed=true`
- failure: request to `http://192.168.1.192:8949/api/tasks/delegate` timed out
- CPU sample after the failed route attempt: `60.036s`, hot `0`, MUSU `0`,
  Node `0`, WebView2 `0.13`, owned processes `8`, WebView2 helpers `6`,
  working set `364.24MB`, private memory `189.63MB`

The target diagnostic is intentionally not a successful multi-device route
proof. It proves that the current packaged local runtime does not spin while a
known second-PC route attempt fails with timeout from this machine state.

## Qualitative Evaluation

The local runtime quality signal is good for the sampled machine:

- no hot process was observed in any 60s scenario
- MUSU runtime/shell CPU stayed at `0`
- Node helper CPU stayed at `0`
- WebView2 stayed below `0.16%` in the full matrix and `0.13%` in the
  failed-target diagnostic
- owned process count stayed at `8`, below the `16` budget
- owned WebView2 helper count stayed at `6`, below the `8` budget
- working set stayed around `364MB`, below the `1024MB` budget

The repeated browser error for `localhost:3001` remains correctly classified:
the packaged MUSU Desktop runtime does not require a workspace dashboard
listener. The local program is the installed desktop/runtime process and bridge.
The optional localhost dashboard is a developer/operator surface only.

## Code Audit

No runtime code was changed in this update. The current diff is evidence and
documentation only.

Findings:

- No high or medium issue found.
- The HUGH-MAIN route attempt timeout is expected from the current machine
  state and is recorded as diagnostic evidence only.
- The diagnostic must not be counted as a successful second-PC route proof.
- The evidence was captured from a clean commit and carries `git_dirty=false`.
- The remaining public release risk is evidence/infrastructure, not a newly
  observed local CPU busy loop.

Residual gaps:

- actual second Windows PC install/route/CPU/matrix evidence is still missing
- packaged runtime hosted P2P login is still missing
- owner-scoped hosted P2P evidence is still not verified
- release-grade relay lease storage and tunnel payload proof are still missing
- support mailbox and Microsoft Store evidence are still missing

## Product Spec Impact

The product split remains unchanged and should stay explicit in user-facing and
operator docs:

- MUSU Desktop is the local executor and resource owner on each device.
- MUSU.PRO accepts remote user input, hosts project/company rooms, records
  presence, coordinates rendezvous and path selection, issues relay fallback
  policy, and stores evidence.
- A user can enter an order from another place through MUSU.PRO, but the actual
  work is performed by the local MUSU program on the target machine.
- Web-assisted bootstrap can make P2P connection setup easier.
- After bootstrap, direct P2P mesh remains preferred.
- Hosted relay is fallback-only and cannot be treated as the default data path
  or release-grade until real tunnel payload proof exists.

This also preserves the project-room concept: local AI agents attached to the
same project may use MUSU.PRO as the shared meeting room, while local devices
perform the work and exchange payloads through direct P2P whenever possible.

## Release Status

This update improves current one-machine evidence freshness but leaves public
desktop release as No-Go.

Current local evidence state:

- local artifacts: passing
- single-machine smoke: passing from prior current evidence
- primary runtime CPU matrix: valid on `HUGH_SECOND`
- targeted failed second-PC route CPU diagnostic: valid on `HUGH_SECOND`
- idle busy-loop candidate source contract: passing with `8/8` candidates
- public metadata: passing from the latest external gate recheck

Still blocking:

- `multi-device`
- `runtime-idle-cpu` second-machine count
- `runtime-cpu-scenario-matrix` second-machine count
- `p2p-control-plane`
- `support-mailbox`
- `store-release`

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_RUNTIME_CPU_MATRIX_REFRESH_2026_06_06.md`
