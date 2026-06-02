# MUSU 1.15.0-rc.1 Current-Head Evidence, Qual Audit, and Next Steps

Date: 2026-06-02 12:05 KST
Current clean go/no-go commit: `9b836bd1e5702a4a6b40b30fb7f15b5aa76be05a`

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
| Desktop single instance | Pass | `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-113614-HUGH_SECOND.desktop-single-instance.json` |
| Process ownership | Pass | `docs\evidence\process-ownership\1.15.0-rc.1\20260602-113702-HUGH_SECOND.process-ownership.json` |
| Single-machine smoke | Pass | `docs\evidence\single-machine\1.15.0-rc.1\20260602-113759-HUGH_SECOND.evidence.json` |
| Desktop-open idle CPU | Pass on primary, release gate 1/2 | `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-114149-HUGH_SECOND.desktop-open.evidence.json` |
| Four-state CPU matrix | Pass on primary, release gate 1/2 | `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-115359-HUGH_SECOND.runtime-cpu-scenario-matrix.json` |
| Public metadata | Pass | `https://musu.pro/privacy` and `https://musu.pro/support` return the expected `musu@musu.pro` support address |
| MSIX install | Pass via existing release evidence | Go/no-go still selects `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json` |

Desktop-open CPU evidence was captured from clean git state:

- sample: `60.042s`
- process roles: MUSU `2`, repo-related Node `1`, owned WebView2 `6`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.13`
- working set: `500.54MB`
- hot process count: `0`

The four-state matrix also passes from clean git state:

- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_115359`
- scenarios: `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`
- max one-core CPU peaks: WebView2 `0.16`, Node `0.05`, MUSU `0`
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

No source code was changed in this evidence refresh; the new commits are
evidence and documentation commits. The current source state being audited is
the relay-idle-hardened runtime/web code from commit `77ba7a11`.

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
