# 2026-06-06 Current Targeted Second-PC Route-Attempt CPU

Current HEAD `0fb31ddff5fef4704104ca364fff92632627e4e3` has fresh targeted
`HUGH-MAIN` route-attempt CPU evidence:

- matrix: `20260606-173706-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification: `20260606-173706-HUGH_SECOND.target-route.verification.json`
- verifier: `ok=true`, `fail_count=0`
- target: `HUGH-MAIN`
- route result: `ok=false`, `failure_allowed=true`
- failure: timeout to `http://192.168.1.192:8949/api/tasks/delegate`
- post-route CPU: MUSU `0.03`, Node `0`, WebView2 `0.03`
- working set: `356.6MB`
- hot process count: `0`

This is not real two-machine success. It proves the current packaged local
runtime remains resource-budget-safe after a targeted failed second-PC route
attempt.
