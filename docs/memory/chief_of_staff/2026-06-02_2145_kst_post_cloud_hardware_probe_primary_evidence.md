# CoS Memory - Post Cloud Hardware Probe Primary Evidence

Date: 2026-06-02 21:45 KST

## Evidence

After commit `9fff34aa` (`Harden cloud hardware probes`), the
local-sideload-manual MSIX was rebuilt and installed. Runtime release build
took `15m 50s`.

Fresh primary evidence:

- single-machine: `20260602-213655-HUGH_SECOND`
- desktop single-instance: `20260602-213404-HUGH_SECOND`
- process ownership: `20260602-213412-HUGH_SECOND`
- desktop-open CPU: `20260602-213436-HUGH_SECOND`
- runtime CPU matrix: `20260602-213706-HUGH_SECOND`

## Result

- desktop activation passed with final desktop shell count `1`
- process ownership passed: runtime `1`, desktop `1`, owned Node `0`, owned
  WebView2 `6`, bridge `127.0.0.1:7644`
- desktop-open CPU passed: MUSU `0`, Node `0`, WebView2 `0.49`, working set
  `363.18MB`, hot `0`
- single-machine smoke passed with task
  `151efc29-1bd4-4df4-925c-6b1c9d7a88e0`
- runtime matrix passed with token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_213706`
- cleanup stopped bridge PID `32264`, desktop PID `34248`, and the temporary
  dashboard process tree

## Release State

Primary packaged evidence is current again for commit `9fff34aa`, but public
release remains No-Go until second-PC CPU/matrix/route, live P2P owner scope,
`musu@musu.pro`, and Store evidence pass.
