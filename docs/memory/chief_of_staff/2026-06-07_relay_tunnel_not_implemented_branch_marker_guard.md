# 2026-06-07 Relay Tunnel Not-Implemented Branch Marker Guard

P2P env status was hardened so release tunnel hook presence cannot be mistaken
for runtime readiness.

Changed:

- `show-musu-pro-p2p-env-status.ps1` reports
  `release_relay_tunnel_runtime_not_implemented_branch_active`.
- A future `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true` marker flip conflicts with
  source when the not-implemented branch remains active.
- `test-release-evidence-verifiers.ps1` locks the guard and next-step wording.

Current status:

- P2P env status expected No-Go, `ok=false`, blocker count `11`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- marker conflict currently false because the runtime marker remains false

Validation:

- release verifier `ok=true`, `case_count=105`, `failed_case_count=0`
- P2P relay contract audit `ok=true`, `fail_count=0`
- `git diff --check`

Product/spec boundary remains unchanged: MUSU.PRO coordinates remote input,
rooms, rendezvous, path selection, relay fallback, and evidence; MUSU Desktop
executes locally and must implement the actual `quic_relay_tunnel` byte path
before release relay readiness can pass.
