# MUSU 1.15.0-rc.1 Current Status Audit

**Wiki ID**: wiki/522
**Date**: 2026-05-31
**Scope**: current release state after the second-PC return importer, preview fallback, refreshed single-machine evidence, final operator packet verification, operator action pack verification, Store submission bundle verification, release handoff status check, and Windows/Tailscale mDNS health hardening.

## Verdict

MUSU is **not ready for public desktop release yet**.

It is ready as a **single-machine Windows beta** and as a **release-candidate handoff package**, but the latest runtime reassessment adds internal product-quality blockers. The release is no longer blocked only by external evidence.

Current internal blockers:

1. idle CPU busy-loop risk reported by the operator on both primary and second PC
2. missing runtime idle CPU evidence gate
3. incomplete `musu.pro` assisted relay/control-plane path for P2P setup and fallback routing
4. process ownership/startup hardening gaps around `musu up`, duplicate runtime prevention, and smoke timeouts

Current external evidence blockers:

1. real second-PC multi-device route evidence
2. real `musu@musu.pro` inbox delivery evidence
3. Partner Center/Microsoft Store approval evidence, including restricted startup capability review

2026-05-31 update: the second-PC MSIX install evidence has now been returned and recorded locally under `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json`; final go/no-go still needs to be rerun after this commit and after the new runtime-quality work.

Current qualitative completion:

| Surface | Completion | Reason |
|---|---:|---|
| Single-machine Windows local beta | ~82% | Functional smoke is evidence-backed, but idle CPU and duplicate-runtime behavior are not yet measured as gates. |
| Store/operator-gate infrastructure | ~88% | Final packet, action pack, Store submission bundle, public metadata, support mailbox config, and evidence verifiers are in place; runtime-quality gates need to be added. |
| Public desktop release readiness | ~52% | MSIX install evidence improved, but idle CPU, multi-device route, support mailbox, Store approval, and relay/control-plane readiness remain open. |
| Full desktop GUI product maturity | ~50% | Tauri shell is a usable launcher/status surface, not yet the full dashboard GUI, and runtime resource polish is not product-grade. |

This document supersedes wiki/521 for the **current 2026-05-31 release status**. Wiki/521 remains the historical final qualitative audit and accumulated work log.

## Current Evidence Snapshot

| Item | Current value |
|---|---|
| Latest smoke source commit | `dbd90e31c58d56f58d7d93dddeae9a74a4c16234` |
| Working tree | clean after the post-smoke evidence/docs commit |
| Latest single-machine evidence | `docs\evidence\single-machine\1.15.0-rc.1\20260531-154114-HUGH_SECOND.evidence.json` |
| Single-machine output | `MUSU_RELEASE_SMOKE_OK_20260531_1540`; CLI route `MUSU_CLI_ROUTE_OK_20260531_1540` |
| Dashboard task | `9e00f24e-1bbc-4cbf-b6aa-7057fdfeb63c` |
| Bridge URL | `http://127.0.0.1:1407` |
| Desktop readiness audit | `runtime_package_ready=true`, `desktop_shell_ready=true`, `single_machine_verified=true`, `multi_device_verified=false` |
| Final operator packet | `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip` |
| Final operator packet verification | `ok=true`, `fail_count=0`, `kit_count=1` |
| Operator action pack | `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` |
| Operator action pack verification | `ok=true`, `fail_count=0` |
| Store submission bundle | `.local-build\msix\submission-bundles\store-reviewed-20260530-093140` |
| Store submission bundle verification | `ok=true`, `fail_count=0` |
| Public metadata | `https://musu.pro/privacy` and `/support` pass with `musu@musu.pro` |
| Second-PC MSIX install evidence | `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json` |
| Runtime idle CPU evidence | missing; `write-release-go-no-go.ps1` now blocks until `scripts\windows\measure-musu-idle-cpu.ps1` evidence passes on two machines with MUSU open and Node.js/WebView2 included |
| Current support verification id | `musu-store-support-1.15.0-rc.1-20260531-002518` |
| Current second-PC kit | `kits\musu-multidevice-1.15.0-rc.1-20260531-002518.zip` |
| Final release status | `ready_for_public_desktop_release=false` |

## Product Spec Locks

1. **Release channel**: first public Windows channel remains MSIX/Store-first. Direct download and Tauri MSI/NSIS artifacts are fallback/operator diagnostics, not the first public promise.
2. **Desktop app promise**: current Tauri desktop app is a launcher/status shell for MUSU runtime and dashboard handoff. It must not be marketed as a full native dashboard yet.
3. **Support mailbox**: `musu@musu.pro` is the only release support mailbox. `support@musu.pro` is historical correction context only.
4. **Evidence policy**: release readiness is evidence-backed. Assumption flags, inferred Store approval, weak mailbox proof, dirty git, and stale packets must not produce a Go decision.
5. **Second-PC path**: second-PC operator should run `run-second-pc-release-check.ps1`, return `.local-build\second-pc-return\*.zip`, then primary repo should run `import-second-pc-return.ps1 -RecordMsixInstall`.
6. **Multi-device proof**: public multi-device claim requires real `host:port` route evidence from a second Windows PC, not a same-machine simulation.
7. **Store proof**: Store readiness requires explicit Partner Center product-name reservation timestamp, submission id, Microsoft certification status, and restricted capability approval status.
8. **musu-system integration**: `musu-system` remains future adjacent MCP/CLI/adapter work. It is not part of first Store package scope.
9. **LAN mDNS discovery**: mDNS LAN auto-discovery is now opt-in via `MUSU_ENABLE_MDNS=1` for the Store-candidate path. Cloud/manual peer registration and the second-PC handoff route remain the canonical release-test path.
10. **Clipboard sync**: universal clipboard polling is opt-in via `MUSU_ENABLE_CLIPBOARD_SYNC=1`. It must not run by default in the Store-candidate idle path.
11. **Runtime CPU budget**: public beta requires explicit idle CPU evidence on primary and second PC. The current target is <= 5% of one logical CPU for a 60s idle sample.
12. **musu.pro network role**: the product needs a hosted registry/rendezvous/relay-control path. Direct LAN/manual peers remain valid, but cannot be the only public multi-device setup story.

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

## Next Steps

P0: keep No-Go until internal runtime quality and external evidence gates both pass.

1. Run idle CPU evidence on primary and second PC:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -MaxOneCorePercent 5 -IncludeNode -IncludeWebView2 -FailOnHot -Json
   ```
   MUSU must be open and idle during the sample. The gate now fails if no
   MUSU runtime process is running, and the operator command includes Node.js
   plus WebView2 so the dashboard/runtime helper processes and Tauri desktop
   shell are inside the idle CPU budget.
2. Fix any process that exceeds the idle CPU budget.
3. Record passing runtime CPU evidence; go/no-go now blocks until it passes.
4. Harden `musu up` and smoke scripts so duplicate/stale runtime state cannot hang the operator.
5. Design and implement the first `musu.pro` assisted peer path: registry/rendezvous first, relay/tunnel fallback next.
6. Copy `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` to the operator handoff location when runtime P0 is stable.
7. On second Windows PC, extract `second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260531-010837.zip`.
8. On second Windows PC, extract `musu-multidevice-1.15.0-rc.1-20260531-002518.zip` and run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
   ```
9. If certificate trust fails, rerun elevated with `-MachineTrust`.
10. Copy returned `.local-build\second-pc-return\*.zip` back to the primary release repo.
11. On primary repo, run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> -RecordMsixInstall -Json
   ```
12. Run the generated `smoke-multidevice-beta.ps1` command against the returned `host:port`, then record the generated multi-device evidence.
13. Send the support mailbox verification email to `musu@musu.pro` with the current subject/id, verify inbox delivery, then record support mailbox evidence.
14. In Partner Center, reserve/confirm product name, submit the Store-reviewed MSIX, wait for certification and restricted capability approval, then record Store release evidence.
15. Run `complete-final-operator-gates.ps1 ... -FailOnNotReady -Json`; only ship publicly if it reports `ready_for_public_desktop_release=true` and runtime CPU evidence passes.

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
- repeated startup does not spawn duplicate bridge/runtime processes
- `packet.verified=true`
- `action_pack.verified=true`
- `manifest_git.dirty=false`

Current decision: **No-Go, internally and externally blocked**.
