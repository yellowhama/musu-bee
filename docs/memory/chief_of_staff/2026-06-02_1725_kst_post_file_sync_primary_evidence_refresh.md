# CoS Memory: Post File-Sync Primary Evidence Refresh

Date: 2026-06-02 17:25 KST

After file sync watcher storm hardening commit
`62381f7feec64ff5c6b17cd689b8729197e3a98e`, primary Windows evidence was
refreshed on `HUGH_SECOND`.

Fresh package/runtime:

- release MSIX rebuilt and installed:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- explicit WindowsApps alias `musu up --json` reached bridge health at
  `http://127.0.0.1:8155`
- developer PATH shadowing remains on `HUGH_SECOND`:
  `C:\Users\empty\.cargo\bin\musu.exe` precedes the WindowsApps alias

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-171420-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-171500-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-171500-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-171538-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-171659-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key values:

- single-machine task id:
  `60884022-fa9f-4e81-b0fc-775045bb63d0`
- matrix route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_171659`
- desktop-open CPU: MUSU `0`, repo Node `0.03`, WebView2 `0.57`, hot `0`,
  working set `496.62MB`
- process ownership: runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `7`, machine-wide Node `18`, orphan repo helpers `0`

Qualitative conclusion:

- Primary packaged Windows beta is strong again after the Rust file sync change.
- The reported 20%-of-one-core busy loop is not reproduced on the current
  primary packaged evidence.
- The many-Node observation is real on the host, but current evidence does not
  attribute those Node processes to MUSU-owned helpers.
- Public release remains No-Go until second-PC CPU/matrix/route evidence,
  `musu.pro` owner-scoped P2P evidence, `musu@musu.pro` mailbox evidence, and
  Store evidence are recorded.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_FILE_SYNC_PRIMARY_EVIDENCE_2026_06_02.md`
