# MUSU Full Product Spec Qual Audit And Next Steps (2026-06-28)

## Answer

MUSU is not complete against the full product spec yet.

Latest clean local gate:

- Source: `.local-build/go-no-go/latest.json`
- Generated: `2026-06-28T19:42:43.4293297+09:00`
- Commit: `31ade35758c5a6ff2df5aca598a2950c7e400cfb`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=0`

The post-design-gate current-package evidence refresh restored the local
freshness lanes. A later P2P source update made the release payload endpoint
proof-bound (`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`,
`release_payload_endpoint_proof_bound=true`), but did not implement the release
tunnel runtime. A later V34 verifier hardening rejected port-zero,
negative-port, and URL-shaped loopback selected candidates in stale self-heal
proof. The remaining blockers are physical, external, or not-yet-implemented
release gates.

## Current Evidence

Public fleet proof hardening:

- `https://musu.pro/fleet-proof.ps1` source now has opt-in
  `-RequireReleaseGradeRoute`.
- Default mode remains install/package/direct fleet-health proof.
- Strict mode executes `musu route --adapter echo --wait` to
  `-ExpectedDirectPeerName` and requires `musu.route_evidence.v1` with verified
  peer identity, non-empty peer method/key, `encryption=quic_tls_1_3`, and
  `transport_verified_by=musu_quic_tls_transport`.
- Current rc.22 HTTP bearer routes are expected to fail strict mode. This is a
  proof-surface hardening, not closure of the multi-device blocker.
- Verification: `npm run test:public-release` passed 16 tests,
  `npm run typecheck` passed, the generated PowerShell body parsed with
  `parse_error_count=0`, and `test-release-evidence-verifiers.ps1 -Json`
  returned `ok=true`, `case_count=214`, `failed_case_count=0` at
  `2026-06-28T19:54:46.3577462+09:00`.

New HUGH_SECOND evidence after the V34 endpoint validation hardening:

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-184155-HUGH_SECOND.evidence.json`
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-184214-HUGH_SECOND.process-ownership.json`
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-184214-HUGH_SECOND.startup-single-instance.json`
- Desktop repeated activation:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-185307-HUGH_SECOND.desktop-single-instance.json`
- Runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-184627-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-184508-HUGH_SECOND.desktop-open.evidence.json`

The runtime matrix route probe targeted `hugh-main` at `192.168.1.192:4387` and
returned `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_184627`. The idle CPU sample ran
for 60.022s with six owned WebView2 helpers, zero owned Node helpers, and no hot
processes.

Public metadata planner hardening evidence:

- `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-1914-musu-pro-dns-repair-plan-vercel-inspect-fail-closed.json`
- SHA256:
  `2FFCFE120EE83BD862220FC9A41ECDD2328FFA47F6F0D6F80BB6AB881781A934`
- `vercel_inspect.reason=token_missing`
- `vercel_inspect.ok=false`
- `vercel_inspect.has_informative_output=false`
- Regression:
  `test-release-evidence-verifiers.ps1 -Json` returned `ok=true`,
  `case_count=214`, `failed_case_count=0`.

Live multi-device route audit:

- `docs/MULTIDEVICE_RELEASE_GRADE_ROUTE_AUDIT_2026_06_28.md`
- HUGH_SECOND -> `hugh-main` diagnostic smoke completed a direct LAN delegated
  task with `MUSU_REMOTE_ROUTE_OK`.
- Diagnostic evidence SHA256:
  `A98A398336592FC13164812F787C3080FF17E7D2DB7810C340422128137FB9A2`.
- `verify-multidevice-evidence.ps1` rejected the evidence with `ok=false` and
  `fail_count=6`.
- Rejection cause: no verified peer identity, missing peer method/key, legacy
  `none_http_bearer`, no `quic_tls_1_3`, and no
  `musu_quic_tls_transport`.
- HTTPS health failed on both current installed bridge ports; HTTP health
  returned 200 on both.

## Findings

| Severity | Finding | Evidence | Next |
|---|---|---|---|
| NO-GO | Product spec completion is still false. | `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, `blockers=10`. | Do not claim product completion until the gate has zero blockers. |
| NO-GO | Release-grade multi-device route proof is incomplete, and the public proof wrapper now exposes that distinction. | Fresh HUGH_SECOND -> `hugh-main` route smoke completed, but the strict verifier failed with `fail_count=6` because current installed bridges use HTTP bearer with no verified peer identity and no `quic_tls_1_3` proof. `fleet-proof.ps1 -RequireReleaseGradeRoute` now requires the same release-grade route evidence fields instead of letting a green fleet-health proof imply transport readiness. | Implement/start the hardened release transport on both packaged machines, rerun the route smoke or strict public proof, and commit verifier-passing evidence. |
| NO-GO | Second-PC release evidence is incomplete. | `multi-device`, `runtime-idle-cpu`, and `runtime-cpu-scenario-matrix` still require two-machine proof. | Run/import the latest second-PC kit on `hugh-main` after the hardened transport path is available. |
| NO-GO | Public metadata is blocked at DNS/TLS, not app source. | `store-public-metadata` reports Cloudflare nameservers, apex TLS failure, and Vercel edge apex TLS failure. | Apply the DNS repair plan, then rerun the verifier. |
| NO-GO | Relay is still not a delegated-work transport. | `p2p-control-plane` and `relay-transport` remain blockers; the release payload endpoint is proof-bound, but release tunnel runtime, KV/Upstash storage, and live relay route/transport/delivery proof are missing. | Build real relay tunnel runtime and record release-grade proof before changing product claims. |
| NO-GO | Store release is not proven. | Partner Center, Microsoft certification, restricted capability approval, Store-signed install, and Store launch evidence are missing. | Complete Partner Center/Microsoft Store path and record verifier-passing Store evidence. |
| HIGH | Design approval is correctly fail-closed. | The design gate now requires a real GitHub issue approval comment URL. | Add explicit approval on issue #35 and put that URL in PR #34. |
| HIGH | V34 source/tooling is stronger than its proof. | Recorder/verifier and second-PC kit exist, but `v34-stale-self-heal` still lacks physical stale-state proof. | Run the physical stale registry/cache/manual-peer scenario and verify the proof. |
| INFO | V34 selected-candidate validation is stricter. | `verify-v34-self-heal-proof.ps1`, `record-v34-self-heal-proof.ps1`, and `capture-v34-source-snapshot.ps1` now reject port-zero, negative-port, URL-loopback, wildcard, and IPv4-mapped loopback/wildcard endpoints. | Keep the physical proof lane blocked until real two-node stale-state evidence exists. |
| INFO | Public metadata planner inspect output is now fail-closed. | `-RunVercelInspect` without `VERCEL_TOKEN` records `token_missing`; uninformative CLI output records `inspect_output_uninformative`; regression passed 214 cases. | Use a real Vercel token for `domains inspect`, then fix DNS/TLS externally. |
| INFO | Local current-package evidence is healthy. | Single-machine, process ownership, startup, desktop activation, and route-attempt lanes are green again. | Keep these fresh after runtime-affecting changes. |

## Code Audit

No new runtime code was changed in the latest evidence-refresh batch. The
current code posture from this audit is:

- Design gate hardening is intentional and tested; it prevents false approval.
- The relay/P2P release lane is fail-closed. The release payload endpoint is
  proof-bound and metadata-only; missing release runtime/storage/live proof
  remains a blocker, not a silent pass.
- The public metadata DNS repair planner is fail-closed around Vercel inspect:
  missing token, failed command, or uninformative output cannot look like a
  trustworthy inspect result.
- CPU/process/startup/desktop packaged evidence passes on `HUGH_SECOND`.
- Multi-device evidence verification is correctly fail-closed: direct HTTP LAN
  routing can complete work, but it cannot satisfy the release-grade
  `quic_tls_1_3` transport proof lane.
- Public `fleet-proof.ps1` is now also fail-closed for release-grade route
  claims when `-RequireReleaseGradeRoute` is supplied. The default `ok=true`
  result remains scoped to fleet-health proof.
- The hardening was verified by public-release tests, TypeScript typecheck, a
  PowerShell parser pass over the generated script, and the 214-case release
  evidence verifier regression suite.
- No additional release-blocking code regression was found in the surfaces
  inspected during this refresh.

The remaining blockers are not safely fixable by documentation changes. They
require second-PC execution, external DNS/TLS mutation, Store/Partner Center
approval, real relay implementation, design approval, or V34 physical proof.

## Next Steps

1. Implement/start release-grade multi-device transport on both packaged PCs and
   rerun the strict multi-device route verifier until `fail_count=0`.
2. Run the latest second-PC kit on `hugh-main` and import the return zip.
3. Repair apex `musu.pro` DNS/TLS using the non-mutating DNS repair plan, then
   rerun `verify-store-public-metadata.ps1`.
4. Obtain explicit design approval on issue #35 and update PR #34 with the
   approval issue-comment URL.
5. Complete Partner Center/Microsoft Store submission and record Store-signed
   install/launch evidence.
6. Implement real release relay transport, then record delegated-work relay
   proof with direct path blocked.
7. Run the V34 stale self-heal physical proof flow on two machines.
8. Rerun `write-release-go-no-go.ps1 -Json`; only claim completion when it has
   zero blockers.
