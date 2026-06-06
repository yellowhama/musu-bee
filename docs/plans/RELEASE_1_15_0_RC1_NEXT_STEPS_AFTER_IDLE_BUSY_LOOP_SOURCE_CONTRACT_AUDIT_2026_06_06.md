# MUSU 1.15.0-rc.1 Next Steps After Idle Busy-Loop Source Contract Audit

Date: 2026-06-06

## Objective

Move from one-machine local readiness to public desktop release readiness while
preserving the product boundary: MUSU Desktop executes locally; MUSU.PRO is the
remote input, project room, rendezvous, path-selection, relay-fallback, and
evidence control plane.

## Confirmed State

- Idle busy-loop candidate source coverage is now locked by a release verifier
  regression case.
- The eight release candidates are clipboard polling, mDNS discovery, health
  check retry, bridge readiness wait, frontend interval/refetch, relay payload
  target polling, cloud heartbeat, and log/telemetry flush.
- The current one-machine `HUGH_SECOND` desktop-open CPU evidence remains
  healthy.
- Current public release readiness is still blocked by external/multi-device
  proof, not by a newly found local runtime loop.

## Workstream 1: Second Windows PC Evidence

1. Install the same current MUSU build on the second Windows PC.
2. Run packaged runtime identity and process ownership checks.
3. Capture single-machine smoke evidence.
4. Capture `desktop-open` idle CPU evidence for 60 seconds.
5. Capture runtime CPU scenario matrix evidence including post-route.
6. Import the return package and verify machine counts reach `2/2`.

Exit criteria:

- multi-device evidence passes
- runtime idle CPU valid machine count is `2/2`
- runtime CPU scenario matrix valid machine count is `2/2`
- route evidence is either successful and release-grade, or failed with a
  captured diagnostic that does not claim release route success

## Workstream 2: Packaged Runtime MUSU.PRO Login

1. Log in through the packaged WindowsApps alias:
   `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
2. Do not use the localhost developer dashboard to satisfy hosted P2P gates.
3. Re-run `show-musu-pro-p2p-env-status.ps1`.
4. Re-run `record-p2p-control-plane-evidence.ps1 -BaseUrl https://musu.pro`.

Exit criteria:

- relay status, transport, leases, and route evidence all report
  `logged_in=true`
- owner scope is verified
- live P2P evidence verifies without unverified bypasses

## Workstream 3: Release Relay Tunnel

1. Configure production KV/Upstash relay lease storage.
2. Keep store-forward queue evidence separate from release tunnel proof.
3. Wire the release relay tunnel kind `quic_relay_tunnel`.
4. Emit `quic_tls_1_3` transport proof only from actual payload transit.
5. Capture release-grade relay route evidence with lease/session/source/target
   binding and delivery proof.

Exit criteria:

- relay lease store is configured and release-grade
- relay transport/connect/payload endpoints are wired
- relay route evidence count is positive
- relay payload transport is proven by actual payload transit

## Workstream 4: External Release Proof

1. Record support mailbox send/receive proof for `musu@musu.pro`.
2. Record Partner Center product reservation evidence.
3. Record Microsoft Store submission evidence.
4. Record certification and restricted-capability approval evidence.
5. Run final go/no-go without public metadata skip.

Exit criteria:

- `support_mailbox_verified=true`
- `store_release_verified=true`
- `ready_for_public_desktop_release=true`

## Stop Conditions

- Do not claim public release readiness with only one-machine evidence.
- Do not treat `localhost:3001` as required packaged MUSU Desktop behavior.
- Do not move execution from local MUSU Desktop into MUSU.PRO.
- Do not count the preview store-forward queue as release relay tunnel proof.
- Do not remove an idle busy-loop candidate from go/no-go without updating the
  source contract and release rationale.
