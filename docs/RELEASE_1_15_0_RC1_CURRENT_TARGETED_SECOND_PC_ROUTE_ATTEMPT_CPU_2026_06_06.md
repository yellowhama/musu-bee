# MUSU 1.15.0-rc.1 Current Targeted Second-PC Route-Attempt CPU Evidence

**Wiki ID**: wiki/859
**Date**: 2026-06-06 KST

## Summary

Current HEAD `0fb31ddff5fef4704104ca364fff92632627e4e3` now has a fresh
targeted route-attempt CPU matrix for `HUGH-MAIN`.

This is not successful two-machine route proof. The route attempt to
`HUGH-MAIN` still times out at `http://192.168.1.192:8949/api/tasks/delegate`.
The evidence proves the current packaged desktop stays under idle CPU budget
after that targeted second-PC route attempt fails.

## Evidence

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-173706-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-173706-HUGH_SECOND.target-route.verification.json`
- verifier result: `ok=true`, `fail_count=0`
- scenario: `post-route`
- target: `HUGH-MAIN`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_173706`
- route result: `ok=false`, `failure_allowed=true`
- failure: request to `http://192.168.1.192:8949/api/tasks/delegate` timed out

Post-route CPU:

- sample: `60.036s`
- process counts: MUSU `2`, Node `0`, WebView2 `6`
- subroles: `bridge_runtime=1`, `desktop_shell=1`, `webview2_helper=6`
- max one-core CPU: MUSU `0.03`, Node `0`, WebView2 `0.03`
- subrole max: bridge runtime `0.03`, desktop shell `0`, WebView2 helper
  `0.03`
- working set: `356.6MB`
- hot process count: `0`
- resource budget violations: none

## Interpretation

This closes the stale current-HEAD targeted route-attempt CPU evidence gap for
the local machine. It does not close the true second-PC gate:

- real second-PC multi-device evidence is still missing
- second-PC desktop-open CPU evidence is still missing
- second-PC five-scenario matrix evidence is still missing
- successful P2P route evidence is still missing

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, AI meeting room, presence, rendezvous, path selection,
relay fallback coordination, and evidence/control plane.
