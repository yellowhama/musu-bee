# Relay Source Node Auth Binding Hardening (2026-06-28)

## Verdict

W-7 is now implemented in source for the web P2P control plane, but it is not a
full product completion event.

The server can now bind a P2P control bearer token hash to one allowed
`source_node_id` through `MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS`. When that
binding is configured, source-claiming writes fail closed if the request body
declares a different `source_node_id`.

This closes the source-level spoofing gap for configured node tokens. It does
not implement release-grade relay transport, deploy the production relay server,
configure live KV/Upstash storage, or produce two-PC relay route evidence.

## Contract

Environment:

- `MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS`
- Format: comma, semicolon, or newline separated entries.
- Entry format: `sha256:<64-hex-token-sha256>=<source_node_id>`.
- Raw bearer token values are not stored in the binding.

Example:

```text
MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS=sha256:0123...abcd=hugh_second
```

Server behavior:

- `p2pControlPrincipal(req)` now exposes `token_sha256` and optional
  `bound_source_node_id`.
- `p2pSourceNodeAuthMismatch(principal, source_node_id)` returns
  `source_node_id_auth_mismatch` when a configured token binding does not match
  the declared source node.
- Unconfigured bindings preserve the existing owner-scoped behavior.

## Enforced Surfaces

The binding is enforced on source-claiming control-plane writes:

- `POST /api/v1/p2p/rendezvous`
- `POST /api/rooms/[roomId]/rendezvous`
- `POST /api/v1/p2p/relay/lease`
- `POST /api/v1/p2p/relay/payload`
- `POST /api/v1/p2p/relay/transport-proof`
- `POST /api/v1/p2p/route-evidence`
- `POST /api/v1/relay/connect`
- `POST /api/v1/relay/payload`

Mismatch response shape includes:

- `status=403`
- `error=source_node_id_auth_mismatch`
- `source_node_auth_bound=true`
- `bound_source_node_id`
- `declared_source_node_id`

## Verification

Passed:

- `npx tsx --test src/lib/p2pControlAuth.test.ts src/app/api/v1/p2p/relay/lease/route.test.ts src/app/api/v1/p2p/relay/payload/route.test.ts src/app/api/v1/p2p/rendezvous/route.test.ts src/app/api/rooms/[[]roomId[]]/rendezvous/route.test.ts`
  - 48 tests passed.
- `npm run test:p2p`
  - 131 tests passed after extending the binding to release relay preflight
    endpoints.
- `npm run typecheck`
  - `tsc --noEmit` passed.
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json`
  - `ok=true`, `fail_count=0`.
- `scripts/windows/audit-operator-api-security-contract.ps1 -Json`
  - `ok=true`, `fail_count=0`.
- Post-push PR #34 recheck for commit `55f3f820`
  - `Deploy to Vercel`, `Web typecheck and build`, `Rust core tests`,
    `Playwright E2E`, `landing-ceo-approval-gate`, `saas-gate`, and the short
    `test` check passed.
  - `design-gate` still fails because explicit design approval evidence is
    missing.

## Product Impact

This hardens the relay control-plane trust boundary:

- A node-bound token cannot create rendezvous, relay leases, relay payloads,
  relay transport proofs, route evidence, release relay connect preflight, or
  release relay payload preflight as another configured source node.
- Route/proof evidence can no longer be source-spoofed by a correctly configured
  node-specific bearer token.
- The existing owner-scoped lease and payload guards remain in place.

Remaining blockers are unchanged:

- Release relay tunnel runtime is still not implemented.
- Live release relay route/transport/delivery proof is still missing.
- Production relay deployment and live environment binding still require
  operator sign-off.
- `p2p-control-plane` and `relay-transport` remain NO-GO in the full product
  gate until live release-grade evidence exists.

## Next Steps

1. Configure `MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS` in the live P2P control-plane
   environment after production sign-off.
2. Deploy the web control-plane update.
3. Capture live mismatch and match evidence from two node-bound tokens.
4. Continue the real relay transport lane: runtime byte path, release-grade
   store, route evidence, transport proof, payload delivery proof, and two-PC
   failure-injection proof.
