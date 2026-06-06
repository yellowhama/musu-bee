# MUSU 1.15.0-rc.1 P2P Env Runtime Login Remediation

Date: 2026-06-06

## Summary

`show-musu-pro-p2p-env-status.ps1` now classifies the latest hosted P2P
evidence root cause `not_logged_in` as
`live_evidence_p2p_runtime_not_logged_in` instead of `live_evidence_unknown`.

The status output also exposes the four runtime login checks directly:

- `relay_status_logged_in`
- `relay_transport_logged_in`
- `relay_leases_logged_in`
- `relay_route_evidence_logged_in`

This makes the next operator action explicit: log in the packaged WindowsApps
MUSU runtime and rerun hosted P2P evidence. The localhost developer dashboard is
not part of this release gate.

## Current Output

Current env status against `https://musu.pro` reports:

- `ok=false`
- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.evidence.json`
- `error=not_logged_in`
- `error_class=p2p_runtime_not_logged_in`
- blocker: `live_evidence_p2p_runtime_not_logged_in`
- relay status/transport/leases/route evidence logged in: `False`
- relay lease store configured/release-grade: `False`
- relay transport descriptor/connect/payload endpoints wired: `False`

The emitted next steps now include:

- log in through the packaged WindowsApps alias:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
- do not use the localhost developer dashboard to satisfy this gate
- rerun `record-p2p-control-plane-evidence.ps1 -BaseUrl https://musu.pro -Json`
- confirm relay status, transport, leases, and route evidence all report
  `logged_in=true`

## Validation

- PowerShell parser check: pass
- `git diff --check`: pass
- env status JSON output: pass
- release evidence verifier regression: `ok=true`, `case_count=56`,
  `failed_case_count=0`
- new source contract:
  `P2P env status exposes runtime login remediation`

## Assessment

No high or medium issue was found. This is release tooling hardening: it does
not close the hosted P2P gate, but it turns the latest blocker into a concrete
operator action.

Product boundary remains unchanged:

- MUSU Desktop executes work locally.
- MUSU.PRO accepts remote input and coordinates rooms, rendezvous, path
  selection, relay fallback, and evidence.
- The packaged runtime login token is required for hosted P2P control-plane
  proof.
- The localhost developer dashboard is not a release dependency.
