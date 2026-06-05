# 2026-06-06 Release Relay Payload Preflight Endpoint

Context:

- After relay connect preflight, the next code-addressable P2P source blocker
  was the missing distinct release payload endpoint.
- Do not set `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true` until real release
  tunnel payload transport exists.

What changed:

- Added `RELAY_PAYLOAD_PATH=/api/v1/relay/payload`.
- Added `GET/POST /api/v1/relay/payload` with schema
  `musu.relay_payload_preflight.v1`.
- Both methods require P2P control auth.
- `POST` validates owner-scoped relay lease metadata before returning a
  release payload decision.
- The endpoint stays fail-closed:
  `release_payload_accepted=false`, `payload_stored=false`,
  `payload_transported=false`, and `relay_payload_endpoint_not_wired`.
- The endpoint does not import/call queue storage helpers.
- `show-musu-pro-p2p-env-status.ps1` now reports
  `release_payload_preflight_endpoint_implemented=true`.
- `audit-p2p-store-forward-relay-contract.ps1` now gates that this preflight
  endpoint remains separate from queue storage.

Validation:

- `npm run test:p2p`: `88/88`.
- `npm run typecheck`: passed.
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`.
- P2P env status: release payload preflight true, payload endpoint marker
  false, queue-only true, transport kind not release-grade.
- `git diff --check`: passed.

Interpretation:

- Good progress toward release relay transport architecture.
- Not release-grade relay payload transport.
- MUSU Desktop remains local executor; MUSU.PRO remains remote input,
  rendezvous/path-selection/relay fallback/evidence control plane.

Next steps:

- Implement actual release tunnel payload transport and proof emission.
- Configure hosted KV/Upstash.
- Record live owner-scoped relay route and delivery proof.
- Refresh packaged evidence after committing this web runtime source change if
  using it for release readiness.

Index refresh:

- MUSU local indexer succeeded:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- Result: `2439 files`, `2717 symbols`, `15901 ms`.
- gbrain was not rerun because the same-session blocker remains missing
  `ZEROENTROPY_API_KEY`, import failures, `sync.last_commit` not advancing, and
  `gstack-brain-sync exited undefined`.
