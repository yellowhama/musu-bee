# Chief of Staff Memory: Second-PC Handoff Packaged Runtime Alignment

Date: 2026-06-05

## Debug Report

- Symptom: browser reported `ERR_CONNECTION_REFUSED` for
  `localhost:3001`, creating confusion that the local MUSU program was not
  working.
- Root cause: `localhost:3001` is an optional workspace/developer dashboard,
  not the packaged local MUSU runtime. Packaged runtime health is the
  WindowsApps `musu.exe` bridge plus desktop shell, and bridge-only evidence is
  valid when `dashboard.required=false`.
- Fix: updated the second-PC quickstart, operator action pack, Partner Center
  notes, and second-PC runbook so they do not require a workspace
  `localhost:3001` dashboard.
- Evidence: regenerated final operator packet and operator action pack from
  clean commit `034e363988da7f25ea38f6606298d8e232245166`; both verifiers
  passed with `ok=true` and `fail_count=0`.
- Regression coverage: `verify-operator-action-pack.ps1` now passes on the
  regenerated action pack after restoring the `MSIX install evidence: missing`
  gate label in the generated README.
- Status: DONE_WITH_CONCERNS. The handoff confusion is fixed and verified, but
  public release remains No-Go until second-PC, hosted P2P, support mailbox,
  and Store evidence are complete.

## Current Artifacts

- Final operator packet latest:
  `.local-build/final-operator-gates/musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- Operator action pack latest:
  `.local-build/operator-action-pack/MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- Second-PC transfer:
  `.local-build/operator-action-pack/MUSU-1.15.0-rc.1-operator-action-pack-20260605-064106/second-pc/MUSU-second-PC-transfer-1.15.0-rc.1-20260605-064106.zip`
- Partner Center zip:
  `.local-build/operator-action-pack/MUSU-1.15.0-rc.1-operator-action-pack-20260605-064106/partner-center/MUSU-1.15.0-rc.1-store-submission-20260605-064106.zip`
- Support verification id:
  `musu-store-support-1.15.0-rc.1-20260605-064050`

## Remaining Gates

- Final handoff status: `ready_for_public_desktop_release=false`,
  `packet_verified=true`, `action_pack_verified=true`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime matrix
  `1/2`, `multi_device_verified=false`, and
  `p2p_control_plane_verified=false`.
- Second PC `192.168.1.192:8949` was unreachable:
  `TcpTestSucceeded=false`, ping timed out.
- P2P status remains `ok=false`: store-forward queue fallback is implemented,
  but release tunnel endpoints, production KV/Upstash config, live relay route
  proof, and live payload delivery proof are still missing.
