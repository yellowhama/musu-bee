# MUSU 1.15.0-rc.1 Next Steps After Current HEAD Runtime CPU Matrix Refresh

Date: 2026-06-06

## Objective

Move from validated one-machine packaged MUSU Desktop runtime behavior to
public desktop release readiness without changing the product boundary: local
MUSU programs execute work; MUSU.PRO accepts remote input and coordinates rooms,
presence, rendezvous, path selection, relay fallback, and evidence.

## Confirmed State

- Full runtime CPU scenario matrix is current and clean on `HUGH_SECOND`.
- Failed HUGH-MAIN route-attempt CPU diagnostic is current and clean on
  `HUGH_SECOND`.
- The failed HUGH-MAIN route is diagnostic only; it is not multi-device proof.
- No local idle busy loop was reproduced in the current packaged runtime.
- `localhost:3001` is not required packaged runtime behavior.

## Workstream 1: Second Windows PC Proof

1. Install the same current MUSU build on the second Windows PC.
2. Run packaged runtime identity and `musu doctor --json`.
3. Capture single-machine smoke evidence.
4. Capture `desktop-open` idle CPU evidence for 60 seconds.
5. Capture runtime CPU scenario matrix evidence.
6. Capture a real route attempt from/to the second PC.
7. Import and verify the return package on the primary repo machine.

Exit criteria:

- multi-device evidence passes
- runtime idle CPU valid machine count reaches `2/2`
- runtime CPU scenario matrix valid machine count reaches `2/2`
- route evidence is either successful and release-grade or explicitly
  diagnostic without claiming release route success

## Workstream 2: Packaged Runtime MUSU.PRO Login

1. Log in with the packaged WindowsApps alias:
   `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
2. Do not use the localhost developer dashboard to satisfy hosted P2P gates.
3. Re-run `show-musu-pro-p2p-env-status.ps1`.
4. Re-run hosted P2P evidence capture against `https://musu.pro`.

Exit criteria:

- relay status, transport, leases, and route-evidence checks all report
  `logged_in=true`
- owner scope is verified
- live hosted P2P evidence verifies without bypass flags

## Workstream 3: Release Relay Tunnel

1. Configure release-grade relay lease storage.
2. Keep preview store-forward queue evidence separate from release tunnel
   proof.
3. Wire release relay tunnel kind `quic_relay_tunnel`.
4. Emit `quic_tls_1_3` transport proof only after actual payload transit.
5. Record lease/session/source/target-bound route evidence and delivery proof.

Exit criteria:

- relay lease store is configured and release-grade
- relay transport/connect/payload endpoints are wired
- relay route evidence count is positive
- relay payload transport is proven by actual payload transit

## Workstream 4: Public Release Proof

1. Record support mailbox send/receive proof for `musu@musu.pro`.
2. Record Partner Center product reservation evidence.
3. Record Microsoft Store submission evidence.
4. Record certification/restricted-capability evidence.
5. Run clean final go/no-go without public metadata skip.
6. Regenerate and verify the final operator packet from clean current HEAD.

Exit criteria:

- `support_mailbox_verified=true`
- `store_release_verified=true`
- `ready_for_public_desktop_release=true`

## Stop Conditions

- Do not claim public release readiness with one-machine evidence.
- Do not count the failed HUGH-MAIN diagnostic as a successful route proof.
- Do not treat `localhost:3001` as required packaged MUSU Desktop behavior.
- Do not move execution from local MUSU Desktop into MUSU.PRO.
- Do not count preview store-forward queue behavior as release relay tunnel
  proof.
