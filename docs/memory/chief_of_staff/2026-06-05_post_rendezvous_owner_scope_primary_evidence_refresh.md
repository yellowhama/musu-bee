# 2026-06-05 Post Rendezvous Owner-Scope Primary Evidence Refresh

Roadmap decision restated:

- `musu.pro` is the remote input, project room, company meeting room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane.
- Local dashboards stay local-only operator surfaces.
- Installed MUSU programs execute work on each device after receiving
  authenticated web work orders.
- Web-assisted rendezvous should bootstrap direct P2P mesh first; relay remains
  fallback-only.
- Project/company rooms can coordinate multiple local AI agents working on the
  same project, but owner scope is mandatory across room/rendezvous/route/relay
  state.

Fresh evidence restored after source commit
`164072656ad60766cadad267d8aa1c5476618c9d`:

- MSIX workflow passed; installed package
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-014639-HUGH_SECOND.evidence.json`;
  output `MUSU_RELEASE_SMOKE_OK_20260605_014606`.
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-014927-HUGH_SECOND.desktop-open.evidence.json`;
  MUSU `0.21`, Node `0.03`, WebView2 `0.34`, working set `450.8MB`,
  hot `0`.
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-015132-HUGH_SECOND.runtime-cpu-scenario-matrix.json`;
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_015132`, verifier
  `ok=true`, `fail_count=0`, max working set `454.36MB`, hot `0`.

Go/no-go result:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `ready_for_public_desktop_release=false`

Remaining blockers:

- second-PC install/runtime/multi-device evidence
- hosted `musu.pro` P2P control-plane proof
- release-grade relay connect/payload/delivery proof
- support mailbox evidence
- Store evidence

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RENDEZVOUS_OWNER_SCOPE_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`
