# MUSU 1.15.0-rc.1 Final Qualitative Evaluation, Code Audit, and Next Steps

**Wiki ID**: wiki/521
**Date**: 2026-05-29
**Scope**: current product state after support mailbox correction, refreshed single-machine evidence, packet-aware operator handoff card, second-PC return-card helper, final operator packet verification, and operator action pack generator/verifier.

## Verdict

MUSU is **not ready for public desktop release yet**.

It is ready as a **single-machine Windows beta** and as a **Store submission/operator-gate candidate**. The remaining blockers are outside local code execution: clean/current second-PC MSIX install evidence, real second-PC multi-device evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Microsoft Store approval evidence.

Current qualitative completion:

| Surface | Completion | Reason |
|---|---:|---|
| Single-machine Windows local beta | ~92% | `musu up`/dashboard/bridge/Claude task smoke is evidence-backed and repeatable. |
| Store submission and operator-gate infrastructure | ~88% | MSIX artifacts, public metadata, evidence scripts, final packet, handoff card, and CI are in place. |
| Public desktop release readiness | ~68% | Local side is strong, but four required external evidence gates are still open. |
| Full desktop GUI product maturity | ~55-60% | Tauri static launcher/status shell builds and bundles, but it is not the full dashboard GUI. |

No internal code issue was found in this scoped audit that would block continuing to the external operator gates. The release remains No-Go because evidence is missing, not because the local release pipeline is structurally broken.

## Evidence Snapshot

Audit snapshot before this document update:

| Item | Current value |
|---|---|
| Git HEAD | `942f18c2dc245846082a76eabaf0eb1bd2c0a8d0` |
| Latest pushed check | GitHub Actions `Tests` run `26618818235` passed on `942f18c` |
| Final packet alias | `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip` |
| Final packet stamp | `20260529-135458` |
| Packet verification | `ok=true`, `fail_count=0`, `kit_count=1` |
| Packet source commit | `942f18c2dc245846082a76eabaf0eb1bd2c0a8d0`, clean git metadata |
| Operator handoff card | `show-operator-handoff-card.ps1` reads packet metadata and prints current support id, subject, kit name, return files, and recording commands |
| Support mailbox | `musu@musu.pro` |
| Support source of truth | root `SUPPORT_EMAIL`; scripts use `scripts\windows\release-config.ps1`; public Next pages use `musu-bee/src/lib/contact.ts` |
| Current single-machine evidence | `docs\evidence\single-machine\1.15.0-rc.1\20260530-060739-HUGH_SECOND.evidence.json` |
| Single-machine smoke output | `MUSU_RELEASE_SMOKE_OK_20260530_060700`; CLI route `MUSU_CLI_ROUTE_OK_20260530_060700` |
| Public metadata | live `https://musu.pro/privacy` and `/support` verify with `musu@musu.pro` |
| Final go/no-go | `ready_for_public_desktop_release=false` |

Blocking gates at this snapshot:

1. `msix-install`: clean/current Windows MSIX install evidence has not been recorded.
2. `multi-device`: real second-PC multi-device evidence has not been recorded.
3. `support-mailbox`: `musu@musu.pro` delivery has not been operator-verified.
4. `store-release`: Partner Center product name reservation, app submission, Microsoft certification, and restricted startup capability approval evidence has not been recorded.

After this document/code commit, regenerate the final operator packet from the clean post-commit HEAD before handoff. The packet generator and verifier now include this document so stale packets are easier to spot.

Post-audit refresh:

- `smoke-single-machine-beta.ps1` was rerun after the wiki/521 packet-script commit.
- Fresh evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260529-151324-HUGH_SECOND.evidence.json`.
- Source commit: `5209a82792b0eb5f439242220fb14495de7c61ac`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_1524`.
- CLI route: `MUSU_CLI_ROUTE_OK_20260529_1524`.
- Dashboard task: `d1571cf6-fbf6-415b-adf5-1e88ca6a3266`.

Latest harness/evidence refresh:

- `show-second-pc-return-card.ps1` was added after this audit to turn returned second-PC handoff JSON into exact primary-side commands.
- `smoke-single-machine-beta.ps1` was hardened again after Windows process testing showed that PowerShell job/pipe capture can hang when `musu up` spawns a long-lived bridge.
- Fresh evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260529-185958-HUGH_SECOND.evidence.json`.
- Source commit: `242d75f74e98d9cabac6152149de4021433d7a09`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_185935`.
- CLI route: `MUSU_CLI_ROUTE_OK_20260529_185935`.
- Dashboard task: `3cab5be8-1abf-40c0-91ad-3f5d2da33bcb`.
- Bridge: `http://127.0.0.1:9218`.

Latest operator action pack/evidence refresh:

- `prepare-operator-action-pack.ps1` and `verify-operator-action-pack.ps1` were added and validated after the operator action pack commit; `show-final-release-handoff-status.ps1` now reports action-pack existence/verification beside final packet verification.
- Fresh evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260530-053645-HUGH_SECOND.evidence.json`.
- Source commit: `2b91d0a78180eec19285948824a1f455ff48e39d`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260530_053611`.
- CLI route: `MUSU_CLI_ROUTE_OK_20260530_053611`.
- Dashboard task: `d0f7f581-3c3e-49b2-a551-1f8881100aa8`.
- Bridge: `http://127.0.0.1:11971`.
- A first smoke attempt failed while Next was still compiling `/app`; `musu up --json` returned bridge/dashboard `ok` after compilation and the rerun passed.

Latest handoff status/evidence refresh:

- `show-final-release-handoff-status.ps1` now reports `action_pack.exists` and `action_pack.verified`.
- Fresh evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260530-060739-HUGH_SECOND.evidence.json`.
- Source commit: `d7e745f6ddd84127c358b3cdcad68249ab1b55ca`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260530_060700`.
- CLI route: `MUSU_CLI_ROUTE_OK_20260530_060700`.
- Dashboard task: `146d0165-5f4a-428e-9d74-f3ea0b05dbad`.
- Bridge: `http://127.0.0.1:12305`.

## Product Spec Updates

These are the current product/spec locks from the work:

1. **Product name and launch focus**: the Store candidate is MUSU Desktop / MUSU local AI operations node. Do not import HiveLink or Vibe PM positioning into the current MUSU Store listing.
2. **Windows distribution split**: MSIX-first remains the preferred Store path. Tauri MSI/NSIS artifacts are useful diagnostics/fallbacks, not the current public release promise.
3. **Desktop shell contract**: the current Tauri app is a runtime launcher/status shell. It can start/check runtime and hand off to the dashboard; it is not yet a full native dashboard.
4. **Support mailbox**: `musu@musu.pro` is canonical. `support@musu.pro` is not the release support mailbox.
5. **Evidence policy**: public release readiness is evidence-backed only. No assumption flags, no fake support evidence, no Store approval inference, and dirty git state is a blocker.
6. **Second-PC proof**: second-PC evidence must include a real install capture, operator metadata, current version, non-future timestamps, and a multi-device `remote_addr` with `host:port`.
7. **Partner Center proof**: Store release evidence must explicitly include product-name reservation timestamp, submission id, certification status, and restricted capability status.
8. **musu-system integration**: `yellowhama/musu-system`, `musu-crawl-ai`, `musu-marketer`, and `musu-nurikun` are high-value adjacent tooling, but they are not part of the first Store package and should not be merged into `musu-rs`. First likely integration candidate is `crawl-ai` as optional wiki/knowledge ingestion through an adapter/MCP/CLI boundary. `nurikun` support ops should stay human-approved until send-failure persistence is fixed or wrapped.
9. **Handoff values**: support verification id, subject, and second-PC kit name must come from `show-operator-handoff-card.ps1`, not from old notes.
10. **Second-PC return values**: returned `.local-build\second-pc-handoff\*.handoff.json` should be fed to `show-second-pc-return-card.ps1` so the primary PC uses a current `host:port` endpoint and matching evidence paths.
11. **Operator action pack**: `prepare-operator-action-pack.ps1` and `verify-operator-action-pack.ps1` create/check a local handoff archive for second-PC transfer, support-mailbox verification, and Partner Center submission copy. It is a convenience wrapper, not release evidence.

## Qualitative Report

What is solid:

- The local beta path is now believable. It starts services, discovers the bridge, checks doctor/readiness, submits a task, and receives a real runner result.
- Support email drift was fixed centrally. The public routes, E2E checks, release scripts, packet metadata, and verifier now converge on `musu@musu.pro`.
- The final release process fails closed. Missing public metadata, dirty git, weak support evidence, weak MSIX evidence, weak multi-device evidence, and inferred Store evidence cannot produce a public release pass.
- Operator friction is much lower than before. The packet-aware handoff card removes stale packet id / stale kit name risk for the remaining manual gates.
- Operator file handling now has a repeatable action pack that wraps the second-PC transfer zip, Partner Center submission copy, and support-mailbox verification template without including private `.pfx` material.
- The second-PC return path is now less error-prone because returned handoff JSON can generate exact primary-side record/smoke commands.
- Public metadata is live and verified. This is no longer a local-only claim.

What is still weak:

- Public desktop readiness still depends on external proof that cannot be produced from this primary machine.
- The desktop GUI story is still partial. The Tauri shell is a viable entry surface, not the finished dashboard app.
- The first Store submission still needs Partner Center product setup and Microsoft review evidence.
- The multi-device claim is not yet release-grade because it has not passed on a real second PC with current artifacts.
- Some historical docs still contain older completion estimates. This `wiki/521` page supersedes them for the current release state.

## Code Audit

Audit scope:

- support mailbox correction and config flow
- final operator packet generator/verifier
- operator action pack generator/verifier
- operator handoff card
- go/no-go evidence gates
- MSIX install, support mailbox, Store release, and multi-device evidence validators
- public metadata verification surface

Findings:

1. **No active release-flow stale mailbox found.** The canonical mailbox is `musu@musu.pro`. The old incorrect `support@musu.pro` value is not part of the current scripts/pages/release packet support flow; it may still appear in historical correction notes as an intentionally documented mistake.
2. **Support mailbox config is centralized enough for this release.** Root `SUPPORT_EMAIL` feeds release scripts through `release-config.ps1`; public pages use `musu-bee/src/lib/contact.ts`.
3. **Operator handoff card is evidence-non-recording.** It reads packet metadata and support template values, prints commands, and cleans temporary extraction paths. It does not create readiness evidence.
4. **Final packet creation is properly source-attributed.** `prepare-final-operator-gate-packet.ps1` refuses dirty git state and writes packet build metadata with branch, commit, clean status, version, support email, and support verification id.
5. **Final packet verification is materially useful.** It checks required docs/scripts, packet metadata, README instructions, support email consistency, checksums, kit count, handoff helper, and stale verifier safety rules.
6. **Operator action pack generation is repeatable and evidence-safe.** `prepare-operator-action-pack.ps1` refuses dirty git state, verifies the final operator packet first, creates second-PC/Partner Center/support sub-bundles, records source metadata, and rejects private `.pfx` material. `verify-operator-action-pack.ps1` checks metadata, nested zips, checksums, support template values, and `.pfx` exclusion.
7. **Evidence validators fail closed on the important fields.** Current scripts require explicit support verification token, sender distinction, current version, timestamps, operator metadata, Store product-name reservation timestamp, MSIX capture checks, and multi-device endpoint shape.
8. **No release-blocking code issue found in the scoped audit.** Remaining release blockers are missing external evidence files, not internal code defects.
9. **Smoke harness issue fixed after audit.** `Start-Job` and redirected pipe capture were unsafe for `musu up` because the command can spawn a long-lived bridge. `smoke-single-machine-beta.ps1` now uses readiness retries and temp-file command capture through `Start-Process`.

Residual risks:

- A packet becomes stale immediately after any commit. Mitigation: commit first, regenerate packet from clean HEAD, verify packet, then hand off.
- The support mailbox gate still requires a real email delivery check by an operator with inbox access.
- Store approval cannot be inferred from a prepared bundle. It requires Partner Center/Microsoft evidence.
- Tauri launcher/status shell should not be marketed as the full dashboard GUI.

## Next Steps Roadmap

P0: close public release evidence gates.

1. Commit and push the updated docs/scripts.
2. Regenerate `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip` from the clean pushed HEAD.
3. Run `verify-final-operator-gate-packet.ps1 -PacketPath .local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip -Json`.
4. Run `prepare-operator-action-pack.ps1 -Json`, then `verify-operator-action-pack.ps1 -PackPath .local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip -Json`.
5. Run `show-final-release-handoff-status.ps1 -Json` and confirm `packet.verified=true`, `action_pack.verified=true`, and the only blockers are the four external gates.
6. Run `show-operator-handoff-card.ps1` and use only its current support subject/id and kit name.
7. Copy the action pack or only its second-PC transfer zip to the second Windows PC.
8. On the second PC, install/verify MSIX, capture MSIX install evidence, and run `collect-second-pc-handoff.ps1`.
9. On the primary PC, run `smoke-multidevice-beta.ps1` with the second PC `host:port`, then record returned MSIX and multi-device evidence.
10. Send a real email to `musu@musu.pro` using the current support subject/id and record support mailbox evidence.
11. In Partner Center, reserve product name, submit the MSIX, wait for Microsoft certification/restricted capability review, then record Store release evidence.
12. Run `complete-final-operator-gates.ps1 ... -FailOnNotReady -Json`.

P1: stabilize first public release operations.

- Add a short post-install diagnostics runbook for users who install from Store/MSIX.
- Add a screenshot-based Tauri shell smoke once the desktop shell becomes a user-facing promise.
- Keep public metadata, Store listing copy, and support email checks in CI.
- Define first-release KPIs: page view, install attempt, install success, first launch, doctor OK, first task success, second device connected.

P2: product expansion after first release.

- Decide whether the desktop product remains launcher + browser dashboard or becomes a fuller static/native Tauri dashboard.
- Add optional `musu-system` adapters starting with `crawl-ai` wiki ingestion.
- Add `marketer` only after the local wiki/source-grounding contract is explicit.
- Add `nurikun` only after support ops are human-approved and send-failure persistence is corrected or wrapped.

## Do Not Release Yet

Do not announce public desktop release readiness until `show-final-release-handoff-status.ps1 -Json` reports:

- `ready_for_public_desktop_release=true`
- `packet.verified=true`
- `go_no_go.local_artifacts_ready=true`
- `go_no_go.single_machine_verified=true`
- `go_no_go.msix_install_verified=true`
- `go_no_go.multi_device_verified=true`
- `go_no_go.public_metadata_ok=true`
- `go_no_go.support_mailbox_verified=true`
- `go_no_go.store_release_verified=true`
- `go_no_go.manifest_git.dirty=false`
