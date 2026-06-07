# 2026-06-07 Current-HEAD Target Route CPU Matrix Selection Gate

Current HEAD `c71915aa86b94241cbd12d53b88c303c324a599b` has fresh
`HUGH_SECOND` CPU evidence for the full runtime CPU scenario matrix after a
targeted second-PC route attempt.

Evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- per-scenario evidence for `startup-open`, `runtime-started`,
  `dashboard-open`, `desktop-open`, and `post-route`
- five-state verifier:
  `20260607-122313-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- targeted post-route verifier:
  `20260607-122313-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`

Result:

- all five 60s samples passed <=5% of one logical core
- MUSU max CPU stayed `0` in all scenarios
- Node process count stayed `0`
- WebView2 process count stayed `6`
- highest WebView2 one-core CPU was `0.16`
- hot process count stayed `0`
- route target was `HUGH-MAIN`
- route attempt failed with timeout to
  `http://192.168.1.192:8949/api/tasks/delegate`
- failure was explicitly allowed for route-attempt CPU evidence

Go/no-go selection hardening:

- `write-release-go-no-go.ps1` now keeps latest candidates, complete
  five-state candidates, and target-bearing post-route candidates in runtime
  CPU scenario selection.
- `candidate_selection` is
  `latest-per-machine-up-to-12-plus-complete-scenario-and-target-route-candidates`.
- `test-release-evidence-verifiers.ps1` source-checks the contract.

Validation:

- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `case_count=104`,
  `failed_case_count=0`
- pre-commit `write-release-go-no-go.ps1 -Json`: completed, still No-Go on
  second-PC/multi-device/P2P/support/Store blockers
- `git diff --check`: passed

Search terms: `GOAL v796`, `wiki/971`, `current-head target route CPU matrix`,
`20260607-122313-HUGH_SECOND.current-head-target-route`,
`HUGH-MAIN timeout`, `candidate_selection`,
`complete-scenario-and-target-route-candidates`, `WebView2 0.16`,
`MUSU max 0`, `Node 0`, `hot process count 0`.
