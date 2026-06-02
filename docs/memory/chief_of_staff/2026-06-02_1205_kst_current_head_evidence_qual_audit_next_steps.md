# 2026-06-02 12:05 KST - Current-Head Evidence, Qual Audit, and Next Steps

## Durable Decisions

- Public desktop release remains No-Go.
- Current local artifacts are ready enough for controlled RC handoff, but
  public launch still requires second-PC runtime evidence, live `musu.pro`
  P2P control-plane evidence, `musu@musu.pro` mailbox evidence, and Store
  submission evidence.
- Canonical support email remains `musu@musu.pro`; do not reintroduce
  `support@musu.pro`.
- `musu.pro` is the account/control-plane surface. It is not a default payload
  data path and does not prove P2P readiness until owner-scoped live evidence
  passes.

## Evidence Snapshot

- Clean go/no-go on `9b836bd1e5702a4a6b40b30fb7f15b5aa76be05a`:
  `ready=false`, `local_artifacts_ready=true`, `single_machine=true`,
  runtime idle CPU `1/2`, runtime CPU scenario matrix `1/2`,
  `p2p_control_plane=false`, `support_mailbox=false`, `store_release=false`,
  `manifest_dirty=false`.
- Current primary evidence:
  - desktop single-instance:
    `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-113614-HUGH_SECOND.desktop-single-instance.json`
  - process ownership:
    `docs\evidence\process-ownership\1.15.0-rc.1\20260602-113702-HUGH_SECOND.process-ownership.json`
  - single-machine smoke:
    `docs\evidence\single-machine\1.15.0-rc.1\20260602-113759-HUGH_SECOND.evidence.json`
  - desktop-open CPU:
    `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-114149-HUGH_SECOND.desktop-open.evidence.json`
  - four-state matrix:
    `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-115359-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Audit Reading

- The reported primary busy-loop is not reproduced in the current packaged
  desktop evidence. Desktop-open CPU maxes at MUSU `0`, repo Node `0`, and
  WebView2 `0.13` of one logical core.
- The four-state matrix passes with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_115359`, hot process count `0`, and
  all required scenarios.
- Local dev PATH still shadows the WindowsApps alias with
  `C:\Users\empty\.cargo\bin\musu.exe`; release checks should use explicit
  WindowsApps alias or a clean shell.

## Next

1. Import second-PC return evidence to close `2/2` runtime CPU and matrix.
2. Configure and verify live `musu.pro` P2P owner-scoped relay/control auth.
3. Record `musu@musu.pro` send/receive support evidence.
4. Prepare Store/Partner Center evidence only after the external gates pass.

