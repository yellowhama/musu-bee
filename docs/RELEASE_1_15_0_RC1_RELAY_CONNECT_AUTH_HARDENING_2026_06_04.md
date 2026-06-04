# MUSU 1.15.0-rc.1 Relay Connect Auth Hardening

**Wiki ID**: wiki/709
**Date**: 2026-06-04 23:59 KST

## Decision

`/api/v1/relay/connect` must be inside the P2P control auth boundary before it
can become a real relay/tunnel transport endpoint.

The endpoint still fails closed because release-grade relay payload transport is
not implemented. That is correct. The hardening gap was that the fail-closed
preflight/status response could be reached without a bearer token. Even
non-secret relay status should not establish a precedent where the eventual
relay connect path is unauthenticated.

## Change

`musu-bee\src\app\api\v1\relay\connect\route.ts` now calls
`authorizeP2pControl(req)` for both `GET` and `POST` before returning the
fail-closed relay connect response.

`musu-bee\src\app\api\v1\relay\connect\route.test.ts` now verifies:

- missing bearer token returns `401 unauthorized`
- authenticated `GET` still returns fail-closed `501`
- authenticated `POST` still refuses payload transit while the endpoint is
  unwired

`scripts\windows\audit-operator-api-security-contract.ps1` now audits the relay
connect auth contract, so go/no-go's existing operator/security hardening gate
will fail if this auth check is removed.

## Validation

- PowerShell parser check passed for
  `audit-operator-api-security-contract.ps1`
- `audit-operator-api-security-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- `npm run test:p2p`: `77/77`
- `npm run typecheck`
- `git diff --check`

## Release Interpretation

This is P2P relay security hardening, not relay transport completion.

The source still intentionally keeps:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `relay_transport_wired=false`
- `relay_default_data_path=false`

Public desktop release remains No-Go until real second-PC multi-device evidence,
two-machine CPU/matrix evidence, hosted `musu.pro` P2P control-plane/relay
proof, support mailbox delivery evidence, and Store evidence are complete.
