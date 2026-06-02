# 2026-06-02 20:10 KST Post Stop/Desktop Cleanup Primary Evidence Refresh

After `musu stop` / `musu down --include-desktop` was committed, the
local-sideload MSIX was rebuilt and installed on `HUGH_SECOND`.

Evidence now restored on the primary machine:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-195914-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-195058-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-195129-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-195140-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-200531-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key observations:

- Desktop activation alone did not start the bridge runtime; explicit packaged
  `musu up --json` is still the current runtime-start contract before
  process/CPU evidence.
- Process ownership passed with MUSU-owned Node `0`, MUSU-owned WebView2 `6`,
  machine-wide Node `16`, and orphan repo helpers `0`.
- Desktop-open CPU passed with MUSU `0`, WebView2 `0.39`, working set
  `362.27MB`, and hot `0`.
- Runtime matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_200531`.
- Packaged `musu down --json --timeout-sec 5 --include-desktop` stopped bridge
  PID `12472` and desktop PID `16460`, with `desktop_pids_after=[]`.

Release remains No-Go: primary evidence is `1/2`, but real second-PC
CPU/matrix/route evidence, live `musu.pro` P2P owner-scope proof,
`musu@musu.pro` mailbox evidence, and Store evidence remain open.
