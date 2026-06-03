# 2026-06-04 Relay Payload Queue Runtime Hook

Rust fallback runtime now enqueues a forwarded-task payload envelope after
direct forwarding fails and `musu.pro` issues a relay lease.

Changed source:

- `musu-rs/src/bridge/handlers/forward.rs`
- `musu-rs/src/bridge/rendezvous.rs`
- `musu-rs/src/bridge/route_evidence.rs`
- `musu-rs/src/cloud/mod.rs`
- `musu-rs/Cargo.toml`
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`

Runtime behavior:

- direct peer routing is still attempted first
- relay payload queueing only runs after direct failure and issued relay lease
- `ForwardedTask` is serialized to JSON, base64-encoded, SHA-256 hashed, and
  submitted to `POST /api/v1/p2p/relay/payload`
- queued evidence records `payload_transport_attempted=true`,
  `payload_transport_proven=false`, and
  `relay_target_polling_not_implemented`
- queue failures record attempted-but-not-proven bounded status classes
- no issued lease still records payload attempt false

Validation:

- forward tests passed 6/6
- rendezvous tests passed 5/5
- cloud tests passed 5/5
- `cargo check --bin musu` passed
- `npm run test:p2p` passed 51/51
- `npm run typecheck` passed
- Rust fmt check passed
- `git diff --check` passed

Interpretation: this removes the runtime "lease issued but payload queue not
attempted" gap for queued fallback preview. It is not release-grade relay
transport; target-side polling/execution and QUIC/TLS transport proof are still
missing, so public release remains No-Go and current packaged evidence is stale
until rebuilt.
