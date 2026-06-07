# 2026-06-07 KST - current-head qual audit, spec lock, and next steps

Current HEAD `078ce1c5eeb11edc00aa9a6597e6db1f5b0acc59` keeps the one-machine
MUSU Desktop local evidence valid on `HUGH_SECOND`, but public release remains
No-Go.

Useful durable facts:

- MUSU Desktop is the local executor; MUSU.PRO is remote input, room,
  rendezvous, path-selection, relay fallback, and evidence/control plane.
- `localhost:3001` is not the packaged desktop runtime contract.
- P2P env status still has 12 blockers: release tunnel runtime, release payload
  endpoint, non-release preview queue/transport kind, KV/Upstash, runtime login,
  live route proof, route metadata, transport proof, and payload delivery proof.
- Current P2P tests passed `112/112`; typecheck passed; P2P relay/source audit
  passed `ok=true`; release verifier regression passed `104/104`.
- Latest operator pack is older than current HEAD (`981f37ac` vs `078ce1c5`);
  regenerate packs before second-PC handoff.

Next concrete sequence:

1. Regenerate final/operator handoff packs from current HEAD.
2. Run the package/evidence kit on the second Windows machine.
3. Import return evidence and re-run clean go/no-go.
4. Only after second-machine proof, wire hosted MUSU.PRO storage/login and real
   `quic_relay_tunnel` relay proof.
