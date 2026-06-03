# MUSU 1.15.0-rc.1 P2P Relay Route Evidence Gate - 2026-06-03

## Summary

Hosted P2P release evidence now requires owner-scoped, release-grade relay
route evidence before relay payload transport can count as wired.

The previous gate already rejected lease-only readiness by requiring
`relay_status.relay_transport_wired=true` and
`relay_leases.relay_transport_wired=true`. This change closes the remaining
false-positive path where an operator could set relay transport flags and
configure lease storage without proving that a real relay route carried payload.

## Changed Behavior

- `musu relay route-evidence --json` queries
  `GET /api/v1/p2p/route-evidence` with:
  - `route_kind=relay`
  - `result=success`
  - `release_grade=true`
- `record-p2p-control-plane-evidence.ps1` captures that CLI output as
  `relay_route_evidence`.
- `verify-p2p-control-plane-evidence.ps1` fails unless
  `relay_route_evidence` proves:
  - schema `musu.relay_route_evidence.v1`
  - logged-in owner-scoped query
  - `route_kind=relay`
  - `result=success`
  - `release_grade=true`
  - `count > 0`
  - `relay_transport_proven=true`
- `show-musu-pro-p2p-env-status.ps1` now reports
  `relay_route_evidence_ok`, `relay_route_evidence_count`, and
  `relay_payload_transport_proven`, and adds blocker
  `live_evidence_relay_route_not_proven`.

## Validation

- PowerShell parser passed for changed scripts.
- `cargo fmt --check` passed.
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- `cargo test --manifest-path .\musu-rs\Cargo.toml cloud::tests --lib -- --test-threads=1`
  passed `3/3`.
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  passed `14/14`.
- `npm run test:p2p` passed `28/28`.
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json` passed `19/19`.
- `git diff --check` passed.
- CLI smoke:
  `.\musu-rs\target\debug\musu.exe relay route-evidence --json` returns schema
  `musu.relay_route_evidence.v1` and currently fails closed with
  `route_evidence_kv_not_configured`.

## Fresh Live Evidence

Current-source live P2P evidence was recorded with:

```powershell
scripts\windows\record-p2p-control-plane-evidence.ps1 -MusuExe .\musu-rs\target\debug\musu.exe -AllowUnverified -Json
```

Artifacts:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.verification.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.summary.md`

Verification remains `ok=false`, `fail_count=13`.

Key fields:

- `relay_lease_store_backend=unconfigured`
- `relay_lease_store_release_grade=false`
- `relay_status_transport_wired=false`
- `relay_leases_transport_wired=false`
- `relay_route_evidence_ok=false`
- `relay_route_evidence_count=0`
- `relay_payload_transport_proven=false`
- `relay_transport_wired=false`

`show-musu-pro-p2p-env-status.ps1 -Json` now reports blockers:

- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`

## Release Interpretation

This is a release-gate fidelity improvement, not P2P completion.

Public P2P readiness now requires all of the following:

- release-grade KV/Upstash-backed owner-scoped relay lease storage
- relay transport implementation, not merely an env flag
- owner-scoped release-grade relay route evidence proving actual payload transit
- `relay_default_data_path=false`

Direct route evidence, two-machine CPU/matrix evidence, support mailbox proof,
and Store/Partner Center evidence remain separate public release blockers.

