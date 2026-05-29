# CoS Memory - PowerShell Capture + Single-Machine Refresh

2026-05-29 12:55 KST: PowerShell command capture was hardened and single-machine evidence was refreshed.

- Bug found: `smoke-single-machine-beta.ps1` and `collect-second-pc-handoff.ps1` used redirected stdout/stderr pipes plus `ReadToEnd()`, which can hang when a command such as `musu up` leaves inherited handles behind.
- Windows PowerShell 5.1 also leaves `Start-Process -PassThru` `ExitCode` null under redirected-file execution, so the fix uses `Start-Job` with explicit stdout/stderr/exit-code temp files and timeout-bounded `Wait-Job`.
- `collect-second-pc-handoff.ps1 -Json` now passes with `ok=true`, bridge port `4652`, and suggested remote addrs including `192.168.1.154:4652`.
- Clean-commit single-machine smoke passed on commit `cc336b7b6361444a38c817fd6be2a77fb5c37fe9`.
- Current recorded evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260529-125448-HUGH_SECOND.evidence.json`.
- Dashboard task: `ee7c5613-87bf-4d71-95c1-03262b7e44cb`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_1255`.
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_1255`.
