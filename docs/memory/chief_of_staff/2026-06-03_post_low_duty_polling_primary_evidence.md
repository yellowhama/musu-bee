# 2026-06-03 Post Low-Duty Polling Primary Evidence

After frontend low-duty polling default-timeout hardening, the local-sideload
MSIX was rebuilt/replaced and current primary evidence was refreshed on
`HUGH_SECOND`.

Current clean evidence commit: `335f2836473137e2fae06f1f8ce0b0fc198678a9`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-031050-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-031229-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-031234-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-031248-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-031911-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result: local primary evidence is back to single-machine `true`, runtime idle
CPU `1/2`, runtime CPU matrix `1/2`, process ownership `true`, and desktop
single-instance `true`. Desktop-open CPU reports MUSU `0.03`, Node `0.05`,
WebView2 `0.6`, working set `499.66MB`, and hot `0`. Matrix route token is
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_031911`.

mDNS regression also passed: targeted tests 3/3 and debug `musu discover
--timeout 2` with opt-in env vars unset emitted no `Failed to send`,
`ff02::fb`, `10065`, or `closed channel`; it disabled 9 virtual/VPN interfaces
and sent only on physical `이더넷 2`.

Public release remains No-Go on second-PC CPU/matrix/route, live owner-scoped
P2P KV/Upstash evidence, release-grade transport proof, `musu@musu.pro`
mailbox evidence, and Store evidence.

