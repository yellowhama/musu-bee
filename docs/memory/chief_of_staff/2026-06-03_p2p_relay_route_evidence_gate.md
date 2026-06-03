# Chief of Staff Memory - P2P Relay Route Evidence Gate - 2026-06-03

Durable decision: hosted P2P release evidence must require owner-scoped
release-grade relay route evidence, not only relay transport flags and relay
lease storage.

Implementation:

- Rust CLI adds `musu relay route-evidence --json`.
- The command queries `/api/v1/p2p/route-evidence` with
  `route_kind=relay`, `result=success`, and `release_grade=true`.
- `record-p2p-control-plane-evidence.ps1` stores the command output as
  `relay_route_evidence`.
- `verify-p2p-control-plane-evidence.ps1` now fails unless route evidence
  proves `count > 0` and `relay_transport_proven=true`.
- `show-musu-pro-p2p-env-status.ps1` adds
  `live_evidence_relay_route_not_proven`.

Validation: PowerShell parser passed, `cargo fmt --check`, `cargo check --bin
musu`, cloud tests `3/3`, install CLI tests `14/14`, `npm run test:p2p`
`28/28`, release evidence verifier regressions `19/19`, and `git diff
--check` passed.

Fresh live evidence `20260603-093640-musu.pro` remains false with
`fail_count=13`: KV/Upstash storage is unconfigured, relay status/leases
transport wired fields are false, and `relay_route_evidence_count=0` with
`relay_payload_transport_proven=false`.

Release interpretation: this blocks env-only relay readiness claims. Public
release still needs actual relay/tunnel payload transport, owner-scoped
release-grade relay route evidence, two-machine route/CPU/matrix evidence,
support mailbox proof, and Store/Partner Center proof.

