# 2026-06-05 Relay Connect Preflight Endpoint Audit

Context:

- User clarified that MUSU Desktop is the local program/executor and MUSU.PRO
  is remote input, project/company room, rendezvous, path-selection,
  relay-fallback policy, and evidence/control plane.
- The previous `/api/v1/relay/connect` route was an authenticated fail-closed
  placeholder. It removed unauthenticated exposure but did not verify a lease.

What changed:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=true`.
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` remains unchanged.
- `RELAY_TRANSPORT_KIND=websocket_tunnel` remains non-release-grade because the
  release requirement is `quic_tls_1_3`.
- `GET /api/v1/relay/connect` now returns `musu.relay_connect.v1` preflight
  status behind P2P control auth.
- `POST /api/v1/relay/connect` validates `lease_id`, `session_id`,
  `source_node_id`, and `target_node_id`, then queries an owner-scoped relay
  lease before returning any connect decision.
- Lease store failures now return shaped `503 relay_connect_store_failed`.
- `queryRelayLeases` can filter by `lease_id`.

Validation:

- `npm run test:p2p`: `85/85`.
- `npm run test:routes`: `19/19`.
- `npm run typecheck`: passed.
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`.
- Operator API security contract audit: `ok=true`, `fail_count=0`.
- `show-musu-pro-p2p-env-status.ps1 -Json`: source connect implemented true,
  connect placeholder false, payload endpoint false, queue-only true, transport
  kind still not release-grade.
- `git diff --check`: passed.

Go/no-go interpretation:

- Dirty-tree go/no-go still reports `ready_for_public_desktop_release=false`.
- Existing primary-machine evidence is present, but this web runtime source
  change means fresh packaged evidence should be refreshed after commit before
  current-source local readiness is claimed.

Audit result:

- No high or medium issue found.
- Product/spec boundary remains strict: MUSU.PRO may preflight/coordinate relay
  connection and owner-scoped leases, but it is not the execution server and
  does not become the default payload path.

Next steps:

- Configure production KV/Upstash for MUSU.PRO P2P storage.
- Add distinct release tunnel payload endpoint.
- Implement/prove `quic_tls_1_3` relay transport before enabling release
  payload markers.
- Record live owner-scoped relay route and payload delivery proof.
- Refresh packaged evidence after this source commit and collect second-PC
  evidence.

Index refresh:

- MUSU local indexer succeeded:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- Result: `2435 files`, `2707 symbols`, `10569 ms`.
- gbrain was not rerun because the same-session blocker remains missing
  `ZEROENTROPY_API_KEY`, import failures, `sync.last_commit` not advancing, and
  `gstack-brain-sync exited undefined`.
