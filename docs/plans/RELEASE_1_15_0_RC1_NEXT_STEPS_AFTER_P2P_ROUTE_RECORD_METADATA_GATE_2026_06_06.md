# MUSU 1.15.0-rc.1 Next Steps After P2P Route Record Metadata Gate

**Generated**: 2026-06-06 22:20 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_P2P_ROUTE_RECORD_METADATA_GATE_2026_06_06.md`

## Current Position

The hosted P2P verifier now requires the route evidence record itself to prove
candidate address, latency, handshake timing, peer identity, encryption, and
transport verifier metadata. The relay transport proof must match the route
record handshake timing.

This closes a false-positive evidence gap: a proof-shaped
`relay_transport_proof` cannot carry a weak or incomplete enclosing route
record through the hosted P2P release gate.

## No-Go Items

Public desktop release remains blocked by:

- no successful second-PC route evidence for the current build
- no second-PC desktop-open idle CPU evidence
- no second-PC full runtime CPU matrix evidence
- no targeted second-PC route-attempt evidence from a reachable second PC
- no live MUSU.PRO packaged-runtime login evidence
- no production owner-scoped P2P storage evidence
- no release `quic_relay_tunnel` runtime proof
- no release relay payload delivery proof
- no support mailbox proof
- no Microsoft Store / Partner Center proof

## Next Execution Order

1. Install current MUSU Desktop on the second Windows PC.
2. Confirm the second PC uses the packaged WindowsApps `musu.exe` alias.
3. Capture second-PC single-machine, desktop-open idle CPU, and full runtime
   CPU matrix evidence.
4. Capture a successful two-machine route with route evidence that includes:
   `route_kind`, `candidate_addr`, `handshake_ms`, `total_attempt_ms`,
   `peer_identity_verified`, `peer_identity_method`, `peer_public_key`,
   `encryption`, and `transport_verified_by`.
5. Log the packaged runtime into MUSU.PRO and record owner-scoped hosted P2P
   evidence.
6. Wire release relay only after direct route failure:
   - `quic_relay_tunnel`
   - `quic_tls_1_3`
   - route metadata coverage
   - relay transport proof
   - relay payload delivery proof
7. Record support mailbox proof and Store/Partner Center proof.
8. Run final clean go/no-go and final operator packet verification.

## Audit Notes

The scoped verifier change has no high or medium code concern. The risk is
release interpretation: route metadata verifier hardening must not be presented
as live P2P completion. It only makes future hosted P2P proof harder to fake or
misread.

Keep release copy scoped to local MUSU Desktop execution plus MUSU.PRO remote
input/control-plane coordination until the external evidence is recorded.
