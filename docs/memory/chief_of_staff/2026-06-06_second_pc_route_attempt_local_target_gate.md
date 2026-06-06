# 2026-06-06 second-PC route-attempt local target gate

Current release-gate hardening:

- `verify-runtime-cpu-scenario-matrix.ps1` now supports
  `-RejectLocalPostRouteTarget`.
- `write-release-go-no-go.ps1` uses that switch for
  `runtime_cpu_second_pc_route_attempt_*` verification.
- Localhost/loopback/local-only targets cannot satisfy targeted second-PC
  route-attempt CPU diagnostics.
- Rejected targets include `localhost`, `*.localhost`, `127.0.0.0/8`, `::1`,
  `0.0.0.0`, and `host.docker.internal`.
- Release verifier regression added
  `runtime matrix rejects localhost second-PC route attempt`.

Validation:

- parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=82`,
  `failed_case_count=0`
- direct remote-target diagnostic with local-target rejection: `ok=true`
- direct `127.0.0.1:2751` diagnostic with local-target rejection: `ok=false`,
  `fail_count=1`

Qualitative assessment:

- No high or medium issue found.
- This is false-positive prevention only.
- It does not create second-PC route evidence or reduce the two-machine CPU
  evidence requirement.
