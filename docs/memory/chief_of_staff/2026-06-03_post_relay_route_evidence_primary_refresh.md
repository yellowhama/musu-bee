# Chief of Staff Memory - Post Relay Route Evidence Primary Refresh - 2026-06-03

Primary-machine runtime evidence was refreshed after P2P relay route evidence
gate hardening commit `aebd9262b217d4b1570a9fdd94ba41192e3f3ee1`.

MSIX workflow:

- `run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting`
- Rust release build passed in `9m 55s`.
- Tauri shell and MSIX packaging passed.
- Installed package remained
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Runtime evidence used the explicit WindowsApps alias because
  `C:\Users\empty\.cargo\bin\musu.exe` still shadows PATH.

Evidence:

- single-machine `20260603-101716-HUGH_SECOND`, dashboard task
  `4e0a38e6-8daf-4435-998c-36590898feb7`,
  output `MUSU_RELEASE_SMOKE_OK_20260603_101654`
- desktop-open CPU `20260603-100903-HUGH_SECOND.desktop-open`,
  `60.069s`, MUSU `0`, Node `0.03`, WebView2 `0.52`, hot `0`,
  working set `496.76MB`, process counts MUSU `2`, Node `1`, WebView2 `6`
- runtime matrix `20260603-101013-HUGH_SECOND.runtime-cpu-scenario-matrix`,
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_101013`, verifier
  `ok=true`, `fail_count=0`

Dirty-tree go/no-go recognized the refreshed primary evidence:
`single_machine_verified=true`, runtime idle CPU valid machines `1`
(`HUGH_SECOND`), and runtime CPU matrix valid machines `1` (`HUGH_SECOND`).
Public release remains No-Go until second-PC route/CPU/matrix, hosted P2P,
support mailbox, and Store evidence pass.

