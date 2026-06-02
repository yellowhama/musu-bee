# 2026-06-02 13:40 KST - Post operator security primary evidence refresh

After operator API worker proxy hardening, primary packaged evidence was
regenerated on `HUGH_SECOND`.

Evidence:

- Fresh MSIX workflow succeeded and installed
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Explicit WindowsApps alias `musu up --json` restored bridge health at
  `http://127.0.0.1:1065`.
- Desktop repeated activation passed at
  `.local-build\desktop-single-instance\musu-desktop-single-instance-20260602-132523-HUGH_SECOND.json`.
- Process ownership passed at
  `.local-build\process-ownership\musu-process-ownership-20260602-132447.json`
  with one runtime and zero MUSU-owned Node helpers.
- Single-machine smoke is committed at
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-132814-HUGH_SECOND.evidence.json`.
- Desktop-open CPU is committed at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-132531-HUGH_SECOND.desktop-open.evidence.json`
  with MUSU `0`, owned Node `0`, WebView2 `0.52`, working set `366.38MB`,
  and hot `0`.
- Four-state runtime CPU matrix is committed at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-132921-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_132921`.

Clean go/no-go on `6f7fe937fcc5dd7e9665bf374aee1bdd1be0e48c` reports
`ready=false`, `single_machine=true`, runtime idle CPU `1/2 [HUGH_SECOND]`,
runtime CPU matrix `1/2 [HUGH_SECOND]`, process/startup/desktop
single-instance true, P2P/support/Store false, and `manifest_dirty=false`.

Current handoff artifacts:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-134019.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-134035.zip`

Both final packet and action pack verify with `ok=true`, `fail_count=0`.

Interpretation:

- The primary busy-loop report is not reproduced on current packaged evidence.
- The public release remains No-Go because second-PC CPU/matrix/route,
  KV-backed `musu.pro` P2P owner-scope evidence, `musu@musu.pro` mailbox
  evidence, and Store evidence are still open.
