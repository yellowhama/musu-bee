# 2026-06-06 idle busy-loop source contract audit

`test-release-evidence-verifiers.ps1` now includes the source contract
`go-no-go exposes all idle busy-loop candidate statuses`.

It locks the `write-release-go-no-go.ps1` idle candidate inventory at eight:

- clipboard polling
- mDNS discovery
- health check retry loop
- bridge readiness wait loop
- frontend interval/refetch
- relay payload target poller
- cloud heartbeat
- log/telemetry flush loop

Validation:

- parser check passed
- release evidence verifier regression passed `57/57`
- Rust background-loop audit passed with unaudited loops/spawns/network watcher
  primitives/telemetry flush primitives all `0`
- frontend polling audit passed with direct intervals `0`
- P2P store-forward relay audit passed
- dirty-tree go/no-go showed
  `idle_busy_loop_candidate_contract_verified=true`, candidate count `8`, and
  failed candidate count `0`

Qualitative audit found no high/medium issue. This is verifier-only hardening.
It does not change packaged runtime behavior or close the second-PC, hosted
P2P, support mailbox, or Store gates.
