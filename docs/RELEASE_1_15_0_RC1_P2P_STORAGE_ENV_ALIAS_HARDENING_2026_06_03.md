# MUSU 1.15.0-rc.1 P2P Storage Env Alias Hardening

Recorded: 2026-06-03 00:45 KST

## Scope

This change makes hosted P2P control-plane storage accept both Vercel KV env
names and the standard Upstash Redis REST env names:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The intent is narrow: make `musu.pro` easier to wire to durable storage without
changing relay policy, data-path defaults, route evidence grading, or product
tier boundaries.

## What Changed

- Added `musu-bee/src/lib/p2pKvEnv.ts`.
- Route evidence, rendezvous, and relay lease stores now treat Upstash REST env
  names as valid P2P storage credentials.
- When only Upstash env names are present, the helper maps them to
  `KV_REST_API_*` before loading `@vercel/kv`, so the existing KV client path
  still works.
- `deploy-musu-bee.yml` now syncs `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`, and can use them as fallback values for
  `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
- `configure-musu-pro-p2p-env.ps1` accepts `-UpstashRedisRestUrl` and
  `-UpstashRedisRestToken`; dry-run shows those inputs populate both the
  canonical KV settings and the Upstash aliases without printing secret values.
- `show-musu-pro-p2p-env-status.ps1` now treats either KV or Upstash storage
  env names as acceptable required hosted storage names.

## Validation

Passed:

- `npm run test:p2p` with 27/27 tests, including the new P2P KV env helper
  tests.
- `npm run build`.
- `npm run typecheck` after build completed.
- `configure-musu-pro-p2p-env.ps1 -UpstashRedisRestUrl ... -UpstashRedisRestToken ... -DryRun -Json`.
- `show-musu-pro-p2p-env-status.ps1 -Json`.

The first concurrent `npm run typecheck` attempt failed with transient TS6053
errors because it was run while `npm run build` was regenerating `.next/types`.
The sequential typecheck after build passed.

## Current Live Status

This does not close the live `musu.pro` P2P control-plane gate because no
storage credentials are currently present in GitHub/Vercel.

Current status output reports:

- `MUSU_P2P_CONTROL_TOKEN_SHA256S` is present.
- No storage URL name is present:
  `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL`.
- No storage token name is present:
  `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`.
- Latest live evidence still fails with
  `p2p_relay_lease_kv_not_configured`.

## Product Interpretation

This is control-plane hardening only.

It makes production storage provisioning less brittle, but `musu.pro` still is
not the default payload data path. Public release still requires fresh
owner-scoped P2P control-plane evidence after storage is provisioned, plus
second-PC CPU/matrix/route, support mailbox, and Store evidence.
