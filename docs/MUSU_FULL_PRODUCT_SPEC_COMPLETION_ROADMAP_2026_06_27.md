# MUSU Full Product Spec Completion Roadmap (2026-06-27)

## Direct Answer

MUSU is not fully complete against the whole product spec yet.

The current `1.15.0-rc.22` package has a strong two-PC direct fleet proof:
`hugh-main` and `hugh_second` are both direct/healthy, the installed package
matches `1.15.0.22`, public install/proof routes are release-pinned, remote
public URLs are usable, and the brain ingest token ACL check passes on the
main PC proof.

That proves the direct LAN fleet health slice. A later packaged route probe
from `hugh_second` to `hugh-main` now also proves direct delegated-work
targetability for the current rc.22 package: the installed CLI selected the LAN
candidate `192.168.1.192:4387`, submitted successfully, waited for completion,
and wrote verifier-passing `musu.route_evidence.v1`.

The fresh packaged desktop also records a passing hidden-brain product proof
for rc.22, and HUGH_SECOND now has refreshed current evidence for the local
single-machine smoke lane plus runtime CPU evidence for the current gate:
`desktop-open` idle CPU and the full five-scenario runtime CPU matrix both
verify on `HUGH_SECOND`, including a targeted `hugh-main` post-route probe. The
latest clean go/no-go recheck at `2026-06-30T17:19:51+09:00` on commit
`fa0acd2d9733b0256a006732666e86cdabb8cecd` still reports
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`blockers=10`, `warnings=0`, and `manifest_git.dirty=false`.

That current state still does not prove the full product: second-machine CPU
evidence, release-grade multi-device route identity, packaged Private Mesh
proof archive, public metadata DNS/TLS, Store release/Store-signed install
evidence, real relay transport, explicit design approval, and V34 stale
self-heal proof still remain.

2026-06-30 16:57 KST second-PC kit / Private Mesh handoff update:
`run-second-pc-release-check.ps1` now captures target-side
`musu.private_mesh_physical_peer_evidence.v1` by default, includes the JSON and
`.sha256` sidecar in the second-PC return zip, and
`import-second-pc-return.ps1` imports that evidence into
`.local-build\private-mesh-physical-peer\`. The regenerated clean-HEAD kit is:
`.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260630-165500.zip`,
SHA256
`78f126b9c67c5c867bceecb1e739694697a0dc840fe6c6a7c1f3dba8ca14f0aa`,
source commit `87ffa7a5c76eb36d8a4ce3982d76a1860ecd3ddc`, `dirty=false`.
Regression verifier: `test-release-evidence-verifiers.ps1 -Json` passed with
`case_count=219`, `failed_case_count=0`. This reduces operator friction for
the `private-mesh-packaged-release-proof` lane, but it does not close that
lane: `hugh-main` must still return the zip, the source PC must run/import a
packaged desktop Private Mesh release-proof archive, and the archive verifier
must pass before `private_mesh_packaged_release_proof_verified=true`.

2026-06-30 17:12 KST P2P/relay status correction:
`show-musu-pro-p2p-env-status.ps1 -Json` now reports
`release_relay_payload_endpoint_implemented=true`,
`release_payload_endpoint_proof_bound=true`, and
`release_tunnel_payload_endpoint_missing=false`. The old "release payload
endpoint missing" source gap is therefore superseded. The product remains
NO-GO because the same status still reports
`release_relay_tunnel_runtime_implemented=false`,
`release_relay_tunnel_runtime_not_implemented_branch_active=true`,
`preview_store_forward_payload_queue_non_release_grade=true`, missing
KV/Upstash URL/token configuration, and missing live P2P control-plane
evidence. The local P2P store-forward relay source audit at
`2026-06-30T17:11:06+09:00` passed with `ok=true`, `fail_count=0`; this proves
the fail-closed source contract, not release relay transport completion.

2026-06-30 17:26 KST Vercel P2P env sync hardening:
`.github/workflows/deploy-musu-bee.yml` now syncs production P2P control-plane
env through Vercel REST `POST /v10/projects/{projectId}/env?upsert=true`
instead of `vercel env add`. Token-bearing values are marked Vercel
`sensitive`, and failure logs report only key/status summaries. The
`audit-secret-storage-contract.ps1` source contract now guards that workflow
shape and rejects a return to `vercel env add` or raw response-body logging.
Verification passed `audit-secret-storage-contract.ps1 -Json -FailOnProblem`
with `ok=true`, `fail_count=0`, and
`test-release-evidence-verifiers.ps1 -Json` with `ok=true`, `case_count=219`,
`failed_case_count=0`.
Canonical report:
`docs/VERCEL_P2P_ENV_SYNC_AUDIT_2026_06_30.md`. This reduces the deployment
path risk for the hosted P2P blocker, but it does not close the lane until real
KV/Upstash/env values are present in GitHub/Vercel, production deploy succeeds,
and live P2P control-plane evidence passes.

2026-06-28 11:11 KST audit refresh: the product remains NO-GO. The fresh local
P2P store-forward relay contract audit passes (`ok=true`, `fail_count=0`), so
the source contract is internally consistent and still fail-closed. The P2P
environment status remains `ok=false`: release relay payload endpoint and
release tunnel runtime are intentionally false, KV/Upstash release storage is
not configured, and live release relay route/transport/delivery proof is
missing. The public metadata verifier still fails all canonical
`https://musu.pro` routes with `request_failed`. See
`docs/PRODUCT_SPEC_COMPLETION_AUDIT_2026_06_28.md` for the current blocker
map and next actions.

2026-06-28 doctor relay poller alignment: the runtime relay payload poller is
default-on with explicit opt-out, and `musu doctor --json` now uses the same
runtime decision helper instead of treating `MUSU_ENABLE_RELAY_PAYLOAD_POLLER`
as an env-opt-in. This fixes an evidence/observability mismatch only. It does
not implement the release relay tunnel runtime, provision relay storage, prove
payload delivery, or close `relay_transport_product_verified=false`. See
`docs/DOCTOR_RELAY_POLLER_RUNTIME_ALIGNMENT_2026_06_28.md`.

2026-06-28 22:26 KST post-source gate: after commit
`fb971909670df187f364c3741d0a2fc54e45a26f`, go/no-go reports
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`blockers=15`, `warnings=0`, and `manifest_git.dirty=false`. The added five
blockers are source-freshness invalidations for single-machine smoke, process
ownership, startup single-instance, desktop single-instance, and runtime CPU
second-PC route-attempt evidence. The full-product incomplete lanes remain
`design_approval`, `relay_transport`, `v34_stale_self_heal`, and
`store_distribution`.

2026-06-28 Private Mesh evidence update: the product still has
`private_mesh_packaged_release_proof_verified=false`, but one proof generator
defect is fixed in source. `musu mesh physical-peer-evidence` must not fail
only because `mesh.node_name` is absent from `~/.musu/private_mesh.toml` when
the live Tailscale status reports `Self.HostName`; it now falls back to that
live hostname. It also prefers live `tailscale ip -4` over stale persisted
`verification.local_tailnet_ip` and records `node_name_source`,
`tailnet_ip_source`, and `persisted_tailnet_ip` in evidence. On `HUGH_SECOND`,
this turned a config-only failure into a debug CLI proof with
`node_name=hugh_second`, `tailnet_ip=100.64.0.1`, and
`control_server_verified=true`. This is a source fix only: the packaged release
gate still requires a rebuilt package, target-generated evidence from the
opposite physical PC, and a verified release proof archive. Handoff:
`docs/PRIVATE_MESH_PACKAGED_RELEASE_PROOF_HANDOFF_2026_06_28.md`.

Historical 2026-06-28 11:56 KST post-code-commit gate: after committing the
Private Mesh source/doc update, `write-release-go-no-go.ps1 -Json` reported
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`blockers=15`, `warnings=1`, `manifest_git.dirty=false`, and commit
`fb90715d60303ac463e609b9543de14687f16261`. The blocker count increased from
the earlier 10-blocker snapshot because the current source commit means local
packaged evidence lanes such as single-machine smoke, process ownership,
startup single-instance, desktop repeated activation, and CPU evidence must be
refreshed or rebuilt against the current package before the gate can count them.
This was correct fail-closed behavior and is superseded by the 13:53 current-
HEAD evidence refresh below.

2026-06-28 13:53 KST current-HEAD package evidence refresh: after refreshing the
HUGH_SECOND packaged evidence against commit
`a58a9fb039f9d39a7272f21474c75ac8aff8ab01`, the local go/no-go snapshot reports
`blockers=10`, `warnings=1`, and `manifest_git.dirty=false`. The gate now
reports
`single_machine_verified=true`, `process_ownership_verified=true`,
`startup_single_instance_verified=true`,
`desktop_single_instance_verified=true`, and
`runtime_cpu_second_pc_route_attempt_verified=true`. It still reports
`runtime_idle_cpu_verified=false` with
`runtime_idle_cpu_valid_machines=1/2 [HUGH_SECOND]`,
`runtime_cpu_scenario_matrix_verified=false`,
`private_mesh_packaged_release_proof_verified=false`,
`public_metadata_ok=false`, `p2p_control_plane_verified=false`, and
`relay_transport_product_verified=false`. The product is still NO-GO, but the
local current-package evidence lanes are no longer the blocker. The latest
second-PC kit is now regenerated from clean commit
`8e82fae46eb25b59171627627cab5dcfba7e847f` at
`.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260628-204644.zip`
with SHA256
`6718085a3765f6159e1f9571974e477f343a5825c536d99267d86335b22d0396`, and
`docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md` now points `hugh-main` at that kit.
The kit generator now also persists
`.local-build\multi-device-test-kit\latest-prepare-output.json`, so the
operator-facing latest pointer cannot silently remain on an older kit.

2026-06-28 14:24 KST clean-HEAD gate recheck: after the second-PC kit JSON
contract fix and docs/wiki refresh, `write-release-go-no-go.ps1 -Json`
generated `.local-build\go-no-go\after-second-pc-kit-json-refresh.json` with
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`blockers=10`, `warnings=1`, `manifest_git.dirty=false`, and commit
`bcbaba71492722f1ebcf4435800789e959ea88ab`. The local freshness lanes remained
green; the remaining blockers are still physical/external product gates, not
the second-PC kit command.

2026-06-28 14:36 KST P2P integrity warning closure: after recording fresh
P2P control-plane evidence with a SHA256 sidecar and committing it at
`6d28c0e3f5fe7042638b25f261dbaae69e086e14`,
`write-release-go-no-go.ps1 -Json` generated
`.local-build\go-no-go\after-p2p-integrity-refresh.json` with
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`blockers=10`, `warnings=0`, `manifest_git.dirty=false`,
`p2p_control_plane_verified=false`, and
`relay_transport_product_verified=false`. The stale sidecar warning is closed;
the product is still NO-GO because the P2P release relay runtime, route
metadata/proof, payload delivery proof, and the other physical/external gates
are still missing.

2026-06-28 14:55 KST desktop-latest cache-buster update: the guarded publisher
uploaded the current rc.22 `musu-desktop-x64.msix` to the GitHub
`desktop-latest` release, and GitHub release metadata now reports the expected
current size `40710731` bytes. The old `?rc=1.15.0.22` download URL still
returned the previous CDN object immediately after upload, so public desktop
artifact URLs now include an `asset=` cache key derived from the current MSIX
SHA256 (`74972ffac7768076c5a04c5e1e800e0a452cdf399719c664f0059545ef9d54c1`).
`canary-desktop-release.ps1 -Json` now passes with `ok=true`,
`failure_count=0`, and `hosted_msix_length.remote_length=40710731` using those
new URLs. Evidence:
`docs/evidence/desktop-release-canary/1.15.0-rc.22/20260628-1455-desktop-release-canary-after-cachebuster.json`.
This fixes a real install/download drift hazard, but it does not repair the
canonical apex `https://musu.pro` DNS/TLS blocker.

2026-06-28 15:25 KST post-push status: commit
`4462b8e6d9acfdf99bd560b86be7e9c69e32a66c` is pushed to
`origin/feat/v33-residual-finalize`. GitHub PR checks show the Vercel deploy,
web/Rust tests, E2E, SaaS route gate, and landing CEO approval gate passing for
the push, but `Design Gate` still fails. A fresh canonical public metadata
verification after that deploy still fails with
`request_failed,dns_nameserver_mismatch`; `https://musu.pro/privacy`,
`/support`, and `/api/public-config` remain unreachable from this machine, and
the current nameservers are Cloudflare rather than the Vercel DNS pair expected
by the verifier. This means the site deploy succeeded, but the product spec is
still not complete.

2026-06-28 15:39 KST public metadata edge diagnostic update: the verifier now
emits `edge_tls_diagnostics` and a fresh canonical evidence file at
`docs/evidence/store-public-metadata/1.15.0-rc.22/20260628-153929-musu-pro-public-metadata-edge-diagnostics.json`.
That evidence reports `request_failed,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`.
`www.musu.pro` can complete TLS, but apex `musu.pro` cannot complete TLS from
this machine and a direct probe to the Vercel apex edge IP with SNI `musu.pro`
also fails. The remaining public metadata action is therefore to repair apex
DNS/certificate/edge binding; redeploying the same Next.js source is not enough.

2026-06-28 16:05 KST public metadata DNS repair planner update:
`scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1` now produces a
non-mutating `musu.public_metadata_dns_repair_plan.v1` plan and the go/no-go
`store-public-metadata` next action points to it before rerunning the canonical
metadata verifier. Evidence:
`docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-160524-musu-pro-dns-repair-plan.json`.
The plan reports Cloudflare nameservers, Cloudflare apex A/AAAA records, missing
Vercel apex A `76.76.21.21`, missing `www.musu.pro` CNAME
`cname.vercel-dns-0.com`, apex TLS failure, `www_tls.ok=true`, and
`vercel_edge_apex_tls_ok=false`. SHA256:
`3B99B6F35E7E190D9C75B775E4B753568CA1500F2CE7498A1D80CF44173560C8`.
This is a sharper operator path, not a closure of the lane; the product remains
NO-GO until external DNS/TLS is repaired and `verify-store-public-metadata.ps1`
passes.

2026-06-28 16:20 KST P2P env recheck (historical, superseded by the 2026-06-28
18:00 payload endpoint closure and the 2026-06-30 17:12 status above): the
source remains deliberately fail-closed for release relay.
`show-musu-pro-p2p-env-status.ps1 -Json`
reports `ok=false`, `release_relay_payload_endpoint_implemented=false`,
`release_relay_tunnel_runtime_implemented=false`,
`release_tunnel_payload_endpoint_missing=true`, and missing KV/Upstash release
storage. The blockers are still source/runtime/storage/evidence blockers:
payload endpoint not implemented, tunnel runtime not implemented, preview
store-forward queue non-release-grade, KV/Upstash URL/token missing, and live
relay route/transport/delivery proof missing. Do not flip release relay markers
until real `quic_relay_tunnel` payload transit emits MUSU-bound
`quic_tls_1_3` proof.

2026-06-28 16:37 KST clean-HEAD gate recheck: after the second-PC latest-output
contract fix and handoff/wiki refresh, `write-release-go-no-go.ps1 -Json`
reports `full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`, and
`manifest_git.dirty=false` at commit
`0bb6dbcda5cdd68b5eef6c5a13cb9a966d139f54`. This confirms the kit-pointer fix
did not close or reopen product lanes; the remaining blockers are still
physical/external release evidence and real relay/runtime implementation.

2026-06-28 16:49 KST design-gate approval URL hardening: PR #34 cannot pass the
design gate on `Design: Approved` text alone anymore. The evaluator now also
requires a GitHub issue approval comment URL matching
`https://github.com/.../issues/<number>#issuecomment-<number>`, and regression
tests cover the pending-approval bypass case. This is a stricter fail-closed
merge gate, not a completion event: issue #35 still has evidence-refresh
comments but no explicit CEO/design approval comment, so the design-approval
lane remains open.

2026-06-28 16:55 KST post-design-gate clean-HEAD recheck:
`write-release-go-no-go.ps1 -Json` generated `.local-build\go-no-go\latest.json`
with `full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=15`, `warnings=0`,
and `manifest_git.dirty=false`. The increase from 10 to 15 is expected
source-freshness invalidation after the gate-code commit: the reopened lanes are
`single-machine`, `process-ownership`, `startup-single-instance`,
`desktop-single-instance`, and `runtime-cpu-second-pc-route-attempt`. The product
is still NO-GO for those stale current-package lanes plus the existing
physical/external product blockers.

2026-06-28 17:23 KST post-design-gate current-package evidence refresh:
HUGH_SECOND evidence was rerun for the current package after the design-gate
approval URL hardening. The latest `write-release-go-no-go.ps1 -Json` snapshot
reports `full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`, and
`manifest_git.dirty=false`. The restored local lanes are
`single_machine_verified=true`, `process_ownership_verified=true`,
`startup_single_instance_verified=true`, `desktop_single_instance_verified=true`,
and `runtime_cpu_second_pc_route_attempt_verified=true`. New canonical evidence
files include:

- `docs/evidence/single-machine/1.15.0-rc.22/20260628-170703-HUGH_SECOND.evidence.json`
  plus verification and summary.
- `docs/evidence/process-ownership/1.15.0-rc.22/20260628-170721-HUGH_SECOND.process-ownership.json`.
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-170721-HUGH_SECOND.startup-single-instance.json`.
- `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-171002-HUGH_SECOND.desktop-single-instance.json`.
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-171057-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  plus verification. The post-route probe targeted `hugh-main` at
  `192.168.1.192:4387` and returned
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_171057`.
- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-171827-HUGH_SECOND.desktop-open.evidence.json`
  with `ok=true`, clean git, 60.033s sample, six owned WebView2 helpers, zero
  owned Node helpers, and `hot_process_count=0`.

This returns the gate to the substantive 10 blockers: multi-device, packaged
Private Mesh proof, two-machine idle CPU, two-machine CPU scenario matrix,
public metadata DNS/TLS, Store release, P2P control plane, design approval,
relay transport, and V34 stale self-heal. A post-doc commit recheck at
`2026-06-28T17:32:55.4349035+09:00` confirmed the same `blockers=10`,
`warnings=0`, and local freshness lanes green.

2026-06-28 18:00 KST P2P release payload endpoint source closure: the release
`/api/v1/relay/payload` route is now proof-bound instead of preflight-only.
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`,
`release_payload_endpoint_proof_bound=true`, and
`release_payload_preflight_only=false`; the route accepts
`musu.relay_payload_release_request.v1` with nested
`musu.relay_transport_proof.v1` and
`musu.relay_payload_delivery_proof.v1` metadata, records transport proof, and
still rejects raw payload bytes. This closes the source-level payload endpoint
gap only. It does not implement the release tunnel runtime, KV/Upstash hosted
storage, or live relay route proof. Current P2P env blockers remain runtime,
storage, and live evidence blockers. Canonical report:
`docs/RELEASE_RELAY_PAYLOAD_PROOF_ENDPOINT_2026_06_28.md`.

2026-06-28 update: Store distribution evidence is now fail-closed in tooling.
`record-store-release-verification.ps1` and `verify-store-release-evidence.ps1`
no longer accept Partner Center approval timestamps by themselves. The Store
lane requires an approved Microsoft Store package installed on a physical
Windows machine, `musu.msix_install_evidence.v1` for the Store-reviewed startup
contract, `musu.msix_desktop_entrypoint_audit.v1` proving the installed Start
menu app launches `musu-desktop.exe`, and install/launch timestamps ordered
after certification and restricted capability approval. This tightens the gate;
it does not close the Store lane until real Store-signed evidence exists.

2026-06-28 19:13 KST public metadata planner inspect hardening:
`plan-musu-pro-public-metadata-dns-repair.ps1 -RunVercelInspect` now fails
closed when Vercel inspect cannot produce trustworthy diagnostics. Missing
`VERCEL_TOKEN` records `vercel_inspect.ran=false`, `reason=token_missing`,
`ok=false`, and `has_informative_output=false`; nonzero CLI exits record
`inspect_command_failed`; empty or shell-noise output records
`inspect_output_uninformative`. Evidence:
`docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-1914-musu-pro-dns-repair-plan-vercel-inspect-fail-closed.json`
with SHA256
`2FFCFE120EE83BD862220FC9A41ECDD2328FFA47F6F0D6F80BB6AB881781A934`.
Regression `test-release-evidence-verifiers.ps1 -Json` returned `ok=true`,
`case_count=214`, and `failed_case_count=0`. This improves operator safety but
does not close the public metadata lane; the canonical apex DNS/TLS path still
requires external repair.

2026-06-28 19:42 KST product-completion answer refresh: the product remains
NO-GO. A fresh `write-release-go-no-go.ps1 -Json` run generated
`.local-build\go-no-go\latest.json` with
`generated_at=2026-06-28T19:42:43.4293297+09:00`,
`full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`,
`manifest_git.dirty=false`, and commit
`31ade35758c5a6ff2df5aca598a2950c7e400cfb`. The blocker areas are
`multi-device`, `private-mesh-packaged-release-proof`, `runtime-idle-cpu`,
`runtime-cpu-scenario-matrix`, `store-public-metadata`, `store-release`,
`p2p-control-plane`, `design-approval`, `relay-transport`, and
`v34-stale-self-heal`.

2026-06-28 19:45 KST public fleet-proof hardening: `fleet-proof.ps1` now
distinguishes direct fleet-health proof from release-grade delegated-work route
proof. Default mode still proves hosted install validation, repair evidence,
installed package version, bridge/fleet state, expected direct peer, and brain
token ACL. New opt-in `-RequireReleaseGradeRoute` executes
`musu route --adapter echo --wait --route-evidence-path ...` to
`-ExpectedDirectPeerName` and requires `musu.route_evidence.v1` with the
expected release version, `result=success`, verified peer identity, non-empty
peer identity method and public key, `encryption=quic_tls_1_3`, and
`transport_verified_by=musu_quic_tls_transport`. Current rc.22 HTTP bearer
routes are expected to fail this strict mode; this is a fail-closed proof
surface improvement, not closure of the multi-device or relay blockers.
Verification for this hardening: `npm run test:public-release` passed 16 tests,
`npm run typecheck` passed, the generated PowerShell body parsed with
`parse_error_count=0`, and `test-release-evidence-verifiers.ps1 -Json`
returned `ok=true`, `case_count=214`, `failed_case_count=0` at
`2026-06-28T19:54:46.3577462+09:00`.

2026-06-28 19:58 KST post-push clean gate recheck: after committing and pushing
the fleet-proof release-grade route hardening at
`df08b39c1eb256f15cb9c4febb06759ae5c0d89c`,
`write-release-go-no-go.ps1 -Json` generated
`.local-build\go-no-go\after-fleet-proof-route-gate-hardening.json` with
`full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=15`, `warnings=0`, and
`manifest_git.dirty=false`. The added blockers relative to the pre-hardening
10-blocker snapshot are expected source-freshness invalidations:
`single-machine`, `process-ownership`, `startup-single-instance`,
`desktop-single-instance`, and `runtime-cpu-second-pc-route-attempt`.
Substantive blockers remain `multi-device`,
`private-mesh-packaged-release-proof`, `runtime-idle-cpu`,
`runtime-cpu-scenario-matrix`, `store-public-metadata`, `store-release`,
`p2p-control-plane`, `design-approval`, `relay-transport`, and
`v34-stale-self-heal`. This is not a completion event and not evidence of a new
runtime failure; it means the current package evidence must be refreshed again
after this source change before the local freshness lanes can return green.

2026-06-28 20:33 KST post-fleet-proof local packaged evidence refresh:
HUGH_SECOND evidence was rerun after the public `fleet-proof.ps1`
release-grade route gate hardening reopened local freshness lanes. The latest
clean `write-release-go-no-go.ps1 -Json` snapshot reports
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`blockers=10`, `warnings=0`, and `manifest_git.dirty=false` at commit
`c3bd5ed68024fff38b8e8c031f411144c10cb293`. The restored local lanes are
`single_machine_verified=true`, `process_ownership_verified=true`,
`startup_single_instance_verified=true`, `desktop_single_instance_verified=true`,
and `runtime_cpu_second_pc_route_attempt_verified=true`. New canonical evidence
files include:

- `docs/evidence/single-machine/1.15.0-rc.22/20260628-202115-HUGH_SECOND.evidence.json`
  plus verification and summary.
- `docs/evidence/process-ownership/1.15.0-rc.22/20260628-202128-HUGH_SECOND.process-ownership.json`.
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-202128-HUGH_SECOND.startup-single-instance.json`.
- `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-202128-HUGH_SECOND.desktop-single-instance.json`.
- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-202216-HUGH_SECOND.desktop-open.evidence.json`.
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-202500-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  plus verification. The matrix route probe targeted `hugh-main` and returned
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_202500`.

This returns the gate to the substantive 10 blockers:
`multi-device`, `private-mesh-packaged-release-proof`, `runtime-idle-cpu`,
`runtime-cpu-scenario-matrix`, `store-public-metadata`, `store-release`,
`p2p-control-plane`, `design-approval`, `relay-transport`, and
`v34-stale-self-heal`. This is still not a completion event.

2026-06-28 20:48 KST public metadata planner fix and second-PC kit refresh:
`plan-musu-pro-public-metadata-dns-repair.ps1 -RunVercelInspect` now uses
`$vercelArgs` instead of PowerShell's automatic `$args`, so a present
`VERCEL_TOKEN` produces real `vercel domains inspect musu.pro` output instead
of a Windows shell banner. Fixed evidence:
`docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-204816-musu-pro-dns-repair-plan-vercel-inspect-fixed.json`
with SHA256
`B8709AC9CA39173806D9F7577B05227553E974934E4E363CED24611C0ACEE1C3`.
It records `vercel_inspect.ok=true`, `has_informative_output=true`, project
`musu-pro`, intended Vercel nameservers, and current Cloudflare nameservers.
The public metadata lane remains blocked because apex DNS/TLS is still
externally wrong. A fresh second-PC kit was also generated from clean commit
`8e82fae46eb25b59171627627cab5dcfba7e847f` at
`.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260628-204644.zip`
with SHA256
`6718085a3765f6159e1f9571974e477f343a5825c536d99267d86335b22d0396`.
This refreshes the `hugh-main` handoff artifact only; it does not close the
second-PC evidence gate until the kit is run on the main PC and imported.

2026-06-28 21:20 KST W-7 relay source-node auth binding hardening:
`MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS` now lets the web P2P control plane bind
bearer token SHA-256 values to allowed `source_node_id` values without storing
raw node tokens. When configured, source-claiming writes return
`source_node_id_auth_mismatch` with HTTP 403 if the request declares a different
source node. The gate is enforced on `POST /api/v1/p2p/rendezvous`,
`POST /api/rooms/[roomId]/rendezvous`, `POST /api/v1/p2p/relay/lease`,
`POST /api/v1/p2p/relay/payload`,
`POST /api/v1/p2p/relay/transport-proof`, and
`POST /api/v1/p2p/route-evidence`. 2026-06-28 21:39 KST extension: the same
binding now also gates `POST /api/v1/relay/connect` and
`POST /api/v1/relay/payload`, so release relay preflight cannot be source-spoofed
before lease lookup or proof storage. Verification passed targeted release
endpoint coverage, `npm run test:p2p` (131 tests), `npm run typecheck`, and
`audit-p2p-store-forward-relay-contract.ps1 -Json` with `ok=true`,
`fail_count=0`. This closes the source-level W-7 spoofing gap for configured
node tokens only. It does not deploy production bindings, implement the release
relay tunnel runtime, configure live KV/Upstash release storage, or produce live
relay route/transport/delivery evidence. The product remains NO-GO on the same
physical/external lanes. Canonical report:
`docs/RELAY_SOURCE_NODE_AUTH_BINDING_HARDENING_2026_06_28.md`.

2026-06-28 21:31 KST post-push recheck for W-7 source-node auth binding commit
`55f3f820`: PR #34 code/deploy checks are green except the expected
`design-gate` blocker. `Deploy to Vercel`, `Web typecheck and build`, `Rust core
tests`, `Playwright E2E`, `landing-ceo-approval-gate`, `saas-gate`, and the
short `test` check passed. A fresh public metadata verifier still fails
canonical `https://musu.pro` with `request_failed`,
`dns_nameserver_mismatch`, `apex_tls_handshake_failed`, and
`vercel_edge_apex_tls_failed`; the next product constraints are therefore
external approval/DNS and physical proof, not this commit's source checks.

2026-06-28 21:56 KST current-HEAD second-PC kit refresh after W-7 extension:
the operator handoff kit was regenerated from clean commit
`7b53042177735ecab752bc857dd9455af996f6c7` at
`.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260628-215431.zip`
with SHA256
`2bbb4b534e4b8e49407a533d07884e56a5f8361f40131a8a67f81b572497dd1a`.
`.local-build\multi-device-test-kit\latest-prepare-output.json` now points at
that kit, and `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md` is updated for
`hugh-main`. A fresh go/no-go snapshot at
`.local-build\go-no-go\after-current-head-second-pc-kit-refresh.json` still
reports `full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`, and
`manifest_git.dirty=false` at the same commit. Post-refresh source audits also
passed: `audit-p2p-store-forward-relay-contract.ps1 -Json` and
`audit-operator-api-security-contract.ps1 -Json` both returned `ok=true`,
`fail_count=0`. This is an evidence collection path refresh only; it does not
close the second-PC, Private Mesh, public metadata, Store, P2P control-plane,
design approval, relay transport, or V34 physical proof blockers.

## 2026-06-27 Gate Implementation Update

Phase 1 is now implemented in tooling, but the full product is still not
complete. `scripts/windows/write-release-go-no-go.ps1` emits
`full_product_spec_ready` plus a `musu.full_product_spec_readiness.v1` object
with explicit lanes for design approval, install/package proof, direct two-PC
fleet proof, relay transport, brain product proof, V34 stale self-heal, Store
distribution, and support/operator evidence.

The gate fails closed: missing lanes become blockers instead of warnings, and a
direct fleet proof alone cannot produce a full-product completion claim. The
same script now reports release candidate manifest generation failures as
structured blockers instead of crashing before the go/no-go JSON is written.

Current local gate shape on this branch:

- `full_product_spec_ready=false`.
- `ready_for_public_desktop_release=false`.
- Latest blocker count is `10` with `warnings=0`.
- `fleet_node_proof_verified=true`.
- `fleet_install_channel_proof_verified=true`.
- `fleet_brain_token_acl_verified=true`.
- `design_approval_verified=false`.
- `relay_transport_product_verified=false`.
- `brain_product_verified=true` after the packaged rc.22 proof at
  `docs/evidence/brain-product/1.15.0-rc.22/20260628-014357-HUGH_SECOND.brain-product-proof.json`.
- `direct_route_verified=true` after packaged route evidence at
  `docs/evidence/direct-route/1.15.0-rc.22/20260628-050231-HUGH_SECOND-to-hugh-main.packaged-direct-route-evidence.json`.
- `v34_stale_self_heal_verified=false`.
- `support_operator_gate_retirement_verified=true`.
- `support_operator_evidence_verified=true`.
- `release_candidate_manifest_generated=true` after the current rc.22
  Store-reviewed artifact and submission bundle refresh.
- `runtime_idle_cpu_verified=false` with
  `runtime_idle_cpu_valid_machines=1/2 [HUGH_SECOND]`.
- `runtime_cpu_scenario_matrix_verified=false` with
  `runtime_cpu_scenario_matrix_valid_machines=1/2 [HUGH_SECOND]`.
- `public_metadata_ok=false` because canonical `https://musu.pro` DNS/TLS still
  fails.
- `p2p_control_plane_verified=false`.
- Current lane status from `write-release-go-no-go.ps1 -Json`:
  `install_channel_and_package=pass`, `direct_two_pc_fleet=pass`,
  `direct_delegated_work_route=pass`, `brain_product=pass`,
  `support_operator_evidence=pass`, while `design_approval=fail`,
  `relay_transport=fail`, `v34_stale_self_heal=fail`, and
  `store_distribution=fail`.

## 2026-06-28 Manifest Version Gate Update

The current multi-device kit for `1.15.0-rc.22` has been regenerated, but the
release candidate manifest found a stricter blocker: the manifest writer was
mapping rc versions to `1.15.0.0` package artifacts instead of the current
`1.15.0.22` package version.

That is now fixed in `scripts/windows/write-release-candidate-manifest.ps1`.
The manifest maps `1.15.0-rc.22` to `1.15.0.22`, so stale `1.15.0.0`
Store-reviewed artifacts cannot satisfy the current release manifest. The local
go/no-go therefore remains `full_product_spec_ready=false` and
`release_candidate_manifest_generated=false` until the current rc.22
Store-reviewed MSIX exists.

The same current-version rule now applies to the desktop readiness audit and
operator action pack. `scripts/windows/audit-desktop-release-readiness.ps1`
derives the local/Store MSIX filenames from `VERSION` and only accepts a Store
submission bundle that contains the expected current Store-reviewed MSIX.
`scripts/windows/prepare-operator-action-pack.ps1` also refuses to prepare
Partner Center upload instructions from a stale Store bundle. Current local
audit evidence reports the local sideload MSIX and desktop entrypoint as
passing, while the current Store-reviewed MSIX and current Store submission
bundle remain missing.

## 2026-06-28 Current Store Bundle Update

The current rc.22 Store-reviewed MSIX and Store submission bundle have now been
regenerated from the clean product sources with the brain sidecar pin updated
to the current `F:\musu_2nd_brain` HEAD
`027eec841613ff2e0b16df26f55066ab207ab4ec`.

Local artifact evidence:

- Store-reviewed MSIX:
  `.local-build\msix\output\musu_1.15.0.22_x64_store-reviewed-immediate-registration.msix`.
- Store submission bundle:
  `.local-build\msix\submission-bundles\store-reviewed-20260628-005038`.
- `verify-store-submission-bundle.ps1` reports `ok=true`, `fail_count=0`.
- `audit-desktop-release-readiness.ps1` reports `runtime_package_ready=true`
  and `msix_desktop_entrypoint_ready=true`.
- `write-release-candidate-manifest.ps1` now succeeds for
  `.local-build\release-candidates\1.15.0-rc.22\release-candidate-manifest.json`
  with artifact_count `7`.

This closes the repo-local Store packaging artifact gap. It does not close the
Store distribution lane because Partner Center product-name reservation,
Microsoft certification/restricted-capability approval, and Store-signed
install/launch proof are still external evidence requirements.

## 2026-06-28 Support Operator Gate Retirement Update

The historical support mailbox delivery proof is retired as a mandatory full
product blocker for the current desktop spec. This is a narrow retirement:
support availability, the configured `musu@musu.pro` address, the public support
page, the privacy page, and public release metadata remain required.

Replacement controls:

- `docs/SUPPORT_OPERATOR_GATE_RETIREMENT_2026_06_28.md` records the formal
  decision and scope.
- `scripts/windows/record-support-operator-gate-retirement.ps1` records current
  live `https://musu.pro` public support metadata proof.
- `scripts/windows/verify-support-operator-gate-retirement.ps1` rejects evidence
  that retires support availability, lacks a current public metadata proof, or
  does not embed verified support/privacy/public-config evidence.
- `write-release-go-no-go.ps1` now treats the support/operator lane as complete
  when either real mailbox delivery evidence is verified or the formal support
  operator gate retirement evidence is verified.

This reduces the final full-product blockers by one. Current evidence:

- Proof:
  `docs/evidence/support-operator-gate-retirement/1.15.0-rc.22/20260628-033452-support-operator-gate-retirement.support-operator-gate-retirement.json`.
- Verification:
  `docs/evidence/support-operator-gate-retirement/1.15.0-rc.22/20260628-033452-support-operator-gate-retirement.support-operator-gate-retirement-verification.json`.

The latest local go/no-go reports `support_operator_gate_retirement_verified=true`,
`support_operator_evidence_verified=true`, `complete_lane_count=5`, and
`incomplete_lane_count=4`.

## 2026-06-28 Brain Product Proof Gate Update

The brain product lane now has a dedicated release proof recorder and verifier:

- `scripts/windows/record-brain-product-proof.ps1`
- `scripts/windows/verify-brain-product-proof.ps1`

`write-release-go-no-go.ps1` no longer accepts a weak
`musu.brain_product_proof.v1` JSON that only sets `ok`, `health_ok`,
`task_ingest_ok`, and `recall_capture_ux_ok`. The lane now requires verifier
approval for the packaged hidden brain sidecar: package version coherence,
packaged `musu-brain.exe`, observed sidecar process, `~/.musu/brain` data
root, restricted ingest token ACL, loopback-only `http://127.0.0.1:8080`,
`/health`, real `/v1/sources` task ingest, `/v1/process`, `/v1/query`, real
`/v1/clips` capture ingest, and capture recall results.

This hardens the product spec gate and closes the brain product lane for the
current rc.22 fresh packaged launch.

Local diagnostic on `HUGH_SECOND` immediately after adding the recorder:
`record-brain-product-proof.ps1 -Json` wrote a non-release local artifact under
`.local-build/brain-product/20260628-013600-HUGH_SECOND.*` and failed with
`fail_count=14`. The installed package identity was correct
(`blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`), but no `musu-brain`
sidecar process was observed and `http://127.0.0.1:8080/health` was not proven.
That exposed a stale already-running desktop process, not a passing release
proof.

After stopping the stale packaged desktop processes and launching the installed
AppX fresh, `musu-desktop.exe` spawned packaged `musu-brain.exe` and the
release recorder wrote:

- Proof:
  `docs/evidence/brain-product/1.15.0-rc.22/20260628-014357-HUGH_SECOND.brain-product-proof.json`.
- Verification:
  `docs/evidence/brain-product/1.15.0-rc.22/20260628-014357-HUGH_SECOND.brain-product-verification.json`.

The verification reports `ok=true` and `fail_count=0`. The current local
go/no-go reports `brain_product_verified=true`. After the support operator gate
retirement evidence and packaged direct-route proof, the local full-product gate
reports `complete_lane_count=5`
and `incomplete_lane_count=4`.

Caveat: this proves fresh packaged launch, not an upgrade-in-place self-heal for
an already-running stale desktop instance. Treat the stale-process observation
as a future hardening target if in-place upgrade behavior becomes part of the
release claim.

## 2026-06-28 V34 Self-Heal Gate, Boot Reconcile, And Recorder Update

V34 is still not complete, because the release lane requires physical two-node
evidence for stale registry/cache/manual-peer recovery. The code and gate are
now stronger:

- `musu-rs/src/peer/discovery.rs` now exposes a boot/local reconcile path that
  uses a still-valid cached registry as server truth and prunes same-name manual
  peer ghosts before the first cloud heartbeat succeeds.
- Reconcile is candidate-set aware: a same-name manual peer is kept when it
  matches any current registry route candidate, not only the primary cached
  address.
- `musu-rs/src/bridge/mod.rs` calls the boot reconcile during bridge startup,
  independent of cloud token availability.
- `scripts/windows/verify-v34-self-heal-proof.ps1` now rejects weak
  boolean-only V34 proof JSON and requires structured evidence for TTL prune,
  boot reconcile, stale-first route preflight, and exactly-one task execution.
- The V34 verifier also re-checks embedded route evidence binding: version,
  source node, target node, selected candidate address, direct route kind, and
  direct payload path must match the V34 wrapper. A stale self-heal proof can no
  longer pass by wrapping a successful route evidence record from a different
  node pair, release version, or candidate.
- Follow-up hardening requires the embedded route evidence to look like an
  actual direct route proof, not a minimal synthetic JSON fragment:
  `total_attempt_ms` must be positive, `failure_class` must be empty for a
  success, `recorded_at` must parse and be current, and
  `source_evidence.route_evidence_path` must be present.
- `scripts/windows/record-v34-self-heal-proof.ps1` is the canonical recorder
  for that physical proof. It writes `musu.v34_self_heal_proof.v1`, immediately
  runs the verifier, emits hashes and a summary, and fails closed if the proof
  does not satisfy the release gate. It also binds the selected candidate to the
  embedded route evidence candidate and requires distinct physical node names.
- `write-release-go-no-go.ps1` now invokes the V34 verifier before setting
  `v34_stale_self_heal_verified=true`, and its next action points operators at
  the recorder instead of asking them to hand-write JSON.

Regression coverage:

- Rust unit proof:
  `peer::discovery::tests::boot_reconcile_prunes_stale_manual_but_keeps_current_candidate_set`.
- Release evidence verifier proof:
  `V34 self-heal accepts release-grade physical stale proof`,
  `V34 self-heal recorder emits verifier-passing release proof`,
  `V34 self-heal rejects weak boolean-only proof`,
  `V34 self-heal rejects duplicate task execution proof`, and
  `V34 self-heal rejects unroutable selected candidate proof`,
  `V34 self-heal rejects route evidence candidate mismatch`,
  `V34 self-heal rejects route evidence node mismatch`, and
  `V34 self-heal rejects route evidence version mismatch`, and
  `V34 self-heal rejects proof without TTL and boot source artifacts`, and
  `V34 self-heal rejects minimal synthetic route evidence`.
- Latest release evidence verifier regression after this route-evidence
  hardening: `ok=true`, `case_count=209`, `failed_case_count=0`.

This reduces V34 implementation risk but does not close the lane until a
current physical proof is recorded with `record-v34-self-heal-proof.ps1` under
`docs/evidence/v34-self-heal/1.15.0-rc.22/` and the resulting verification is
green.

## 2026-06-28 V34 Second-PC Proof Kit Update

Follow-up audit found that the canonical V34 recorder/verifier existed in the
repo, but the transfer kit used for real two-PC operator runs did not yet carry
those tools or a V34-specific runbook. That left the remaining physical proof
lane too easy to execute ad hoc.

Source fix:

- `scripts/windows/prepare-multidevice-test-kit.ps1` now includes
  `record-v34-self-heal-proof.ps1` and `verify-v34-self-heal-proof.ps1` in the
  second-PC kit script payload.
- The generated `README_MULTI_DEVICE_TEST_KIT.md` now has a dedicated
  "V34 stale self-heal proof" section. It separates this proof from normal
  route reachability/multi-device smoke, lists the required stale registry,
  stale manual/cache peer, stale-first route candidate, and exactly-one task
  execution conditions, and gives recorder/verifier command skeletons.
- The runbook states that the embedded `musu.route_evidence.v1` must match the
  V34 wrapper version, source node, target node, selected candidate address,
  direct route path, and `payload_transited_musu_infra=false`.
- The runbook keeps the product state honest: until the verifier passes on
  physical two-PC evidence and the JSON is committed, the lane remains
  `v34_stale_self_heal_verified=false`.

Verification:

- `scripts/windows/test-release-evidence-verifiers.ps1` now has the source
  contract case `second-PC kit includes V34 self-heal proof tools and runbook`.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` reports
  `ok=true`, `case_count=195`, and `failed_case_count=0`.

This improves the physical proof collection path but still does not close V34
until rebuilt packaged evidence is recorded under
`docs/evidence/v34-self-heal/1.15.0-rc.22/`.

## 2026-06-28 Final Operator Packet Full-Product Alignment

The final operator packet was still carrying older public-release gate language:
support mailbox delivery appeared as a remaining blocker even though the
support/operator gate is now formally retired for mailbox delivery, and the
packet did not directly surface the current full-product blockers from this
roadmap. That made the handoff path weaker than the go/no-go contract.

Source fix:

- `scripts/windows/prepare-final-operator-gate-packet.ps1` now copies the
  current full-product roadmap, support-operator gate retirement decision, and
  V34 stale thesis into the packet docs.
- The packet now copies `record-v34-self-heal-proof.ps1`,
  `verify-v34-self-heal-proof.ps1`, and `verify-direct-route-evidence.ps1`
  alongside the existing p2p/store/runtime verifiers.
- The generated README now states the current four full-product blockers:
  design approval, real delegated-work relay transport proof, V34 stale
  self-heal proof, and Store distribution proof.
- The support/operator gate is described as already satisfied by formal
  retirement plus public support/privacy metadata; mailbox delivery is optional
  extra evidence, not a current blocker.
- The README now has explicit V34 physical proof and relay transport
  failure-injection sections. The relay section keeps the lane fail-closed until
  real `musu.relay_transport_proof.v1`, route evidence, and
  `musu.relay_payload_delivery_proof.v1` exist from a direct-blocked two-PC run.

Verification:

- `scripts/windows/test-release-evidence-verifiers.ps1` now includes
  `final operator packet surfaces current full-product blockers and proof paths`.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` reports
  `ok=true`, `case_count=196`, and `failed_case_count=0`.

This improves release handoff correctness but does not close the remaining
full-product blockers. `relay_transport_product_verified=false` and
`v34_stale_self_heal_verified=false` stay correct until physical proof exists.

## 2026-06-28 V34 Artifact-Bound Proof Contract Update

Follow-up audit found that the V34 proof was stricter than a boolean-only JSON,
but the recorder still accepted operator-entered TTL and boot-reconcile booleans
without binding those claims to source artifacts. That was too weak for a full
product self-heal claim.

Source fix:

- `scripts/windows/record-v34-source-artifacts.ps1` now records the required
  TTL and boot source artifacts from actual before/after snapshot JSON files.
  2026-06-28 follow-up hardening: those before/after snapshots must now use
  canonical schemas `musu.v34_ttl_snapshot.v1` and
  `musu.v34_boot_snapshot.v1`; the recorder rejects arbitrary fixture-shaped
  JSON before writing source evidence.
- `scripts/windows/record-v34-self-heal-proof.ps1` now requires
  `-TtlSourceEvidencePath` and `-BootSourceEvidencePath` in addition to the
  route evidence path.
- TTL source evidence must use schema `musu.v34_ttl_prune_source.v1`.
- Boot reconcile source evidence must use schema
  `musu.v34_boot_reconcile_source.v1`.
- The recorder embeds both source artifacts in `source_evidence`, records their
  SHA256 hashes, and fails closed if their fields do not match the wrapper
  TTL/boot parameters.
- `scripts/windows/verify-v34-self-heal-proof.ps1` now checks the source
  schemas, source artifact SHA256 metadata, source snapshot SHA256 metadata,
  embedded before/after snapshot schemas, snapshot-to-source field bindings,
  source-to-wrapper field bindings, route evidence SHA256 metadata, route
  binding, distinct node pair, and exactly-one task execution before accepting
  `musu.v34_self_heal_proof.v1`.
- The multi-device kit, final operator packet, and go/no-go next action now show
  the snapshot capture helper, source artifact recorder, and required TTL/boot
  source artifact paths instead of a boolean-only command skeleton.

Verification:

- `scripts/windows/test-release-evidence-verifiers.ps1` now includes
  `V34 source artifact recorder emits TTL and boot source evidence` and
  `V34 self-heal rejects proof without TTL and boot source artifacts`.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` reports
  `ok=true`, `case_count=208`, and `failed_case_count=0`.

This hardens the V34 release proof contract. It still does not close the V34
lane: the artifact-bound proof must be produced from a rebuilt packaged physical
two-node stale registry/cache/manual-peer run and committed under
`docs/evidence/v34-self-heal/1.15.0-rc.22/`.

## 2026-06-28 V34 Source Snapshot Capture Helper

Follow-up audit found that the V34 proof contract was now strict, but operators
still had to produce the canonical before/after snapshot JSON by hand. That left
the physical evidence path too easy to execute inconsistently.

Source fix:

- `scripts/windows/capture-v34-source-snapshot.ps1` now reads the physical
  `~/.musu/nodes.cache.json` and `~/.musu/manual_peers.toml` state and writes
  canonical `musu.v34_ttl_snapshot.v1` or `musu.v34_boot_snapshot.v1` JSON.
- TTL capture computes stale row counts from `last_heartbeat` and
  `-HeartbeatTtlSec`, records the stale last-seen timestamp, and marks whether
  current registry output excludes heartbeat-expired rows.
- Boot capture classifies manual peers as stale same-name ghosts, current
  same-name candidates, LAN-only peers, or nameless ad hoc peers against the
  cached registry candidate set. Boot `after` snapshots require
  `-BootPrunedManualPeerCount` so the after state binds to the source artifact
  recorder.
- The multi-device kit and final operator packet now copy this helper and show
  capture commands before `record-v34-source-artifacts.ps1`.
- Operators must pass the exact `stale_row_last_seen_at` emitted by the captured
  TTL-before snapshot into `record-v34-source-artifacts.ps1`; PowerShell can
  normalize JSON timestamps to the local offset while preserving the same
  instant.

Verification:

- `scripts/windows/test-release-evidence-verifiers.ps1` now executes the helper
  against fixture `MUSU_HOME` states:
  `V34 snapshot capture emits TTL before canonical snapshot`,
  `V34 snapshot capture emits boot before canonical snapshot`, and
  `V34 snapshot capture emits boot after canonical snapshot with pruned count`.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` reports
  `ok=true`, `case_count=208`, and `failed_case_count=0`.
- Additional integration smoke fed helper-emitted TTL/boot before/after
  snapshots directly into `record-v34-source-artifacts.ps1` and the recorder
  accepted them.

This improves proof collection repeatability but does not close V34. The final
lane still requires a rebuilt packaged physical two-node stale-state run and
verifier-passing evidence committed under
`docs/evidence/v34-self-heal/1.15.0-rc.22/`.

## 2026-06-28 V34 Endpoint Validation Hardening

Follow-up audit found a proof-validation edge case: the V34 selected-candidate
checks rejected obvious loopback/wildcard hosts, but did not parse all endpoint
shapes before deciding whether a candidate was remotely usable. That meant
port-zero endpoints, negative-port endpoints, and URL-shaped loopback
candidates were not explicitly covered by the release verifier contract.

Source fix:

- `scripts/windows/verify-v34-self-heal-proof.ps1`,
  `scripts/windows/record-v34-self-heal-proof.ps1`, and
  `scripts/windows/capture-v34-source-snapshot.ps1` now parse endpoint strings
  before routability checks.
- Absolute URLs are parsed by host/port; bracketed IPv6 and host:port forms are
  parsed without treating the scheme as a hostname.
- Port `0`, negative ports, ports above `65535`, path-shaped non-URL endpoint
  strings, loopback, wildcard, and IPv4-mapped IPv6 loopback/wildcard addresses
  are rejected.
- Regression coverage adds `V34 self-heal rejects port-zero selected candidate
  proof`, `V34 self-heal rejects negative-port selected candidate proof`, and
  `V34 self-heal rejects URL loopback selected candidate proof`.

Verification:

- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` reports
  `ok=true`, `case_count=214`, and `failed_case_count=0`.
- `git diff --check` passed.
- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  3392 files and 3879 symbols; recall checks returned the new report, roadmap
  entry, and V34 verifier/test script references.

This reduces false-positive V34 proof risk but does not close the lane:
`v34_stale_self_heal_verified=false` remains correct until current packaged
physical two-node stale-state evidence is recorded and verified under
`docs/evidence/v34-self-heal/1.15.0-rc.22/`. Canonical report:
`docs/V34_ENDPOINT_VALIDATION_HARDENING_2026_06_28.md`.

## 2026-06-28 Post-V34 Endpoint Local Evidence Refresh

After the V34 endpoint validation hardening commit, `write-release-go-no-go.ps1`
correctly reopened local freshness lanes and reported `blockers=15`. The
current HUGH_SECOND packaged `1.15.0-rc.22` install has now been refreshed
against the current branch state:

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-184155-HUGH_SECOND.evidence.json`.
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-184214-HUGH_SECOND.process-ownership.json`.
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-184214-HUGH_SECOND.startup-single-instance.json`.
- Desktop repeated activation:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-185307-HUGH_SECOND.desktop-single-instance.json`.
- Desktop-open idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-184508-HUGH_SECOND.desktop-open.evidence.json`.
- Full runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-184627-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
- Runtime CPU matrix verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-184627-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`.

The refreshed CPU matrix uses the packaged WindowsApps `musu.exe`, records
`git_dirty=false`, covers `startup-open`, `runtime-started`, `dashboard-open`,
`desktop-open`, and `post-route`, and the post-route probe targets `hugh-main`
with token `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_184627`.

Gate result:

- `write-release-go-no-go.ps1 -Json` generated
  `.local-build/go-no-go/latest.json` at `2026-06-28T18:56:04.7165221+09:00`.
- `full_product_spec_ready=false`.
- `ready_for_public_desktop_release=false`.
- `blockers=10`.
- `warnings=0`.
- `manifest_git.dirty=false`.
- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  3403 files and 3879 symbols; recall returns the new local evidence report,
  runtime matrix route token, and desktop activation evidence file.

This restores the local current-package lanes to green. It still does not close
the product because the remaining blockers require physical second-PC proof,
external DNS/TLS and Store work, real relay transport implementation/proof,
explicit design approval, and V34 physical stale-state proof. Canonical report:
`docs/LOCAL_PACKAGED_EVIDENCE_REFRESH_2026_06_28_POST_V34_ENDPOINT.md`.

## 2026-06-28 V34 CLI Route Stale Candidate Preflight Update

Follow-up code audit found one more product gap in the V34 stale-first story:
bridge forwarding already had route-candidate preflight/reorder behavior, but
the user-facing `musu route` CLI selected one peer candidate and submitted
directly. If a local stale manual/cache candidate appeared first for the target
node, the CLI path could still fail even though a later LAN candidate was
healthy.

Source fix:

- `musu-rs/src/install/cli_commands.rs` now builds the explicit-target route
  candidate set before submission.
- Remote route candidates are probed with bounded `GET /api/fleet/node-status`
  preflight using the outbound peer token.
- Reachable candidates are moved ahead of stale failed candidates before the
  task is submitted.
- The task payload is still submitted only once, to the selected reachable
  candidate, so the preflight cannot duplicate delegated work.
- Auto-route with no explicit target preserves the previous single-selection
  behavior.

Verification:

- `cli_route_candidates_include_all_matching_target_routes`.
- `cli_route_preflight_moves_reachable_candidate_before_stale_first_candidate`.
- `cli_route_preflight_preserves_order_when_no_candidate_is_reachable`.
- `rustfmt --edition 2021 --check musu-rs\src\install\cli_commands.rs`.
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`.

This is a required implementation improvement for V34, not release evidence by
itself. The V34 lane remains incomplete until the packaged app is rebuilt and a
physical stale registry/cache/manual-peer proof shows the CLI/route stack
selecting the healthy candidate and executing exactly one delegated task.

## 2026-06-28 Direct Route Work-Targetability Token Update

The two-PC fleet proof was healthy, but the installed rc.22 package initially
did not prove delegated work targetability. On `HUGH_SECOND`, this route probe
selected `hugh-main` over the direct LAN candidate `192.168.1.192:4387` and
wrote failure evidence under
`.local-build\v34-self-heal\route-probe\20260628-035659-hugh_second-to-hugh-main.route-evidence.json`,
but the submit failed with `submit_http_status_401 Unauthorized` and
`unauthorized: invalid bearer`.

Root cause:

- The remote bridge accepts the account-wide peer bearer through the bridge
  auth path.
- The route CLI path used `get_token()`, which prefers the local per-machine
  `MUSU_BRIDGE_TOKEN` / `bridge.env` token.
- When two machines have different local bridge tokens, a remote direct route
  can look healthy in fleet status but fail delegated task submission.

Source fix:

- `musu-rs/src/install/cli_commands.rs` now selects route bearer by scope.
- Local routes keep the existing bridge token behavior.
- Remote routes prefer the shared mesh bearer via `MUSU_TOKEN` or
  `read_mesh_bearer(home)`, then fall back to the bridge token for legacy
  single-secret installs.

Verification:

- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- Targeted Rust tests passed:
  `remote_route_token_prefers_mesh_bearer_over_local_bridge_token`,
  `remote_route_token_prefers_mesh_bearer_over_env_bridge_token`, and
  `remote_route_token_accepts_musu_token_env_as_shared_bearer_override`.
- A rebuilt debug CLI route probe from `hugh_second` to `hugh-main` succeeded
  and wrote
  `.local-build\v34-self-heal\route-probe\20260628-042218-hugh_second-to-hugh-main.debug-route-evidence.json`
  with `result=success`, `route_kind=lan`, and
  `candidate_addr=192.168.1.192:4387`.
- `rustfmt --edition 2021 --check musu-rs\src\install\cli_commands.rs`
  passed.
- `git diff --check` passed.

This was the source-level fix and debug-binary route proof that preceded the
packaged proof below. The debug proof remains useful root-cause evidence, but
the current release claim should reference the later packaged
`musu.route_evidence.v1` instead. The packaged proof is still HTTP bearer
evidence with `peer_identity_verified=false`, so it does not replace the later
release-grade transport proof.

## 2026-06-28 Packaged Direct Route Proof Gate Update

The direct delegated-work route lane is now proven for the current rc.22
package on the two physical machines.

What changed:

- `F:\musu_2nd_brain` was clean at
  `027eec841613ff2e0b16df26f55066ab207ab4ec`, so
  `musu-bee/src-tauri/musu-brain.pin.json` was updated to that exact commit.
- `build-msix.ps1 -Configuration release -Architecture x64
  -StartupContract local-sideload-manual -NoBump` rebuilt the package.
- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` installed and verified
  `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- The packaged `musu.exe bridge` on `HUGH_SECOND` reported two online direct
  nodes: `hugh_second` and `hugh-main`.
- The packaged CLI ran:
  `musu route --target hugh-main --adapter echo --wait --wait-timeout-sec 60`
  and completed successfully over `route_kind=lan`,
  `candidate_addr=192.168.1.192:4387`.

Committed release evidence:

- Direct route proof:
  `docs/evidence/direct-route/1.15.0-rc.22/20260628-050231-HUGH_SECOND-to-hugh-main.packaged-direct-route-evidence.json`.
- MSIX install proof:
  `docs/evidence/msix-install/1.15.0-rc.22/20260628-050309-HUGH_SECOND.evidence.json`.
- MSIX install verification:
  `docs/evidence/msix-install/1.15.0-rc.22/20260628-050309-HUGH_SECOND.verification.json`.
- MSIX install summary:
  `docs/evidence/msix-install/1.15.0-rc.22/20260628-050309-HUGH_SECOND.summary.md`.

The new `scripts/windows/verify-direct-route-evidence.ps1` verifier rejects weak
route evidence unless the schema, version, distinct node pair, direct route
kind, remotely routable candidate address, successful result, empty failure
class, positive timing, and no MUSU-infra transit are all present. The full
product gate now has a `direct_delegated_work_route` lane, and the latest local
go/no-go reports `direct_route_verified=true` and
`direct_delegated_work_route=pass`.
`scripts/windows/test-release-evidence-verifiers.ps1 -Json` now covers the
direct-route verifier with accept/reject cases and reports `ok=true`,
`case_count=191`, `failed_case_count=0`.

Caveat: the proof is direct LAN work-targetability, not release-grade relay or
peer-identity transport. The evidence intentionally records
`peer_identity_verified=false`, `encryption=none_http_bearer`, and
`release_grade_transport=false`. Those remain covered by the separate
`relay_transport` and future release-grade transport lanes.

## 2026-06-28 Relay Runtime Source Contract Update

Relay transport is still not complete. The product cannot yet claim that
delegated work routes through relay when direct is unavailable.

The source contract is now stricter:

- `musu-rs/src/bridge/rendezvous.rs` exposes a release tunnel submit-side
  contract for `quic_relay_tunnel`, `quic_tls_1_3`, and
  `musu_quic_tls_transport`.
- The submit contract rejects non-`wss://` relay URLs, non-fingerprint peer
  public keys, non-`forwarded_task_envelope` payloads, and invalid SHA-256
  payload bindings before a release relay runtime can be enabled.
- The submit path remains fail-closed with
  `release_relay_tunnel_runtime_not_implemented`; this prevents a marker-only
  flip from turning the preview store-forward queue into a release relay claim.
- The target accept path remains in
  `musu-rs/src/bridge/handlers/relay_payload.rs` and requires release-grade
  transport proof before recording release relay route evidence.

Verification:

- Rust unit proof:
  `bridge::rendezvous::tests::release_relay_tunnel_submission_contract_is_release_grade_and_fail_closed`.
- Release evidence verifier regression now reports `ok=true`, `case_count=191`,
  and `failed_case_count=0`.

This removes the stale source-contract audit failure but does not close the
`relay_transport` lane. The lane still needs the separate relay design gate,
real runtime transport, `musu.relay_transport_proof.v1`, route evidence with the
relay proof attached, and a two-PC physical test with direct path blocked.

## 2026-06-28 Relay Second-PC Proof Kit Alignment

Follow-up audit found that the final operator packet documented the relay
failure-injection gate, but the second-PC multi-device kit did not yet carry the
same hosted P2P/relay status, recorder, verifier, and direct-blocked proof
runbook. That made the physical relay proof path easier to miss during an
operator run.

Source fix:

- `scripts/windows/prepare-multidevice-test-kit.ps1` now copies
  `show-musu-pro-p2p-env-status.ps1`,
  `record-p2p-control-plane-evidence.ps1`, and
  `verify-p2p-control-plane-evidence.ps1` into the kit.
- The generated README now has a dedicated
  "Relay transport failure-injection proof" section. It keeps relay separate
  from direct route and V34 stale self-heal proof, requires a direct-blocked
  two-PC run, and names `musu.relay_transport_proof.v1`,
  `musu.route_evidence.v1` with relay proof attached, and
  `musu.relay_payload_delivery_proof.v1` as the evidence set.
- The runbook states that this remains diagnostic and
  `relay_transport_product_verified=false` until real QUIC/TLS relay runtime
  and verifier-passing physical evidence exist.

Verification:

- `scripts/windows/test-release-evidence-verifiers.ps1` now includes
  `second-PC kit includes relay transport proof tools and runbook`.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json` reports
  `ok=true`, `case_count=208`, and `failed_case_count=0`.

This aligns the physical proof collection path with the roadmap, but does not
close the lane. `relay_transport_product_verified=false` remains correct until
real relay runtime and direct-blocked physical evidence exist.

## 2026-06-28 P2P Evidence Integrity Refresh

The stale P2P control-plane evidence warning has a concrete current replacement
evidence file, but the P2P/relay product lane is still not complete.

Fresh evidence:

- Recorder:
  `scripts/windows/record-p2p-control-plane-evidence.ps1 -BaseUrl https://musu.pro -AllowUnverified -Json`.
- Evidence:
  `docs/evidence/p2p-control-plane/1.15.0-rc.22/20260628-143223-musu.pro.evidence.json`.
- Integrity sidecar:
  `docs/evidence/p2p-control-plane/1.15.0-rc.22/20260628-143223-musu.pro.evidence.json.sha256`.
- Verification:
  `verify-p2p-control-plane-evidence.ps1 -RequireIntegrity` reports
  `ok=false`, `fail_count=39`, `evidence_integrity_status=verified`, and
  `evidence_integrity_ok=true`.

This removed the sidecar-missing integrity warning in the clean-HEAD go/no-go
snapshot at `2026-06-28T14:36:32.5281353+09:00`, but it intentionally does not
mark P2P as complete. The current live relay evidence still reports
`relay_transport_wired=false`,
`relay_transport_payload_endpoint_wired=false`,
`relay_payload_transport_proven=false`, and zero relay route/proof/delivery
records. The release blockers remain real implementation/configuration gaps,
not evidence tampering or stale evidence format.

## 2026-06-28 Static Readiness Audit Closure

Follow-up code audit found three source-level release readiness gaps that could
be closed without waiting for Store approval or a second physical proof run:

- The frontend polling contract audit expected an explicit regression marker
  for dashboard pages using bounded EventSource behavior instead of browser
  auto-retry. The test name now matches that contract and
  `audit-frontend-polling-contract.ps1 -Json` reports `ok=true`.
- The Rust background-loop contract audit treated the bridge token watcher as
  an unapproved filesystem watcher and also tripped on a comment that named the
  indexer watcher. The audit allowlist now explicitly includes
  `musu-rs/src/bridge/mod.rs`, and the bridge comment describes the watcher
  without suggesting the bridge starts indexer watch. The audit now reports
  `ok=true`.
- The P2P store-forward relay source contract now rejects release relay tunnel
  submissions with blank `source_node_id`, `target_node_id`, or `tunnel_id`
  before the fail-closed runtime marker. This prevents a metadata-free payload
  from being accepted as a future release relay tunnel submission. The audit now
  reports `ok=true`.

Verification:

- `scripts/windows/audit-frontend-polling-contract.ps1 -Json` reports
  `ok=true`, `fail_count=0`.
- `scripts/windows/audit-rust-background-loop-contract.ps1 -Json` reports
  `ok=true`, `fail_count=0`.
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json` reports
  `ok=true`, `fail_count=0`.
- `npm run test:runtime-polling` reports `20` passing tests.
- `npm run test:p2p` reports `124` passing tests.

Non-proof caveats:

- A targeted Rust unit test for the relay tunnel submission contract was
  attempted, but this Windows environment failed the compile with
  `rustc-LLVM ERROR: out of memory` followed by cascading missing-prelude
  errors. That run is not source-level failure evidence and is not counted as a
  release proof.
- `cargo fmt --check` still reports pre-existing crate-wide rustfmt drift
  outside this change. The current update only corrected the touched import
  ordering and intentionally does not reformat unrelated Rust files.
- Local HTTPS verification of `https://musu.pro/privacy` and public config from
  this PC currently fails with a Cloudflare/TLS reset even though the public web
  surface is observable through browser/search. Until the canonical local
  verifier can produce current JSON evidence, `public_metadata_ok=false` remains
  a valid local go/no-go blocker.

This closes three static audit blockers, but it does not change the full product
status. The remaining release lanes are still design approval, real relay
transport evidence, V34 physical stale self-heal proof, Store distribution
approval/install proof, and current local public metadata verification.

## 2026-06-28 Local Packaged Runtime Evidence Refresh

Follow-up local release evidence found a tooling bug in the process ownership
audit: the packaged bridge registry can correctly record a wildcard bind address
such as `0.0.0.0:8211`, but the audit used that same wildcard as the HTTP client
target for `/health`. On this machine that fails even though the packaged bridge
is healthy. The audit now keeps the recorded registry address unchanged while
normalizing wildcard client health probes to `127.0.0.1:<port>`.

Verification:

- `scripts/windows/audit-musu-process-ownership.ps1 -Json` reports `ok=true`,
  `fail_count=0`, bridge registry `addr=0.0.0.0:8211`, and health checked via
  `127.0.0.1:8211`.
- Process ownership evidence:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-100747-HUGH_SECOND.process-ownership.json`.
- Startup single-instance evidence:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-100802-HUGH_SECOND.startup-single-instance.json`.
- Nested startup process-ownership evidence:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-100802-HUGH_SECOND.startup-single-instance.process-ownership.json`.
- Desktop repeated activation evidence:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-100827-HUGH_SECOND.desktop-single-instance.json`.

This closes the HUGH_SECOND local package process ownership, startup
single-instance, and desktop repeated-activation evidence gap for the current
rc.22 install. It does not replace the remaining two-machine runtime CPU/matrix
evidence, packaged private-mesh desktop proof, public metadata, Store,
relay-transport, V34, or design-approval gates.

## 2026-06-28 Single-Machine Packaged Smoke Refresh

The current rc.22 package now has fresh HUGH_SECOND single-machine smoke
evidence for the packaged WindowsApps runtime:

- Evidence:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-101659-HUGH_SECOND.evidence.json`.
- Verification:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-101659-HUGH_SECOND.verification.json`.
- Summary:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-101659-HUGH_SECOND.summary.md`.

The smoke used `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`,
resolved the packaged local surface as `local-bridge-only`, verified bridge
health at `http://127.0.0.1:8211`, and checked CLI route execution. The
verification reports `ok=true`, `fail_count=0`, `version=1.15.0-rc.22`,
`allow_developer_runtime=false`, and source commit
`85b4e2383f3157c25f6101aca90ff5e16da2d557`.

This closes the fresh single-machine smoke blocker for the current package. It
does not replace real second-PC multi-device proof, packaged private-mesh proof,
two-machine runtime idle CPU/matrix evidence, public metadata, Store
distribution, relay transport, V34, or design-approval gates.

## 2026-06-28 HUGH_SECOND Runtime CPU Evidence Refresh

The current rc.22 package now has fresh HUGH_SECOND runtime CPU evidence for
the packaged desktop runtime:

- Desktop-open idle CPU evidence:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-102430-HUGH_SECOND.desktop-open.evidence.json`.
- Full runtime CPU scenario matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-103303-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.

The desktop-open idle sample ran for 60.019s from clean git state on
`HUGH_SECOND`, reports `ok=true`, `git_dirty=false`, `hot_process_count=0`,
two MUSU processes, six owned WebView2 helpers, and total working set
`411.02MB`.

The full matrix ran the required `startup-open`, `runtime-started`,
`dashboard-open`, `desktop-open`, and `post-route` scenarios for 60s each from
clean git state on `HUGH_SECOND`. The post-route probe targeted `hugh-main` and
bound token `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_103303`; the verifier reports
`ok=true` and `fail_count=0`.

This advances the runtime CPU lanes from no current rc.22 local evidence to
HUGH_SECOND-side evidence. It does not close either runtime CPU release gate by
itself because `write-release-go-no-go.ps1` requires verifier-passing evidence
from at least two physical machines.

## 2026-06-28 Current Packaged Local Evidence Refresh

The current rc.22 local sideload package was rebuilt and installed again after
the Private Mesh source fix:

- MSIX:
  `.local-build\msix\output\musu_1.15.0.22_x64_local-sideload-manual.msix`.
- Last written:
  `2026-06-28T12:26:06+09:00`.
- Size:
  `40710731` bytes.

Fresh HUGH_SECOND package evidence now supersedes the earlier local evidence for
the current gate:

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-133347-HUGH_SECOND.evidence.json`.
- Single-machine verification:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-133347-HUGH_SECOND.verification.json`.
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-133347-HUGH_SECOND.process-ownership.json`.
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-133347-HUGH_SECOND.startup-single-instance.json`.
- Nested startup process ownership:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-133347-HUGH_SECOND.startup-single-instance.process-ownership.json`.
- Desktop repeated activation:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-133347-HUGH_SECOND.desktop-single-instance.json`.
- Desktop-open idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-134854-HUGH_SECOND.desktop-open.evidence.json`.
- Full runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-133611-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
- Runtime CPU matrix verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-133611-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`.

The latest go/no-go snapshot at `2026-06-28T13:53:13.4340964+09:00` reports
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`blockers=10`, `warnings=1`, `manifest_git.dirty=false`, and manifest commit
`a58a9fb039f9d39a7272f21474c75ac8aff8ab01`. It confirms the local packaged
smoke, process ownership, startup single-instance, desktop single-instance, and
second-PC CPU route-attempt lanes are green again on current HEAD. Runtime idle
CPU is `1/2 [HUGH_SECOND]`; runtime matrix is still not a release pass because
the product gate requires a second physical machine. Remaining blockers are
real second-PC multi-device proof, two-machine CPU/matrix proof, packaged
Private Mesh proof archive, public metadata, Store release evidence, P2P relay
control-plane proof, design approval, relay transport proof, and V34 physical
self-heal proof.

## 2026-06-28 Public Metadata Apex TLS NO-GO

The latest public metadata failure is now diagnosed more precisely in
`docs/PUBLIC_METADATA_APEX_TLS_NO_GO_2026_06_28.md`.

Current evidence from `HUGH_SECOND`:

- `verify-store-public-metadata.ps1 -Json` fails with `ok=false`,
  `fail_count=3`, and
  `failure_kinds=request_failed,dns_nameserver_mismatch` for canonical
  `https://musu.pro/privacy`, `https://musu.pro/support`, and
  `https://musu.pro/api/public-config`.
- `curl.exe -4 -L -I --http1.1 https://musu.pro/privacy` fails with
  `Recv failure: Connection was reset`.
- Verbose `curl.exe` shows the reset happens during the TLS handshake before
  response headers are received.
- `www.musu.pro` can complete TLS and receives a Vercel `307` redirect back to
  `https://musu.pro/privacy`, so the blocker is on the canonical apex HTTPS
  path, not the page source text.
- DNS authority is Cloudflare (`blakely.ns.cloudflare.com`,
  `weston.ns.cloudflare.com`), while `vercel domains inspect musu.pro` reports
  Vercel intended nameservers `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
- The verifier now emits `dns_diagnostics` with
  `nameserver_matches_expected=false`, `provider_guess=cloudflare`,
  current A records `104.21.82.53` and `172.67.196.17`, and AAAA records
  `2606:4700:3033::ac43:c411` and `2606:4700:3037::6815:5235`.
- Vercel production deployment `dpl_FULnchJY31ELsyCG46qN1dDtzpVZ` is `Ready`
  and aliases `https://musu.pro`; the release blocker is the canonical
  DNS/edge path proving public metadata from the user-facing apex.

This is a product-spec NO-GO because install, proof, privacy, support, and
public config all use `https://musu.pro` as the canonical public surface. It
cannot be closed by local code changes alone unless the domain authority/edge
TLS path is repaired and the canonical verifier passes again.

Follow-up at 2026-06-28 14:55 KST: the public desktop artifact URLs now have a
strong cache key and the desktop release canary passes against GitHub
`desktop-latest`. The apex metadata blocker remains separate: Vercel reports
production deployment `dpl_FULnchJY31ELsyCG46qN1dDtzpVZ` as `Ready` and aliased
to `https://musu.pro`, but `vercel domains inspect musu.pro` still reports
current nameservers `blakely.ns.cloudflare.com` and
`weston.ns.cloudflare.com`, not the intended Vercel nameservers. Local
`curl.exe` still sees connection reset on `https://musu.pro/privacy`.

## 2026-06-28 Second-PC Kit Refresh

After the current-package evidence refresh and latest-output contract fix, the
current rc.22 multi-device kit was regenerated from clean commit
`8e82fae46eb25b59171627627cab5dcfba7e847f`.
The concise handoff for the other physical machine is
`docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`.

Generated artifact:

- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260628-204644`.
- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260628-204644.zip`.
- Metadata:
  `kit-build-metadata.json` reports `version=1.15.0-rc.22`, branch
  `feat/v33-residual-finalize`, commit
  `8e82fae46eb25b59171627627cab5dcfba7e847f`, and `dirty=false`.
- Generator result:
  `latest-prepare-output.json` reports
  `schema=musu.multidevice_test_kit_prepare.v1`, `ok=true`, and proves the
  go/no-go `prepare-multidevice-test-kit.ps1 -Json` next action is executable
  and persisted as the current latest pointer.
- SHA256:
  `6718085a3765f6159e1f9571974e477f343a5825c536d99267d86335b22d0396`.
- Included proof tools:
  `run-second-pc-release-check.ps1`, `measure-musu-idle-cpu.ps1`,
  `measure-musu-runtime-cpu-scenarios.ps1`,
  `verify-runtime-cpu-scenario-matrix.ps1`,
  `test-second-pc-route-preflight.ps1`, V34 source/proof scripts, relay/P2P
  control-plane evidence scripts, and multidevice recorder/verifier scripts.

On `hugh-main`, use the targeted release-grade run against `hugh_second`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget hugh_second -RuntimeCpuRouteTarget hugh_second -FailOnRouteReachabilityDiagnostic -FailOnRuntimeCpuScenarioMatrix
```

If certificate trust fails, rerun from elevated PowerShell with `-MachineTrust`.
Return the generated `.local-build/second-pc-return/*.zip` to this repo and
import it before claiming the two-machine runtime CPU lanes. This kit does not
by itself close release-grade multi-device proof, because
`verify-multidevice-evidence.ps1` still requires hardened peer identity and
QUIC/TLS transport evidence beyond the legacy HTTP bearer route.

## 2026-06-28 Live Multi-device Release-grade Route Audit

`docs/MULTIDEVICE_RELEASE_GRADE_ROUTE_AUDIT_2026_06_28.md` records the latest
answer to the full-product question for the two installed PCs. The operator
proof from `hugh-main` remains valid for public install proof, direct fleet
health, and brain token ACL: `schema=musu.fleet_node_proof.v1`, `ok=true`,
`fail_count=0`, `online_nodes=2`, `direct_healthy_nodes=2`, package
`1.15.0.22`.

A fresh HUGH_SECOND smoke against `hugh-main` also completed the actual direct
LAN route:

- local diagnostic path:
  `.local-build/multi-device/musu-multidevice-smoke-20260628-192637.json`
- SHA256:
  `A98A398336592FC13164812F787C3080FF17E7D2DB7810C340422128137FB9A2`
- target:
  `hugh-main` at `192.168.1.192:4387`
- route output:
  `MUSU_REMOTE_ROUTE_OK`
- route result:
  `success`
- route kind:
  `lan`

That still does not close the release-grade multi-device product lane.
`verify-multidevice-evidence.ps1` rejected the evidence with `ok=false` and
`fail_count=6`: peer identity was not verified, peer identity method/key were
missing, encryption was legacy `none_http_bearer`, encryption was not
`quic_tls_1_3`, and `transport_verified_by` was not `musu_quic_tls_transport`.
Live probes matched the verifier: HTTPS health failed on both installed bridge
ports, while HTTP health returned 200 on both.

Source audit result: bridge TLS serving and HTTPS advertisement exist behind
`MUSU_TLS`, but the installed/public repair path currently starts HTTP bridges
and `fleet-proof.ps1` only proves direct fleet health, not release-grade
delegated-work transport. The verifier is correct to fail closed.

## Current Completion State

| Area | Status | Evidence | Completion claim allowed |
|---|---|---|---|
| PR #34 code/test/deploy checks | Mostly green | Deploy, Playwright, web build/typecheck, Rust core tests, SaaS gate, landing gate passed at current PR state | Code path is not the current blocker |
| PR #34 design approval | Not complete | 2026-06-30 GitHub refresh shows PR #34 still `OPEN`/`BLOCKED`, PR body still uses `Design: Pending`, issue #35 has evidence-refresh comments but no explicit approval comment, and `design-gate` is failing by design; see `docs/DESIGN_APPROVAL_CURRENT_STATE_2026_06_30.md` | Cannot merge PR #34 |
| rc.22 public install/proof channel | Complete for current rc.22 package | `fleet-proof.ps1` on `hugh-main`, install-channel verifier, package `1.15.0.22` | Public install/proof channel is valid for rc.22 |
| Two-PC direct fleet health | Complete for current rc.22 proof | `hugh-main-20260627T010201Z.fleet-proof.json`, `online_nodes=2`, `direct_healthy_nodes=2` | Direct two-PC fleet health/readiness is proven, but this is not the same as delegated task proof |
| Direct delegated-work route | Complete for current rc.22 package over direct LAN | Packaged `musu route` from `hugh_second` to `hugh-main` wrote `20260628-050231-HUGH_SECOND-to-hugh-main.packaged-direct-route-evidence.json`; `verify-direct-route-evidence.ps1` reports `ok=true`, `fail_count=0`; MSIX install evidence `20260628-050309-HUGH_SECOND.*` verifies the installed package | A visible direct online node is proven work-targetable over LAN for rc.22; this does not claim relay fallback or release-grade peer identity |
| Release-grade multi-device route proof | Not complete | Fresh HUGH_SECOND -> `hugh-main` diagnostic smoke at `.local-build/multi-device/musu-multidevice-smoke-20260628-192637.json` completed the LAN task, but `verify-multidevice-evidence.ps1` failed with `fail_count=6`: no verified peer identity, missing peer method/key, legacy `none_http_bearer`, no `quic_tls_1_3`, no `musu_quic_tls_transport`; HTTPS health failed on both installed bridge ports while HTTP health returned 200 | Cannot claim full multi-device product completion or release-grade delegated-work transport |
| Single-machine packaged smoke | Complete on HUGH_SECOND for current rc.22 package | `20260628-133347-HUGH_SECOND.evidence.json` verifies packaged WindowsApps `musu.exe`, bridge-only local surface `http://127.0.0.1:1695`, CLI route checked, `ok=true`, `fail_count=0` | HUGH_SECOND proves fresh packaged local smoke for rc.22; this does not satisfy second-PC multi-device or two-machine CPU/matrix gates |
| Local packaged process/startup/desktop instance evidence | Complete on HUGH_SECOND for current rc.22 package | Process ownership `20260628-133347-HUGH_SECOND`, startup single-instance `20260628-133347-HUGH_SECOND`, and desktop repeated activation `20260628-133347-HUGH_SECOND` all report `ok=true` | HUGH_SECOND proves packaged runtime ownership and single-instance behavior; this does not satisfy two-machine CPU/matrix or private-mesh packaged proof gates |
| Runtime idle CPU evidence | Partly complete for current rc.22 package | HUGH_SECOND desktop-open 60.028s evidence `20260630-145344-HUGH_SECOND.desktop-open.evidence.json` reports `ok=true`, `git_dirty=false`, owned WebView2 required, Node/WebView2 budgets included, and hot process count `0` | Counts as HUGH_SECOND side only; release gate still requires a second physical machine |
| Runtime CPU scenario matrix | Partly complete for current rc.22 package | HUGH_SECOND matrix `20260630-145519-HUGH_SECOND.runtime-cpu-scenario-matrix.json` verifies `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`, and targeted route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260630_145519`; strict verification has `ok=true`, `fail_count=0` | Counts as HUGH_SECOND side only; release gate still requires a second physical machine |
| Fleet relay display | Partly complete | UI/spec keeps relay as display/freshness state only | Relay can be shown, but not claimed as delegated-work routing |
| Real delegated-work relay transport | Not complete | `musu-rs/src/bridge/router.rs` says relay is not selected because relay/tunnel transport is not implemented; release tunnel submission has stricter source/target/tunnel metadata checks; web P2P writes now enforce hash-bound `source_node_id` when `MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS` is configured; the runtime still fails closed before real relay payload transit | Cannot claim relay task execution |
| Brain sidecar product bonding | Complete for current rc.22 packaged fresh launch | Sidecar bundle, `~/.musu/brain`, token ACL, non-shared store, task ingest hook, dedicated verifier/recorder, and `20260628-014357-HUGH_SECOND.brain-product-verification.json` with `fail_count=0` | Hidden brain chip is alive, loopback-only, version-coherent, and ingesting task/capture knowledge for rc.22 fresh launch |
| V34 discovery/stale self-heal | Partly complete | Candidate endpoints, observed-source additive candidate, bridge route preflight, CLI explicit-target stale-candidate preflight/reorder, heartbeat TTL filter, boot/local reconcile source path, dedicated V34 proof recorder, route-evidence-bound strict verifier, and source artifact path/type checks are implemented; see `docs/V34_SOURCE_ARTIFACT_PATH_TYPE_HARDENING_2026_06_30.md` | Needs rebuilt packaged proof plus physical stale registry/cache/manual-peer E2E proof before full self-heal claim |
| Store release readiness | Not complete | Current rc.22 Store-reviewed MSIX and submission bundle verify locally; verifier/recorder now require Partner Center approval plus Store-signed install evidence, installed desktop-entrypoint evidence, and Store install/launch timestamps; actual Microsoft Store evidence is not present | Cannot claim Microsoft Store readiness |
| Release candidate manifest | Complete for local artifacts | Current rc.22 local sideload, Store-reviewed MSIX, Store submission bundle, Tauri MSI/NSIS, and multi-device kit are in the manifest | Manifest no longer accepts stale `1.15.0.0` artifacts or bundles |
| Public metadata / canonical HTTPS | Not complete | `verify-store-public-metadata.ps1 -Json` fails request fetches against `https://musu.pro/*`; the DNS repair planner records Cloudflare NS plus Cloudflare apex A/AAAA, missing Vercel apex A `76.76.21.21`, missing `www.musu.pro` CNAME `cname.vercel-dns-0.com`, apex TLS failure, `www_tls.ok=true`, and `vercel_edge_apex_tls_ok=false` | Public support/privacy/config and install-channel metadata cannot be claimed release-grade until apex HTTPS is repaired and verifier passes |
| Support/operator evidence | Partly complete in latest local gate | Historical mailbox delivery proof is replaced by verified public support metadata proof, scoped by `SUPPORT_OPERATOR_GATE_RETIREMENT_2026_06_28.md` and recorded in `20260628-033452-support-operator-gate-retirement.*`; latest local HTTPS verifier from this PC cannot fetch current public metadata because the TLS connection resets | Support availability remains required; do not claim this lane green again until current canonical public metadata verification passes locally |

## Full Product Definition Of Done

MUSU is fully complete only when all of these are true at the same time:

1. A visible online node is work-targetable from the current machine.
2. Direct, relay-display, and offline states are separate and never overclaim
   routing.
3. `last_seen` and fleet freshness are evidence-backed, never fabricated from
   registry fetch time.
4. Remote `public_url` values are usable by another PC; loopback, localhost,
   wildcard, IPv4-mapped loopback/wildcard, and port 0 are rejected.
5. The install channel proves the installed package version, not only HTTP 200.
6. Brain is hidden, sidecar-owned, IPC-only, and stores data under
   `~/.musu/brain`; MUSU and brain never share SQLite writes.
7. Brain has packaged runtime evidence: token ACL, `/health`, real source
   ingest, recall/capture UX, and no exposed raw `:8080` user surface.
8. Delegated work works over direct routes and, if relay is presented as a work
   route, over a proven relay transport with route evidence.
9. V34 discovery/stale behavior has proof for stale registry rows, stale local
   cache/manual peers, boot reconcile, and route-preflight candidate selection.
10. Store or EV distribution has release evidence: current bundle, signing,
    certification or trusted-signing path, install/launch proof, and rollback.
11. Support/operator governance is either proven by current mailbox delivery
    evidence or formally retired by current public support metadata evidence
    without retiring support availability.
12. Final go/no-go tooling reports the same state from live/package evidence and
    lists no release blockers.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | The full product cannot be called complete today. | Latest clean product gate at `2026-06-30T17:19:51.4144555+09:00` on commit `fa0acd2d9733b0256a006732666e86cdabb8cecd` has `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`, runtime CPU evidence valid on `HUGH_SECOND` only, and `manifest_git.dirty=false`. | A broad "complete" claim would overstate the evidence. | Close the remaining physical/external product blockers. |
| NO-GO | Release-grade multi-device proof is still missing even though direct LAN work completed. | Fresh HUGH_SECOND -> `hugh-main` smoke completed `MUSU_REMOTE_ROUTE_OK`, but the strict multi-device verifier failed with `fail_count=6` because the route evidence was HTTP bearer with no verified peer identity and no `quic_tls_1_3`/`musu_quic_tls_transport` proof. | A healthy fleet plus a successful legacy LAN task is not enough for the full product spec. | Implement/start the hardened release transport on both packaged machines, rerun the smoke, and commit verifier-passing evidence. |
| NO-GO | Canonical `https://musu.pro` apex HTTPS resets during the public metadata verifier and now has a structured DNS/TLS repair plan. | `verify-store-public-metadata.ps1` fails with `request_failed,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`; `plan-musu-pro-public-metadata-dns-repair.ps1` records Cloudflare NS, Cloudflare apex A/AAAA, missing Vercel apex A, missing `www` CNAME, apex TLS failure, `www_tls.ok=true`, and `vercel_edge_apex_tls_ok=false`. | Public metadata, install channel, privacy/support, and Store metadata proof cannot be considered current from this machine. | Run the non-mutating repair planner, fix external DNS/TLS, then rerun public metadata and go/no-go verification. |
| NO-GO | PR #34 cannot merge without explicit design approval. | `Design: Pending` keeps `design-gate` failing. | The current implementation branch remains blocked even if code checks pass. | Get approval on issue #35, update PR body to `Design: Approved` with the approval URL, rerun checks. |
| HIGH | Relay is display-only, not a delegated-work transport. | `router.rs` does not return relay paths; relay proof docs still require actual transport evidence. | Yellow relay state cannot be sold as "task routes through MUSU relay". | Implement relay transport, fail-closed route evidence, and two-PC failure-injection proof. |
| INFO | Direct delegated-work over LAN is now proven for rc.22. | Packaged route evidence `20260628-050231-HUGH_SECOND-to-hugh-main.packaged-direct-route-evidence.json` verifies successfully and the go/no-go lane `direct_delegated_work_route` reports `pass`. | The previous 401/invalid-bearer blocker is closed for direct routes. | Keep the evidence committed; do not treat it as relay or release-grade transport proof. |
| INFO | Brain product proof is closed for fresh packaged launch, with one restart caveat. | Initial local recorder output failed while stale packaged desktop processes were already running; after AppX relaunch, official evidence `20260628-014357-HUGH_SECOND.brain-product-verification.json` reports `ok=true`, `fail_count=0`. | The hidden-brain spec is proven for fresh launch, but upgrade-in-place self-heal is not a separate release claim yet. | Keep the evidence committed; add an upgrade-in-place sidecar self-heal proof if that behavior becomes part of the release claim. |
| HIGH | Store readiness is still external evidence, not inferred from MSIX proof. | Current docs and verifier require Partner Center/MS certification/restricted capability approval plus Store-signed install proof and installed `musu-desktop.exe` entrypoint proof. | Public release through Store remains a manual/external gate, and approval-only records cannot flip the lane green. | Prepare current Store bundle, reserve product name, pass restricted capability review/certification, install the approved Store package on a physical machine, then record Store-signed install and launch proof. |
| MED | V34 stale self-heal is partly implemented but not fully proven. | Candidate set, observed-source additive candidate, bridge route preflight, CLI explicit-target stale-candidate preflight/reorder, heartbeat TTL, boot/local reconcile, artifact-bound strict V34 proof verifier, embedded route-evidence timing/timestamp checks, and 2026-06-30 source artifact path/type hardening exist; physical stale-state E2E evidence is still missing. | Reinstall/multi-NIC/stale-row tails can still surprise users until physical proof exists. | Rebuild the package, run the physical stale registry/cache/manual-peer proof, capture TTL/boot source artifacts through `capture-v34-source-snapshot.ps1` and `record-v34-source-artifacts.ps1`, then commit verifier-passing evidence. |
| INFO | Support mailbox delivery proof is now a retired historical gate once retirement evidence is current. | The replacement gate requires live support/privacy/public-config proof and rejects evidence that retires support availability. | This removes an operator-only release blocker without weakening the public support contract. | Keep public metadata verified; use mailbox proof only as an optional operational check. |

## Dependency Map

- PR #34 design approval blocks merge.
- PR #34 merge blocks a clean baseline for the next implementation lanes.
- Direct delegated-work proof is closed for the current rc.22 package over
  direct LAN.
- Store release depends on current package artifacts, Partner Center setup,
  restricted capability review, certification, and Store-signed install proof.
- Relay transport depends on router selection, transport implementation,
  fail-closed proof schema, live node-token source binding configuration, and
  two-PC failure-injection evidence. Source-level source binding is implemented;
  production deploy/configuration proof is still pending.
- Brain product proof is closed for the current rc.22 fresh packaged launch;
  upgrade-in-place sidecar self-heal remains a future hardening proof if needed.
- V34 self-heal depends on stale registry/cache/manual-peer cleanup,
  boot reconcile, CLI/bridge route-preflight E2E, and packaged physical proof.
- Final go/no-go depends on all evidence sources being current and indexed.

## Main Constraint

The immediate merge constraint is PR #34 design approval because it blocks
merging the current rc.22 proof/fleet fixes.

The immediate product-evidence constraint has moved past legacy direct
delegated-work proof, but not past release-grade multi-device transport proof.
The remaining product-evidence constraints are strict multi-device route proof,
second-PC CPU/matrix proof, Private Mesh packaged proof, public metadata DNS/TLS,
Store release evidence, real relay transport, and V34 stale self-heal evidence.
These are independent enough to run as parallel lanes, but the completion claim
must stay scoped until every lane has machine evidence.

## Roadmap

### Phase 0 - Close PR #34

Deliverables:
- Issue #35 explicit design approval comment.
- PR body updated to `Design: Approved` with approval URL.
- Checks rerun and green except no expected blockers.
- Merge PR #34 after approval.

Proof:
- GitHub PR checks.
- Design-gate log.
- Merged commit SHA.

Exit criteria:
- No `Design: Pending` status remains on PR #34.

Current 2026-06-30 note:
`docs/DESIGN_APPROVAL_CURRENT_STATE_2026_06_30.md` confirms this phase is
still blocked externally. Do not bypass the gate in source or PR text. The only
valid unblock is an explicit approval issue comment followed by a PR body update
that includes that exact `#issuecomment-...` URL.

### Phase 1 - Freeze The Product Readiness Gate

Status: implemented in `write-release-go-no-go.ps1`; the evidence lanes still
correctly report No-Go.

Deliverables:
- One canonical release readiness command or run card for the current product
  spec.
- It must distinguish direct proof, relay transport proof, brain proof, Store
  proof, and support/operator proof or formal support gate retirement.
- It must fail closed when evidence is missing or stale.

Proof:
- `write-release-go-no-go.ps1` or successor JSON shows each lane explicitly.
- Missing lanes are blockers, not warnings.

Exit criteria:
- Operators and agents cannot accidentally report "complete" from only direct
  fleet proof.

### Phase 2 - Store Or EV Distribution

Deliverables:
- Current Store submission bundle for rc.22 or successor.
- Partner Center product-name reservation evidence.
- Restricted capability review package.
- Microsoft certification and restricted capability approval evidence.
- Store-signed install/launch proof on a physical machine.

Proof:
- `prepare-store-submission-bundle.ps1`.
- `verify-store-submission-bundle.ps1`.
- `record-store-release-verification.ps1` with `-StoreSignedInstallEvidencePath`,
  `-StoreDesktopEntrypointEvidencePath`, `-StoreInstallObservedAt`, and
  `-StoreLaunchObservedAt`.
- Store-signed installed package identity, strict alias policy, Start-menu
  entrypoint, and launch evidence.

Exit criteria:
- Store readiness changes from "not proven" to "proven by Microsoft-reviewed
  package evidence".

### Phase 3 - V34 Discovery And Stale Self-Heal

Deliverables:
- Boot-time reconcile for local cache/manual peers against server truth and
  local reachability. Source path implemented; physical proof still required.
- TTL prune evidence for stale cloud rows.
- Stale-first-candidate route-preflight physical E2E.
- No duplicate task execution while trying route candidates.

Proof:
- Two physical nodes with injected stale public URL/cache/manual peer.
- Route evidence shows reachable LAN candidate selected before stale candidate.
- Registry/current fleet excludes heartbeat-expired rows.
- `capture-v34-source-snapshot.ps1` captures canonical TTL/boot before/after
  snapshots from physical `~/.musu` state.
- TTL source evidence uses schema `musu.v34_ttl_prune_source.v1` and is bound
  to the wrapper by SHA256 and field checks.
- Boot reconcile source evidence uses schema `musu.v34_boot_reconcile_source.v1`
  and is bound to the wrapper by SHA256 and field checks.
- TTL and boot source evidence must also carry non-empty source artifact paths
  and `source_type=operator_snapshot_pair`; the verifier rejects wrappers that
  omit those fields or substitute non-operator source types.
- The embedded source snapshots use schema `musu.v34_ttl_snapshot.v1` and
  `musu.v34_boot_snapshot.v1`, with counts/flags bound to the source evidence
  so arbitrary JSON cannot stand in for before/after physical state.
- `record-v34-source-artifacts.ps1` records those TTL/boot source artifacts
  from before/after snapshot JSON before `record-v34-self-heal-proof.ps1`
  wraps them into final release evidence.
- `verify-v34-self-heal-proof.ps1` accepts the proof and rejects weak
  boolean-only proof, missing source artifacts, duplicate task execution, and
  unroutable selected candidates.
- The second-PC kit includes `record-v34-self-heal-proof.ps1`,
  `verify-v34-self-heal-proof.ps1`, and the V34 stale self-heal runbook so the
  remaining physical proof is collected with the canonical recorder instead of
  hand-written JSON.

Exit criteria:
- Reinstall, port changes, stale rows, and multi-NIC address drift self-heal
  without manual cleanup.

### Phase 4 - Real Relay Transport

Deliverables:
- Relay transport strategy approved by a separate design gate.
- Router direct failure to relay fallback.
- Release-grade relay transport proof bound to the source node, target node,
  transport kind, peer identity, and route evidence.
- Failure-injection playbook: direct blocked -> relay task succeeds -> heartbeat
  expiry/offline still behaves correctly.

Proof:
- `musu.relay_transport_proof.v1`.
- `musu.route_evidence.v1` with relay proof attached.
- Two-PC physical test with direct path blocked.

Exit criteria:
- The product can honestly say delegated work routes through relay when direct
  is unavailable.

### Phase 5 - Brain Product Completion

Status: complete for the current rc.22 packaged fresh launch on `HUGH_SECOND`.
Keep this phase open only for upgrade-in-place hardening or explicitly scoped
future ingest surfaces such as fleet events.

Deliverables:
- Packaged first-run creates `~/.musu/brain`.
- Token file exists, ACL is restricted, token value is never logged.
- Brain `/health` is proven against the expected service, not merely any process
  on port 8080.
- Real task completion creates a source through `POST /v1/sources`.
- Cockpit recall/capture UX exists inside MUSU.
- Fleet event ingest is either implemented or explicitly scoped out.
- Brain version surface is native or release metadata is strong enough to gate
  package coherence.

Proof:
- `record-brain-product-proof.ps1 -OutputRoot docs\evidence\brain-product\<version> -Json`.
- `verify-brain-product-proof.ps1 -EvidencePath <BRAIN_PRODUCT_JSON> -ExpectedVersion <version> -Json`.
- Packaged sidecar health evidence.
- Task source ingest evidence under `~/.musu/brain`.
- UX smoke/e2e proof for recall/capture.
- Current rc.22 evidence:
  `docs/evidence/brain-product/1.15.0-rc.22/20260628-014357-HUGH_SECOND.brain-product-proof.json`
  and matching verification with `ok=true`, `fail_count=0`.

Exit criteria:
- The user never needs to know the brain exists, and the product can prove the
  hidden chip is alive, version-coherent, and receiving knowledge.

### Phase 6 - Final Release Evidence Packet

Deliverables:
- Current package install proof.
- Direct two-PC proof.
- Relay transport proof if relay is part of the release claim.
- Brain product proof.
- Store/EV distribution proof.
- Support/operator evidence or formal retirement; current rc.22 uses formal
  retirement evidence.
- Rollback/cleanup path.
- LLM/wiki/index refresh.

Proof:
- Final go/no-go JSON has `ok=true` or equivalent, no blockers.
- Evidence files are committed or archived according to the release run card.
- `musu indexer sync` and recall queries return the final roadmap, evidence,
  and handoff docs.

Exit criteria:
- "MUSU product spec complete" becomes an evidence-backed release claim, not a
  summary judgment.

## 2026-06-28 Wrap-Up Local Packaged Evidence Refresh

Today closed the post-source local package freshness drift as far as the
short-running package identity lanes are concerned, but it did not complete the
product spec.

Clean wrap-up gate:

- `.local-build/go-no-go/after-58df8e0b-wrapup-clean.json`
- `generated_at=2026-06-28T23:21:19.6978900+09:00`
- `manifest_git.commit=58df8e0b6d8f8afcc7cdf5fd3baec83a39b3b2c8`
- `manifest_git.dirty=false`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=11`
- `warnings=0`

Changes and evidence:

- Brain sidecar pin moved to current `F:\musu_2nd_brain` HEAD
  `63bf5bb9729c96d1c507ba13e7ec1a338cdf2c02`.
- `repair-packaged-local-runtime-state.ps1` now tolerates a null helper record
  during repo orphan helper cleanup.
- Sidecars were rebuilt, the local sideload MSIX was repackaged and installed,
  and packaged runtime repair passed on `HUGH_SECOND`.
- New evidence paths:
  `20260628-231247-HUGH_SECOND` MSIX install,
  `20260628-231344-HUGH_SECOND` single-machine smoke,
  `20260628-231440-HUGH_SECOND` process ownership,
  `20260628-231459-HUGH_SECOND` startup single-instance,
  `20260628-231520-HUGH_SECOND` desktop single-instance, and
  `20260628-231633-HUGH_SECOND` runtime idle CPU attempt.

Current qualitative status:

- Local packaged install/runtime identity is healthy on `HUGH_SECOND`.
- The strict runtime idle CPU lane remains open because the latest sample did
  not include required Node/WebView2/owned-WebView2 flags.
- The runtime CPU scenario matrix and second-PC route-attempt lanes remain open
  because they were not rerun during wrap-up.
- The full-product blocker set remains physical/external or not-yet-built:
  multi-device, Private Mesh packaged proof, two-machine CPU/matrix, public
  metadata DNS/TLS, Store, live P2P control-plane, design approval, real relay
  transport, and V34 physical stale self-heal.

Canonical wrap-up report:

- `docs/LOCAL_PACKAGED_EVIDENCE_REFRESH_2026_06_28_WRAPUP.md`

## 2026-06-30 HUGH_SECOND Runtime CPU Evidence Refresh

The next local runtime CPU pass was completed on `HUGH_SECOND` using the
release-required flags and a real peer route target. A later same-day refresh
also restored the current single-machine smoke evidence after V34 proof-gate
hardening reopened source freshness.

Clean gate:

- `.local-build/go-no-go/latest.json`
- `generated_at=2026-06-30T16:18:55.8408998+09:00`
- `manifest_git.commit=507a47b06584e610ba20d7b6927de2ca84bf058b`
- `manifest_git.dirty=false`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=0`

This is the post-commit recheck after documenting and committing the evidence
refresh, so the documentation/evidence commit did not reopen runtime source
freshness blockers.

New evidence:

- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260630-145344-HUGH_SECOND.desktop-open.evidence.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260630-160210-HUGH_SECOND.evidence.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260630-160210-HUGH_SECOND.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-161009-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-161009-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`

What changed:

- The prior idle CPU attempt was not counted because it omitted strict release
  flags. The new idle capture includes `-RequireOwnedWebView2`, `-IncludeNode`,
  and `-IncludeWebView2`, and go/no-go now records
  `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`.
- The new full matrix covers `startup-open`, `runtime-started`,
  `dashboard-open`, `desktop-open`, and `post-route` with
  `-RunRouteProbe -RouteTarget hugh-main`; strict verification passes with
  `fail_count=0`.
- The new single-machine smoke verification passes with `fail_count=0`,
  `single_machine_surface=local-bridge-only`, and `cli_route_checked=true`.
- `runtime_cpu_second_pc_route_attempt_verified=true`, so this pass removes the
  `runtime-cpu-second-pc-route-attempt` blocker.

What did not change:

- Full product readiness is still false.
- Runtime idle CPU and runtime CPU scenario matrix still need a second physical
  machine to reach `2/2`.
- The `hugh-main` route attempt proves a CPU post-route sample after a targeted
  peer route, not release-grade peer identity. The route explain still records
  legacy `http_bearer`, `peer_identity_verified=false`, and
  `encryption=none_http_bearer`, so multi-device/release transport blockers
  remain open.
- The remaining blocker set is now: multi-device, Private Mesh packaged proof,
  second-machine idle CPU, second-machine runtime CPU matrix, public metadata,
  Store, P2P control plane, design approval, relay transport, and V34 stale
  self-heal.

Canonical report:

- `docs/RUNTIME_CPU_EVIDENCE_REFRESH_2026_06_30.md`

## 2026-06-30 Current-HEAD Second-PC Kit Refresh

The second physical machine evidence path was refreshed again after the rc.22
local evidence and docs update. The generated kit is current to clean commit
`aeaec9570a575c7ad367329ad10f711f3a766e8d` and is the kit that should be run
on `hugh-main` for the next two-machine CPU/matrix attempt.

Generated artifact:

- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260630-163138`.
- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260630-163138.zip`.
- Metadata:
  `kit-build-metadata.json` reports `version=1.15.0-rc.22`, branch
  `feat/v33-residual-finalize`, commit
  `aeaec9570a575c7ad367329ad10f711f3a766e8d`, and `dirty=false`.
- Generator result:
  `latest-prepare-output.json` reports
  `schema=musu.multidevice_test_kit_prepare.v1`, `ok=true`,
  `generated_at=2026-06-30T16:31:53.8009169+09:00`, and points at this kit.
- SHA256:
  `97fa33d3357f48f5a8ec41e0ce32a513d0faab4d5bd4840cefdcc880dbe1f9e2`.

On `hugh-main`, run the targeted release-grade return command from the extracted
kit directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget hugh_second -RuntimeCpuRouteTarget hugh_second -FailOnRouteReachabilityDiagnostic -FailOnRuntimeCpuScenarioMatrix
```

This refresh does not close the runtime idle CPU, runtime CPU matrix, or
multi-device product blockers by itself. It only removes stale handoff risk so
the next `hugh-main` return zip can be imported and judged against the current
rc.22 evidence contract.

## 2026-06-30 Public Metadata DNS/TLS Evidence Refresh

The public metadata lane was refreshed with the non-mutating DNS repair
planner. New evidence:

- `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260630-152710-musu-pro-dns-repair-plan-current.json`
- SHA256:
  `7CBE392B2B0678814C470F0BE7D695BE5C7C05BF2127E764683011C6BA71DC36`

The evidence confirms `release_blocker_present=true`,
`ready_for_public_metadata_verifier=false`, `will_mutate_external_dns=false`,
Cloudflare nameservers/A/AAAA are still active for the apex, expected Vercel
apex A `76.76.21.21` is missing, expected `www` CNAME is missing, apex TLS
fails, `www` TLS passes, and direct Vercel edge apex TLS fails. This is still
an external DNS/TLS repair blocker, not a local code blocker. Canonical report:

- `docs/PUBLIC_METADATA_DNS_REPAIR_CURRENT_2026_06_30.md`

## Confidence

High confidence:
- rc.22 two-PC direct fleet readiness is proven for `hugh-main` and
  `hugh_second`.
- rc.22 hidden brain sidecar fresh-launch readiness is proven on
  `HUGH_SECOND` with verifier-passing task ingest and capture recall evidence.
- rc.22 support/operator governance has formal mailbox delivery gate retirement
  evidence, but canonical public metadata remains blocked by apex DNS/TLS.
- The current repo intentionally prevents relay overclaim by keeping relay out
  of selected route paths until transport exists.
- PR #34 is blocked by design approval, not by the currently observed code/test
  checks.

Medium confidence:
- The install/proof channel is correct for rc.22. It should be rerun after any
  package, route, installer, or public script change.
- Upgrade-in-place sidecar relaunch behavior should be hardened separately if
  it becomes a release claim; the current evidence proves fresh packaged launch.

Unknown or needs evidence:
- Microsoft Store certification timing and restricted capability approval.
- Relay transport design choice and self-contained risk until the separate
  relay design gate is run.
