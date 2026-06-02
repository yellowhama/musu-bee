# MUSU 1.15.0-rc.1 Operator Pack and P2P Recheck

Date: 2026-06-03 02:40 KST
Source commit: `f83174fb72873d21119a6f8b59a422e2c719108b`

## Result

The current-head operator handoff artifacts were regenerated and verified.
This moves the second-PC release gate forward operationally: there is now a
fresh transfer zip that matches the latest primary evidence and documentation.

Public release remains **No-Go** because the external evidence gates are still
open.

## Generated Artifacts

Final operator gate packet:

- packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-023702.zip`
- latest alias:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- multi-device kit inside packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-023702\kits\musu-multidevice-1.15.0-rc.1-20260603-023702.zip`
- verification: `ok=true`, `fail_count=0`, `kit_count=1`

Operator action pack:

- pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727.zip`
- latest alias:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-023727.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-023727.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260603-023702`
- verification: `ok=true`, `fail_count=0`

The action-pack verifier confirms the nested second-PC kit contains:

- `run-second-pc-release-check.ps1`
- `measure-musu-idle-cpu.ps1`
- `measure-musu-runtime-cpu-scenarios.ps1`
- `verify-runtime-cpu-scenario-matrix.ps1`
- process attribution tools
- return-archive instructions and cleanup evidence instructions

## P2P Recheck

`show-musu-pro-p2p-env-status.ps1 -Json` still reports `ok=false`.

Current blocker state:

- GitHub has `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- missing storage URL name:
  `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL`
- missing storage token name:
  `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`
- live evidence blocker:
  `live_evidence_p2p_relay_lease_kv_not_configured`

Fresh live evidence was recorded with `-AllowUnverified`:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-023834-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-023834-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-023834-musu.pro.summary.md`
- evidence result: `ok=false`
- verification: `fail_count=4`
- relay status: logged in, rendezvous wired, route-evidence client wired,
  relay lease control-plane wired, runtime fallback lease request wired
- release transport requirement: `quic_tls_1_3`
- relay default data path: `false`
- relay leases: `ok=false`
- owner scope: `owner_scope_verified=false`, `owner_scoped=false`
- live error detail: `p2p_relay_lease_kv_not_configured`

## Code Audit

No code was changed in this pass.

The regenerated pack verifies that the current handoff flow includes the
release-gate scripts needed for the operator's three problem areas:

- CPU/resource budget: idle CPU and four-state CPU matrix tools are present.
- P2P control plane: recorder/verifier/configurator scripts are present.
- Hardening: process ownership, startup/single-instance, MSIX install, support,
  Store, and go/no-go scripts are present.

The remaining P2P issue is not a local code-path gap in this pass. The live
server still lacks KV/Upstash storage env values, so it cannot prove
owner-scoped relay lease queries.

## Next Action

1. Send or run
   `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-023727.zip`
   on the second PC.
2. Provision `KV_REST_API_URL`/`KV_REST_API_TOKEN` or
   `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, deploy `musu.pro`, then
   rerun P2P evidence without `-AllowUnverified`.
3. Record `musu@musu.pro` mailbox evidence and Partner Center evidence after
   runtime/P2P gates are closed.
