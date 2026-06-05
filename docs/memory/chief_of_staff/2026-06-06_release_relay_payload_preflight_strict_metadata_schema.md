# 2026-06-06 release relay payload preflight strict metadata schema

## Decision

`/api/v1/relay/payload` must be strict metadata-only while
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.

## What changed

- Request schema changed from passthrough to strict.
- Optional request schema literal added:
  `musu.relay_payload_preflight_request.v1`.
- Accepted fields are limited to lease/session/source/target/tunnel metadata,
  optional `payload_kind`, and optional 64-hex `payload_sha256`.
- Known payload byte fields still fail first with
  `release_payload_bytes_not_accepted`.
- Unknown fields fail with `invalid_relay_payload_preflight_request`.
- P2P relay contract audit now gates `.strict()` and unknown-field regression
  coverage.

## Validation

- `npm run test:p2p`: `90/90`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=true`, `case_count=45`,
  `failed_case_count=0`
- P2P env status recheck: expected `ok=false` on release relay payload
  endpoint, KV/Upstash, live relay route, and relay payload delivery proof
  blockers

## Product status

This is release-boundary hardening only. It does not implement release relay
payload transport and does not close hosted P2P, second-PC, support mailbox, or
Store blockers.
