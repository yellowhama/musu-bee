# CoS Memory - Targeted Post-Route CPU Matrix Diagnostic

Date: 2026-06-03

Durable decision:

- `measure-musu-runtime-cpu-scenarios.ps1` now supports `-RouteTarget` and
  `-AllowFailedRouteProbe` for `post-route` CPU sampling after an explicit peer
  route attempt.
- `verify-runtime-cpu-scenario-matrix.ps1` now supports
  `-ExpectedPostRouteTarget` and `-AllowFailedPostRouteProbe`.
- `run-second-pc-release-check.ps1` forwards the same behavior through
  `-RuntimeCpuRouteTarget`, `-RuntimeCpuRoutePrompt`, and
  `-AllowFailedRuntimeCpuRouteProbe`.

Boundary:

- normal release matrix verification still requires a successful post-route
  probe
- allow-failed target route attempts are diagnostic CPU evidence only
- they do not close multi-device route proof, relay payload transport proof, or
  public release readiness

Validation:

- PowerShell parser check passed for changed scripts
- release evidence verifier regressions passed `22/22`
- `git diff --check` passed

Search terms:

- `RouteTarget`
- `AllowFailedRouteProbe`
- `ExpectedPostRouteTarget`
- `AllowFailedPostRouteProbe`
- `RuntimeCpuRouteTarget`
- `runtime-matrix-failed-target-route-attempt-allowed`
