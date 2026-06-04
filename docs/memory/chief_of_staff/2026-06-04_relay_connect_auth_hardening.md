# 2026-06-04 Relay Connect Auth Hardening

- `/api/v1/relay/connect` now requires P2P control auth before returning even
  its fail-closed relay status/preflight response.
- This does not implement release-grade relay transport; markers remain
  `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=false` and
  `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.
- Route tests now prove missing bearer token returns `401 unauthorized`, while
  authenticated `GET`/`POST` still return fail-closed `501` / no payload
  transit while the endpoint is unwired.
- `audit-operator-api-security-contract.ps1` now checks the relay connect auth
  contract, so go/no-go's existing security gate covers this regression.
- Validation passed operator security audit, P2P tests `77/77`, typecheck, and
  `git diff --check`.
