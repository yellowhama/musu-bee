# 2026-06-07 KST - process/startup/desktop single-instance recheck index refresh

MUSU local indexer was refreshed after the process, startup, and desktop
single-instance recheck documentation and evidence promotion.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- indexed files: `2919`
- indexed symbols: `2790`
- duration: `15387 ms`

Indexed context includes:

- `docs\RELEASE_1_15_0_RC1_PROCESS_STARTUP_DESKTOP_SINGLE_INSTANCE_RECHECK_2026_06_07.md`
- `docs\evidence\process-ownership\1.15.0-rc.1\20260607-115103-HUGH_SECOND.process-ownership.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-115104-HUGH_SECOND.startup-single-instance.json`
- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-115149-HUGH_SECOND.desktop-single-instance.json`
- BETA checklist, runtime stabilization plan, WIKI, WIKI_INDEX, GOAL, and CoS
  memory updates.

Search terms: `GOAL v793`, `wiki/968`, `process startup desktop
single-instance recheck index refresh`, `2919 files`, `2790 symbols`,
`15387 ms`, `bridge PID 34860`, `desktop PID 24144`,
`owned WebView2 6`.
