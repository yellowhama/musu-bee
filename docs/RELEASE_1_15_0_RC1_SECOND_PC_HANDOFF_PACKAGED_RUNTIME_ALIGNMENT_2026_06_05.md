# MUSU 1.15.0-rc.1 Second-PC Handoff Packaged Runtime Alignment

**Wiki ID**: wiki/729
Date: 2026-06-05

## Root Cause

The user-visible `ERR_CONNECTION_REFUSED` at `localhost:3001` was not a failure
of the installed local MUSU program. In the packaged runtime split,
`localhost:3001` is an optional workspace/developer dashboard. The installed
local executor is the WindowsApps `musu.exe` bridge plus desktop shell, and
packaged release checks are valid when `musu up --json` reports
`dashboard.required=false`.

## Change

Commits:

- `1813cc2a` aligned second-PC handoff text with the packaged local runtime /
  web split.
- `034e3639` restored the legacy action-pack gate status label required by
  `verify-operator-action-pack.ps1` while keeping the more precise packaged
  runtime wording.

Updated surfaces:

- `scripts/windows/prepare-operator-action-pack.ps1`
  - second-PC quickstart now states that the installed MUSU package is the
    local executor;
  - `localhost:3001` workspace dashboard is optional and is not required for
    the second-PC release check;
  - the check uses packaged WindowsApps `musu.exe` and records bridge-only
    evidence when `dashboard.required=false`;
  - Partner Center notes describe MUSU as a packaged local runtime with
    optional operator/developer dashboards, not required cloud dashboard access;
  - current action-pack blocker labels include `MSIX install evidence:
    missing` for verifier compatibility.
- `docs/SECOND_PC_MSIX_INSTALL_OPERATOR_RUNBOOK_2026_05_31.md`
  - second-PC instructions no longer imply a workspace Next dashboard must be
    started;
  - bridge-only packaged runtime evidence is explicitly valid when the package
    reports `dashboard.required=false`.

## Generated Operator Artifacts

Clean commit: `034e363988da7f25ea38f6606298d8e232245166`

- Final operator packet:
  `.local-build/final-operator-gates/musu-final-operator-gates-1.15.0-rc.1-20260605-064050.zip`
- Final operator packet latest:
  `.local-build/final-operator-gates/musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- Multi-device kit:
  `.local-build/final-operator-gates/musu-final-operator-gates-1.15.0-rc.1-20260605-064050/kits/musu-multidevice-1.15.0-rc.1-20260605-064050.zip`
- Operator action pack:
  `.local-build/operator-action-pack/MUSU-1.15.0-rc.1-operator-action-pack-20260605-064106.zip`
- Operator action pack latest:
  `.local-build/operator-action-pack/MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- Second-PC transfer:
  `.local-build/operator-action-pack/MUSU-1.15.0-rc.1-operator-action-pack-20260605-064106/second-pc/MUSU-second-PC-transfer-1.15.0-rc.1-20260605-064106.zip`
- Partner Center zip:
  `.local-build/operator-action-pack/MUSU-1.15.0-rc.1-operator-action-pack-20260605-064106/partner-center/MUSU-1.15.0-rc.1-store-submission-20260605-064106.zip`
- Support verification id:
  `musu-store-support-1.15.0-rc.1-20260605-064050`

## Verification

- PowerShell parser passed for `prepare-operator-action-pack.ps1`.
- `git diff --check` passed before the gate-label commit.
- `verify-final-operator-gate-packet.ps1` passed with `ok=true`,
  `fail_count=0`, and `kit_count=1`.
- `verify-operator-action-pack.ps1 -PackPath ...latest.zip` passed with
  `ok=true` and `fail_count=0`.
- Extracted second-PC transfer quickstart checks:
  - `quickstart_exists=true`
  - `has_runtime_boundary=true`
  - `says_localhost_optional=true`
  - `says_dashboard_not_required=true`
  - `says_bridge_only=true`

Final handoff status after regeneration:

- `ready_for_public_desktop_release=false`
- `packet_verified=true`
- `action_pack_verified=true`
- `single_machine_verified=true`
- runtime idle CPU: `1/2`
- runtime CPU scenario matrix: `1/2`
- `multi_device_verified=false`
- `p2p_control_plane_verified=false`
- blockers:
  `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `support-mailbox`, `store-release`, `p2p-control-plane`

## P2P / Second-PC State

`show-musu-pro-p2p-env-status.ps1 -Json` still reports `ok=false`.

- Source store-forward queue fallback is implemented:
  `relay_payload_queue_fallback_implemented=true`.
- Release tunnel endpoints are still missing:
  `relay_connect_endpoint_implemented=false` and
  `relay_payload_endpoint_implemented=false`.
- GitHub secret present:
  `MUSU_P2P_CONTROL_TOKEN_SHA256S`.
- Missing required storage config:
  `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
  `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`.
- P2P blockers remain:
  `source_release_relay_connect_endpoint_not_implemented`,
  `source_release_relay_payload_endpoint_not_implemented`,
  `missing_kv_rest_api_url_or_upstash_redis_rest_url`,
  `missing_kv_rest_api_token_or_upstash_redis_rest_token`,
  `live_evidence_p2p_relay_lease_kv_not_configured`,
  `live_evidence_relay_transport_not_wired`,
  `live_evidence_relay_route_not_proven`, and
  `live_evidence_relay_payload_delivery_proof_missing`.

Second-PC reachability probe:

- `192.168.1.192:8949` returned `TcpTestSucceeded=false`.
- Ping to `192.168.1.192` timed out.

## Release Decision

This closes the handoff/documentation confusion that treated
`localhost:3001` as required for packaged runtime evidence. It does not close
the public desktop release. The remaining public blockers are current-build
second-PC route/CPU/matrix evidence, hosted `musu.pro` P2P KV/release
tunnel/route/payload proof, support mailbox delivery evidence, and Microsoft
Store approval evidence.
