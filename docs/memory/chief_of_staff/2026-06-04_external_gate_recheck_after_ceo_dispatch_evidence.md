# 2026-06-04 External Gate Recheck After CEO Dispatch Evidence

After CEO dispatch SSE cleanup and refreshed primary-machine evidence, the
external release gates were rechecked from the packaged Windows alias.

Result:

- external evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260604-143952-HUGH_SECOND.external-gates.evidence.json`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.evidence.json`
- live P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.verification.json`
- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- second PC `192.168.1.192:8949` unreachable with `tcp_connect_timeout`
- hosted P2P env not ready because KV/Upstash URL/token are missing
- relay transport descriptor is visible, but payload endpoint, relay transport,
  lease store, route evidence, payload transport proof, and delivery proof are
  not release-grade

Local hardening audits remain clean: Rust background loops, frontend polling,
process ownership, local API auth, and operator API security all report
`ok=true`.

The product roadmap remains local-executor first: `musu.pro` accepts web work
orders and coordinates project rooms/rendezvous/path selection/relay fallback,
while local MUSU programs perform the actual work and prefer direct P2P mesh
traffic.
