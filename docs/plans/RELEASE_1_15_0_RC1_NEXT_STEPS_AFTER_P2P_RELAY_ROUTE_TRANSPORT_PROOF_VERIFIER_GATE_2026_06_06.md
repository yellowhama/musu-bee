# Next Steps After P2P Relay Route Transport Proof Verifier Gate

## Current State

The local code now fails closed unless hosted relay route evidence includes a
bound fallback lease, relay transport proof, and relay payload delivery proof.
This prevents false positive P2P release evidence, but it does not create the
missing production proof.

## Next Actions

1. Capture hosted MUSU.PRO P2P status after packaged runtime login.
   - Run the packaged WindowsApps `musu.exe login`.
   - Rerun hosted P2P evidence without `-AllowUnverified`.
   - Confirm all relay status/transport/leases/route-evidence logged-in fields
     are true.

2. Complete release relay tunnel proof.
   - Implement or wire the release `quic_relay_tunnel` path.
   - Record `musu.relay_transport_proof.v1` from the actual tunnel.
   - Record `musu.relay_payload_delivery_proof.v1` from delivered relay
     payloads.
   - Verify nonzero `relay_route_transport_proof_valid_count` and
     `relay_payload_delivery_proof_valid_count`.

3. Run the second-PC evidence kit.
   - Install/current MUSU Desktop on the second PC.
   - Run the second-PC release check with runtime CPU matrix enabled.
   - Import the return zip and verify multi-device route, idle CPU, and matrix
     evidence.

4. Close external release gates.
   - Record support mailbox delivery proof for `musu@musu.pro`.
   - Record Partner Center product reservation, app submission, certification,
     and restricted capability approval evidence.

## Non-Goals

- Do not treat the localhost dashboard as MUSU Desktop.
- Do not treat MUSU.PRO as the executor.
- Do not treat store-forward queue fallback as release relay tunnel transport.

