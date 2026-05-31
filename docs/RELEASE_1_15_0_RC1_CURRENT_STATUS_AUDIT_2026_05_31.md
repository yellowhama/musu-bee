# MUSU 1.15.0-rc.1 Current Status Audit

**Wiki ID**: wiki/522
**Date**: 2026-05-31
**Scope**: current release state after the second-PC return importer, preview fallback, refreshed single-machine evidence, final operator packet verification, operator action pack verification, Store submission bundle verification, release handoff status check, and Windows/Tailscale mDNS health hardening.

## Verdict

MUSU is **not ready for public desktop release yet**.

It is ready as a **single-machine Windows beta** and as a **release-candidate handoff package**. The remaining blockers are all external evidence gates:

1. real second-PC MSIX install evidence
2. real second-PC multi-device route evidence
3. real `musu@musu.pro` inbox delivery evidence
4. Partner Center/Microsoft Store approval evidence, including restricted startup capability review

Current qualitative completion:

| Surface | Completion | Reason |
|---|---:|---|
| Single-machine Windows local beta | ~92% | Evidence-backed smoke passed with dashboard task, bridge URL, and CLI route output. |
| Store/operator-gate infrastructure | ~90% | Final packet, action pack, Store submission bundle, public metadata, support mailbox config, and evidence verifiers are in place and fail closed. |
| Public desktop release readiness | ~68% | Local readiness is strong, but the four external evidence gates are still missing. |
| Full desktop GUI product maturity | ~55-60% | Tauri shell is a usable launcher/status surface, not yet the full dashboard GUI. |

This document supersedes wiki/521 for the **current 2026-05-31 release status**. Wiki/521 remains the historical final qualitative audit and accumulated work log.

## Current Evidence Snapshot

| Item | Current value |
|---|---|
| Git HEAD / remote main | `ccadd6e48cff587f8f28063d9951199e0263180a` |
| Working tree | clean; `main...origin/main` |
| Latest single-machine evidence | `docs\evidence\single-machine\1.15.0-rc.1\20260530-225842-HUGH_SECOND.evidence.json` |
| Single-machine output | `MUSU_RELEASE_SMOKE_OK_20260530_2258`; CLI route `MUSU_CLI_ROUTE_OK_20260530_2258` |
| Dashboard task | `69d71cea-dec0-47af-a0bb-fdde166c080e` |
| Bridge URL | `http://127.0.0.1:3718` |
| Desktop readiness audit | `runtime_package_ready=true`, `desktop_shell_ready=true`, `single_machine_verified=true`, `multi_device_verified=false` |
| Final operator packet | `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip` |
| Final operator packet verification | `ok=true`, `fail_count=0`, `kit_count=1` |
| Operator action pack | `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` |
| Operator action pack verification | `ok=true`, `fail_count=0` |
| Store submission bundle | `.local-build\msix\submission-bundles\store-reviewed-20260530-093140` |
| Store submission bundle verification | `ok=true`, `fail_count=0` |
| Public metadata | `https://musu.pro/privacy` and `/support` pass with `musu@musu.pro` |
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

## Code Audit

Audit scope:

- final operator packet generator/verifier
- operator action pack generator/verifier
- second-PC return importer and preview card
- release go/no-go and handoff status scripts
- Store submission bundle verifier
- support mailbox and Store evidence recorder/verifier flow
- current release docs and LLM wiki pointers

Findings:

1. **Issue found and mitigated during audit.** A logged-in Windows home with a failing Tailscale mDNS interface could leave bridge `/health` timing out after the first `musu up` probe. mDNS LAN discovery is now opt-in through `MUSU_ENABLE_MDNS=1`, keeping the Store-candidate single-machine path on cloud/manual peer registration until mDNS is separately hardened.
2. **No remaining internal release-blocking issue found in the scoped release pipeline.** The current public-release failure is missing external evidence, not a broken local packaging/handoff pipeline.
3. **Final packet verification is current and useful.** It checks required docs/scripts, including this wiki/522 current-status audit, README commands, checksum integrity, clean source metadata, second-PC kit contents, Store/support/multi-device evidence hardening, return importer safety, and preview fallback.
4. **Operator action pack is evidence-safe.** It verifies the final packet first, bundles second-PC/Partner Center/support actions, checks nested zips and checksums, and excludes private signing keys.
5. **Store submission bundle verification passes.** The bundle includes exactly one Store-reviewed MSIX, public cert, checksums, certification notes, restricted capability justification, and no private `.pfx/.p12`.
6. **Support mailbox drift is controlled.** Scripts read root `SUPPORT_EMAIL` via `release-config.ps1`; public Next pages use `musu-bee/src/lib/contact.ts`; current packet/action pack use `musu@musu.pro`.
7. **Second-PC return path now fails closed.** `import-second-pc-return.ps1` validates returned handoff/release-check schemas, verifies MSIX install evidence, optionally records the MSIX install gate, and prints primary-side commands.
8. **Known residual issue is product-scope, not release-infra.** The desktop GUI remains a launcher/status shell; this is acceptable for beta/Store-candidate positioning only if the listing copy does not promise a full dashboard GUI.

## Next Steps

P0: convert No-Go to Go by recording external evidence.

1. Copy `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip` to the operator handoff location.
2. On second Windows PC, extract `second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260531-010837.zip`.
3. On second Windows PC, extract `musu-multidevice-1.15.0-rc.1-20260531-002518.zip` and run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
   ```
4. If certificate trust fails, rerun elevated with `-MachineTrust`.
5. Copy returned `.local-build\second-pc-return\*.zip` back to the primary release repo.
6. On primary repo, run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> -RecordMsixInstall -Json
   ```
7. Run the generated `smoke-multidevice-beta.ps1` command against the returned `host:port`, then record the generated multi-device evidence.
8. Send the support mailbox verification email to `musu@musu.pro` with the current subject/id, verify inbox delivery, then record support mailbox evidence.
9. In Partner Center, reserve/confirm product name, submit the Store-reviewed MSIX, wait for certification and restricted capability approval, then record Store release evidence.
10. Run `complete-final-operator-gates.ps1 ... -FailOnNotReady -Json`; only ship publicly if it reports `ready_for_public_desktop_release=true`.

P1: after external evidence passes.

- Regenerate final operator packet and action pack from clean post-evidence HEAD.
- Re-run `show-final-release-handoff-status.ps1 -Json`.
- Update Store listing copy to avoid claiming full native dashboard GUI.
- Keep `musu@musu.pro`, public metadata, and Store bundle verification in the pre-submit checklist.
- Keep `MUSU_ENABLE_MDNS` off in Store-candidate smoke/release runs unless the mDNS path has its own passing Windows/Tailscale regression evidence.

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
- `packet.verified=true`
- `action_pack.verified=true`
- `manifest_git.dirty=false`

Current decision: **No-Go, externally blocked**.
