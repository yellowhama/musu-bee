# Vercel P2P Env Sync Audit (2026-06-30)

## Verdict

The hosted `musu.pro` P2P env propagation path is now safer, but the product
remains **NO-GO** for the live P2P control-plane lane.

This change hardens the deploy path from GitHub secrets/variables into Vercel
production env. It does not provision KV/Upstash, does not set missing external
values on its own, and does not replace live `musu.pro` proof.

## System Boundary

- Source of operator values: GitHub Actions secrets/variables populated by
  `scripts/windows/configure-musu-pro-p2p-env.ps1`.
- Deploy path: `.github/workflows/deploy-musu-bee.yml`.
- Hosted runtime target: Vercel production project for `musu.pro`.
- Product surface unblocked by these values: hosted P2P route evidence,
  rendezvous, relay lease, relay payload proof, and release relay preflight
  endpoints.
- Persistent store owner: Vercel KV / Upstash Redis through server-side env.

## Change

The production P2P env sync step no longer calls `vercel env add`. It now uses
the Vercel REST API:

- `POST /v10/projects/{projectId}/env`
- `upsert=true`
- `target=["production"]`

Token-bearing or entitlement-like values are submitted as Vercel sensitive env:

- `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- `KV_REST_API_TOKEN`
- `UPSTASH_REDIS_REST_TOKEN`
- `MUSU_P2P_RELAY_ENTITLEMENT`

Non-secret routing/policy values remain plain production env:

- `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_URL`
- `MUSU_P2P_RELAY_ENABLED`
- `MUSU_P2P_RELAY_TRANSPORT_WIRED`
- `MUSU_P2P_RELAY_URL`
- `MUSU_P2P_RELAY_LEASE_MAX_RECORDS`
- `MUSU_P2P_RELAY_LEASE_TTL_SEC`

Failure logging reports only env key plus HTTP/status code. It does not dump
Vercel response bodies, because failed REST responses can include submitted env
metadata.

## Source Contract

`scripts/windows/audit-secret-storage-contract.ps1` now verifies:

- deploy workflow uses Vercel REST env upsert;
- production target is explicit;
- token/entitlement values use `type: "sensitive"`;
- workflow does not use `vercel env add`;
- workflow does not print raw Vercel response bodies.

## Verification

- `scripts/windows/audit-secret-storage-contract.ps1 -Json -FailOnProblem`:
  `ok=true`, `fail_count=0`.
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`.
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=219`, `failed_case_count=0`.
- `scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json`:
  `ok=false`, as expected; remaining blockers are release relay tunnel runtime,
  missing KV/Upstash env, and missing live hosted P2P evidence.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Live hosted P2P control-plane proof is still missing. | Local env has no KV/Upstash values, and `show-musu-pro-p2p-env-status.ps1` still reports hosted P2P as not ready. | Release storage and live owner-scoped proof remain blocked. | Provide real GitHub/Vercel env values, deploy, then record live evidence. |
| HIGH | Env propagation used a CLI path that was not directly source-contract guarded. | Prior workflow used `vercel env add`; docs already warned agents not to pipe env values into the CLI. | A future operator run could fail or drift without a source-level guard. | REST upsert is now the workflow path and is audited. |
| MED | REST sync is source-hardened but not live-tested in this commit. | No `VERCEL_TOKEN`, `KV_REST_API_URL`, or `UPSTASH_REDIS_REST_URL` values are present locally. | This commit proves the path shape, not successful production mutation. | Run the workflow on `main` after secrets/vars exist and check deploy logs. |
| INFO | Secret custody is improved. | Sensitive values are submitted as Vercel sensitive env and logs avoid body dumps. | Reduces risk of secret exposure during P2P env sync failures. | Keep `audit-secret-storage-contract.ps1` in the release verification set. |

## Next Steps

1. Use `scripts/windows/configure-musu-pro-p2p-env.ps1` with real KV/Upstash
   URL/token values and the P2P control token hash.
2. Trigger or wait for `deploy-musu-bee.yml` on `main`.
3. Inspect the GitHub Actions env sync step for key-level success lines only.
4. Run `scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json`.
5. Record live P2P control-plane evidence and rerun `write-release-go-no-go`.
