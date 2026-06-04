# 2026-06-04 Relay Connect and Queue Status Split

Relay status now separates release-grade relay connect transport from the
non-release-grade preview queue:

- `relay_connect_endpoint_wired=false`
- `relay_payload_endpoint_wired=false`
- `relay_payload_queue_endpoint_wired=true`
- `relay_transport_wired=false`
- `relay_default_data_path=false`

Updated Next relay transport/lease/connect responses, Rust cloud DTOs,
`musu relay status --json`, `musu relay transport --json`, and
`record-p2p-control-plane-evidence.ps1`.

Validation passed `npm run test:p2p` `62/62`, `npm run typecheck`, Rust fmt,
targeted Rust relay status test `1/1`, `cargo check --bin musu`, PowerShell
parser check, and `git diff --check`.

This is status/evidence clarity only. It does not implement release-grade
`/api/v1/relay/connect` transport, and fresh packaged primary evidence is
required after commit because runtime/web/Rust source changed.
