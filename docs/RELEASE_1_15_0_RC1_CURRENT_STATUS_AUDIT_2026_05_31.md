# MUSU 1.15.0-rc.1 Current Status Audit

**Wiki ID**: wiki/522
**Date**: 2026-05-31
**Scope**: current release state after route-evidence gate hardening, refreshed single-machine evidence, final operator packet verification, operator action pack verification, Store submission bundle verification, release handoff status check, second-PC MSIX install evidence import, Windows/Tailscale mDNS health hardening, runtime idle CPU attribution hardening, process ownership audit gate, startup single-instance gate, MSIX desktop-entrypoint audit, relay lease control-plane wiring, runtime relay fallback lease request wiring, persisted relay fallback route evidence, and current primary desktop-open CPU evidence.

## Verdict

MUSU is **not ready for public desktop release yet**.

It is ready as a **single-machine Windows beta**. The previous release-candidate handoff package is now stale until regenerated with the MSIX desktop-entrypoint gate, and the latest runtime reassessment adds internal product-quality blockers. The release is no longer blocked only by external evidence.

Current internal blockers:

1. idle CPU busy-loop risk reported by the operator on both primary and second PC
2. missing two-machine runtime idle CPU evidence gate
3. clean two-machine packaged desktop/WebView2 idle CPU evidence is still missing; local-sideload desktop entrypoint now passes, but final evidence must be rerun from clean committed state
4. incomplete `musu.pro` assisted relay/control-plane path for P2P setup and fallback routing; rendezvous, route evidence, and runtime relay lease requests are wired, but QUIC/TLS proof and relay payload transport remain open
5. remaining packaged desktop/startup collision proof and smoke timeout hardening; local repeated `musu up` proof now passes

Current external evidence blockers:

1. real second-PC multi-device route evidence
2. real `musu@musu.pro` inbox delivery evidence
3. Partner Center/Microsoft Store approval evidence, including restricted startup capability review

2026-05-31 update: the second-PC MSIX install evidence has now been returned and recorded locally under `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json`. Route proof is still missing because `192.168.1.192:8949` and `172.27.208.1:8949` were not reachable from the primary during the follow-up smoke attempt. Runtime CPU work has moved from a broad process-name sampler to an owned-process-tree sampler; one primary debug-runtime sample passed, and a clean committed packaged desktop-open diagnostic now passes after `musu-desktop`/WebView2 ownership attribution was fixed. Formal two-machine desktop/WebView2 evidence is still missing because only `HUGH_SECOND` has this clean sample. The MSIX desktop-entrypoint root cause is now fixed for Store artifact and local install proof: the regenerated Store-reviewed artifact launches `musu-desktop.exe`, contains `musu.exe` and `musu-startup.exe`, and passes Store submission bundle verification; the fixed `local-sideload-manual` package is installed on `HUGH_SECOND` and passes installed desktop-entrypoint audit. Store-reviewed restricted-capability packages are now refused by default for ordinary sideload testing, and a Store-reviewed `-RequireInstalledPackage` audit correctly fails on a local-sideload install because the restricted startup contract differs. A separate process ownership audit now passes on `HUGH_SECOND`: one MUSU runtime, one desktop shell, zero MUSU-owned Node helpers, six MUSU-owned WebView2 helpers, 19 machine-wide WebView2 processes not owned by MUSU, bridge registry PID alive, and bridge `/health` HTTP 200. Startup single-instance evidence now also passes locally: three consecutive `musu up --json` calls reused bridge PID 31208 and did not spawn another runtime. A source-fresh release MSIX build attempt on this machine failed in `musu-rs` rustc OOM/pagefile pressure even with `CARGO_BUILD_JOBS=1`, and a later debug `cargo build --bin musu` also hit rustc/LLVM OOM; `cargo check -j 1` passes.

2026-06-01 addendum: relay fallback now has a fail-closed owner-scoped lease API, and runtime forwarding now requests that lease after terminal direct-route failure when a rendezvous session/account token exists. This remains policy/audit wiring only: `relay_transport_wired=false` and `relay_default_data_path=false`. Primary packaged desktop-open CPU evidence was refreshed and passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-113022-HUGH_SECOND.desktop-open.evidence.json`, and current single-machine smoke was refreshed at `docs\evidence\single-machine\1.15.0-rc.1\20260601-113438-HUGH_SECOND.evidence.json` from commit `52698c4406de4747b4e1ce1834cfbad1cb0c75c1`. The operator-supplied Tailscale IPv6 mDNS log (`ff02::fb%9:5353`, `os error 10065`, then `closed channel`) remains classified as a real idle/log-spam risk for stale or explicitly mDNS/IPv6/Tailscale-enabled builds; current source keeps mDNS, IPv6 mDNS, Tailscale mDNS, and common VPN/virtual mDNS interfaces off by default unless the respective env opt-ins are set. Public release remains No-Go because second-PC desktop-open CPU evidence, real second-PC multi-device route evidence, `musu@musu.pro` inbox delivery evidence, and Store/Partner Center evidence are still missing.

2026-06-01 12:03 KST addendum: failed runtime route evidence now persists a `relay_fallback` addendum after direct-route failure and relay lease evaluation. This closes the audit gap where `musu.pro` policy was called but route evidence only showed the terminal direct failure. The addendum records `direct_path_failed`, `lease_requested`, fallback status, `lease_issued`, attempted route kinds, requested capability, policy/blockers, optional lease id, and relay failure class. This still does not make public route proof release-grade because relay payload transport and QUIC/TLS direct transport are not complete.

2026-06-01 12:18 KST addendum: current single-machine smoke and primary packaged desktop-open CPU evidence were refreshed after the relay fallback route-evidence commit. Single-machine evidence now passes at `docs\evidence\single-machine\1.15.0-rc.1\20260601-121339-HUGH_SECOND.evidence.json`. Primary CPU evidence now passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-121701-HUGH_SECOND.desktop-open.evidence.json` with 60.023s sample, two MUSU processes, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.03`, and working set `378.16MB`. Go/no-go reports `single_machine_verified=true`, runtime CPU `1/2` with `HUGH_SECOND`, and public release remains No-Go.

2026-06-01 12:46 KST addendum: after the multi-device verifier was hardened to require `quic_tls_1_3` route evidence, current single-machine smoke and primary packaged desktop-open CPU evidence were refreshed again. Single-machine evidence now passes at `docs\evidence\single-machine\1.15.0-rc.1\20260601-124055-HUGH_SECOND.evidence.json`. Primary CPU evidence now passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-124454-HUGH_SECOND.desktop-open.evidence.json` with `git_dirty=false`, 60.018s sample, two MUSU processes, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.10`, and working set `387.75MB`. Go/no-go should still remain No-Go until second-PC desktop-open CPU evidence, real QUIC/TLS multi-device route evidence, `musu@musu.pro` inbox proof, and Store/Partner Center evidence are recorded.

2026-06-01 13:43 KST addendum: after route evidence was hardened to require explicit local `RouteTransportProof`, current single-machine smoke and primary packaged desktop-open CPU evidence were refreshed again. Single-machine evidence now passes at `docs\evidence\single-machine\1.15.0-rc.1\20260601-134022-HUGH_SECOND.evidence.json`. Primary CPU evidence now passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-134219-HUGH_SECOND.desktop-open.evidence.json` with `git_dirty=false`, 60.022s sample, two MUSU processes, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.18`, and working set `372.88MB`. Go/no-go should still remain No-Go until second-PC desktop-open CPU evidence, real QUIC/TLS multi-device route evidence, `musu@musu.pro` inbox proof, and Store/Partner Center evidence are recorded.

2026-06-01 16:02 KST addendum: CPU attribution and current local evidence were refreshed again after the operator reported many Node.js processes and asked whether the public site change should be deployed to `musu.pro`. The public site scroll/logo/accent fix has already deployed through the existing Vercel `main` workflow and live `https://musu.pro` QA passed. Runtime CPU measurement was tightened so repo-related Node.js is detected through command-line metadata, and the CPU matrix runner now accepts only an actual reachable dashboard URL unless an explicit `-DashboardUrl` is supplied. Current primary 4-state matrix evidence passes at `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-154503-HUGH_SECOND.runtime-cpu-scenario-matrix.json`: `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` all sampled for 60s from clean git state, included repo Node `1`, and stayed under the 5%-of-one-logical-core budget. Current single-machine smoke passes at `docs\evidence\single-machine\1.15.0-rc.1\20260601-155630-HUGH_SECOND.evidence.json`. Current primary `desktop-open` runtime-idle CPU passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-160102-HUGH_SECOND.desktop-open.evidence.json` with MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`, `webview2=0.08`, and working set `504.02MB`. Go/no-go still reports public release No-Go: single-machine, public metadata, MSIX install, and MSIX desktop-entrypoint gates pass; runtime idle CPU is `1/2`; runtime CPU scenario matrix is `1/2`; real multi-device, support inbox, and Store approval evidence are still missing.

2026-06-01 16:36 KST addendum: `musu relay leases --json` was added as a CLI audit surface for production relay lease records. It queries `GET /api/v1/p2p/relay/lease` with optional session/source/target/limit filters, emits schema `musu.relay_leases.v1`, and includes `owner_scope_verified` so failed or unauthenticated calls cannot be mistaken for verified owner-scoped evidence. Local build validation passed, and live diagnostics against the default `https://musu.pro` found a real production blocker: `musu relay status --json` reports `logged_in=true`, relay lease control-plane and runtime fallback lease request wiring are true, but `musu relay leases --json` fails with `p2p_control_auth_not_configured`. The current `musu.pro` P2P routes still expect a static env control token rather than validating the runtime's logged-in account/device token, so relay lease production evidence is blocked until the control-plane auth model is fixed or configured. The public site deployment question is closed: GitHub Actions run `26738950440` deployed `Fix public site scroll and branding` to Vercel production, and live Playwright checks verified scroll, favicon logo, browser icon, and `#24C8DB` accent on `/`, `/landing`, `/pricing`, and `/install` across desktop and mobile.

2026-06-01 P2P auth addendum: the `musu.pro` P2P routes now have a production-safe code path for the runtime account token without storing the raw token server-side. `musu-bee/src/lib/p2pControlAuth.ts` accepts `MUSU_P2P_CONTROL_TOKEN_SHA256S` / `MUSU_P2P_CONTROL_TOKEN_SHA256` in addition to the previous raw static token variables, and `scripts\windows\show-p2p-control-token-hash.ps1` computes the env value from `~\.musu\token` without printing the raw token. Targeted P2P API tests passed for rendezvous, route evidence, relay lease, and the new hash-allowlist auth path; `npm run typecheck` passed. The blocker is now narrowed from "no runtime-token auth code path" to "deploy this `musu-bee/**` change, configure production `MUSU_P2P_CONTROL_TOKEN_SHA256S`, and re-run live `musu relay leases --json`."

2026-06-01 deployment addendum: commit `b1c4378` deployed to `musu.pro` through Vercel production workflow run `26742743319`; `Tests` run `26742743243` and E2E run `26742743299` passed. Live `musu relay leases --json` now returns `p2p_control_auth_not_configured` with `accepted_auth_modes=[]`, which proves the new hash-allowlist code is deployed and the remaining production blocker is Vercel env configuration, not missing application code.

Current qualitative completion:

| Surface | Completion | Reason |
|---|---:|---|
| Single-machine Windows local beta | ~90% | Functional smoke, process ownership, repeated startup reuse, current primary packaged desktop/WebView2 idle CPU evidence, and current primary 4-state CPU matrix evidence are backed locally; second-PC desktop-open CPU, second-PC matrix, and real route evidence are still missing. |
| Store/operator-gate infrastructure | ~96% | Final packet, action pack, public metadata, support mailbox config, evidence verifiers, runtime CPU gate, process ownership gate, startup single-instance gate, and MSIX desktop-entrypoint gate are in place. The regenerated Store submission bundle passes artifact-level desktop entrypoint verification, and local-sideload installed desktop proof passes. |
| Public desktop release readiness | ~68% | MSIX desktop entrypoint, primary CPU proof, primary 4-state CPU matrix, public site deployment, runtime relay lease request wiring, persisted relay fallback evidence, and P2P auth hash-allowlist code are stronger, but clean two-machine desktop/WebView2 idle CPU, second-PC matrix, multi-device route, support mailbox, Store approval, QUIC/TLS proof, relay/tunnel transport, and production P2P env/live verification remain open. |
| Full desktop GUI product maturity | ~50% | Tauri shell is a usable launcher/status surface, not yet the full dashboard GUI, and runtime resource polish is not product-grade. |

This document supersedes wiki/521 for the **current 2026-05-31 release status**. Wiki/521 remains the historical final qualitative audit and accumulated work log.

## Current Evidence Snapshot

| Item | Current value |
|---|---|
| Latest local release code commit before this documentation pass | `68d183e0d285b3578b75e5c243a64855e64683bd` after CPU scenario process attribution tightening |
| Latest smoke source commit | `f4c2e0fd6565a81a21d5537e146a0f098ff763bd` |
| Working tree | evidence/docs dirty during this update pass; public release remains blocked until committed and the release manifest is regenerated clean |
| Latest single-machine evidence | `docs\evidence\single-machine\1.15.0-rc.1\20260601-155630-HUGH_SECOND.evidence.json` |
| Single-machine output | `MUSU_RELEASE_SMOKE_OK_20260601_155610`; CLI route checked |
| Dashboard task | `e6757818-7dc2-432d-b9fb-19143cded009` |
| Bridge URL | `http://127.0.0.1:4747` |
| Desktop readiness audit | `runtime_package_ready=true`, `desktop_shell_ready=true`, `single_machine_verified=true`, `multi_device_verified=false` |
| Final operator packet | `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip` |
| Final operator packet verification | must be regenerated after the MSIX desktop-entrypoint gate lands; old packets are stale |
| Operator action pack | `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` |
| Operator action pack verification | old pack is stale; new pack generation is blocked until Store submission bundle verification passes |
| Store submission bundle | `.local-build\msix\submission-bundles\store-reviewed-20260531-224352` |
| Store submission bundle verification | `ok=true`, `fail_count=0`; artifact MSIX desktop entrypoint launches `musu-desktop.exe` |
| Public metadata | `https://musu.pro/privacy` and `/support` pass with `musu@musu.pro` |
| Second-PC MSIX install evidence | `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json` |
| Runtime idle CPU evidence | primary clean desktop-open evidence passed at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-160102-HUGH_SECOND.desktop-open.evidence.json` with `git_dirty=false`, two MUSU processes, six owned WebView2 helpers, repo Node `1`, max one-core CPU `musu=0`, `node=0`, `webview2=0.08`, and working set `504.02MB`; public readiness still requires the same clean evidence on the second PC |
| Runtime CPU scenario matrix evidence | primary clean 4-state matrix passed at `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-154503-HUGH_SECOND.runtime-cpu-scenario-matrix.json`; go/no-go reports `1/2` valid machines, so second-PC matrix evidence is still required |
| Public site deployment | Vercel production workflow run `26738950440` succeeded for `04929fd Fix public site scroll and branding`; live `https://musu.pro` QA passed for scroll, favicon logo, browser icon, and `#24C8DB` accent on `/`, `/landing`, `/pricing`, and `/install` |
| Relay lease production audit | `musu relay status --json` shows logged-in control-plane wiring; after `b1c4378` deployed, live `musu relay leases --json` still fails with `p2p_control_auth_not_configured` and `accepted_auth_modes=[]`, proving production `MUSU_P2P_CONTROL_TOKEN_SHA256S` is not configured yet |
| MSIX desktop entrypoint evidence | Store artifact audit passes at `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-224328-HUGH_SECOND.store-msix-desktop-artifact.evidence.json`; local-sideload installed audit passes at `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.local-sideload-installed.evidence.json`; Store-reviewed local contract-mismatch proof is `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-232229-HUGH_SECOND.store-reviewed-contract-mismatch.evidence.json` |
| Process ownership evidence | local audit passed at `.local-build\process-ownership\musu-process-ownership-20260531-232247.json`; `musu_runtime=1`, `desktop_shell=1`, `owned_node=0`, `owned_webview2=6`, `machine_wide_node=2`, `machine_wide_webview2=19`, `orphan_repo_helpers=0`, bridge registry PID alive, `/health` HTTP 200 |
| Startup single-instance evidence | local audit passed at `docs\evidence\startup-single-instance\1.15.0-rc.1\20260531-203635-HUGH_SECOND.evidence.json`; three repeated `musu up --json` calls reused bridge PID 31208, `after_musu_runtime=1`, `repeated_spawn_count=0`, nested process ownership audit passed |
| Current support verification id | `musu-store-support-1.15.0-rc.1-20260531-191548` |
| Current second-PC kit | `kits\musu-multidevice-1.15.0-rc.1-20260531-191548.zip` |
| Final release status | `ready_for_public_desktop_release=false` |

## Product Spec Locks

1. **Release channel**: first public Windows channel remains MSIX/Store-first. Direct download and Tauri MSI/NSIS artifacts are fallback/operator diagnostics, not the first public promise.
2. **Desktop app promise**: current Tauri desktop app is a launcher/status shell for MUSU runtime and dashboard handoff. It must not be marketed as a full native dashboard yet.
3. **Support mailbox**: `musu@musu.pro` is the only release support mailbox. `support@musu.pro` is historical correction context only.
4. **Evidence policy**: release readiness is evidence-backed. Assumption flags, inferred Store approval, weak mailbox proof, dirty git, and stale packets must not produce a Go decision.
5. **Second-PC path**: second-PC operator should run `run-second-pc-release-check.ps1`, return `.local-build\second-pc-return\*.zip`, then primary repo should run `import-second-pc-return.ps1 -RecordMsixInstall`.
6. **Multi-device proof**: public multi-device claim requires real `host:port` route evidence from a second Windows PC, not a same-machine simulation. Route evidence must include `musu.route_evidence.v1`, route kind, handshake timing, peer identity verification with method/key material, release-grade `quic_tls_1_3` encryption, `transport_verified_by=musu_quic_tls_transport`, and payload transit truth.
7. **Store proof**: Store readiness requires explicit Partner Center product-name reservation timestamp, submission id, Microsoft certification status, and restricted capability approval status.
8. **musu-system integration**: `musu-system` remains future adjacent MCP/CLI/adapter work. It is not part of first Store package scope.
9. **LAN mDNS discovery**: mDNS LAN auto-discovery is now opt-in via `MUSU_ENABLE_MDNS=1` for the Store-candidate path. IPv6 mDNS separately requires `MUSU_MDNS_ENABLE_IPV6=1`, Tailscale mDNS interfaces separately require `MUSU_MDNS_ENABLE_TAILSCALE=1`, and common VPN/virtual adapters require `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`, because Windows/Tailscale IPv6 multicast can spam `os error 10065` and VPN/virtual adapters are not the default LAN discovery surface. Cloud/manual peer registration and the second-PC handoff route remain the canonical release-test path.
10. **Clipboard sync**: universal clipboard polling is opt-in via `MUSU_ENABLE_CLIPBOARD_SYNC=1`. It must not run by default in the Store-candidate idle path.
11. **Runtime CPU/resource budget**: public beta requires explicit idle CPU/resource evidence on primary and second PC. The current target is <= 5% of one logical CPU for a 60s `desktop-open` idle sample, at least one MUSU-owned WebView2 process attributed, owned process count <= 16, owned WebView2 process count <= 8, and total owned working set <= 1024MB. The separate runtime CPU scenario matrix gate also requires 60s `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` samples with a successful post-route probe on two Windows machines.
12. **musu.pro network role**: the product now has hosted registry/rendezvous/route-evidence/relay-lease policy wiring, a runtime fail-closed relay lease request after direct failure, failed route evidence that records the relay fallback evaluation, a CLI audit surface for relay lease records, and a SHA-256 runtime-token allowlist path for P2P control auth. Direct LAN/manual peers remain valid, but cannot be the only public multi-device setup story. Relay payload transport remains unwired and must not become the default data path. Production P2P env must still be configured and live-verified before relay lease evidence can be trusted.
13. **Process ownership policy**: machine-wide Node.js/WebView2 processes are not automatically MUSU-owned. Release evidence must distinguish MUSU descendants and repo-related helpers from unrelated processes, and bridge registry PID plus `/health` must match the live MUSU runtime.
14. **Startup single-instance policy**: repeated `musu up`, desktop Start Runtime, and Store StartupTask/manual-launch overlap must reuse one runtime/bridge owner. The release gate now starts with repeated `musu up --json` evidence and must expand to packaged desktop click/startup-task collision tests.
15. **MSIX desktop entrypoint policy**: the public Store package must launch `musu-desktop.exe` from the Start menu, keep `musu.exe` as the CLI alias, and keep `musu-startup.exe` as the startup task. Local install evidence uses the `local-sideload-manual` contract; Store submission evidence uses the `store-reviewed-immediate-registration` artifact and Partner Center/Microsoft certification evidence.

## Code Audit

Audit scope:

- final operator packet generator/verifier
- operator action pack generator/verifier
- second-PC return importer and preview card
- release go/no-go and handoff status scripts
- Store submission bundle verifier
- support mailbox and Store evidence recorder/verifier flow
- current release docs and LLM wiki pointers
- runtime background-loop and idle CPU hardening surface
- `musu.pro` registry/relay-control path

Findings:

1. **Issue found and mitigated during audit.** A logged-in Windows home with a failing Tailscale mDNS interface could leave bridge `/health` timing out after the first `musu up` probe. mDNS LAN discovery is now opt-in through `MUSU_ENABLE_MDNS=1`, keeping the Store-candidate single-machine path on cloud/manual peer registration until mDNS is separately hardened.
2. **Internal release blockers remain.** The current public-release failure is no longer just missing external evidence: the installed Store/MSIX desktop entrypoint is still stale, real desktop-open idle CPU evidence is missing, source-fresh release packaging hit local OOM/pagefile pressure, and multi-device route evidence still fails the hardened route contract.
3. **Final packet verification is current and useful.** It checks required docs/scripts, including this wiki/522 current-status audit, README commands, checksum integrity, clean source metadata, second-PC kit contents, Store/support/multi-device evidence hardening, return importer safety, and preview fallback.
4. **Operator action pack is evidence-safe, but remains downstream of installed evidence.** It verifies the final packet first, bundles second-PC/Partner Center/support actions, checks nested zips and checksums, excludes private signing keys, and should be regenerated only after installed desktop-entrypoint and runtime CPU evidence pass.
5. **Store submission bundle verification now passes for the regenerated artifact.** The bundle includes exactly one Store-reviewed MSIX, public cert, checksums, certification notes, restricted capability justification, no private `.pfx/.p12`, and a passing MSIX desktop-entrypoint audit for `musu-desktop.exe`.
6. **Support mailbox drift is controlled.** Scripts read root `SUPPORT_EMAIL` via `release-config.ps1`; public Next pages use `musu-bee/src/lib/contact.ts`; current packet/action pack use `musu@musu.pro`.
7. **Second-PC return path now fails closed.** `import-second-pc-return.ps1` validates returned handoff/release-check schemas, verifies MSIX install evidence, optionally records the MSIX install gate, and prints primary-side commands.
8. **Known residual issue is product-scope, not release-infra.** The desktop GUI remains a launcher/status shell; this is acceptable for beta/Store-candidate positioning only if the listing copy does not promise a full dashboard GUI.
9. **New internal P0 found.** Operator-observed idle CPU busy-loop behavior is now a release blocker until `measure-musu-idle-cpu.ps1` evidence passes on both machines.
10. **One default background loop was hardened.** Clipboard sync no longer starts by default; it now requires `MUSU_ENABLE_CLIPBOARD_SYNC=1`.
11. **Relay/control-plane path is underspecified for public multi-device.** Existing cloud registration lists sibling nodes, but there is no explicit relay session, path negotiation, or fallback tunnel evidence yet. See `docs/RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md` (wiki/523).
12. **Runtime CPU sampler false attribution was fixed.** `measure-musu-idle-cpu.ps1 -IncludeWebView2` no longer treats every stale WebView2 process on the machine as MUSU CPU. It now defaults to MUSU-owned descendants or repo-related helpers, records helper scope and process ownership metadata, and uses native Windows parent-process lookup instead of WMI/CIM because WMI timed out on the operator machine.
13. **Frontend polling moved another step toward an idle budget.** `musu-bee/src/lib/useLowDutyPolling.ts` now provides a shared low-duty polling helper with non-overlap, abort-on-unmount, hidden-tab pause, and capped failure backoff. Device discovery, service health, processes, nodes, doctor status, fleet/company/machine views, tasks/approvals/goals/projects/issues/costs panels, inbox polling, and canvas data/flow polling now use it or the same recursive timeout pattern; the main fleet/company/machine views use 30s safety-net polling plus SSE wakeups instead of 5s fixed refreshes.
14. **Process ownership audit is now a release gate.** `scripts\windows\audit-musu-process-ownership.ps1` writes `musu.process_ownership_audit.v1` evidence and `write-release-go-no-go.ps1` reports `process_ownership_verified`. The current local audit proves the extra WebView2 processes visible on the operator machine are not MUSU-owned, while the live bridge registry points to one healthy MUSU process.
15. **Startup single-instance audit is now a release gate.** `scripts\windows\audit-musu-startup-single-instance.ps1` writes `musu.startup_single_instance_audit.v1`, calls `musu up --json` repeatedly, requires one stable bridge PID, rejects repeated bridge spawning, and embeds a nested process ownership audit. The current local run passed with three calls reusing PID 31208.
16. **Runtime resource budget evidence was tightened.** `measure-musu-idle-cpu.ps1` now records scenario, git commit/dirty state, owned process count budget, owned WebView2 count budget, total/private memory, and memory totals by role. `write-release-go-no-go.ps1` requires `desktop-open` evidence with `-RequireOwnedWebView2`; a bridge-only diagnostic pass cannot satisfy public release.
17. **MSIX desktop entrypoint is fixed for Store artifact and local install proof.** `build-msix.ps1` stages `musu-desktop.exe` as the MSIX `<Application Executable>`, keeps `musu.exe` as the execution alias, keeps `musu-startup.exe` as the startup task, and writes a desktop-shell description. Artifact audit, Store bundle verification, and `local-sideload-manual -RequireInstalledPackage` audit pass. Store-reviewed `-RequireInstalledPackage` fails intentionally on local sideload machines because the restricted startup capability is not installed.
18. **Writer task admission polling was reduced.** `musu-rs/src/writer/runner.rs` no longer wakes queued tasks every 50ms while waiting for global/per-channel admission slots. It now waits on `tokio::sync::Notify`, with a 1s safety recheck for missed wakes. This reduces scheduler wakeups under backlog, but still needs a queued-task CPU sample before it can close the operator's 20% idle report.
19. **Unhealthy bridge PID recovery was added in code.** `musu up` now attempts to terminate a live registered bridge PID when `/health` is failing before spawning the replacement bridge. This targets the observed stale "PID alive but bridge dead" state. Runtime verification waits on a successful binary build; `cargo check -j 1` passes, while local rustc build attempts hit OOM/pagefile pressure.
20. **Node.js attribution blind spot was fixed.** `measure-musu-idle-cpu.ps1` now reads process command lines through CIM for matching executable names, so repo-related `node.exe` processes are counted even when `ExecutablePath` is only `C:\Program Files\nodejs\node.exe`. This directly addresses the operator's "Node.js is open many times" concern: machine-wide Node remains visible, but release evidence now distinguishes repo-related Node from unrelated system/user Node processes.
21. **Dashboard-open matrix proof is stricter.** `measure-musu-runtime-cpu-scenarios.ps1` no longer treats a non-reachable dashboard `dev_url`/`start_url` as proof that the dashboard was open. The matrix either launches an explicit `-DashboardUrl` or the `reachable_url` from `musu up --json`, and the verifier rejects no-op dashboard-open entries.

## Next Steps

P0: keep No-Go until internal runtime quality and external evidence gates both pass.

1. Produce a source-fresh fixed Store/MSIX package on a machine that can complete the release build, or reduce the MSIX release build memory profile without changing the runtime contract.
2. Install the fixed `local-sideload-manual` MSIX on the primary PC and second PC until the Store-signed package is available.
3. Rerun the local installed desktop entrypoint audit:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-msix-desktop-entrypoint.ps1 -StartupContract local-sideload-manual -ExpectedApplicationExecutable musu-desktop.exe -RequireInstalledPackage -Json
   ```
4. Run idle CPU evidence on primary and second PC only after the desktop entrypoint audit passes:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json
   ```
   MUSU must be open and idle during the sample. The gate fails if no MUSU
   runtime process is running, if Node.js/WebView2 budget flags are omitted,
   if the default owned-helper scope cannot prove process ownership, if no
   MUSU-owned WebView2 process is attributed, or if resource budget fields are
   missing/exceeded.
5. Run process ownership audit whenever the operator sees many Node.js/WebView2 processes:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-process-ownership.ps1 -FailOnProblem -Json
   ```
   Treat machine-wide helper counts as diagnostic only; release ownership is based on MUSU descendants, repo-related orphan helpers, and live bridge registry health.
6. Fix any process that exceeds the idle CPU budget.
7. Extend startup single-instance coverage from repeated `musu up` to packaged desktop Start Runtime clicks and Store StartupTask/manual-launch collision. The Tauri shell command is now timeout-bounded, but click-level packaged evidence is still required.
   The desktop shell also removes stale bridge registry files when the recorded
   Windows PID is dead, so dead `bridge.json` entries no longer hide behind a
   stale local URL.
8. Design and implement the first `musu.pro` assisted peer path: registry/rendezvous first, relay/tunnel fallback next.
9. Copy `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` to the operator handoff location when runtime P0 and MSIX desktop entrypoint are stable.
10. On second Windows PC, extract `second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260531-010837.zip`.
11. On second Windows PC, extract `musu-multidevice-1.15.0-rc.1-20260531-002518.zip` and run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
   ```
12. If certificate trust fails, rerun elevated with `-MachineTrust`.
13. Copy returned `.local-build\second-pc-return\*.zip` back to the primary release repo.
14. On primary repo, run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> -RecordMsixInstall -Json
   ```
15. Run the generated `smoke-multidevice-beta.ps1` command against the returned `host:port`, then record the generated multi-device evidence.
16. Send the support mailbox verification email to `musu@musu.pro` with the current subject/id, verify inbox delivery, then record support mailbox evidence.
17. In Partner Center, reserve/confirm product name, submit the Store-reviewed MSIX, wait for certification and restricted capability approval, then record Store release evidence.
18. Run `complete-final-operator-gates.ps1 ... -FailOnNotReady -Json`; only ship publicly if it reports `ready_for_public_desktop_release=true` and runtime CPU evidence passes.

P1: after external evidence passes.

- Regenerate final operator packet and action pack from clean post-evidence HEAD.
- Re-run `show-final-release-handoff-status.ps1 -Json`.
- Update Store listing copy to avoid claiming full native dashboard GUI.
- Keep `musu@musu.pro`, public metadata, and Store bundle verification in the pre-submit checklist.
- Keep `MUSU_ENABLE_MDNS` off in Store-candidate smoke/release runs unless the mDNS path has its own passing Windows/Tailscale regression evidence.
- Keep `MUSU_ENABLE_CLIPBOARD_SYNC` off by default unless clipboard sync has its own privacy/resource regression evidence.
- Keep `musu doctor --json` background reporting in every CPU evidence review.
  It now reports mDNS, clipboard, cloud heartbeat, file sync, and planner
  status; relay path state still needs a fuller doctor surface.

P2: after first Store submission.

- Decide whether the desktop product becomes a full static/native Tauri dashboard or remains launcher + browser dashboard.
- Add screenshot-based desktop shell smoke only when the shell is a user-facing promise.
- Start optional `musu-system` adapter work with `crawl-ai` wiki ingestion; keep `nurikun` delivery human-approved.

## Release Decision

Do **not** publicly release until these are all true:

- `go_no_go.single_machine_verified=true`
- `go_no_go.msix_install_verified=true`
- `go_no_go.msix_desktop_entrypoint_verified=true`
- `go_no_go.multi_device_verified=true`
- `go_no_go.public_metadata_ok=true`
- `go_no_go.support_mailbox_verified=true`
- `go_no_go.store_release_verified=true`
- runtime idle CPU evidence passes on primary and second PC
- process ownership and startup single-instance evidence pass; repeated startup does not spawn duplicate bridge/runtime processes
- `packet.verified=true`
- `action_pack.verified=true`
- `manifest_git.dirty=false`

Current decision: **No-Go, internally and externally blocked**.
