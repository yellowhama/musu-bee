# MUSU 1.15.0-rc.1 Qualitative Audit and Next Steps

**Wiki ID**: wiki/540
**Date**: 2026-06-02 08:40 KST
**Status**: Current assessment after frontend polling timeout hardening, fresh
local-sideload MSIX build/install, packaged desktop evidence, process ownership
evidence, single-machine smoke, desktop-open CPU evidence, and four-state CPU
matrix evidence.

## Verdict

MUSU is **single-machine Windows beta usable** on the current primary machine.
It is still **No-Go for public desktop release**.

The operator-reported one-core busy-loop pattern is not reproduced in the
current `HUGH_SECOND` packaged desktop evidence. The remaining release risk is
not "the current primary app is burning CPU while idle"; it is that the same
proof is still missing on the second PC, production `musu.pro` P2P evidence is
still failing, and Store/support evidence is not recorded yet.

## Current Evidence

Source commit for the clean runtime samples:
`22ba6c313dea4dd32ae43a46dca424b3443edf85`.

- MSIX build/install: fresh `local-sideload-manual` package
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
  built, signed, installed, and verified as
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Desktop repeated activation:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-0832-HUGH_SECOND.desktop-single-instance.json`
  passed with repeat count `3`, before `1`, after `1`, and new desktop shells
  `0`.
- Process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-0832-HUGH_SECOND.process-ownership.json`
  passed with one MUSU runtime, one desktop shell, zero MUSU-owned Node
  helpers, six owned WebView2 helpers, and bridge health HTTP 200 at
  `127.0.0.1:9967`.
- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-083131-HUGH_SECOND.evidence.json`
  passed against `http://127.0.0.1:3001`, task
  `4ae56776-f54d-4955-98cb-d6774626d072`, bridge `http://127.0.0.1:9967`,
  output `MUSU_RELEASE_SMOKE_OK_20260602_083131`, and CLI route checked.
- Desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-0833-HUGH_SECOND.desktop-open.evidence.json`
  passed with `git_dirty=false`, 60.063s sample, MUSU `2`, repo-related Node
  `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0.08`,
  `webview2=0.34`, working set `498.42MB`, private memory `329MB`, and no
  hot processes.
- Four-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-083314-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed for `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`. The route token was
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_083314`; all scenarios were
  `git_dirty=false`, 60s+, and under the 5%-of-one-logical-core budget.

## Code Audit

Findings:

1. **Primary busy-loop not reproduced**. In the current packaged desktop sample,
   MUSU runtime and desktop stayed at `0%` of one logical core; WebView2 peaked
   at `0.34%`.
2. **Machine-wide Node count is not a MUSU-owned leak**. The process ownership
   audit saw 18 machine-wide Node processes while the evidence dashboard was
   running, but MUSU-owned Node was `0` and repo-related orphan helpers were
   `0`. The test-only Next server was stopped after evidence capture.
3. **Local PATH alias shadow remains an operator-environment issue**.
   `C:\Users\empty\.cargo\bin\musu.exe` can shadow the WindowsApps alias in
   this development shell. Evidence that must exercise the packaged app should
   call `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe` or clean
   the old dev alias before final operator runs.
4. **Stale bridge registry is recoverable but should stay on the hardening
   list**. A first process-ownership attempt found a dead bridge PID in
   `~\.musu\services\bridge.json`; `musu up --json` repaired it and subsequent
   ownership evidence passed.
5. **Frontend polling is better bounded, not magically complete**.
   `useLowDutyPolling` task timeouts reduce hidden-tab/offline-fetch risk, and
   current runtime evidence supports that the primary packaged desktop is idle.
   The second PC still needs the same proof.

## Completion Estimate

| Surface | Completion | Reason |
|---|---:|---|
| Single-machine Windows beta | ~94% | Current packaged MSIX, desktop single-instance, process ownership, smoke, idle CPU, and CPU matrix all pass on `HUGH_SECOND`. |
| Store/operator-gate infrastructure | ~96% | MSIX workflow, evidence gates, action packs, verifier regression harness, process attribution, and release freshness logic are in place. |
| Public desktop release readiness | ~72% | Primary evidence is current again, but second-PC CPU/matrix/route, live `musu.pro` P2P KV-backed evidence, `musu@musu.pro`, and Store evidence remain open. |
| Full desktop GUI product maturity | ~55% | The Tauri app is a reliable launcher/status shell; the full native desktop dashboard and production P2P transport are still future work. |

## Next Roadmap

P0:

1. Run the current second-PC release check again and require the return zip to
   include runtime idle CPU, CPU scenario matrix, process attribution, and
   release-check JSON.
2. Import the second-PC return with `-RequireReleaseGateEvidence`; expect CPU
   gates to close only if both machines are current and clean.
3. Provision production KV/Upstash values for `musu.pro` P2P relay leases, then
   record passing owner-scoped control-plane evidence with
   `relay_default_data_path=false`.
4. Capture release-grade multi-device route evidence with verified peer identity
   and QUIC/TLS transport proof.
5. Record `musu@musu.pro` receive/delivery evidence.
6. Record Partner Center name/submission/certification/restricted-capability
   evidence.

P1:

- Add an operator preflight for WindowsApps alias shadowing.
- Keep stale bridge registry cleanup visible in desktop/startup status.
- Continue suppressing or downgrading expected mDNS/Tailscale IPv6 send errors
  when mDNS is explicitly enabled.
- Regenerate final operator packet/action pack from the final clean HEAD after
  P0 evidence is complete.
