# 2026-06-06 Runtime Relay Candidate Coverage Carry

Runtime relay fallback evidence now carries the hosted verifier's candidate
coverage contract.

What changed:

- Rust rendezvous stores `candidate_route_kinds` in selected peer metadata.
- Rust forwarding attempts ordered direct candidates before relay fallback.
- `RouteRelayFallbackEvidence` includes `candidate_route_kinds`.
- Relay payload enqueue/store/claim/delivery preserves
  `candidate_route_kinds` and `attempted_route_kinds`.
- Target-side relay delivery route evidence reuses the stored route metadata
  instead of emitting `["failed","relay"]`.
- The P2P relay contract audit checks web and Rust source coverage.

Validation passed:

- Rust route evidence tests 14/14
- Rust relay payload tests 24/24
- Rust rendezvous tests 6/6
- Rust router candidate test 1/1
- `cargo check --bin musu`
- P2P tests 111/111
- `npm run typecheck`
- P2P relay contract audit ok
- release verifier 66/66

Product boundary:

MUSU Desktop remains the local executor. MUSU.PRO remains remote input, room,
rendezvous, path-selection, relay fallback, and evidence/control plane. This
does not implement release relay tunnel transport.
