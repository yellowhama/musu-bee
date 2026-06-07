Decision: P2P relay source descriptor now targets the release tunnel kind while
payload transport remains closed.

- `RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `source_relay_transport_kind_not_release_grade` is no longer in current P2P
  env blockers.

Current P2P env status remains No-Go on release payload endpoint, release
tunnel runtime, non-release preview queue, hosted KV/Upstash storage, runtime
login, relay route proof, route metadata, transport proof, and payload delivery
proof.

Validation passed P2P tests `112/112`, typecheck, P2P relay contract audit,
P2P env status expected No-Go, release verifier `104/104`, and
`git diff --check`.

Search terms: `P2P relay transport descriptor target kind`,
`RELAY_TRANSPORT_KIND=quic_relay_tunnel`,
`relay_transport_kind_release_grade=true`,
`source_release_relay_payload_endpoint_not_implemented`,
`source_release_relay_tunnel_runtime_not_implemented`, `wiki/975`.
