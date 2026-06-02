# 1.15.0-rc.1 Operator Pack and P2P Recheck

**Date**: 2026-06-03 03:35 KST  
**Wiki ID**: wiki/582  
**Scope**: current operator handoff artifacts, second-PC reachability, hosted P2P control-plane evidence

## Current Head

Current source commit:

- `aaf74ca2df658f6d3523f87caabc49c38c697a00`

Latest CI before this recheck:

- GitHub Actions `Tests` run `26839940335`: success

## Second-PC Reachability

The prior second-PC route target was checked again:

- target: `192.168.1.192:8949`
- interface: `이더넷 2`
- source address: `192.168.1.154`
- `TcpTestSucceeded=false`
- `PingSucceeded=false`

No live two-machine route/CPU/matrix smoke can be captured from this primary
machine until the second PC is reachable again.

## Current Operator Handoff Artifacts

Final operator gate packet:

- `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-033322.zip`
- verifier: `ok=true`, `fail_count=0`, `kit_count=1`
- nested multi-device kit:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-033322\kits\musu-multidevice-1.15.0-rc.1-20260603-033322.zip`

Operator action pack:

- `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353.zip`
- verifier: `ok=true`, `fail_count=0`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-033353.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-033353.zip`

The nested second-PC kit includes MSIX install/verify, runtime idle CPU,
runtime CPU scenario matrix, process attribution, multi-device route evidence,
return-archive, and cleanup evidence tooling.

## Hosted P2P Control-Plane Evidence

Fresh live P2P evidence:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-033453-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-033453-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-033453-musu.pro.summary.md`

Verification result:

- `ok=false`
- `fail_count=4`
- failing checks:
  - evidence does not report `ok=true`
  - relay leases query does not report `ok=true`
  - relay leases owner scope is not verified
  - relay leases query is not owner-scoped

Current env status:

- GitHub has `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- missing `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL`
- missing `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`
- live blocker: `p2p_relay_lease_kv_not_configured`
- `relay_default_data_path=false`

## Qualitative Result

Primary local desktop evidence is current after wiki/581, but public release is
still No-Go. The live remaining blockers are:

- second-PC route/CPU/matrix evidence
- live owner-scoped `musu.pro` KV/Upstash relay lease evidence
- release-grade transport proof
- `musu@musu.pro` mailbox evidence
- Partner Center/Store evidence

The immediate operator action is to run the new second-PC transfer zip above on
the second machine, return its generated archive, provision KV/Upstash for
`musu.pro`, redeploy, and rerun P2P control-plane evidence.

