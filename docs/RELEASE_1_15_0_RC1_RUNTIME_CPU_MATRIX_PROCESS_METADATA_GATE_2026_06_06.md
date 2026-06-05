# MUSU 1.15.0-rc.1 Runtime CPU Matrix Process Metadata Gate

Generated: 2026-06-06 06:35 KST

## Summary

Runtime CPU scenario matrix verification now requires each scenario measurement
to prove scoped process metadata before the evidence can count for release.

This closes an evidence-quality gap: a matrix can no longer pass only because
CPU is low while PID, parent/path metadata, or helper-process scope is missing.
The verifier now rejects matrices that cannot prove CPU attribution is limited
to the MUSU process tree or repo-related helpers.

The product boundary is unchanged:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO remains remote input, room coordination, rendezvous, path selection,
  relay-fallback policy, and evidence/control coordination.
- Local runtime CPU evidence must prove which local processes were measured.

## Code Changes

Changed scripts:

- `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

New required per-scenario measurement fields:

- `process_metadata_available=true`
- `process_metadata_timed_out=false`
- `helper_process_scope=musu_process_tree_or_repo_related`
- `cpu_attribution.attribution_scope=musu_process_tree_or_repo_related`

Regression coverage added:

- runtime matrix rejects missing process metadata attribution
- runtime matrix rejects timed-out process metadata attribution
- runtime matrix rejects unscoped helper attribution

Older runtime matrix evidence without these fields now fails the current
verifier. Example: the previous `20260606-054415-HUGH_SECOND` matrix fails the
new current-commit verifier with `ok=false`, `fail_count=15`.

## Fresh Evidence

Full HUGH_SECOND runtime CPU scenario matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-061932-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-061932-HUGH_SECOND.verification.json`
- git commit:
  `525f5b0bdbeff99ec89ff37b99cfe30c0a13b5b5`
- git dirty during capture: `false`
- verifier result: `ok=true`, `fail_count=0`
- verifier checks: `260`
- metadata/scope checks: `20`
- local route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_061932`

Full matrix CPU summary:

| Scenario | MUSU | Node | WebView2 | Hot | Working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| `startup-open` | `0.03` | `0` | `0.16` | `0` | `362.34MB` |
| `runtime-started` | `0` | `0` | `0.05` | `0` | `362.34MB` |
| `dashboard-open` | `0` | `0` | `0.08` | `0` | `362.35MB` |
| `desktop-open` | `0` | `0` | `0.08` | `0` | `364.94MB` |
| `post-route` | `0` | `0` | `0.08` | `0` | `364.11MB` |

Every scenario recorded:

- `process_metadata_available=true`
- `process_metadata_timed_out=false`
- `helper_process_scope=musu_process_tree_or_repo_related`
- `cpu_attribution.attribution_scope=musu_process_tree_or_repo_related`

Targeted HUGH-MAIN post-route CPU diagnostic:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-062729-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-062729-HUGH_SECOND.target-route.verification.json`
- git commit:
  `525f5b0bdbeff99ec89ff37b99cfe30c0a13b5b5`
- git dirty during capture: `false`
- verifier result: `ok=true`, `fail_count=0`
- verifier checks: `65`
- metadata/scope checks: `4`
- target: `HUGH-MAIN`
- failed route allowed: `true`
- actual route result: timeout to
  `http://192.168.1.192:8949/api/tasks/delegate`

Targeted CPU summary:

- MUSU `0`
- Node `0`
- WebView2 `0.08`
- hot process count `0`
- working set `363.93MB`
- process metadata available, not timed out, scoped to MUSU process tree or
  repo-related helpers

This remains CPU stability evidence after a failed second-PC route attempt. It
is not successful multi-device route evidence.

## Validation

- PowerShell parser checks for changed scripts: pass
- release evidence verifier regression:
  `ok=true`, `case_count=54`, `failed_case_count=0`
- old matrix negative check:
  `20260606-054415-HUGH_SECOND` fails current verifier with `ok=false`,
  `fail_count=15`
- new full matrix verifier:
  `ok=true`, `fail_count=0`
- new HUGH-MAIN targeted verifier:
  `ok=true`, `fail_count=0`
- `git diff --check`: pass

## Qualitative Audit

No high or medium code issue was found in this change.

The change is conservative: it only strengthens release evidence acceptance and
does not broaden runtime behavior, routing behavior, or MUSU.PRO control-plane
authority. The main residual risk is operational evidence, not this verifier
logic:

- the second PC still has not produced successful current-build route evidence
- runtime idle CPU and runtime CPU matrix still need a second machine
- hosted MUSU.PRO P2P control-plane proof remains incomplete
- support mailbox and Store/Partner Center proof remain missing

## Next Step

Do not spend more time making HUGH_SECOND evidence stricter until a second
Windows PC is available. The next release-moving work is to install the current
second-PC transfer kit on HUGH-MAIN or another Windows machine, import its
return zip, and then capture successful multi-device route evidence plus
second-machine runtime idle CPU and runtime CPU matrix evidence under this
process-metadata gate.

