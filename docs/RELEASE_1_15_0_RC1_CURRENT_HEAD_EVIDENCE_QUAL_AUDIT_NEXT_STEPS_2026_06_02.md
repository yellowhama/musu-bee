# MUSU 1.15.0-rc.1 Current-Head Evidence, Qual Audit, and Next Steps

Date: 2026-06-03 01:12 KST
Current evidence source commit: `fbd01746c3741f79c31afdce493851934ddf6fa4`

## Verdict

Public desktop release is still **No-Go**.

The local desktop/package path is now in a much better state: current primary
machine evidence passes for single-machine smoke, desktop single-instance,
process ownership, idle CPU, and the four-state CPU matrix. The operator
reported busy-loop pattern is not reproduced on `HUGH_SECOND` in the current
packaged desktop path.

The remaining blockers are external/release-gate blockers, not local UI polish:

- second-PC multi-device route evidence
- second-PC runtime idle CPU evidence
- second-PC four-state CPU matrix evidence
- live `musu.pro` P2P owner-scoped control-plane evidence
- `musu@musu.pro` support mailbox delivery evidence
- Microsoft Store / Partner Center submission evidence

## Current Evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| Desktop single instance | Pass | `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-005000-HUGH_SECOND.desktop-single-instance.json` |
| Process ownership | Pass | `docs\evidence\process-ownership\1.15.0-rc.1\20260603-005010-HUGH_SECOND.process-ownership.json` |
| Single-machine smoke | Pass | `docs\evidence\single-machine\1.15.0-rc.1\20260603-005257-HUGH_SECOND.evidence.json` |
| Desktop-open idle CPU | Pass on primary, release gate 1/2 | `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-010000-HUGH_SECOND.desktop-open.evidence.json` |
| Four-state CPU matrix | Pass on primary, release gate 1/2 | `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-010315-HUGH_SECOND.runtime-cpu-scenario-matrix.json` |
| Public metadata | Pass | `https://musu.pro/privacy` and `https://musu.pro/support` return the expected `musu@musu.pro` support address |
| MSIX install | Pass via existing release evidence | Go/no-go still selects `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json` |

Desktop-open CPU evidence was captured from clean git state:

- sample: `60.048s`
- process roles: MUSU `2`, repo-related Node `0`, owned WebView2 `6`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.1`
- working set: `363.87MB`
- hot process count: `0`

The four-state matrix also passes from clean git state:

- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_010315`
- scenarios: `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`
- max one-core CPU peaks: WebView2 `0.16`, Node `0`, MUSU `0`
- all scenarios record no hot processes and no resource budget violations

Clean go/no-go after the current evidence commits reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `process_ownership_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_idle_cpu_verified=false` with `1/2` valid machines
- `runtime_cpu_scenario_matrix_verified=false` with `1/2` valid machines
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- blockers: `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`, `p2p-control-plane`, `support-mailbox`, `store-release`

## Qualitative Assessment

The product is locally usable enough for a controlled RC handoff, but not for a
public Store launch.

Strengths:

- The desktop no longer opens duplicate shells on repeated activation.
- The runtime/process tree is attributable: one runtime, one desktop shell,
  zero MUSU-owned Node helpers, and bounded WebView2 helpers.
- Idle CPU is currently low across desktop-open and route-adjacent states.
- Dashboard relay behavior is now on demand instead of page-load background
  network work.
- Public metadata now consistently uses `musu@musu.pro`; `support@musu.pro`
  must not be used as the canonical support address.

Weaknesses:

- Current CPU confidence is one-machine confidence. The release gate correctly
  stays blocked until the second Windows PC returns idle CPU and matrix
  evidence.
- The `musu.pro` deploy is web/control-plane availability evidence only. It is
  not proof that live P2P owner-scoped relay leases or route control auth work.
- Route evidence still cannot be marketed as release-grade internet P2P until
  identity, encryption, route kind, and payload-transit proof pass on real
  two-machine evidence.
- The local developer shell still has `C:\Users\empty\.cargo\bin\musu.exe`
  before the WindowsApps alias. Packaged CLI checks should use the explicit
  WindowsApps alias or a clean operator shell.
- The mDNS/Tailscale IPv6 link-local error is still a noisy diagnostics risk.
  It is not reproduced as a CPU hot process in current evidence, but virtual
  adapter filtering/log-level hardening remains a product-quality follow-up.

## Code Audit

This evidence refresh audits the source state through commit `c25c109e`,
including the Rust target-side forwarded-task audit hardening.

Current audit reading:

- `DashboardClient.tsx` now gates relay token fetch and relay WebSocket open
  behind explicit `Connect`, which is the right boundary for idle CPU and
  `musu.pro` control-plane behavior.
- Runtime polling has bounded task timeouts, and Rust bridge health polling now
  has capped backoff; these are appropriate busy-loop mitigations.
- Desktop single-instance and process ownership evidence are now release-gate
  covered and passing on the primary machine.
- The release evidence verifier policy is stronger than the current product
  capability: it correctly keeps `ready=false` until second-PC CPU/matrix,
  release-grade route, P2P control-plane, support mailbox, and Store evidence
  all exist.

13:05 KST follow-up correction: a later operator API code audit did find and
fix a real local hardening issue in `musu-bee`. `/api/nodes/execute`,
`/api/processes`, `/api/processes/start`, and `/api/processes/kill` are now
authenticated operator actions with allowlist/enable-flag policy gates and
mutation audit logging. See
`docs/RELEASE_1_15_0_RC1_OPERATOR_API_SECURITY_AUDIT_2026_06_02.md`.
The remaining public release blockers are still external/current evidence
gates: second-PC CPU/matrix/route, P2P KV/live owner-scoped control-plane,
`musu@musu.pro` mailbox evidence, and Store evidence.

Post-security go/no-go on clean commit
`94ecda1caceba4a40f091071e8d64825ce7a7b29` reports `ready=false`,
`local_artifacts_ready=true`, `single_machine=false`, runtime idle CPU `0/2`,
runtime CPU matrix `0/2`, `p2p_control_plane=false`,
`support_mailbox=false`, and `store_release=false`. Fresh current-HEAD primary
MSIX install/smoke/CPU/matrix evidence is required before final release claims.

13:36 KST primary evidence refresh: the current packaged path has been
re-evidenced after the operator API hardening. Fresh MSIX workflow succeeded and
installed `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`; explicit WindowsApps
alias `musu up --json` restored bridge health at `http://127.0.0.1:1065`.
Desktop repeated activation passed at
`.local-build\desktop-single-instance\musu-desktop-single-instance-20260602-132523-HUGH_SECOND.json`
with one shell, and process ownership passed at
`.local-build\process-ownership\musu-process-ownership-20260602-132447.json`
with one runtime and zero MUSU-owned Node helpers. Current single-machine smoke
is committed at
`docs\evidence\single-machine\1.15.0-rc.1\20260602-132814-HUGH_SECOND.evidence.json`.
Current desktop-open CPU is committed at
`docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-132531-HUGH_SECOND.desktop-open.evidence.json`
with 60.05s, `git_dirty=false`, MUSU `0`, owned Node `0`, WebView2 `0.52`,
working set `366.38MB`, and hot `0`. Current four-state matrix is committed at
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-132921-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_132921`. Clean go/no-go
on `6f7fe937fcc5dd7e9665bf374aee1bdd1be0e48c` reports `ready=false`,
`local_artifacts_ready=true`, `single_machine=true`, runtime idle CPU
`1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
process/startup/desktop single-instance true, P2P/support/Store false, and
`manifest_dirty=false`. This means the primary busy-loop report is not
reproduced on current packaged evidence, but the release gate still correctly
requires second-PC CPU/matrix and release-grade route evidence.

23:35 KST follow-up: a P2P audit gap was fixed in
`musu-rs/src/bridge/handlers/forward.rs`. When `/api/tasks/forward` accepts and
spawns a forwarded cross-machine task, the target bridge now writes an
`audit_log` row with the real peer IP from `ConnectInfo`, `cross_machine=true`,
status `202`, `company_id`, and bounded task/source/rendezvous identifiers. The
audit note intentionally excludes prompt text, cwd, callback URL, model, and
adapter metadata. This improves target-side command forensics but does not make
P2P route evidence release-grade. Because Rust source changed, previous
packaged MSIX primary evidence is stale until a fresh MSIX build/install and
primary smoke/process/desktop-open CPU/matrix refresh are recorded. Validation
passed `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` and
the focused Rust unit test
`forwarded_task_audit_note_is_bounded_and_excludes_prompt`.

2026-06-03 00:25 KST primary evidence refresh: the current packaged path has
been re-evidenced after the forwarded-task audit hardening. Fresh MSIX
workflow succeeded and installed
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`; packaged runtime bridge health
was restored at `http://127.0.0.1:8738`. Current single-machine smoke is
committed at
`docs\evidence\single-machine\1.15.0-rc.1\20260603-001225-HUGH_SECOND.evidence.json`
with dashboard task `17241539-c53f-4bd1-b605-89546902f89f`, output
`MUSU_RELEASE_SMOKE_OK_20260603_001203`, and CLI route checked. Desktop
single-instance passed at
`docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-000306-HUGH_SECOND.desktop-single-instance.json`
with repeat count `3`, before `0`, after `1`, and new shell `1`. Process
ownership passed at
`docs\evidence\process-ownership\1.15.0-rc.1\20260603-000306-HUGH_SECOND.process-ownership.json`
with runtime `1`, desktop `1`, MUSU-owned Node `0`, owned WebView2 `6`,
machine-wide Node `19`, orphan repo helpers `0`, and bridge PID `35804`
health HTTP `200`. Desktop-open CPU is committed at
`docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-001200-HUGH_SECOND.desktop-open.evidence.json`
with 60.059s, `git_dirty=false`, MUSU `0.03`, Node `0`, WebView2 `0.08`,
working set `454.06MB`, private memory `265.8MB`, and hot `0`. Current
four-state matrix is committed at
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-001416-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_001416`; verifier
reports `ok=true`, `fail_count=0`. The primary busy-loop report is not
reproduced on current packaged evidence, but the release gate still correctly
requires second-PC CPU/matrix/route, live `musu.pro` owner-scoped control-plane
evidence, `musu@musu.pro` mailbox evidence, and Store evidence.

## Roadmap

1. Close second-PC runtime gates.
   - Send or regenerate the latest second-PC transfer/action pack.
   - Run the included release check on the second Windows PC without skipping
     idle CPU or runtime CPU scenario matrix.
   - Import the return zip and require `runtime_idle_cpu_valid=2/2`,
     `runtime_cpu_scenario_matrix_valid=2/2`, and passing multi-device route
     evidence.

2. Configure live `musu.pro` P2P control-plane auth.
   - Configure production scoped auth such as `MUSU_P2P_CONTROL_TOKEN_SHA256S`.
   - Redeploy or reload the Vercel production environment.
   - Rerun `record-p2p-control-plane-evidence.ps1` without
     `-AllowUnverified`.
   - Require `owner_scope_verified=true` and `relay_default_data_path=false`.

3. Produce release-grade route evidence.
   - Two-machine route proof must record route kind, timing, peer identity,
     encryption, and payload-transit truth.
   - Legacy `none_http_bearer` evidence is not acceptable for public internet
     P2P claims.

4. Record `musu@musu.pro` mailbox evidence.
   - Send and receive a real support verification message.
   - Store the evidence under the support mailbox evidence path.
   - Keep all public docs and Partner Center metadata on `musu@musu.pro`.

5. Prepare Partner Center / Store submission.
   - Use the current MSIX package path once the final current-head evidence is
     closed.
   - Run packaged CLI/install checks from a clean operator shell or explicit
     WindowsApps alias to avoid the local dev alias shadow.
   - Submit only claims backed by current evidence: local desktop, local/LAN
     orchestration, and beta account-assisted setup. Do not claim universal NAT
     traversal or production relay until the P2P gate passes.

6. Polish diagnostics after gates.
   - Downgrade or filter known virtual-interface mDNS send failures when they
     are not actionable.
   - Keep process attribution visible so operator reports of many Node.js
     processes can distinguish MUSU-owned, repo-related, and unrelated tools.

7. Replace ad hoc process controls with a command catalog.
   - Keep `MUSU_PROCESS_START_ALLOWLIST` fail-closed for the release candidate.
   - Add named safe actions, approval gates, RBAC, and richer per-command audit
     metadata before broad process start becomes a product feature.

## Current Operator Handoff Artifacts

2026-06-02 12:22 KST update: the latest handoff artifacts were regenerated from
clean HEAD `ef80aa94d76db4b08ca0866f6bc29c2ed889bdc4` after this audit.

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-121850.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-121918.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-121918.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260602-121850`

Both `verify-final-operator-gate-packet.ps1` and
`verify-operator-action-pack.ps1` passed with `ok=true`, `fail_count=0`.

2026-06-02 13:40 KST update: the current handoff artifacts were regenerated
from clean HEAD `6f7fe937fcc5dd7e9665bf374aee1bdd1be0e48c` after the
post-security primary evidence refresh.

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-134019.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-134035.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-134035.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260602-134019`

Both regenerated artifacts verify with `ok=true`, `fail_count=0`.

2026-06-02 18:58 KST update: after second-PC runtime cleanup hardening, the
current handoff artifacts were regenerated from clean HEAD
`a3cfdb5c153da2f3e2fca0f7ad337890290a2ff4`.

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-185745.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-185802.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-185802.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260602-185745`
- support mailbox:
  `musu@musu.pro`

`verify-final-operator-gate-packet.ps1` passed with `ok=true`,
`fail_count=0`, and `kit_count=1`. `verify-operator-action-pack.ps1` passed
with `ok=true` and `fail_count=0`; it specifically verifies that the second-PC
transfer quickstart explains the return archive and cleanup evidence.

## 2026-06-02 19:26 KST Stop/Desktop Cleanup Hardening Update

The runtime stop command now has an explicit desktop cleanup mode:

- command: `musu down --json --timeout-sec 5 --include-desktop`
- default `musu down`: unchanged, bridge runtime PID only
- new `musu.stop_report.v1` fields:
  `include_desktop`, `desktop_cleanup_attempted`, `desktop_pids_before`,
  `desktop_terminate_requested_pids`, `desktop_pids_after`, `desktop_errors`
- second-PC wrapper:
  `run-second-pc-release-check.ps1` now invokes the new option before its
  packaged desktop-shell fallback

Validation passed:

- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml bridge::services --lib -- --test-threads=1`
  15/15
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  14/14
- parser check for `run-second-pc-release-check.ps1`
- `git diff --check`
- source CLI smoke `down --json --timeout-sec 1 --include-desktop` returned
  `ok=true`, `desktop_cleanup_attempted=true`, empty desktop PID lists, and
  `desktop_errors=[]`

Release meaning: this improves process cleanup and second-PC evidence
attribution, but it makes packaged primary evidence stale until a current MSIX
is rebuilt/installed and smoke/CPU/matrix/process evidence are refreshed.

## 2026-06-02 13:57 KST P2P CI Hardening Update

The P2P control-plane route contract is now covered by the web CI lane:

- `musu-bee/package.json` adds `npm run test:p2p`.
- `.github/workflows/test.yml` runs `P2P control-plane tests` after
  `Route security tests`.
- Local validation passed `npm run test:p2p` 21/21, `npm run test:routes`
  12/12, and `git diff --check`.

This closes a local code-audit gap: release-critical P2P routes existed but
were not included in the required CI test set. The coverage now exercises
owner-scoped route evidence, release-grade route blockers, rendezvous lifecycle,
relay fallback lease policy, and bearer-token fail-closed behavior.

This does not change the public release verdict. Live `musu.pro` P2P evidence
is still No-Go until production KV credentials (`KV_REST_API_URL` and
`KV_REST_API_TOKEN`) are provisioned and owner-scope evidence passes without
`-AllowUnverified`.

## 2026-06-02 14:25 KST Release Gate Script Hardening Update

The previous status check surfaced a local release-operations bug: the
go/no-go and handoff status scripts could block indefinitely or fail unclearly
when a child verifier or manifest generator misbehaved.

Fixes:

- `write-release-candidate-manifest.ps1` now falls back to .NET SHA256 hashing
  when `Get-FileHash` is missing in the child Windows PowerShell host.
- `write-release-go-no-go.ps1` and `show-final-release-handoff-status.ps1`
  now accept `-ScriptTimeoutSeconds`.
- Child verifier execution is bounded with `.NET ProcessStartInfo`, stdout and
  stderr capture, elapsed time, timeout metadata, and child process kill on
  timeout.
- Status-only script paths now include `show-final-release-handoff-status.ps1`
  and `write-release-candidate-manifest.ps1` in go/no-go, single-machine, and
  runtime-matrix evidence freshness handling.
- The exact `test:p2p` `package.json` and GitHub Actions diff is treated as
  tooling-only without broadly allowing dependency or build-script changes.

Validation:

- `write-release-candidate-manifest.ps1` exits 0 under `powershell.exe`.
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json` completes.
- The current dirty-tree go/no-go after the freshness fix reports
  `single_machine=true`, runtime idle CPU `1/2`, runtime matrix `1/2`,
  process/startup/desktop single-instance true, and release No-Go on
  second-PC/P2P/support/Store plus dirty git.
- Clean post-hardening go/no-go reports
  `single_machine=true`, runtime idle CPU `1/2`, runtime matrix `1/2`,
  process/startup/desktop single-instance true, `manifest_dirty=false`, and
  release No-Go on second-PC/P2P/support/Store gates.
- Full `show-final-release-handoff-status.ps1 -ScriptTimeoutSeconds 120 -Json`
  completes with `packet_verified=true` and `action_pack_verified=true`.
- Forced `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 1 -Json` exits
  nonzero in about 2.9s with `Script timed out after 1s`, proving fail-fast
  behavior instead of hang.

Verdict remains **No-Go**. This improves release gate failure handling only;
second-PC CPU/matrix/route, live P2P KV owner-scope, `musu@musu.pro`, and Store
evidence are still required.

## 2026-06-02 15:00 KST Runtime Reconnect Backoff Hardening Update

The next CPU-hardened code pass targeted reconnect paths rather than ordinary
polling loops.

Changes:

- `DashboardClient.tsx` relay WebSocket reconnect now uses capped backoff
  `5s -> 10s -> 20s -> 40s -> 60s` while preserving the existing 5-attempt
  limit.
- Relay reconnect delay state is cleared on successful connect, explicit
  disconnect, selected-node change, and unmount.
- `useChat.ts` task SSE reconnect now has explicit `1s` initial delay, `2x`
  multiplier, `10s` cap, pending-timer cleanup, `EventSource.CONNECTING`
  suppression, and `reconnectGenerationRef` to ignore stale reconnect timers
  after channel/node changes or unmount.
- `runtime-polling-contract.test.ts` now covers these reconnect contracts.
- `npm run test:runtime-polling` is now wired into GitHub Actions before route
  and P2P tests.

Validation:

- `npm run test:runtime-polling`: `10/10`
- `npm run typecheck`: passed
- `npm run test:routes`: `12/12`
- `npm run test:p2p`: `21/21`
- `npm run build`: passed
- `npm run lint`: `0` errors, warning-only existing state
- `git diff --check`: passed

Code-audit verdict:

- This is a focused, low-blast-radius hardening pass.
- It reduces the probability of network-failure reconnect loops causing idle
  work in the desktop WebView/browser.
- It does not replace installed MSIX runtime CPU evidence.
- Because this is runtime web source, the previous primary MSIX CPU evidence is
  not current-HEAD evidence after this commit.

Next release evidence:

1. Commit and push this hardening slice.
2. Watch CI for build/typecheck, runtime polling contract, route security, P2P,
   and Rust core tests.
3. Rebuild/install MSIX from the new HEAD.
4. Rerun desktop single-instance, process ownership, single-machine smoke,
   desktop-open idle CPU, and four-state runtime CPU matrix evidence.
5. Continue second-PC CPU/matrix/route, live P2P KV owner-scope,
   `musu@musu.pro`, and Store evidence gates.

Post-push status:

- commit: `faf199efafb020e11d304ead5b1d3c617d3c71ea`
- GitHub Actions: `Tests` run `26801850077` success, `E2E Tests - musu-bee`
  run `26801850121` success, `Deploy musu-bee to Vercel` run `26801850075`
  success
- clean go/no-go: `ready=false`, `single_machine=false`,
  `runtime_idle=false`, `runtime_matrix=false`, process/startup/desktop
  single-instance true, `manifest_dirty=false`
- blockers: `single-machine`, `multi-device`, `runtime-idle-cpu`,
  `runtime-cpu-scenario-matrix`, `p2p-control-plane`, `support-mailbox`,
  `store-release`

The post-push verdict is correct: the source hardening is green, but current
primary runtime release evidence is stale until rebuilt and remeasured from
this HEAD.

## 2026-06-02 15:45 KST Post-Reconnect Primary Evidence Refresh

Fresh current-head primary release evidence has been restored after the runtime
reconnect backoff hardening.

MSIX/install:

- release workflow rebuilt
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- package verification passed for `musu-desktop.exe`, `musu.exe`, and
  `musu-startup.exe`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- the `-MachineTrust` wrapper waited for elevation; it was stopped after
  existing machine trust made it unnecessary, and current-user reinstall
  verified successfully
- evidence commands used the explicit WindowsApps alias because the local PATH
  still resolves `C:\Users\empty\.cargo\bin\musu.exe` before the packaged alias

Runtime/dashboard:

- packaged `musu up --json` restored bridge health at
  `http://127.0.0.1:14397`
- dashboard smoke used `http://127.0.0.1:3001/app` after starting production
  `next start` for the evidence run

Evidence:

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-152526-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-152537-HUGH_SECOND.process-ownership.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-152615-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-152845-HUGH_SECOND.desktop-open.evidence.json`
- four-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-153038-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key audit findings:

- Desktop repeated activation produced one `musu-desktop.exe` shell after three
  activations.
- Process ownership passed with runtime `1`, desktop `1`, owned Node `0`,
  owned WebView2 `6`, machine-wide Node `18`, machine-wide WebView2 `12`, and
  orphan repo helpers `0`. The operator-visible many-Node state is therefore
  not currently attributable to MUSU-owned helpers.
- Desktop-open CPU sampled 60.061s with `git_dirty=false`, MUSU `0`, repo Node
  `0.05`, WebView2 `0.13`, working set `500.86MB`, and hot `0`.
- Runtime CPU matrix passed `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`; the route probe token was
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_153038`. Worst observed one-core CPU in
  the matrix was MUSU `0.05`, repo Node `0.08`, and WebView2 `0.1`, all under
  the 5% release budget.

Qualitative verdict:

- The 20%-of-one-core busy-loop report is not reproduced on current packaged
  primary evidence.
- The reconnect, polling, process ownership, and single-instance hardening now
  look coherent enough for continued beta evidence collection.
- This is still not public-release complete because runtime CPU gates require a
  second Windows PC, and P2P/control-plane claims require live `musu.pro`
  owner-scoped evidence plus release-grade route proof.

Current No-Go blockers:

- second-PC CPU/matrix/route evidence
- live `musu.pro` P2P owner-scope control-plane evidence
- `musu@musu.pro` mailbox send/receive evidence
- Store/Partner Center submission evidence

Immediate next work:

1. Import or rerun the second-PC return package against the current transfer
   kit and require CPU/matrix evidence on the second machine.
2. Provision production KV/control-plane env for `musu.pro` and rerun P2P
   evidence without `-AllowUnverified`.
3. Record the `musu@musu.pro` mailbox evidence.
4. Prepare Store submission only after the external gates are backed by current
   evidence.

## 2026-06-02 15:58 KST Current Operator Handoff Refresh

The current handoff artifacts were regenerated from clean HEAD
`7bb367988d1ae5cbc41bbcd7ce68f4eeb4f57d10` after the post-reconnect evidence
commit.

Artifacts:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-155746.zip`
- final packet latest alias:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815.zip`
- action pack latest alias:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-155815.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-155815.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260602-155746`

Verification:

- `verify-final-operator-gate-packet.ps1`: `ok=true`, `fail_count=0`,
  `kit_count=1`
- `verify-operator-action-pack.ps1`: `ok=true`, `fail_count=0`
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json`:
  `ready=false`, `single_machine=true`, process/startup/desktop
  single-instance true, `manifest_dirty=false`
- blockers remain `multi-device`, `runtime-idle-cpu`,
  `runtime-cpu-scenario-matrix`, `p2p-control-plane`, `support-mailbox`, and
  `store-release`

Operator status note:

- The earlier full handoff status path verified packet/action-pack checksums and
  could be heavy on this Windows host.
- That bottleneck has now been split: default status uses quick archive
  metadata checks under a 120s budget, and full packet/action-pack checksum
  verification is available through explicit deep mode under a 240s budget.
- Use `show-final-release-handoff-status.ps1 -ScriptTimeoutSeconds 120 -Json`
  for normal operator status.
- Use `show-final-release-handoff-status.ps1 -PacketVerificationMode deep
  -ActionPackVerificationMode deep -ScriptTimeoutSeconds 240 -Json` only when
  full packet/action-pack verifier execution is required.

Next concrete release action:

Copy or send the current second-PC transfer zip above to the second Windows PC,
run its `run-second-pc-release-check.ps1`, return the generated
`.local-build\second-pc-return\*.zip`, and import it with
`import-second-pc-return.ps1 -RecordMsixInstall -RequireReleaseGateEvidence`.
That is the next gate that can move `runtime-idle-cpu` and
`runtime-cpu-scenario-matrix` from primary-only evidence toward the required
two-machine threshold.

## 2026-06-02 16:30 KST Release Status Fast Path

The release status tooling was hardened after accumulated evidence history and
full action-pack checksum verification made the default handoff path too heavy
for a 120s operator status run.

Code changes:

- `show-final-release-handoff-status.ps1` now defaults packet and action-pack
  verification to quick archive inspection and exposes
  `-PacketVerificationMode quick|deep|skip` plus
  `-ActionPackVerificationMode quick|deep|skip`.
- Old `-SkipPacketVerification` and `-SkipActionPackVerification` switches still
  map to `skip`.
- Quick mode checks required archive entries, packet/action metadata, clean git
  metadata, support email, required second-PC/Partner/support paths, and absence
  of `.pfx` files.
- Deep mode still invokes `verify-final-operator-gate-packet.ps1` and
  `verify-operator-action-pack.ps1`.
- `write-release-go-no-go.ps1` now preselects latest evidence candidates per
  machine before child verifier execution and exposes
  `available_candidate_count` plus `candidate_selection=latest-per-machine`.

Validation:

- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -SkipPublicMetadata
  -Json` completed in 41.733s while selecting runtime idle `4/59`, runtime
  matrix `3/38`, and process ownership `3/36`.
- Default `show-final-release-handoff-status.ps1 -ScriptTimeoutSeconds 120
  -SkipPublicMetadata -Json` completed in 44.050s with quick packet/action pack
  `fail_count=0`.
- Deep handoff status completed in 50.663s with packet/action pack
  `fail_count=0`.
- Default status with public metadata enabled completed in 47.182s and reported
  `public_metadata_ok=true`.
- `test-release-evidence-verifiers.ps1` passed all 13 regression cases.

Current release meaning:

- This closes the operator-status timeout/UX issue.
- It does not close public release gates. Required blockers remain second-PC
  CPU/matrix/route evidence, live `musu.pro` owner-scoped P2P evidence,
  `musu@musu.pro` mailbox evidence, and Store evidence.

## 2026-06-02 16:50 KST File Sync Watcher Storm Hardening

Another optional background-work candidate was hardened: file sync.

Previous risk:

- file sync only starts when shared roots are configured, but the watcher event
  channel was unbounded
- a continuous filesystem event stream could keep the debounce collector alive
  longer than intended
- same-path repeated events were processed separately instead of being
  collapsed before peer pushes

Current change:

- `musu-rs/src/install/sync.rs` uses a bounded `mpsc` queue with capacity `1024`
- batch collection stops at `256` events or `2s`
- same-path events are coalesced to the latest event
- a batch-cap hit yields for `50ms`

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::sync --lib -- --test-threads=1`
  passed
- `git diff --check` passed

Release meaning:

- This is a real hardening improvement for file/network watcher budgets.
- It does not close public release gates.
- It is runtime Rust source, so after commit the current primary evidence must
  be treated as stale until MSIX, single-machine smoke, desktop-open CPU, and
  four-state matrix evidence are refreshed.

## 2026-06-02 17:22 KST Post File-Sync Primary Evidence Refresh

Fresh primary evidence has now been restored after the file sync watcher storm
hardening commit `62381f7feec64ff5c6b17cd689b8729197e3a98e`.

Package/runtime state:

- release MSIX workflow rebuilt and installed
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- explicit WindowsApps alias `musu up --json` returned bridge health at
  `http://127.0.0.1:8155`
- `HUGH_SECOND` still has developer PATH shadowing from
  `C:\Users\empty\.cargo\bin\musu.exe`, so release evidence must keep using the
  explicit WindowsApps alias

Fresh evidence:

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-171500-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-171500-HUGH_SECOND.process-ownership.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-171420-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-171538-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-171659-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Runtime quality:

- single-machine smoke passed with dashboard task
  `60884022-fa9f-4e81-b0fc-775045bb63d0`, bridge `http://127.0.0.1:8155`, and
  CLI route checked
- desktop repeated activation passed: one `musu-desktop.exe`, no duplicate shell
- process ownership passed: runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `7`, machine-wide Node `18`, orphan repo helpers `0`
- desktop-open CPU passed with 60.048s sample, MUSU `0`, repo Node `0.03`,
  WebView2 `0.57`, working set `496.62MB`, hot `0`
- four-state CPU matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_171659`; all scenarios stayed under the
  5%-of-one-core budget

Qualitative verdict:

- Primary packaged Windows beta is strong again after the Rust file sync change.
- The reported 20%-of-one-core busy loop is not reproduced on current primary
  packaged evidence.
- The many-Node observation is real on the machine, but not attributable to
  MUSU-owned helpers in the current evidence.
- Public release remains No-Go until the second-PC CPU/matrix/route proof,
  `musu.pro` owner-scoped P2P evidence, `musu@musu.pro` mailbox evidence, and
  Store evidence are recorded.

Canonical detailed report:

- `docs\RELEASE_1_15_0_RC1_POST_FILE_SYNC_PRIMARY_EVIDENCE_2026_06_02.md`

## 2026-06-02 Runtime Stop/Down Command Hardening

A process-ownership cleanup gap was fixed after evidence collection exposed it:
the CLI had `musu up --json`, but no matching `musu down`/`musu stop` command
to stop the registered local bridge runtime.

Change:

- added `musu stop`
- added `musu down`
- both support `--json` and emit `musu.stop_report.v1`
- stop targets only the `bridge` PID registered in
  `~\.musu\services\bridge.json`
- the PID is terminated only if its process image is a MUSU runtime executable
  (`musu`, `musu.exe`, `musud`, or `musud.exe`)
- non-MUSU registered PIDs are left untouched and reported as an error
- stale bridge registry records are deregistered
- PID-exit waiting uses bounded backoff rather than a tight loop

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  passed 14/14
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- temporary-home CLI smoke passed: `up --json` started bridge PID `37292`,
  `down --json` stopped it with `registry_deregistered=true` and
  `pid_alive_after=false`, and a second `stop --json` no-op returned `ok=true`

Release meaning:

- This directly improves the process ownership / orphan-runtime cleanup track.
- It does not close public release gates.
- Because this is Rust runtime/CLI source, the current primary MSIX evidence is
  stale again after commit and must be refreshed before current-HEAD release
  claims.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_STOP_COMMAND_HARDENING_2026_06_02.md`

## 2026-06-02 18:20 KST Post Stop/Down Primary Evidence Refresh

After the runtime stop/down source change, the release MSIX was rebuilt and
installed again. Current HEAD primary evidence is restored for
`d6f37ed58d543b5e98b4d71ce1b0b07405a730e3`.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-183133-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-183056-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-183056-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-183056-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-183240-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- packaged `musu down --json` was verified through the WindowsApps alias and
  stopped the registered bridge with `registry_deregistered=true` and
  `pid_alive_after=false`
- single-machine smoke passed with task
  `74e0a4fa-64ce-4463-a288-7b4ed2f7ba3a`, bridge `http://127.0.0.1:2890`,
  and output `MUSU_RELEASE_SMOKE_OK_20260602_183115`
- desktop repeated activation passed with one final desktop shell
- process ownership passed with runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `6`, machine-wide Node `18`, orphan repo helpers `0`
- desktop-open CPU passed from clean git state with MUSU `0`, repo Node
  `0.03`, WebView2 `0`, working set `497.57MB`, hot `0`
- runtime matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_183240`

Qualitative verdict:

- Single-machine Windows beta remains strong and current.
- The reported primary busy-loop is not reproduced in current packaged
  evidence.
- Machine-wide Node count is still visible, but current evidence attributes
  zero Node helpers to MUSU.
- Public release remains No-Go until second-PC CPU/matrix/route evidence, live
  `musu.pro` P2P owner-scope evidence, `musu@musu.pro` mailbox evidence, and
  Store evidence are recorded.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_STOP_COMMAND_PRIMARY_EVIDENCE_2026_06_02.md`

## 2026-06-02 18:52 KST Second-PC Runtime Cleanup Hardening

The next second-PC evidence run now has a cleanup contract:

- `run-second-pc-release-check.ps1` writes
  `.local-build\runtime-cleanup\*.runtime-cleanup.json`
- schema: `musu.second_pc_runtime_cleanup.v1`
- cleanup runs even when earlier wrapper steps fail
- cleanup calls packaged `musu down --json --timeout-sec 5`
- cleanup closes packaged desktop shells opened by the evidence run
- cleanup JSON is included in the return zip
- wrapper `ok=true` requires cleanup success

Validation:

- PowerShell parser validation passed for the modified wrapper, kit generator,
  action-pack generator, and action-pack verifier.
- `scripts\windows\test-release-evidence-verifiers.ps1` passed 13/13.
- Short local smoke with CPU/matrix skipped produced cleanup evidence
  `.local-build\runtime-cleanup\20260602-185052-HUGH_SECOND.runtime-cleanup.json`
  with `ok=true`, `stop_exit_code=0`, and remaining desktop shell count `0`.
- The smoke's main flow still failed on `HUGH_SECOND` because the known
  developer alias `C:\Users\empty\.cargo\bin\musu.exe` shadows the WindowsApps
  alias during MSIX install evidence capture.

Release meaning: process cleanup for the second-PC handoff is stronger, but
public release still needs a real current second-PC return plus live P2P,
support mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SECOND_PC_CLEANUP_HARDENING_2026_06_02.md`

## 2026-06-02 20:10 KST Post Stop/Desktop Cleanup Evidence Refresh

The local-sideload MSIX was rebuilt and installed after the stop/desktop cleanup
source change. Current primary evidence is restored on `HUGH_SECOND`.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-195914-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-195058-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-195129-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-195140-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-200531-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Qualitative result:

- single-machine beta quality is current again on the primary Windows machine
- the busy-loop report is not reproduced in this packaged desktop-open sample
- MUSU-owned Node count is `0`; the remaining machine-wide Node processes are
  outside MUSU ownership
- `--include-desktop` works in the installed package and stopped one real
  `musu-desktop.exe` shell after the run

Audit note: desktop activation alone did not start the bridge runtime before
the process ownership audit. Explicit packaged `musu up --json` restored the
runtime and produced passing evidence. Treat this as the current runtime-start
contract unless the product spec is changed to require desktop auto-start.

Go/no-go remains No-Go with `single_machine=true`, runtime idle CPU `1/2`,
runtime matrix `1/2`, process ownership true, desktop single-instance true, and
`manifest_dirty=false`. Remaining blockers are second-PC route/CPU/matrix, live
`musu.pro` P2P owner-scope proof, `musu@musu.pro` mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_STOP_DESKTOP_CLEANUP_PRIMARY_EVIDENCE_2026_06_02.md`

## 2026-06-02 Desktop Runtime Autostart Hardening

The product spec is now stricter: opening MUSU Desktop should start or reuse the
bridge runtime. The Tauri shell now starts a one-shot background runtime
autostart during setup when the registered bridge is missing or unhealthy.

The manual `Start Runtime` command and the autostart path now prefer the
packaged sibling `musu.exe` next to `musu-desktop.exe` before falling back to
PATH. This prevents the known developer-alias shadowing issue where
`C:\Users\empty\.cargo\bin\musu.exe` can be selected instead of the installed
package runtime.

Validation passed:

- `cargo fmt --manifest-path .\musu-bee\src-tauri\Cargo.toml`
- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -- --test-threads=1`
  7/7
- `git diff --check`

Release caveat: this is Tauri desktop source, so packaged primary evidence is
stale again until the MSIX is rebuilt/installed and desktop activation proves
the bridge runtime is present without a separate manual `musu up`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_DESKTOP_RUNTIME_AUTOSTART_HARDENING_2026_06_02.md`

## 2026-06-02 20:45 KST Post Desktop Autostart Evidence Refresh

The local-sideload MSIX was rebuilt and installed from commit
`47bc8f8dd502e9fa884799ceb57db30778a3831c`. Desktop activation now proves the
runtime autostart contract.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-204104-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-203815-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-203833-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-203858-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-204112-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Qualitative result:

- desktop activation now leaves runtime `1` and desktop `1` without manual
  `musu up`
- bridge `/health` is HTTP 200 at `127.0.0.1:14805`
- installed runtime path is the package sibling `musu.exe`, not the developer
  cargo alias
- desktop-open CPU passes with MUSU `0`, WebView2 `0.42`, owned Node `0`,
  working set `364.02MB`, and hot `0`
- runtime matrix passes with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_204112`

Public release remains No-Go because runtime CPU/matrix evidence is still
`1/2`, and second-PC route/P2P/support/Store evidence is missing.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_DESKTOP_AUTOSTART_PRIMARY_EVIDENCE_2026_06_02.md`

## 2026-06-02 21:10 KST Cloud Hardware Probe Idle Hardening

Current source now reduces one logged-in idle/background CPU candidate in the
`musu.pro` cloud heartbeat path:

- cloud registration uses process-cached hardware metadata through
  `gather_hardware_info_cached()`;
- Windows total memory uses Win32 `GlobalMemoryStatusEx`;
- Windows CPU brand uses registry `RegGetValueW`;
- PowerShell/WMIC are no longer the default Windows RAM/CPU metadata path;
- `nvidia-smi` GPU VRAM probing remains available but is reached through the
  cached metadata path, so recurring heartbeat cycles do not rerun it.

Validation passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml peer::hardware --lib -- --test-threads=1`
  3/3

Qualitative assessment: this is a meaningful idle-hardening step, especially
for logged-in desktop sessions, but it is not release evidence. Because Rust
runtime source changed, the previous packaged primary evidence is stale until
MSIX build/install and fresh primary smoke/process/CPU/matrix evidence are
recorded again. Release remains No-Go on second-PC CPU/matrix/route, live
`musu.pro` P2P owner scope, `musu@musu.pro`, and Store evidence.

## 2026-06-02 21:45 KST Post Cloud Hardware Probe Primary Evidence

The local-sideload MSIX was rebuilt and installed from commit `9fff34aa`.
Primary evidence is restored:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-213655-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-213404-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-213412-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-213436-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-213706-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Current primary verdict: busy-loop is not reproduced. Desktop-open CPU records
MUSU `0`, Node `0`, WebView2 `0.49`, working set `363.18MB`, and hot `0`.
The 4-state matrix passed with route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260602_213706`. Public release remains No-Go
until second-PC CPU/matrix/route, live P2P owner scope, `musu@musu.pro`, and
Store evidence pass.

## 2026-06-02 21:58 KST P2P KV and Second-PC Recheck

Fresh `musu.pro` P2P evidence was recorded at
`docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.evidence.json`.
It confirms the current split:

- passing: logged-in relay status, rendezvous wiring, relay lease
  control-plane wiring, runtime relay fallback wiring, and
  `relay_default_data_path=false`
- failing: relay leases `ok=false`, `owner_scope_verified=false`, and
  `owner_scoped=false`
- blocker: `p2p_relay_lease_kv_not_configured`

`show-musu-pro-p2p-env-status.ps1 -Json` confirms GitHub has
`MUSU_P2P_CONTROL_TOKEN_SHA256S` but is missing `KV_REST_API_URL` and
`KV_REST_API_TOKEN`. Local env has no KV/Upstash values and no secret-bearing
`.env` file, so this cannot be fixed from this machine without provisioning
those values.

Second-PC reachability was rechecked against the prior target
`192.168.1.192:8949`; TCP failed and ping timed out. Fresh two-machine
CPU/matrix/route evidence still needs the remote PC to expose a reachable MUSU
bridge or return a fresh evidence zip.

## 2026-06-02 22:18 KST Route Explain Trust Boundary

The route diagnostic surface now matches the release-evidence trust boundary.
`musu route --explain` no longer preserves registry/rendezvous metadata claims
that a candidate is already verified. Advertised key material can still show
`https_fingerprint_pin_available=true`, but explain output keeps
`peer_identity_verified=false`,
`peer_identity_method=advertised_tls_cert_fingerprint_unverified`, and
`encryption=none_http_bearer` until a real runtime transport proof exists.

Validation passed: `cargo check --manifest-path .\musu-rs\Cargo.toml --bin
musu -j 1`, `cargo test --manifest-path .\musu-rs\Cargo.toml
install::cli_commands --lib -- --test-threads=1` 14/14,
`cargo fmt --check`, and `git diff --check`.

Qualitative result: this prevents preflight diagnostics from looking more
release-ready than actual route evidence. It does not implement QUIC/TLS
transport, so public release remains No-Go. Because Rust source changed, current
packaged primary evidence is stale until it is rebuilt/refreshed.

## 2026-06-02 22:56 KST Post Route Explain Primary Evidence

The local-sideload MSIX was rebuilt and installed from commit `93025897`.
Primary packaged evidence is current again:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-224345-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-223734-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-223756-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-223806-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-224917-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Qualitative result: current packaged local evidence does not reproduce the
busy-loop. Desktop-open CPU is MUSU `0`, Node `0`, WebView2 `0.39`, working set
`365.49MB`, and hot `0`. Process ownership separates the user's machine-wide
Node count from MUSU ownership: machine-wide Node `16`, MUSU-owned Node `0`,
orphan repo helpers `0`. The CPU matrix passed from clean git state with route
token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_224917`.

Code audit result: no new critical local desktop issue was found. The remaining
release risks are external/proof gates: second-PC CPU/matrix/route, live
`musu.pro` KV and owner-scoped relay lease evidence, release-grade QUIC/TLS or
equivalent route transport proof, `musu@musu.pro` mailbox evidence, and Store
evidence. Public release remains No-Go.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROUTE_EXPLAIN_PRIMARY_EVIDENCE_2026_06_02.md`

## 2026-06-02 Relay Route Lease-Proof Hardening

The `musu.pro` route-evidence verifier now fail-closes relay release evidence
unless `route_kind=relay` also carries issued relay lease proof. Required
fields include direct path failure, lease requested, `status=issued`,
`lease_issued=true`, a non-empty lease id, a prior non-relay attempted route
kind, and no relay policy blockers.

Validation passed:

- `npm run test:p2p -- src/app/api/v1/p2p/route-evidence/route.test.ts`
  23/23
- `npm run typecheck`
- `npm run build`
- current-commit single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-231612-HUGH_SECOND.evidence.json`

Qualitative result: this removes a false-positive route proof path. Relay
remains a Connect/Pro fallback boundary and cannot become release-grade just by
claiming `route_kind=relay` or MUSU infra transit. This is server/API hardening;
single-machine smoke is current again for commit `f9beb79f`, but public release
is still No-Go on live KV-backed relay lease evidence, second-PC route/CPU,
release-grade transport, support mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_ROUTE_LEASE_PROOF_HARDENING_2026_06_02.md`

## 2026-06-03 01:12 KST Post P2P Storage Env Alias Primary Evidence

After hosted P2P storage env alias hardening, the local-sideload MSIX was
rebuilt and installed from source commit `fbd01746`. Primary packaged evidence
is current again:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-005257-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-005000-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-005010-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-010000-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-010315-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Qualitative result: current packaged local evidence does not reproduce the
busy-loop. Desktop-open CPU is MUSU `0`, Node `0`, WebView2 `0.1`, working set
`363.87MB`, and hot `0`. Process ownership separates the user's machine-wide
Node count from MUSU ownership: machine-wide Node `16`, MUSU-owned Node `0`,
orphan repo helpers `0`. The CPU matrix passed from clean git state with route
token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_010315`.

Code audit result: no new critical local desktop issue was found. The P2P
storage alias change improves production wiring by accepting both Vercel KV and
Upstash Redis REST env names, but it does not prove live storage, owner scope,
relay transport, peer identity, or encryption. Public release remains No-Go on
second-PC CPU/matrix/route, live `musu.pro` KV/Upstash owner-scoped relay lease
evidence, release-grade transport proof, `musu@musu.pro` mailbox evidence, and
Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_P2P_STORAGE_ENV_ALIAS_PRIMARY_EVIDENCE_2026_06_03.md`
