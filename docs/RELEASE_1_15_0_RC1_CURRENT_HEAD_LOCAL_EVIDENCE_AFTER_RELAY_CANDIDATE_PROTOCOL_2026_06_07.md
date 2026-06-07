# Release 1.15.0-rc.1 Current-HEAD Local Evidence After Relay Candidate Protocol

Date: 2026-06-07
Commit: `5b2a184d87c176d187517cd82083712be2ec00d7`

## Summary

The relay candidate protocol source change made older one-machine evidence stale
for go/no-go freshness. Current-head local evidence was refreshed on
`HUGH_SECOND` to restore the local gates that can be proven on one machine.

Promoted evidence:

- `docs\evidence\single-machine\1.15.0-rc.1\20260607-134308-HUGH_SECOND.evidence.json`
- `docs\evidence\single-machine\1.15.0-rc.1\20260607-134308-HUGH_SECOND.verification.json`
- `docs\evidence\single-machine\1.15.0-rc.1\20260607-134308-HUGH_SECOND.summary.md`
- `docs\evidence\process-ownership\1.15.0-rc.1\20260607-134335-HUGH_SECOND.process-ownership.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-134335-HUGH_SECOND.startup-single-instance.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-134335-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-134335-HUGH_SECOND.desktop-single-instance.json`

Results:

- single-machine smoke: `ok=true`, `local-bridge-only`
- bridge URL: `http://127.0.0.1:14361`
- process ownership: `ok=true`
- startup single-instance: `ok=true`
- desktop single-instance: `ok=true`

Dirty-tree go/no-go after recording this evidence reported:

- `single_machine=true`
- `process_ownership=true`
- `startup_single_instance=true`
- `desktop_single_instance=true`
- `multi_device=false`
- `p2p_env_ready=false`
- `blocker_count=8`

The remaining blocker areas were:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `runtime-cpu-second-pc-route-attempt`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`
- `git`

The `git` blocker is expected before committing these evidence files.

## Boundary

This restores current-head one-machine local freshness only. It does not prove
second-machine route success, two-machine CPU/matrix coverage, production
MUSU.PRO relay proof, support mailbox delivery, or Store readiness.
