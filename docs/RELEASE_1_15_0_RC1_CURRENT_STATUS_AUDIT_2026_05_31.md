# MUSU 1.15.0-rc.1 Current Status Audit

**Wiki ID**: wiki/522
**Date**: 2026-05-31
**Scope**: current release state after the route-evidence gate hardening, refreshed single-machine evidence, final operator packet verification, operator action pack verification, Store submission bundle verification, release handoff status check, second-PC MSIX install evidence import, Windows/Tailscale mDNS health hardening, runtime idle CPU attribution hardening, and process ownership audit gate.

## Verdict

MUSU is **not ready for public desktop release yet**.

It is ready as a **single-machine Windows beta** and as a **release-candidate handoff package**, but the latest runtime reassessment adds internal product-quality blockers. The release is no longer blocked only by external evidence.

Current internal blockers:

1. idle CPU busy-loop risk reported by the operator on both primary and second PC
2. missing two-machine runtime idle CPU evidence gate
3. incomplete `musu.pro` assisted relay/control-plane path for P2P setup and fallback routing
4. remaining second-PC startup/duplicate runtime proof and smoke timeout hardening

Current external evidence blockers:

1. real second-PC multi-device route evidence
2. real `musu@musu.pro` inbox delivery evidence
3. Partner Center/Microsoft Store approval evidence, including restricted startup capability review

2026-05-31 update: the second-PC MSIX install evidence has now been returned and recorded locally under `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json`. Route proof is still missing because `192.168.1.192:8949` and `172.27.208.1:8949` were not reachable from the primary during the follow-up smoke attempt. Runtime CPU work has moved from a broad process-name sampler to an owned-process-tree sampler; one primary debug-runtime sample passed, but formal two-machine desktop/WebView2 evidence is still missing. A separate process ownership audit now passes on `HUGH_SECOND`: one MUSU runtime, zero MUSU-owned Node helpers, zero MUSU-owned WebView2 helpers, 13 machine-wide WebView2 processes not owned by MUSU, bridge registry PID alive, and bridge `/health` HTTP 200.

Current qualitative completion:

| Surface | Completion | Reason |
|---|---:|---|
| Single-machine Windows local beta | ~84% | Functional smoke is evidence-backed and process ownership now passes locally; packaged desktop/WebView2 idle CPU evidence is still missing. |
| Store/operator-gate infrastructure | ~90% | Final packet, action pack, Store submission bundle, public metadata, support mailbox config, evidence verifiers, runtime CPU gate, and process ownership gate are in place. |
| Public desktop release readiness | ~54% | MSIX install evidence and local process ownership improved, but idle CPU, multi-device route, support mailbox, Store approval, and relay/control-plane readiness remain open. |
| Full desktop GUI product maturity | ~50% | Tauri shell is a usable launcher/status surface, not yet the full dashboard GUI, and runtime resource polish is not product-grade. |

This document supersedes wiki/521 for the **current 2026-05-31 release status**. Wiki/521 remains the historical final qualitative audit and accumulated work log.

## Current Evidence Snapshot

| Item | Current value |
|---|---|
| Latest release code commit | `a630ce4f8bddffe649c883a838f0ef10cc6c3fd9` before this process-ownership gate update |
| Latest smoke source commit | `3b1b1b0e751a12c63728829a8afe2774b489444e` |
| Working tree | clean after the post-smoke evidence/docs commit |
| Latest single-machine evidence | `docs\evidence\single-machine\1.15.0-rc.1\20260531-195832-HUGH_SECOND.evidence.json` |
| Single-machine output | `MUSU_RELEASE_SMOKE_OK`; CLI route `MUSU_CLI_ROUTE_OK` |
| Dashboard task | `d568c5f1-d15d-4cbf-8172-c4a308deaf95` |
| Bridge URL | `http://127.0.0.1:9818` |
| Desktop readiness audit | `runtime_package_ready=true`, `desktop_shell_ready=true`, `single_machine_verified=true`, `multi_device_verified=false` |
| Final operator packet | `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip` |
| Final operator packet verification | `ok=true`, `fail_count=0`, `kit_count=1` |
| Operator action pack | `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` |
| Operator action pack verification | `ok=true`, `fail_count=0` |
| Store submission bundle | `.local-build\msix\submission-bundles\store-reviewed-20260530-093140` |
| Store submission bundle verification | `ok=true`, `fail_count=0` |
| Public metadata | `https://musu.pro/privacy` and `/support` pass with `musu@musu.pro` |
| Second-PC MSIX install evidence | `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json` |
| Runtime idle CPU evidence | formal gate still missing; diagnostic primary debug-runtime sample passed at `.local-build\runtime-idle-cpu\musu-idle-cpu-20260531-194854.json`, but public readiness still requires two machines with the packaged desktop/WebView2 shell open |
| Process ownership evidence | local audit passed at `.local-build\process-ownership\musu-process-ownership-20260531-201339.json`; `musu_runtime=1`, `owned_node=0`, `owned_webview2=0`, `machine_wide_node=1`, `machine_wide_webview2=13`, `orphan_repo_helpers=0`, bridge registry PID alive, `/health` HTTP 200 |
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
9. **LAN mDNS discovery**: mDNS LAN auto-discovery is now opt-in via `MUSU_ENABLE_MDNS=1` for the Store-candidate path. Cloud/manual peer registration and the second-PC handoff route remain the canonical release-test path.
10. **Clipboard sync**: universal clipboard polling is opt-in via `MUSU_ENABLE_CLIPBOARD_SYNC=1`. It must not run by default in the Store-candidate idle path.
11. **Runtime CPU budget**: public beta requires explicit idle CPU evidence on primary and second PC. The current target is <= 5% of one logical CPU for a 60s idle sample.
12. **musu.pro network role**: the product needs a hosted registry/rendezvous/relay-control path. Direct LAN/manual peers remain valid, but cannot be the only public multi-device setup story.
13. **Process ownership policy**: machine-wide Node.js/WebView2 processes are not automatically MUSU-owned. Release evidence must distinguish MUSU descendants and repo-related helpers from unrelated processes, and bridge registry PID plus `/health` must match the live MUSU runtime.

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
2. **No remaining internal release-blocking issue found in the scoped release pipeline.** The current public-release failure is missing external evidence, not a broken local packaging/handoff pipeline.
3. **Final packet verification is current and useful.** It checks required docs/scripts, including this wiki/522 current-status audit, README commands, checksum integrity, clean source metadata, second-PC kit contents, Store/support/multi-device evidence hardening, return importer safety, and preview fallback.
4. **Operator action pack is evidence-safe.** It verifies the final packet first, bundles second-PC/Partner Center/support actions, checks nested zips and checksums, and excludes private signing keys.
5. **Store submission bundle verification passes.** The bundle includes exactly one Store-reviewed MSIX, public cert, checksums, certification notes, restricted capability justification, and no private `.pfx/.p12`.
6. **Support mailbox drift is controlled.** Scripts read root `SUPPORT_EMAIL` via `release-config.ps1`; public Next pages use `musu-bee/src/lib/contact.ts`; current packet/action pack use `musu@musu.pro`.
7. **Second-PC return path now fails closed.** `import-second-pc-return.ps1` validates returned handoff/release-check schemas, verifies MSIX install evidence, optionally records the MSIX install gate, and prints primary-side commands.
8. **Known residual issue is product-scope, not release-infra.** The desktop GUI remains a launcher/status shell; this is acceptable for beta/Store-candidate positioning only if the listing copy does not promise a full dashboard GUI.
9. **New internal P0 found.** Operator-observed idle CPU busy-loop behavior is now a release blocker until `measure-musu-idle-cpu.ps1` evidence passes on both machines.
10. **One default background loop was hardened.** Clipboard sync no longer starts by default; it now requires `MUSU_ENABLE_CLIPBOARD_SYNC=1`.
11. **Relay/control-plane path is underspecified for public multi-device.** Existing cloud registration lists sibling nodes, but there is no explicit relay session, path negotiation, or fallback tunnel evidence yet. See `docs/RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md` (wiki/523).
12. **Runtime CPU sampler false attribution was fixed.** `measure-musu-idle-cpu.ps1 -IncludeWebView2` no longer treats every stale WebView2 process on the machine as MUSU CPU. It now defaults to MUSU-owned descendants or repo-related helpers, records helper scope and process ownership metadata, and uses native Windows parent-process lookup instead of WMI/CIM because WMI timed out on the operator machine.
13. **Frontend polling moved another step toward an idle budget.** Dashboard, node panel, and agents surface polling no longer use hot fixed intervals; they use non-overlapping recursive timeouts with 30s visible / 120s hidden cadence.
14. **Process ownership audit is now a release gate.** `scripts\windows\audit-musu-process-ownership.ps1` writes `musu.process_ownership_audit.v1` evidence and `write-release-go-no-go.ps1` reports `process_ownership_verified`. The current local audit proves the extra WebView2 processes visible on the operator machine are not MUSU-owned, while the live bridge registry points to one healthy MUSU process.

## Next Steps

P0: keep No-Go until internal runtime quality and external evidence gates both pass.

1. Run idle CPU evidence on primary and second PC:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -MaxOneCorePercent 5 -IncludeNode -IncludeWebView2 -FailOnHot -Json
   ```
   MUSU must be open and idle during the sample. The gate fails if no MUSU
   runtime process is running, if Node.js/WebView2 budget flags are omitted,
   or if the default owned-helper scope cannot prove process ownership. The
   sample should include the packaged desktop shell so owned WebView2 CPU is
   represented.
2. Run process ownership audit whenever the operator sees many Node.js/WebView2 processes:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-process-ownership.ps1 -FailOnProblem -Json
   ```
   Treat machine-wide helper counts as diagnostic only; release ownership is based on MUSU descendants, repo-related orphan helpers, and live bridge registry health.
3. Fix any process that exceeds the idle CPU budget.
4. Record passing runtime CPU evidence; go/no-go now blocks until it passes.
5. Harden `musu up` and smoke scripts so duplicate/stale runtime state cannot hang the operator.
6. Design and implement the first `musu.pro` assisted peer path: registry/rendezvous first, relay/tunnel fallback next.
7. Copy `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` to the operator handoff location when runtime P0 is stable.
8. On second Windows PC, extract `second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260531-010837.zip`.
9. On second Windows PC, extract `musu-multidevice-1.15.0-rc.1-20260531-002518.zip` and run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
   ```
10. If certificate trust fails, rerun elevated with `-MachineTrust`.
11. Copy returned `.local-build\second-pc-return\*.zip` back to the primary release repo.
12. On primary repo, run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> -RecordMsixInstall -Json
   ```
13. Run the generated `smoke-multidevice-beta.ps1` command against the returned `host:port`, then record the generated multi-device evidence.
14. Send the support mailbox verification email to `musu@musu.pro` with the current subject/id, verify inbox delivery, then record support mailbox evidence.
15. In Partner Center, reserve/confirm product name, submit the Store-reviewed MSIX, wait for certification and restricted capability approval, then record Store release evidence.
16. Run `complete-final-operator-gates.ps1 ... -FailOnNotReady -Json`; only ship publicly if it reports `ready_for_public_desktop_release=true` and runtime CPU evidence passes.

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
- `go_no_go.multi_device_verified=true`
- `go_no_go.public_metadata_ok=true`
- `go_no_go.support_mailbox_verified=true`
- `go_no_go.store_release_verified=true`
- runtime idle CPU evidence passes on primary and second PC
- process ownership evidence passes and repeated startup does not spawn duplicate bridge/runtime processes
- `packet.verified=true`
- `action_pack.verified=true`
- `manifest_git.dirty=false`

Current decision: **No-Go, internally and externally blocked**.
