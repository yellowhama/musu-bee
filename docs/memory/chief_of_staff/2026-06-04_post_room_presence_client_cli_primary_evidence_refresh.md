# 2026-06-04 Post Room Presence Client CLI Primary Evidence Refresh

- Rebuilt local-sideload MSIX after room presence client CLI source commit.
- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` passed; HUGH_SECOND still has `.cargo\bin\musu.exe` before
  WindowsApps in PATH, so no new strict MSIX install evidence was recorded from
  that warning-mode state.
- Fresh single-machine smoke was recorded at
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-204006-HUGH_SECOND.evidence.json`
  with dashboard `http://127.0.0.1:3001`, bridge `http://127.0.0.1:11853`,
  output `MUSU_RELEASE_SMOKE_OK_20260604_203939`, and CLI output
  `MUSU_CLI_ROUTE_OK_20260604_203939`.
- Fresh desktop-open CPU evidence was recorded at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-204236-HUGH_SECOND.desktop-open.evidence.json`;
  it passed for `60.012s` from clean git state with MUSU `0`, Node `0`,
  WebView2 `0`, working set `46.55MB`, and hot `0`.
- Fresh five-state runtime CPU matrix was recorded at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-204423-HUGH_SECOND.runtime-cpu-scenario-matrix.json`;
  verifier passed with `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_204423`, and hot `0`.
- Clean go/no-go at `2026-06-04T20:51:42+09:00` on commit `75348c74` restored
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `msix_install_verified=true`, `msix_desktop_entrypoint_verified=true`, and
  `manifest_git.dirty=false`; public release remains No-Go on second-PC,
  hosted P2P, support mailbox, and Store gates.
