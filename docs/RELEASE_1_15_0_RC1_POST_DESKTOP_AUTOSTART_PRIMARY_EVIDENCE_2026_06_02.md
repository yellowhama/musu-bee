# MUSU 1.15.0-rc.1 Post Desktop Autostart Primary Evidence

Recorded on 2026-06-02 KST after the Tauri desktop shell gained runtime
autostart and packaged sibling `musu.exe` resolution.

## Summary

The local-sideload MSIX was rebuilt and installed from commit
`47bc8f8dd502e9fa884799ceb57db30778a3831c`. Desktop activation now starts or
reuses the bridge runtime without a separate manual `musu up`.

Public desktop release remains No-Go because only the primary Windows machine is
green. The release still requires second-PC CPU/matrix/route evidence, live
`musu.pro` P2P owner-scope evidence, `musu@musu.pro` mailbox evidence, and Store
evidence.

## Current Evidence

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-204104-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-203815-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-203833-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-203858-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-204112-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

- Desktop repeated activation passed: three activations left one
  `musu-desktop.exe` shell.
- Process ownership passed immediately after desktop activation without manual
  `musu up`: runtime `1`, desktop `1`, MUSU-owned Node `0`, MUSU-owned WebView2
  `6`, machine-wide Node `16`, orphan repo helpers `0`.
- Bridge registry was created by autostart:
  `C:\Users\empty\.musu\services\bridge.json`, PID `36620`,
  `127.0.0.1:14805`, `/health` HTTP 200.
- Runtime path was the installed package runtime:
  `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6\musu.exe`.
- `desktop-open` CPU passed for 60.058s with MUSU `0`, WebView2 `0.42`, owned
  Node `0`, total working set `364.02MB`, and hot process count `0`.
- Single-machine smoke passed with dashboard task
  `515deac3-bf69-47e3-9b33-c076f3e04d0e`, bridge
  `http://127.0.0.1:14805`, and CLI route checked.
- Four-state runtime matrix passed from clean git state with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_204112`; all scenarios stayed below
  the 5%-of-one-core CPU budget.
- Packaged cleanup with
  `musu down --json --timeout-sec 5 --include-desktop` stopped bridge PID
  `36620` and desktop PID `3880`, deregistered the bridge, and ended with
  `desktop_pids_after=[]`.

## Qualitative Audit

- The prior shell-only activation gap is closed on the primary Windows package.
- The known developer alias shadowing risk is reduced because the runtime path
  observed in evidence is the package sibling `musu.exe`.
- The busy-loop report is not reproduced after autostart: bridge runtime and
  WebView2 remain well below the idle CPU budget.
- Machine-wide Node remains visible, but MUSU-owned Node remains `0`.

## Remaining Work

- Run the same current second-PC release check on a real second Windows machine.
- Record release-grade multi-device route evidence.
- Configure and verify live `musu.pro` P2P control-plane owner-scoped relay
  evidence.
- Record `musu@musu.pro` mailbox delivery evidence.
- Record Partner Center / Microsoft Store evidence.
