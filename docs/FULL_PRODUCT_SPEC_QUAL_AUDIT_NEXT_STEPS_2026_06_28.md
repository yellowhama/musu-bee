# MUSU Full Product Spec Qual Audit And Next Steps (2026-06-28)

## Answer

MUSU is not complete against the full product spec yet.

Latest clean local gate:

- Source: `.local-build/go-no-go/latest.json`
- Generated: `2026-06-28T17:32:55.4349035+09:00`
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

New HUGH_SECOND evidence after the design-gate approval URL hardening:

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-170703-HUGH_SECOND.evidence.json`
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-170721-HUGH_SECOND.process-ownership.json`
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-170721-HUGH_SECOND.startup-single-instance.json`
- Desktop repeated activation:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-171002-HUGH_SECOND.desktop-single-instance.json`
- Runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-171057-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-171827-HUGH_SECOND.desktop-open.evidence.json`

The runtime matrix route probe targeted `hugh-main` at `192.168.1.192:4387` and
returned `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_171057`. The idle CPU sample ran
for 60.033s with six owned WebView2 helpers, zero owned Node helpers, and no hot
processes.

## Findings

| Severity | Finding | Evidence | Next |
|---|---|---|---|
| NO-GO | Product spec completion is still false. | `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, `blockers=10`. | Do not claim product completion until the gate has zero blockers. |
| NO-GO | Second-PC release evidence is incomplete. | `multi-device`, `runtime-idle-cpu`, and `runtime-cpu-scenario-matrix` still require two-machine proof. | Run/import the latest second-PC kit on `hugh-main`. |
| NO-GO | Public metadata is blocked at DNS/TLS, not app source. | `store-public-metadata` reports Cloudflare nameservers, apex TLS failure, and Vercel edge apex TLS failure. | Apply the DNS repair plan, then rerun the verifier. |
| NO-GO | Relay is still not a delegated-work transport. | `p2p-control-plane` and `relay-transport` remain blockers; the release payload endpoint is proof-bound, but release tunnel runtime, KV/Upstash storage, and live relay route/transport/delivery proof are missing. | Build real relay tunnel runtime and record release-grade proof before changing product claims. |
| NO-GO | Store release is not proven. | Partner Center, Microsoft certification, restricted capability approval, Store-signed install, and Store launch evidence are missing. | Complete Partner Center/Microsoft Store path and record verifier-passing Store evidence. |
| HIGH | Design approval is correctly fail-closed. | The design gate now requires a real GitHub issue approval comment URL. | Add explicit approval on issue #35 and put that URL in PR #34. |
| HIGH | V34 source/tooling is stronger than its proof. | Recorder/verifier and second-PC kit exist, but `v34-stale-self-heal` still lacks physical stale-state proof. | Run the physical stale registry/cache/manual-peer scenario and verify the proof. |
| INFO | V34 selected-candidate validation is stricter. | `verify-v34-self-heal-proof.ps1`, `record-v34-self-heal-proof.ps1`, and `capture-v34-source-snapshot.ps1` now reject port-zero, negative-port, URL-loopback, wildcard, and IPv4-mapped loopback/wildcard endpoints. | Keep the physical proof lane blocked until real two-node stale-state evidence exists. |
| INFO | Local current-package evidence is healthy. | Single-machine, process ownership, startup, desktop activation, and route-attempt lanes are green again. | Keep these fresh after runtime-affecting changes. |

## Code Audit

No new runtime code was changed in the latest evidence-refresh batch. The
current code posture from this audit is:

- Design gate hardening is intentional and tested; it prevents false approval.
- The relay/P2P release lane is fail-closed. The release payload endpoint is
  proof-bound and metadata-only; missing release runtime/storage/live proof
  remains a blocker, not a silent pass.
- CPU/process/startup/desktop packaged evidence passes on `HUGH_SECOND`.
- No additional release-blocking code regression was found in the surfaces
  inspected during this refresh.

The remaining blockers are not safely fixable by documentation changes. They
require second-PC execution, external DNS/TLS mutation, Store/Partner Center
approval, real relay implementation, design approval, or V34 physical proof.

## Next Steps

1. Run the latest second-PC kit on `hugh-main` and import the return zip.
2. Repair apex `musu.pro` DNS/TLS using the non-mutating DNS repair plan, then
   rerun `verify-store-public-metadata.ps1`.
3. Obtain explicit design approval on issue #35 and update PR #34 with the
   approval issue-comment URL.
4. Complete Partner Center/Microsoft Store submission and record Store-signed
   install/launch evidence.
5. Implement real release relay transport, then record delegated-work relay
   proof with direct path blocked.
6. Run the V34 stale self-heal physical proof flow on two machines.
7. Rerun `write-release-go-no-go.ps1 -Json`; only claim completion when it has
   zero blockers.
