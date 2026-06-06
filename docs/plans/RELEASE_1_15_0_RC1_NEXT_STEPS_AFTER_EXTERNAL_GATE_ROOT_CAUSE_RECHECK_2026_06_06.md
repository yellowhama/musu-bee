# MUSU 1.15.0-rc.1 Next Steps After External Gate Root-Cause Recheck

Date: 2026-06-06

## Objective

Move from one-machine local readiness to release-grade external readiness
without changing the product boundary: MUSU Desktop does the work locally;
MUSU.PRO provides remote input, rooms, rendezvous, path selection, relay
fallback coordination, and evidence.

## Current Evidence

- external gate evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-090152-HUGH_SECOND.external-gates.evidence.json`
- P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.evidence.json`
- P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.verification.json`
- release verifier regression: `55/55`

## Workstream 1: Second Windows PC

Goal: close `multi-device`, `runtime-idle-cpu`, and
`runtime-cpu-scenario-matrix`.

Actions:

1. Install or run the current MUSU build on the second Windows PC.
2. Confirm its local bridge is reachable from HUGH_SECOND.
3. Rerun the second-PC release check/return flow.
4. Import the return package and verify route, idle CPU, and runtime CPU matrix
   evidence on the same current build.

Exit criteria:

- second PC is reachable
- multi-device verifier passes
- runtime idle CPU valid machine count is `2/2`
- runtime CPU matrix valid machine count is `2/2`

## Workstream 2: Production MUSU.PRO P2P Login And Auth

Goal: close `p2p_runtime_not_logged_in` and owner-scope failures.

Actions:

1. Log in the packaged WindowsApps MUSU runtime to the production account.
2. Configure production P2P control auth for that runtime token.
3. Re-run `show-musu-pro-p2p-env-status.ps1`.
4. Re-run `record-p2p-control-plane-evidence.ps1` without unverified bypasses.

Exit criteria:

- relay status, transport, leases, and route evidence queries report
  `logged_in=true`
- owner scope is verified
- P2P control-plane evidence verifies without `-AllowUnverified`

## Workstream 3: Release Relay Fallback

Goal: prove hosted relay fallback without making relay the default path.

Actions:

1. Configure production KV/Upstash relay lease storage.
2. Ensure relay lease store reports configured and release-grade.
3. Wire the distinct release relay tunnel transport.
4. Wire the release payload endpoint for the tunnel path.
5. Capture relay route evidence with actual payload transit proof.

Exit criteria:

- relay lease store configured and release-grade
- relay transport descriptor/connect/payload endpoint wired
- relay route evidence count is positive
- relay payload transport is proven
- relay payload delivery proof valid count is positive

## Workstream 4: Operator External Evidence

Goal: close support and Store release gates.

Actions:

1. Record support mailbox delivery/receipt evidence for `musu@musu.pro`.
2. Record Partner Center product reservation evidence.
3. Record Store app submission evidence.
4. Record certification/restricted-capability approval evidence.

Exit criteria:

- `support_mailbox_verified=true`
- `store_release_verified=true`

## Quality Bar

Do not downgrade the local/web split to close a release gate. A gate is closed
only by evidence:

- localhost dashboard availability is not required for packaged MUSU Desktop
- MUSU.PRO must not become the default execution server
- relay must remain fallback-only
- route/payload evidence must be owner-scoped and tied to the stored lease
