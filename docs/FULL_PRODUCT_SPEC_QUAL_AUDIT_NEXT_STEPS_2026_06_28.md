# MUSU Full Product Spec Qual Audit And Next Steps (2026-06-28)

## Answer

MUSU is not complete against the full product spec yet.

Latest clean local gate:

- Source: `.local-build/go-no-go/latest.json`
- Generated: `2026-06-28T23:21:19.6978900+09:00`
- Commit: `58df8e0b6d8f8afcc7cdf5fd3baec83a39b3b2c8`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=11`
- `warnings=0`

The wrap-up package refresh restored the local install/smoke/process/startup and
desktop single-instance lanes on `HUGH_SECOND`. The product is still not
complete: the latest runtime idle CPU attempt did not include the stricter
release flags required by go/no-go, and the runtime CPU scenario matrix plus
second-PC route-attempt evidence were left for the next session. The remaining
blockers are physical, external, or not-yet-implemented release gates.

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

New HUGH_SECOND evidence after the fleet-proof route gate hardening:

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-231344-HUGH_SECOND.evidence.json`
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-231440-HUGH_SECOND.process-ownership.json`
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-231459-HUGH_SECOND.startup-single-instance.json`
- Desktop repeated activation:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-231520-HUGH_SECOND.desktop-single-instance.json`
- Runtime idle CPU attempt:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-231633-HUGH_SECOND.desktop-open.evidence.json`

The runtime idle CPU attempt ran for 60.023s with no hot process and
`git_dirty=false`, but go/no-go rejected it for the release lane because it did
not set `-RequireOwnedWebView2`, `-IncludeNode`, and `-IncludeWebView2`.

Public metadata planner hardening evidence:

- `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260628-204816-musu-pro-dns-repair-plan-vercel-inspect-fixed.json`
- SHA256:
  `B8709AC9CA39173806D9F7577B05227553E974934E4E363CED24611C0ACEE1C3`
- `vercel_inspect.ran=true`
- `vercel_inspect.ok=true`
- `vercel_inspect.has_informative_output=true`
- Vercel project binding: `musu-pro`
- Current nameservers remain Cloudflare:
  `blakely.ns.cloudflare.com`, `weston.ns.cloudflare.com`
- Regression:
  `test-release-evidence-verifiers.ps1 -Json` returned `ok=true`,
  `case_count=214`, `failed_case_count=0`.

2026-06-30 refresh:

- `docs/evidence/public-metadata-dns-repair/1.15.0-rc.22/20260630-205941-musu-pro-dns-repair-plan-current.json`
- SHA256:
  `950F121BE1CA24CDA877F4E0C432547549A10F61BA2C8E499DBFBBD4E50FBD52`
- `vercel_inspect.ok=true`
- Vercel domain/project binding: `musu.pro` -> `musu-pro`
- Current nameservers remain Cloudflare:
  `blakely.ns.cloudflare.com`, `weston.ns.cloudflare.com`
- `ready_for_public_metadata_verifier=false`
- `apex_tls.ok=false`, `www_tls.ok=true`,
  `vercel_edge_apex_tls_ok=false`

Latest second-PC kit:

- `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260628-204644.zip`
- SHA256:
  `6718085a3765f6159e1f9571974e477f343a5825c536d99267d86335b22d0396`
- Source commit:
  `8e82fae46eb25b59171627627cab5dcfba7e847f`
- `dirty=false`

This kit refresh does not close any release gate by itself. `hugh-main` still
must run it and return verifier-passing evidence.

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
| NO-GO | Product spec completion is still false. | `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, `blockers=11` after the 23:21 KST wrap-up gate. | Do not claim product completion until the gate has zero blockers. |
| NO-GO | Release-grade multi-device route proof is incomplete, and the public proof wrapper now exposes that distinction. | Fresh HUGH_SECOND -> `hugh-main` route smoke completed, but the strict verifier failed with `fail_count=6` because current installed bridges use HTTP bearer with no verified peer identity and no `quic_tls_1_3` proof. `fleet-proof.ps1 -RequireReleaseGradeRoute` now requires the same release-grade route evidence fields instead of letting a green fleet-health proof imply transport readiness. | Implement/start the hardened release transport on both packaged machines, rerun the route smoke or strict public proof, and commit verifier-passing evidence. |
| NO-GO | Second-PC release evidence is incomplete. | `multi-device`, `runtime-idle-cpu`, and `runtime-cpu-scenario-matrix` still require two-machine proof. | Run/import the latest second-PC kit on `hugh-main` after the hardened transport path is available. |
| NO-GO | Public metadata is blocked at DNS/TLS, not app source. | `store-public-metadata` reports Cloudflare nameservers, apex TLS failure, and Vercel edge apex TLS failure. | Apply the DNS repair plan, then rerun the verifier. |
| NO-GO | Relay is still not a delegated-work transport. | `p2p-control-plane` and `relay-transport` remain blockers; the release payload endpoint is proof-bound, but release tunnel runtime, KV/Upstash storage, and live relay route/transport/delivery proof are missing. | Build real relay tunnel runtime and record release-grade proof before changing product claims. |
| NO-GO | Store release is not proven. | Partner Center, Microsoft certification, restricted capability approval, Store-signed install, and Store launch evidence are missing. | Complete Partner Center/Microsoft Store path and record verifier-passing Store evidence. |
| HIGH | Design approval is correctly fail-closed. | The design gate now requires a real GitHub issue approval comment URL. | Add explicit approval on issue #35 and put that URL in PR #34. |
| HIGH | V34 source/tooling is stronger than its proof. | Recorder/verifier and second-PC kit exist, but `v34-stale-self-heal` still lacks physical stale-state proof. | Run the physical stale registry/cache/manual-peer scenario and verify the proof. |
| INFO | V34 selected-candidate validation is stricter. | `verify-v34-self-heal-proof.ps1`, `record-v34-self-heal-proof.ps1`, and `capture-v34-source-snapshot.ps1` now reject port-zero, negative-port, URL-loopback, wildcard, and IPv4-mapped loopback/wildcard endpoints. | Keep the physical proof lane blocked until real two-node stale-state evidence exists. |
| INFO | Public metadata planner inspect output now captures real Vercel diagnostics when a token is present. | `$args` was replaced with `$vercelArgs` earlier, and the current script also tolerates normal Vercel CLI stderr/banner output without converting a successful inspect into a failed planner run. Fresh evidence `20260630-205941` records `vercel_inspect.ok=true` for `musu.pro`. | Fix DNS/TLS externally; diagnostics alone do not close public metadata. |
| INFO | Local package identity freshness is restored for HUGH_SECOND, but CPU release evidence still needs another pass. | MSIX install, single-machine, process ownership, startup single-instance, and desktop single-instance are current. The latest idle sample was not counted by go/no-go because required helper flags were missing; the CPU matrix was not rerun. | Re-run idle CPU and scenario matrix with the release-required flags before trying to reduce blocker count again. |

## Code Audit

No new runtime code was changed in the latest evidence-refresh batch. The
current code posture from this audit is:

- Design gate hardening is intentional and tested; it prevents false approval.
- The relay/P2P release lane is fail-closed. The release payload endpoint is
  proof-bound and metadata-only; missing release runtime/storage/live proof
  remains a blocker, not a silent pass.
- The public metadata DNS repair planner is fail-closed around Vercel inspect:
  missing token, failed command, or uninformative output cannot look like a
  trustworthy inspect result. It now also preserves a successful inspect when
  the Vercel CLI writes normal banner text to stderr.
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
