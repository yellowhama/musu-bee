# MUSU 1.15.0-rc.1 Current HEAD Primary CPU Refresh After Process Ownership CLI Hardening

**Date**: 2026-06-07 03:05 KST
**Wiki ID**: wiki/911
**Machine**: `HUGH_SECOND`

## Summary

Current primary-machine CPU evidence was refreshed after process ownership
started excluding transient MUSU CLI commands from bridge runtime counts.

The current packaged MUSU Desktop runtime remains quiet on `HUGH_SECOND`.
The 20% idle busy-loop is not reproduced in the current local packaged app.
The remaining route blocker is still the unreachable `HUGH-MAIN` peer, not
`localhost:3001` and not a local MUSU Desktop runtime failure.

## Evidence

Clean `desktop-open` idle CPU evidence:

- path:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-024332-HUGH_SECOND.desktop-open.evidence.json`
- commit: `05904ae3cc714ae31984f11c56005718439e2335`
- `git_dirty=false`
- `sample_seconds=60.057`
- hot processes: `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.08`
- owned processes after sample: MUSU `2`, Node `0`, WebView2 `6`
- subroles: bridge runtime `1`, desktop shell `1`, WebView2 helpers `6`
- working set after sample: `361.49MB`
- private memory after sample: `180.69MB`

Clean runtime CPU scenario matrix:

- canonical matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-025704-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- target-route verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-025704-HUGH_SECOND.target-route.verification.json`
- full route-success verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-025704-HUGH_SECOND.verification.json`
- commit: `db4e0c8ef99dd2b75440a46c2d3da468dd57a72d`
- `git_dirty=false`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- matrix `ok=true`, `fail_count=0`
- dirty scenarios: none
- max one-core CPU across scenarios: MUSU `0`, Node `0`, WebView2 `0.18`
- max working set across scenarios: `361.4MB`
- route target: `HUGH-MAIN`
- route endpoint attempted: `http://192.168.1.192:8949/api/tasks/delegate`
- route result: timeout, `exit_code=1`
- wait prompt token and expected token match:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_025704`

Verifier interpretation:

- target-route CPU diagnostic verifier passed with `ok=true`,
  `fail_count=0` using `-AllowFailedPostRouteProbe`
- full route-success verifier failed with `ok=false`, `fail_count=1`
- the full verifier failure is exactly `post-route route probe`, because
  `HUGH-MAIN` did not return a successful route token

## Procedure Finding

The first matrix attempt in this refresh was intentionally discarded. It was
captured directly into `docs\evidence\runtime-cpu-scenarios`, so the first
generated scenario file made the repo dirty and later scenarios recorded
`git_dirty=true`.

Correct procedure for clean multi-scenario evidence:

1. start from a clean worktree;
2. let `measure-musu-runtime-cpu-scenarios.ps1` use its default
   `.local-build\runtime-cpu-scenarios\<stamp-machine>` output root;
3. use `-RoutePrompt "Return exactly {TOKEN}"` so the script-owned expected
   route token is also embedded in the actual `musu route --wait` prompt;
4. verify the `.local-build` matrix;
5. copy only the verified matrix and verification JSON into
   `docs\evidence`.

This is an evidence hygiene issue, not a runtime code issue.

## Validation

Passed:

- `git diff --check`
- target-route runtime CPU matrix verification with failed route allowed:
  `ok=true`, `fail_count=0`
- full route-success runtime CPU matrix verification failed as expected with
  `ok=false`, `fail_count=1`, failing only `post-route route probe`
- release evidence verifier regression:
  `ok=true`, `case_count=94`, `failed_case_count=0`
- MUSU local indexer:
  `2794 files`, `2776 symbols`, `15663 ms`

## Product Spec Update

The current product boundary remains:

- MUSU Desktop is the local executor and resource owner on each device.
- MUSU.PRO receives remote user input, hosts project/company rooms and AI
  meeting coordination, coordinates presence/rendezvous/path selection/relay
  fallback, and stores evidence.
- MUSU.PRO does not execute local work and does not become the default payload
  path.
- `localhost:3001` is optional developer/operator dashboard behavior, not the
  packaged desktop runtime contract.
- Failed manual LAN/HTTP bearer route attempts are diagnostic only.
- Release P2P still requires a reachable second machine, successful
  `musu.route_evidence.v1`, verified peer identity, hardened transport, route
  metadata, relay transport proof when relay is used, and payload delivery
  proof.

## Qualitative Audit

No high or medium code issue was found in this scoped audit.

No source code changed in this refresh. The only new problem found was an
operator evidence-capture pitfall: writing matrix output directly into tracked
`docs\evidence` makes later scenario samples dirty, and hand-building a route
token outside the script can drift from the script-owned expected token. Both
are now documented as process constraints.

The local packaged runtime is healthy and quiet:

- bridge registry points to PID `39876`
- bridge address is `127.0.0.1:1158`
- CPU remains far below the 5% one-core budget
- owned WebView2 process count stays within the `8` process budget
- no Node helper is owned by the packaged runtime in these samples

Residual risk remains external and evidence-bound:

- no successful second-PC route proof yet
- no two-machine idle CPU or full CPU matrix yet
- no hosted MUSU.PRO P2P/relay release proof yet
- no support mailbox proof yet
- no Store/Partner Center proof yet

## Release Status

Public release remains No-Go.

This refresh improves confidence that the current primary packaged desktop
runtime is not busy-looping after process ownership CLI hardening. It does not
close the second-PC, hosted P2P/relay, support, or Store gates.
