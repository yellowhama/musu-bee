# 2026-06-07 HUGH-MAIN Route Reachability Diagnostic

## Decision

Keep MUSU Desktop as the local runtime surface and document the current
second-PC route failure as a peer reachability problem, not a local dashboard
or MUSU.PRO executor problem.

## Evidence

- local status: `hugh_second` healthy at `http://127.0.0.1:1158`
- peer status: `HUGH-MAIN` registered at `192.168.1.192:8949`,
  `healthy=false`, `version=unknown`
- route explain: manual `lan` candidate, `transport_scheme=http`,
  `encryption=none_http_bearer`, `peer_identity_verified=false`
- route attempt:
  `docs\evidence\route-diagnostics\1.15.0-rc.1\20260607-011317-HUGH_SECOND-HUGH_MAIN.route-attempt.json`
- reachability diagnostic:
  `docs\evidence\route-diagnostics\1.15.0-rc.1\20260607-011750-HUGH_SECOND-HUGH_MAIN.route-reachability-diagnostic.json`
- TCP probe to `192.168.1.192:8949`: `false`
- ping probe to `192.168.1.192`: `false`
- neighbor entry: present, not route success proof

## Interpretation

`HUGH_SECOND` is not blocked on `localhost:3001`; the packaged MUSU Desktop
runtime is responding. The blocker is that `HUGH-MAIN` is not accepting or not
reachable at the registered LAN endpoint.

The current manual HTTP bearer candidate is diagnostic only. It cannot satisfy
release-grade P2P evidence without verified peer identity and `quic_tls_1_3`
transport proof.

## Audit Result

No high/medium code issue was found. The release gate is correctly failing
closed on unhealthy peer state, unverified identity, non-release transport,
missing relay tunnel runtime, and missing hosted P2P evidence.

## Next Step

Install/start current MUSU Desktop on `HUGH-MAIN`, confirm its actual
reachable endpoint, open or correct port `8949`, then capture successful
two-machine route and CPU matrix evidence before returning to hosted MUSU.PRO
relay proof.
