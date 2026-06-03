# 2026-06-04 Relay Payload Query Client CLI

Added Rust on-demand visibility into the lease-bound relay payload queue:

- `P2pRelayPayloadQuery`
- `P2pRelayPayloadQueryResponse`
- optional `payload_base64` parsing on relay payload records
- `MusuCloud::query_relay_payloads(...)`
- `musu relay payloads`

CLI filters:

- `--limit`
- `--session-id`
- `--lease-id`
- `--source-node-id`
- `--target-node-id`
- `--local-target`
- `--tunnel-id`
- `--status queued|claimed|delivered`
- `--include-payload`

Interpretation:

- This is not background polling.
- This is not payload execution.
- Human output omits `payload_base64`; JSON includes it only when explicitly
  requested.
- `--local-target` gives the future target-side poller a diagnostic equivalent.
- Live production `https://musu.pro/api/v1/p2p/relay/payload` returned 404
  during validation, so hosted deployment remains required.

Validation:

- cloud tests passed 6/6
- install CLI relay payload tests passed 2/2
- `cargo check --bin musu` passed
- `musu relay payloads --help` showed the new surface
- `musu relay payloads --json --local-target --status queued --limit 1`
  produced `musu.relay_payloads.v1` with live query `ok=false` due production
  404
- Rust fmt check passed
- `git diff --check` passed
