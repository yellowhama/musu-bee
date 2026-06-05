# MUSU 1.15.0-rc.1 Post-Degraded-Gate Primary Evidence Refresh

**Wiki ID**: wiki/779  
**Date**: 2026-06-06 KST  
**Scope**: Refresh primary Windows evidence after the degraded/fallback contract gate changed current source.

## Verdict

Primary single-machine and runtime CPU evidence are current again for
`701988f39ce2f293077198e853d68cf84c470b5d` on `HUGH_SECOND`.

This does not make the public desktop release ready. It restores the primary
machine side of the local runtime claim and leaves the second-PC, hosted P2P,
support mailbox, and Store gates open.

## Evidence

- Packaged runtime repair:
  `.local-build\packaged-runtime-repair\musu-packaged-runtime-repair-20260606-042559-HUGH_SECOND.json`
- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-043041-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-043041-HUGH_SECOND.verification.json`
- Desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-043051-HUGH_SECOND.desktop-open.evidence.json`
- Full runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-043203-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Full matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-043203-HUGH_SECOND.verification.json`
- Targeted post-route CPU attempt:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-043811-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Targeted post-route verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-043811-HUGH_SECOND.target-route.verification.json`

## Results

- Packaged runtime was clean-started through the WindowsApps alias.
- Previous bridge PID `44764` and desktop PID `12488` were stopped.
- New bridge is `http://127.0.0.1:4760`, PID `32780`.
- The packaged runtime reported `dashboard.required=false`, which is the
  intended local-runtime/web-input split.
- Single-machine smoke passed as `local-bridge-only`; no `localhost:3001`
  dashboard was required.
- Desktop-open idle CPU passed for `60.039s` with `git_dirty=false`.
- Desktop-open max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.03`.
- Desktop-open owned working set: `369.01MB`.
- Desktop-open hot process count: `0`.
- Full five-scenario matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_043203`.
- Full matrix max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.1`.
- Full matrix max owned working set: `371.01MB`.
- Targeted `HUGH-MAIN` post-route CPU evidence passed as a failed-route CPU
  attempt. The actual route to `http://192.168.1.192:8949/api/tasks/delegate`
  timed out, with failure explicitly allowed.
- Targeted post-route max WebView2 CPU was `0.05`, hot process count `0`.

## Code Audit

No new code change was needed for this refresh. The source-contract audits
already pass:

- frontend polling contract: `ok=true`
- Rust background-loop contract: `ok=true`
- idle busy-loop candidate contract: `true`
- process ownership: `true`
- startup single-instance: `true`
- desktop single-instance: `true`

The main process finding is evidence-based: the reported idle CPU busy-loop is
not reproduced on `HUGH_SECOND` under the current packaged desktop-open sample.
The remaining CPU gate is now second-PC coverage, not a primary-machine
regression.

## Remaining Blockers

- second-PC release-grade multi-device route evidence
- second-PC desktop-open idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted `musu.pro` owner-scoped P2P control-plane and relay proof
- support mailbox proof
- Partner Center / Store evidence

## Next Step

Install and run the same current MUSU build on the second Windows PC, then
import the second-PC return zip so runtime idle CPU and runtime CPU matrix reach
`2/2` and the real route evidence is no longer just a failed `HUGH-MAIN`
attempt from the primary machine.
