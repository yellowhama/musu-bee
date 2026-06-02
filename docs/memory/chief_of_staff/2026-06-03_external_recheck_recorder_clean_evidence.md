# 2026-06-03 External Recheck Recorder Clean Evidence

Durable memory for MUSU 1.15.0-rc.1 release state.

`scripts\windows\record-external-release-gate-recheck.ps1` now records
`musu.external_release_gate_recheck.v1` evidence for final go/no-go,
second-PC reachability, hosted P2P env status, and live P2P control-plane
evidence in one operator command.

Clean HEAD `d80e929e` generated:

- external evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-050915-HUGH_SECOND.external-gates.evidence.json`
- external summary:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-050915-HUGH_SECOND.external-gates.summary.md`
- P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-051044-musu.pro.evidence.json`
- P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-051044-musu.pro.verification.json`

Result: `release_ready=false`, `local_artifacts_ready=true`,
`single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, second-PC `192.168.1.192:8949` unreachable from source
`192.168.1.154` on `이더넷 2`, and P2P evidence uses
`musu_exe_source=windowsapps_alias`.

P2P remains blocked on `p2p_relay_lease_kv_not_configured`; GitHub has
`MUSU_P2P_CONTROL_TOKEN_SHA256S` but storage env values are still missing:
`KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
`KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`.

Next gates: provision KV/Upstash for `musu.pro`, redeploy, rerun owner-scoped
P2P evidence, recapture second-PC route/CPU/matrix evidence, record
`musu@musu.pro` mailbox delivery proof, and record Microsoft Store / Partner
Center evidence.
