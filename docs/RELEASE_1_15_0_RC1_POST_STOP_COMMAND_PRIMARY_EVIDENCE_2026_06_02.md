# MUSU 1.15.0-rc.1 Post Stop/Down Primary Evidence

Date: 2026-06-02 18:20 KST

Scope: current-head qualitative audit, runtime cleanup proof, primary packaged
MSIX evidence refresh, and next release roadmap after adding `musu stop` /
`musu down`.

## Summary

The runtime stop/down command was added in commit
`d6f37ed58d543b5e98b4d71ce1b0b07405a730e3`, then the release MSIX was rebuilt
and installed again on `HUGH_SECOND`.

Primary Windows evidence is current again:

- single-machine smoke passes
- packaged desktop repeated activation passes
- process ownership passes
- desktop-open idle CPU passes
- four-state runtime CPU matrix passes
- packaged `musu down --json` stops the registered bridge runtime cleanly

Public desktop release is still No-Go. This restores the primary side of the
runtime gates to `1/2`; it does not replace the missing second-PC CPU/matrix,
release-grade route, live `musu.pro` P2P owner-scope, `musu@musu.pro` mailbox,
or Store evidence.

## Package State

- rebuilt MSIX:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged CLI was exercised through the explicit WindowsApps alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- developer PATH shadowing remains present on `HUGH_SECOND` because
  `C:\Users\empty\.cargo\bin\musu.exe` can precede the WindowsApps alias

Packaged stop/down command proof from this run:

- `musu up --json --timeout-sec 20` started bridge PID `37660`
- `musu down --json --timeout-sec 5` emitted `musu.stop_report.v1`
- stop report had `ok=true`, `terminate_attempted=true`,
  `terminate_requested=true`, `registry_deregistered=true`,
  `pid_alive_after=false`
- after the first evidence capture, `musu down --json` also stopped bridge PID
  `13696`; after the clean evidence rerun, it stopped bridge PID `38260` with
  the same clean registry deregistration result

After the first documentation commit, the runtime CPU gate was rerun from a
clean worktree and written through a repo-external temp directory before copying
into `docs\evidence`. The current evidence below is the clean set:
`git_commit=82bd47153672c35c23d1dedba0464cb6b65f084c`,
`git_dirty=false` for desktop-open CPU and the runtime CPU matrix.

## Fresh Evidence

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-183133-HUGH_SECOND.evidence.json`
- single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-183133-HUGH_SECOND.verification.json`
- single-machine summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-183133-HUGH_SECOND.summary.md`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-183056-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-183056-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-183056-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-183240-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Evidence Result

Single-machine smoke:

- dashboard task id: `69fdafb2-1e99-4c6d-9345-537257eb4db0`
- dashboard task id: `74e0a4fa-64ce-4463-a288-7b4ed2f7ba3a`
- bridge: `http://127.0.0.1:2890`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260602_183115`
- CLI route checked: `true`
- evidence SHA256:
  `34979772918331c30423e4f2e8c3f5f618debb6298bbb46323534c4996eea49f`
- verification SHA256:
  `70b29b67413afe73b96d249fcda7d9b85863cc2b7e3ec8b2025c9b1aa201247a`

Desktop/process:

- repeated activation: repeat count `3`, final desktop shell count `1`,
  new desktop shell count `0`, fail count `0`
- process ownership: runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `6`, machine-wide Node `18`, orphan repo helpers `0`
- bridge registry health: HTTP 200 at `127.0.0.1:2890`

CPU:

- desktop-open 60.04s sample passed
- max one-core CPU: MUSU `0`, repo Node `0.03`, owned WebView2 `0`
- total owned/repo-related working set: `497.57MB`
- hot process count: `0`

Runtime matrix:

- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_183240`
- fail count: `0`
- `runtime-started`: MUSU `0`, Node `0`, WebView2 `0.13`, hot `0`
- `dashboard-open`: MUSU `0`, Node `0.05`, WebView2 `0.1`, hot `0`
- `desktop-open`: MUSU `0`, Node `0.08`, WebView2 `0.08`, hot `0`
- `post-route`: MUSU `0`, Node `0.03`, WebView2 `0.26`, hot `0`

## Qualitative Audit

1. Primary busy-loop is not reproduced on the current packaged build. The
   measured MUSU runtime and desktop process CPU stayed at `0` of one logical
   core, and owned WebView2 stayed far under the 5% gate.
2. The "many Node.js processes" observation is real on this workstation, but
   current process ownership evidence does not attribute them to MUSU. During
   evidence capture, machine-wide Node count was `18`; MUSU-owned Node was `0`.
   After cleanup, the remaining Node processes were Codex/MCP/helper processes,
   not the evidence Next server or MUSU bridge.
3. `musu down` closes a real operator cleanup gap. The product can now stop the
   registered bridge runtime without manual process termination, while refusing
   non-MUSU PIDs.
4. The local developer PATH shadow remains a release-operation caveat. Packaged
   evidence must continue to use the explicit WindowsApps alias until the
   development alias is removed or deprioritized for final operator runs.
5. `musu.pro` is still not a proven P2P transport path. Public website
   deployment and local route probes are not equivalent to owner-scoped live
   relay lease evidence or release-grade two-machine QUIC/TLS route proof.

## Completion Estimate

| Surface | Completion | Current meaning |
|---|---:|---|
| Single-machine Windows beta | ~95% | Current MSIX, CLI cleanup, desktop single-instance, process ownership, smoke, idle CPU, and matrix all pass on `HUGH_SECOND`. |
| Store/operator-gate infrastructure | ~97% | Evidence scripts, action packs, freshness gates, process ownership, and cleanup command are strong; Store submission evidence is still missing. |
| Runtime hardening/optimization | ~78% | Primary idle CPU is clean and recent busy-loop candidates are bounded, but second-PC proof and production P2P transport hardening remain open. |
| Public desktop release readiness | ~73% | Primary evidence is restored; release still waits on second-PC CPU/matrix/route, live P2P, support mailbox, and Store evidence. |
| Full desktop GUI product maturity | ~55% | The Tauri shell is useful as launcher/status/bridge surface; deeper native dashboard and production mesh UX are future work. |

## Next Roadmap

P0 release gates:

1. Run the second-PC release check again from the current operator action pack.
   The return zip must include runtime idle CPU, four-state runtime CPU matrix,
   process attribution, release-check JSON, and route evidence.
2. Import the second-PC return with `-RequireReleaseGateEvidence`; only accept
   CPU gates when evidence is current for the same product version and commit
   freshness rules.
3. Configure production `musu.pro` P2P control-plane storage/auth
   (`KV_REST_API_URL`, `KV_REST_API_TOKEN`,
   `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent), then record passing
   owner-scoped relay lease evidence without `-AllowUnverified`.
4. Capture release-grade multi-device route proof with verified peer identity
   and transport evidence. Do not market internet P2P reliability before this
   passes.
5. Record real `musu@musu.pro` receive/delivery evidence.
6. Prepare Partner Center/Store evidence only after the runtime/P2P/support
   blockers have current proof.

P1 hardening:

- Keep explicit WindowsApps alias usage in packaged evidence commands.
- Keep `musu down --json` in smoke/second-PC cleanup flows.
- Keep mDNS/Tailscale IPv6 send errors downgraded or suppressed only when mDNS
  is explicitly enabled and direct discovery is noncritical.
- Regenerate final operator packet/action pack from the final clean HEAD after
  P0 gates pass.
