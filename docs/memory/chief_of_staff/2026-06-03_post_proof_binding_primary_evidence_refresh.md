# 2026-06-03 post proof-binding primary evidence refresh

After relay transport proof binding hardening, current-source primary packaged
evidence was refreshed on `HUGH_SECOND`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-225154-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-225332-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-225507-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_225125`
- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:1037`
- desktop-open CPU `60.039s`, MUSU `0.03`, Node `0.03`, WebView2 `0.6`
- runtime matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_225507`
- matrix max CPU: MUSU `0.44`, Node `0.13`, WebView2 `0.44`
- clean go/no-go on `faef9398` reports single-machine `true`, runtime idle
  CPU `1/2`, runtime CPU matrix `1/2`, and six remaining public release
  blockers

Public release remains blocked by second-PC runtime/multi-device evidence,
hosted relay payload proof, support mailbox evidence, and Store evidence.
