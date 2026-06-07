# CoS Memory - Release Relay Payload Route Evidence Recorder

Rust route evidence now has
`record_release_relay_payload_delivery_route_evidence(...)` for the future
release relay tunnel runtime.

Durable decisions:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains the remote input, room, rendezvous, path-selection, relay
  lease, evidence, notification, and policy control plane.
- Release relay route evidence must bind route metadata, transport proof, and
  payload delivery proof in one record.
- Relay lease issuance and preview queue delivery are not release-grade payload
  transit proof.
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` and
  `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` remain correct.

Validation passed:

- Rust route evidence tests `16/16`
- `cargo check --manifest-path musu-rs\Cargo.toml --bin musu -j 1`
- P2P relay contract audit `ok=true`, `fail_count=0`
- P2P env status expected `ok=false`
- release verifier `ok=true`, `case_count=105`, `failed_case_count=0`
- `git diff --check`

Next steps:

- implement the real `quic_relay_tunnel` byte path;
- wire successful runtime delivery to the recorder;
- capture live owner-scoped MUSU.PRO relay route metadata, transport proof,
  and payload delivery proof;
- refresh packaged local evidence after runtime source changes.
