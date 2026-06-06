# 2026-06-06 second-PC route-attempt self-target gate

Current release-gate hardening:

- `verify-runtime-cpu-scenario-matrix.ps1` gained
  `-RejectSelfPostRouteTarget`.
- The verifier fails a targeted `post-route` route probe when
  `route_probe.target == operator_machine`.
- `write-release-go-no-go.ps1` now applies that option to
  `runtime_cpu_second_pc_route_attempt_*` verification.
- `test-release-evidence-verifiers.ps1` adds the negative regression
  `runtime matrix rejects self-target second-PC route attempt`.

Validation:

- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=71`,
  `failed_case_count=0`

Qualitative assessment:

- This closes a false-positive evidence gap.
- It does not prove second-PC connectivity.
- The product boundary remains MUSU Desktop as the local executor and MUSU.PRO
  as remote input/control-plane/rendezvous/path-selection/relay-fallback
  coordinator.

