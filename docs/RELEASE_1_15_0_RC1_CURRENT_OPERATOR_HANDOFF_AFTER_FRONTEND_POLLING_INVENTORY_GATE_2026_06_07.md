# Release 1.15.0-rc.1 Current Operator Handoff After Frontend Polling Inventory Gate

**Wiki ID**: wiki/951
**Generated**: 2026-06-07T10:15:19+09:00
**Artifact source commit**: `e53810cf365c4c3228cae5a14b373ee8878376fb`

## Summary

After the frontend polling inventory gate landed, the final operator packet and
operator action pack were regenerated from a clean source tree.

This removes the previously documented stale handoff concern: the latest
operator artifacts are no longer from `981f37ac`; they now point at
`e53810cf365c4c3228cae5a14b373ee8878376fb`.

This documentation record is intentionally status-only. It does not change the
runtime, P2P transport, release package, or the generated local artifacts.

## Generated Artifacts

Final operator gate packet:

- root:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260607-101224`
- zip:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260607-101224.zip`
- latest zip:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- nested multi-device kit:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260607-101224\kits\musu-multidevice-1.15.0-rc.1-20260607-101224.zip`

Operator action pack:

- root:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-101255`
- zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-101255.zip`
- latest zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-101255\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260607-101255.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-101255\partner-center\MUSU-1.15.0-rc.1-store-submission-20260607-101255.zip`

Support mailbox:

- support email: `musu@musu.pro`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260607-101224`

## Verification

Commands run:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/prepare-final-operator-gate-packet.ps1 -IncludeDesktopShell -Json`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/verify-final-operator-gate-packet.ps1 -PacketPath .local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip -Json`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/prepare-operator-action-pack.ps1 -Json`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/verify-operator-action-pack.ps1 -PackPath .local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip -Json`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/show-final-release-handoff-status.ps1 -ScriptTimeoutSeconds 120 -Json`

Results:

- final packet prepare: `ok=true`
- final packet verifier: `ok=true`, `fail_count=0`, `kit_count=1`
- action pack prepare: `ok=true`
- action pack verifier: `ok=true`, `fail_count=0`
- handoff status:
  - `ready_for_public_desktop_release=false`
  - packet verified: `true`
  - action pack verified: `true`
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `msix_install_verified=true`
  - `runtime_idle_cpu_valid_machine_count=1`
  - `runtime_cpu_scenario_matrix_valid_machine_count=1`
  - `runtime_cpu_second_pc_route_attempt_verified=true`
  - `multi_device_verified=false`
  - `p2p_control_plane_env_ready=false`
  - `p2p_control_plane_verified=false`
  - `support_mailbox_verified=false`
  - `store_release_verified=false`
  - `manifest_git.dirty=false`

## Product Boundary

The regenerated handoff keeps the product boundary intact:

- MUSU Desktop is the local executor on each device.
- The second-PC transfer installs/runs the packaged local MUSU program.
- MUSU.PRO remains remote input, project/company room, AI meeting room,
  presence, rendezvous, path selection, relay fallback, and evidence/control
  plane.
- `localhost:3001` is not the packaged desktop release contract.
- A failed or missing web dashboard is not a substitute for second-machine
  packaged runtime evidence.

## Remaining No-Go

The handoff artifact is ready for the next physical second-PC run, but public
release remains blocked by:

- real second-PC multi-device route evidence
- second-PC 60s desktop-open idle CPU evidence
- second-PC five-state runtime CPU matrix evidence
- live MUSU.PRO P2P runtime login and owner-scoped storage
- release `quic_relay_tunnel` runtime and payload transport proof
- support mailbox delivery proof
- Store/Partner Center certification proof

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed files: `2887`
- indexed symbols: `2790`
- duration: `30952 ms`
- wiki: `wiki/952`
