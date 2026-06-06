# MUSU 1.15.0-rc.1 Next Steps After HUGH-MAIN Route Reachability Diagnostic

**Generated**: 2026-06-07 01:18 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_HUGH_MAIN_ROUTE_REACHABILITY_DIAGNOSTIC_2026_06_07.md`

## Current Position

`HUGH_SECOND` has a healthy packaged MUSU Desktop runtime. `HUGH-MAIN` is
registered as a manual LAN peer at `192.168.1.192:8949`, but it is unhealthy
and TCP/ping probes fail from `HUGH_SECOND`.

The selected route is `lan` over HTTP bearer. This is useful diagnostic input,
but it is not release-grade P2P proof.

## Next Execution Order

1. On `HUGH-MAIN`, install or start the same current MUSU Desktop build.
2. On `HUGH-MAIN`, run packaged `musu status --json` and confirm the local
   node is healthy.
3. Confirm the actual address and port that `HUGH-MAIN` exposes for fleet
   delegation.
4. Open that port through Windows Firewall or adjust the peer record to the
   real reachable endpoint.
5. From `HUGH_SECOND`, rerun TCP reachability to the selected endpoint.
6. Rerun `musu route --target HUGH-MAIN --explain --json` and confirm the
   selected candidate is current and reachable.
7. Capture successful two-machine route evidence and runtime CPU matrix.
8. Keep the failed-route diagnostic as CPU/reachability evidence only; do not
   treat it as multi-device proof.
9. After direct routing is proven, capture hosted MUSU.PRO owner-scoped P2P
   evidence with route metadata, relay transport proof, and payload delivery
   proof.
10. Record support mailbox and Store/Partner Center proof.

## Release Gate Notes

- `localhost:3001` must not be used as the packaged desktop runtime contract.
- Manual HTTP bearer route candidates remain non-release-grade until verified
  peer identity and `quic_tls_1_3` route evidence exist.
- Relay remains fallback-only and requires local `quic_relay_tunnel` runtime
  proof before it can satisfy public release claims.
