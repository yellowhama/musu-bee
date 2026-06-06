# MUSU 1.15.0-rc.1 Next Steps After Route Attempt CPU Attempt Metadata Gate

**Generated**: 2026-06-07 04:42 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_ROUTE_ATTEMPT_CPU_ATTEMPT_METADATA_GATE_2026_06_07.md`

## Current Position

The local primary machine does not reproduce the reported 20% idle CPU loop,
and the target route-attempt CPU verifier now requires full per-attempt route
probe metadata.

## Execution Order

1. Install the current MUSU Desktop build on the second PC.
2. Run the second-PC kit so it captures:
   - runtime idle CPU evidence
   - full runtime CPU scenario matrix
   - post-route target attempt metadata
   - route reachability diagnostic
3. Import the return zip on the primary machine.
4. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

5. Confirm runtime idle CPU and runtime CPU matrix counts reach `2/2`.
6. Continue hosted MUSU.PRO P2P/relay proof, support mailbox proof, and
   Store/Partner Center evidence.

## Acceptance Criteria

- `runtime_idle_cpu_valid_machine_count=2`
- `runtime_cpu_scenario_matrix_valid_machine_count=2`
- target route-attempt CPU evidence includes `attempt_count`, `attempts[]`,
  `raw_exit_code`, timeout metadata, and summary/final-attempt agreement
- failed route attempts remain diagnostics only unless the route proof itself
  is release-grade

## Non-Goals

- Do not treat failed route attempts as successful route proof.
- Do not close hosted P2P/relay, support mailbox, or Store gates with CPU
  evidence.
- Do not move work execution into MUSU.PRO; local MUSU Desktop remains the
  executor.
