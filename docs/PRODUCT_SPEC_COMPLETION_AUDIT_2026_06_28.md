# MUSU Product Spec Completion Audit (2026-06-28)

## Verdict

MUSU is still **NO-GO** against the full product spec.

Current local evidence proves meaningful rc.22 slices: direct two-PC fleet
health, direct delegated-work over LAN, hidden-brain fresh packaged launch,
release manifest freshness, and support-gate retirement when public metadata is
reachable. It does not prove the full product because several release lanes
still require external or physical evidence.

## Latest Gate Snapshot

Authoritative local gate:

- Command source: `.local-build/go-no-go/latest.json`
- `generated_at`: `2026-06-28T11:15:57.8634815+09:00`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=1`
- `private_mesh_packaged_release_proof_verified=false`
- `public_metadata_ok=false`
- `p2p_control_plane_verified=false`
- `relay_transport_product_verified=false`
- `manifest_dirty=false`
- `commit=ab3dfb22b9c9ee34c1083ee6822910fb069df162`

Current blockers:

1. Real second-PC multi-device evidence is not recorded.
2. Packaged desktop Private Mesh release proof archive is not verified.
3. Runtime idle CPU evidence is valid on only one physical machine.
4. Runtime CPU scenario matrix evidence is valid on only one physical machine.
5. `https://musu.pro` public metadata fetches fail with `request_failed`.
6. Partner Center, Microsoft certification, and restricted capability approval
   evidence is missing.
7. P2P control-plane release relay evidence is not verified.
8. Explicit design approval evidence is missing.
9. Real delegated-work relay transport proof is missing.
10. V34 stale self-heal physical proof is missing.

## P2P / Relay Audit

Fresh local source audit:

- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`
- `schema=musu.p2p_store_forward_relay_contract.v1`
- `ok=true`
- `fail_count=0`
- `generated_at=2026-06-28T11:11:37.1752339+09:00`

Interpretation: the source contract is internally consistent. The preview
store-forward queue is correctly labeled non-release-grade, release preflight
routes reject payload bytes, route evidence requires release transport proof,
and tests cover the fail-closed separation.

Fresh P2P environment status:

- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`
- `schema=musu.p2p_control_plane_env_status.v1`
- `ok=false`
- `checked_at=2026-06-28T11:11:38.1661683+09:00`
- `relay_payload_queue_fallback_implemented=true`
- `release_relay_connect_endpoint_implemented=true`
- `release_relay_payload_endpoint_implemented=false`
- `release_payload_preflight_endpoint_implemented=true`
- `release_payload_preflight_only=true`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `preview_store_forward_payload_queue_non_release_grade=true`
- `relay_transport_kind=quic_relay_tunnel`
- `release_grade_transport_required=quic_tls_1_3`

Active P2P blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

Do not flip `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED` or
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED` until a real release tunnel moves payload
bytes through `quic_relay_tunnel`, emits MUSU-bound `quic_tls_1_3` transport
proof, and records release-grade route evidence. Marker-only changes would
weaken the product contract and overclaim relay routing.

## Public Metadata Audit

Fresh public metadata verifier:

- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json`
- `schema=musu.store_public_metadata_verification.v2`
- `ok=false`
- `checked_at=2026-06-28T11:11:38.4946762+09:00`
- `fail_count=3`
- `failure_kinds=request_failed`
- Failed routes:
  - `https://musu.pro/privacy`
  - `https://musu.pro/support`
  - `https://musu.pro/api/public-config`

This confirms the public metadata lane is still blocked from this machine. The
failure happens before HTTP content can be verified, so page text or config
fields cannot satisfy the release gate until apex HTTPS is repaired.

## Private Mesh Packaged Proof Audit

Fresh local investigation found a real proof-path defect, not completion of the
Private Mesh lane.

Observed on `HUGH_SECOND`:

- `musu mesh status --json` could see the live private mesh state:
  `hugh_second`, tailnet IP `100.64.0.1`, control server
  `https://mesh.musu.pro`, and `control_server_verified=true`.
- `~/.musu/private_mesh.toml` had no `mesh.node_name`.
- The same config had stale `verification.local_tailnet_ip=100.64.0.2`.
- Before the fix, `musu mesh physical-peer-evidence --json` failed with
  `physical peer evidence requires mesh.node_name`.

Code fix:

- `run_physical_peer_evidence` now resolves `node_name` from `mesh.node_name`
  or live `tailscale status --json` `Self.HostName`.
- It resolves `tailnet_ip` from live `tailscale ip -4` before falling back to
  persisted `verification.local_tailnet_ip`.
- Evidence now records `node_name_source`, `tailnet_ip_source`, and
  `persisted_tailnet_ip`.

Verification:

- Targeted test:
  `cargo test --manifest-path musu-rs\Cargo.toml --lib parse_tailnet_status_hostname -- --nocapture`
  passed with `2 passed`, `0 failed`.
- Actual debug CLI path:
  `cargo run --manifest-path musu-rs\Cargo.toml --bin musu -- mesh physical-peer-evidence --output .local-build\private-mesh-physical-peer\20260628-codex\hugh_second.physical-peer-evidence.json --json`
  produced `ok=true`, `node_name=hugh_second`, `tailnet_ip=100.64.0.1`,
  `control_server_verified=true`.

Scope: this validates the source fix and the local debug CLI path. It does not
close `private_mesh_packaged_release_proof_verified`, because the release gate
requires a current packaged build with this fix installed on physical machines,
target-generated physical peer evidence from the opposite PC, and a verified
release proof archive. See
`docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`.

Build/test caveat: an earlier broad filtered Cargo test compiled unrelated
integration targets and failed on this Windows host with paging-file/memory
errors (`os error 1455`, `LNK1102`). Narrow checks should use `--lib` and
`CARGO_BUILD_JOBS=1` on this machine.

## System Design Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product spec is not complete. | Latest go/no-go has `full_product_spec_ready=false` and 10 blockers. | A release-ready claim would overstate the evidence. | Keep the claim scoped to proven rc.22 slices only. |
| NO-GO | Public metadata cannot be verified over canonical HTTPS. | `verify-store-public-metadata.ps1` fails all three canonical routes with `request_failed`. | Privacy/support/public-config and Store metadata proof remain blocked. | Repair apex DNS/TLS, then rerun verifier and go/no-go. |
| NO-GO | Relay is not a delegated-work transport yet. | P2P env status has release payload endpoint false, runtime false, and live relay proof missing. | Relay cannot be marketed as task routing fallback. | Implement release tunnel runtime, proof emission, and direct-blocked two-PC proof. |
| HIGH | Private Mesh physical-peer evidence had stale-config coupling. | `mesh.node_name` missing and persisted tailnet IP stale, while live Tailscale state was usable. Source now falls back to live `Self.HostName` and `tailscale ip -4`; debug CLI evidence generation passes. | This removes a local proof generator failure, but not the packaged release proof blocker. | Rebuild/install the package with this fix on both PCs, collect target evidence from `hugh-main`, then run the archive verifier. |
| HIGH | P2P source is fail-closed rather than broken. | Store-forward relay contract audit reports `ok=true`, `fail_count=0`. | The current code protects against false release relay claims. | Preserve fail-closed behavior while building the real runtime. |
| HIGH | Several remaining lanes require physical or external evidence. | second-PC CPU/matrix, Store, design approval, V34 physical proof remain blockers. | Local source edits alone cannot close the release gate. | Collect proof on `hugh-main`, Partner Center/Store, and V34 physical stale-state setup. |

## Next Actions

1. On `hugh-main`, run the current second-PC kit from
   `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md` and return the generated
   `.local-build/second-pc-return/*.zip`.
2. Build and install a current package containing the Private Mesh
   physical-peer evidence fallback fix, then follow
   `docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`.
3. Repair `https://musu.pro` apex DNS/TLS so `/privacy`, `/support`, and
   `/api/public-config` pass from `HUGH_SECOND`.
4. Provision release-grade P2P storage with KV or Upstash env values, without
   printing secret values.
5. Build the real relay tunnel runtime before flipping release relay markers.
6. Record V34 stale self-heal proof on two physical nodes with stale registry,
   stale local cache, stale manual peer, boot reconcile, and route-preflight
   evidence.
7. Obtain explicit design approval and Store/Partner Center evidence.
8. Rerun `write-release-go-no-go.ps1`, index the final docs/evidence, and only
   then claim full product spec completion.
