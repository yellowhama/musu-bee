# CoS Memory: Post Stop/Down Primary Evidence Refresh

Date: 2026-06-02 18:20 KST

After adding `musu stop` / `musu down` in commit
`d6f37ed58d543b5e98b4d71ce1b0b07405a730e3`, the release MSIX was rebuilt and
installed again on `HUGH_SECOND`.

Current primary evidence:

- single-machine:
  `docs/evidence/single-machine/1.15.0-rc.1/20260602-183133-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs/evidence/desktop-single-instance/1.15.0-rc.1/20260602-183056-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.1/20260602-183056-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260602-183056-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260602-183240-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key results:

- packaged `musu down --json` emitted `musu.stop_report.v1` and stopped the
  registered bridge with `registry_deregistered=true` and
  `pid_alive_after=false`
- single-machine task id:
  `74e0a4fa-64ce-4463-a288-7b4ed2f7ba3a`
- bridge:
  `http://127.0.0.1:2890`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_183240`
- desktop-open CPU:
  MUSU `0`, repo Node `0.03`, WebView2 `0`, working set `497.57MB`, hot `0`
- process ownership:
  runtime `1`, desktop `1`, MUSU-owned Node `0`, MUSU-owned WebView2 `6`,
  machine-wide Node `18`, orphan repo helpers `0`

Qualitative result:

- Primary busy-loop is not reproduced on the current packaged build.
- Machine-wide Node count remains real but is not attributed to MUSU-owned
  helpers in current evidence.
- Public release remains No-Go until second-PC CPU/matrix/route evidence, live
  `musu.pro` owner-scoped P2P evidence, `musu@musu.pro` mailbox evidence, and
  Store evidence pass.

Canonical report:

- `docs/RELEASE_1_15_0_RC1_POST_STOP_COMMAND_PRIMARY_EVIDENCE_2026_06_02.md`
