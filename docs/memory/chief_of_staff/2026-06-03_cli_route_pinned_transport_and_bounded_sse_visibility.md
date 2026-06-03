# 2026-06-03 CLI Route Pinned Transport And Bounded SSE Visibility

Date: 2026-06-03 18:31 KST

Base commit before this change:
`e878d78b454128f8b072b7710ba569db22958df8`

Summary:

- `musu route` now prefers HTTPS endpoints from resolved peer metadata and only
  records `tls_cert_fingerprint_pin` proof after an actual fingerprint-pinned
  HTTPS request path succeeds.
- The bridge forward path and CLI route path now share the same rustls
  fingerprint-pinned reqwest client helper in `musu-rs\src\bridge\tls_pin.rs`.
- `useBoundedEventSource` no longer registers a direct `visibilitychange`
  listener; visible reconnect checks flow through `useLowDutyPolling`.

Validation passed:

- Rust CLI route tests `17/17`
- Rust bridge forward tests `4/4`
- Rust route evidence tests `7/7`
- `cargo check --bin musu`
- `npm run test:runtime-polling` `14/14`
- frontend polling contract audit `ok=true`, `fail_count=0`
- `npm run typecheck`
- `npm run test:p2p` `35/35`

Release state:

- public release remains No-Go
- primary local artifacts and single-machine evidence still report true, but
  this runtime source change means fresh current-commit MSIX/smoke/CPU/matrix
  evidence is required before claiming packaged primary evidence as current
- P2P relay payload transport is still intentionally absent; release-grade
  multi-device evidence still requires QUIC/TLS proof
