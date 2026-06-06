# MUSU 1.15.0-rc.1 HUGH-MAIN Route Reachability Diagnostic

**Date**: 2026-06-07 01:18 KST
**Machine**: `HUGH_SECOND`
**Target**: `HUGH-MAIN`

## Summary

MUSU Desktop is the correct local runtime surface. The local packaged runtime
is healthy on `HUGH_SECOND`; the failure is the registered peer endpoint for
`HUGH-MAIN`.

`musu status --json` reports this node healthy at `http://127.0.0.1:1158`,
while `HUGH-MAIN` is registered at `192.168.1.192:8949` with
`healthy=false` and `version=unknown`. `localhost:3001` is not the packaged
desktop runtime contract and is not required for this diagnostic.

## Evidence

Route attempt:

- `docs\evidence\route-diagnostics\1.15.0-rc.1\20260607-011317-HUGH_SECOND-HUGH_MAIN.route-attempt.json`
- route kind: `lan`
- target: `192.168.1.192:8949`
- result: `failed`
- failure class: `submit_http_error`
- total attempt: `10006 ms`
- peer identity: `peer_identity_verified=false`
- encryption: `none_http_bearer`
- payload through MUSU infra: `false`

Reachability diagnostic:

- `docs\evidence\route-diagnostics\1.15.0-rc.1\20260607-011750-HUGH_SECOND-HUGH_MAIN.route-reachability-diagnostic.json`
- local bridge: `http://127.0.0.1:1158`
- fleet nodes: `2`
- online nodes: `1`
- selected candidate: manual `lan` HTTP route to `192.168.1.192:8949`
- TCP port probe: `false`
- ping probe: `false`
- neighbor entry: present, but not route success proof
- source IPv4 used for LAN context: `192.168.1.154/24`

Route explain confirms the selected path is not release-grade:

- `current_transport=http_bearer`
- `release_grade_transport_required=quic_tls_1_3`
- `route_evidence_ready=false`
- `path_priority=lan,tailscale,direct_quic,relay`
- relay remains Connect/Pro fallback only and must not become the default data
  path

## Interpretation

This is not a MUSU Desktop install failure on `HUGH_SECOND`. The local desktop
runtime is alive, and the CLI can query it.

The route fails because the only known `HUGH-MAIN` candidate is a manual LAN
endpoint that does not accept TCP on `192.168.1.192:8949` from this machine.
The peer may be powered off, running an old build, bound to a different port,
blocked by firewall, on a different network profile, or not running MUSU
Desktop.

Even if this exact HTTP endpoint started responding, it would still not be
release-grade P2P proof. Release-grade route evidence requires verified peer
identity and `quic_tls_1_3` transport proof, not `none_http_bearer`.

## Product Boundary

The intended product split remains:

- MUSU Desktop executes local work on each device.
- MUSU.PRO receives remote user input, hosts project/company room state,
  coordinates rendezvous/path selection/relay fallback, and stores evidence.
- MUSU.PRO does not become the executor.
- MUSU.PRO relay does not become the default data path.
- `localhost:3001` is a local dashboard/dev-operator surface, not the product
  dependency for a packaged desktop run.

## Qualitative Audit

No high or medium code issue was found in this diagnostic pass.

The system is failing closed in the right direction: unhealthy peer,
unverified identity, HTTP bearer transport, missing relay tunnel runtime, and
missing route evidence all keep public release in No-Go. The current problem
is operational/evidence readiness, not a new code regression.

## Release Impact

Public release remains No-Go.

This diagnostic improves the evidence trail for why the current second-PC
route is blocked, but it does not satisfy multi-device proof. The remaining
release blockers are still:

- multi-device evidence
- second-machine idle CPU evidence
- successful two-machine runtime CPU matrix
- hosted MUSU.PRO P2P/relay evidence
- support mailbox evidence
- Store/Partner Center evidence
