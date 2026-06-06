# Next Steps After Relay Preflight Failure Evidence Hardening

## Current State

Relay connect and release payload preflight failure responses now remain
structured and evidence-friendly for invalid JSON and invalid metadata. The
endpoints still fail closed and still do not accept release payload bytes.

This improves hosted P2P diagnostics but does not complete the release relay
tunnel.

## Next Actions

1. Run the current MSIX on a real second Windows machine and import the return
   evidence for route, desktop-open CPU, full runtime matrix, and process
   attribution.
2. Log in the packaged runtime with:
   `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
3. Configure production KV/Upstash storage for `https://musu.pro`.
4. Implement release tunnel payload transport separately from the preview
   store-forward queue.
5. Record hosted P2P evidence showing owner-scoped relay leases, release
   `quic_relay_tunnel` transport proof, and relay payload delivery proof.
6. Record support mailbox and Store evidence.

## Non-Goals

- Do not count invalid request handling as release relay transport proof.
- Do not count preview queue delivery proof as release tunnel delivery proof.
- Do not move local task execution into MUSU.PRO.
