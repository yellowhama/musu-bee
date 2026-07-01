# Public Metadata Cloudflare DNS Apply Tool (2026-07-01)

## Scope

This records the tooling added for the current `https://musu.pro` public
metadata DNS/TLS blocker.

The blocker is not closed yet because no Cloudflare API token is available in
this shell, and the live apex DNS/TLS verifier still fails.

## Problem

The existing planner
`scripts\windows\plan-musu-pro-public-metadata-dns-repair.ps1` correctly
diagnoses the live blocker and intentionally never mutates external provider
state.

Current live state still requires Cloudflare/registrar-side action:

- current nameservers are Cloudflare, not Vercel authoritative nameservers
- apex A records are Cloudflare addresses, not Vercel `76.76.21.21`
- apex AAAA records are present and conflict with the Vercel external DNS path
- `www.musu.pro` does not expose the required Vercel CNAME path
- apex TLS and direct Vercel edge SNI TLS still fail

## Implementation

Added:

- `scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1`

Behavior:

- Default mode is dry-run and never mutates DNS.
- `-ConfirmApply` is required before any Cloudflare DNS mutation is attempted.
- Missing `CLOUDFLARE_API_TOKEN` fails closed with
  `failure_kind=cloudflare_token_missing`.
- The script touches only:
  - apex `A`
  - apex `AAAA`
  - apex `HTTPS`
  - `www` `A`
  - `www` `AAAA`
  - `www` `CNAME`
- It sets the accepted Vercel external DNS path:
  - apex `A` -> `76.76.21.21`
  - `www` `CNAME` -> `cname.vercel-dns-0.com`
  - `proxied=false`
- It does not touch MX, TXT, NS, mail, or unrelated records.
- It emits post-apply verification commands for the planner, canonical public
  metadata verifier, and release go/no-go writer.

## Verification

Dry-run / fail-closed check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1 -ConfirmApply -Json
```

Observed without a Cloudflare token:

- `ok=false`
- `apply_requested=true`
- `will_mutate_external_dns=false`
- `applied=false`
- `can_apply=false`
- `failure_kind=cloudflare_token_missing`
- `error=Set CLOUDFLARE_API_TOKEN or pass -CloudflareApiToken. No DNS mutation was attempted.`

Contract tests:

```powershell
npm run test:public-release
```

Result:

- `17/17` tests passed.
- New contract:
  `public metadata Cloudflare DNS apply tool is explicit and fail-closed`.

Other checks:

- `git diff --check` passed.
- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `3656 files` and `3947 symbols`.
- Product brain ingest under tenant/workspace `local/musu` posted `4` sources,
  `/v1/process` processed `4`, recovered `0`, and recall for
  `wiki/1212 apply-musu-pro-public-metadata-cloudflare-dns cloudflare_token_missing will_mutate_external_dns false test public release 17`
  returned `5` results with top title
  `wiki/1212 public metadata contract test delta`.

## Product Meaning

This reduces the public metadata DNS/TLS blocker from manual provider surgery
to a token-gated apply + verify flow.

It does **not** close `store-public-metadata` yet. The live blocker remains
until a valid Cloudflare API token is provided, the script is run with
`-ConfirmApply`, DNS/TLS propagation completes, and
`verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json` passes.

Search terms: `wiki/1212`,
`PUBLIC_METADATA_CLOUDFLARE_DNS_APPLY_TOOL_2026_07_01`,
`apply-musu-pro-public-metadata-cloudflare-dns.ps1`,
`musu.public_metadata_cloudflare_dns_apply.v1`,
`cloudflare_token_missing`, `76.76.21.21`,
`cname.vercel-dns-0.com`, `will_mutate_external_dns=false`,
`test:public-release 17/17`.
