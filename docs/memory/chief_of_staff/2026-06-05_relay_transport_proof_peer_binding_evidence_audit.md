# Chief of Staff Memory: Relay Transport Proof Peer Binding Evidence Audit

Date: 2026-06-05T20:35+09:00

Decision:

- MUSU Desktop is the local executor.
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay-fallback policy, and evidence control plane.
- Local MUSU programs should exchange work through P2P mesh after web-assisted
  rendezvous whenever possible.
- Relay remains fallback-only and cannot become release-grade without proof.

Implemented:

- Hosted route evidence now requires inline relay transport proof to carry
  `source_node_id` and `target_node_id`.
- Release-grade relay evidence queries reject records whose current relay
  transport proof is not bound to the same source/target peer pair.
- Rust `RouteRelayTransportProof` serializes the peer-binding fields.
- Fresh HUGH_SECOND MSIX, single-machine, idle CPU, runtime matrix, and
  targeted HUGH-MAIN post-route CPU evidence were recorded after the source
  change.

Current status:

- One-machine packaged desktop evidence is healthy and bridge-only.
- `localhost:3001` remains optional developer/workspace UI, not the MUSU
  Desktop runtime.
- Public release remains No-Go on second-PC evidence, hosted P2P release proof,
  support mailbox proof, and Store proof.

Next:

- Run the same current build on another Windows PC.
- Import second-PC route/CPU/matrix evidence.
- Provision hosted KV/Upstash and implement real release relay/tunnel payload
  transport before claiming Connect/Pro relay readiness.
