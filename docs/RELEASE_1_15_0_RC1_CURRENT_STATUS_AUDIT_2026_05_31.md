# MUSU 1.15.0-rc.1 Current Status Audit

**Wiki ID**: wiki/522
**Date**: 2026-05-31
**Scope**: current release state after route-evidence gate hardening, refreshed single-machine evidence, final operator packet verification, operator action pack verification, Store submission bundle verification, release handoff status check, second-PC MSIX install evidence import, Windows/Tailscale mDNS health hardening, runtime idle CPU attribution hardening, process ownership audit gate, startup single-instance gate, MSIX desktop-entrypoint audit, relay lease control-plane wiring, and current primary desktop-open CPU evidence.

## Verdict

MUSU is **not ready for public desktop release yet**.

It is ready as a **single-machine Windows beta**. The previous release-candidate handoff package is now stale until regenerated with the MSIX desktop-entrypoint gate, and the latest runtime reassessment adds internal product-quality blockers. The release is no longer blocked only by external evidence.

Current internal blockers:

1. idle CPU busy-loop risk reported by the operator on both primary and second PC
2. missing two-machine runtime idle CPU evidence gate
3. clean two-machine packaged desktop/WebView2 idle CPU evidence is still missing; local-sideload desktop entrypoint now passes, but final evidence must be rerun from clean committed state
4. incomplete `musu.pro` assisted relay/control-plane path for P2P setup and fallback routing
5. remaining packaged desktop/startup collision proof and smoke timeout hardening; local repeated `musu up` proof now passes

Current external evidence blockers:

1. real second-PC multi-device route evidence
2. real `musu@musu.pro` inbox delivery evidence
3. Partner Center/Microsoft Store approval evidence, including restricted startup capability review

2026-05-31 update: the second-PC MSIX install evidence has now been returned and recorded locally under `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json`. Route proof is still missing because `192.168.1.192:8949` and `172.27.208.1:8949` were not reachable from the primary during the follow-up smoke attempt. Runtime CPU work has moved from a broad process-name sampler to an owned-process-tree sampler; one primary debug-runtime sample passed, and a clean committed packaged desktop-open diagnostic now passes after `musu-desktop`/WebView2 ownership attribution was fixed. Formal two-machine desktop/WebView2 evidence is still missing because only `HUGH_SECOND` has this clean sample. The MSIX desktop-entrypoint root cause is now fixed for Store artifact and local install proof: the regenerated Store-reviewed artifact launches `musu-desktop.exe`, contains `musu.exe` and `musu-startup.exe`, and passes Store submission bundle verification; the fixed `local-sideload-manual` package is installed on `HUGH_SECOND` and passes installed desktop-entrypoint audit. Store-reviewed restricted-capability packages are now refused by default for ordinary sideload testing, and a Store-reviewed `-RequireInstalledPackage` audit correctly fails on a local-sideload install because the restricted startup contract differs. A separate process ownership audit now passes on `HUGH_SECOND`: one MUSU runtime, one desktop shell, zero MUSU-owned Node helpers, six MUSU-owned WebView2 helpers, 19 machine-wide WebView2 processes not owned by MUSU, bridge registry PID alive, and bridge `/health` HTTP 200. Startup single-instance evidence now also passes locally: three consecutive `musu up --json` calls reused bridge PID 31208 and did not spawn another runtime. A source-fresh release MSIX build attempt on this machine failed in `musu-rs` rustc OOM/pagefile pressure even with `CARGO_BUILD_JOBS=1`, and a later debug `cargo build --bin musu` also hit rustc/LLVM OOM; `cargo check -j 1` passes.

2026-06-01 addendum: relay fallback now has a fail-closed owner-scoped lease API, primary packaged desktop-open CPU evidence was refreshed and passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-082822-HUGH_SECOND.desktop-open.evidence.json`, and current single-machine smoke was refreshed at `docs\evidence\single-machine\1.15.0-rc.1\20260601-084028-HUGH_SECOND.evidence.json`. The operator-supplied Tailscale IPv6 mDNS log (`ff02::fb%9:5353`, `os error 10065`, then `closed channel`) remains classified as a real idle/log-spam risk for stale or explicitly mDNS/IPv6/Tailscale-enabled builds; current source keeps mDNS, IPv6 mDNS, and Tailscale mDNS off by default. Public release remains No-Go because second-PC desktop-open CPU evidence, real second-PC multi-device route evidence, `musu@musu.pro` inbox delivery evidence, and Store/Partner Center evidence are still missing.

Current qualitative completion:

| Surface | Completion | Reason |
|---|---:|---|
| Single-machine Windows local beta | ~88% | Functional smoke, process ownership, repeated startup reuse, and primary packaged desktop/WebView2 idle CPU evidence are backed locally; second-PC desktop-open CPU and real route evidence are still missing. |
| Store/operator-gate infrastructure | ~96% | Final packet, action pack, public metadata, support mailbox config, evidence verifiers, runtime CPU gate, process ownership gate, startup single-instance gate, and MSIX desktop-entrypoint gate are in place. The regenerated Store submission bundle passes artifact-level desktop entrypoint verification, and local-sideload installed desktop proof passes. |
| Public desktop release readiness | ~64% | MSIX desktop entrypoint and primary CPU proof are fixed, but clean two-machine desktop/WebView2 idle CPU, multi-device route, support mailbox, Store approval, and relay/tunnel transport remain open. |
| Full desktop GUI product maturity | ~50% | Tauri shell is a usable launcher/status surface, not yet the full dashboard GUI, and runtime resource polish is not product-grade. |

This document supersedes wiki/521 for the **current 2026-05-31 release status**. Wiki/521 remains the historical final qualitative audit and accumulated work log.

## Current Evidence Snapshot

| Item | Current value |
|---|---|
| Latest pushed release code commit before this hardening pass | `a1ee33fa0c8e3b68e85dc4b48077134ec5dd99ac` with refreshed primary desktop-open CPU evidence |
| Latest smoke source commit | `a1ee33fa0c8e3b68e85dc4b48077134ec5dd99ac` |
| Working tree | dirty during this audit/update pass; public release remains blocked until committed and the release manifest is regenerated clean |
| Latest single-machine evidence | `docs\evidence\single-machine\1.15.0-rc.1\20260601-084028-HUGH_SECOND.evidence.json` |
| Single-machine output | `MUSU_RELEASE_SMOKE_OK_20260601_084005`; CLI route `MUSU_CLI_ROUTE_OK_20260601_084005` |
| Dashboard task | `5ac5baa6-471f-4633-9a57-9e3a87a20c7a` |
| Bridge URL | `http://127.0.0.1:13167` |
| Desktop readiness audit | `runtime_package_ready=true`, `desktop_shell_ready=true`, `single_machine_verified=true`, `multi_device_verified=false` |
| Final operator packet | `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip` |
| Final operator packet verification | must be regenerated after the MSIX desktop-entrypoint gate lands; old packets are stale |
| Operator action pack | `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` |
| Operator action pack verification | old pack is stale; new pack generation is blocked until Store submission bundle verification passes |
| Store submission bundle | `.local-build\msix\submission-bundles\store-reviewed-20260531-224352` |
| Store submission bundle verification | `ok=true`, `fail_count=0`; artifact MSIX desktop entrypoint launches `musu-desktop.exe` |
| Public metadata | `https://musu.pro/privacy` and `/support` pass with `musu@musu.pro` |
| Second-PC MSIX install evidence | `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json` |
| Runtime idle CPU evidence | primary clean desktop-open evidence passed at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-082822-HUGH_SECOND.desktop-open.evidence.json` with `git_dirty=false`, one `musu-desktop`, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.16`, and working set `339.85MB`; public readiness still requires the same clean evidence on the second PC |
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
6. **Multi-device proof**: public multi-device claim requires real `host:port` route evidence from a second Windows PC, not a same-machine simulation. Route evidence must include `musu.route_evidence.v1`, route kind, handshake timing, peer identity verification, hardened encryption, and payload transit truth.
7. **Store proof**: Store readiness requires explicit Partner Center product-name reservation timestamp, submission id, Microsoft certification status, and restricted capability approval status.
8. **musu-system integration**: `musu-system` remains future adjacent MCP/CLI/adapter work. It is not part of first Store package scope.
9. **LAN mDNS discovery**: mDNS LAN auto-discovery is now opt-in via `MUSU_ENABLE_MDNS=1` for the Store-candidate path. IPv6 mDNS separately requires `MUSU_MDNS_ENABLE_IPV6=1`, and Tailscale mDNS interfaces separately require `MUSU_MDNS_ENABLE_TAILSCALE=1`, because Windows/Tailscale IPv6 multicast can spam `os error 10065`. Cloud/manual peer registration and the second-PC handoff route remain the canonical release-test path.
10. **Clipboard sync**: universal clipboard polling is opt-in via `MUSU_ENABLE_CLIPBOARD_SYNC=1`. It must not run by default in the Store-candidate idle path.
11. **Runtime CPU/resource budget**: public beta requires explicit idle CPU/resource evidence on primary and second PC. The current target is <= 5% of one logical CPU for a 60s `desktop-open` idle sample, at least one MUSU-owned WebView2 process attributed, owned process count <= 16, owned WebView2 process count <= 8, and total owned working set <= 1024MB.
12. **musu.pro network role**: the product needs a hosted registry/rendezvous/relay-control path. Direct LAN/manual peers remain valid, but cannot be the only public multi-device setup story.
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
7. Extend startup single-instance coverage from repeated `musu up` to packaged desktop Start Runtime clicks and Store StartupTask/manual-launch collision.
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
- Add `musu doctor --json` reporting for background features and relay path state.

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
