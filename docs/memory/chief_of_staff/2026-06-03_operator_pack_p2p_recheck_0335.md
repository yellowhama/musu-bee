# 2026-06-03 Operator Pack and P2P Recheck 03:35

Current HEAD `aaf74ca2df658f6d3523f87caabc49c38c697a00` has fresh operator
handoff artifacts:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-033322.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-033353.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-033353.zip`

Both verifiers passed with `ok=true` and `fail_count=0`.

Second-PC target `192.168.1.192:8949` remains unreachable from `HUGH_SECOND`
(`TcpTestSucceeded=false`, ping timeout), so live two-machine evidence cannot be
captured in this turn.

Fresh P2P evidence:
`docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-033453-musu.pro.evidence.json`.
Verification fails with `fail_count=4`: relay leases are not ok, owner scope is
not verified, and the leases query is not owner-scoped. Env status still has
only `MUSU_P2P_CONTROL_TOKEN_SHA256S`; missing blockers are
`KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
`KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`. Live detail remains
`p2p_relay_lease_kv_not_configured`; `relay_default_data_path=false`.

