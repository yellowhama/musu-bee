# Release 1.15.0-rc.1 HUGH-MAIN Route Attempt CPU Evidence - 2026-06-04

## Summary

Captured targeted CPU evidence after attempting a route to the configured
second-PC peer `HUGH-MAIN`.

This is not passing multi-device route evidence. `HUGH-MAIN` is currently
unreachable, so the route attempt timed out. The purpose of this evidence is to
prove the primary machine does not enter a busy-loop after a failed second-PC
route attempt.

## Evidence

Matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Post-route CPU sample:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.post-route.evidence.json`

Verification:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.target-route.verification.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.target-route.summary.md`

## Route Attempt

- target: `HUGH-MAIN`
- target address from peer config/status: `192.168.1.192:8949`
- route command shape: `musu route --target HUGH-MAIN --wait`
- route probe result: `ok=false`
- failure allowed for this targeted CPU evidence: `true`
- failure: request timeout to `http://192.168.1.192:8949/api/tasks/delegate`
- attempt count: `1`

## CPU Result

- matrix `ok=true`
- verifier `ok=true`, `fail_count=0`
- git commit: `b96eadd1b3792e5a3336efce9127c0d405b3c150`
- `git_dirty=false`
- sample: `60.058s`
- process counts: MUSU `2`, repo Node `1`, owned WebView2 `6`
- max one-core CPU: MUSU `0`, Node `0.05`, WebView2 `0.18`
- working set: `465.97MB`
- hot process count: `0`

## Interpretation

The primary machine stayed within the release idle CPU budget after a failed
second-PC route attempt. This supports the busy-loop investigation for the
specific route-failure case, but it does not replace the required second-PC
multi-device route success, second-PC idle CPU, or second-PC full runtime matrix
evidence.

## Remaining Release Blockers

- real second-PC multi-device route evidence
- second-PC `desktop-open` runtime idle CPU evidence
- second-PC five-state runtime CPU scenario matrix
- hosted `musu.pro` P2P relay proof
- operator-verified `musu@musu.pro` support mailbox delivery
- Partner Center / Store release evidence
