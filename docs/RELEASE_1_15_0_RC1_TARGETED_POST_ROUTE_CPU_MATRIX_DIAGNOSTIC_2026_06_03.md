# MUSU 1.15.0-rc.1 Targeted Post-Route CPU Matrix Diagnostic

Date: 2026-06-03
Wiki ID: wiki/618

## Summary

The runtime CPU scenario matrix now supports a targeted post-route attempt so
operators can capture CPU behavior immediately after a bounded route attempt to
a named peer.

Before this change, the `post-route` matrix preparation only ran:

```powershell
musu route --wait <prompt>
```

That proved CPU after a generic route probe, but it did not preserve whether the
sample followed an explicit second-PC route attempt. The release gate now has a
diagnostic path for that gap without weakening the normal successful route
probe requirement.

## Contract

New measurement flags:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 `
  -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route `
  -SampleSeconds 60 `
  -OpenDesktopApp `
  -RunRouteProbe `
  -RouteTarget PRIMARY-PC `
  -AllowFailedRouteProbe `
  -Json
```

New verifier flags:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 `
  -EvidencePath <MATRIX_JSON> `
  -RequirePostRouteProbe `
  -ExpectedPostRouteTarget PRIMARY-PC `
  -AllowFailedPostRouteProbe `
  -Json
```

New second-PC wrapper flags:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 `
  -RuntimeCpuRouteTarget PRIMARY-PC `
  -AllowFailedRuntimeCpuRouteProbe
```

The matrix `route_probe` object now records `target`, `command`, `arguments`,
`exit_code`, `stdout`, `stderr`, combined `output`, `ok`, and
`failure_allowed`.

Normal route probes also fail when the expected per-run route token is missing,
even if the process exit code is ambiguous. `-AllowFailedRouteProbe` is the
only path that permits sampling after a failed or token-missing target attempt.

## Release Boundary

The normal release matrix without `-AllowFailedRouteProbe` still fails before
sampling when the route command exits nonzero, and the verifier still requires a
successful post-route probe.

`-AllowFailedRouteProbe` is diagnostic only. It lets the matrix record CPU after
a failed but explicit target route attempt. It does not prove multi-device route
success, does not prove relay payload transport, and does not close the
multi-device release gate.

## Validation

- PowerShell parser check passed for the changed release scripts.
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json` passed with
  `ok=true`, `case_count=22`, and `failed_case_count=0`.
- Added verifier regression coverage:
  - allowed failed target route attempt passes only with
    `-AllowFailedPostRouteProbe`
  - expected target mismatch fails
- `git diff --check` passed.

## Targeted Evidence Follow-Up

Follow-up evidence was captured after this diagnostic path landed:

- report:
  `docs\RELEASE_1_15_0_RC1_TARGETED_POST_ROUTE_CPU_EVIDENCE_2026_06_03.md`
- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.targeted-post-route.verification.json`

The `HUGH-MAIN` route attempt timed out, then the local runtime/WebView2 process
set was sampled for `60.049s` with hot process count `0`, MUSU CPU `0`, Node
CPU `0`, WebView2 CPU `0.10`, and working set `402.69MB`.

## Current Release State

This change is release-gate tooling and documentation only. The latest primary
machine evidence remains the post relay transport proof refresh:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-141358-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-141524-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-141712-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted P2P release-grade relay payload proof, support mailbox evidence, and
Store evidence are complete.
