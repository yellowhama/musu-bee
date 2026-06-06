# MUSU 1.15.0-rc.1 Route Reachability Diagnostic Tooling

**Date**: 2026-06-07 01:47 KST
**Machine**: `HUGH_SECOND`

## Summary

Route reachability diagnostics are now reusable tooling instead of one-off
manual notes.

Added:

- `scripts\windows\record-route-reachability-diagnostic.ps1`
- `scripts\windows\verify-route-reachability-diagnostic.ps1`

The recorder captures packaged MUSU status, route explain/path selection,
TCP/ping/neighbor reachability, raw `musu.route_evidence.v1` route-attempt
evidence, command captures, and an explicit conclusion that failed/manual HTTP
routes are not successful multi-device proof.

The verifier accepts failed non-local peer diagnostics and rejects local-only
targets or fake successful route proof.

## Release Boundary

This is diagnostic tooling only. It does not close the multi-device release
gate and it does not make a failed route attempt release-grade P2P evidence.

It prevents the opposite failure: treating `localhost`, a manual HTTP bearer
candidate, a neighbor/ARP entry, or a missing peer as if it were two-machine
route proof.

## Validation

- PowerShell parser checks: pass
- existing committed HUGH-MAIN diagnostic:
  `docs\evidence\route-diagnostics\1.15.0-rc.1\20260607-011750-HUGH_SECOND-HUGH_MAIN.route-reachability-diagnostic.json`
  verified with `ok=true`, `fail_count=0`
- recorder smoke with `-SkipRouteAttempt`: captured `HUGH-MAIN`, TCP `false`
- recorder full smoke: captured `HUGH-MAIN`, TCP `false`, route result
  `failed`, failure `submit_http_error`
- generated full smoke evidence verified with `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=true`, `case_count=90`,
  `failed_case_count=0`

New regression coverage:

- `route reachability recorder captures status explain network and route evidence`
- `route reachability accepts failed non-local peer diagnostic`
- `route reachability rejects local-only target diagnostic`
- `route reachability rejects fake successful route proof`

## Qualitative Audit

No high or medium issue was found.

The change is scoped to release tooling, status-only freshness classification,
and release documentation. It does not alter runtime routing behavior, relay
transport, local CPU loops, or packaged desktop startup behavior.

## Next Step

Use the recorder as the first step in second-PC recovery:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-route-reachability-diagnostic.ps1 -Target HUGH-MAIN -Json
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-route-reachability-diagnostic.ps1 -EvidencePath <diagnostic.json> -ExpectedTarget HUGH-MAIN -RequireNonLocalTarget -Json
```

If the diagnostic still shows TCP `false`, peer `healthy=false`, or
`none_http_bearer`, fix the second-PC install/port/firewall/identity path
before rerunning two-machine route and CPU matrix evidence.
