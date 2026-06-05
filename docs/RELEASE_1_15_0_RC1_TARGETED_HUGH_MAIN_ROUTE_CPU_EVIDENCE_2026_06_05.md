# Release 1.15.0-rc.1 - Targeted HUGH-MAIN Route CPU Evidence

Date: 2026-06-05
Wiki ID: wiki/742

## Summary

Captured a targeted HUGH-MAIN `post-route` runtime CPU scenario on
HUGH_SECOND after the login-checklist localhost fix and fresh packaged
evidence refresh.

The registered peer exists as `HUGH-MAIN` at `192.168.1.192:8949`, but the
route attempt timed out. That is still not successful multi-device evidence.
This evidence only proves the installed local runtime does not enter a busy
CPU loop after a bounded targeted second-PC route attempt fails.

## Evidence

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-163936-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- post-route CPU sample:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-163936-HUGH_SECOND.post-route.evidence.json`
- target verifier:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-163936-HUGH_SECOND.target-route.verification.json`
- summary:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-163936-HUGH_SECOND.target-route.summary.md`

Run shape:

- source commit: `07d6951cdecfcb7f7808b7196f576c4434e5ffd1`
- evidence commit: `8283453778e82e4540a11a8354b3b11b133232d7`
- git clean during matrix: `true`
- route target: `HUGH-MAIN`
- route command:
  `musu route --target HUGH-MAIN --wait-timeout-sec 180 --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260605_163936"`
- route output timed out against
  `http://192.168.1.192:8949/api/tasks/delegate`
- route failure allowed: `true`
- verifier `ok=true`, `fail_count=0`
- expected post-route target: `HUGH-MAIN`

CPU/resource result after the failed target route attempt:

- sample duration: `60.034s`
- hot process count: `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0`, other `0`
- process counts: MUSU `1`, Node `0`, WebView2 `0`, other `0`
- working set after sample: `21.59MB`

## Go/No-Go

Clean go/no-go after committing the targeted evidence reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- runtime idle CPU `1/2`
- runtime CPU scenario matrix `1/2`
- targeted second-PC route CPU attempt `1/1`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=false`

Remaining blockers:

- real second-PC multi-device evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO P2P release proof
- `musu@musu.pro` support mailbox delivery evidence
- Store/Microsoft submission/certification evidence

## Boundary

This closes only the diagnostic release gate that asked for a post-route CPU
sample after a targeted second-PC route attempt. It does not prove P2P routing
success, second-PC runtime health, or MUSU.PRO relay/control-plane readiness.
