# Relay Transport Code Audit (2026-06-30)

## Verdict

MUSU remains **NO-GO** for release-grade relay transport. The current source is
internally consistent and fail-closed: preview store-forward relay queue pieces
exist, but the product still does not have a release-grade `quic_relay_tunnel`
runtime with `quic_tls_1_3` and verified peer identity.

Latest clean gate:

- Source: `.local-build/go-no-go/latest.json`
- Generated: `2026-06-30T17:19:51.4144555+09:00`
- Commit: `fa0acd2d9733b0256a006732666e86cdabb8cecd`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `p2p_control_plane_verified=false`
- `relay_transport_product_verified=false`

Official source contract audit:

- Command: `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json`
- Generated: `2026-06-30T17:11:06.7683867+09:00`
- `ok=true`
- `fail_count=0`

Current P2P env status:

- Command: `scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json`
- Checked: `2026-06-30T17:11:08.2291762+09:00`
- `ok=false`
- `release_relay_payload_endpoint_implemented=true`
- `release_payload_endpoint_proof_bound=true`
- `release_tunnel_payload_endpoint_missing=false`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `preview_store_forward_payload_queue_non_release_grade=true`

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Release relay tunnel runtime is not implemented. | `musu-rs/src/bridge/rendezvous.rs` validates release relay tunnel metadata, then returns `release_relay_tunnel_runtime_not_implemented`. | Relay cannot be claimed as delegated-work transport. | Implement the real tunnel runtime or keep the lane red. |
| NO-GO | Router does not select relay as a work route. | `musu-rs/src/bridge/router.rs` documents relay is not selected because relay/tunnel transport is not implemented. | UI relay state must stay display/freshness only. | Add relay fallback only after runtime transport and proof are real. |
| HIGH | Release payload endpoint source gap is closed, but this is not transport completion. | Env status reports `release_relay_payload_endpoint_implemented=true`, `release_payload_endpoint_proof_bound=true`, and `release_tunnel_payload_endpoint_missing=false`; the endpoint accepts proof metadata and rejects raw payload bytes. | The old endpoint-missing diagnosis is stale, but relay still cannot move delegated-work bytes over MUSU infra. | Keep endpoint and runtime gates separate. |
| HIGH | Store-forward queue is useful but not release transport. | `musu-rs/src/bridge/handlers/relay_payload.rs` implements target-side drain/poller and delivery proof, while release delivery requires an attached `musu_quic_tls_transport` proof. | Queue delivery cannot stand in for QUIC/TLS peer-identity proof. | Keep queue evidence separate from release transport evidence. |
| HIGH | Hosted P2P control plane still lacks release storage/env proof. | Latest go/no-go blocker lists missing KV/Upstash env and live relay route metadata/transport/delivery proof. | Even a source fix would still need deployed control-plane configuration and live evidence. | Configure release storage and record owner-scoped live evidence after runtime implementation. |
| INFO | Current fail-closed behavior is correct. | Go/no-go still reports `relay_transport_product_verified=false` and `p2p_control_plane_verified=false`. | The product avoids overclaiming relay. | Preserve these red gates until two-PC direct-blocked proof passes. |

## Next Steps

1. Open/approve a dedicated relay transport design gate for the exact tunnel
   protocol, peer identity material, failure behavior, and rollback path.
2. Implement source-side `quic_relay_tunnel` connect/send and target-side
   receive/drain so payload bytes transit MUSU relay infrastructure with
   `quic_tls_1_3`.
3. Bind route evidence to source node, target node, lease/session/tunnel IDs,
   payload SHA256, peer public-key fingerprint, and delivery proof.
4. Configure hosted P2P release storage with owner-scoped KV/Upstash env; do
   not use default data paths for release proof.
5. Run two physical machines with direct path blocked, prove relay task success,
   prove heartbeat expiry/offline behavior, then rerun go/no-go.

## Qualitative Assessment

The codebase is conservative in the right place: it has enough scaffolding to
describe and verify relay transport, but it refuses to mark queue fallback as a
release-grade tunnel. The main product risk is not a hidden green false positive
in the audited files; the risk is remaining implementation scope plus live
control-plane deployment and physical proof.
