# MUSU 1.15.0-rc.1 Next Steps After P2P Route Metadata Status Surface

**Generated**: 2026-06-06 22:53 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_P2P_ROUTE_METADATA_STATUS_SURFACE_2026_06_06.md`

## Current Position

The hosted P2P verifier already requires release-grade route metadata around
relay proof. The release handoff surfaces now carry that same metadata count
from recorder to go/no-go, MUSU.PRO P2P env status, external gate recheck, and
final handoff status.

This closes an evidence visibility gap. It does not close the release gate.

## No-Go Items

Public desktop release remains blocked by:

- no successful second-PC route evidence for the current build
- no second-PC desktop-open idle CPU evidence
- no second-PC full runtime CPU matrix evidence
- no targeted second-PC route-attempt evidence from a reachable second PC
- no live MUSU.PRO packaged-runtime login evidence
- no production owner-scoped P2P storage evidence
- no release `quic_relay_tunnel` runtime proof
- no hosted relay route metadata proof
- no hosted relay route transport proof
- no hosted relay payload delivery proof
- no support mailbox proof
- no Microsoft Store / Partner Center proof

## Next Execution Order

1. Install the current MUSU Desktop build on the second Windows PC.
2. Confirm that both machines use the packaged WindowsApps `musu.exe` alias.
3. Capture second-PC single-machine, desktop-open idle CPU, and full runtime
   CPU matrix evidence.
4. Capture targeted second-PC route-attempt CPU evidence against the real peer,
   not localhost, loopback, or the current operator machine.
5. Capture a successful two-machine route with release route metadata:
   `candidate_addr`, `handshake_ms`, `total_attempt_ms`,
   `peer_identity_verified`, `peer_identity_method`, `peer_public_key`,
   `encryption`, and `transport_verified_by`.
6. Log the packaged runtime into MUSU.PRO and record owner-scoped hosted P2P
   evidence.
7. Wire release relay only after direct route failure:
   - local `quic_relay_tunnel` runtime
   - `quic_tls_1_3`
   - route metadata coverage
   - relay route transport proof
   - relay payload delivery proof
8. Record support mailbox proof and Store/Partner Center proof.
9. Run final clean go/no-go and final operator packet verification.

## Audit Notes

No high or medium code issue was found in this scoped status-surface change.

Keep release interpretation strict: nonzero route metadata count is now visible
in every handoff layer, but the current live count is still `0`. The product
boundary remains MUSU Desktop local execution plus MUSU.PRO remote input,
rooms, rendezvous, path-selection, relay fallback, and evidence control plane.
