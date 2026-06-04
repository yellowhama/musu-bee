# 2026-06-04 Post Room Work-Order API Primary Evidence Refresh

- After `POST /api/rooms/[roomId]/work-orders`, rebuilt and installed the
  local-sideload MSIX for current source.
- `install-and-verify-msix.ps1` passed for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- HUGH_SECOND now has developer alias shadowing from
  `C:\Users\empty\.cargo\bin\musu.exe`; the fresh warning-mode MSIX capture is
  diagnostic-only in `.local-build`, not canonical release evidence.
- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-175043-HUGH_SECOND.evidence.json`.
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-175223-HUGH_SECOND.desktop-open.evidence.json`.
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-175413-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
- Clean go/no-go on `b3776f0c`:
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `msix_install_verified=true`, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime
  CPU matrix `1/2 [HUGH_SECOND]`, `p2p_control_plane_verified=false`,
  `multi_device_verified=false`, `manifest_git.dirty=false`, blocker count `6`.
- Product interpretation remains local-executor first: `musu.pro` accepts room
  work orders and coordinates rendezvous/evidence; local MUSU programs execute
  work and still need second-PC current-build evidence.
