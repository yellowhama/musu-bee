# Next Steps After P2P Relay Route Transport Proof Status Surface

## Current State

The release tooling now exposes the same route transport proof requirement at
every operator handoff layer. Missing hosted relay tunnel proof is visible as a
specific blocker instead of a generic P2P failure.

This does not complete P2P release. The next work is real proof capture, not
more status plumbing.

## Next Actions

1. Produce real hosted relay tunnel proof.
   - Implement or wire the release `quic_relay_tunnel` payload path.
   - Submit `musu.relay_transport_proof.v1` from the actual tunnel.
   - Keep `transport_kind=quic_relay_tunnel` and
     `encryption=quic_tls_1_3` distinct.
   - Verify `relay_route_transport_proof_valid_count > 0`.

2. Produce real hosted relay payload delivery proof.
   - Deliver a payload over the release relay path.
   - Record `musu.relay_payload_delivery_proof.v1` bound to the same
     session, lease, source, target, and tunnel.
   - Verify `relay_payload_delivery_proof_valid_count > 0`.

3. Re-run hosted MUSU.PRO P2P evidence from the packaged runtime.
   - Log in with the packaged WindowsApps alias:
     `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
   - Do not use the localhost dashboard to satisfy hosted P2P evidence.
   - Rerun `scripts\windows\record-p2p-control-plane-evidence.ps1`.
   - Confirm relay status, transport, leases, route evidence, route transport
     proof, and payload delivery proof are all release-grade.

4. Run the second-PC evidence kit.
   - Install the same current MUSU build on the second Windows PC.
   - Run install, route, idle CPU, and runtime CPU matrix checks.
   - Import the return zip and verify multi-device route evidence.

5. Close remaining external gates.
   - Record `musu@musu.pro` support mailbox delivery proof.
   - Record Partner Center product reservation, submission, certification, and
     restricted capability approval evidence.

## Non-Goals

- Do not treat MUSU.PRO as the executor.
- Do not treat the local dashboard as the installed desktop app.
- Do not promote the store-forward queue fallback to release relay transport.
- Do not set release relay transport flags from env/config without live proof.

