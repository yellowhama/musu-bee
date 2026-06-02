# 2026-06-03 Post Forwarded-Task Audit Primary Evidence

Source commit `c25c109ee579dbe042f8706b9af4f0e56fd941ca` has fresh packaged
primary evidence after Rust forwarded-task target audit hardening.

Evidence paths:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-001225-HUGH_SECOND.evidence.json`
- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-000306-HUGH_SECOND.desktop-single-instance.json`
- `docs\evidence\process-ownership\1.15.0-rc.1\20260603-000306-HUGH_SECOND.process-ownership.json`
- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-001200-HUGH_SECOND.desktop-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-001416-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key results:

- MSIX rebuilt/installed as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine smoke task `17241539-c53f-4bd1-b605-89546902f89f` passed via
  bridge `http://127.0.0.1:8738`; CLI route checked.
- Desktop repeated activation passed with one shell: before `0`, after `1`,
  new `1`, final PID `37424`.
- Process ownership passed: runtime `1`, desktop `1`, MUSU-owned Node `0`,
  owned WebView2 `6`, machine-wide Node `19`, orphan repo helpers `0`, bridge
  PID `35804` health HTTP `200`.
- Desktop-open CPU passed: 60.059s, MUSU `0.03`, Node `0`, WebView2 `0.08`,
  working set `454.06MB`, private memory `265.8MB`, hot `0`.
- Runtime matrix route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_001416`; all four scenarios passed.

Qualitative assessment: primary-machine busy-loop is not reproduced on current
packaged evidence. The public release remains No-Go because second-PC
CPU/matrix/route, production `musu.pro` owner-scoped P2P control-plane,
`musu@musu.pro` mailbox, and Store evidence are still missing.
