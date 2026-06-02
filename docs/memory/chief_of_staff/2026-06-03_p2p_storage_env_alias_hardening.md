# 2026-06-03 P2P Storage Env Alias Hardening

Hosted P2P storage now accepts both Vercel KV env names and Upstash Redis REST
env names.

Code changes:

- Added `musu-bee/src/lib/p2pKvEnv.ts`.
- Route evidence, rendezvous, and relay lease stores call the helper before
  using `@vercel/kv`.
- `deploy-musu-bee.yml` syncs `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`, and maps either Upstash or KV env values into
  canonical `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
- `configure-musu-pro-p2p-env.ps1` accepts `-UpstashRedisRestUrl` and
  `-UpstashRedisRestToken`.
- `show-musu-pro-p2p-env-status.ps1` accepts either KV or Upstash storage env
  name groups as satisfying the hosted storage requirement.

Validation:

- `npm run test:p2p` passed 27/27.
- `npm run build` passed.
- Sequential `npm run typecheck` passed. A prior concurrent typecheck failed
  because build was regenerating `.next/types`.
- Upstash dry-run configurator passed without printing secret values.
- Env status reports the new missing-name blockers:
  `missing_kv_rest_api_url_or_upstash_redis_rest_url` and
  `missing_kv_rest_api_token_or_upstash_redis_rest_token`.

Release status: live `musu.pro` P2P control-plane remains No-Go until actual
storage credentials are provisioned and fresh owner-scoped evidence passes.
