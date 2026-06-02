# 2026-06-02 20:45 KST Post Desktop Autostart Primary Evidence

After Tauri desktop runtime autostart was committed, the local-sideload MSIX was
rebuilt and installed on `HUGH_SECOND`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-204104-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-203815-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-203833-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-203858-HUGH_SECOND.desktop-open.evidence.json`
- runtime matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-204112-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- Desktop activation now leaves runtime `1` and desktop `1` without manual
  `musu up`.
- Bridge is `127.0.0.1:14805`, `/health` HTTP 200, PID `36620`.
- Runtime path is the installed package sibling `musu.exe`, not the cargo alias.
- Owned Node `0`, owned WebView2 `6`, machine-wide Node `16`.
- Desktop-open CPU: MUSU `0`, WebView2 `0.42`, working set `364.02MB`, hot `0`.
- Matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_204112`.

Release remains No-Go until second-PC CPU/matrix/route evidence, live
`musu.pro` P2P owner-scope proof, `musu@musu.pro` mailbox evidence, and Store
evidence are recorded.
