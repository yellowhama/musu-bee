# 2026-06-03 Post Fleet SSE Primary Evidence Refresh

After Fleet SSE lifecycle hardening, primary-machine evidence was refreshed for
MUSU 1.15.0-rc.1.

Durable facts:

- local-sideload MSIX rebuilt:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- explicit packaged alias used for runtime evidence:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- single-machine evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-073941-HUGH_SECOND.evidence.json`
- desktop-open CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-074231-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-074415-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_074415`

Results:

- single-machine smoke passed with dashboard task
  `595585da-e3c5-43f4-8468-d1cec100133a`
- desktop-open CPU passed for `60.061s`: MUSU `0`, Node `0.05`,
  WebView2 `0.16`, working set `500.12MB`, hot `0`
- runtime matrix passed all four scenarios; maximum WebView2 one-core CPU was
  `0.16`
- clean go/no-go on `0428c20020a5fbd0331e3aa6ed2ae319e54348d0` reports
  `local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle
  CPU valid machines `1`, runtime CPU matrix valid machines `1`, and
  `manifest_git.dirty=false`

Caveat:

- `capture-msix-install-evidence.ps1` still fails on HUGH_SECOND because PATH
  resolves `C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias.
  The installed package verification passed, but no new MSIX install evidence
  was recorded to docs in this pass.

Release state:

- local primary evidence is restored
- public release remains No-Go until second-PC CPU/matrix/route, live
  `musu.pro` KV/Upstash owner scope, relay payload transport, `musu@musu.pro`,
  and Store evidence are recorded

Canonical report:

- `docs/RELEASE_1_15_0_RC1_POST_FLEET_SSE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`
