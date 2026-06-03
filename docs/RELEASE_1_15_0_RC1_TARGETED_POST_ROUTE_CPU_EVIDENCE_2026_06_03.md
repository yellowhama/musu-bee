# MUSU 1.15.0-rc.1 Targeted Post-Route CPU Evidence

Date: 2026-06-03
Wiki ID: wiki/620

## Summary

Captured a clean 60s `post-route` runtime CPU sample immediately after an
explicit target route attempt to the registered peer `HUGH-MAIN`.

This is diagnostic CPU attribution evidence. It proves the runtime stays under
the CPU/resource budget after a bounded failed route attempt. It does not prove
multi-device route success and does not close the public multi-device release
gate.

## Evidence

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- post-route CPU sample:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.post-route.evidence.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.targeted-post-route.verification.json`

Run shape:

- source commit: `d26a2b78e3a8684e124aade5108887e261089487`
- git clean during matrix: `true`
- scenario: `post-route`
- route target: `HUGH-MAIN`
- route command:
  `musu route --target HUGH-MAIN --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260603_145454"`
- route output timed out against
  `http://192.168.1.192:8949/api/tasks/delegate`
- route token found: `false`
- route failure allowed: `true`

CPU/resource result:

- sample duration: `60.049s`
- hot process count: `0`
- max one-core CPU:
  - MUSU: `0`
  - Node: `0`
  - WebView2: `0.10`
  - other: `0`
- process counts:
  - MUSU: `2`
  - Node: `0`
  - WebView2: `6`
  - other: `0`
- total working set after sample: `402.69MB`

Verifier result:

- `ok=true`
- `fail_count=0`
- required scenarios: `post-route`
- expected post-route target: `HUGH-MAIN`
- allow failed post-route probe: `true`

Cleanup:

- `musu down --json --timeout-sec 5 --include-desktop` returned `ok=true`
- stopped bridge PID `29652`
- stopped desktop shell PID `37956`
- no desktop shell PID remained after cleanup

## Harness Hardening

The diagnostic run surfaced a release-harness edge: route output can contain a
clear error/timeout while the matrix helper only failed fast on process exit
code. The matrix helper now also fails normal route probes when the expected
per-run token is missing.

Normal release matrix behavior:

- nonzero route exit: fail before sampling
- missing expected route token: fail before sampling
- successful token-bearing route: sample normally

Diagnostic behavior:

- `-AllowFailedRouteProbe` keeps the bounded failed target attempt and then
  samples CPU
- verifier accepts it only when `-AllowFailedPostRouteProbe` is supplied and
  the expected target matches

## Release Boundary

This evidence is useful for the busy-loop objective because it proves the local
runtime/WebView2 process set stays within budget after a failed second-PC route
attempt.

It does not replace any of these public release blockers:

- real second-PC runtime idle CPU evidence
- full two-machine runtime CPU scenario matrix
- successful multi-device route evidence
- hosted relay payload transport proof
- support mailbox evidence
- Store/Partner Center evidence
