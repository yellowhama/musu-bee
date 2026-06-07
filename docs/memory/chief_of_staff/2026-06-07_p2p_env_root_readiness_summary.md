# 2026-06-07 P2P Env Root Readiness Summary

P2P env status JSON now exposes release relay source/runtime readiness as
root-level fields as well as under `source`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_ENV_ROOT_READINESS_SUMMARY_2026_06_07.md`

Changed:

- `scripts\windows\show-musu-pro-p2p-env-status.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Current status remains expected No-Go:

- `ok=false`
- blocker count `11`
- `release_relay_payload_endpoint_implemented=false`
- `release_payload_preflight_endpoint_implemented=true`
- `release_tunnel_payload_endpoint_missing=true`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `preview_store_forward_payload_queue_non_release_grade=true`
- `relay_transport_kind=quic_relay_tunnel`
- `relay_transport_kind_release_grade=true`

Validation:

- `git diff --check`
- P2P env root-field smoke passed
- P2P relay/store-forward contract audit `ok=true`, `fail_count=0`
- release verifier `ok=true`, `case_count=105`, `failed_case_count=0`

Release meaning:

- no release marker was flipped;
- release payload byte transport remains unimplemented;
- release tunnel runtime remains unimplemented;
- preview store-forward queue remains non-release-grade;
- public release remains No-Go.

Search terms should include `GOAL v823`, `wiki/998`,
`P2P env root readiness summary`,
`release_relay_tunnel_runtime_source_contract_ready=true`,
`release_relay_tunnel_runtime_not_implemented_branch_active=true`,
`release_relay_payload_endpoint_implemented=false`,
`preview_store_forward_payload_queue_non_release_grade=true`, and
`case_count=105`.
