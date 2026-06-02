# 2026-06-03 Primary Evidence Refresh After Relay Store Status

Fresh primary-machine release evidence was recorded after the relay lease store
status live P2P pass.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-062456-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-062633-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-063400-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- single-machine smoke passed with task
  `5fa8a73b-3d0b-4976-b234-0b9d256827c6` and output
  `MUSU_RELEASE_SMOKE_OK_20260603_062433`
- desktop-open idle CPU passed for 60s with MUSU `0`, Node `0.05`,
  WebView2 `0.31`, working set `501.98MB`, and hot process count `0`
- four-state runtime matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_063400`
- clean go/no-go on HEAD `85dec851` reports `local_artifacts_ready=True` and
  `single_machine_verified=True`

Public release remains No-Go because second-PC multi-device evidence, second-PC
CPU/matrix evidence, `musu.pro` owner-scoped KV/Upstash relay lease evidence,
`musu@musu.pro` mailbox evidence, and Partner Center/Store evidence are still
missing.

Interpretation: local primary runtime quality is currently acceptable, but the
product is not public-release ready. The next high-value work is second-PC
release evidence and hosted `musu.pro` KV/Upstash provisioning.
