# 2026-06-02 04:18 KST - P2P auth deploy moved blocker to KV storage

Commit `3be37e54a30bbd0bee95e9b2e22ce27d0450846c` added production deploy
sync for `MUSU_P2P_CONTROL_TOKEN_SHA256S`. Manual Vercel production deploy run
`26776054030` succeeded and updated the `musu.pro` project env; `Tests` run
`26775836294` also passed.

Live evidence changed state:

- Previous blocker:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-034756-musu.pro.evidence.json`
  returned `p2p_control_auth_not_configured`.
- Current blocker:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-041225-musu.pro.evidence.json`
  returns `relay_lease_query_failed` with detail
  `p2p_relay_lease_kv_not_configured`.

Interpretation:

- The hosted P2P auth/env problem is no longer the active blocker.
- The control plane now reaches the relay lease store and fails closed because
  production lacks `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
- Current GitHub repo secrets do not include those KV names, and repo variables
  are empty, so this requires operator/infra provisioning.

Next step:

Provision Vercel KV / Upstash Redis for `musu.pro`, set `KV_REST_API_URL` and
`KV_REST_API_TOKEN`, redeploy, then rerun
`scripts\windows\record-p2p-control-plane-evidence.ps1` without
`-AllowUnverified`. Passing evidence must show `owner_scope_verified=true` and
`relay_default_data_path=false`.
