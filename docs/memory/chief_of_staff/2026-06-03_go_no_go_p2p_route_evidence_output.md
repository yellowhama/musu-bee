# Chief of Staff Memory - Go/No-Go P2P Route Evidence Output - 2026-06-03

Durable decision: top-level release go/no-go output must expose hosted P2P
relay route evidence proof, not only lease/transport readiness.

`write-release-go-no-go.ps1` now includes:

- `p2p_owner_scope_verified`
- `p2p_relay_lease_store_release_grade`
- `p2p_relay_transport_wired`
- `p2p_relay_route_evidence_ok`
- `p2p_relay_route_evidence_count`
- `p2p_relay_payload_transport_proven`

The `p2p-control-plane` blocker now requires owner-scoped release-grade relay
lease storage, `relay_default_data_path=false`, `relay_transport_wired=true`,
and owner-scoped release-grade relay route evidence with
`relay_payload_transport_proven=true` and `count > 0`.

Current output remains No-Go with `p2p_relay_route_evidence_count=0` and
`p2p_relay_payload_transport_proven=false`.

Validation passed: PowerShell parser, `git diff --check`, JSON and non-JSON
go/no-go output checks, and release evidence verifier regressions `19/19`.

