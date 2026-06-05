# MUSU 1.15.0-rc.1 Runtime CPU Matrix Candidate Selection Fix

Recorded: 2026-06-05 KST  
Machine: HUGH_SECOND

## Problem

The runtime CPU scenario matrix release gate and the targeted second-PC
post-route CPU gate both consume `musu.runtime_cpu_scenario_matrix.v1` files.
After recording a post-route-only targeted HUGH-MAIN attempt, the go/no-go
writer selected only the latest few matrix files per machine. The targeted
post-route-only matrix could then crowd out the latest full five-scenario
matrix for the same machine, causing:

- `runtime_cpu_scenario_matrix=0/2`
- `runtime_cpu_second_pc_route_attempt=0/1`

even though both valid evidence types existed.

## Fix

`scripts\windows\write-release-go-no-go.ps1` now:

- evaluates up to 12 runtime CPU matrix candidates per machine, so full matrices
  are not displaced by nearby targeted matrices;
- verifies the full runtime CPU matrix gate with the full required scenario set;
- verifies the targeted second-PC route-attempt gate with only `post-route`,
  plus `RequirePostRouteTarget` and `AllowFailedPostRouteProbe`.

`scripts\windows\test-release-evidence-verifiers.ps1` now has a source-contract
regression that checks the go/no-go writer keeps these two evidence uses
separate.

## Verification

- PowerShell parser checks passed for both changed scripts.
- `git diff --check` passed.
- Release evidence verifier regression passed:
  `ok=true`, `case_count=43`, `failed_case_count=0`.
- Dirty go/no-go after the source patch reported:
  - `runtime_idle_cpu=1/2 [HUGH_SECOND]`
  - `runtime_cpu_scenario_matrix=1/2 [HUGH_SECOND]`
  - `runtime_cpu_second_pc_route_attempt=1/1 [HUGH_SECOND]`

## Status

This fixes the local go/no-go evidence aggregation bug. Public release remains
No-Go until the remaining non-local gates are satisfied: real second-PC
multi-device evidence, second-PC CPU/matrix evidence for a second machine,
hosted `musu.pro` P2P control-plane proof, support mailbox proof, and
Store/Partner Center evidence.
