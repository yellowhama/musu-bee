# 2026-06-05 Post Relay Connect Auth Primary Evidence Refresh

After commit `68cc6f27407c68f1e0aac6615e21f86d19495568`, rebuilt and
reinstalled the local-sideload MSIX, then refreshed primary packaged evidence on
`HUGH_SECOND`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-000624-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-000707-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-000820-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key metrics:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260605_000551`
- desktop-open CPU `60.054s`: MUSU `0`, Node `0.05`, WebView2 `0.52`,
  owned WebView2 `6`, working set `497.9MB`, hot `0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_000820`
- matrix verifier `ok=true`, `fail_count=0`
- handoff status recognizes primary runtime idle CPU and matrix as valid on
  `HUGH_SECOND`, still `1/2`

Roadmap decision recorded:

- `musu.pro` is the web control plane for orders, rooms, presence, rendezvous,
  path selection, relay fallback coordination, and evidence.
- Local MUSU programs on each device execute the work and prefer P2P mesh after
  web-assisted rendezvous.
- Current validation is still one-machine only; another PC must install the
  current build before multi-device release gates can close.

