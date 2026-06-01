# CoS Memory - Post CPU Matrix Current Evidence

Date: 2026-06-01 10:20 KST

After committing the runtime CPU scenario matrix (`9d39ab2`), release evidence
became stale for the new HEAD. Primary current evidence was refreshed:

- single-machine smoke canonical evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-101859-HUGH_SECOND.evidence.json`
- single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-101859-HUGH_SECOND.verification.json`
- single-machine result: `ok=true`, commit
  `9d39ab2f7a02aca75beaaeb5d35198d850bbad98`, dashboard task
  `fae480fc-b2e4-4c4f-b5f9-7c452c6e0ec5`, bridge
  `http://127.0.0.1:1126`, dashboard output
  `MUSU_RELEASE_SMOKE_OK_20260601_101833`, CLI route output
  `MUSU_CLI_ROUTE_OK_20260601_101833`
- primary desktop-open CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-101541-HUGH_SECOND.desktop-open.evidence.json`
- CPU result: `ok=true`, commit
  `9d39ab2f7a02aca75beaaeb5d35198d850bbad98`, `git_dirty=false`,
  60.032s sample, one `musu-desktop`, six owned WebView2 helpers, owned Node
  `0`, max one-core CPU `musu=0`, `webview2=0.13`, working set `342.44MB`,
  private memory `184.04MB`

Go/no-go after these uncommitted evidence files reports
`single_machine_verified=true`, `runtime_idle_cpu_verified=false`,
`runtime_idle_cpu_valid_machine_count=1`, `runtime_idle_cpu_min_machine_count=2`,
`runtime_idle_cpu_valid_machines=[HUGH_SECOND]`, and `manifest_dirty=true`.
Public release remains blocked by real second-PC multi-device evidence,
second-PC desktop-open CPU evidence, `musu@musu.pro` inbox proof, and
Partner Center/Store evidence.
