# MUSU 1.15.0-rc.1 Post Stop/Desktop Cleanup Primary Evidence

Recorded on 2026-06-02 KST after `musu stop` / `musu down` gained
`--include-desktop`.

## Summary

The stop/desktop cleanup source change was rebuilt into the local-sideload MSIX,
installed, and retested on `HUGH_SECOND`. Current primary Windows evidence is
restored to one machine.

Public desktop release remains No-Go because the release still requires
second-PC CPU/matrix/route evidence, live `musu.pro` P2P control-plane evidence,
`musu@musu.pro` mailbox evidence, and Partner Center / Microsoft Store evidence.

## Current Evidence

- MSIX build: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-195914-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-195058-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-195129-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-195140-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-200531-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

- MSIX release build completed and produced the local-sideload package
  successfully.
- Install/replace succeeded through `scripts\windows\install-msix.ps1`.
- Repeated packaged desktop activation passed: three Start-menu activations
  left one final `musu-desktop.exe` shell.
- Process ownership passed after explicit packaged `musu up --json`: runtime
  `1`, desktop `1`, MUSU-owned Node `0`, MUSU-owned WebView2 `6`,
  machine-wide Node `16`, orphan repo helpers `0`.
- `desktop-open` CPU passed for 60.056s with MUSU `0`, WebView2 `0.39`, owned
  Node `0`, total working set `362.27MB`, and no hot processes.
- Four-state matrix passed from clean git state with dashboard URL
  `http://127.0.0.1:3001/app`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_200531`, and all scenarios under the
  5%-of-one-core budget.
- Packaged cleanup with
  `musu down --json --timeout-sec 5 --include-desktop` stopped bridge PID
  `12472` and desktop PID `16460`, deregistered the bridge, and ended with
  `desktop_pids_after=[]`.

## Audit Notes

- Initial process ownership audit failed before `musu up` because desktop
  activation alone left the bridge runtime at `0`. Current evidence therefore
  treats packaged `musu up --json` as the runtime-start contract before
  process/CPU gates. If desktop UX should auto-start the bridge, that is a
  separate product decision and hardening item.
- Machine-wide Node.js process count remains high on this workstation, but the
  attribution audit and CPU sampler both report MUSU-owned Node `0` after the
  cleanup run. The visible Node count is not currently a MUSU-owned leak.
- The scoped code audit found no new correctness issue in the stop/desktop
  cleanup implementation. Residual risk is integration coverage: the
  source-level unit tests cover process-name matching/enumeration paths, while
  the packaged smoke proves the installed command can stop one real desktop
  shell on `HUGH_SECOND`; second-PC evidence is still required.

## Go/No-Go

`write-release-go-no-go.ps1 -Json` after the clean matrix reports:

- `ready=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `process_ownership_verified=true`
- `desktop_single_instance_verified=true`
- `manifest_dirty=false`

Remaining blockers:

- real second-PC multi-device evidence
- runtime idle CPU evidence on at least two machines
- runtime CPU scenario matrix evidence on at least two machines
- live `https://musu.pro` owner-scoped P2P relay/control-plane evidence
- `musu@musu.pro` delivery evidence
- Partner Center / Microsoft Store evidence

## Next Steps

1. Send the current second-PC transfer kit to the real second Windows PC and run
   the one-command release check without CPU/matrix skips.
2. Configure production `musu.pro` P2P control-plane storage/auth and record
   live owner-scoped relay evidence without `-AllowUnverified`.
3. Record `musu@musu.pro` inbox delivery evidence.
4. Prepare Partner Center reservation/submission/certification evidence.
5. Rebuild the MSIX after the desktop runtime autostart hardening and prove that
   desktop activation starts or reuses the bridge runtime without a separate
   manual `musu up`.
