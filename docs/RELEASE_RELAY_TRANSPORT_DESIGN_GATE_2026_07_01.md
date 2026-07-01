# Release Relay Transport Design Gate (2026-07-01)

## Verdict

This change does not close `relay-transport` or `p2p-control-plane`.

It closes a narrower release-operations gap: there is now an executable design
gate that keeps `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` until real
`quic_relay_tunnel` byte transit, bound `quic_tls_1_3` transport proof, payload
delivery proof, and two-PC direct-blocked relay evidence exist.

## Product Contract

Current product state:

- `relay-transport`: NO-GO.
- `p2p-control-plane`: NO-GO.
- `p2p-store-forward-relay`: not the active blocker after wiki/1221.
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED`: must stay `false`.
- `runtime_marker_can_be_flipped`: `false`.
- `relay_transport_product_verified`: must remain `false`.

The display/control-plane layer may expose relay candidates and store-forward
queue diagnostics, but delegated work over relay is not a release-grade product
claim until the actual payload bytes move through the release relay tunnel.

## Source Changes

Added:

- `scripts/windows/audit-release-relay-transport-design-gate.ps1`

Updated:

- `scripts/windows/write-release-go-no-go.ps1`
- `scripts/windows/audit-desktop-release-readiness.ps1`
- `scripts/windows/test-release-evidence-verifiers.ps1`
- `scripts/windows/prepare-multidevice-test-kit.ps1`
- `scripts/windows/prepare-final-operator-gate-packet.ps1`

The new gate wraps `show-musu-pro-p2p-env-status.ps1` and emits:

- schema `musu.release_relay_transport_design_gate.v1`
- `release_ready=false`
- `runtime_marker_can_be_flipped=false`
- `must_keep_runtime_marker_false=true`
- `source_runtime_blocker=source_release_relay_tunnel_runtime_not_implemented`
- required transport kind `quic_relay_tunnel`
- required encryption `quic_tls_1_3`
- explicit implementation sequence and verification commands

`write-release-go-no-go.ps1` now points the `relay-transport` next action at:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-release-relay-transport-design-gate.ps1 -BaseUrl $PublicMetadataBaseUrl -Json
```

The final operator packet and multi-device test kit now copy the design gate
script and run it first in the relay failure-injection section.

## Code Audit

NO-GO findings:

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Release relay runtime is still absent. | Design gate output reports `runtime_byte_path_missing`; P2P env status reports `source_release_relay_tunnel_runtime_not_implemented`. | Relay cannot be marketed as delegated-work transport. | Implement local `quic_relay_tunnel` byte transit. |
| NO-GO | Live relay route proof is absent. | `relay_route_evidence_count=0`, `relay_route_metadata_valid_count=0`. | No owner-scoped relay route success proof exists. | Record route_kind=relay success from a direct-blocked two-PC run. |
| NO-GO | Transport and delivery proofs are absent. | `relay_route_transport_proof_valid_count=0`, `relay_payload_delivery_proof_valid_count=0`. | Control-plane flags cannot prove payload movement. | Emit bound `musu.relay_transport_proof.v1` and `musu.relay_payload_delivery_proof.v1`. |
| INFO | KV/control token names are now present. | `show-musu-pro-p2p-env-status.ps1 -Json` reports `missing_required_names=[]`. | The remaining blocker is not GitHub/Vercel env name absence. | Focus on runtime byte path and fresh live evidence. |

## Verification

- PowerShell parser check passed for all touched scripts.
- Design gate command returned `ok=true`, `release_ready=false`,
  `runtime_marker_can_be_flipped=false`, and
  `must_keep_runtime_marker_false=true`.
- The design gate blockers were:
  `runtime_byte_path_missing`, `release_relay_route_evidence_missing`,
  `release_relay_route_metadata_missing`,
  `release_relay_transport_proof_missing`, and
  `release_relay_payload_delivery_proof_missing`.
- Release evidence verifier regression passed `220/220` with output root
  `.local-build/release-evidence-verifier-tests/20260701-152311`.

## Next Steps

1. Implement the local `quic_relay_tunnel` delegated-work byte path.
2. Emit bound `quic_tls_1_3` relay transport proof from that real byte path.
3. Attach relay payload delivery proof to owner-scoped relay route records.
4. Run physical two-PC failure injection with direct path blocked and relay task
   execution succeeding.
5. Record and verify live P2P control-plane evidence with
   `record-p2p-control-plane-evidence.ps1` and
   `verify-p2p-control-plane-evidence.ps1 -RequireIntegrity`.
6. Only after the design gate reports `runtime_marker_can_be_flipped=true`,
   remove the not-implemented runtime branch and set
   `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true`.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3703 files` / `3949 symbols`.
- Product brain ingest under `local/musu` posted 10 changed code/doc sources
  and `musu-brain process` reported `processed: 10`; a final docs-only refresh
  posted 4 updated docs and processed 4.
- Recall for
  `wiki/1223 RELEASE_RELAY_TRANSPORT_DESIGN_GATE runtime_marker_can_be_flipped audit-release-relay-transport-design-gate`
  returned the canonical report and the design gate script in the top results.
