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

Authoritative 2026-06-30 local evidence refresh gate:

- Command source:
  `.local-build/go-no-go/latest.json`
- `generated_at`: `2026-06-30T17:19:51.4144555+09:00`
- `manifest_git.commit`: `fa0acd2d9733b0256a006732666e86cdabb8cecd`
- `manifest_git.dirty=false`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=0`
- `single_machine_verified=true`
- `runtime_idle_cpu_verified=false`
- `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_verified=false`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1 [HUGH_SECOND]`
- `public_metadata_ok=false`
- `p2p_control_plane_verified=false`
- `relay_transport_product_verified=false`

2026-06-30 16:57 KST second-PC / Private Mesh handoff hardening: the current
quality bar improved, but the product remains NO-GO. The second-PC release
wrapper now captures target-side Private Mesh physical-peer evidence, returns
the JSON plus `.sha256` sidecar in the second-PC zip, and the importer copies
it into `.local-build\private-mesh-physical-peer\` for the final packaged
Private Mesh proof archive. The regenerated kit is
`.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260630-165500.zip`
with SHA256
`78f126b9c67c5c867bceecb1e739694697a0dc840fe6c6a7c1f3dba8ca14f0aa`.
`test-release-evidence-verifiers.ps1 -Json` passed with `case_count=219` and
`failed_case_count=0`. This is a good evidence-pipeline improvement: it closes
a manual handoff gap and reduces the chance that the final proof uses stale or
wrong-machine physical-peer JSON. It does not reduce the blocker count because
the release gate still needs `hugh-main` physical return evidence and a
verified packaged desktop Private Mesh release-proof archive.

2026-06-30 17:12 KST P2P/relay current-state correction: the hosted source
payload endpoint gap is no longer the active source blocker.
`show-musu-pro-p2p-env-status.ps1 -Json` at
`2026-06-30T17:11:08.2291762+09:00` reports
`release_relay_payload_endpoint_implemented=true`,
`release_payload_endpoint_proof_bound=true`,
`release_payload_preflight_only=false`, and
`release_tunnel_payload_endpoint_missing=false`. The remaining P2P/relay
source blockers are narrower and more serious:
`release_relay_tunnel_runtime_implemented=false`,
`release_relay_tunnel_runtime_not_implemented_branch_active=true`,
`preview_store_forward_payload_queue_non_release_grade=true`, missing
KV/Upstash release storage env, and missing live release-grade P2P control-plane
evidence. `audit-p2p-store-forward-relay-contract.ps1 -Json` at
`2026-06-30T17:11:06.7683867+09:00` passed with `ok=true`, `fail_count=0`.
Qualitative read: no false-green release relay claim was found; the code is
still fail-closed, and the real blocker is implementation/deployment/proof of
the `quic_relay_tunnel` runtime.

2026-06-30 17:26 KST Vercel P2P env sync hardening: the deploy workflow now
uses Vercel REST env upsert for production P2P control-plane values instead of
`vercel env add`. Token-bearing values are sent as Vercel sensitive env, and
the workflow logs only key/status summaries. `audit-secret-storage-contract.ps1`
now verifies this source contract. Verification passed with
`audit-secret-storage-contract.ps1 -Json -FailOnProblem` reporting `ok=true`,
`fail_count=0`, and `test-release-evidence-verifiers.ps1 -Json` reporting
`ok=true`, `case_count=219`, `failed_case_count=0`. This improves the path that
will eventually close the hosted KV/Upstash/env blocker, but it does not
provision values or create live P2P evidence by itself. Canonical report:
`docs/VERCEL_P2P_ENV_SYNC_AUDIT_2026_06_30.md`.

2026-06-30 17:50 KST relay lease transport intent fail-closed update: the relay
lease API now separates preview queue leases from release tunnel intent.
`POST /api/v1/p2p/relay/lease` accepts optional
`transport_intent=store_forward_queue|release_tunnel`; omitted intent defaults
to `store_forward_queue`, and explicit `release_tunnel` stays blocked by
release transport/runtime gates. Unknown intent values return 400 validation
errors. Verification passed `npm run test:p2p` (`133/133`),
`npm run typecheck`, and `audit-p2p-store-forward-relay-contract.ps1 -Json`
with `ok=true`, `fail_count=0`, generated at
`2026-06-30T17:50:01.0020182+09:00`. This is a positive contract hardening:
the code now makes it harder to confuse preview store-forward queue readiness
with release tunnel readiness. It does not reduce the blocker count because the
real `quic_relay_tunnel` runtime, hosted release storage/env, live control-plane
evidence, relay route proof, transport proof, delivery proof, and direct-blocked
two-PC proof remain missing. Canonical report:
`docs/RELAY_LEASE_TRANSPORT_INTENT_FAIL_CLOSED_2026_06_30.md`.

2026-06-30 18:14 KST Rust relay lease intent DTO alignment: the web lease
intent split is now represented in the Rust client DTO. `RelayTransportIntent`
serializes `store_forward_queue` and `release_tunnel`, `P2pRelayLeaseRequest`
has optional `transport_intent`, and existing runtime fallback/callback lease
builders explicitly send `StoreForwardQueue`. Targeted verification passed
touched-file `rustfmt --check`, `cargo test ... relay_lease_request_serializes
--lib` (`2 passed`), `cargo test ...
relay_lease_request_records_failed_direct_paths_without_using_relay_as_default
--lib` (`1 passed`), and the P2P relay contract audit. Qualitative read: this
removes a typed-client gap that would have blocked future release tunnel work,
but it is not byte transit and does not reduce the product blocker count.

2026-06-30 16:18 KST post-V34-hardening evidence refresh: after the V34
proof-gate commit reopened source freshness, HUGH_SECOND recaptured
single-machine packaged smoke and then recaptured the full five-scenario
runtime CPU matrix from a clean tree with `-RunRouteProbe -RouteTarget
hugh-main`. New evidence:
`docs/evidence/single-machine/1.15.0-rc.22/20260630-160210-HUGH_SECOND.evidence.json`
plus verification, and
`docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-161009-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
plus verification. The clean go/no-go at `2026-06-30T16:18:55.8408998+09:00`
reports `blockers=10`, `single_machine_verified=true`,
`runtime_cpu_scenario_matrix_valid_machine_count=1/2 [HUGH_SECOND]`, and
`runtime_cpu_second_pc_route_attempt_verified=true`. The product remains
NO-GO because CPU/matrix evidence is still one-machine only and the remaining
blockers require second-PC, Private Mesh packaged proof, public DNS/TLS, Store,
P2P, design approval, relay transport, and V34 physical stale-state proof.

2026-06-30 15:12 KST post-commit update: HUGH_SECOND recaptured release-required
`desktop-open` idle CPU with `-RequireOwnedWebView2`, `-IncludeNode`, and
`-IncludeWebView2`, then recaptured the full five-scenario runtime CPU matrix
with `-RunRouteProbe -RouteTarget hugh-main`. Both captures were clean
(`git_dirty=false`) and verifier-passing. This moves blocker count from `11` to
`10` because `runtime_cpu_second_pc_route_attempt_verified=true`. The product
remains NO-GO because idle CPU and matrix evidence are still only `1/2`
machines, and the remaining blockers still require second-PC, external DNS/TLS,
Store, P2P, design approval, relay transport, and V34 stale-state proof. See
`docs/RUNTIME_CPU_EVIDENCE_REFRESH_2026_06_30.md`.

2026-06-30 relay transport code audit: the release relay lane is correctly
fail-closed, not accidentally complete. `musu-rs/src/bridge/router.rs` still
documents that relay is not selected because relay/tunnel transport is not
implemented. `musu-rs/src/bridge/rendezvous.rs` validates release relay tunnel
metadata, then returns `release_relay_tunnel_runtime_not_implemented`.
`musu-rs/src/bridge/handlers/relay_payload.rs` implements the target-side
store-forward queue drain/poller and requires a separate
`musu_quic_tls_transport` proof before recording release-grade delivery. This
is a safer product state than overclaiming relay, but it keeps
`relay_transport_product_verified=false` and `p2p_control_plane_verified=false`
until a real `quic_relay_tunnel` runtime plus two-PC direct-blocked proof
exists. Canonical next-step document:
`docs/RELAY_TRANSPORT_CODE_AUDIT_2026_06_30.md`.

2026-06-30 public metadata DNS/TLS refresh: the non-mutating repair planner
recorded current evidence at
`docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260630-152710-musu-pro-dns-repair-plan-current.json`
with SHA256
`7CBE392B2B0678814C470F0BE7D695BE5C7C05BF2127E764683011C6BA71DC36`.
It confirms `release_blocker_present=true`,
`ready_for_public_metadata_verifier=false`, Cloudflare nameservers
`blakely.ns.cloudflare.com` and `weston.ns.cloudflare.com`, Cloudflare apex
A/AAAA records, missing expected Vercel apex A `76.76.21.21`, missing expected
`www` CNAME, `apex_tls.ok=false`, `www_tls.ok=true`, and
`vercel_edge_apex_tls_ok=false`. Canonical next-step document:
`docs/PUBLIC_METADATA_DNS_REPAIR_CURRENT_2026_06_30.md`.

2026-06-30 design approval current-state refresh:
`docs/DESIGN_APPROVAL_CURRENT_STATE_2026_06_30.md` records a live GitHub check
of PR #34 and issue #35. PR #34 is still `OPEN`, merge state `BLOCKED`, and
the PR body still says `Design: Pending`. Issue #35 has three evidence-refresh
comments, but no explicit CEO/design approval comment. `gh pr checks 34`
shows all visible non-design checks passing and `design-gate` failing. This is
the correct fail-closed state; the next action is a human approval comment on
issue #35, then a PR body update with `Design: Approved` plus the exact
approval comment URL.

2026-06-30 V34 source artifact path/type hardening:
`docs/V34_SOURCE_ARTIFACT_PATH_TYPE_HARDENING_2026_06_30.md` records a
verifier hardening for the V34 stale self-heal lane. `verify-v34-self-heal-proof.ps1`
now rejects final proof wrappers that omit
`ttl_source_evidence_path` / `boot_source_evidence_path`, and it requires both
embedded source artifacts to declare `source_type=operator_snapshot_pair`.
`test-release-evidence-verifiers.ps1 -Json` passed with `ok=true`,
`case_count=216`, and `failed_case_count=0`. This is a proof-gate hardening
only; `v34_stale_self_heal_verified=false` remains correct until physical
two-node stale-state evidence is committed.

Authoritative 2026-06-28 wrap-up clean gate:

- Command source:
  `.local-build/go-no-go/after-58df8e0b-wrapup-clean.json`
- Snapshot file:
  `.local-build/go-no-go/latest.json`
- `generated_at`: `2026-06-28T23:21:19.6978900+09:00`
- `manifest_git.commit`: `58df8e0b6d8f8afcc7cdf5fd3baec83a39b3b2c8`
- `manifest_git.dirty=false`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=11`
- `warnings=0`
- `single_machine_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `msix_install_verified=true`
- `runtime_idle_cpu_verified=false`
- `runtime_idle_cpu_valid_machine_count=0/2`
- `runtime_cpu_scenario_matrix_verified=false`
- `runtime_cpu_scenario_matrix_valid_machine_count=0/2`
- `runtime_cpu_second_pc_route_attempt_verified=false`
- `brain_product_verified=true`
- `public_metadata_ok=false`
- `p2p_control_plane_verified=false`
- `relay_transport_product_verified=false`

2026-06-28 23:21 KST wrap-up: after updating the brain sidecar pin to
`63bf5bb9729c96d1c507ba13e7ec1a338cdf2c02`, rebuilding sidecars, repackaging
and reinstalling the local MSIX, repairing the packaged runtime, and committing
fresh local install/smoke/process/startup/desktop evidence, the local package
identity lanes are green again. The product still remains NO-GO. Blocker count
is `11`, not `10`, because today's runtime idle CPU sample was captured without
the strict release flags required by go/no-go
(`-RequireOwnedWebView2`, `-IncludeNode`, `-IncludeWebView2`), and the runtime
CPU scenario matrix / second-PC route-attempt evidence was intentionally left
for the next session instead of running another long measurement. See
`docs/LOCAL_PACKAGED_EVIDENCE_REFRESH_2026_06_28_WRAPUP.md`.

Authoritative post-source-change local gate:

- Command source:
  `.local-build/go-no-go/after-fb971909-relay-poller-alignment.json`
- Snapshot file:
  `.local-build/go-no-go/after-fb971909-relay-poller-alignment.json`
- `generated_at`: `2026-06-28T22:26:26.9390333+09:00`
- `manifest_git.commit`: `fb971909670df187f364c3741d0a2fc54e45a26f`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=15`
- `warnings=0`
- `single_machine_verified=false`
- `process_ownership_verified=false`
- `startup_single_instance_verified=false`
- `desktop_single_instance_verified=false`
- `runtime_cpu_second_pc_route_attempt_verified=false`
- `runtime_idle_cpu_verified=false`
- `runtime_idle_cpu_valid_machines=0/2 []`
- `runtime_cpu_scenario_matrix_verified=false`
- `runtime_cpu_scenario_matrix_valid_machines=1/2 [HUGH_SECOND]`
- `private_mesh_packaged_release_proof_verified=false`
- `public_metadata_ok=false`
- `p2p_store_forward_relay_contract_verified=true`
- `p2p_control_plane_verified=false`
- `relay_transport_product_verified=false`
- `manifest_dirty=false`

2026-06-28 22:26 KST post-relay-poller source gate: after commit
`fb971909670df187f364c3741d0a2fc54e45a26f`, the release gate still reports
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`warnings=0`, and `manifest_git.dirty=false`, but `blockers` rises from 10 to
15. This is expected freshness behavior after a runtime source change: the
previous package-bound single-machine smoke, process ownership, startup
single-instance, desktop single-instance, and runtime CPU post-route-attempt
lanes no longer count for the new source commit. The substantive external and
physical product blockers remain unchanged: multi-device, Private Mesh packaged
release proof, two-machine idle CPU, two-machine CPU scenario matrix, public
metadata DNS/TLS, Store release, P2P control plane, explicit design approval,
real relay transport, and V34 stale self-heal physical proof.

2026-06-28 22:02 KST clean docs-refresh gate: after commit
`69b127f94d0230177339cfeae278bcd5fb9bb1c1`, the release gate still reports
`full_product_spec_ready=false`, `ready_for_public_desktop_release=false`,
`blockers=10`, `warnings=0`, and `manifest_git.dirty=false`. The blocker list
is still multi-device, Private Mesh packaged release proof, two-machine idle
CPU, two-machine CPU scenario matrix, public metadata DNS/TLS, Store release,
P2P control plane, explicit design approval, real relay transport, and V34
stale self-heal physical proof.

2026-06-28 doctor relay poller alignment: source audit found that the bridge
relay payload poller runtime is default-on with explicit opt-out, while
`musu doctor --json` treated it as env-opt-in. The doctor path now calls the
runtime helper and reports relay target polling as `default-on-opt-out`; the
P2P relay contract audit message was also aligned so future audit JSON no
longer claims the target poller is default-off. This fixes evidence accuracy
and background-loop attribution only. It does not close the relay transport
product lane because `release_relay_tunnel_runtime` is still not implemented
and live route/transport/delivery proof is still absent. See
`docs/DOCTOR_RELAY_POLLER_RUNTIME_ALIGNMENT_2026_06_28.md`.

2026-06-28 21:56 KST current-HEAD second-PC kit refresh: after the W-7 release
endpoint source-node binding extension, the second-PC handoff kit was regenerated
from clean commit `7b53042177735ecab752bc857dd9455af996f6c7` at
`.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260628-215431.zip`
with SHA256
`2bbb4b534e4b8e49407a533d07884e56a5f8361f40131a8a67f81b572497dd1a`.
The fresh go/no-go snapshot still reports
`full_product_spec_ready=false`,
`ready_for_public_desktop_release=false`, `blockers=10`, `warnings=0`, and
`manifest_git.dirty=false`. The kit refresh keeps the `hugh-main` evidence path
current; it does not close any product lane until that kit is run on the main PC
and the return zip/evidence is imported and verified.

2026-06-30 16:31 KST current-HEAD second-PC kit refresh: after the rc.22 local
evidence/docs update, the second-PC handoff kit was regenerated again from clean
commit `aeaec9570a575c7ad367329ad10f711f3a766e8d` at
`.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260630-163138.zip`
with SHA256
`97fa33d3357f48f5a8ec41e0ce32a513d0faab4d5bd4840cefdcc880dbe1f9e2`.
`latest-prepare-output.json` reports
`schema=musu.multidevice_test_kit_prepare.v1`, `ok=true`,
`generated_at=2026-06-30T16:31:53.8009169+09:00`, branch
`feat/v33-residual-finalize`, `dirty=false`, and package
`musu_1.15.0.22_x64_local-sideload-manual.msix`. The current `hugh-main`
handoff command remains target-bound to `hugh_second`. This update removes stale
handoff risk only; the runtime idle CPU, runtime CPU scenario matrix, and
multi-device product lanes remain open until `hugh-main` returns verifier-
passing evidence.

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

2026-06-28 21:20 KST W-7 relay source-node auth binding hardening:
`MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS` now maps bearer token SHA-256 values to
allowed `source_node_id` values, and the web P2P control plane rejects configured
mismatches with `source_node_id_auth_mismatch`. The gate is enforced on
rendezvous, room rendezvous, relay lease, relay payload, relay transport proof,
route evidence, release relay connect preflight, and release relay payload
preflight writes. Verification passed targeted release endpoint coverage,
`npm run test:p2p` with 131 tests, `npm run typecheck`, and
`audit-p2p-store-forward-relay-contract.ps1 -Json` plus
`audit-operator-api-security-contract.ps1 -Json` with `ok=true`, `fail_count=0`.
This closes a source-level spoofing gap only. The product remains NO-GO until
the live control plane is deployed/configured and release-grade relay transport,
storage, route evidence, transport proof, and payload delivery proof exist.

2026-06-28 21:31 KST post-push recheck for commit `55f3f820`: PR #34 checks are
green except the intentional `design-gate` failure. `Deploy to Vercel`, `Web
typecheck and build`, `Rust core tests`, `Playwright E2E`,
`landing-ceo-approval-gate`, `saas-gate`, and the short `test` check passed.
The product remains NO-GO because `design-gate` still lacks explicit approval,
and fresh `verify-store-public-metadata.ps1 -Json` still fails the canonical
`https://musu.pro` apex with `request_failed`, `dns_nameserver_mismatch`,
`apex_tls_handshake_failed`, and `vercel_edge_apex_tls_failed`.

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
  `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.22-20260628-215431.zip`.
- Kit metadata:
  `version=1.15.0-rc.22`, branch `feat/v33-residual-finalize`, commit
  `7b53042177735ecab752bc857dd9455af996f6c7`, and `dirty=false`.
- Generator result:
  `schema=musu.multidevice_test_kit_prepare.v1`, `ok=true`,
  `generated_at=2026-06-28T21:54:42.3597840+09:00`, and
  `.local-build\multi-device-test-kit\latest-prepare-output.json` now proves
  the go/no-go `prepare-multidevice-test-kit.ps1 -Json` next action is
  executable and no longer leaves the latest pointer stale.
- Release manifest artifact:
  current generated zip SHA256
  `2bbb4b534e4b8e49407a533d07884e56a5f8361f40131a8a67f81b572497dd1a`.
- Current handoff:
  `docs/SECOND_PC_KIT_HANDOFF_2026_06_28.md`.

This does not close the second-PC blockers by itself; it updates the artifact
that must be extracted and run on `hugh-main`.

## P2P / Relay Audit

Fresh local source audit after the current second-PC kit/documentation refresh:

- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`
- `schema=musu.p2p_store_forward_relay_contract.v1`
- `ok=true`
- `fail_count=0`
- `generated_at=2026-06-30 17:11 KST`

Fresh operator API security audit after the same docs-only refresh:

- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-operator-api-security-contract.ps1 -Json`
- `schema=musu.operator_api_security_contract.v1`
- `ok=true`
- `fail_count=0`
- `generated_at=2026-06-28 21:59 KST`

Interpretation: the source contract is internally consistent. The preview
store-forward queue is still correctly labeled non-release-grade. The distinct
release `/api/v1/relay/payload` route is now proof-bound rather than
preflight-only: it accepts `musu.relay_payload_release_request.v1` metadata
with nested `musu.relay_transport_proof.v1` and
`musu.relay_payload_delivery_proof.v1`, records transport proof, and still
rejects raw payload bytes.

Fresh P2P environment status:

- Command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`
- `schema=musu.p2p_control_plane_env_status.v1`
- `ok=false`
- `checked_at=2026-06-30 17:11 KST`
- `relay_payload_queue_fallback_implemented=true`
- `release_relay_connect_endpoint_implemented=true`
- `release_relay_payload_endpoint_implemented=true`
- `release_payload_endpoint_proof_bound=true`
- `release_payload_preflight_endpoint_implemented=true`
- `release_payload_preflight_only=false`
- `release_tunnel_payload_endpoint_missing=false`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `preview_store_forward_payload_queue_non_release_grade=true`
- `relay_transport_kind=quic_relay_tunnel`
- `release_grade_transport_required=quic_tls_1_3`

Without a stale live evidence file attached, the direct env-status blockers are
`source_release_relay_tunnel_runtime_not_implemented`,
`missing_kv_rest_api_url_or_upstash_redis_rest_url`,
`missing_kv_rest_api_token_or_upstash_redis_rest_token`, and
`missing_p2p_control_plane_evidence`. The go/no-go gate still expands the
canonical stale live-evidence blocker set because the latest committed live
P2P evidence remains the 2026-06-28 file below.

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
  relay tunnel runtime, release route evidence, relay transport proof, and relay
  payload delivery proof are still missing.

Active P2P blockers:

- `source_release_relay_tunnel_runtime_not_implemented`
- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_unknown`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

Do not flip `RELAY_TUNNEL_RUNTIME_IMPLEMENTED` until a real release tunnel
moves payload bytes through `quic_relay_tunnel`, emits MUSU-bound
`quic_tls_1_3` transport proof, and records release-grade route evidence.
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true` is now justified only by the
proof-bound endpoint contract; it does not mean relay transport is release-ready.

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
| NO-GO | Full product spec is not complete. | Latest clean gate at `2026-06-30T18:26:41.7712848+09:00` on commit `235dc8cfe6630b96030035e6e51127fa0a77b1c6` has `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, `blockers=15`, `warnings=0`, and `manifest_git.dirty=false`. | A release-ready claim would overstate the evidence. | Close the remaining physical/external product blockers, refresh package-bound evidence after the Rust source change, and finish the real relay runtime/proof lane. |
| NO-GO | Public metadata cannot be verified over canonical HTTPS and DNS authority does not match Vercel's intended nameservers. | `verify-store-public-metadata.ps1` fails all three canonical routes with `request_failed,dns_nameserver_mismatch,apex_tls_handshake_failed,vercel_edge_apex_tls_failed`; the DNS repair planner records Cloudflare NS plus Cloudflare apex A/AAAA records, apex TLS failure, `www_tls.ok=true`, and `vercel_edge_apex_tls_ok=false`. | Privacy/support/public-config and Store metadata proof remain blocked. | Repair apex DNS/TLS using the non-mutating planner output, then rerun verifier and go/no-go. |
| NO-GO | Relay is not a delegated-work transport yet. | P2P env status now has `release_relay_payload_endpoint_implemented=true` and `release_payload_endpoint_proof_bound=true`, and relay leases now expose explicit `transport_intent=release_tunnel` that stays fail-closed; however `release_relay_tunnel_runtime_implemented=false`, KV/Upstash storage is missing, and live relay route/transport/delivery proof is missing. | Relay cannot be marketed as task routing fallback. | Implement release tunnel runtime, provision hosted storage, then record direct-blocked two-PC relay proof. |
| HIGH | Doctor/background and P2P audit evidence previously disagreed with the relay poller runtime default. | Runtime relay payload polling is default-on opt-out, but doctor used a truthy env check and the P2P audit message still said default-off. Source now reuses `relay_payload_poller_enabled()`, the audit wording is aligned, and targeted tests pass. | Without this fix, runtime-loop/CPU evidence could under-report an active low-duty loop and mislead release audits. | Keep the helper shared; refresh package-bound evidence after this runtime source change. |
| HIGH | Design approval is now URL-evidence-gated, but still missing. | `design-gate` requires a standalone `Design: Approved` line plus a GitHub `#issuecomment-...` approval URL; issue #35 currently has evidence-refresh comments, not approval. | PR #34 remains blocked and cannot be merged honestly. | Add explicit CEO/design approval on issue #35, then update the PR body with that approval comment URL. |
| HIGH | Private Mesh physical-peer evidence had stale-config coupling. | `mesh.node_name` missing and persisted tailnet IP stale, while live Tailscale state was usable. Source now falls back to live `Self.HostName` and `tailscale ip -4`; debug CLI evidence generation passes. | This removes a local proof generator failure, but not the packaged release proof blocker. | Rebuild/install the package with this fix on both PCs, collect target evidence from `hugh-main`, then run the archive verifier. |
| HIGH | P2P source is proof-bound but still fail-closed for release transport. | Store-forward relay contract audit reports `ok=true`, `fail_count=0`; `/api/v1/relay/payload` accepts release proof metadata only and still rejects raw payload bytes. | The current code protects against false release relay claims while removing the source payload endpoint gap. | Preserve proof-bound behavior while building the real runtime. |
| MED | Production P2P env sync is now REST-upsert guarded, but still lacks live values/proof. | `deploy-musu-bee.yml` uses Vercel REST `upsert=true` and sensitive env types; `audit-secret-storage-contract.ps1` verifies no `vercel env add` path or raw response-body logging. | This reduces deployment-path risk for KV/Upstash/control-token env, but does not close the hosted P2P gate. | Configure real env values, deploy production, run P2P env status and live control-plane evidence. |
| INFO | Public desktop artifact URL cache key is now artifact-bound instead of package-version-only. | GitHub release metadata reports `musu-desktop-x64.msix` size `40710731`; canary evidence `20260628-1455-desktop-release-canary-after-cachebuster.json` reports `ok=true` and `hosted_msix_length.ok=true`. | The one-line installer/download path no longer depends on stale CDN state after same-version `desktop-latest` clobber uploads. | Deploy the site so `musu.pro` serves the updated URLs; apex DNS/TLS still needs separate repair. |
| INFO | HUGH_SECOND package-bound freshness was restored earlier, then reset by the Rust relay lease DTO source change. | The latest 18:26 clean gate on `235dc8cf` has `single_machine_verified=false`, `process_ownership_verified=false`, `startup_single_instance_verified=false`, `desktop_single_instance_verified=false`, `runtime_idle_cpu_verified=false`, and `runtime_cpu_scenario_matrix_verified=false`. | The release gate correctly refuses to reuse stale package-bound evidence after runtime source changed. | Rebuild/package and refresh smoke/process/startup/desktop/CPU/matrix evidence on the current HEAD. |
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
