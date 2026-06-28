# MUSU Product Spec Completion Audit (2026-06-28)

## Verdict

MUSU is still **NO-GO** against the full product spec.

Recent local evidence proves meaningful rc.22 slices: direct two-PC fleet
health, direct delegated-work over LAN, hidden-brain fresh packaged launch,
HUGH_SECOND packaged smoke/process/startup/desktop evidence, HUGH_SECOND runtime
CPU evidence, release manifest freshness, and support-gate retirement when
public metadata is reachable. The post-design-gate evidence refresh restored the
current-package local lanes, but it does not prove the full product because
several release lanes still require external or physical evidence.

## Latest Gate Snapshot

Authoritative local gate:

- Command source: `.local-build/go-no-go/latest.json`
- Snapshot file: `.local-build/go-no-go/latest.json`
- `generated_at`: `2026-06-28T17:32:55.4349035+09:00`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=0`
- `single_machine_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_idle_cpu_verified=false`
- `runtime_idle_cpu_valid_machines=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_verified=false`
- `runtime_cpu_scenario_matrix_valid_machines=1/2 [HUGH_SECOND]`
- `private_mesh_packaged_release_proof_verified=false`
- `public_metadata_ok=false`
- `p2p_control_plane_verified=false`
- `relay_transport_product_verified=false`
- `manifest_dirty=false`
- `manifest_dirty=false`

2026-06-28 17:23 KST current-package evidence refresh after design-gate
hardening: after refreshing the HUGH_SECOND local package evidence and rerunning
`write-release-go-no-go.ps1 -Json`, the gate reports
`full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`, and
`manifest_git.dirty=false`. The local freshness lanes are green again:
`single_machine_verified=true`, `process_ownership_verified=true`,
`startup_single_instance_verified=true`, `desktop_single_instance_verified=true`,
and `runtime_cpu_second_pc_route_attempt_verified=true`. The remaining blockers
are now the substantive physical/external product gates: multi-device, Private
Mesh packaged proof, two-machine CPU/matrix, public metadata DNS/TLS, Store,
P2P control plane, design approval, relay transport, and V34 stale self-heal.
Post-doc commit recheck at `2026-06-28T17:32:55.4349035+09:00` confirmed the
same `blockers=10`, `warnings=0`, and local freshness lanes green.

2026-06-28 16:55 KST post-design-gate clean-HEAD recheck: after committing the
design-gate approval URL hardening, `write-release-go-no-go.ps1 -Json`
reports `full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=15`, `warnings=0`, and
`manifest_git.dirty=false`. This is expected fail-closed freshness behavior:
the five reopened lanes are `single-machine`,
`process-ownership`, `startup-single-instance`, `desktop-single-instance`, and
`runtime-cpu-second-pc-route-attempt`. The previous physical/external blockers
remain open as well.

2026-06-28 16:37 KST clean-HEAD recheck: after the second-PC latest-output
contract fix and handoff/wiki refresh, `write-release-go-no-go.ps1 -Json`
still reports `full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`, and
`manifest_git.dirty=false`. The blocker list did not change: multi-device,
Private Mesh packaged proof, two-machine idle CPU, two-machine CPU scenario
matrix, store public metadata, Store release, P2P control plane, design
approval, relay transport, and V34 stale self-heal remain open.

2026-06-28 13:53 KST current-HEAD refresh: after the public metadata diagnostic
commits reopened five freshness lanes, fresh HUGH_SECOND packaged evidence was
captured and committed. The local single-machine, process ownership,
startup/desktop single-instance, and targeted second-PC route-attempt lanes are
green again. The product remains NO-GO because the remaining blockers require
second physical machine, DNS/edge, Store, relay, design, or V34 proof.

2026-06-28 14:24 KST clean-HEAD recheck: after adding
`prepare-multidevice-test-kit.ps1 -Json` support, regenerating the second-PC
kit, refreshing the release candidate manifest, and updating the handoff/wiki,
`write-release-go-no-go.ps1 -Json` still reports `blockers=10`, `warnings=1`,
`manifest_git.dirty=false`, and commit
`bcbaba71492722f1ebcf4435800789e959ea88ab`. The same local evidence lanes stay
green (`single_machine_verified`, `process_ownership_verified`,
`startup_single_instance_verified`, `desktop_single_instance_verified`, and
`runtime_cpu_second_pc_route_attempt_verified`), so the JSON kit tooling change
did not reopen package freshness blockers.

2026-06-28 14:36 KST P2P integrity recheck: after committing fresh P2P
control-plane evidence plus `.sha256` sidecar at
`6d28c0e3f5fe7042638b25f261dbaae69e086e14`,
`write-release-go-no-go.ps1 -Json` reports `blockers=10`, `warnings=0`,
`manifest_git.dirty=false`, `p2p_control_plane_evidence_integrity_status=verified`,
and `p2p_control_plane_evidence_integrity_ok=true`. This closes the stale
integrity-sidecar warning only. The product remains NO-GO because
`p2p_control_plane_verified=false` and `relay_transport_product_verified=false`.

2026-06-28 14:55 KST desktop-latest cache-buster recheck: guarded upload updated
the GitHub `desktop-latest` `musu-desktop-x64.msix` asset metadata to
`40710731` bytes. The stale package-version-only URL continued to return the
previous CDN object, so `publicRelease.ts` now appends the current MSIX SHA256 as
an `asset=` cache key on every desktop-latest URL. Fresh canary evidence at
`docs/evidence/desktop-release-canary/1.15.0-rc.22/20260628-1455-desktop-release-canary-after-cachebuster.json`
reports `ok=true`, `failure_count=0`, and hosted MSIX/setup lengths matching
local artifacts. This closes the desktop asset cache/drift issue found during
the site-deploy preflight, but the canonical `https://musu.pro` public metadata
blocker remains because apex HTTPS still resets and DNS authority still points
at Cloudflare nameservers.

2026-06-28 15:25 KST post-push CI/live recheck: commit
`4462b8e6d9acfdf99bd560b86be7e9c69e32a66c` was pushed to PR #34. The PR
`Deploy musu-bee to Vercel`, `Tests`, `E2E Tests`, `SaaS Route Gate`, and
`Landing CEO Approval Gate` jobs passed, while `Design Gate` failed because
explicit design approval is still missing. A fresh live
`verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json` still reports
`ok=false`, `fail_count=3`, `request_failed,dns_nameserver_mismatch`, Cloudflare
nameservers (`blakely.ns.cloudflare.com`, `weston.ns.cloudflare.com`), and
failed `/privacy`, `/support`, and `/api/public-config` fetches. So the Vercel
deploy path is green for this push, but the product remains NO-GO until the
apex public metadata path and design approval gate are both green.

2026-06-28 15:39 KST edge TLS diagnostic hardening:
`verify-store-public-metadata.ps1` now records `edge_tls_diagnostics` in
addition to DNS diagnostics. Fresh evidence at
`docs/evidence/store-public-metadata/1.15.0-rc.22/20260628-153929-musu-pro-public-metadata-edge-diagnostics.json`
reports `failure_kinds=request_failed,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`.
The canonical apex TLS handshake fails, `www.musu.pro` TLS succeeds, and direct
Vercel edge probing for apex SNI has zero passing probes. SHA256:
`31185299722926F368589E1638578E45FF24207DC09FA587860E19458534F343`.
This narrows the remaining public metadata blocker to the apex DNS/certificate
edge binding, not missing Next.js route source or a failed Vercel deploy.

2026-06-28 16:05 KST public metadata DNS repair planner:
`scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1` now emits a
non-mutating `musu.public_metadata_dns_repair_plan.v1` JSON plan before any
operator edits external DNS. Evidence at
`docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-160524-musu-pro-dns-repair-plan.json`
reports `release_blocker_present=true`,
`ready_for_public_metadata_verifier=false`, `will_mutate_external_dns=false`,
Cloudflare nameservers, Cloudflare apex A/AAAA records, apex TLS failure,
`www_tls.ok=true`, and `vercel_edge_apex_tls_ok=false`. SHA256:
`3B99B6F35E7E190D9C75B775E4B753568CA1500F2CE7498A1D80CF44173560C8`.
The go/no-go `store-public-metadata` next action now points to this planner
before rerunning `verify-store-public-metadata.ps1`; the product remains NO-GO
until the external DNS/TLS repair is actually performed and the verifier passes.

2026-06-28 16:49 KST design-gate hardening: `scripts/design-gate/evaluate.cjs`
now requires a real GitHub issue approval comment URL in addition to the
standalone `Design: Approved` line, design brief issue URL, and `.pen`/`.png`
artifact URL. `scripts/design-gate/evaluate.test.cjs` covers the case where the
PR body says approval is pending or only mentions the token as an instruction.
This prevents a false design approval pass; it does not close the blocker
because issue #35 still lacks an explicit CEO/design approval comment.

Current blockers:

1. Real second-PC multi-device evidence is not recorded.
2. Packaged desktop Private Mesh release proof archive is not verified.
3. Runtime idle CPU evidence is valid on too few physical machines.
4. Runtime CPU scenario matrix evidence is valid on too few physical machines.
5. `https://musu.pro` public metadata fetches fail with
   `request_failed,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`.
6. Partner Center, Microsoft certification, and restricted capability approval
   evidence is missing.
7. P2P control-plane release relay evidence is not verified.
8. Explicit design approval evidence is missing.
9. Real delegated-work relay transport proof is missing.
10. V34 stale self-heal physical proof is missing.

Current-package evidence recorded after the post-design-gate 15-blocker
snapshot:

- Rebuilt local sideload MSIX:
  `.local-build\msix\output\musu_1.15.0.22_x64_local-sideload-manual.msix`,
  last written `2026-06-28T12:26:06+09:00`, size `40710731` bytes.
- Single-machine packaged smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-170703-HUGH_SECOND.evidence.json`
  plus verification and summary files; verification reports `ok=true`,
  `fail_count=0`, `allow_developer_runtime=false`, and bridge
  `http://127.0.0.1:1695`.
- Process/startup/desktop instance evidence:
  `20260628-170721-HUGH_SECOND.process-ownership.json`,
  `20260628-170721-HUGH_SECOND.startup-single-instance.json`, and
  `20260628-171002-HUGH_SECOND.desktop-single-instance.json` all report
  `ok=true` and `fail_count=0`.
- Runtime CPU evidence:
  `20260628-171827-HUGH_SECOND.desktop-open.evidence.json` reports `ok=true`,
  clean git, `include_node=true`, `include_webview2=true`, 60.033s sample, six
  owned WebView2 helpers, zero owned Node helpers, and `hot_process_count=0`.
- Runtime CPU scenario matrix:
  `20260628-171057-HUGH_SECOND.runtime-cpu-scenario-matrix.json` plus
  `.verification.json` report `ok=true`, `fail_count=0`, clean git, required
  scenarios `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`, with successful route probe to
  `hugh-main` at `192.168.1.192:4387` using token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_171057`.

This closes the HUGH_SECOND current-package smoke/process/startup/desktop
blockers and restores the current second-PC route-attempt lane. It does not
close the runtime CPU release gates because those require verifier-passing
evidence from at least two physical machines.

Second-PC kit refresh after this evidence and the JSON next-action fix:

- Kit zip:
  `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260628-163218.zip`.
- Kit metadata:
  `version=1.15.0-rc.22`, branch `feat/v33-residual-finalize`, commit
  `067a22c4f837fac70a31bda219b5970dfc5260ce`, and `dirty=false`.
- Generator result:
  `schema=musu.multidevice_test_kit_prepare.v1`, `ok=true`,
  `generated_at=2026-06-28T16:32:32.0882236+09:00`, and
  `.local-build\multi-device-test-kit\latest-prepare-output.json` now proves
  the go/no-go `prepare-multidevice-test-kit.ps1 -Json` next action is
  executable and no longer leaves the latest pointer stale.
- Release manifest artifact:
  current generated zip size `81116474`, SHA256
  `192b0e949efb84781dc6e028010a59c2bdd54fc9f05f66af793c60b2f4741b6f`.
- Current handoff:
  `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`.

This does not close the second-PC blockers by itself; it updates the artifact
that must be extracted and run on `hugh-main`.

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
- `checked_at=2026-06-28T16:20:30.6528544+09:00`
- `relay_payload_queue_fallback_implemented=true`
- `release_relay_connect_endpoint_implemented=true`
- `release_relay_payload_endpoint_implemented=false`
- `release_payload_preflight_endpoint_implemented=true`
- `release_payload_preflight_only=true`
- `release_tunnel_payload_endpoint_missing=true`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `preview_store_forward_payload_queue_non_release_grade=true`
- `relay_transport_kind=quic_relay_tunnel`
- `release_grade_transport_required=quic_tls_1_3`

Fresh P2P live evidence with integrity sidecar:

- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -BaseUrl https://musu.pro -AllowUnverified -Json`
- Evidence:
  `docs/evidence/p2p-control-plane/1.15.0-rc.22/20260628-143223-musu.pro.evidence.json`
- Integrity sidecar:
  `docs/evidence/p2p-control-plane/1.15.0-rc.22/20260628-143223-musu.pro.evidence.json.sha256`
- Strict verification:
  `verify-p2p-control-plane-evidence.ps1 -RequireIntegrity` reports
  `ok=false`, `fail_count=39`, `evidence_integrity_status=verified`, and
  `evidence_integrity_ok=true`.
- Meaning:
  the old sidecar-missing integrity warning is addressed by a current evidence
  file, but the P2P release lane remains NO-GO because relay lease storage,
  release payload endpoint, relay tunnel runtime, release route evidence,
  relay transport proof, and relay payload delivery proof are still missing.

Active P2P blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_unknown`
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
- `checked_at=2026-06-28T13:13:06.2166826+09:00`
- `fail_count=3`
- `failure_kinds=request_failed,dns_nameserver_mismatch`
- Failed routes:
  - `https://musu.pro/privacy`
  - `https://musu.pro/support`
  - `https://musu.pro/api/public-config`
- DNS diagnostics:
  - `host=musu.pro`
  - `nameserver_matches_expected=false`
  - `provider_guess=cloudflare`
  - current nameservers: `blakely.ns.cloudflare.com`,
    `weston.ns.cloudflare.com`
  - expected nameservers: `ns1.vercel-dns.com`, `ns2.vercel-dns.com`
  - A records: `104.21.82.53`, `172.67.196.17`
  - AAAA records: `2606:4700:3033::ac43:c411`,
    `2606:4700:3037::6815:5235`

This confirms the public metadata lane is still blocked from this machine. The
failure happens before HTTP content can be verified. Page text or config fields
cannot satisfy the release gate until the canonical apex DNS/edge path is
repaired and this verifier passes.

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

Scope: this validates the source fix and the local debug CLI path. A current
HUGH_SECOND package has since been rebuilt and local packaged evidence refreshed,
but that still does not close `private_mesh_packaged_release_proof_verified`,
because the release gate requires target-generated physical peer evidence from
the opposite PC and a verified release proof archive. See
`docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`.

Build/test caveat: an earlier broad filtered Cargo test compiled unrelated
integration targets and failed on this Windows host with paging-file/memory
errors (`os error 1455`, `LNK1102`). Narrow checks should use `--lib` and
`CARGO_BUILD_JOBS=1` on this machine.

## System Design Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product spec is not complete. | Latest clean product gate at `2026-06-28T17:32:55.4349035+09:00` has `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`, local freshness lanes green, and `manifest_git.dirty=false`. | A release-ready claim would overstate the evidence. | Close the remaining physical/external product blockers. |
| NO-GO | Public metadata cannot be verified over canonical HTTPS and DNS authority does not match Vercel's intended nameservers. | `verify-store-public-metadata.ps1` fails all three canonical routes with `request_failed,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`; the DNS repair planner records Cloudflare NS plus Cloudflare apex A/AAAA records, apex TLS failure, `www_tls.ok=true`, and `vercel_edge_apex_tls_ok=false`. | Privacy/support/public-config and Store metadata proof remain blocked. | Repair apex DNS/TLS using the non-mutating planner output, then rerun verifier and go/no-go. |
| NO-GO | Relay is not a delegated-work transport yet. | P2P env status has release payload endpoint false, runtime false, and live relay proof missing. | Relay cannot be marketed as task routing fallback. | Implement release tunnel runtime, proof emission, and direct-blocked two-PC proof. |
| HIGH | Design approval is now URL-evidence-gated, but still missing. | `design-gate` requires a standalone `Design: Approved` line plus a GitHub `#issuecomment-...` approval URL; issue #35 currently has evidence-refresh comments, not approval. | PR #34 remains blocked and cannot be merged honestly. | Add explicit CEO/design approval on issue #35, then update the PR body with that approval comment URL. |
| HIGH | Private Mesh physical-peer evidence had stale-config coupling. | `mesh.node_name` missing and persisted tailnet IP stale, while live Tailscale state was usable. Source now falls back to live `Self.HostName` and `tailscale ip -4`; debug CLI evidence generation passes. | This removes a local proof generator failure, but not the packaged release proof blocker. | Rebuild/install the package with this fix on both PCs, collect target evidence from `hugh-main`, then run the archive verifier. |
| HIGH | P2P source is fail-closed rather than broken. | Store-forward relay contract audit reports `ok=true`, `fail_count=0`. | The current code protects against false release relay claims. | Preserve fail-closed behavior while building the real runtime. |
| INFO | Public desktop artifact URL cache key is now artifact-bound instead of package-version-only. | GitHub release metadata reports `musu-desktop-x64.msix` size `40710731`; canary evidence `20260628-1455-desktop-release-canary-after-cachebuster.json` reports `ok=true` and `hosted_msix_length.ok=true`. | The one-line installer/download path no longer depends on stale CDN state after same-version `desktop-latest` clobber uploads. | Deploy the site so `musu.pro` serves the updated URLs; apex DNS/TLS still needs separate repair. |
| INFO | HUGH_SECOND current-package freshness was restored after design-gate hardening. | The 17:23 clean gate has `single_machine_verified=true`, `process_ownership_verified=true`, `startup_single_instance_verified=true`, `desktop_single_instance_verified=true`, and `runtime_cpu_second_pc_route_attempt_verified=true`; latest evidence includes `20260628-170703`, `20260628-170721`, `20260628-171002`, `20260628-171057`, and `20260628-171827` files. | Local package smoke/process/startup/desktop and targeted route-attempt lanes are no longer blockers. | Keep these lanes fresh after any runtime-affecting source or package change. |
| HIGH | Runtime CPU remains one-machine evidence. | Latest go/no-go has `runtime_idle_cpu_verified=false` and `runtime_cpu_scenario_matrix_verified=false` even though HUGH_SECOND evidence passes. | Release cannot claim CPU/matrix readiness until `hugh-main` also produces verifier-passing evidence. | Run/import the second-PC kit from `hugh-main`. |
| HIGH | Several remaining lanes require physical or external evidence. | second-PC multi-device/CPU/matrix, Private Mesh packaged archive, Store, design approval, relay, and V34 physical proof remain blockers. | Local source edits alone cannot close the release gate. | Collect proof on `hugh-main`, Partner Center/Store, and V34 physical stale-state setup. |

## Next Actions

1. On `hugh-main`, run the current second-PC kit from
   `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md` and return the generated
   `.local-build/second-pc-return/*.zip`.
2. With a current package installed on both PCs, follow
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
