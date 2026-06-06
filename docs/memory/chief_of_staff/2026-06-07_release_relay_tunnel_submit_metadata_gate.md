# 2026-06-07 - Release Relay Tunnel Submit Metadata Gate

Decision: Rust `submit_release_relay_tunnel_payload(...)` now requires release
payload metadata before reaching the fail-closed
`release_relay_tunnel_runtime_not_implemented` branch.

Required metadata:

- `source_node_id`
- `target_node_id`
- `tunnel_id`
- `payload_kind=forwarded_task_envelope`
- 64-hex `payload_sha256`

Why: the local runtime release tunnel hook should match the hosted
`/api/v1/relay/payload` preflight contract. Future `quic_relay_tunnel`
implementation should not inherit a looser runtime-side submit path.

Validation:

- Rust release relay tunnel tests passed `5/5`
- P2P relay contract audit passed `ok=true`, `fail_count=0`
- release verifier passed `case_count=104`, `failed_case_count=0`
- `git diff --check` passed

Release status: source-contract hardening only. Release tunnel runtime remains
unimplemented, hosted P2P remains No-Go, and packaged local desktop evidence
must be refreshed after this Rust source change lands.
