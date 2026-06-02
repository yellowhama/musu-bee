# 2026-06-03 Operator Pack and P2P Recheck

Current-head final operator packet and action pack were regenerated from clean
commit `f83174fb`.

Artifacts:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-023702.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-023727.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-023727.zip`

Both verifiers passed with `ok=true` and `fail_count=0`.

P2P env recheck still reports missing
`KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
`KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`. Fresh live P2P evidence
`docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-023834-musu.pro.evidence.json`
is intentionally failing: relay status is logged-in/wired and
`relay_default_data_path=false`, but relay leases are `ok=false`, owner scope
is false, and the live detail is `p2p_relay_lease_kv_not_configured`.
