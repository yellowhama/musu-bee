# 2026-06-06 second-PC route-attempt target binding gate

Current release-gate hardening:

- Targeted `post-route` CPU evidence now requires `route_probe.command` and
  `route_probe.arguments` to bind the same target recorded in
  `route_probe.target`.
- Accepted argument forms are `--target <target>` and `--target=<target>`.
- A matrix whose target field is manually changed while command/arguments still
  point at another peer is rejected.
- Empty target cases remain ordinary verifier failures, not script crashes.

Validation:

- parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=73`,
  `failed_case_count=0`

Qualitative assessment:

- This closes another false-positive evidence gap in
  `runtime_cpu_second_pc_route_attempt`.
- It does not close the real second-PC route gate.
- MUSU Desktop remains the local executor; MUSU.PRO remains remote input,
  rendezvous, path-selection, relay-fallback, and evidence/control plane.

