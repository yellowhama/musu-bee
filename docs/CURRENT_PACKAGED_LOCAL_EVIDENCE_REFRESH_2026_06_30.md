# Current Packaged Local Evidence Refresh (2026-06-30)

## Verdict

MUSU remains **NO-GO** for the full product spec and public desktop release.
The current `HUGH_SECOND` package-bound local lanes are green again after the
remote file dynamic-share reload and the latest `musu-brain` sidecar pin
refresh, but the product is not complete.

2026-07-01 update: this report is superseded for the brain package lane by
`docs/CURRENT_PACKAGED_BRAIN_MSIX_AUDIT_2026_07_01.md`. The newer audit records
the MSIX `windows.fullTrustProcess` requirement for `musu-brain.exe` and fresh
`20260701` package/brain/CPU evidence. The NO-GO conclusion for the full product
still stands.

Current evidence refresh anchor:

- package version: `1.15.0.22`
- release version: `1.15.0-rc.22`
- installed package:
  `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`
- artifact:
  `.local-build/msix/output/musu_1.15.0.22_x64_local-sideload-manual.msix`
- second-PC kit:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260630-232004.zip`
- second-PC kit SHA256:
  `cbb42b29af996828105bb345547ac99c5be88d8ed09c5d9ccacd69d07f5c650e`
- kit source commit:
  `e280648f2a9c2632e869d679bf1a4d4e221f7005`

## What Changed

The packaged sidecar pin was refreshed to the current clean
`F:\musu_2nd_brain` repository state:

- module path: `github.com/yellowhama/musu-brain`
- brain commit: `c477c004691a7fe5d555e4403d91bab71a3c303f`
- brain commit time: `2026-06-30T22:39:03+09:00`
- pin file: `musu-bee/src-tauri/musu-brain.pin.json`

The full local-sideload MSIX rebuild, install, and package-local verification
completed. The build produced warnings only:

- Rust release relay tunnel placeholder items in
  `musu-rs/src/bridge/rendezvous.rs` are intentionally unused until real
  release tunnel runtime exists.
- Tauri desktop reports one `unused_mut` warning in
  `musu-bee/src-tauri/src/lib.rs`.

The latest `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md` is now the
canonical brain-side integration handoff. It describes brain as the stage-3
knowledge layer and "chip" in the motherboard+chip model, keeps the Go binary
self-contained, and keeps MCP registration as the first integration path via
`print-config`.

Important spec conflict recorded from that handoff, now superseded by the
2026-07-01 source contract:

- Earlier musu-bee integration thesis and current package proof use
  `~/.musu/brain`.
- The new brain handoff describes brain defaults under `~/.musubrain`.
- `docs/BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md` resolves the MUSU
  product contract to `~/.musu/brain` and `musu-bee/src-tauri/src/lib.rs`
  now injects `MUSU_KNOWLEDGE_ROOT` and `MUSUBRAIN_ROOT` with that same value.
- The release rule remains unchanged: the brain data root must be outside MSIX
  LocalState and user notes must never be pushed.
- Because this is a source change after the package-bound evidence below, the
  installed package must be rebuilt and re-proven before the new root-env
  contract counts as package evidence.

## Evidence Recorded

Current package/install/local smoke evidence:

- `docs/evidence/msix-install/1.15.0-rc.22/20260630-225859-HUGH_SECOND.evidence.json`
- `docs/evidence/msix-install/1.15.0-rc.22/20260630-225859-HUGH_SECOND.verification.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260630-230117-HUGH_SECOND.evidence.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260630-230117-HUGH_SECOND.verification.json`
- `docs/evidence/process-ownership/1.15.0-rc.22/20260630-230403-HUGH_SECOND.process-ownership.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260630-230424-HUGH_SECOND.startup-single-instance.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260630-230424-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260630-230448-HUGH_SECOND.desktop-single-instance.json`

Current CPU evidence:

- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260630-230512-HUGH_SECOND.desktop-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-230631-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-230631-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-230631-HUGH_SECOND.target-route.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-230631-HUGH_SECOND.post-route.route-evidence.json`

Notable CPU and route facts:

- desktop-open idle CPU: `ok=true`, `git_dirty=false`, `60s`, hot process
  count `0`, owned WebView2 required and present.
- full matrix: `ok=true`, `git_dirty=false`, all five scenarios present:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`.
- targeted route proof targets `hugh-main`, not self/local.
- route result is success over LAN candidate `192.168.1.192:4387`.
- route evidence still says `peer_identity_verified=false`,
  `encryption=none_http_bearer`, and
  `payload_transited_musu_infra=false`.

## Qualitative Audit

| Severity | Finding | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product spec is still incomplete. | Go/no-go remains blocked by physical/external/release transport lanes. | Do not claim product completion or public release readiness. | Work the remaining physical and external gates. |
| NO-GO | Runtime CPU evidence is one-machine complete only. | HUGH_SECOND has refreshed idle and matrix evidence; `hugh-main` has not returned current CPU evidence. | The local package is healthy, but the release needs both physical PCs. | Run the new `20260630-232004` kit on `hugh-main` and import the return zip. |
| NO-GO | Direct LAN route works but is not release-grade transport proof. | Route evidence: `lan`, `192.168.1.192:4387`, `peer_identity_verified=false`, `none_http_bearer`. | Good targetability evidence; insufficient for encrypted/identity-verified release claims. | Implement/prove QUIC/TLS or the accepted release-grade transport path. |
| NO-GO | Public metadata remains externally blocked. | The latest DNS/TLS planner still records Cloudflare nameservers and apex TLS failure. | Store/public metadata cannot be called ready. | Repair DNS/TLS, then rerun public metadata verifier. |
| NO-GO | Relay transport is still not a release runtime. | Relay route still lacks real tunnel runtime, transport proof, and delivery proof. | Relay must not be described as delegated-work transport. | Build/prove release relay tunnel runtime. |
| HIGH | Brain root resolver conflict is source-resolved but package evidence is stale. | `BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`; Tauri now exports `MUSU_KNOWLEDGE_ROOT` and `MUSUBRAIN_ROOT` as `~/.musu/brain`. | Split-store risk is closed in source, but the installed package predates the change. | Rebuild/reinstall and rerun brain product proof before release-complete claims. |
| HIGH | Private Mesh packaged proof is still not recorded. | No current packaged release-proof archive from both PCs. | Private Mesh product claim remains unproven. | Use the new kit return as input to packaged Private Mesh archive proof. |
| HIGH | Remote file proof still requires a target share and a passing physical rerun. | Dynamic share reload is packaged locally, but no passing `musu put/ls/get` proof exists yet. | File CLI sibling workflow remains open. | Configure writable proof share on `hugh-main`, rerun proof from `hugh_second`. |
| MED | Build warnings are known but should stay visible. | Rust placeholder warnings and one Tauri `unused_mut`. | Not a current blocker, but warning noise can hide future regressions. | Clean after relay runtime lane stabilizes. |

## Code Audit

Focused code audit scope for this refresh:

- The functional source delta before this package refresh is the remote file
  API dynamic share reload in `musu-rs/src/bridge/handlers/files.rs`.
- The package/config delta is `musu-bee/src-tauri/musu-brain.pin.json`, now
  pointing at clean brain commit `c477c004691a7fe5d555e4403d91bab71a3c303f`.
- No secret/token value was added. The pin records public module and VCS
  metadata only.
- The local package verifies the hidden brain sidecar contract and the fleet
  audit proof includes `brain_ingest_token_acl_restricted`.
- The route lane remains intentionally conservative: current evidence proves
  direct targetability, not release-grade identity or encryption.
- The main new spec risk from the brain handoff was a documentation/spec
  divergence between `~/.musu/brain` and `~/.musubrain`; that is now resolved
  at source/spec level by `BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`,
  but still needs rebuilt package evidence.

## Remaining Blockers

The blocker map is still:

- `multi-device`
- `private-mesh-packaged-release-proof`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `store-public-metadata`
- `store-release`
- `p2p-control-plane`
- `design-approval`
- `relay-transport`
- `v34-stale-self-heal`

## Product Spec Updates

- Current package includes the latest clean Go brain chip pin at
  `c477c004691a7fe5d555e4403d91bab71a3c303f`.
- Current HUGH_SECOND packaged runtime is healthy under MSIX local sideload:
  package install, smoke, process ownership, startup single-instance, desktop
  single-instance, idle CPU, and runtime scenario matrix all pass.
- Current `hugh-main` route is work-targetable over LAN, but the transport is
  still legacy HTTP bearer and not release-grade.
- Current second-PC handoff artifact is the `20260630-232004` kit generated
  from clean commit `e280648f2a9c2632e869d679bf1a4d4e221f7005`.
- Brain integration treats the brain repo handoff as canonical context, with
  the MUSU product overlay fixed to `~/.musu/brain`. The next package proof
  must show that this overlay is present in the installed app before cockpit UX
  or automatic collection is called release-grade.

## Next Steps

1. Run the `20260630-232004` second-PC kit on `hugh-main`; return and import
   the generated `.local-build/second-pc-return/*.zip`.
2. Configure `hugh-main` writable proof share and rerun physical
   `musu put`, `musu ls`, and `musu get` from `hugh_second`.
3. Rebuild/reinstall after the 2026-07-01 brain root-env source change and
   rerun `record-brain-product-proof.ps1`.
4. Repair `https://musu.pro` apex DNS/TLS/public metadata verification.
5. Complete Private Mesh packaged proof archive, Store evidence, design
   approval evidence, V34 stale self-heal physical proof, live P2P
   control-plane evidence, and release-grade relay transport proof.
