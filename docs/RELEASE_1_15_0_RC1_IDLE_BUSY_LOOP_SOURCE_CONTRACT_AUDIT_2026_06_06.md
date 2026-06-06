# MUSU 1.15.0-rc.1 Idle Busy-Loop Source Contract Audit

Date: 2026-06-06

## Summary

`test-release-evidence-verifiers.ps1` now locks the go/no-go idle busy-loop
candidate summary as a source contract. This is verifier hardening only. It
does not change packaged runtime behavior, local execution, MUSU.PRO routing,
or relay transport.

The new source contract fails if `write-release-go-no-go.ps1` stops exposing
all eight idle busy-loop candidates, stops publishing
`idle_busy_loop_candidate_status`, or stops blocking on
`idle-busy-loop-candidates` when any candidate is not proven.

## Code Change

Added source-contract coverage for:

- `clipboard polling`
- `mDNS discovery`
- `health check retry loop`
- `bridge readiness wait loop`
- `frontend interval/refetch`
- `relay payload target poller`
- `cloud heartbeat`
- `log/telemetry flush loop`

The contract also checks representative proof hooks for opt-in gates, sleeps,
bounded backoff, cancellation-aware polling, direct frontend interval bans, and
absence of background telemetry/log flush worker primitives.

## Validation

- PowerShell parser check: pass
- release evidence verifier regression: `ok=true`, `case_count=57`,
  `failed_case_count=0`
- new verifier case:
  `go-no-go exposes all idle busy-loop candidate statuses`
- Rust background-loop contract: `ok=true`, `fail_count=0`,
  unaudited loops `0`, unaudited spawns `0`, telemetry flush primitives `0`,
  filesystem watcher primitives `0`, network watcher primitives `0`
- frontend polling contract: `ok=true`, `fail_count=0`,
  low-duty polling call sites `29`, direct intervals `0`,
  direct visibility listeners `0`
- P2P store-forward relay contract: `ok=true`, `fail_count=0`
- dirty-tree go/no-go with public metadata skipped:
  `idle_busy_loop_candidate_contract_verified=true`, candidate count `8`,
  failed candidate count `0`, `local_artifacts_ready=true`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`, public release ready `false`

## Qualitative Audit

No high or medium issue was found in this change.

The current local CPU story remains healthy for the sampled machine:
`HUGH_SECOND` has current `desktop-open` CPU evidence with hot process count
`0`, MUSU CPU `0`, owned Node helpers `0`, owned WebView2 helpers `6`, and
WebView2 max one-core CPU `0.18`. The repeated `localhost:3001` browser error
is still classified as an optional developer dashboard with no listener, not as
a failure of the installed local MUSU Desktop runtime.

The remaining risk is not a newly found local busy loop. It is external and
release-evidence related:

- second Windows PC route evidence is still missing
- second-PC `desktop-open` idle CPU evidence is still missing
- second-PC runtime CPU scenario matrix evidence is still missing
- hosted MUSU.PRO P2P evidence is not logged in from the packaged runtime
- hosted owner scope, release-grade relay lease storage, and relay tunnel proof
  remain incomplete
- support mailbox and Store/Partner Center evidence remain incomplete

## Product Spec Impact

The product boundary is unchanged:

- MUSU Desktop is the installed local executor and resource owner on each
  device.
- MUSU.PRO accepts remote user input and coordinates project/company rooms,
  presence, rendezvous, path selection, relay fallback policy, and evidence.
- Local MUSU programs perform the work and should use direct P2P mesh after
  bootstrap whenever available.
- Hosted relay remains fallback-only and cannot become the default data path.

The release spec is now tighter: idle busy-loop source coverage is no longer an
informal audit note. It is a release verifier source contract with an explicit
eight-candidate inventory.

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_IDLE_BUSY_LOOP_SOURCE_CONTRACT_AUDIT_2026_06_06.md`
