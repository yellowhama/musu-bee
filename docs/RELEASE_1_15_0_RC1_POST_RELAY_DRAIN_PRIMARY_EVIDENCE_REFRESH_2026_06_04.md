# MUSU 1.15.0-rc.1 Post Relay-Drain Primary Evidence Refresh

Recorded at: 2026-06-04 09:38 KST

## Summary

After the relay payload drain route-evidence source change, the local-sideload
MSIX was rebuilt, installed, and primary-machine evidence was refreshed on
`HUGH_SECOND`.

The primary machine is healthy again:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- packaged bridge smoke passed through `http://127.0.0.1:3001`
- packaged `desktop-open` CPU passed with owned WebView2 attribution
- five-state runtime CPU matrix passed verifier with a successful post-route
  probe

Public desktop release remains No-Go because the release gate still requires
second-PC runtime/multi-device evidence, live `musu.pro` relay proof, support
mailbox evidence, and Store/Partner Center evidence.

## PATH / Alias Fix

The local developer PATH previously resolved
`C:\Users\empty\.cargo\bin\musu.exe` before the packaged WindowsApps alias.
That made strict MSIX install verification fail.

The User PATH order was changed so
`C:\Users\empty\AppData\Local\Microsoft\WindowsApps` appears before
`C:\Users\empty\.cargo\bin`. No developer binary was deleted.

Strict MSIX evidence now records:

- `alias_shadowing_mode=fail`
- `first_alias_path=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `alias_shadowing_count=0`
- `legacy_conflict_count=0`

## Evidence

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-093646-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-092446-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-092544-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-092758-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The earlier same-session smoke evidence
`20260604-092004-HUGH_SECOND` was removed because it was captured while an old
repo debug bridge was still registered. The replacement smoke evidence above
was captured after `musu stop --include-desktop`; process inspection confirmed
the active bridge path was
`C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6\musu.exe`.

## Primary Results

Single-machine smoke:

- dashboard: `http://127.0.0.1:3001`
- bridge: `http://127.0.0.1:3049`
- task: `6301345b-5163-41dc-a7ae-a7d3cd552360`
- output: `MUSU_RELEASE_SMOKE_OK_20260604_092419`
- CLI route checked: `true`

Desktop-open CPU:

- sample: `60.071s`
- process counts: MUSU `2`, Node `1`, WebView2 `6`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.57`
- working set: `506.43MB`
- hot processes: `0`

Runtime CPU matrix:

- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_092758`
- startup-open max CPU: MUSU `0.03`, Node `0.10`, WebView2 `1.41`
- runtime-started max CPU: MUSU `0`, Node `0.03`, WebView2 `0.70`
- dashboard-open max CPU: MUSU `0`, Node `0.03`, WebView2 `0.03`
- desktop-open max CPU: MUSU `0`, Node `0.05`, WebView2 `0`
- post-route max CPU: MUSU `0`, Node `0`, WebView2 `0.08`
- max working set across matrix: `508.66MB`
- hot processes: `0` in all scenarios

## Go / No-Go

Clean go/no-go on commit `83e7e5db06cb2706f2350683a78f67c00f461e37` at
`2026-06-04T09:38:22.5458613+09:00` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `multi_device_verified=false`
- `runtime_idle_cpu_verified=false`
- `runtime_cpu_scenario_matrix_verified=false`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git.dirty=false`

The runtime CPU gates are false because the public release requires at least
two machines. The primary machine is now one passing machine; second-PC evidence
is still missing.

Remaining blockers:

- real second-PC multi-device evidence
- second-PC `desktop-open` CPU evidence
- second-PC five-state runtime CPU matrix evidence
- live `https://musu.pro` owner-scoped relay lease/storage, relay transport,
  relay route evidence, and relay payload delivery proof
- `musu@musu.pro` delivery evidence
- Partner Center / Microsoft Store evidence
